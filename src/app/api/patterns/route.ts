import { mkdir } from 'node:fs/promises';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { saveFileStream } from '@/lib/filestream';
import { prisma } from '@/lib/prisma';

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

    const papdata_obj = await prisma.paPData.create({ data: { czone_id } });
    const patterns_obj = await prisma.movementPattern.create({
      data: { czone_id }
    });

    await Promise.all([
      saveFileStream(patterns, `${DB_FOLDER + patterns_obj.id}.gz`, true),
      saveFileStream(papdata, `${DB_FOLDER + papdata_obj.id}.gz`, true)
    ]);

    return Response.json({
      data: {
        papdata: { id: papdata_obj.id },
        patterns: { id: patterns_obj.id }
      }
    });
  } catch (e) {
    console.error(e);
    return Response.json({ message: 'Internal server error' }, { status: 500 });
  }
}
