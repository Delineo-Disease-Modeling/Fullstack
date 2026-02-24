import { constants, createReadStream, createWriteStream } from 'node:fs';
import { access, readFile, rename, stat, unlink } from 'node:fs/promises';
import type { NextRequest } from 'next/server';
import chain from 'stream-chain';
import parser from 'stream-json';
import StreamObject from 'stream-json/streamers/StreamObject.js';
import { createGunzip } from 'node:zlib';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

const DB_FOLDER = process.env.DB_FOLDER || './db/';

const updateSchema = z.object({
  name: z.string().min(2).optional()
});

// Helper Functions

/** Load and process papdata for a convenience zone. */
async function loadPapData(czoneId: number) {
  const papObj = await prisma.paPData.findUnique({
    where: { czone_id: czoneId }
  });
  if (!papObj) return null;

  const papPath = `${DB_FOLDER}${papObj.id}.gz`;
  try {
    await access(papPath, constants.F_OK);
  } catch {
    return null;
  }

  const raw = await readFile(papPath);
  const buffer = await new Promise<Buffer>((resolve, reject) => {
    const unzip = createGunzip();
    const chunks: Buffer[] = [];
    unzip.on('data', (c: Buffer) => chunks.push(c));
    unzip.on('end', () => resolve(Buffer.concat(chunks)));
    unzip.on('error', reject);
    unzip.end(raw);
  });

  const json = JSON.parse(buffer.toString());
  const homeIds = Object.keys(json.homes).sort(
    (a, b) => Number(a) - Number(b)
  );
  const placeIds = Object.keys(json.places).sort(
    (a, b) => Number(a) - Number(b)
  );

  return {
    homeIds,
    placeIds,
    arrays: {
      homes: homeIds.map((id) => ({ id })),
      places: placeIds.map((id) => ({
        id,
        latitude: json.places[id].latitude,
        longitude: json.places[id].longitude,
        label: json.places[id].label,
        top_category: json.places[id].top_category
      }))
    }
  };
}

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

  const simPath = `${DB_FOLDER}${simdata.simdata}.gz`;
  const patPath = `${DB_FOLDER}${simdata.patterns}.gz`;

  try {
    await Promise.all([
      access(simPath, constants.F_OK),
      access(patPath, constants.F_OK)
    ]);
  } catch {
    return Response.json(
      { message: 'Simulation resource files not found on server.' },
      { status: 404 }
    );
  }

  const acceptEncoding = request.headers.get('accept-encoding');
  const mapCachePath = `${DB_FOLDER}${simdata.simdata}.map.json`;

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
    // Cache miss: fall through to streaming computation
  }

  // Cache miss: stream to client + write cache to disk
  const pap = await loadPapData(simdata.czone_id);
  const papArrays = pap?.arrays ?? { homes: [], places: [] };
  const homeIds = pap?.homeIds ?? [];
  const placeIds = pap?.placeIds ?? [];

  const headerStr = `{"data":{"name":${JSON.stringify(simdata.name)},"length":${simdata.length},"zone":${JSON.stringify(simdata.czone)}`;
  const papFragment = `,"papdata":${JSON.stringify(papArrays)}`;

  const encoder = new TextEncoder();
  const { signal } = request;

  const stream = new ReadableStream({
    async start(controller) {
      // Write cache to a temp file, then rename atomically to avoid races
      const tmpCachePath = `${mapCachePath}.tmp.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;
      const cacheStream = createWriteStream(tmpCachePath);

      try {
        // New-format cache: papdata first, then simdata
        cacheStream.write(papFragment);
        cacheStream.write(',"simdata":{');

        controller.enqueue(
          encoder.encode(`${headerStr}${papFragment},"simdata":{`)
        );

        let firstCache = true;
        let firstClient = true;
        const hotspots: Record<string, number[]> = {};
        const prevInfected: Record<string, number> = {};

        const simIter = (
          chain([
            createReadStream(simPath),
            createGunzip(),
            parser(),
            StreamObject.streamObject()
          ]) as any
        )[Symbol.asyncIterator]();

        const patIter = (
          chain([
            createReadStream(patPath),
            createGunzip(),
            parser(),
            StreamObject.streamObject()
          ]) as any
        )[Symbol.asyncIterator]();

        let spl = await simIter.next();
        let ppl = await patIter.next();

        while (!spl.done && !ppl.done) {
          // Abort early if the client disconnected
          if (signal.aborted) break;

          const skey: string = spl.value.key;
          const pkey: string = ppl.value.key;

          if (skey !== pkey) {
            if (+skey < +pkey) {
              spl = await simIter.next();
              continue;
            }
            ppl = await patIter.next();
            continue;
          }

          const svalue = spl.value.value;
          const pvalue = ppl.value.value;

          // Build infected Set incrementally
          const curinfected = new Set<string>();
          for (const people of Object.values(svalue)) {
            for (const key of Object.keys(
              people as Record<string, unknown>
            )) {
              curinfected.add(key);
            }
          }

          const homesArray: number[] = [];
          for (const hid of homeIds) {
            const pop: string[] | undefined = pvalue.homes[hid];
            if (pop) {
              let inf = 0;
              for (const v of pop) {
                if (curinfected.has(v)) inf++;
              }
              homesArray.push(pop.length, inf);
            } else {
              homesArray.push(0, 0);
            }
          }

          const placesArray: number[] = [];
          for (const pid of placeIds) {
            const pop: string[] | undefined = pvalue.places[pid];
            if (pop) {
              let inf = 0;
              for (const v of pop) {
                if (curinfected.has(v)) inf++;
              }
              placesArray.push(pop.length, inf);
              const prevInf = prevInfected[pid] || 0;
              if (inf > 0 && prevInf > 0 && inf >= prevInf * 5) {
                if (!hotspots[pid]) hotspots[pid] = [];
                hotspots[pid].push(Number(skey));
              }
              prevInfected[pid] = inf;
            } else {
              placesArray.push(0, 0);
              prevInfected[pid] = 0;
            }
          }

          const payload = JSON.stringify({
            h: homesArray,
            p: placesArray
          });
          const entryBody = `"${skey}":${payload}`;

          // Always write every entry to the cache (full dataset)
          if (!firstCache) cacheStream.write(',');
          firstCache = false;
          cacheStream.write(entryBody);

          // Only stream to client if within the requested range
          const step = Number(skey);
          if (!paginated || (step >= fromStep && step <= toStep)) {
            if (!signal.aborted) {
              if (!firstClient) controller.enqueue(encoder.encode(','));
              firstClient = false;
              controller.enqueue(encoder.encode(entryBody));
            }
          }

          spl = await simIter.next();
          ppl = await patIter.next();
        }

        const hotspotsTail = `},"hotspots":${JSON.stringify(hotspots)}`;

        if (!signal.aborted) {
          controller.enqueue(encoder.encode(`${hotspotsTail}}}`));
          controller.close();
        }

        if (signal.aborted) {
          // Incomplete computation, discard partial cache
          cacheStream.destroy();
          unlink(tmpCachePath).catch(() => {});
        } else {
          // Finalize cache: close stream, wait for flush, atomic rename
          cacheStream.write(hotspotsTail);
          await new Promise<void>((resolve, reject) => {
            cacheStream.on('error', reject);
            cacheStream.end(resolve);
          });
          await rename(tmpCachePath, mapCachePath);
        }
      } catch (e) {
        console.error('SimData stream error:', e);
        if (!signal.aborted) {
          try {
            controller.error(
              e instanceof Error ? e : new Error('Stream processing failed')
            );
          } catch {
            /* controller may already be errored/closed */
          }
        }

        // Clean up partial cache
        cacheStream.destroy();
        unlink(tmpCachePath).catch(() => {});
      }
    }
  });

  // Compress the streaming response if the client accepts gzip
  if (
    acceptEncoding?.includes('gzip') &&
    typeof CompressionStream !== 'undefined'
  ) {
    return new Response(stream.pipeThrough(new CompressionStream('gzip')), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Encoding': 'gzip',
        Vary: 'Accept-Encoding'
      }
    });
  }

  return new Response(stream, {
    headers: { 'Content-Type': 'application/json' }
  });
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
    return Response.json({ message: 'Authentication required' }, { status: 401 });
  }

  try {
    const existing = await prisma.simData.findUnique({
      where: { id },
      include: { czone: { select: { user_id: true } } }
    });

    if (!existing) {
      return Response.json({ message: `Could not find simdata #${id}` }, { status: 404 });
    }

    if (existing.czone.user_id !== session.user.id) {
      return Response.json({ message: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ message: parsed.error.message }, { status: 400 });
    }

    const { name } = parsed.data;
    const simdata = await prisma.simData.update({
      where: { id },
      data: { name }
    });
    return Response.json({ data: simdata });
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
    return Response.json({ message: 'Authentication required' }, { status: 401 });
  }

  try {
    const existing = await prisma.simData.findUnique({
      where: { id },
      include: { czone: { select: { user_id: true } } }
    });

    if (!existing) {
      return Response.json({ message: `Could not find simdata #${id}` }, { status: 404 });
    }

    if (existing.czone.user_id !== session.user.id) {
      return Response.json({ message: 'Forbidden' }, { status: 403 });
    }

    const simdata = await prisma.simData.delete({ where: { id } });

    // Clean up all files associated with this run
    const base = DB_FOLDER + simdata.simdata;
    await Promise.allSettled([
      unlink(`${base}.gz`),
      unlink(`${base}.map.json`),
      unlink(`${DB_FOLDER + simdata.patterns}.gz`)
    ]);

    return Response.json({ data: simdata });
  } catch {
    return Response.json(
      { message: `Could not find simdata #${id}` },
      { status: 404 }
    );
  }
}
