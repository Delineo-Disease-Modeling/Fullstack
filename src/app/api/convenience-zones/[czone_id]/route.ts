import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { broadcast } from '@/lib/sse-broadcast';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ czone_id: string }> }
) {
  const { czone_id } = await params;
  const id = Number(czone_id);

  if (Number.isNaN(id) || id < 0) {
    return Response.json({ message: 'Invalid czone_id' }, { status: 400 });
  }

  try {
    const zone = await prisma.convenienceZone.findUnique({ where: { id } });
    if (!zone) {
      return Response.json({ message: 'Not found' }, { status: 404 });
    }
    return Response.json({
      data: { ...zone, ready: !!zone.papdata_id },
    });
  } catch (error) {
    return Response.json({ message: String(error) }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ czone_id: string }> }
) {
  const { czone_id } = await params;
  const id = Number(czone_id);

  if (Number.isNaN(id) || id < 0) {
    return Response.json({ message: 'Invalid czone_id' }, { status: 400 });
  }

  const body = await request.json();
  const data: { name?: string; description?: string } = {};
  if (typeof body.name === 'string') data.name = body.name;
  if (typeof body.description === 'string') data.description = body.description;

  if (Object.keys(data).length === 0) {
    return Response.json({ message: 'No valid fields to update' }, { status: 400 });
  }

  try {
    const zone = await prisma.convenienceZone.update({
      where: { id },
      data,
    });
    broadcast({ type: 'zone-updated', zone_id: zone.id });
    return Response.json({
      data: { ...zone, ready: !!zone.papdata_id },
    });
  } catch (error) {
    return Response.json({ message: String(error) }, { status: 400 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ czone_id: string }> }
) {
  const { czone_id } = await params;
  const id = Number(czone_id);

  if (Number.isNaN(id) || id < 0) {
    return Response.json({ message: 'Invalid czone_id' }, { status: 400 });
  }

  try {
    const zone = await prisma.convenienceZone.delete({ where: { id } });
    broadcast({ type: 'zone-deleted', zone_id: zone.id });
    return Response.json({ data: zone });
  } catch (error) {
    return Response.json({ message: String(error) }, { status: 400 });
  }
}
