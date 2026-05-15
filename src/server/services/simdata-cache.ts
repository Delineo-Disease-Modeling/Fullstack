import type { SimData } from '@/generated/prisma/client';
import { prisma } from '@/lib/prisma';
import type { ServiceResult } from '@/server/api/responses';

type SimDataCacheEntry = {
  name: SimData['name'];
  created_at: SimData['created_at'];
  sim_id: SimData['id'];
};

export async function listSimDataCacheForZone(
  czoneId: number
): Promise<ServiceResult<SimDataCacheEntry[]>> {
  const czone = await prisma.convenienceZone.findUnique({
    where: { id: czoneId },
    include: { simdata: { orderBy: { id: 'desc' } } }
  });

  if (!czone) {
    return {
      ok: false,
      message: `Could not find convenience zone #${czoneId}`,
      status: 404
    };
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
