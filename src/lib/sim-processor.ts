import { createReadStream } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { createGunzip } from 'node:zlib';
import chain from 'stream-chain';
import parser from 'stream-json';
import StreamObject from 'stream-json/streamers/StreamObject.js';
import { getCachedPapdata } from './papdata-cache';

const age_ranges: [number, number][] = [
  [0, 20],
  [21, 40],
  [41, 60],
  [61, 80],
  [81, 99]
];

const age_range_labels = age_ranges.map(([lo, hi]) => `${lo}-${hi}`);

const bitmask_states: [string, number][] = [
  ['Infected', 1],
  ['Infectious', 2],
  ['Symptomatic', 4],
  ['Hospitalized', 8],
  ['Recovered', 16],
  ['Removed', 32]
];

const all_state_names = ['Susceptible', ...bitmask_states.map(([n]) => n)];

type DataPoint = { time: number; [key: string]: number };
type ChartData = { [type: string]: DataPoint[] };

interface ProcessOpts {
  simDataId: number;
  simdataPath: string;
  patternsPath: string;
  papdataId: string;
  mapCachePath: string;
  totalLength: number;
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
  const { simDataId, simdataPath, patternsPath, papdataId, mapCachePath, totalLength } = opts;
  processingProgress.set(simDataId, 0);

  // Load papdata from shared cache (avoids redundant gunzip)
  const papdata = await getCachedPapdata(papdataId);

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
    homes: homeIds.map((id) => ({ id })),
    places: placeIds.map((id) => ({
      id,
      latitude: toCoord(papdata.places[id].latitude),
      longitude: toCoord(papdata.places[id].longitude),
      label: papdata.places[id].label,
      top_category: papdata.places[id].top_category
    }))
  };

  // Population count and age index for global stats
  const popCount = Object.keys(papdata.people ?? {}).length;
  const ageIndex = new Map<string, number>();
  for (const [id, person] of Object.entries(papdata.people ?? {}) as [
    string,
    any
  ][]) {
    for (let i = 0; i < age_ranges.length; i++) {
      if (person.age >= age_ranges[i][0] && person.age <= age_ranges[i][1]) {
        ageIndex.set(id, i);
        break;
      }
    }
  }

  // Set up streams
  const simChain: any[] = [createReadStream(simdataPath)];
  if (simdataPath.endsWith('.gz')) simChain.push(createGunzip());
  simChain.push(parser(), StreamObject.streamObject());
  const simIter = chain(simChain)[Symbol.asyncIterator]();

  const patChain: any[] = [createReadStream(patternsPath)];
  if (patternsPath.endsWith('.gz')) patChain.push(createGunzip());
  patChain.push(parser(), StreamObject.streamObject());
  const patIter = chain(patChain)[Symbol.asyncIterator]();

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

  // Hotspot tracking
  const hotspots: Record<string, number[]> = {};
  const prevInfected: Record<string, number> = {};

  let first = true;
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

    // === MAP CACHE: build infected set, homes/places arrays ===
    const curinfected = new Set<string>();
    for (const people of Object.values(svalue)) {
      for (const key of Object.keys(people as Record<string, unknown>)) {
        curinfected.add(key);
      }
    }

    const homesArray: number[] = [];
    for (const id of homeIds) {
      const pop: string[] | undefined = pvalue.homes[id];
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

    const placesArray: number[] = [];
    for (const id of placeIds) {
      const pop: string[] | undefined = pvalue.places[id];
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

    if (!first) cacheParts.push(',');
    first = false;
    cacheParts.push(
      `"${skey}":${JSON.stringify({ h: homesArray, p: placesArray })}`
    );

    // === GLOBAL STATS: per-timestep aggregation ===
    const iot_data: DataPoint = { time };
    const ages_data: DataPoint = { time };
    const sexes_data: DataPoint = { time, Male: 0, Female: 0 };
    const states_data: DataPoint = { time };
    for (const label of age_range_labels) ages_data[label] = 0;
    for (const name of all_state_names) states_data[name] = 0;

    let totalInfected = 0;

    for (const [disease, people] of Object.entries(svalue) as [
      string,
      Record<string, number>
    ][]) {
      const entries = Object.entries(people);
      iot_data[disease] = entries.length;
      totalInfected += entries.length;

      for (const [id, stateBitmask] of entries) {
        for (const [stateName, bit] of bitmask_states) {
          if (stateBitmask & bit) states_data[stateName]++;
        }

        const person = papdata.people[id];
        if (person) {
          sexes_data[person.sex === 0 ? 'Male' : 'Female']++;
          const ageIdx = ageIndex.get(id);
          if (ageIdx !== undefined) ages_data[age_range_labels[ageIdx]]++;
        }
      }
    }

    states_data.Susceptible = Math.max(0, popCount - totalInfected);

    globalStats.iot.push(iot_data);
    globalStats.ages.push(ages_data);
    globalStats.sexes.push(sexes_data);
    globalStats.states.push(states_data);

    if (totalLength > 0) {
      processingProgress.set(simDataId, Math.min(99, Math.round((+skey / totalLength) * 100)));
    }

    spl = await simIter.next();
    ppl = await patIter.next();
  }

  processingProgress.delete(simDataId);

  // Finalize map cache
  cacheParts.push(`},"hotspots":${JSON.stringify(hotspots)}`);
  await writeFile(mapCachePath, cacheParts.join(''));

  return globalStats;
}
