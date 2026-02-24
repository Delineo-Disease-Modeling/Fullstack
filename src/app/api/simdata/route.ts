import { constants } from 'node:fs';
import { access, mkdir } from 'node:fs/promises';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { saveFileStream } from '@/lib/filestream';
import { processSimData } from '@/lib/postgres-store';
import { prisma } from '@/lib/prisma';
import { generateMapData } from '@/lib/sim-map';
import { generateGlobalStats } from '@/lib/sim-stats';

export const maxDuration = 300;

const DB_FOLDER = process.env.DB_FOLDER || './db/';

const postSchema = z.object({
  czone_id: z.coerce.number().nonnegative(),
  length: z.coerce.number().nonnegative()
});

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const simdata = formData.get('simdata') as File | null;
    const patterns = formData.get('patterns') as File | null;
    const parsed = postSchema.safeParse({
      czone_id: formData.get('czone_id'),
      length: formData.get('length')
    });

    if (!parsed.success || !simdata || !patterns) {
      return Response.json({ message: 'Invalid form data' }, { status: 400 });
    }

    const { czone_id, length } = parsed.data;

    await mkdir(DB_FOLDER, { recursive: true });

    const simdata_obj = await prisma.simData.create({
      data: { czone_id, length }
    });

    const simIsGz = simdata.name.endsWith('.gz');
    const patIsGz = patterns.name.endsWith('.gz');

    await Promise.all([
      saveFileStream(
        simdata,
        DB_FOLDER + simdata_obj.simdata + (simIsGz ? '.gz' : '')
      ),
      saveFileStream(
        patterns,
        DB_FOLDER + simdata_obj.patterns + (patIsGz ? '.gz' : '')
      )
    ]);

    const papdata_obj = await prisma.paPData.findUnique({
      where: { czone_id: Number(czone_id) }
    });

    if (papdata_obj) {
      let papPath = DB_FOLDER + papdata_obj.id;
      try {
        await access(`${papPath}.gz`, constants.F_OK);
        papPath += '.gz';
      } catch {
        // plain file
      }

      generateGlobalStats(
        DB_FOLDER + simdata_obj.simdata + (simIsGz ? '.gz' : ''),
        papPath
      )
        .then((stats) =>
          prisma.simData.update({
            where: { id: simdata_obj.id },
            data: { global_stats: stats }
          })
        )
        .catch((e) => {
          console.error('Stats generation failed:', e);
          prisma.simData.update({
            where: { id: simdata_obj.id },
            data: {
              global_stats: {
                error: e instanceof Error ? e.message : String(e)
              }
            }
          }).catch((dbErr) =>
            console.error('Failed to persist stats error state:', dbErr)
          );
        });

      processSimData(
        simdata_obj.id,
        DB_FOLDER + simdata_obj.simdata + (simIsGz ? '.gz' : ''),
        DB_FOLDER + simdata_obj.patterns + (patIsGz ? '.gz' : '')
      ).catch((e) => console.error('Postgres ingestion failed:', e));

      generateMapData(
        DB_FOLDER + simdata_obj.simdata + (simIsGz ? '.gz' : ''),
        DB_FOLDER + simdata_obj.patterns + (patIsGz ? '.gz' : ''),
        papPath,
        `${DB_FOLDER + simdata_obj.simdata}.map.json`
      ).catch((e) => console.error('Map cache generation failed:', e));
    }

    return Response.json({ data: { id: simdata_obj.id } });
  } catch (e) {
    console.error(e);
    return Response.json({ message: 'Internal server error' }, { status: 500 });
  }
}
