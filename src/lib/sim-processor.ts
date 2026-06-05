import { readFile, rename, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { getCachedPapdata } from './papdata-cache';
import {
  AGE_RANGE_LABELS,
  ALL_STATE_NAMES,
  BITMASK_STATES,
  buildAgeIndex,
  type ChartData,
  type DataPoint,
  type DiseaseStateTimestep,
  type PatternTimestep
} from './simulation-data';

const PERF_TIMINGS = /^(1|true|yes|on)$/i.test(
  process.env.DELINEO_PERF_TIMINGS ?? ''
);

function nowMs() {
  return Number(process.hrtime.bigint()) / 1_000_000;
}

function logPerfTiming(label: string, startedAt: number) {
  if (PERF_TIMINGS) {
    console.info(`[perf] ${label}: ${((nowMs() - startedAt) / 1000).toFixed(3)}s`);
  }
}

interface ProcessOpts {
  simDataId: number;
  simdataPath: string;
  patternsPath: string;
  papdataId: string;
  mapCachePath: string;
  totalLength: number;
  metadata?: unknown;
}

/** In-memory progress tracker for active processing jobs (simDataId -> 0-100). */
export const processingProgress = new Map<number, number>();

/**
 * Single-pass processor that streams simdata + patterns files once and produces:
 * 1. Map cache JSON file (for GET /api/simdata/[id])
 * 2. Global stats (for chartdata endpoint)
 *
 * Returns the global stats object to be stored in SimData.global_stats.
 */
export async function processSimulation(opts: ProcessOpts): Promise<ChartData> {
  const totalStart = nowMs();
  const {
    simDataId,
    simdataPath,
    patternsPath,
    papdataId,
    mapCachePath,
    totalLength
  } = opts;
  processingProgress.set(simDataId, 0);

  // Load papdata from shared cache (avoids redundant gunzip)
  let stageStart = nowMs();
  const papdata = await getCachedPapdata(papdataId);
  logPerfTiming('processSimulation papdata load', stageStart);

  stageStart = nowMs();
  const homeIds = Object.keys(papdata.homes).sort(
    (a, b) => Number(a) - Number(b)
  );
  const placeIds = Object.keys(papdata.places).sort(
    (a, b) => Number(a) - Number(b)
  );

  // Pre-process papdata into compact format for map cache.
  // Coerce lat/lon to number (or null) here: upstream popgen can emit strings
  // when pandas infers the CSV column as object dtype, and the frontend map
  // uses Number.isFinite which is strict and would skip every POI.
  const toCoord = (v: unknown): number | null => {
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const papDataArrays = {
    homes: homeIds.map((id) => ({
      id,
      cbg: papdata.homes[id].cbg,
      members: papdata.homes[id].members,
      latitude: toCoord(papdata.homes[id].latitude),
      longitude: toCoord(papdata.homes[id].longitude)
    })),
    places: placeIds.map((id) => ({
      id,
      placekey: papdata.places[id].placekey,
      latitude: toCoord(papdata.places[id].latitude),
      longitude: toCoord(papdata.places[id].longitude),
      label: papdata.places[id].label,
      top_category: papdata.places[id].top_category,
      footprint: papdata.places[id].footprint ?? null
    }))
  };

  // Population count and age index for global stats
  const popCount = Object.keys(papdata.people ?? {}).length;
  const ageIndex = buildAgeIndex(papdata.people);
  logPerfTiming('processSimulation papdata prep', stageStart);

  // Load both files into memory and JSON.parse in parallel. The previous
  // implementation used stream-json's incremental parser; for 75-200MB
  // gunzipped payloads its per-token async overhead dominated (~20s of
  // ~22s total). Parallel readFile + gunzipSync + JSON.parse is 4-5x
  // faster on the same files and peaks ~250-400MB extra heap, which is
  // well within the existing simulator working set.
  const stageLoad = nowMs();
  const [simData, patData] = await Promise.all([
    readFile(simdataPath).then((buf) => {
      const raw = simdataPath.endsWith('.gz') ? gunzipSync(buf) : buf;
      return JSON.parse(raw.toString('utf8')) as Record<
        string,
        DiseaseStateTimestep
      >;
    }),
    readFile(patternsPath).then((buf) => {
      const raw = patternsPath.endsWith('.gz') ? gunzipSync(buf) : buf;
      return JSON.parse(raw.toString('utf8')) as Record<
        string,
        PatternTimestep
      >;
    })
  ]);
  logPerfTiming('processSimulation load_parse', stageLoad);

  // Accumulate map cache parts
  const cacheParts: string[] = [
    `,"papdata":${JSON.stringify(papDataArrays)}`,
    ',"simdata":{'
  ];

  // Global stats accumulators
  const globalStats: ChartData = {
    iot: [],
    ages: [],
    sexes: [],
    states: []
  };
  if (opts.metadata !== undefined) {
    globalStats.metadata = opts.metadata;
  }

  // Hotspot tracking
  const hotspots: Record<string, number[]> = {};
  const prevInfected: Record<string, number> = {};

  // Per-category accumulators for the stream loop (only populated when
  // DELINEO_PERF_TIMINGS is set).
  const perfAccum: Record<string, number> = {};
  function accum(label: string, started: number) {
    if (PERF_TIMINGS) {
      perfAccum[label] = (perfAccum[label] || 0) + (nowMs() - started);
    }
  }

  let first = true;
  let matchedTimesteps = 0;
  stageStart = nowMs();

  // Iterate simdata timesteps in their natural (insertion) order, looking up
  // the matching patterns entry. Iteration order is the order JSON.parse
  // produced from the on-disk file, which matches the order the simulator
  // wrote them (sequential timesteps). Timesteps present in only one of the
  // two files are silently skipped (same behavior as the old stream walker,
  // which advanced the lagging iterator past mismatched keys).
  for (const [skey, svalue] of Object.entries(simData)) {
    const pvalue = patData[skey];
    if (!pvalue) continue;
    const time = +skey / 60;
    matchedTimesteps++;

    // === MAP CACHE: per-location [count, infected] arrays ===
    // The SoA engine emits these directly as { h: [...], p: [...] } (numeric
    // format), already aligned to homeIds/placeIds order — use them as-is.
    // Older runs emit { homes/places: {id: [pids]} }, computed here.
    let tStage = nowMs();
    let homesArray: number[];
    let placesArray: number[];
    const numericPattern = Array.isArray(
      (pvalue as unknown as { h?: unknown }).h
    );

    if (numericPattern) {
      const np = pvalue as unknown as { h: number[]; p: number[] };
      homesArray = np.h;
      placesArray = np.p;
      // Hotspot tracking from the numeric places array (inf at index 2*i+1).
      for (let i = 0; i < placeIds.length; i++) {
        const id = placeIds[i];
        const inf = placesArray[i * 2 + 1] || 0;
        const prevInf = prevInfected[id] || 0;
        if (inf > 0 && prevInf > 0 && inf >= prevInf * 5) {
          if (!hotspots[id]) hotspots[id] = [];
          hotspots[id].push(Number(skey));
        }
        prevInfected[id] = inf;
      }
      accum('processSimulation/numeric_passthrough', tStage);
    } else {
      const curinfected = new Set<string>();
      for (const people of Object.values(svalue)) {
        for (const key of Object.keys(people as Record<string, unknown>)) {
          curinfected.add(key);
        }
      }
      accum('processSimulation/build_infected_set', tStage);

      tStage = nowMs();
      homesArray = [];
      for (const id of homeIds) {
        const pop: string[] | undefined = pvalue.homes?.[id];
        if (pop) {
          let inf = 0;
          for (const v of pop) {
            if (curinfected.has(v)) inf++;
          }
          homesArray.push(pop.length, inf);
        } else {
          homesArray.push(0, 0);
        }
      }
      accum('processSimulation/build_homes_array', tStage);

      tStage = nowMs();
      placesArray = [];
      for (const id of placeIds) {
        const pop: string[] | undefined = pvalue.places?.[id];
        if (pop) {
          let inf = 0;
          for (const v of pop) {
            if (curinfected.has(v)) inf++;
          }
          placesArray.push(pop.length, inf);
          const prevInf = prevInfected[id] || 0;
          if (inf > 0 && prevInf > 0 && inf >= prevInf * 5) {
            if (!hotspots[id]) hotspots[id] = [];
            hotspots[id].push(Number(skey));
          }
          prevInfected[id] = inf;
        } else {
          placesArray.push(0, 0);
          prevInfected[id] = 0;
        }
      }
      accum('processSimulation/build_places_array', tStage);
    }

    tStage = nowMs();
    if (!first) cacheParts.push(',');
    first = false;
    cacheParts.push(
      `"${skey}":${JSON.stringify({ h: homesArray, p: placesArray })}`
    );
    accum('processSimulation/cache_parts_push', tStage);

    // === GLOBAL STATS: per-timestep aggregation ===
    tStage = nowMs();
    const iot_data: DataPoint = { time };
    const ages_data: DataPoint = { time };
    const sexes_data: DataPoint = { time, Male: 0, Female: 0 };
    const states_data: DataPoint = { time };
    for (const label of AGE_RANGE_LABELS) ages_data[label] = 0;
    for (const name of ALL_STATE_NAMES) states_data[name] = 0;

    let totalInfected = 0;

    for (const [disease, people] of Object.entries(svalue) as [
      string,
      Record<string, number>
    ][]) {
      const entries = Object.entries(people);
      iot_data[disease] = entries.length;
      totalInfected += entries.length;

      for (const [id, stateBitmask] of entries) {
        for (const [stateName, bit] of BITMASK_STATES) {
          if (stateBitmask & bit) states_data[stateName]++;
        }

        const person = papdata.people?.[id];
        if (person) {
          sexes_data[person.sex === 0 ? 'Male' : 'Female']++;
          const ageIdx = ageIndex.get(id);
          if (ageIdx !== undefined) ages_data[AGE_RANGE_LABELS[ageIdx]]++;
        }
      }
    }

    states_data.Susceptible = Math.max(0, popCount - totalInfected);

    globalStats.iot.push(iot_data);
    globalStats.ages.push(ages_data);
    globalStats.sexes.push(sexes_data);
    globalStats.states.push(states_data);
    accum('processSimulation/global_stats_aggregation', tStage);

    if (totalLength > 0) {
      processingProgress.set(
        simDataId,
        Math.min(99, Math.round((+skey / totalLength) * 100))
      );
    }
  }
  logPerfTiming(
    `processSimulation stream processing (${matchedTimesteps} timesteps)`,
    stageStart
  );
  if (PERF_TIMINGS) {
    for (const label of Object.keys(perfAccum).sort()) {
      console.info(`[perf] ${label}: ${(perfAccum[label] / 1000).toFixed(3)}s`);
    }
  }

  processingProgress.delete(simDataId);

  // Finalize map cache.
  //
  // Write atomically (temp file + rename) rather than in place. GET
  // /api/simdata/[id] returns 200 the moment this file exists, so an in-place
  // writeFile lets the results page read a half-written file and fail
  // JSON.parse — surfacing as "Failed to load run from URL". The bug is
  // timing-dependent: it hits when the write window is wide (slow/contended
  // disk, large payloads), e.g. long runs on the shared prod host, and is rare
  // on a fast local SSD. rename() is atomic on the same filesystem, so a
  // concurrent reader sees either no file (-> 202, keep polling) or the
  // complete file — never a partial one.
  cacheParts.push(`},"hotspots":${JSON.stringify(hotspots)}`);
  stageStart = nowMs();
  const tmpMapCachePath = `${mapCachePath}.tmp`;
  await writeFile(tmpMapCachePath, cacheParts.join(''));
  await rename(tmpMapCachePath, mapCachePath);
  logPerfTiming('processSimulation map cache write', stageStart);
  logPerfTiming('processSimulation total', totalStart);

  return globalStats;
}
