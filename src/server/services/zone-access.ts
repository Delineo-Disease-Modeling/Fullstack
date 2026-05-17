export const ANONYMOUS_ZONE_USER_EMAIL = 'anonymous-zones@delineo.local';

type ZoneAccessRecord = {
  user_id: string;
  guest_claim_token_hash?: string | null;
};

export function canReadConvenienceZone(
  zone: ZoneAccessRecord,
  userId: string | null,
  guestClaimTokenHashes: string[] = []
) {
  if (userId && zone.user_id === userId) {
    return true;
  }

  return (
    !!zone.guest_claim_token_hash &&
    guestClaimTokenHashes.includes(zone.guest_claim_token_hash)
  );
}

export function zoneAccessDenied(userId: string | null) {
  return userId
    ? { ok: false as const, message: 'Forbidden', status: 403 }
    : { ok: false as const, message: 'Authentication required', status: 401 };
}
