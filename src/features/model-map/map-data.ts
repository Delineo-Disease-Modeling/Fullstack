import type {
  Coordinate,
  GeoJSONData,
  GeoJSONFeature,
  GeoJSONGeometry,
  GeoJSONPolygonGeometry,
  HotspotsByLocation,
  HouseholdCircleDraft,
  HouseholdCircleLayout,
  HouseholdLayoutBundle,
  MapLocation,
  MapPoi,
  MapPoiType,
  PapDataForMap,
  PeopleDotFeature,
  PeopleDotFeatureCollection,
  PeopleMapData,
  PersonStatusDotFeature,
  PersonStatusDotFeatureCollection,
  PoiFeatureCollection,
  PoiFootprintFeatureCollection,
  SimTimeDataForMap
} from './map-types';

export type {
  Coordinate,
  GeoJSONData,
  GeoJSONFeature,
  GeoJSONGeometry,
  GeoJSONPolygonGeometry,
  HotspotsByLocation,
  MapLocation,
  MapPoi,
  MapPoiType,
  PapDataForMap,
  PeopleDotFeatureCollection,
  PeopleMapData,
  PersonStatusDotFeatureCollection,
  PoiFeatureCollection,
  PoiFootprintFeatureCollection,
  SimTimeDataForMap
} from './map-types';

export const iconLookup: Record<string, string> = {
  'Depository Credit Intermediation': '🏦',
  'Restaurants and Other Eating Places': '🍽️',
  'Offices of Physicians': '🏥',
  'Religious Organizations': '⛪',
  'Personal Care Services': '🏢',
  'Child Day Care Services': '🏫',
  'Death Care Services': '🪦',
  'Elementary and Secondary Schools': '🏫',
  Florists: '💐',
  'Museums, Historical Sites, and Similar Institutions': '🏛️',
  'Grocery Stores': '🛒',
  'Nursing Care Facilities (Skilled Nursing Facilities)': '🏥',
  'Justice, Public Order, and Safety Activities': '🚔',
  'Administration of Economic Programs': '🏛️',
  'General Merchandise Stores, including Warehouse Clubs and Supercenters':
    '🏬',
  'Gasoline Stations': '⛽',
  'Agencies, Brokerages, and Other Insurance Related Activities': '🏢',
  'Automotive Repair and Maintenance': '🚗',
  'Specialty Food Stores': '🏪',
  'Coating, Engraving, Heat Treating, and Allied Activities': '🏢',
  'Building Material and Supplies Dealers': '🏢',
  'Postal Service': '📬',
  Home: '🏠'
};

const HOME_CIRCLE_RADIUS_FACTOR = 0.18;
const HOME_CIRCLE_RADIUS_MIN = 0.008;
const HOME_CIRCLE_RADIUS_MAX = 0.025;
const HOME_CIRCLE_RADIUS_QUANTILE = 0.95;
const MAX_PERSON_DOTS = 8000;
const MAX_PLACE_DOTS_PER_LOCATION = 220;
const NO_FOOTPRINT_DOT_JITTER_DEGREES = 0.0008;

let householdLocs: Record<string, Coordinate> = {};
let placeLocs: Record<string, Coordinate> = {};
let placeDotLayouts: Record<string, Coordinate[]> = {};
let personLayoutCache: Record<string, Coordinate[]> = {};
let householdLayoutKey = '';

export function resetModelMapLayoutCaches() {
  householdLocs = {};
  placeLocs = {};
  placeDotLayouts = {};
  personLayoutCache = {};
  householdLayoutKey = '';
}

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

