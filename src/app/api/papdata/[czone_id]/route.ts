import { constants, createReadStream } from 'node:fs';
import { access } from 'node:fs/promises';
import { createGunzip } from 'node:zlib';
import type { NextRequest } from 'next/server';
import chain from 'stream-chain';
import { prisma } from '@/lib/prisma';

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

  const papdata_obj = await prisma.paPData.findUnique({ where: { czone_id } });

  if (!papdata_obj) {
    return Response.json(
      { message: 'Could not find papdata' },
      { status: 404 }
    );
  }

  const papPath = `${DB_FOLDER + papdata_obj.id}.gz`;

  try {
    await access(papPath, constants.F_OK);
  } catch {
    return Response.json(
      { message: 'Papdata file not found' },
      { status: 404 }
    );
  }

  const papdata_stream = chain([createReadStream(papPath), createGunzip()]);

  let data = '';
  for await (const chunk of papdata_stream) {
    data += chunk;
  }

  const json = JSON.parse(data);
  const filtered: any = { homes: {}, places: {} };

  for (const [id] of Object.entries(json.homes)) {
    filtered.homes[id] = {};
  }

  for (const [id, val] of Object.entries(json.places) as any) {
    filtered.places[id] = {
      id,
      latitude: val.latitude,
      longitude: val.longitude,
      label: val.label,
      top_category: val.top_category
    };
  }

  return Response.json({ data: filtered });
}
