import { mkdir, rm } from 'node:fs/promises';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { saveFileStream } from '@/lib/filestream';
import { prisma } from '@/lib/prisma';
import { broadcast } from '@/lib/sse-broadcast';

const DB_FOLDER = process.env.DB_FOLDER || './db/';

const postSchema = z.object({
  czone_id: z.coerce.number().nonnegative()
});

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const czone_id_raw = formData.get('czone_id');
    const papdata = formData.get('papdata') as File | null;
    const patterns = formData.get('patterns') as File | null;

    const parsed = postSchema.safeParse({ czone_id: czone_id_raw });
    if (!parsed.success || !papdata || !patterns) {
      return Response.json({ message: 'Invalid form data' }, { status: 400 });
    }

    const { czone_id } = parsed.data;

    await mkdir(DB_FOLDER, { recursive: true });

    const papdata_id = crypto.randomUUID();
    const patterns_id = crypto.randomUUID();
    const papdataPath = `${DB_FOLDER}${papdata_id}.gz`;
    const patternsPath = `${DB_FOLDER}${patterns_id}.gz`;

    const existingZone = await prisma.convenienceZone.findUnique({
      where: { id: czone_id },
      select: { id: true }
    });

    if (!existingZone) {
      return Response.json(
        { message: `Could not find convenience zone #${czone_id}` },
        { status: 404 }
      );
    }

    try {
      await Promise.all([
        saveFileStream(patterns, patternsPath, true),
        saveFileStream(papdata, papdataPath, true)
      ]);

      await prisma.convenienceZone.update({
        where: { id: czone_id },
        data: { papdata_id, patterns_id }
      });
    } catch (error) {
      await Promise.all([
        rm(patternsPath, { force: true }),
        rm(papdataPath, { force: true })
      ]);
      throw error;
    }

    broadcast({ type: 'zone-ready', zone_id: czone_id });

    return Response.json({
      data: {
        papdata: { id: papdata_id },
        patterns: { id: patterns_id }
      }
    });
  } catch (e) {
    console.error(e);
    return Response.json({ message: 'Internal server error' }, { status: 500 });
  }
}
