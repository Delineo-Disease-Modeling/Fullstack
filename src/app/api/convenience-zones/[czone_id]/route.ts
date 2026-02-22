import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';

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
    return Response.json({ data: zone });
  } catch (error) {
    return Response.json({ message: String(error) }, { status: 400 });
  }
}
