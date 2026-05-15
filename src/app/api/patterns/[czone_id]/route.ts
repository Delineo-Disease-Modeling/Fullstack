import { createReadStream } from 'node:fs';
import { createGunzip } from 'node:zlib';
import type { NextRequest } from 'next/server';
import { resolveDbDataPath } from '@/lib/db-files';
import { prisma } from '@/lib/prisma';
import { getCachedPapdata } from '@/lib/papdata-cache';
import { jsonMessage } from '@/server/api/responses';
import { parseNonNegativeRouteNumber } from '@/server/api/route-params';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ czone_id: string }> }
) {
  const { czone_id: czone_id_raw } = await params;
  const czoneId = parseNonNegativeRouteNumber(czone_id_raw, 'czone_id');
  if (!czoneId.ok) {
    return jsonMessage(czoneId.message, czoneId.status);
  }

  const czone = await prisma.convenienceZone.findUnique({
    where: { id: czoneId.value }
  });

  if (!czone?.papdata_id || !czone?.patterns_id) {
    return Response.json(
      { message: 'Could not find patterns or papdata' },
      { status: 404 }
    );
  }

  try {
    const [{ path: patPath, gzipped: patGzipped }, papdata] =
      await Promise.all([
        resolveDbDataPath(czone.patterns_id),
        getCachedPapdata(czone.papdata_id)
      ]);

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(papdata)));
          controller.enqueue(encoder.encode('\n'));

          const fileStream = patGzipped
            ? createReadStream(patPath).pipe(createGunzip())
            : createReadStream(patPath);

          for await (const chunk of fileStream) {
            controller.enqueue(
              typeof chunk === 'string' ? encoder.encode(chunk) : chunk
            );
          }

          controller.enqueue(encoder.encode('\n'));
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
  } catch {
    return Response.json({ message: 'Data files not found' }, { status: 404 });
  }
}