function toNumber(value: unknown): number | null {
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
    const intersects =
      latI > lat !== latJ > lat &&
      lng <
        ((lngJ - lngI) * (lat - latI)) / Math.max(latJ - latI, 1e-12) + lngI;
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

function halton(index: number, base: number) {
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

function computeDiskLayout(
  centerLat: number,
  centerLng: number,
  count: number,
  seed: number
): Coordinate[] {
  if (count <= 0) return [];
  const offsetA = 1 + Math.floor(hashUnit(seed, 11) * 997);
  const offsetB = 1 + Math.floor(hashUnit(seed, 13) * 997);
  // Scale the disk radius with sqrt(count) so density stays roughly constant
  const radius =
    NO_FOOTPRINT_DOT_JITTER_DEGREES * Math.max(1, Math.sqrt(count / 24));
  const cos = Math.max(Math.cos((centerLat * Math.PI) / 180), 0.35);
  const out: Coordinate[] = new Array(count);
  for (let i = 0; i < count; i++) {
    const u1 = halton(i + offsetA, 2);
    const u2 = halton(i + offsetB, 3);
    const r = Math.sqrt(u1) * radius;
    const theta = u2 * Math.PI * 2;
    out[i] = [
      centerLng + (Math.cos(theta) * r) / cos,
      centerLat + Math.sin(theta) * r
    ];
  }
  return out;
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

function buildFallbackHouseholdLayout(
  centerLat: number,
  centerLng: number,
  spreadLat: number,
  spreadLng: number
): HouseholdCircleLayout {
  const displayCos = Math.max(Math.cos((centerLat * Math.PI) / 180), 0.35);
  const radiusLat = clamp(
    Math.max(spreadLat, spreadLng) * HOME_CIRCLE_RADIUS_FACTOR,
    HOME_CIRCLE_RADIUS_MIN,
    HOME_CIRCLE_RADIUS_MAX
  );
  return {
    anchorLat: centerLat,
    anchorLng: centerLng,
    centerLat,
    centerLng,
    radiusLat,
    radiusLng: radiusLat / displayCos
  };
}

function relaxHouseholdCircles(circles: HouseholdCircleDraft[]) {
  if (circles.length < 2) return;

  const iterations = Math.max(12, Math.min(36, circles.length * 6));
  const springStrength = 0.12;

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    let moved = false;

    for (let leftIndex = 0; leftIndex < circles.length; leftIndex += 1) {
      for (
        let rightIndex = leftIndex + 1;
        rightIndex < circles.length;
        rightIndex += 1
      ) {
        const left = circles[leftIndex];
        const right = circles[rightIndex];
        const dx = right.x - left.x;
        const dy = right.y - left.y;
        const distance = Math.hypot(dx, dy);
        const minDistance = left.radius + right.radius;

        if (distance >= minDistance) continue;

        moved = true;
        const overlap = minDistance - Math.max(distance, 1e-9);
        const seed = hashString(`${left.cbgId}:${right.cbgId}`);
        const angle = hashUnit(seed, 1) * Math.PI * 2;
        const nx = distance > 1e-9 ? dx / distance : Math.cos(angle);
        const ny = distance > 1e-9 ? dy / distance : Math.sin(angle);
        const leftMass = Math.max(left.homeCount, 1);
        const rightMass = Math.max(right.homeCount, 1);
        const totalMass = leftMass + rightMass;
        const leftPush = rightMass / totalMass;
        const rightPush = leftMass / totalMass;

        left.x -= nx * overlap * leftPush;
        left.y -= ny * overlap * leftPush;
        right.x += nx * overlap * rightPush;
        right.y += ny * overlap * rightPush;
      }
    }

    for (const circle of circles) {
      circle.x += (circle.anchorLng - circle.x) * springStrength;
      circle.y += (circle.anchorLat - circle.y) * springStrength;
    }

    if (!moved) break;
  }
}

export function computeCbgHouseholdLayouts(
  zoneGeoJSON: GeoJSONData | null,
  homes: MapLocation[] = [],
  fallbackCenterLat: number,
  fallbackCenterLng: number,
  fallbackSpreadLat: number,
  fallbackSpreadLng: number
): HouseholdLayoutBundle {
  const fallbackLayout = buildFallbackHouseholdLayout(
    fallbackCenterLat,
    fallbackCenterLng,
    fallbackSpreadLat,
    fallbackSpreadLng
  );

  if (!zoneGeoJSON?.features?.length) {
    return {
      fallback: fallbackLayout,
      byCbg: {}
    };
  }

  const boundaryPoints = zoneGeoJSON.features.flatMap((feature) =>
    getGeometryPoints(feature.geometry)
  );
  if (!boundaryPoints.length) {
    return {
      fallback: fallbackLayout,
      byCbg: {}
    };
  }

  const referenceLat =
    boundaryPoints.reduce((sum, [, lat]) => sum + lat, 0) /
    boundaryPoints.length;
  const longitudeScale = Math.max(
    Math.cos((referenceLat * Math.PI) / 180),
    0.35
  );

  const homesByCbg = new Map<string, MapLocation[]>();
  for (const home of homes) {
    const cbgId = normalizeCbgId(home?.cbg);
    if (!cbgId) continue;
    const group = homesByCbg.get(cbgId) ?? [];
    group.push(home);
    homesByCbg.set(cbgId, group);
  }

  const circles: HouseholdCircleDraft[] = [];

  for (const feature of zoneGeoJSON.features) {
    const cbgId = getFeatureCbgId(feature);
    if (!cbgId) continue;

    const summary = summarizeGeometry(feature.geometry, longitudeScale);
    if (!summary) continue;

    const anchorLat = summary.centerLat;
    const anchorLng = summary.centerLng * longitudeScale;
    const homeCount = homesByCbg.get(cbgId)?.length ?? 0;
    const areaRadius = summary.area > 0 ? Math.sqrt(summary.area / Math.PI) : 0;

    const validHomeDistances = (homesByCbg.get(cbgId) ?? [])
      .map((home) => {
        const lat = toNumber(home?.latitude);
        const lng = toNumber(home?.longitude);
        if (lat === null || lng === null || (lat === 0 && lng === 0)) {
          return null;
        }
        const cos = Math.max(Math.cos((anchorLat * Math.PI) / 180), 0.35);
        return Math.hypot((lng - summary.centerLng) * cos, lat - anchorLat);
      })
      .filter((value): value is number => value !== null)
      .sort((left, right) => left - right);

    const geoRadius = Math.max(
      areaRadius,
      validHomeDistances.length
        ? quantileSorted(validHomeDistances, HOME_CIRCLE_RADIUS_QUANTILE)
        : 0,
      1e-4
    );

    circles.push({
      cbgId,
      anchorLat,
      anchorLng,
      x: anchorLng,
      y: anchorLat,
      radius: geoRadius,
      homeCount
    });
  }

  if (!circles.length) {
    return {
      fallback: fallbackLayout,
      byCbg: {}
    };
  }

  const totalHomes = circles.reduce((sum, circle) => sum + circle.homeCount, 0);
  const totalGeoArea = circles.reduce(
    (sum, circle) => sum + Math.PI * circle.radius * circle.radius,
    0
  );

  if (totalHomes > 0 && totalGeoArea > 0) {
    const targetDensity = totalHomes / totalGeoArea;
    for (const circle of circles) {
      if (circle.homeCount <= 0) continue;
      const capacityRadius = Math.sqrt(
        circle.homeCount / (Math.PI * targetDensity)
      );
      circle.radius = Math.max(circle.radius, capacityRadius);
    }
  }

  relaxHouseholdCircles(circles);

  const byCbg: Record<string, HouseholdCircleLayout> = {};
  for (const circle of circles) {
    const centerLat = circle.y;
    const centerLng = circle.x / longitudeScale;
    const displayCos = Math.max(Math.cos((centerLat * Math.PI) / 180), 0.35);
    byCbg[circle.cbgId] = {
      anchorLat: circle.anchorLat,
      anchorLng: circle.anchorLng / longitudeScale,
      centerLat,
      centerLng,
      radiusLat: circle.radius,
      radiusLng: circle.radius / displayCos
    };
  }

  return {
    fallback: fallbackLayout,
    byCbg
  };
}

function buildHouseholdLayout(
  homes: MapLocation[],
  layouts: HouseholdLayoutBundle
) {
  if (!homes?.length) return;

  const groups = new Map<string, MapLocation[]>();
  for (const home of homes) {
    const cbgId = normalizeCbgId(home?.cbg);
    const key = cbgId && layouts.byCbg[cbgId] ? cbgId : '__fallback__';
    const group = groups.get(key) ?? [];
    group.push(home);
    groups.set(key, group);
  }

  for (const [groupKey, groupHomes] of groups) {
    const layout =
      groupKey === '__fallback__'
        ? layouts.fallback
        : (layouts.byCbg[groupKey] ?? layouts.fallback);
    const sourceCos = Math.max(
      Math.cos((layout.anchorLat * Math.PI) / 180),
      0.35
    );

    const validHomes = groupHomes
      .map((home) => {
        const lat = toNumber(home.latitude);
        const lng = toNumber(home.longitude);
        if (lat === null || lng === null || (lat === 0 && lng === 0)) {
          return null;
        }
        const dx = (lng - layout.anchorLng) * sourceCos;
        const dy = lat - layout.anchorLat;
        return {
          id: String(home.id),
          angle: Math.atan2(dy, dx),
          distance: Math.hypot(dx, dy)
        };
      })
      .filter(
        (home): home is { id: string; angle: number; distance: number } =>
          home !== null
      );

    const sortedDistances = validHomes
      .map((home) => home.distance)
      .sort((left, right) => left - right);
    const sourceRadius = sortedDistances.length
      ? quantileSorted(sortedDistances, HOME_CIRCLE_RADIUS_QUANTILE)
      : 0;

    if (sourceRadius > 1e-9) {
      for (const home of validHomes) {
        const radialWeight = clamp(home.distance / sourceRadius, 0, 1);
        householdLocs[home.id] = [
          layout.centerLat +
            Math.sin(home.angle) * layout.radiusLat * radialWeight,
          layout.centerLng +
            Math.cos(home.angle) * layout.radiusLng * radialWeight
        ];
      }
    }

    for (const home of groupHomes) {
      const id = String(home.id);
      if (id in householdLocs) continue;

      const seed = hashString(`home:${id}`);
      const angle = hashUnit(seed, 1) * Math.PI * 2;
      const radialWeight = Math.sqrt(hashUnit(seed, 2));
      householdLocs[id] = [
        layout.centerLat + Math.sin(angle) * layout.radiusLat * radialWeight,
        layout.centerLng + Math.cos(angle) * layout.radiusLng * radialWeight
      ];
    }
  }
}

export function updateIcons(
  mapCenter: Coordinate,
  simData: SimTimeDataForMap | null | undefined,
  papData: PapDataForMap | null | undefined,
  hotspots: HotspotsByLocation | null | undefined,
  zoneGeoJSON: GeoJSONData | null
) {
  const icons: MapPoi[] = [];
  if (!simData || !papData) return icons;

  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  let validPlaceCount = 0;

  if (papData.places) {
    for (const place of papData.places) {
      const lat = toNumber(place.latitude);
      const lng = toNumber(place.longitude);
      if (lat !== null && lng !== null && !(lat === 0 && lng === 0)) {
        minLat = Math.min(minLat, lat);
        maxLat = Math.max(maxLat, lat);
        minLng = Math.min(minLng, lng);
        maxLng = Math.max(maxLng, lng);
        validPlaceCount++;
      }
    }
  }

  const hasPlaceBounds = validPlaceCount > 0 && minLat !== Infinity;
  const placeCenterLat = hasPlaceBounds ? (minLat + maxLat) / 2 : mapCenter[0];
  const placeCenterLng = hasPlaceBounds ? (minLng + maxLng) / 2 : mapCenter[1];
  const placeSpreadLat = hasPlaceBounds
    ? Math.max(maxLat - minLat, 0.02)
    : 0.06;
  const placeSpreadLng = hasPlaceBounds
    ? Math.max(maxLng - minLng, 0.02)
    : 0.06;
  const homes = papData.homes ?? [];
  const householdLayouts = computeCbgHouseholdLayouts(
    zoneGeoJSON,
    homes,
    placeCenterLat,
    placeCenterLng,
    placeSpreadLat,
    placeSpreadLng
  );
  const zoneKey = zoneGeoJSON?.features?.length
    ? zoneGeoJSON.features.map((feature) => getFeatureCbgId(feature)).join(',')
    : 'no-zone';
  let homeChecksum = 0;
  for (const home of homes) {
    const lat = toNumber(home?.latitude);
    const lng = toNumber(home?.longitude);
    homeChecksum =
      (homeChecksum +
        hashString(
          [
            home?.id ?? 'none',
            normalizeCbgId(home?.cbg) || 'nocbg',
            lat === null ? 'na' : lat.toFixed(4),
            lng === null ? 'na' : lng.toFixed(4)
          ].join(':')
        )) >>>
      0;
  }
  const circleDigest = Object.entries(householdLayouts.byCbg)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(
      ([cbgId, layout]) =>
        `${cbgId}:${layout.centerLat.toFixed(4)}:${layout.centerLng.toFixed(4)}:${layout.radiusLat.toFixed(4)}`
    )
    .join('|');
  const homeLayoutKey = Array.isArray(papData.homes)
    ? [
        papData.homes.length,
        homeChecksum,
        zoneKey,
        circleDigest,
        householdLayouts.fallback.centerLat.toFixed(4),
        householdLayouts.fallback.centerLng.toFixed(4),
        householdLayouts.fallback.radiusLat.toFixed(4)
      ].join(':')
    : 'empty';

  if (papData.homes && householdLayoutKey !== homeLayoutKey) {
    householdLocs = {};
    householdLayoutKey = homeLayoutKey;
    buildHouseholdLayout(papData.homes, householdLayouts);
  }

  const processLocs = (
    type: MapPoiType,
    dataArray: MapLocation[] | undefined,
    statArray: number[] | undefined
  ) => {
    if (!dataArray || !statArray) return;
    dataArray.forEach((data, index) => {
      const dataId = String(data.id);
      let lat = toNumber(data.latitude);
      let lng = toNumber(data.longitude);
      let label = data.label ?? '';
      if (type === 'homes') {
        label = `Home #${data.id}`;
        data.label = label;
        const layout = householdLocs[dataId];
        if (layout) {
          lat = layout[0];
          lng = layout[1];
        } else {
          const cbgId = normalizeCbgId(data?.cbg);
          const circle =
            (cbgId && householdLayouts.byCbg[cbgId]) ||
            householdLayouts.fallback;
          const seed = hashString(`home:${data.id}`);
          const angle = hashUnit(seed, 1) * Math.PI * 2;
          const radialWeight = Math.sqrt(hashUnit(seed, 2));
          lat =
            circle.centerLat +
            Math.sin(angle) * circle.radiusLat * radialWeight;
          lng =
            circle.centerLng +
            Math.cos(angle) * circle.radiusLng * radialWeight;
        }
      } else if (lat === null || lng === null || (lat === 0 && lng === 0)) {
        if (!(dataId in placeLocs)) {
          placeLocs[dataId] = [
            placeCenterLat + (Math.random() - 0.5) * placeSpreadLat,
            placeCenterLng + (Math.random() - 0.5) * placeSpreadLng
          ];
        }
        lat = placeLocs[dataId][0];
        lng = placeLocs[dataId][1];
      }

      if (lat === null || lng === null) {
        return;
      }

      const pop = statArray[index * 2] ?? 0;
      const inf = statArray[index * 2 + 1] ?? 0;
      let description = `${pop} people\n${inf} infected`;
      if (type === 'places' && hotspots?.[dataId]) {
        description += `\n\nHotspot at hour${hotspots[dataId].length === 1 ? '' : 's'}: ${hotspots[dataId].map((t) => Math.floor(t / 60)).join(', ')}`;
      }
      icons.push({
        type,
        id: data.id,
        latitude: lat,
        longitude: lng,
        label,
        top_category: type === 'places' ? data.top_category : undefined,
        description,
        footprint: type === 'places' ? (data.footprint ?? null) : null,
        icon:
          (type === 'homes'
            ? iconLookup.Home
            : iconLookup[data.top_category ?? '']) ?? '❓',
        population: pop,
        infected: inf
      });
    });
  };

  processLocs('homes', papData.homes, simData.h);
  processLocs('places', papData.places, simData.p);
  return icons;
}

export function makePeopleDotGeoJSON(pois: MapPoi[], mode: string) {
  const countForMode = (poi: MapPoi) => {
    if (mode === 'infection') return poi.infected;
    return poi.population;
  };
  const totalPeople = pois.reduce((sum, poi) => {
    const value = Number(countForMode(poi));
    return sum + (Number.isFinite(value) ? Math.max(0, value) : 0);
  }, 0);
  const peoplePerDot = Math.max(1, Math.ceil(totalPeople / MAX_PERSON_DOTS));

  const features: PeopleDotFeature[] = [];
  let reachedCap = false;

  for (const poi of pois) {
    const count = Math.max(0, Number(countForMode(poi)));
    if (
      !count ||
      !Number.isFinite(poi?.latitude) ||
      !Number.isFinite(poi?.longitude)
    ) {
      continue;
    }

    const isHome = poi.type === 'homes';
    if (isHome) continue;

    const dotCount = Math.min(
      MAX_PLACE_DOTS_PER_LOCATION,
      Math.ceil(count / peoplePerDot)
    );
    const baseSeed = hashString(`${poi.type}:${poi.id}`);
    const footprintKey = poi.footprint
      ? `${poi.type}:${poi.id}:${dotCount}:${JSON.stringify(poi.footprint)}`
      : '';
    let footprintDots: Coordinate[] | null = null;
    if (!isHome && poi.footprint) {
      footprintDots = placeDotLayouts[footprintKey] ?? null;
      if (!footprintDots) {
        footprintDots = samplePointsInFootprint(
          poi.footprint,
          dotCount,
          baseSeed
        );
        placeDotLayouts[footprintKey] = footprintDots;
      }
    }

    for (let i = 0; i < dotCount; i++) {
      if (features.length >= MAX_PERSON_DOTS) {
        reachedCap = true;
        break;
      }

      const footprintDot =
        footprintDots && i < footprintDots.length ? footprintDots[i] : null;
      const angle = hashUnit(baseSeed, i) * Math.PI * 2;
      const radius =
        Math.sqrt(hashUnit(baseSeed, i + 100_000)) *
        NO_FOOTPRINT_DOT_JITTER_DEGREES;
      const lat = footprintDot
        ? footprintDot[1]
        : poi.latitude + Math.sin(angle) * radius;
      const lng = footprintDot
        ? footprintDot[0]
        : poi.longitude + Math.cos(angle) * radius;

      features.push({
        type: 'Feature',
        properties: {
          id: `${poi.type}-${poi.id}-${i}`,
          loc_id: poi.id,
          loc_type: poi.type,
          label: poi.label,
          disabled: Boolean(poi.disabled)
        },
        geometry: {
          type: 'Point',
          coordinates: [lng, lat]
        }
      });
    }

    if (reachedCap) break;
  }

  return {
    type: 'FeatureCollection',
    features
  } satisfies PeopleDotFeatureCollection;
}

export function makePersonStatusDotGeoJSON(
  pois: MapPoi[],
  peopleMapData: PeopleMapData | null | undefined
) {
  if (!peopleMapData?.locations?.length) {
    return {
      type: 'FeatureCollection',
      features: []
    } satisfies PersonStatusDotFeatureCollection;
  }

  const poiByKey = new Map<string, MapPoi>();
  for (const poi of pois) {
    poiByKey.set(`${poi.type}:${poi.id}`, poi);
  }

  const features: PersonStatusDotFeature[] = [];
  for (const location of peopleMapData.locations) {
    const poi = poiByKey.get(`${location.type}:${location.id}`);
    if (
      !poi ||
      !Number.isFinite(poi.latitude) ||
      !Number.isFinite(poi.longitude)
    ) {
      continue;
    }

    const sortedPeople = [...location.people].sort((left, right) =>
      left.id.localeCompare(right.id)
    );
    const count = sortedPeople.length;
    if (count === 0) continue;

    const layoutKey = `${location.type}:${location.id}:${count}`;
    let positions = personLayoutCache[layoutKey];
    if (!positions) {
      const seed = hashString(layoutKey);
      const footprintPoints =
        location.type === 'places' && poi.footprint
          ? samplePointsInFootprint(poi.footprint, count, seed)
          : [];
      const shortfall = Math.max(0, count - footprintPoints.length);
      const diskPoints =
        shortfall > 0
          ? computeDiskLayout(
              poi.latitude,
              poi.longitude,
              shortfall,
              seed ^ 0x9e3779b1
            )
          : [];
      positions = [...footprintPoints, ...diskPoints];
      personLayoutCache[layoutKey] = positions;
    }

    for (let index = 0; index < count; index++) {
      const person = sortedPeople[index];
      const slot = positions[index];
      const coordinates: Coordinate = slot ?? [poi.longitude, poi.latitude];

      features.push({
        type: 'Feature',
        properties: {
          id: `${location.type}-${location.id}-${person.id}`,
          person_id: person.id,
          loc_id: location.id,
          loc_type: location.type,
          label: poi.label,
          infected: person.infected,
          newly_infected: person.newly_infected,
          recovered: person.recovered,
          disabled: Boolean(poi.disabled)
        },
        geometry: {
          type: 'Point',
          coordinates
        }
      });
    }
  }

  return {
    type: 'FeatureCollection',
    features
  } satisfies PersonStatusDotFeatureCollection;
}

function isFootprintGeometry(
  geometry: GeoJSONGeometry | null | undefined
): geometry is GeoJSONPolygonGeometry {
  return (
    !!geometry &&
    (geometry.type === 'Polygon' || geometry.type === 'MultiPolygon') &&
    Array.isArray(geometry.coordinates)
  );
}

export function makePoiFootprintGeoJSON(pois: MapPoi[]) {
  const features: PoiFootprintFeatureCollection['features'] = [];

  for (const poi of pois) {
    const footprint = poi.footprint;
    if (poi.type !== 'places' || !isFootprintGeometry(footprint)) continue;

    features.push({
      type: 'Feature',
      properties: {
        ...poi,
        infection_ratio: poi.population > 0 ? poi.infected / poi.population : 0
      },
      geometry: footprint
    });
  }

  return {
    type: 'FeatureCollection',
    features
  } satisfies PoiFootprintFeatureCollection;
}

export function makeGeoJSON(pois: MapPoi[]) {
  return {
    type: 'FeatureCollection',
    features: pois.map((poi) => ({
      type: 'Feature',
      properties: {
        ...poi,
        infection_ratio: poi.population > 0 ? poi.infected / poi.population : 0
      },
      geometry: { type: 'Point', coordinates: [poi.longitude, poi.latitude] }
    }))
  } satisfies PoiFeatureCollection;
}
