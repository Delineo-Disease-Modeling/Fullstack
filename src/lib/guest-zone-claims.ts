'use client';

const STORAGE_KEY = 'delineo-guest-zone-claims';
const GUEST_ZONE_CLAIMS_HEADER = 'X-Delineo-Guest-Zone-Claims';

type GuestZoneClaim = {
  zoneId: number;
  token: string;
  createdAt: string;
};

function readClaims(): GuestZoneClaim[] {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const parsed = JSON.parse(
      window.sessionStorage.getItem(STORAGE_KEY) || '[]'
    );
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(
      (claim): claim is GuestZoneClaim =>
        typeof claim === 'object' &&
        claim !== null &&
        Number.isFinite(Number(claim.zoneId)) &&
        typeof claim.token === 'string' &&
        typeof claim.createdAt === 'string'
    );
  } catch {
    return [];
  }
}

function writeClaims(claims: GuestZoneClaim[]) {
  if (typeof window === 'undefined') {
    return;
  }

  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(claims.slice(-100)));
  window.dispatchEvent(new Event('delineo:guest-zone-claims-changed'));
}

function randomTokenBytes() {
  const bytes = new Uint8Array(32);
  window.crypto.getRandomValues(bytes);
  return bytes;
}

function base64UrlEncode(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return window
    .btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

export function createGuestZoneClaimToken() {
  if (
    typeof window !== 'undefined' &&
    window.crypto &&
    'getRandomValues' in window.crypto
  ) {
    return base64UrlEncode(randomTokenBytes());
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function rememberGuestZoneClaim(zoneId: number, token: string) {
  const claims = readClaims().filter((claim) => claim.zoneId !== zoneId);
  claims.push({
    zoneId,
    token,
    createdAt: new Date().toISOString()
  });
  writeClaims(claims);
}

export function getGuestZoneClaimTokens() {
  return readClaims().map((claim) => claim.token);
}

export function getGuestZoneClaimHeaders(): HeadersInit {
  const tokens = getGuestZoneClaimTokens();
  return tokens.length ? { [GUEST_ZONE_CLAIMS_HEADER]: tokens.join(',') } : {};
}

export function forgetGuestZoneClaims(zoneIds?: number[]) {
  if (!zoneIds) {
    writeClaims([]);
    return;
  }

  const zoneIdSet = new Set(zoneIds);
  writeClaims(readClaims().filter((claim) => !zoneIdSet.has(claim.zoneId)));
}

export async function claimGuestZonesForCurrentSession() {
  const claimTokens = getGuestZoneClaimTokens();
  if (claimTokens.length === 0) {
    return 0;
  }

  const response = await fetch('/api/convenience-zones/claim', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ claim_tokens: claimTokens })
  });

  if (!response.ok) {
    throw new Error(`Guest zone claim failed with status ${response.status}`);
  }

  const json = await response.json().catch(() => ({}));
  const claimedZoneIds = Array.isArray(json.data?.claimed_zone_ids)
    ? json.data.claimed_zone_ids
        .map((id: unknown) => Number(id))
        .filter((id: number) => Number.isFinite(id))
    : [];

  forgetGuestZoneClaims();

  window.dispatchEvent(new Event('delineo:guest-zones-claimed'));
  return claimedZoneIds.length;
}
