import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { jsonMessage } from '@/server/api/responses';
import { parseNonNegativeRouteNumber } from '@/server/api/route-params';

// Mark a run as saved (kept) or unsaved, and optionally rename it.
// Intentionally public — matching the shared zone model, guests can keep a run
// they ran on any zone. (Destructive ops stay owner-gated on the parent route.)
const saveSchema = z.object({
  saved: z.boolean().optional(),
  name: z.string().trim().min(2).max(120).optional()
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: idRaw } = await params;
  const id = parseNonNegativeRouteNumber(idRaw, 'id');
  if (!id.ok) {
    return jsonMessage(id.message, id.status);
  }

  const body = await request.json().catch(() => null);
  const parsed = saveSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return jsonMessage(parsed.error.message, 400);
  }

  const { saved, name } = parsed.data;
  if (saved === undefined && name === undefined) {
    return jsonMessage('Nothing to update', 400);
  }

  const existing = await prisma.simData.findUnique({
    where: { id: id.value },
    select: { id: true }
  });
  if (!existing) {
    return jsonMessage(`Could not find simdata #${id.value}`, 404);
  }

  const updated = await prisma.simData.update({
    where: { id: id.value },
    data: {
      ...(saved !== undefined ? { saved } : {}),
      ...(name !== undefined ? { name } : {})
    },
    select: { id: true, name: true, saved: true }
  });

  return Response.json({ data: updated });
}
