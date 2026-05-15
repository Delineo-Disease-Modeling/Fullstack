import { getCachedPapdata } from '@/lib/papdata-cache';
import { prisma } from '@/lib/prisma';
import type { FilteredPapData, PapData } from '@/lib/simulation-data';
import type { ServiceResult } from '@/server/api/responses';

export function filterPapData(papdata: PapData): FilteredPapData {
  const filtered: FilteredPapData = { homes: {}, places: {} };

  for (const [id] of Object.entries(papdata.homes)) {
    filtered.homes[id] = {};
  }

  for (const [id, val] of Object.entries(papdata.places)) {
    filtered.places[id] = {
      id,
      latitude: val.latitude,
      longitude: val.longitude,
      label: val.label,
      top_category: val.top_category
    };
  }

  return filtered;
}

export async function getFilteredPapDataForZone(
  czoneId: number
): Promise<ServiceResult<FilteredPapData>> {
  const czone = await prisma.convenienceZone.findUnique({
    where: { id: czoneId }
  });

  if (!czone?.papdata_id) {
    return { ok: false, message: 'Could not find papdata', status: 404 };
  }

  try {
    const papdata = await getCachedPapdata(czone.papdata_id);
    return { ok: true, data: filterPapData(papdata) };
  } catch {
    return { ok: false, message: 'Papdata file not found', status: 404 };
  }
}
