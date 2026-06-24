// Pure geometry, hashing, and numeric helpers for the model map. No module
// state and no rendering deps, so it can be imported by every other map module
// (household layout, dot builders, icon building) and unit-tested in isolation.
//
// `normalizeCbgId` is imported from the canonical `@/lib/cz-geo` rather than
// redefined here — kept as an explicit-extension relative import so the
// `node --test` runner (which can't resolve the `@/` alias) can still follow
// the module graph.
import { normalizeCbgId } from '../../lib/cz-geo.ts';
import type { Coordinate, GeoJSONFeature, GeoJSONGeometry } from './map-types';

export { normalizeCbgId };

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function quantileSorted(values: number[], quantile: number) {
  if (!values.length) return 0;
  const index = clamp(
    Math.round((values.length - 1) * quantile),
    0,
    values.length - 1
  );
  return values[index];
}

export function hashString(input: string) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function hashUnit(seed: number, salt = 0) {
  let x = (seed + salt * 374761393) >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 2246822519);
  x ^= x >>> 13;
  x = Math.imul(x, 3266489917);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967295;
}

export function getFeatureCbgId(feature: GeoJSONFeature | null | undefined) {
  return normalizeCbgId(
    feature?.properties?.GEOID ?? feature?.properties?.CensusBlockGroup
  );
}

export function toNumber(value: unknown): number | null {
  const numberValue = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function getRingPoints(value: unknown) {
  if (!Array.isArray(value)) return [] as Coordinate[];

  const points: Coordinate[] = [];
  for (const item of value) {
    if (
      Array.isArray(item) &&
      item.length >= 2 &&
      typeof item[0] === 'number' &&
      typeof item[1] === 'number'
    ) {
      points.push([item[0], item[1]]);
    }
  }
  return points;
}

function getGeometryRings(geometry: GeoJSONGeometry | null | undefined) {
  const rings: Coordinate[][] = [];
  if (!geometry?.type || !Array.isArray(geometry.coordinates)) return rings;

  if (geometry.type === 'Polygon') {
    for (const ring of geometry.coordinates) {
      const points = getRingPoints(ring);
      if (points.length >= 3) rings.push(points);
    }
    return rings;
  }

  if (geometry.type === 'MultiPolygon') {
    for (const polygon of geometry.coordinates) {
      if (!Array.isArray(polygon)) continue;
      for (const ring of polygon) {
        const points = getRingPoints(ring);
        if (points.length >= 3) rings.push(points);
      }
    }
  }

  return rings;
}

function getPolygonGroups(geometry: GeoJSONGeometry | null | undefined) {
  const groups: Coordinate[][][] = [];
  if (!geometry?.type || !Array.isArray(geometry.coordinates)) return groups;

  if (geometry.type === 'Polygon') {
    const polygon: Coordinate[][] = [];
    for (const ring of geometry.coordinates) {
      const points = getRingPoints(ring);
      if (points.length >= 3) polygon.push(points);
    }
    if (polygon.length) groups.push(polygon);
    return groups;
  }

  if (geometry.type === 'MultiPolygon') {
    for (const polygonCoords of geometry.coordinates) {
      if (!Array.isArray(polygonCoords)) continue;
      const polygon: Coordinate[][] = [];
      for (const ring of polygonCoords) {
        const points = getRingPoints(ring);
        if (points.length >= 3) polygon.push(points);
      }
      if (polygon.length) groups.push(polygon);
    }
  }

  return groups;
}

function pointInRing(lng: number, lat: number, ring: Coordinate[]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [lngI, latI] = ring[i];
    const [lngJ, latJ] = ring[j];
    // The `latI > lat !== latJ > lat` guard means the edge straddles `lat`, so
    // `latJ - latI` is non-zero here. Dividing by it directly preserves the
    // sign; a `Math.max(latJ - latI, 1e-12)` would flip the ray-cast on every
    // downward edge and wrongly classify exterior points as inside.
    const intersects =
      latI > lat !== latJ > lat &&
      lng < ((lngJ - lngI) * (lat - latI)) / (latJ - latI) + lngI;
    if (intersects) inside = !inside;
  }
  return inside;
}

