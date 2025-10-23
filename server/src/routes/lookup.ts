import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { GOOGLE_API_KEY } from "../env.js";

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
};

const postLookupZipSchema = z.object({
  location: z.string().nonempty()
});

lookup_route.post('/lookup-zip', zValidator('json', postLookupZipSchema), async (c) => {
  const { location } = c.req.valid('json');

  const api_uri = 'https://maps.googleapis.com/maps/api/geocode/json';

  // Get the geocode information for the provided location.
  const resp = await fetch(
    `${api_uri}?address=${encodeURIComponent(location)}&key=${GOOGLE_API_KEY}`
  );

  // Cast the response to our defined GeocodeResponse type.
  const json = (await resp.json()) as GeocodeResponse;

  // Find a result that includes address_components.
  const resultWithComponents = json.results.find(
    (result) => result.address_components
  );
  if (!resultWithComponents || !resultWithComponents.address_components) {
    return c.json({ error: 'No address components found' }, 400);
  }

  const components = resultWithComponents.address_components;

  // Look for a postal code within the components.
  const zipCodeComponent = components.find((component) =>
    component.types.includes('postal_code')
  );

  if (!zipCodeComponent) {
    // If postal code isn't found, attempt reverse geocoding.
    const resultWithGeometry = json.results.find((result) => result.geometry);
    if (!resultWithGeometry || !resultWithGeometry.geometry) {
      return c.json({ error: 'No geometry found for reverse lookup' }, 400);
    }
    // Rename inner variable to avoid shadowing the outer "location"
    const geoLocation = resultWithGeometry.geometry.location;

    const loc_resp = await fetch(
      `${api_uri}?latlng=${encodeURIComponent(
        `${geoLocation.lat},${geoLocation.lng}`
      )}&key=${GOOGLE_API_KEY}`
    );

    const loc_json = (await loc_resp.json()) as GeocodeResponse;
    const res_json: { zip_code: string; city: string } = {
      zip_code: '',
      city: ''
    };

    for (const result of loc_json.results) {
      if (result.address_components) {
        for (const comp of result.address_components) {
          if (comp.types.includes('postal_code')) {
            res_json.zip_code = comp.long_name;
          }
          if (comp.types.includes('locality')) {
            res_json.city = comp.long_name;
          }
        }
      }
    }

    return c.json(res_json);
  } else {
    // If postal code is found, look for the city.
    const cityComponent = components.find((component) =>
      component.types.includes('locality')
    );

    return c.json({
      zip_code: zipCodeComponent.long_name,
      city: cityComponent ? cityComponent.long_name : ''
    });
  }
});

export default lookup_route;
