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
import { DB_FOLDER, readDbJson } from './db-files';
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

async function generateDotsFile(
  fileId: string,
  placeIds: string[]
): Promise<boolean> {
  const [simData, patData] = await Promise.all([
    readDbJson<Record<string, DiseaseStateTimestep>>(fileId, '.sim'),
    readDbJson<Record<string, PatternTimestep>>(fileId, '.pat')
  ]);
  return writeDotsFile(fileId, simData, patData, placeIds);
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

  let pending = inflightGeneration.get(fileId);
  if (!pending) {
    pending = generateDotsFile(fileId, placeIds).finally(() => {
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

async function loadDots(fileId: string): Promise<CachedDots | null> {
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
