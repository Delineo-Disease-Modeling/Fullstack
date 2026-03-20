import { constants, createReadStream } from 'node:fs';
import { access } from 'node:fs/promises';
import { createGunzip } from 'node:zlib';
import type { NextRequest } from 'next/server';
import chain from 'stream-chain';
import parser from 'stream-json';
import StreamObject from 'stream-json/streamers/StreamObject.js';
import { prisma } from '@/lib/prisma';
import { getCachedPapdata } from '@/lib/papdata-cache';

const DB_FOLDER = process.env.DB_FOLDER || './db/';

const age_ranges = [
  [0, 20],
  [21, 40],
  [41, 60],
  [61, 80],
  [81, 99]
];
const infection_states = {
  Susceptible: 0,
  Infected: 1,
  Infectious: 2,
  Symptomatic: 4,
  Hospitalized: 8,
  Recovered: 16,
  Removed: 32
};

type DataPoint = { time: number; [key: string]: number };
type ChartData = { [type: string]: DataPoint[] };

/**
 * Compute location-specific chart data on-demand by streaming sim+patterns
 * files and filtering for the requested location.
 */
async function computeLocationStats(
  fileId: string,
  locId: string,
  locType: 'homes' | 'places',
  papdata: any
): Promise<ChartData> {
  const simPath = `${DB_FOLDER}${fileId}.sim.gz`;
  const patPath = `${DB_FOLDER}${fileId}.pat.gz`;

  await Promise.all([
    access(simPath, constants.F_OK),
    access(patPath, constants.F_OK)
  ]);

  const simIter = (
    chain([
      createReadStream(simPath),
      createGunzip(),
      parser(),
      StreamObject.streamObject()
    ]) as any
  )[Symbol.asyncIterator]();

  const patIter = (
    chain([
      createReadStream(patPath),
      createGunzip(),
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

    // Get the people at this location for this timestep
    const locGroup = locType === 'homes' ? pvalue.homes : pvalue.places;
    const pop: string[] | undefined = locGroup?.[locId];

    if (pop && pop.length > 0) {
      const popSet = new Set(pop);

      const iot_data: DataPoint = { time, 'All People': pop.length };
      const ages_data: DataPoint = { time };
      const sexes_data: DataPoint = { time, Male: 0, Female: 0 };
      const states_data: DataPoint = { time };

      for (const range of age_ranges) ages_data[range.join('-')] = 0;
      for (const state of Object.keys(infection_states))
        states_data[state] = 0;

      for (const [disease, people] of Object.entries(svalue) as [
        string,
        Record<string, number>
      ][]) {
        const localInfected = Object.entries(people).filter(([pid]) =>
          popSet.has(pid)
        );
        iot_data[disease] = localInfected.length;

        for (const [pid, stateBitmask] of localInfected) {
          for (const [state, value] of Object.entries(infection_states)) {
            if (state === 'Susceptible') continue;
            if (stateBitmask & (value as number)) states_data[state]++;
          }
          const p = papdata.people[pid];
          if (p) {
            sexes_data[p.sex === 0 ? 'Male' : 'Female'] += 1;
            for (const range of age_ranges) {
              if (p.age >= range[0] && p.age <= range[1])
                ages_data[range.join('-')] += 1;
            }
          }
        }
      }

      // Susceptible = people at this location who are not infected
      const totalInfected = Object.values(svalue).reduce(
        (sum: number, people: any) =>
          sum +
          Object.keys(people).filter((pid) => popSet.has(pid)).length,
        0
      );
      states_data.Susceptible = Math.max(0, pop.length - totalInfected);

      chartData.iot.push(iot_data);
      chartData.ages.push(ages_data);
      chartData.sexes.push(sexes_data);
      chartData.states.push(states_data);
    }

    spl = await simIter.next();
    ppl = await patIter.next();
  }

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

  // Global stats (no loc_id)
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

  // Location-specific stats: compute on-demand from files
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
