import type { NextRequest } from 'next/server';
import { jsonMessage, serviceResult } from '@/server/api/responses';
import { parseNonNegativeRouteNumber } from '@/server/api/route-params';
import { getSessionUserId } from '@/server/api/session';
import { getGuestZoneClaimTokenHashesFromHeaders } from '@/server/services/guest-zone-claims';
import { listSimDataCacheForZone } from '@/server/services/simdata-cache';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ czone_id: string }> }
) {
  const { czone_id: czone_id_raw } = await params;
  const czoneId = parseNonNegativeRouteNumber(czone_id_raw, 'czone_id');
  if (!czoneId.ok) {
    return jsonMessage(czoneId.message, czoneId.status);
  }

  const userId = await getSessionUserId(request.headers);
  const guestClaimTokenHashes = getGuestZoneClaimTokenHashesFromHeaders(
    request.headers
  );
  const result = await listSimDataCacheForZone(
    czoneId.value,
    userId,
    guestClaimTokenHashes
  );
  return serviceResult(result);
}
