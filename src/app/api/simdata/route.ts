import { mkdir } from 'node:fs/promises';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { saveFileStream } from '@/lib/filestream';
import { prisma } from '@/lib/prisma';
import { processingProgress, processSimulation } from '@/lib/sim-processor';

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

    const fileId = simdata_obj.file_id;
    const simIsGz = simdata.name.endsWith('.gz');
    const patIsGz = patterns.name.endsWith('.gz');
    const simPath = DB_FOLDER + fileId + '.sim' + (simIsGz ? '.gz' : '');
    const patPath = DB_FOLDER + fileId + '.pat' + (patIsGz ? '.gz' : '');

    await Promise.all([
      saveFileStream(simdata, simPath),
      saveFileStream(patterns, patPath)
    ]);

    const czone = await prisma.convenienceZone.findUnique({
      where: { id: Number(czone_id) }
    });

    if (czone?.papdata_id) {
      const papPath = `${DB_FOLDER}${czone.papdata_id}.gz`;

      // Single-pass processor: generates map cache, global stats
      processSimulation({
        simDataId: simdata_obj.id,
        simdataPath: simPath,
        patternsPath: patPath,
        papDataPath: papPath,
        mapCachePath: `${DB_FOLDER}${fileId}.map.json`,
        totalLength: length
      })
        .then((stats) =>
          prisma.simData.update({
            where: { id: simdata_obj.id },
            data: { global_stats: stats }
          })
        )
        .catch((e) => {
          console.error('Simulation processing failed:', e);
          processingProgress.delete(simdata_obj.id);
          prisma.simData
            .update({
              where: { id: simdata_obj.id },
              data: {
                global_stats: {
                  error: e instanceof Error ? e.message : String(e)
                }
              }
            })
            .catch((dbErr) =>
              console.error('Failed to persist error state:', dbErr)
            );
        });
    }

    return Response.json({ data: { id: simdata_obj.id } });
  } catch (e) {
    console.error(e);
    return Response.json({ message: 'Internal server error' }, { status: 500 });
  }
}
