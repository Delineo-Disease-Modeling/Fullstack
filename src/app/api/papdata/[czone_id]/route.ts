import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCachedPapdata } from '@/lib/papdata-cache';

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

  if (!czone?.papdata_id) {
    return Response.json(
      { message: 'Could not find papdata' },
      { status: 404 }
    );
  }

  let json: any;
  try {
    json = await getCachedPapdata(czone.papdata_id);
  } catch {
    return Response.json(
      { message: 'Papdata file not found' },
      { status: 404 }
    );
  }

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
