import { createHash } from 'node:crypto';
import { z } from 'zod';

export const GUEST_ZONE_CLAIMS_HEADER = 'x-delineo-guest-zone-claims';

const guestZoneClaimTokenSchema = z.string().min(16).max(256);

export const guestZoneClaimTokensSchema = z
  .array(guestZoneClaimTokenSchema)
  .max(100);

export const claimGuestZonesSchema = z.object({
  claim_tokens: guestZoneClaimTokensSchema
});

export function hashGuestZoneClaimToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export function getGuestZoneClaimTokenHashesFromHeaders(headers: Headers) {
  const rawHeader = headers.get(GUEST_ZONE_CLAIMS_HEADER);
  if (!rawHeader) {
    return [];
  }

  const parsed = guestZoneClaimTokensSchema.safeParse(
    rawHeader
      .split(',')
      .map((token) => token.trim())
      .filter(Boolean)
  );

  if (!parsed.success) {
    return [];
  }

  return parsed.data.map(hashGuestZoneClaimToken);
}
