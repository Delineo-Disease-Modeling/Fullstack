import { writeFile } from 'node:fs/promises';
import { streamJsonObjectEntries } from './json-stream';
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

  // Set up streams
  stageStart = nowMs();
  const simIter = streamJsonObjectEntries<DiseaseStateTimestep>(
    simdataPath,
    simdataPath.endsWith('.gz')
  );
  const patIter = streamJsonObjectEntries<PatternTimestep>(
    patternsPath,
    patternsPath.endsWith('.gz')
  );

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
  let spl = await simIter.next();
  let ppl = await patIter.next();

  while (!spl.done && !ppl.done) {
    const skey: string = spl.value.key;
    const pkey: string = ppl.value.key;

    if (skey !== pkey) {
      if (+skey < +pkey) {
        spl = await simIter.next();
        continue;
      }
      ppl = await patIter.next();
      continue;
    }

    const svalue = spl.value.value;
    const pvalue = ppl.value.value;
    const time = +skey / 60;
    matchedTimesteps++;

    // === MAP CACHE: build infected set, homes/places arrays ===
    let tStage = nowMs();
    const curinfected = new Set<string>();
    for (const people of Object.values(svalue)) {
      for (const key of Object.keys(people as Record<string, unknown>)) {
        curinfected.add(key);
      }
    }
    accum('processSimulation/build_infected_set', tStage);

    tStage = nowMs();
    const homesArray: number[] = [];
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
    const placesArray: number[] = [];
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

    spl = await simIter.next();
    ppl = await patIter.next();
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

  // Finalize map cache
  cacheParts.push(`},"hotspots":${JSON.stringify(hotspots)}`);
  stageStart = nowMs();
  await writeFile(mapCachePath, cacheParts.join(''));
  logPerfTiming('processSimulation map cache write', stageStart);
  logPerfTiming('processSimulation total', totalStart);

  return globalStats;
}
