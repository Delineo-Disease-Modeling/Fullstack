import type { NextRequest } from 'next/server';
import { z } from 'zod';

const postSchema = z.object({
  location: z.string().trim().min(1)
});

type LookupResponse = {
  cbg: string;
  city: string;
  state: string;
  zip?: string;
  seed_type: 'zip' | 'cbg';
  seed_name: string;
  seed_cbgs: string[];
};

type SeedRegionResponse = {
  zip?: string;
  city?: string | null;
  state?: string | null;
  seed_name?: string;
  seed_cbgs?: string[];
};

function normalizeZip(value: unknown): string | null {
  const digits = String(value ?? '')
    .trim()
    .replace(/\D+/g, '');
  return digits.length === 5 ? digits : null;
}

function normalizeCbg(value: unknown): string | null {
  const digits = String(value ?? '')
    .trim()
    .replace(/\D+/g, '');
  return digits.length === 12 ? digits : null;
}

function getAlgorithmsBaseUrl(): string {
  return (
    process.env.ALG_URL ||
    process.env.NEXT_PUBLIC_ALG_URL ||
    'http://localhost:1880'
  ).replace(/\/+$/, '');
}

async function lookupSeedRegionByZip(
  zip: string
): Promise<SeedRegionResponse | null> {
  const response = await fetch(
    `${getAlgorithmsBaseUrl()}/seed-region?zip=${encodeURIComponent(zip)}`,
    {
      cache: 'no-store'
    }
  );

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as
      | Record<string, unknown>
      | null;
    const message =
      typeof payload?.message === 'string'
        ? payload.message
        : `Algorithms seed-region lookup failed with status ${response.status}`;
    throw new Error(message);
  }

  return (await response.json()) as SeedRegionResponse;
}

async function lookupLocation(
  query: string
): Promise<LookupResponse | null> {
  const coordMatch = query.match(/^(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)$/);
  const nominatimUrl = coordMatch
    ? `https://nominatim.openstreetmap.org/reverse?lat=${coordMatch[1]}&lon=${coordMatch[2]}&format=json&addressdetails=1`
    : `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&addressdetails=1&limit=1&countrycodes=us`;

  const geoResp = await fetch(nominatimUrl, {
    headers: { 'User-Agent': 'DelineoApp/1.0' },
    cache: 'no-store'
  });

  if (!geoResp.ok) {
    return null;
  }

  const geoData = coordMatch ? [await geoResp.json()] : await geoResp.json();
  const result = geoData?.[0];
  if (!result?.address) {
    return null;
  }

  const lat = parseFloat(result.lat);
  const lng = parseFloat(result.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  const city =
    result.address.city || result.address.town || result.address.village || '';
  const inputZip = normalizeZip(query);
  const postcode = normalizeZip(result.address.postcode) || inputZip;

  const fccResp = await fetch(
    `https://geo.fcc.gov/api/census/block/find?latitude=${lat}&longitude=${lng}&censusYear=2010&format=json`,
    { cache: 'no-store' }
  );

  if (!fccResp.ok) {
    return null;
  }

  const fccData = await fccResp.json();
  const fips = fccData?.Block?.FIPS;
  if (!fips) {
    return null;
  }

  const state = fccData?.State?.code || result.address.state || '';
  const fallbackCbg = String(fips).slice(0, 12);
  const seedRegion = postcode
    ? await lookupSeedRegionByZip(postcode).catch((error) => {
        console.warn(
          `Seed-region lookup failed for ZIP ${postcode}:`,
          error instanceof Error ? error.message : error
        );
        return null;
      })
    : null;
  const seedCbgs = Array.isArray(seedRegion?.seed_cbgs)
    ? Array.from(
        new Set(
          seedRegion.seed_cbgs
            .map((cbg) => normalizeCbg(cbg))
            .filter((cbg): cbg is string => Boolean(cbg))
        )
      )
    : [fallbackCbg];
  const seedType = seedRegion ? 'zip' : 'cbg';
  const seedName =
    (typeof seedRegion?.seed_name === 'string' && seedRegion.seed_name.trim()) ||
    (postcode ? `ZIP ${postcode}` : city || state || query);
  const resolvedCity =
    (typeof seedRegion?.city === 'string' && seedRegion.city.trim()) || city;
  const resolvedState =
    (typeof seedRegion?.state === 'string' && seedRegion.state.trim()) || state;
  return {
    cbg: fallbackCbg,
    city: resolvedCity,
    state: resolvedState,
    zip: postcode || undefined,
    seed_type: seedType,
    seed_name: seedName,
    seed_cbgs: seedCbgs
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = postSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ message: 'Invalid location' }, { status: 400 });
    }

    const data = await lookupLocation(parsed.data.location);
    if (!data) {
      return Response.json(
        { message: 'Could not resolve location' },
        { status: 404 }
      );
    }

    return Response.json(data);
  } catch (error) {
    console.error('Lookup location error:', error);
    return Response.json(
      { message: 'Failed to resolve location' },
      { status: 500 }
    );
  }
}
