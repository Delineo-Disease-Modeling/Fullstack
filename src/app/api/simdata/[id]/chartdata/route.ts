import { createReadStream } from 'node:fs';
import { createGunzip } from 'node:zlib';
import type { NextRequest } from 'next/server';
import chain from 'stream-chain';
import parser from 'stream-json';
import StreamObject from 'stream-json/streamers/StreamObject.js';
import { resolveDbDataPath } from '@/lib/db-files';
import { prisma } from '@/lib/prisma';
import { getCachedPapdata } from '@/lib/papdata-cache';

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
  papdata: any
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
    any
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
    ]) as any
  )[Symbol.asyncIterator]();

  const patIter = (
    chain([
      createReadStream(patPath),
      ...(patGzipped ? [createGunzip()] : []),
      parser(),
      StreamObject.streamObject()
    ]) as any
  )[Symbol.asyncIterator]();

  const chartData: ChartData = { iot: [], ages: [], sexes: [], states: [] };

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
      const states_data: DataPoint = { time };

      for (const label of age_range_labels) ages_data[label] = 0;
      for (const name of all_state_names) states_data[name] = 0;

      let totalInfected = 0;

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
          for (const [stateName, bit] of bitmask_states) {
            if (stateBitmask & bit) states_data[stateName]++;
          }
          const p = papdata.people[pid];
          if (p) {
            sexes_data[p.sex === 0 ? 'Male' : 'Female']++;
            const ageIdx = ageIndex.get(pid);
            if (ageIdx !== undefined) {
              ages_data[age_range_labels[ageIdx]]++;
            }
          }
        }

        iot_data[disease] = diseaseCount;
        totalInfected += diseaseCount;
      }

      states_data.Susceptible = Math.max(0, pop.length - totalInfected);

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
    if (simdata.global_stats) {
      const stats = simdata.global_stats as any;
      if (stats.error) {
        return Response.json(
          { message: `Chart generation failed: ${stats.error}` },
          { status: 500 }
        );
      }
      return Response.json({ data: stats });
    }
    return Response.json(
      {
        message:
          'Global stats are still being processed. This may take a few minutes for large simulations.'
      },
      { status: 202 }
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

    const papdata = await getCachedPapdata(papDataId);
    const chartData = await computeLocationStats(
      simdata.file_id,
      loc_id,
      loc_type,
      papdata
    );

    return Response.json({ data: chartData });
  } catch (e) {
    console.error('Stats computation error:', e);
    return Response.json(
      { message: 'Failed to compute simulation statistics.' },
      { status: 500 }
    );
  }
}
