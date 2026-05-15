import type { NextRequest } from 'next/server';
import { resolveDbDataPath } from '@/lib/db-files';
import { streamJsonObjectEntries } from '@/lib/json-stream';
import { getCachedPapdata } from '@/lib/papdata-cache';
import { prisma } from '@/lib/prisma';
import {
  AGE_RANGE_LABELS,
  ALL_STATE_NAMES,
  BITMASK_STATES,
  buildAgeIndex,
  type ChartData,
  type DataPoint,
  getChartError,
  type DiseaseStateTimestep,
  type PapData,
  type PatternTimestep
} from '@/lib/simulation-data';
import { jsonMessage } from '@/server/api/responses';
import { parseNonNegativeRouteNumber } from '@/server/api/route-params';

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

  const [
    { path: simPath, gzipped: simGzipped },
    { path: patPath, gzipped: patGzipped }
  ] = await Promise.all([
    resolveDbDataPath(fileId, '.sim'),
    resolveDbDataPath(fileId, '.pat')
  ]);

  const ageIndex = buildAgeIndex(papdata.people);

  const simIter = streamJsonObjectEntries<DiseaseStateTimestep>(
    simPath,
    simGzipped
  );
  const patIter = streamJsonObjectEntries<PatternTimestep>(patPath, patGzipped);

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

      for (const label of AGE_RANGE_LABELS) ages_data[label] = 0;
      for (const name of ALL_STATE_NAMES) states_data[name] = 0;

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
          for (const [stateName, bit] of BITMASK_STATES) {
            if (stateBitmask & bit) states_data[stateName]++;
          }
          const p = papdata.people?.[pid];
          if (p) {
            sexes_data[p.sex === 0 ? 'Male' : 'Female']++;
            const ageIdx = ageIndex.get(pid);
            if (ageIdx !== undefined) {
              ages_data[AGE_RANGE_LABELS[ageIdx]]++;
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
  const id = parseNonNegativeRouteNumber(id_raw, 'id');
  const { searchParams } = new URL(request.url);
  const loc_type = searchParams.get('loc_type') as 'homes' | 'places' | null;
  const loc_id = searchParams.get('loc_id');

  if (!id.ok) {
    return jsonMessage(id.message, id.status);
  }

  const simdata = await prisma.simData.findUnique({
    where: { id: id.value },
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
      const stats = simdata.global_stats;
      const statsError = getChartError(stats);
      if (statsError) {
        return Response.json(
          { message: `Chart generation failed: ${statsError}` },
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
