// Pre-baked per-timestep "dot" frames for the Cases map.
//
// The /people-map route used to stream + gunzip + JSON-parse the whole (often
// 70MB+) .pat file from the start on every request to find one timestep — ~3s
// per frame, which made Cases playback crawl. Instead we bake a compact
// per-place [population, infected, recovered] frame for every timestep ONCE
// (lazily on first request, and at sim-processing time for new runs) into
// `{fileId}.dots.json`, then synthesize the sampled-dot payload from those
// counts. Frames are tiny (~a few MB total) so the whole file is parsed into a
// small LRU cache and served by key lookup — no per-request file streaming.
//
// Dots are a sampled, non-interactive visualization (the person dots aren't
// clickable; person-path uses its own id input), so synthesizing dots from
// counts is visually identical to the old real-person sampling.

import { access, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { DB_FOLDER, readDbJson, resolveDbDataPath } from './db-files';
import { streamJsonObjectEntries } from './json-stream';
import {
  getPatternMeta,
  isNumericTimestep,
  type PatternMeta,
  placesFromNumeric
} from './numeric-movement';
import type {
  DiseaseStateTimestep,
  PatternTimestep
} from './simulation-data';

const ACTIVE_INFECTION_MASK = 1 | 2 | 4 | 8;
const RECOVERED_MASK = 16;
const MAX_PEOPLE_DOTS = 12_000;
const DOTS_FILE_VERSION = 1;
const DOTS_CACHE_LIMIT = 4;

export type PeopleMapPerson = {
  id: string;
  infected: boolean;
  newly_infected: boolean;
  recovered: boolean;
};

export type PeopleMapLocation = {
  type: 'places';
  id: string;
  people: PeopleMapPerson[];
};

export type PeopleMapPayload = {
  time: number;
  requested_time: number;
  total_people: number;
  returned_people: number;
  sample_rate: number;
  source: 'person' | 'aggregate';
  locations: PeopleMapLocation[];
};

// On-disk shape of `{fileId}.dots.json`. `frames[minutes]` holds a flat
// [pop, infected, recovered, pop, infected, recovered, ...] array aligned to
// `place_ids` order.
type DotsFile = {
  version: number;
  place_ids: string[];
  frames: Record<string, number[]>;
};

type CachedDots = {
  placeIds: string[];
  frames: Record<string, number[]>;
  sortedTimes: number[];
  mtimeMs: number;
  size: number;
  lastAccess: number;
};

const dotsCache = new Map<string, CachedDots>();
const inflightGeneration = new Map<string, Promise<boolean>>();
// fileIds whose patterns carry no per-person data (counts-only) and so can't be
// baked — remembered so we don't re-parse the whole file every request.
const unbakeableFileIds = new Set<string>();

// Remember a *hard* bake failure (a thrown error, e.g. OOM or a full/read-only
// disk) so we don't re-attempt the expensive bake on every frame + prefetch.
// Distinct from unbakeableFileIds (a permanent counts-only verdict): this is a
// short-TTL backoff that retries periodically in case the cause was transient.
const BAKE_FAILURE_TTL_MS = 60_000;
type BakeFailure = { code: string; message: string; at: number };
const bakeFailures = new Map<string, BakeFailure>();

/** The last unresolved bake failure for a run (cleared once a bake succeeds). */
export function getRecentBakeFailure(
  fileId: string
): { code: string; message: string } | null {
  const failure = bakeFailures.get(fileId);
  return failure ? { code: failure.code, message: failure.message } : null;
}

/** True once a run has been determined to have no per-person data to bake. */
export function isFileUnbakeable(fileId: string): boolean {
  return unbakeableFileIds.has(fileId);
}

function dotsPath(fileId: string) {
  return `${DB_FOLDER}${fileId}.dots.json`;
}

function buildMaskedSet(
  timestep: DiseaseStateTimestep | null | undefined,
  mask: number
) {
  const set = new Set<string>();
  if (!timestep) return set;
  for (const people of Object.values(timestep)) {
    for (const [personId, stateBitmask] of Object.entries(people)) {
      if ((Number(stateBitmask) & mask) !== 0) {
        set.add(personId);
      }
    }
  }
  return set;
}

/** Per-person reconstruction of `{ placeId: [pids] }` for one pattern timestep. */
function getPlaces(
  patternValue: PatternTimestep,
  meta: PatternMeta | null
): Record<string, string[]> {
  const places = patternValue.places ?? {};
  if (Object.keys(places).length > 0) {
    return places;
  }
  if (isNumericTimestep(patternValue) && meta) {
    return placesFromNumeric(patternValue.loc, meta);
  }
  return {};
}

/**
 * Fill `out` (length placeIds.length * 3) with [pop, infected, recovered] per
 * place for one timestep, using the same disease-state masks the live route
 * uses (recovered takes precedence over active infection).
 */
function fillPlaceCounts(
  out: number[],
  simValue: DiseaseStateTimestep,
  patternValue: PatternTimestep,
  meta: PatternMeta | null,
  placeIndex: Map<string, number>
) {
  // Fast path: the SoA engine emits per-place [infected, recovered] dot counts
  // (`pdots`) alongside the per-place [count, ...] (`p`) array, so read them
  // directly instead of reconstructing per person from `loc` + the sim
  // snapshot. Byte-identical to the per-person bake (the engine computes the
  // same recovered-precedence counts). `pdots`/`p` are places-ordered
  // (loc_ids[n_homes:]).
  const numeric = patternValue as unknown as { p?: number[]; pdots?: number[] };
  if (meta && Array.isArray(numeric.pdots) && Array.isArray(numeric.p)) {
    const { loc_ids, n_homes } = meta;
    const p = numeric.p;
    const pdots = numeric.pdots;
    const nPlaces = loc_ids.length - n_homes;
    for (let j = 0; j < nPlaces; j += 1) {
      const idx = placeIndex.get(loc_ids[n_homes + j]);
      if (idx === undefined) continue;
      const base = idx * 3;
      out[base] = p[j * 2] || 0;
      out[base + 1] = pdots[j * 2] || 0;
      out[base + 2] = pdots[j * 2 + 1] || 0;
    }
    return;
  }

  const infected = buildMaskedSet(simValue, ACTIVE_INFECTION_MASK);
  const recovered = buildMaskedSet(simValue, RECOVERED_MASK);
  const places = getPlaces(patternValue, meta);

  for (const [placeId, pids] of Object.entries(places)) {
    const idx = placeIndex.get(placeId);
    if (idx === undefined || !Array.isArray(pids)) {
      continue;
    }
    let pop = 0;
    let inf = 0;
    let rec = 0;
    for (const rawPersonId of pids) {
      const personId = String(rawPersonId);
      pop += 1;
      if (recovered.has(personId)) {
        rec += 1;
      } else if (infected.has(personId)) {
        inf += 1;
      }
    }
    const base = idx * 3;
    out[base] = pop;
    out[base + 1] = inf;
    out[base + 2] = rec;
  }
}

function patternsHavePerPersonData(
  patData: Record<string, PatternTimestep>
): boolean {
  let checked = 0;
  for (const [key, value] of Object.entries(patData)) {
    if (key === 'meta' || !Number.isFinite(Number(key))) continue;
    if (
      isNumericTimestep(value) ||
      Object.keys(value?.places ?? {}).length > 0
    ) {
      return true;
    }
    if (++checked >= 8) break;
  }
  return false;
}

/**
 * Compute every timestep's compact dot frame from already-parsed sim + pattern
 * data and write `{fileId}.dots.json` atomically. Returns false (without
 * writing) when the run is counts-only and can't be baked.
 */
export async function writeDotsFile(
  fileId: string,
  simData: Record<string, DiseaseStateTimestep>,
  patData: Record<string, PatternTimestep>,
  placeIds: string[]
): Promise<boolean> {
  if (!patternsHavePerPersonData(patData)) {
    unbakeableFileIds.add(fileId);
    return false;
  }

  const meta = getPatternMeta(patData as Record<string, unknown>);
  const placeIndex = new Map(placeIds.map((id, index) => [id, index]));
  const frames: Record<string, number[]> = {};

  for (const [skey, svalue] of Object.entries(simData)) {
    const pvalue = patData[skey];
    if (!pvalue || !Number.isFinite(Number(skey))) {
      continue;
    }
    const frame = new Array<number>(placeIds.length * 3).fill(0);
    fillPlaceCounts(frame, svalue, pvalue, meta, placeIndex);
    frames[skey] = frame;
  }

  return persistDotsFile(fileId, placeIds, frames);
}

/** Atomically write the computed frames to `{fileId}.dots.json` (tmp + rename). */
async function persistDotsFile(
  fileId: string,
  placeIds: string[],
  frames: Record<string, number[]>
): Promise<boolean> {
  const payload: DotsFile = {
    version: DOTS_FILE_VERSION,
    place_ids: placeIds,
    frames
  };

  const targetPath = dotsPath(fileId);
  const tmpPath = `${targetPath}.tmp`;
  await writeFile(tmpPath, JSON.stringify(payload));
  await rename(tmpPath, targetPath);
  dotsCache.delete(targetPath);
  return true;
}

/**
 * Build `{fileId}.dots.json` for a run that has no pre-baked file yet.
 *
 * The .pat is often >200MB decompressed; loading it whole (readDbJson) spikes
 * the heap and OOMs on memory-limited hosts. So for the common legacy
 * per-person format (`{homes,places:{id:[pids]}}`) we STREAM the .pat one
 * timestep at a time (the .sim is comparatively tiny and loaded whole). The
 * engine `{loc:[...]}` format needs `meta` (which can sit anywhere in the file)
 * and is rare in this lazy path — new runs are baked at processing time — so it
 * keeps the proven full-load path.
 */
async function generateDotsFile(
  fileId: string,
  placeIds: string[]
): Promise<boolean> {
  const { path: patPath, gzipped: patGzipped } = await resolveDbDataPath(
    fileId,
    '.pat'
  );

  // Probe the first real timestep to pick a strategy without loading the .pat.
  let firstTimestep: PatternTimestep | null = null;
  const probe = streamJsonObjectEntries<PatternTimestep>(patPath, patGzipped);
  try {
    let entry = await probe.next();
    while (!entry.done && entry.value.key === 'meta') {
      entry = await probe.next();
    }
    if (!entry.done) {
      firstTimestep = entry.value.value;
    }
  } finally {
    await probe.return?.(undefined);
  }

  if (!firstTimestep) {
    unbakeableFileIds.add(fileId);
    return false;
  }

  // Engine/numeric format → full-load (needs meta).
  if (isNumericTimestep(firstTimestep)) {
    const [simData, patData] = await Promise.all([
      readDbJson<Record<string, DiseaseStateTimestep>>(fileId, '.sim'),
      readDbJson<Record<string, PatternTimestep>>(fileId, '.pat')
    ]);
    return writeDotsFile(fileId, simData, patData, placeIds);
  }

  // No inline per-person places (e.g. counts-only `{h,p}`) → can't bake dots.
  if (typeof firstTimestep.places !== 'object' || firstTimestep.places === null) {
    unbakeableFileIds.add(fileId);
    return false;
  }

  // Legacy per-person: stream the big .pat, hold only the small .sim in memory.
  const simData = await readDbJson<Record<string, DiseaseStateTimestep>>(
    fileId,
    '.sim'
  );
  const placeIndex = new Map(placeIds.map((id, index) => [id, index]));
  const frames: Record<string, number[]> = {};
  let sawPerPerson = false;

  const patIter = streamJsonObjectEntries<PatternTimestep>(patPath, patGzipped);
  for await (const { key, value } of patIter) {
    if (key === 'meta' || !Number.isFinite(Number(key))) {
      continue;
    }
    const simValue = simData[key];
    if (!simValue) {
      continue;
    }
    if (!sawPerPerson && Object.keys(value?.places ?? {}).length > 0) {
      sawPerPerson = true;
    }
    const frame = new Array<number>(placeIds.length * 3).fill(0);
    fillPlaceCounts(frame, simValue, value, null, placeIndex);
    frames[key] = frame;
  }

  if (!sawPerPerson) {
    unbakeableFileIds.add(fileId);
    return false;
  }

  return persistDotsFile(fileId, placeIds, frames);
}

/**
 * Ensure `{fileId}.dots.json` exists, generating it once (deduped) from the
 * source files if needed. Returns false when the run can't be baked (the route
 * then falls back to the live computation).
 */
export async function ensureDotsFile(
  fileId: string,
  placeIds: string[]
): Promise<boolean> {
  if (unbakeableFileIds.has(fileId)) {
    return false;
  }
  try {
    await access(dotsPath(fileId));
    return true;
  } catch {
    // not generated yet
  }

  // Don't re-attempt a recently-failed bake on every frame (and every one of
  // the concurrent prefetches) — that turns a hard failure (OOM, full/read-only
  // disk) into a retry storm that dogpiles the server. Degrade to the live
  // fallback and retry at most once per TTL in case the cause was transient.
  const failure = bakeFailures.get(fileId);
  if (failure && Date.now() - failure.at < BAKE_FAILURE_TTL_MS) {
    return false;
  }

  let pending = inflightGeneration.get(fileId);
  if (!pending) {
    pending = generateDotsFile(fileId, placeIds)
      .then((ok) => {
        bakeFailures.delete(fileId);
        return ok;
      })
      .catch((error: unknown) => {
        const err = error as NodeJS.ErrnoException;
        bakeFailures.set(fileId, {
          code: err?.code ?? (error as Error)?.name ?? 'BakeError',
          message: String(err?.message ?? error).slice(0, 180),
          at: Date.now()
        });
        throw error;
      })
      .finally(() => {
        inflightGeneration.delete(fileId);
      });
    inflightGeneration.set(fileId, pending);
  }
  return pending;
}

function cacheDots(filePath: string, entry: CachedDots) {
  dotsCache.set(filePath, entry);
  if (dotsCache.size <= DOTS_CACHE_LIMIT) {
    return;
  }
  let oldestKey = '';
  let oldestAccess = Infinity;
  for (const [key, value] of dotsCache) {
    if (value.lastAccess < oldestAccess) {
      oldestKey = key;
      oldestAccess = value.lastAccess;
    }
  }
  if (oldestKey) {
    dotsCache.delete(oldestKey);
  }
}

export async function loadDots(fileId: string): Promise<CachedDots | null> {
  const filePath = dotsPath(fileId);
  let fileStat: Awaited<ReturnType<typeof stat>>;
  try {
    fileStat = await stat(filePath);
  } catch {
    return null;
  }

  const cached = dotsCache.get(filePath);
  if (
    cached &&
    cached.mtimeMs === fileStat.mtimeMs &&
    cached.size === fileStat.size
  ) {
    cached.lastAccess = Date.now();
    return cached;
  }

  const parsed = JSON.parse(await readFile(filePath, 'utf8')) as DotsFile;
  if (parsed.version !== DOTS_FILE_VERSION || !parsed.frames) {
    return null;
  }
  const sortedTimes = Object.keys(parsed.frames)
    .map(Number)
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);

  const entry: CachedDots = {
    placeIds: parsed.place_ids ?? [],
    frames: parsed.frames,
    sortedTimes,
    mtimeMs: fileStat.mtimeMs,
    size: fileStat.size,
    lastAccess: Date.now()
  };
  cacheDots(filePath, entry);
  return entry;
}

