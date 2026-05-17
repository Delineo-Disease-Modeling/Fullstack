export const ANONYMOUS_ZONE_USER_EMAIL = 'anonymous-zones@delineo.local';

type ZoneAccessRecord = {
  user_id: string;
  user?: { email: string | null } | null;
};

export function canReadConvenienceZone(
  zone: ZoneAccessRecord,
  userId: string | null
) {
  if (zone.user?.email === ANONYMOUS_ZONE_USER_EMAIL) {
    return true;
  }

  return !!userId && zone.user_id === userId;
}

export function zoneAccessDenied(userId: string | null) {
  return userId
    ? { ok: false as const, message: 'Forbidden', status: 403 }
    : { ok: false as const, message: 'Authentication required', status: 401 };
}
