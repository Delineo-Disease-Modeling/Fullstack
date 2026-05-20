import type { NextRequest } from 'next/server';
import {
  badRequest,
  jsonData,
  jsonMessage,
  serviceResult
} from '@/server/api/responses';
import { getSessionUserId } from '@/server/api/session';
import { getGuestZoneClaimTokenHashesFromHeaders } from '@/server/services/guest-zone-claims';
import {
  createConvenienceZone,
  createConvenienceZoneSchema,
  listAllConvenienceZones,
  listConvenienceZones
} from '@/server/services/convenience-zones';

export async function GET(request: NextRequest) {
  if (request.nextUrl.searchParams.get('all') === 'true') {
    const zones = await listAllConvenienceZones();
    return jsonData(zones);
  }

  const userId = await getSessionUserId(request.headers);
  const guestClaimTokenHashes = getGuestZoneClaimTokenHashesFromHeaders(
    request.headers
  );
  const zones = await listConvenienceZones(userId, guestClaimTokenHashes);
  return jsonData(zones);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = createConvenienceZoneSchema.safeParse(body);

    if (!parsed.success) {
      return badRequest(parsed.error.message);
    }

    const sessionUserId = await getSessionUserId(request.headers);
    const result = await createConvenienceZone(parsed.data, sessionUserId);
    return serviceResult(result);
  } catch {
    return jsonMessage('Internal server error', 500);
  }
}
