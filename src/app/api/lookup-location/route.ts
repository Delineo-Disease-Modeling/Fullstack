import type { NextRequest } from 'next/server';
import { z } from 'zod';

const postSchema = z.object({
  location: z.string().trim().min(1)
});

type LookupResponse = {
  cbg: string;
  city: string;
  state: string;
};

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
  return {
    cbg: String(fips).slice(0, 12),
    city,
    state
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