export function pointInGeometry(
  lng: number,
  lat: number,
  geometry: GeoJSONGeometry | null | undefined
) {
  const groups = getPolygonGroups(geometry);
  for (const polygon of groups) {
    const [outer, ...holes] = polygon;
    if (!outer || !pointInRing(lng, lat, outer)) continue;
    if (holes.some((hole) => pointInRing(lng, lat, hole))) continue;
    return true;
  }
  return false;
}

export function halton(index: number, base: number) {
  let result = 0;
  let fraction = 1 / base;
  let i = index;
  while (i > 0) {
    result += fraction * (i % base);
    i = Math.floor(i / base);
    fraction /= base;
  }
  return result;
}

export function getGeometryPoints(
  geometry: GeoJSONGeometry | null | undefined
) {
  const points: Coordinate[] = [];

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

export function samplePointsInFootprint(
  geometry: GeoJSONGeometry | null | undefined,
  count: number,
  seed: number
) {
  if (!geometry || count <= 0) return [] as Coordinate[];

  const points = getGeometryPoints(geometry);
  if (!points.length) return [] as Coordinate[];

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

  if (
    !Number.isFinite(minLng) ||
    !Number.isFinite(maxLng) ||
    !Number.isFinite(minLat) ||
    !Number.isFinite(maxLat) ||
    maxLng <= minLng ||
    maxLat <= minLat
  ) {
    return [] as Coordinate[];
  }

  const accepted: Coordinate[] = [];
  const offsetA = 1 + Math.floor(hashUnit(seed, 17) * 997);
  const offsetB = 1 + Math.floor(hashUnit(seed, 23) * 997);
  const maxAttempts = Math.max(240, count * 80);

  for (
    let attempt = 0;
    attempt < maxAttempts && accepted.length < count;
    attempt += 1
  ) {
    const lng = minLng + halton(attempt + offsetA, 2) * (maxLng - minLng);
    const lat = minLat + halton(attempt + offsetB, 3) * (maxLat - minLat);
    if (pointInGeometry(lng, lat, geometry)) {
      accepted.push([lng, lat]);
    }
  }

  return accepted;
}

export function summarizeGeometry(
  geometry: GeoJSONGeometry | null | undefined,
  longitudeScale: number
): { area: number; centerLat: number; centerLng: number } | null {
  const rings = getGeometryRings(geometry);
  let areaSum = 0;
  let weightedCenterX = 0;
  let weightedCenterY = 0;

  for (const ring of rings) {
    let area2 = 0;
    let centroidX = 0;
    let centroidY = 0;

    for (let index = 0; index < ring.length; index += 1) {
      const [lngA, latA] = ring[index];
      const [lngB, latB] = ring[(index + 1) % ring.length];
      const xA = lngA * longitudeScale;
      const xB = lngB * longitudeScale;
      const cross = xA * latB - xB * latA;

      area2 += cross;
      centroidX += (xA + xB) * cross;
      centroidY += (latA + latB) * cross;
    }

    if (Math.abs(area2) < 1e-12) continue;

    areaSum += area2 / 2;
    weightedCenterX += centroidX / 6;
    weightedCenterY += centroidY / 6;
  }

  if (Math.abs(areaSum) > 1e-12) {
    return {
      area: Math.abs(areaSum),
      centerLat: weightedCenterY / areaSum,
      centerLng: weightedCenterX / areaSum / longitudeScale
    };
  }

  const points = getGeometryPoints(geometry);
  if (!points.length) return null;

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

  if (
    !Number.isFinite(minLng) ||
    !Number.isFinite(maxLng) ||
    !Number.isFinite(minLat) ||
    !Number.isFinite(maxLat)
  ) {
    return null;
  }

  return {
    area: 0,
    centerLat: (minLat + maxLat) / 2,
    centerLng: (minLng + maxLng) / 2
  };
}
