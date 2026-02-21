import { constants, createReadStream } from 'fs';
import { access, readFile, unlink, writeFile } from 'fs/promises';
import type { NextRequest } from 'next/server';
import chain from 'stream-chain';
import parser from 'stream-json';
import StreamObject from 'stream-json/streamers/StreamObject.js';
import { createGunzip } from 'zlib';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';

const DB_FOLDER = process.env.DB_FOLDER || './db/';

const updateSchema = z.object({
  name: z.string().min(2).optional()
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: id_raw } = await params;
  const id = Number(id_raw);

  if (isNaN(id) || id < 0) {
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

  const simPath = DB_FOLDER + simdata.simdata + '.gz';
  const patPath = DB_FOLDER + simdata.patterns + '.gz';

  let optimizedPapData: any = null;

  try {
    await Promise.all([
      access(simPath, constants.F_OK),
      access(patPath, constants.F_OK)
    ]);

    const papdata_obj = await prisma.paPData.findUnique({
      where: { czone_id: simdata.czone_id }
    });

    if (papdata_obj) {
      const papPath = DB_FOLDER + papdata_obj.id + '.gz';
      try {
        await access(papPath, constants.F_OK);
        const raw = await readFile(papPath);
        const buffer = await new Promise<Buffer>((resolve, reject) => {
          const unzip = createGunzip();
          const chunks: any[] = [];
          unzip.on('data', (c) => chunks.push(c));
          unzip.on('end', () => resolve(Buffer.concat(chunks)));
          unzip.on('error', reject);
          unzip.end(raw);
        });

        const json = JSON.parse(buffer.toString());
        optimizedPapData = { homes: {}, places: {} };

        for (const [id] of Object.entries(json['homes'])) {
          optimizedPapData['homes'][id] = {};
        }
        for (const [id, val] of Object.entries(json['places']) as any) {
          optimizedPapData['places'][id] = {
            id,
            latitude: val['latitude'],
            longitude: val['longitude'],
            label: val['label'],
            top_category: val['top_category']
          };
        }
      } catch (e) {
        console.error('Failed to load/optimize papdata for embedding', e);
      }
    }
  } catch {
    return Response.json(
      { message: 'Simulation resource files not found on server.' },
      { status: 404 }
    );
  }

  const encoder = new TextEncoder();
  const safePap = optimizedPapData || { homes: {}, places: {} };

  const homeIds = Object.keys(safePap.homes).sort(
    (a, b) => Number(a) - Number(b)
  );
  const placeIds = Object.keys(safePap.places).sort(
    (a, b) => Number(a) - Number(b)
  );

  const papDataArrays = {
    homes: homeIds.map((id) => ({ id, ...safePap.homes[id] })),
    places: placeIds.map((id) => safePap.places[id])
  };

  // The header contains fields that may change (name) or are cheap to fetch
  // (zone, papdata). The expensive simdata+hotspots computation is cached.
  const headerStr = `{"data":{"name":${JSON.stringify(simdata.name)},"length":${simdata.length},"zone":${JSON.stringify(simdata.czone)},"papdata":${JSON.stringify(papDataArrays)}`;
  const mapCachePath = DB_FOLDER + simdata.simdata + '.map.json';

  // --- Cache hit: read file atomically and return combined response ---
  try {
    const cacheData = await readFile(mapCachePath);
    const body = Buffer.concat([
      Buffer.from(headerStr, 'utf8'),
      cacheData,
      Buffer.from('}}', 'utf8')
    ]);
    return new Response(body, {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (e: any) {
    if (e?.code !== 'ENOENT') {
      console.error('Map cache read error:', e);
    }
    // Cache miss — fall through to full computation below
  }

  // --- Cache miss: compute, stream to client, and save cache for next time ---
  const stream = new ReadableStream({
    async start(controller) {
      try {
        controller.enqueue(encoder.encode(headerStr + ',"simdata":{'));

        let first = true;
        const hotspots: { [key: string]: number[] } = {};
        const prevInfected: { [key: string]: number } = {};

        // cacheParts accumulates the fragment written to .map.json:
        //   ,"simdata":{...entries...},"hotspots":{...}
        const cacheParts: string[] = [',"simdata":{'];

        const simdatapl = chain([
          createReadStream(simPath),
          createGunzip(),
          parser(),
          StreamObject.streamObject()
        ]);
        const patternspl = chain([
          createReadStream(patPath),
          createGunzip(),
          parser(),
          StreamObject.streamObject()
        ]);

        const simIter = (simdatapl as any)[Symbol.asyncIterator]();
        const patIter = (patternspl as any)[Symbol.asyncIterator]();

        let spl = await simIter.next();
        let ppl = await patIter.next();

        while (!spl.done && !ppl.done) {
          const skey = spl.value.key;
          const pkey = ppl.value.key;

          if (skey !== pkey) {
            if (+skey < +pkey) {
              spl = await simIter.next();
              continue;
            } else {
              ppl = await patIter.next();
              continue;
            }
          }

          if (!first) {
            controller.enqueue(encoder.encode(','));
            cacheParts.push(',');
          }
          first = false;

          const svalue = spl.value.value;
          const pvalue = ppl.value.value;

          const curinfected = new Set(
            Object.values(svalue).flatMap((people) =>
              Object.keys(people as any)
            )
          );

          const homesArray: number[] = [];
          const placesArray: number[] = [];

          for (const id of homeIds) {
            const pop = pvalue['homes'][id];
            if (pop) {
              homesArray.push(
                pop.length,
                pop.filter((v: any) => curinfected.has(v)).length
              );
            } else {
              homesArray.push(0, 0);
            }
          }

          for (const id of placeIds) {
            const pop = pvalue['places'][id];
            if (pop) {
              const len = pop.length;
              const infCount = pop.filter((v: any) =>
                curinfected.has(v)
              ).length;
              placesArray.push(len, infCount);
              const prevInf = prevInfected[id] || 0;
              if (infCount > 0 && prevInf > 0 && infCount >= prevInf * 5) {
                if (!hotspots[id]) hotspots[id] = [];
                hotspots[id].push(Number(skey));
              }
              prevInfected[id] = infCount;
            } else {
              placesArray.push(0, 0);
              prevInfected[id] = 0;
            }
          }

          const entry = `"${skey}":${JSON.stringify({ h: homesArray, p: placesArray })}`;
          controller.enqueue(encoder.encode(entry));
          cacheParts.push(entry);

          spl = await simIter.next();
          ppl = await patIter.next();
        }

        const tail = `},"hotspots":${JSON.stringify(hotspots)}`;
        controller.enqueue(encoder.encode(tail + '}}'));
        cacheParts.push(tail);

        controller.close();

        // Save cache in background — does not affect the already-sent response
        writeFile(mapCachePath, cacheParts.join('')).catch((e) =>
          console.error('Map cache write failed:', e)
        );
      } catch (e) {
        console.error('SimData stream error:', e);
        try { controller.close(); } catch {}
      }
    }
  });

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

  if (isNaN(id) || id < 0) {
    return Response.json({ message: 'Invalid id' }, { status: 400 });
  }

  try {
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
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: id_raw } = await params;
  const id = Number(id_raw);

  if (isNaN(id) || id < 0) {
    return Response.json({ message: 'Invalid id' }, { status: 400 });
  }

  try {
    const simdata = await prisma.simData.delete({ where: { id } });

    // Clean up all files associated with this run
    const base = DB_FOLDER + simdata.simdata;
    await Promise.allSettled([
      unlink(base + '.gz'),
      unlink(base + '.stats.json'),
      unlink(base + '.map.json'),
      unlink(DB_FOLDER + simdata.patterns + '.gz')
    ]);

    return Response.json({ data: simdata });
  } catch {
    return Response.json(
      { message: `Could not find simdata #${id}` },
      { status: 404 }
    );
  }
}
