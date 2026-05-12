import { createReadStream } from 'node:fs';
import { createGunzip } from 'node:zlib';
import type { NextRequest } from 'next/server';
import chain from 'stream-chain';
import parser from 'stream-json';
import StreamObject from 'stream-json/streamers/StreamObject.js';
import { DB_FOLDER, resolveDbDataPath } from '@/lib/db-files';
import {
  SIM_CHART_SCHEMA_VERSION,
  addCombinedStateBit,
  createExclusiveStatePoint,
  populateExclusiveStateCounts
} from '@/lib/disease-states';
import { prisma } from '@/lib/prisma';
import { getCachedPapdata } from '@/lib/papdata-cache';
import { processingProgress, processSimulation } from '@/lib/sim-processor';

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
type PapData = {
  people?: Record<string, PapPerson>;
};
type ChartData = {
  schema_version: number;
  iot: DataPoint[];
  ages: DataPoint[];
  sexes: DataPoint[];
  states: DataPoint[];
  pois: PoiPoint[];
};

const LOC_CACHE_MAX = 30;
interface LocCacheEntry {
  data: ChartData;
  lastAccess: number;
}
const locationCache = new Map<string, LocCacheEntry>();

function getCachedLocationStats(key: string): ChartData | undefined {
  const entry = locationCache.get(key);
  if (entry) {
    entry.lastAccess = Date.now();
    return entry.data;
  }
  return undefined;
}

function setCachedLocationStats(key: string, data: ChartData): void {
  if (locationCache.size >= LOC_CACHE_MAX) {
    let oldestKey = '';
    let oldestTime = Infinity;
    for (const [k, entry] of locationCache) {
      if (entry.lastAccess < oldestTime) {
        oldestTime = entry.lastAccess;
        oldestKey = k;
      }
    }
    if (oldestKey) {
      locationCache.delete(oldestKey);
    }
  }
  locationCache.set(key, { data, lastAccess: Date.now() });
}

async function computeLocationStats(
  fileId: string,
  locId: string,
  locType: 'homes' | 'places',
  papdata: PapData
): Promise<ChartData> {
  const cacheKey = `${fileId}:${locType}:${locId}`;
  const cached = getCachedLocationStats(cacheKey);
  if (cached) {
    return cached;
  }

  const [{ path: simPath, gzipped: simGzipped }, { path: patPath, gzipped: patGzipped }] =
    await Promise.all([
      resolveDbDataPath(fileId, '.sim'),
      resolveDbDataPath(fileId, '.pat')
    ]);

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

  const simIter = (
    chain([
      createReadStream(simPath),
      ...(simGzipped ? [createGunzip()] : []),
      parser(),
      StreamObject.streamObject()
    ])
  )[Symbol.asyncIterator]();

  const patIter = (
    chain([
      createReadStream(patPath),
      ...(patGzipped ? [createGunzip()] : []),
      parser(),
      StreamObject.streamObject()
    ])
  )[Symbol.asyncIterator]();

  const chartData: ChartData = {
    schema_version: SIM_CHART_SCHEMA_VERSION,
    iot: [],
    ages: [],
    sexes: [],
    states: [],
    pois: []
  };

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

    const locGroup = locType === 'homes' ? pvalue.homes : pvalue.places;
    const pop: string[] | undefined = locGroup?.[locId];

    if (pop && pop.length > 0) {
      const iot_data: DataPoint = { time, 'All People': pop.length };
      const ages_data: DataPoint = { time };
      const sexes_data: DataPoint = { time, Male: 0, Female: 0 };
      const states_data = createExclusiveStatePoint(time);
      const combinedStates = new Map<string, number>();

      for (const label of age_range_labels) ages_data[label] = 0;

      for (const [disease, people] of Object.entries(svalue) as [
        string,
        Record<string, number>
      ][]) {
        let diseaseCount = 0;

        for (const pid of pop) {
          const stateBitmask = people[pid];
          if (stateBitmask === undefined) {
            continue;
          }

          diseaseCount++;
          addCombinedStateBit(combinedStates, pid, stateBitmask);
          const p = papdata.people?.[pid];
          if (p) {
            sexes_data[p.sex === 0 ? 'Male' : 'Female']++;
            const ageIdx = ageIndex.get(pid);
            if (ageIdx !== undefined) {
              ages_data[age_range_labels[ageIdx]]++;
            }
          }
        }

        iot_data[disease] = diseaseCount;
      }

      populateExclusiveStateCounts(states_data, pop, combinedStates);

      chartData.iot.push(iot_data);
      chartData.ages.push(ages_data);
      chartData.sexes.push(sexes_data);
      chartData.states.push(states_data);
    }

    spl = await simIter.next();
    ppl = await patIter.next();
  }

  setCachedLocationStats(cacheKey, chartData);
  return chartData;
}

