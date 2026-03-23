import { readFile, stat, unlink } from 'node:fs/promises';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { DB_FOLDER } from '@/lib/db-files';
import { prisma } from '@/lib/prisma';
import { processingProgress } from '@/lib/sim-processor';

const updateSchema = z.object({
  name: z.string().min(2).optional()
});

/** Optionally gzip-compress a response body if the client accepts it. */
function maybeCompress(
  body: BodyInit,
  acceptEncoding: string | null,
  headers: Record<string, string>
): Response {
  if (
    acceptEncoding?.includes('gzip') &&
    typeof CompressionStream !== 'undefined'
  ) {
    const compressed = new Response(body).body?.pipeThrough(
      new CompressionStream('gzip')
    );
    if (!compressed) return new Response(body, { headers });
    return new Response(compressed, {
      headers: {
        ...headers,
        'Content-Encoding': 'gzip',
        Vary: 'Accept-Encoding'
      }
    });
  }
  return new Response(body, { headers });
}

// HTTPS requests

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: id_raw } = await params;
  const id = Number(id_raw);

  if (Number.isNaN(id) || id < 0) {
    return Response.json({ message: 'Invalid id' }, { status: 400 });
  }

  const simdata = await prisma.simData.findUnique({
    where: { id },
    include: { czone: true }
  });

  if (!simdata) {
    return Response.json(
      { message: `Could not find simdata #${id}` },
      { status: 404 }
    );
  }

  const fileId = simdata.file_id;
  const mapCachePath = `${DB_FOLDER}${fileId}.map.json`;

  const acceptEncoding = request.headers.get('accept-encoding');

  // Optional pagination, allows clients to request a subset of timesteps
  const { searchParams } = request.nextUrl;
  const fromStep = Number(searchParams.get('from') ?? 0);
  const toStep = searchParams.has('to')
    ? Number(searchParams.get('to'))
    : Infinity;
  const paginated = searchParams.has('from') || searchParams.has('to');

  // Cache hit?
  try {
    const [cacheData, cacheStat] = await Promise.all([
      readFile(mapCachePath),
      stat(mapCachePath)
    ]);

    // ETag based on file mtime + size
    const etag = `"${cacheStat.mtimeMs.toString(36)}-${cacheStat.size.toString(36)}"`;
    if (!paginated && request.headers.get('if-none-match') === etag) {
      return new Response(null, { status: 304 });
    }

    // Paginated request: parse cache, filter timesteps, return JSON object
    if (paginated) {
      const parsed = JSON.parse(`{"_":0${cacheData.toString('utf8')}}`);

      const filteredSimdata: Record<string, unknown> = {};
      if (parsed.simdata) {
        for (const [key, val] of Object.entries(parsed.simdata)) {
          const step = Number(key);
          if (step >= fromStep && step <= toStep) {
            filteredSimdata[key] = val;
          }
        }
      }

      const body = JSON.stringify({
        data: {
          name: simdata.name,
          length: simdata.length,
          zone: simdata.czone,
          papdata: parsed.papdata,
          simdata: filteredSimdata,
          hotspots: parsed.hotspots ?? {}
        }
      });

      return maybeCompress(body, acceptEncoding, {
        'Content-Type': 'application/json',
        'Cache-Control': 'private, max-age=30'
      });
    }

    // Non-paginated: splice header + raw cache bytes + suffix (zero-parse)
    const headerStr = `{"data":{"name":${JSON.stringify(simdata.name)},"length":${simdata.length},"zone":${JSON.stringify(simdata.czone)}`;

    const body = Buffer.concat([
      Buffer.from(headerStr, 'utf8'),
      cacheData,
      Buffer.from('}}', 'utf8')
    ]);

    return maybeCompress(body, acceptEncoding, {
      'Content-Type': 'application/json',
      ETag: etag,
      'Cache-Control': 'private, max-age=30'
    });
  } catch (e: unknown) {
    if ((e as NodeJS.ErrnoException)?.code !== 'ENOENT') {
      console.error('Map cache read error:', e);
    }
    // Cache miss: map cache not yet generated
  }

  // Cache miss: return 202 with processing progress so the client can
  // show a progress bar while polling.
  const progress = processingProgress.get(id) ?? 0;
  return Response.json(
    {
      processing: true,
      progress,
      message:
        'Simulation data is still being processed. Please retry shortly.'
    },
    { status: 202 }
  );
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: id_raw } = await params;
  const id = Number(id_raw);

  if (Number.isNaN(id) || id < 0) {
    return Response.json({ message: 'Invalid id' }, { status: 400 });
  }

  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user?.id) {
    return Response.json(
      { message: 'Authentication required' },
      { status: 401 }
    );
  }

  try {
    const existing = await prisma.simData.findUnique({
      where: { id },
      include: { czone: { select: { user_id: true } } }
    });

    if (!existing) {
      return Response.json(
        { message: `Could not find simdata #${id}` },
        { status: 404 }
      );
    }

    if (existing.czone.user_id !== session.user.id) {
      return Response.json({ message: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { message: parsed.error.message },
        { status: 400 }
      );
    }

    const { name } = parsed.data;
    const updated = await prisma.simData.update({
      where: { id },
      data: { name }
    });
    return Response.json({ data: updated });
  } catch {
    return Response.json(
      { message: `Could not find simdata #${id}` },
      { status: 404 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: id_raw } = await params;
  const id = Number(id_raw);

  if (Number.isNaN(id) || id < 0) {
    return Response.json({ message: 'Invalid id' }, { status: 400 });
  }

  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user?.id) {
    return Response.json(
      { message: 'Authentication required' },
      { status: 401 }
    );
  }

  try {
    const existing = await prisma.simData.findUnique({
      where: { id },
      include: { czone: { select: { user_id: true } } }
    });

    if (!existing) {
      return Response.json(
        { message: `Could not find simdata #${id}` },
        { status: 404 }
      );
    }

    if (existing.czone.user_id !== session.user.id) {
      return Response.json({ message: 'Forbidden' }, { status: 403 });
    }

    const deleted = await prisma.simData.delete({ where: { id } });

    // Clean up all files associated with this run
    const base = DB_FOLDER + deleted.file_id;
    await Promise.allSettled([
      unlink(`${base}.sim`),
      unlink(`${base}.sim.gz`),
      unlink(`${base}.pat`),
      unlink(`${base}.pat.gz`),
      unlink(`${base}.map.json`)
    ]);

    return Response.json({ data: deleted });
  } catch {
    return Response.json(
      { message: `Could not find simdata #${id}` },
      { status: 404 }
    );
  }
}
