import { constants, createReadStream } from 'node:fs';
import { access } from 'node:fs/promises';
import { createGunzip } from 'node:zlib';
import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCachedPapdata } from '@/lib/papdata-cache';

const DB_FOLDER = process.env.DB_FOLDER || './db/';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ czone_id: string }> }
) {
  const { czone_id: czone_id_raw } = await params;
  const czone_id = Number(czone_id_raw);

  if (Number.isNaN(czone_id) || czone_id < 0) {
    return Response.json({ message: 'Invalid czone_id' }, { status: 400 });
  }

  const czone = await prisma.convenienceZone.findUnique({
    where: { id: czone_id }
  });

  if (!czone?.papdata_id || !czone?.patterns_id) {
    return Response.json(
      { message: 'Could not find patterns or papdata' },
      { status: 404 }
    );
  }

  const patPath = `${DB_FOLDER + czone.patterns_id}.gz`;

  try {
    await access(patPath, constants.F_OK);
  } catch {
    return Response.json({ message: 'Data files not found' }, { status: 404 });
  }

  let papdata: any;
  try {
    papdata = await getCachedPapdata(czone.papdata_id);
  } catch {
    return Response.json({ message: 'Papdata file not found' }, { status: 404 });
  }

  const encoder = new TextEncoder();

  // Send papdata as first line, then stream raw decompressed patterns JSON
  const stream = new ReadableStream({
    async start(controller) {
      try {
        controller.enqueue(encoder.encode(JSON.stringify(papdata)));
        controller.enqueue(encoder.encode('\n'));

        const gunzip = createGunzip();
        const fileStream = createReadStream(patPath).pipe(gunzip);
        for await (const chunk of fileStream) {
          controller.enqueue(chunk);
        }

        controller.close();
      } catch (e) {
        console.error('Patterns stream error:', e);
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' }
  });
}
