import { z } from 'zod';
import type { ConvenienceZone } from '@/generated/prisma/client';
import { invalidatePapdata } from '@/lib/papdata-cache';
import { prisma } from '@/lib/prisma';
import { broadcast } from '@/lib/sse-broadcast';
import type { ServiceResult } from '@/server/api/responses';

export const createConvenienceZoneSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  latitude: z.number(),
  longitude: z.number(),
  cbg_list: z.array(z.string()),
  start_date: z.string().datetime(),
  length: z.number().nonnegative(),
  size: z.number().nonnegative(),
  user_id: z.string().min(1).nullable().optional()
});

export type CreateConvenienceZoneInput = z.infer<
  typeof createConvenienceZoneSchema
>;

export type ConvenienceZoneWithReady = ConvenienceZone & {
  ready: boolean;
};

type ConvenienceZoneUpdateData = {
  name?: string;
  description?: string;
};

const ANONYMOUS_ZONE_USER_EMAIL = 'anonymous-zones@delineo.local';

function withReady(zone: ConvenienceZone): ConvenienceZoneWithReady {
  return {
    ...zone,
    ready: !!zone.papdata_id
  };
}

async function getAnonymousZoneUserId() {
  const user = await prisma.user.upsert({
    where: { email: ANONYMOUS_ZONE_USER_EMAIL },
    update: {},
    create: {
      name: 'Anonymous Zone User',
      email: ANONYMOUS_ZONE_USER_EMAIL,
      organization: 'Delineo'
    },
    select: { id: true }
  });

  return user.id;
}

export async function listConvenienceZones(
  userId: string | null
): Promise<ConvenienceZoneWithReady[]> {
  const zones = await prisma.convenienceZone.findMany(
    userId ? { where: { user_id: userId } } : undefined
  );

  return zones.map(withReady);
}

export async function createConvenienceZone(
  input: CreateConvenienceZoneInput,
  sessionUserId: string | null
): Promise<ServiceResult<ConvenienceZone>> {
  const {
    name,
    description,
    latitude,
    longitude,
    cbg_list,
    start_date,
    length,
    size,
    user_id: bodyUserId
  } = input;

  if (sessionUserId && bodyUserId && bodyUserId !== sessionUserId) {
    return {
      ok: false,
      message: 'Authenticated user does not match request user_id.',
      status: 403
    };
  }

  const requestedUserId = sessionUserId ?? bodyUserId ?? null;

  if (requestedUserId && !sessionUserId) {
    const existingUser = await prisma.user.findUnique({
      where: { id: requestedUserId },
      select: { id: true }
    });

    if (!existingUser) {
      return {
        ok: false,
        message:
          'Authentication required. Please log in again before creating a convenience zone.',
        status: 401
      };
    }
  }

  const user_id = requestedUserId ?? (await getAnonymousZoneUserId());

  const zone = await prisma.convenienceZone.create({
    data: {
      name,
      description,
      latitude,
      longitude,
      cbg_list,
      start_date,
      length,
      size,
      user_id
    }
  });

  broadcast({ type: 'zone-created', zone_id: zone.id });
  return { ok: true, data: zone };
}

export async function getConvenienceZone(
  id: number
): Promise<ServiceResult<ConvenienceZoneWithReady>> {
  try {
    const zone = await prisma.convenienceZone.findUnique({ where: { id } });
    if (!zone) {
      return { ok: false, message: 'Not found', status: 404 };
    }

    return { ok: true, data: withReady(zone) };
  } catch (error) {
    return { ok: false, message: String(error), status: 500 };
  }
}

export function getConvenienceZoneUpdateData(body: {
  name?: unknown;
  description?: unknown;
}): ConvenienceZoneUpdateData {
  const data: ConvenienceZoneUpdateData = {};
  if (typeof body.name === 'string') {
    data.name = body.name;
  }
  if (typeof body.description === 'string') {
    data.description = body.description;
  }
  return data;
}

export async function updateConvenienceZone(
  id: number,
  userId: string,
  data: ConvenienceZoneUpdateData
): Promise<ServiceResult<ConvenienceZoneWithReady>> {
  try {
    const existing = await prisma.convenienceZone.findUnique({ where: { id } });
    if (!existing) {
      return { ok: false, message: 'Not found', status: 404 };
    }
    if (existing.user_id !== userId) {
      return { ok: false, message: 'Forbidden', status: 403 };
    }

    const zone = await prisma.convenienceZone.update({
      where: { id },
      data
    });
    broadcast({ type: 'zone-updated', zone_id: zone.id });
    return { ok: true, data: withReady(zone) };
  } catch (error) {
    return { ok: false, message: String(error), status: 400 };
  }
}

export async function deleteConvenienceZone(
  id: number,
  userId: string
): Promise<ServiceResult<ConvenienceZone>> {
  try {
    const existing = await prisma.convenienceZone.findUnique({ where: { id } });
    if (!existing) {
      return { ok: false, message: 'Not found', status: 404 };
    }
    if (existing.user_id !== userId) {
      return { ok: false, message: 'Forbidden', status: 403 };
    }

    const zone = await prisma.convenienceZone.delete({ where: { id } });
    if (zone.papdata_id) {
      invalidatePapdata(zone.papdata_id);
    }
    broadcast({ type: 'zone-deleted', zone_id: zone.id });
    return { ok: true, data: zone };
  } catch (error) {
    return { ok: false, message: String(error), status: 400 };
  }
}