async function queueGlobalStatsRefresh(simdata: {
  id: number;
  file_id: string;
  length: number;
  czone: { papdata_id: string | null };
}) {
  if (!simdata.czone.papdata_id || processingProgress.has(simdata.id)) {
    return;
  }

  try {
    const [{ path: simPath }, { path: patPath }] = await Promise.all([
      resolveDbDataPath(simdata.file_id, '.sim'),
      resolveDbDataPath(simdata.file_id, '.pat')
    ]);

    processSimulation({
      simDataId: simdata.id,
      simdataPath: simPath,
      patternsPath: patPath,
      papdataId: simdata.czone.papdata_id,
      mapCachePath: `${DB_FOLDER}${simdata.file_id}.map.json`,
      totalLength: simdata.length
    })
      .then((stats) =>
        prisma.simData.update({
          where: { id: simdata.id },
          data: { global_stats: stats }
        })
      )
      .catch((error) => {
        console.error('Chart data refresh failed:', error);
        processingProgress.delete(simdata.id);
      });
  } catch (error) {
    console.error('Failed to queue chart refresh:', error);
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: id_raw } = await params;
  const id = Number(id_raw);
  const { searchParams } = new URL(request.url);
  const loc_type = searchParams.get('loc_type') as 'homes' | 'places' | null;
  const loc_id = searchParams.get('loc_id');

  if (Number.isNaN(id) || id < 0) {
    return Response.json({ message: 'Invalid id' }, { status: 400 });
  }

  const simdata = await prisma.simData.findUnique({
    where: { id },
    include: { czone: true }
  });
  if (!simdata) {
    return Response.json(
      { message: 'Could not find associated simdata' },
      { status: 404 }
    );
  }

  if (!loc_id || !loc_type) {
    if (!simdata.global_stats) {
      await queueGlobalStatsRefresh(simdata);
      return Response.json(
        {
          message:
            'Global stats are still being processed. This may take a few minutes for large simulations.'
        },
        { status: 202 }
      );
    }

    if (simdata.global_stats) {
      const stats = simdata.global_stats as Record<string, unknown> &
        Partial<ChartData>;
      if (typeof stats.error === 'string') {
        return Response.json(
          { message: `Chart generation failed: ${stats.error}` },
          { status: 500 }
        );
      }

      if (
        stats.schema_version !== SIM_CHART_SCHEMA_VERSION ||
        !Array.isArray(stats.pois)
      ) {
        await queueGlobalStatsRefresh(simdata);
        return Response.json(
          {
            message:
              'Chart data is being refreshed to use the latest simulation summary format.'
          },
          { status: 202 }
        );
      }

      return Response.json({
        data: stats,
        start_date: simdata.czone.start_date.toISOString()
      });
    }
  }

  if (!loc_id || !loc_type) {
    return Response.json(
      { message: 'Location parameters are required for location chart data.' },
      { status: 400 }
    );
  }

  try {
    const papDataId = simdata.czone.papdata_id;
    if (!papDataId) {
      return Response.json(
        { message: 'PapData not available for this zone' },
        { status: 404 }
      );
    }

    const papdata = (await getCachedPapdata(papDataId)) as PapData;
    const chartData = await computeLocationStats(
      simdata.file_id,
      loc_id,
      loc_type,
      papdata
    );

    return Response.json({
      data: chartData,
      start_date: simdata.czone.start_date.toISOString()
    });
  } catch (e) {
    console.error('Stats computation error:', e);
    return Response.json(
      { message: 'Failed to compute simulation statistics.' },
      { status: 500 }
    );
  }
}
