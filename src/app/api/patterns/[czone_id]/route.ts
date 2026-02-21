import { constants, createReadStream } from 'node:fs';
import { access } from 'node:fs/promises';
import { createGunzip } from 'node:zlib';
import type { NextRequest } from 'next/server';
import chain from 'stream-chain';
import parser from 'stream-json';
import StreamObject from 'stream-json/streamers/StreamObject.js';
import { prisma } from '@/lib/prisma';

const DB_FOLDER = process.env.DB_FOLDER || './db/';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ czone_id: string }> }
) {
  const { czone_id: czone_id_raw } = await params;
  const czone_id = Number(czone_id_raw);
  const { searchParams } = new URL(request.url);
  const length = searchParams.get('length')
    ? Number(searchParams.get('length'))
    : undefined;

  if (Number.isNaN(czone_id) || czone_id < 0) {
    return Response.json({ message: 'Invalid czone_id' }, { status: 400 });
  }

  const [papdata_obj, patterns_obj] = await Promise.all([
    prisma.paPData.findUnique({ where: { czone_id } }),
    prisma.movementPattern.findUnique({ where: { czone_id } })
  ]);

  if (!papdata_obj || !patterns_obj) {
    return Response.json(
      { message: 'Could not find patterns or papdata' },
      { status: 404 }
    );
  }

  const papPath = `${DB_FOLDER + papdata_obj.id}.gz`;
  const patPath = `${DB_FOLDER + patterns_obj.id}.gz`;

  try {
    await Promise.all([
      access(papPath, constants.F_OK),
      access(patPath, constants.F_OK)
    ]);
  } catch {
    return Response.json({ message: 'Data files not found' }, { status: 404 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Stream papdata
        const papChain = chain([createReadStream(papPath), createGunzip()]);
        for await (const chunk of papChain) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.enqueue(encoder.encode('\n'));

        // Stream patterns
        const patChain = chain([
          createReadStream(patPath),
          createGunzip(),
          parser(),
          StreamObject.streamObject()
        ]);
        for await (const { key, value } of patChain as AsyncIterable<{
          key: string;
          value: any;
        }>) {
          if (length && +key > length) continue;
          controller.enqueue(
            encoder.encode(
              `${JSON.stringify({ patterns: { [key]: value } })}\n`
            )
          );
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
