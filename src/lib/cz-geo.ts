export type LatLng = {
  lat: number;
  lng: number;
};

export type GeoJSONFeature = {
  type: string;
  properties: Record<string, unknown>;
  geometry: {
    type: string;
    coordinates: unknown;
  };
};

export type GeoJSONData = {
  type: string;
  features: GeoJSONFeature[];
};

export function normalizeCbgId(cbgId: unknown) {
  if (cbgId === null || cbgId === undefined) {
    return '';
  }

  const raw = String(cbgId).trim();
  if (!raw) {
    return '';
  }

  if (/^\d+$/.test(raw)) {
    if (raw.length === 11) {
      return raw.padStart(12, '0');
    }
    return raw;
  }

  return raw;
}

export function getFeatureCbgId(feature: GeoJSONFeature | null | undefined) {
  return normalizeCbgId(
    feature?.properties?.GEOID ?? feature?.properties?.CensusBlockGroup
  );
}

export function mergeGeoJsonFeatures(
  baseGeoJson: GeoJSONData | null,
  extraGeoJson: GeoJSONData | null
) {
  if (!baseGeoJson && !extraGeoJson) {
    return null;
  }
  if (!baseGeoJson) {
    return extraGeoJson;
  }
  if (!extraGeoJson) {
    return baseGeoJson;
  }

  const merged: GeoJSONFeature[] = [];
  const seen = new Set<string>();

  const appendFeatures = (collection: GeoJSONData | null) => {
    if (!collection?.features) {
      return;
    }

    for (const feature of collection.features) {
      const cbgId = getFeatureCbgId(feature);
      if (!cbgId || seen.has(cbgId)) {
        continue;
      }
      seen.add(cbgId);
      merged.push(feature);
    }
  };

  appendFeatures(baseGeoJson);
  appendFeatures(extraGeoJson);

  return {
    type: 'FeatureCollection',
    features: merged
  } satisfies GeoJSONData;
}

export function getGeometryPoints(geometry: GeoJSONFeature['geometry']) {
  const points: Array<[number, number]> = [];

  const visit = (value: unknown) => {
    if (!Array.isArray(value)) {
      return;
    }

    if (
      value.length >= 2 &&
      typeof value[0] === 'number' &&
      typeof value[1] === 'number'
    ) {
      points.push([value[0], value[1]]);
      return;
    }

    for (const child of value) {
      visit(child);
    }
  };

  visit(geometry?.coordinates);
  return points;
}

export function getBoundsForGeoJson(geoJson: GeoJSONData | null | undefined) {
  if (!geoJson?.features?.length) {
    return null;
  }

  let minLng = Infinity;
  let maxLng = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;

  for (const feature of geoJson.features) {
    for (const [lng, lat] of getGeometryPoints(feature.geometry)) {
      minLng = Math.min(minLng, lng);
      maxLng = Math.max(maxLng, lng);
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
    }
  }

  if (
    !Number.isFinite(minLng) ||
    !Number.isFinite(maxLng) ||
    !Number.isFinite(minLat) ||
    !Number.isFinite(maxLat)
  ) {
    return null;
  }

  return [
    [minLng, minLat],
    [maxLng, maxLat]
  ] as [[number, number], [number, number]];
}

export function getFeatureCenterFromGeoJson(
  geoJson: GeoJSONData | null | undefined,
  cbgId: string
) {
  if (!geoJson?.features?.length) {
    return null;
  }

  const normalized = normalizeCbgId(cbgId);
  if (!normalized) {
    return null;
  }

  const feature = geoJson.features.find(
    (item) => getFeatureCbgId(item) === normalized
  );
  if (!feature) {
    return null;
  }

  const points = getGeometryPoints(feature.geometry);
  if (!points.length) {
    return null;
  }

  let minLng = Infinity;
  let maxLng = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;

  for (const [lng, lat] of points) {
    minLng = Math.min(minLng, lng);
    maxLng = Math.max(maxLng, lng);
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
  }

  return {
    lng: (minLng + maxLng) / 2,
    lat: (minLat + maxLat) / 2
  } satisfies LatLng;
}

export function createCircleGeoJson(
  center: LatLng,
  radiusKm: number,
  pointCount = 64
) {
  if (!Number.isFinite(radiusKm) || radiusKm <= 0) {
    return null;
  }

  const earthRadiusKm = 6371;
  const latRadians = (center.lat * Math.PI) / 180;
  const angularDistance = radiusKm / earthRadiusKm;
  const coordinates: Array<[number, number]> = [];

  for (let index = 0; index <= pointCount; index += 1) {
    const bearing = (2 * Math.PI * index) / pointCount;
    const lat =
      center.lat +
      ((angularDistance * Math.sin(bearing)) * 180) / Math.PI;
    const lng =
      center.lng +
      (((angularDistance * Math.cos(bearing)) * 180) / Math.PI) /
        Math.max(Math.cos(latRadians), 0.00001);
    coordinates.push([lng, lat]);
  }

  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'Polygon',
          coordinates: [coordinates]
        }
      }
    ]
  } satisfies GeoJSONData;
}