function findNearestTime(sortedTimes: number[], requestedTime: number) {
  if (sortedTimes.length === 0) return null;
  let nearest = sortedTimes[0];
  for (const time of sortedTimes) {
    if (Math.abs(time - requestedTime) < Math.abs(nearest - requestedTime)) {
      nearest = time;
    }
    if (time > requestedTime) break;
  }
  return nearest;
}

/** Build the sampled dot payload from a place-count frame (synthetic people). */
function synthesizePayload(
  placeIds: string[],
  frame: number[],
  time: number,
  requestedTime: number
): PeopleMapPayload {
  let totalPeople = 0;
  for (let index = 0; index < placeIds.length; index += 1) {
    totalPeople += frame[index * 3] || 0;
  }
  const sampleRate = Math.max(1, Math.ceil(totalPeople / MAX_PEOPLE_DOTS));

  let returnedPeople = 0;
  const locations: PeopleMapLocation[] = [];

  for (let index = 0; index < placeIds.length; index += 1) {
    const base = index * 3;
    const population = frame[base] || 0;
    if (population === 0) {
      continue;
    }
    const infected = Math.min(population, frame[base + 1] || 0);
    const recovered = Math.min(population - infected, frame[base + 2] || 0);
    const uninfected = Math.max(0, population - infected - recovered);
    const placeId = placeIds[index];

    // Match the live route's semantics: every infected/recovered person is
    // shown; only susceptibles are downsampled.
    const uninfectedSamples =
      uninfected > 0 ? Math.max(1, Math.ceil(uninfected / sampleRate)) : 0;
    const people: PeopleMapPerson[] = [];
    for (let k = 0; k < infected; k += 1) {
      people.push({
        id: `i:${placeId}:${k}`,
        infected: true,
        newly_infected: false,
        recovered: false
      });
    }
    for (let k = 0; k < recovered; k += 1) {
      people.push({
        id: `r:${placeId}:${k}`,
        infected: false,
        newly_infected: false,
        recovered: true
      });
    }
    for (let k = 0; k < uninfectedSamples; k += 1) {
      people.push({
        id: `u:${placeId}:${k}`,
        infected: false,
        newly_infected: false,
        recovered: false
      });
    }

    if (people.length > 0) {
      returnedPeople += people.length;
      locations.push({ type: 'places', id: placeId, people });
    }
  }

  return {
    time,
    requested_time: requestedTime,
    total_people: totalPeople,
    returned_people: returnedPeople,
    sample_rate: sampleRate,
    source: 'person',
    locations
  };
}

/**
 * Serve a pre-baked people-map frame for `requestedTime`, or null if the baked
 * file is unavailable (caller falls back to the live computation).
 */
export async function readDotsPayload(
  fileId: string,
  requestedTime: number
): Promise<PeopleMapPayload | null> {
  const dots = await loadDots(fileId);
  if (!dots) {
    return null;
  }
  const nearest = findNearestTime(dots.sortedTimes, requestedTime);
  if (nearest === null) {
    return null;
  }
  const frame = dots.frames[String(nearest)];
  if (!frame) {
    return null;
  }
  return synthesizePayload(dots.placeIds, frame, nearest, requestedTime);
}
