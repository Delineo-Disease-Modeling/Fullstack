import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { GOOGLE_API_KEY } from '../env.js';

import zip_to_cbg_raw from '../data/zip_to_cbg.json' with { type: 'json' };

const zip_to_cbg = zip_to_cbg_raw as Record<string, string[]>;

const lookup_route = new Hono();

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

const postLookupLocationSchema = z.object({
  location: z.string().min(1)
});

async function resolveLocation(
  location: string
): Promise<{ zip_code: string; city: string } | null> {
  if (!GOOGLE_API_KEY) {
    return null;
  }

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

  // Reverse geocoding if ZIP not found directly
  const resultWithGeometry = json.results.find((result) => result.geometry);
  if (!resultWithGeometry || !resultWithGeometry.geometry) {
    return null;
  }

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

lookup_route.post(
  '/lookup-location',
  zValidator('json', postLookupLocationSchema),
  async (c) => {
    const { location } = c.req.valid('json');

    let zip = location;
    let city = '';
    let cbg = zip_to_cbg[zip]?.[0];

    // If not found directly, try to resolve via Google API
    if (!cbg) {
      const resolved = await resolveLocation(location);
      if (!resolved) {
        return c.json({ error: 'Location not found' }, 404);
      }
      zip = resolved.zip_code;
      city = resolved.city;
      cbg = zip_to_cbg[zip]?.[0];
    }

    if (!cbg) {
       return c.json({ error: 'CBG not found for this location', zip, city }, 404);
    }

    return c.json({ cbg, zip_code: zip, city });
  }
);

export default lookup_route;
