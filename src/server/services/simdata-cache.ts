import type { SimData } from '@/generated/prisma/client';
import { prisma } from '@/lib/prisma';
import type { ServiceResult } from '@/server/api/responses';
import { canReadConvenienceZone, zoneAccessDenied } from './zone-access';

type SimDataCacheEntry = {
  name: SimData['name'];
  created_at: SimData['created_at'];
  sim_id: SimData['id'];
};

export async function listSimDataCacheForZone(
  czoneId: number,
  userId: string | null
): Promise<ServiceResult<SimDataCacheEntry[]>> {
  const czone = await prisma.convenienceZone.findUnique({
    where: { id: czoneId },
    include: {
      user: { select: { email: true } },
      simdata: { orderBy: { id: 'desc' } }
    }
  });

  if (!czone) {
    return {
      ok: false,
      message: `Could not find convenience zone #${czoneId}`,
      status: 404
    };
  }
  if (!canReadConvenienceZone(czone, userId)) {
    return zoneAccessDenied(userId);
  }

  return {
    ok: true,
    data: czone.simdata.map((simdata: SimData) => ({
      name: simdata.name,
      created_at: simdata.created_at,
      sim_id: simdata.id
    }))
  };
}
