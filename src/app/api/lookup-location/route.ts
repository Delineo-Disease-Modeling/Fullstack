import type { NextRequest } from 'next/server';
import { z } from 'zod';
import zip_to_cbg_raw from '@/data/zip_to_cbg.json';

const zip_to_cbg = zip_to_cbg_raw as Record<string, string[]>;

const schema = z.object({
  location: z.string().min(1)
});

interface GeocodeResponse {
  results: {
    address_components?: {
      long_name: string;
      types: string[];
    }[];
    geometry?: {
      location: {
        lat: number;
        lng: number;
      };
    };
  }[];
  status: string;
}

async function resolveLocation(
  location: string
): Promise<{ zip_code: string; city: string } | null> {
  const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
  if (!GOOGLE_API_KEY) return null;

  const api_uri = 'https://maps.googleapis.com/maps/api/geocode/json';
  const resp = await fetch(
    `${api_uri}?address=${encodeURIComponent(location)}&key=${GOOGLE_API_KEY}`
  );

  const json = (await resp.json()) as GeocodeResponse;

  const resultWithComponents = json.results.find(
    (result) => result.address_components
  );

  if (!resultWithComponents || !resultWithComponents.address_components) {
    return null;
  }

  const components = resultWithComponents.address_components;
  const zipCodeComponent = components.find((component) =>
    component.types.includes('postal_code')
  );

  if (zipCodeComponent) {
    const cityComponent = components.find((component) =>
      component.types.includes('locality')
    );
    return {
      zip_code: zipCodeComponent.long_name,
      city: cityComponent ? cityComponent.long_name : ''
    };
  }

  const resultWithGeometry = json.results.find((result) => result.geometry);
  if (!resultWithGeometry || !resultWithGeometry.geometry) return null;

  const geoLocation = resultWithGeometry.geometry.location;
  const loc_resp = await fetch(
    `${api_uri}?latlng=${encodeURIComponent(
      `${geoLocation.lat},${geoLocation.lng}`
    )}&key=${GOOGLE_API_KEY}`
  );
  const loc_json = (await loc_resp.json()) as GeocodeResponse;

  const res: { zip_code: string; city: string } = { zip_code: '', city: '' };

  for (const result of loc_json.results) {
    if (result.address_components) {
      for (const comp of result.address_components) {
        if (comp.types.includes('postal_code')) res.zip_code = comp.long_name;
        if (comp.types.includes('locality')) res.city = comp.long_name;
      }
    }
  }

  return res.zip_code ? res : null;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: 'Invalid request' }, { status: 400 });
    }

    const { location } = parsed.data;

    let zip = location;
    let city = '';
    let cbg = zip_to_cbg[zip]?.[0];

    if (!cbg) {
      const resolved = await resolveLocation(location);
      if (!resolved) {
        return Response.json({ error: 'Location not found' }, { status: 404 });
      }
      zip = resolved.zip_code;
      city = resolved.city;
      cbg = zip_to_cbg[zip]?.[0];
    }

    if (!cbg) {
      return Response.json(
        { error: 'CBG not found for this location', zip, city },
        { status: 404 }
      );
    }

    return Response.json({ cbg, zip_code: zip, city });
  } catch {
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
