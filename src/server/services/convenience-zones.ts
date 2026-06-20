import { unlink } from 'node:fs/promises';
import { z } from 'zod';
import type { ConvenienceZone } from '@/generated/prisma/client';
import { DB_FOLDER } from '@/lib/db-files';
import { invalidatePapdata } from '@/lib/papdata-cache';
import { prisma } from '@/lib/prisma';
import { broadcast } from '@/lib/sse-broadcast';
import type { ServiceResult } from '@/server/api/responses';
import {
  hashGuestZoneClaimToken,
  guestZoneClaimTokensSchema
} from './guest-zone-claims';
import { ANONYMOUS_ZONE_USER_EMAIL } from './zone-access';

export const createConvenienceZoneSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  latitude: z.number(),
  longitude: z.number(),
  cbg_list: z.array(z.string()),
  start_date: z.string().datetime(),
  length: z.number().nonnegative(),
  size: z.number().nonnegative(),
  user_id: z.string().min(1).nullable().optional(),
  guest_claim_token: z.string().min(16).max(256).nullable().optional()
});

export type CreateConvenienceZoneInput = z.infer<
  typeof createConvenienceZoneSchema
>;

type PublicConvenienceZone = Omit<ConvenienceZone, 'guest_claim_token_hash'>;

export type ConvenienceZoneWithReady = PublicConvenienceZone & {
  ready: boolean;
};

type ConvenienceZoneUpdateData = {
  name?: string;
  description?: string;
};

function toPublicZone(zone: ConvenienceZone): PublicConvenienceZone {
  const { guest_claim_token_hash: _claimHash, ...publicZone } = zone;
  return publicZone;
}

function withReady(zone: ConvenienceZone): ConvenienceZoneWithReady {
  return {
    ...toPublicZone(zone),
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
  userId: string | null,
  guestClaimTokenHashes: string[] = []
): Promise<ConvenienceZoneWithReady[]> {
  if (!userId) {
    if (guestClaimTokenHashes.length === 0) {
      return [];
    }

    const zones = await prisma.convenienceZone.findMany({
      where: { guest_claim_token_hash: { in: guestClaimTokenHashes } }
    });

    return zones.map(withReady);
  }

  const zones = await prisma.convenienceZone.findMany({
    where: { user_id: userId }
  });

  return zones.map(withReady);
}

export async function listAllConvenienceZones(): Promise<ConvenienceZoneWithReady[]> {
  const zones = await prisma.convenienceZone.findMany({
    orderBy: { created_at: 'desc' }
  });
  return zones.map(withReady);
}

export async function createConvenienceZone(
  input: CreateConvenienceZoneInput,
  sessionUserId: string | null
): Promise<ServiceResult<ConvenienceZoneWithReady>> {
  const {
    name,
    description,
    latitude,
    longitude,
    cbg_list,
    start_date,
    length,
    size,
    user_id: bodyUserId,
    guest_claim_token: guestClaimToken
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
  const guest_claim_token_hash =
    requestedUserId || !guestClaimToken
      ? null
      : hashGuestZoneClaimToken(guestClaimToken);

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
      user_id,
      guest_claim_token_hash
    }
  });

  broadcast({ type: 'zone-created', zone_id: zone.id });
  return { ok: true, data: withReady(zone) };
}

// Zones are publicly readable so guests can open and run any zone, including
// ones they don't own. Ownership is enforced only on mutations (PATCH/DELETE).
export async function getConvenienceZone(
  id: number
): Promise<ServiceResult<ConvenienceZoneWithReady>> {
  try {
    const zone = await prisma.convenienceZone.findUnique({
      where: { id }
    });
    if (!zone) {
      return { ok: false, message: 'Not found', status: 404 };
    }

    return { ok: true, data: withReady(zone) };
  } catch (error) {
    return { ok: false, message: String(error), status: 500 };
  }
}

export async function claimGuestConvenienceZones(
  claimTokens: string[],
  userId: string
): Promise<ServiceResult<{ claimed_zone_ids: number[] }>> {
  const parsed = guestZoneClaimTokensSchema.safeParse(claimTokens);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.message, status: 400 };
  }

  const tokenHashes = parsed.data.map(hashGuestZoneClaimToken);
  if (tokenHashes.length === 0) {
    return { ok: true, data: { claimed_zone_ids: [] } };
  }

  const zones = await prisma.convenienceZone.findMany({
    where: { guest_claim_token_hash: { in: tokenHashes } },
    select: { id: true }
  });
  const zoneIds = zones.map((zone) => zone.id);

  if (zoneIds.length === 0) {
    return { ok: true, data: { claimed_zone_ids: [] } };
  }

  await prisma.convenienceZone.updateMany({
    where: { id: { in: zoneIds } },
    data: {
      user_id: userId,
      guest_claim_token_hash: null
    }
  });

  for (const zoneId of zoneIds) {
    broadcast({ type: 'zone-updated', zone_id: zoneId });
  }

  return { ok: true, data: { claimed_zone_ids: zoneIds } };
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

// Per-run file variants + the zone's papdata/patterns files, removed on disk
// after the DB cascade deletes the run rows.
const RUN_FILE_SUFFIXES = [
  '.sim',
  '.sim.gz',
  '.pat',
  '.pat.gz',
  '.map.json',
  '.dots.json'
];

async function deleteZoneFiles(
  zone: Pick<ConvenienceZone, 'papdata_id' | 'patterns_id'>,
  runFileIds: string[]
) {
  const paths: string[] = [];
  for (const fileId of runFileIds) {
    for (const suffix of RUN_FILE_SUFFIXES) {
      paths.push(`${DB_FOLDER}${fileId}${suffix}`);
    }
  }
  if (zone.papdata_id) paths.push(`${DB_FOLDER}${zone.papdata_id}.gz`);
  if (zone.patterns_id) {
    paths.push(`${DB_FOLDER}${zone.patterns_id}.gz`);
    paths.push(`${DB_FOLDER}${zone.patterns_id}.bin`);
  }
  await Promise.allSettled(paths.map((p) => unlink(p)));
}

export async function deleteConvenienceZone(
  id: number,
  userId: string,
  isAdmin = false
): Promise<ServiceResult<ConvenienceZone>> {
  try {
    const existing = await prisma.convenienceZone.findUnique({ where: { id } });
    if (!existing) {
      return { ok: false, message: 'Not found', status: 404 };
    }
    if (existing.user_id !== userId && !isAdmin) {
      return { ok: false, message: 'Forbidden', status: 403 };
    }

    // Collect run file ids BEFORE the delete cascades the run rows away.
    const runs = await prisma.simData.findMany({
      where: { czone_id: id },
      select: { file_id: true }
    });

    const zone = await prisma.convenienceZone.delete({ where: { id } });
    await deleteZoneFiles(zone, runs.map((r) => r.file_id));
    if (zone.papdata_id) {
      invalidatePapdata(zone.papdata_id);
    }
    broadcast({ type: 'zone-deleted', zone_id: zone.id });
    return { ok: true, data: zone };
  } catch (error) {
    return { ok: false, message: String(error), status: 400 };
  }
}
