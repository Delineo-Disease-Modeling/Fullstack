import { constants } from 'node:fs';
import { access, readFile } from 'node:fs/promises';
import { createGunzip } from 'node:zlib';
import type { NextRequest } from 'next/server';
import { getStats } from '@/lib/postgres-store';
import { prisma } from '@/lib/prisma';

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

async function getPapData(czone_id: number) {
  const papdata_obj = await prisma.paPData.findUnique({ where: { czone_id } });
  if (!papdata_obj) throw new Error('Could not find papdata');

  const papPath = `${DB_FOLDER + papdata_obj.id}.gz`;
  await access(papPath, constants.F_OK);
  const raw = await readFile(papPath);

  const buffer = await new Promise<Buffer>((resolve, reject) => {
    const unzip = createGunzip();
    const chunks: Buffer[] = [];
    unzip.on('data', (c) => chunks.push(c));
    unzip.on('end', () => resolve(Buffer.concat(chunks)));
    unzip.on('error', reject);
    unzip.end(raw);
  });

  return JSON.parse(buffer.toString());
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

  const simdata = await prisma.simData.findUnique({ where: { id } });
  if (!simdata) {
    return Response.json(
      { message: 'Could not find associated simdata' },
      { status: 404 }
    );
  }

  // Global stats (no loc_id)
  if (!loc_id || !loc_type) {
    if (simdata.global_stats) {
      return Response.json({ data: simdata.global_stats });
    }
    return Response.json(
      { message: 'Global stats are still being processed. This may take a few minutes for large simulations.' },
      { status: 202 }
    );
  }

  // Location-specific stats
  if (loc_id) {
    try {
      const rows = await getStats(simdata.id, loc_id);
      const chartData: ChartData = { iot: [], ages: [], sexes: [], states: [] };
      const papdata = await getPapData(simdata.czone_id);

      for (const row of rows) {
        const iot_data: DataPoint = { time: row.time };
        const ages_data: DataPoint = { time: row.time };
        const sexes_data: DataPoint = { time: row.time };
        const states_data: DataPoint = { time: row.time };

        sexes_data.Male = 0;
        sexes_data.Female = 0;
        for (const range of age_ranges) ages_data[range.join('-')] = 0;
        for (const state of Object.keys(infection_states))
          states_data[state] = 0;

        iot_data['All People'] = row.population;
        const infectedMap = row.infected_list;

        for (const [disease, people] of Object.entries(infectedMap) as [
          string,
          any
        ][]) {
          iot_data[disease] = Object.keys(people).length;
          for (const [state, value] of Object.entries(infection_states)) {
            states_data[state] += Object.values(people).filter(
              (s: any) => s & (value as number)
            ).length;
          }
          Object.keys(people).forEach((pid) => {
            const p = papdata.people[pid];
            if (p) {
              sexes_data[p.sex === 0 ? 'Male' : 'Female'] += 1;
              for (const range of age_ranges) {
                if (p.age >= range[0] && p.age <= range[1])
                  ages_data[range.join('-')] += 1;
              }
            }
          });
        }

        chartData.iot.push(iot_data);
        chartData.ages.push(ages_data);
        chartData.sexes.push(sexes_data);
        chartData.states.push(states_data);
      }

      return Response.json({ data: chartData });
    } catch (e) {
      console.error('Stats retrieval error:', e);
      return Response.json(
        { message: 'Failed to retrieve simulation statistics.' },
        { status: 500 }
      );
    }
  }

  return Response.json(
    { message: 'Invalid request parameters' },
    { status: 400 }
  );
}
