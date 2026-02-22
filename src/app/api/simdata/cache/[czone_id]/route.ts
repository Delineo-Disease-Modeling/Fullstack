import type { NextRequest } from 'next/server';
import type { SimData } from '@/generated/prisma/client';
import { prisma } from '@/lib/prisma';

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
    where: { id: czone_id },
    include: { simdata: { orderBy: { id: 'desc' } } }
  });

  if (!czone) {
    return Response.json(
      { message: `Could not find convenience zone #${czone_id}` },
      { status: 404 }
    );
  }

  return Response.json({
    data: czone.simdata.map((simdata: SimData) => ({
      name: simdata.name,
      created_at: simdata.created_at,
      sim_id: simdata.id
    }))
  });
}
