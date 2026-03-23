import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { z } from 'zod';
import { DB_FOLDER, resolveDbDataPath } from '@/lib/db-files';
import { prisma } from '@/lib/prisma';
import { processingProgress, processSimulation } from '@/lib/sim-processor';

export const maxDuration = 300;

const postSchema = z.object({
  czone_id: z.coerce.number().int().nonnegative(),
  name: z.string().min(1).optional(),
  length: z.coerce.number().int().positive().optional(),
  simdata: z.record(z.string(), z.unknown()),
  movement: z.record(z.string(), z.unknown()).default({}),
  papdata: z.record(z.string(), z.unknown()).optional()
});

function deriveTotalLength(
  simdata: Record<string, unknown>,
  explicitLength?: number
) {
  if (typeof explicitLength === 'number' && Number.isFinite(explicitLength)) {
    return explicitLength;
  }

  return Object.keys(simdata).reduce((maxStep, key) => {
    const step = Number(key);
    return Number.isFinite(step) ? Math.max(maxStep, step) : maxStep;
  }, 0);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = postSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json({ message: parsed.error.message }, { status: 400 });
    }

    const { czone_id, name, length, simdata, movement, papdata } = parsed.data;

    await mkdir(DB_FOLDER, { recursive: true });

    const czone = await prisma.convenienceZone.findUnique({
      where: { id: czone_id }
    });

    if (!czone) {
      return Response.json(
        { message: `Could not find convenience zone #${czone_id}` },
        { status: 404 }
      );
    }

    let papdataId = czone.papdata_id;
    if (!papdataId && papdata) {
      papdataId = randomUUID();
      await writeFile(`${DB_FOLDER}${papdataId}.gz`, gzipSync(JSON.stringify(papdata)));
      await prisma.convenienceZone.update({
        where: { id: czone_id },
        data: { papdata_id: papdataId }
      });
    }

    if (!papdataId) {
      return Response.json(
        {
          message:
            'Convenience zone is missing papdata. Provide papdata or generate the zone first.'
        },
        { status: 400 }
      );
    }

    const simData = await prisma.simData.create({
      data: {
        czone_id,
        name: name?.trim() || `Simulation ${new Date().toLocaleString()}`,
        length: deriveTotalLength(simdata, length)
      }
    });

    const fileId = simData.file_id;
    const simPath = `${DB_FOLDER}${fileId}.sim`;
    const patPath = `${DB_FOLDER}${fileId}.pat`;

    await Promise.all([
      writeFile(simPath, JSON.stringify(simdata)),
      writeFile(patPath, JSON.stringify(movement))
    ]);

    const { path: papPath } = await resolveDbDataPath(papdataId);

    processSimulation({
      simDataId: simData.id,
      simdataPath: simPath,
      patternsPath: patPath,
      papDataPath: papPath,
      mapCachePath: `${DB_FOLDER}${fileId}.map.json`,
      totalLength: simData.length
    })
      .then((stats) =>
        prisma.simData.update({
          where: { id: simData.id },
          data: { global_stats: stats }
        })
      )
      .catch((error) => {
        console.error('Simulation processing failed:', error);
        processingProgress.delete(simData.id);
        prisma.simData
          .update({
            where: { id: simData.id },
            data: {
              global_stats: {
                error: error instanceof Error ? error.message : String(error)
              }
            }
          })
          .catch((dbError) =>
            console.error('Failed to persist error state:', dbError)
          );
      });

    return Response.json({ data: { id: simData.id } });
  } catch (error) {
    console.error(error);
    return Response.json({ message: 'Internal server error' }, { status: 500 });
  }
}
