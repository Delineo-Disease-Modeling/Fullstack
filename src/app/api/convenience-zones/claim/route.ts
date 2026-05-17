import type { NextRequest } from 'next/server';
import {
  badRequest,
  jsonMessage,
  serviceResult
} from '@/server/api/responses';
import { requireSessionUserId } from '@/server/api/session';
import { claimGuestZonesSchema } from '@/server/services/guest-zone-claims';
import { claimGuestConvenienceZones } from '@/server/services/convenience-zones';

export async function POST(request: NextRequest) {
  const session = await requireSessionUserId(request.headers);
  if (!session.ok) {
    return session.response;
  }

  try {
    const body = await request.json();
    const parsed = claimGuestZonesSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest(parsed.error.message);
    }

    const result = await claimGuestConvenienceZones(
      parsed.data.claim_tokens,
      session.userId
    );
    return serviceResult(result);
  } catch {
    return jsonMessage('Internal server error', 500);
  }
}
