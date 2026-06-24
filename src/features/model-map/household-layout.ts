// Household (home) placement for the model map: turns CBG boundary geometry +
// per-home coordinates into relaxed, non-overlapping household circles and
// per-home dot positions. The per-home positions are memoized in the shared
// `layoutCaches.householdLocs`.
import {
  clamp,
  getFeatureCbgId,
  getGeometryPoints,
  hashString,
  hashUnit,
  normalizeCbgId,
  quantileSorted,
  summarizeGeometry,
  toNumber
} from './map-geometry.ts';
import { layoutCaches } from './map-layout-caches.ts';
import type {
  GeoJSONData,
  HouseholdCircleDraft,
  HouseholdCircleLayout,
  HouseholdLayoutBundle,
  MapLocation
} from './map-types';

const HOME_CIRCLE_RADIUS_FACTOR = 0.18;
const HOME_CIRCLE_RADIUS_MIN = 0.008;
const HOME_CIRCLE_RADIUS_MAX = 0.025;
const HOME_CIRCLE_RADIUS_QUANTILE = 0.95;

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

export function buildHouseholdLayout(
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
        layoutCaches.householdLocs[home.id] = [
          layout.centerLat +
            Math.sin(home.angle) * layout.radiusLat * radialWeight,
          layout.centerLng +
            Math.cos(home.angle) * layout.radiusLng * radialWeight
        ];
      }
    }

    for (const home of groupHomes) {
      const id = String(home.id);
      if (id in layoutCaches.householdLocs) continue;

      const seed = hashString(`home:${id}`);
      const angle = hashUnit(seed, 1) * Math.PI * 2;
      const radialWeight = Math.sqrt(hashUnit(seed, 2));
      layoutCaches.householdLocs[id] = [
        layout.centerLat + Math.sin(angle) * layout.radiusLat * radialWeight,
        layout.centerLng + Math.cos(angle) * layout.radiusLng * radialWeight
      ];
    }
  }
}
