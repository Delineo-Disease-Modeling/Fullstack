import { createReadStream } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { createGunzip } from 'node:zlib';
import chain from 'stream-chain';
import parser from 'stream-json';
import StreamObject from 'stream-json/streamers/StreamObject.js';
import {
  SIM_CHART_SCHEMA_VERSION,
  addCombinedStateBit,
  createExclusiveStatePoint,
  populateExclusiveStateCounts
} from './disease-states';
import { getCachedPapdata } from './papdata-cache';

const age_ranges: [number, number][] = [
  [0, 20],
  [21, 40],
  [41, 60],
  [61, 80],
  [81, 99]
];

const age_range_labels = age_ranges.map(([lo, hi]) => `${lo}-${hi}`);

type DataPoint = { time: number; [key: string]: number };
type PoiPoint = {
  id: string;
  name: string;
  infections: number;
  category: string | null;
};
type PapPerson = {
  age: number;
  sex: number;
};
type PapHome = {
  cbg: string;
  members: string[];
  latitude?: unknown;
  longitude?: unknown;
};
type PapPlace = {
  placekey?: string;
  latitude?: unknown;
  longitude?: unknown;
  label?: string;
  top_category?: string;
  footprint?: unknown;
};
type PapData = {
  people?: Record<string, PapPerson>;
  homes: Record<string, PapHome>;
  places: Record<string, PapPlace>;
};
type ChartData = {
  schema_version: number;
  iot: DataPoint[];
  ages: DataPoint[];
  sexes: DataPoint[];
  states: DataPoint[];
  pois: PoiPoint[];
};

const TOP_POI_LIMIT = 12;

function attributeNewCasesToPois(
  newlyInfected: Set<string>,
  previousPlaces: Record<string, string[]> | undefined,
  papPlaces: Record<string, PapPlace> | undefined,
  infectionsByPoi: Map<string, PoiPoint>
) {
  if (!newlyInfected.size || !previousPlaces) {
    return;
  }

  const attributedPeople = new Set<string>();

  for (const [placeId, occupants] of Object.entries(previousPlaces)) {
    if (!occupants?.length) {
      continue;
    }

    let newCaseCount = 0;
    for (const personId of occupants) {
      if (!newlyInfected.has(personId) || attributedPeople.has(personId)) {
        continue;
      }
      attributedPeople.add(personId);
      newCaseCount += 1;
    }

    if (!newCaseCount) {
      continue;
    }

    const place = papPlaces?.[placeId];
    const label =
      typeof place?.label === 'string' && place.label.trim()
        ? place.label.trim()
        : `Place #${placeId}`;
    const category =
      typeof place?.top_category === 'string' && place.top_category.trim()
        ? place.top_category.trim()
        : null;

    const existing = infectionsByPoi.get(placeId);
    if (existing) {
      existing.infections += newCaseCount;
      continue;
    }

    infectionsByPoi.set(placeId, {
      id: placeId,
      name: label,
      infections: newCaseCount,
      category
    });
  }
}

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
  const papdata = (await getCachedPapdata(papdataId)) as PapData;

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
      longitude: toCoord(papdata.homes[id].longitude),
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
  const populationIds = Object.keys(papdata.people ?? {});
  const ageIndex = new Map<string, number>();
  for (const [id, person] of Object.entries(papdata.people ?? {}) as [
    string,
    PapPerson
  ][]) {
    for (let i = 0; i < age_ranges.length; i++) {
      if (person.age >= age_ranges[i][0] && person.age <= age_ranges[i][1]) {
        ageIndex.set(id, i);
        break;
      }
    }
  }

  // Set up streams
  const simIter = chain([
    createReadStream(simdataPath),
    ...(simdataPath.endsWith('.gz') ? [createGunzip()] : []),
    parser(),
    StreamObject.streamObject()
  ])[Symbol.asyncIterator]();

  const patIter = chain([
    createReadStream(patternsPath),
    ...(patternsPath.endsWith('.gz') ? [createGunzip()] : []),
    parser(),
    StreamObject.streamObject()
  ])[Symbol.asyncIterator]();

  // Accumulate map cache parts
  const cacheParts: string[] = [
    `,"papdata":${JSON.stringify(papDataArrays)}`,
    ',"simdata":{'
  ];

  // Global stats accumulators
  const globalStats: ChartData = {
    schema_version: SIM_CHART_SCHEMA_VERSION,
    iot: [],
    ages: [],
    sexes: [],
    states: [],
    pois: []
  };

  // Hotspot tracking
  const hotspots: Record<string, number[]> = {};
  const prevInfected: Record<string, number> = {};
  const infectionsByPoi = new Map<string, PoiPoint>();
  let prevInfectedPeople: Set<string> | null = null;
  let prevPlaces: Record<string, string[]> | undefined;

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

    if (prevInfectedPeople) {
      const newlyInfected = new Set<string>();
      for (const personId of curinfected) {
        if (!prevInfectedPeople.has(personId)) {
          newlyInfected.add(personId);
        }
      }

      attributeNewCasesToPois(
        newlyInfected,
        prevPlaces,
        papdata.places,
        infectionsByPoi
      );
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
    const states_data = createExclusiveStatePoint(time);
    const combinedStates = new Map<string, number>();
    for (const label of age_range_labels) ages_data[label] = 0;

    for (const [disease, people] of Object.entries(svalue) as [
      string,
      Record<string, number>
    ][]) {
      const entries = Object.entries(people);
      iot_data[disease] = entries.length;

      for (const [id, stateBitmask] of entries) {
        addCombinedStateBit(combinedStates, id, stateBitmask);

        const person = papdata.people?.[id];
        if (person) {
          sexes_data[person.sex === 0 ? 'Male' : 'Female']++;
          const ageIdx = ageIndex.get(id);
          if (ageIdx !== undefined) ages_data[age_range_labels[ageIdx]]++;
        }
      }
    }

    populateExclusiveStateCounts(
      states_data,
      populationIds,
      combinedStates
    );

    globalStats.iot.push(iot_data);
    globalStats.ages.push(ages_data);
    globalStats.sexes.push(sexes_data);
    globalStats.states.push(states_data);

    if (totalLength > 0) {
      processingProgress.set(simDataId, Math.min(99, Math.round((+skey / totalLength) * 100)));
    }

    prevInfectedPeople = curinfected;
    prevPlaces = pvalue.places as Record<string, string[]> | undefined;

    spl = await simIter.next();
    ppl = await patIter.next();
  }

  processingProgress.delete(simDataId);
  globalStats.pois = Array.from(infectionsByPoi.values())
    .sort(
      (left, right) =>
        right.infections - left.infections || left.name.localeCompare(right.name)
    )
    .slice(0, TOP_POI_LIMIT);

  // Finalize map cache
  cacheParts.push(`},"hotspots":${JSON.stringify(hotspots)}`);
  await writeFile(mapCachePath, cacheParts.join(''));

  return globalStats;
}
