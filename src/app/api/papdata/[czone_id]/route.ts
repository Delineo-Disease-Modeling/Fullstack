import type { NextRequest } from 'next/server';
import { jsonMessage, serviceResult } from '@/server/api/responses';
import { parseNonNegativeRouteNumber } from '@/server/api/route-params';
import { getFilteredPapDataForZone } from '@/server/services/papdata';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ czone_id: string }> }
) {
  const { czone_id: czone_id_raw } = await params;
  const czoneId = parseNonNegativeRouteNumber(czone_id_raw, 'czone_id');
  if (!czoneId.ok) {
    return jsonMessage(czoneId.message, czoneId.status);
  }

  const result = await getFilteredPapDataForZone(czoneId.value);
  return serviceResult(result);
}
