'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Layer, Map as MapLibreMap, Popup, Source } from 'react-map-gl/maplibre';
import type { MapRef } from 'react-map-gl/maplibre';
import useMapData from '@/stores/mapdata';

import 'maplibre-gl/dist/maplibre-gl.css';
import '@/styles/modelmap.css';
import MapLegend from './maplegend';
import Slider from '@/components/ui/slider';
import Button from '@/components/ui/button';
import {
  getFeatureCbgId,
  getGeometryPoints,
  normalizeCbgId,
  type GeoJSONData
} from '@/lib/cz-geo';

const icon_lookup: Record<string, string> = {
  'Depository Credit Intermediation': '🏦',
  'Restaurants and Other Eating Places': '🍽️',
  'Offices of Physicians': '🏥',
  'Religious Organizations': '⛪',
  'Personal Care Services': '🏢',
  'Child Day Care Services': '🏫',
  'Death Care Services': '🪦',
  'Elementary and Secondary Schools': '🏫',
  'Florists': '💐',
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
  'Home': '🏠'
};

const ALG_URL = process.env.NEXT_PUBLIC_ALG_URL || 'http://localhost:1880/';

let household_locs: Record<string, [number, number]> = {};
let place_locs: Record<string, [number, number]> = {};
let place_dot_layouts: Record<string, [number, number][]> = {};
let household_layout_key = '';

const HOME_CIRCLE_RADIUS_FACTOR = 0.18;
const HOME_CIRCLE_RADIUS_MIN = 0.008;
const HOME_CIRCLE_RADIUS_MAX = 0.025;
const HOME_CIRCLE_RADIUS_QUANTILE = 0.95;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function quantileSorted(values: number[], quantile: number) {
  if (!values.length) return 0;
  const index = clamp(
    Math.round((values.length - 1) * quantile),
    0,
    values.length - 1
  );
  return values[index];
}

function getRingPoints(value: unknown) {
  if (!Array.isArray(value)) return [] as Array<[number, number]>;

  const points: Array<[number, number]> = [];
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

function getGeometryRings(geometry: any) {
  const rings: Array<Array<[number, number]>> = [];
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

function getPolygonGroups(
  geometry: { type?: string; coordinates?: unknown } | null | undefined
) {
  const groups: Array<Array<Array<[number, number]>>> = [];
  if (!geometry?.type || !Array.isArray(geometry.coordinates)) return groups;

  if (geometry.type === 'Polygon') {
    const polygon: Array<Array<[number, number]>> = [];
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
      const polygon: Array<Array<[number, number]>> = [];
      for (const ring of polygonCoords) {
        const points = getRingPoints(ring);
        if (points.length >= 3) polygon.push(points);
      }
      if (polygon.length) groups.push(polygon);
    }
  }

  return groups;
}

function pointInRing(
  lng: number,
  lat: number,
  ring: Array<[number, number]>
) {
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

function pointInGeometry(
  lng: number,
  lat: number,
  geometry: { type?: string; coordinates?: unknown } | null | undefined
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

function samplePointsInFootprint(
  geometry: { type?: string; coordinates?: unknown } | null | undefined,
  count: number,
  seed: number
) {
  if (!geometry || count <= 0) return [] as Array<[number, number]>;

  const points = getGeometryPoints(geometry as any);
  if (!points.length) return [] as Array<[number, number]>;

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
    return [] as Array<[number, number]>;
  }

  const accepted: Array<[number, number]> = [];
  const offsetA = 1 + Math.floor(hashUnit(seed, 17) * 997);
  const offsetB = 1 + Math.floor(hashUnit(seed, 23) * 997);
  const maxAttempts = Math.max(240, count * 80);

  for (let attempt = 0; attempt < maxAttempts && accepted.length < count; attempt += 1) {
    const lng = minLng + halton(attempt + offsetA, 2) * (maxLng - minLng);
    const lat = minLat + halton(attempt + offsetB, 3) * (maxLat - minLat);
    if (pointInGeometry(lng, lat, geometry)) {
      accepted.push([lng, lat]);
    }
  }

  return accepted;
}

function summarizeGeometry(
  geometry: any,
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

type HouseholdCircleLayout = {
  anchorLat: number;
  anchorLng: number;
  centerLat: number;
  centerLng: number;
  radiusLat: number;
  radiusLng: number;
};

type HouseholdLayoutBundle = {
  fallback: HouseholdCircleLayout;
  byCbg: Record<string, HouseholdCircleLayout>;
};

type HouseholdCircleDraft = {
  cbgId: string;
  anchorLat: number;
  anchorLng: number;
  x: number;
  y: number;
  radius: number;
  homeCount: number;
};

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

function computeCbgHouseholdLayouts(
  zoneGeoJSON: GeoJSONData | null,
  homes: any[],
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
    boundaryPoints.reduce((sum, [, lat]) => sum + lat, 0) / boundaryPoints.length;
  const longitudeScale = Math.max(Math.cos((referenceLat * Math.PI) / 180), 0.35);

  const homesByCbg = new Map<string, any[]>();
  for (const home of homes ?? []) {
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
        const lat =
          typeof home?.latitude === 'number'
            ? home.latitude
            : Number(home?.latitude);
        const lng =
          typeof home?.longitude === 'number'
            ? home.longitude
            : Number(home?.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) {
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
      const capacityRadius = Math.sqrt(circle.homeCount / (Math.PI * targetDensity));
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
  homes: any[],
  layouts: HouseholdLayoutBundle
) {
  if (!homes?.length) return;

  const num = (v: unknown): number | null => {
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : null;
  };

  const groups = new Map<string, any[]>();
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
        : layouts.byCbg[groupKey] ?? layouts.fallback;
    const sourceCos = Math.max(Math.cos((layout.anchorLat * Math.PI) / 180), 0.35);

    const validHomes = groupHomes
      .map((home) => {
        const lat = num(home.latitude);
        const lng = num(home.longitude);
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
      .filter(Boolean) as { id: string; angle: number; distance: number }[];

    const sortedDistances = validHomes
      .map((home) => home.distance)
      .sort((left, right) => left - right);
    const sourceRadius = sortedDistances.length
      ? quantileSorted(sortedDistances, HOME_CIRCLE_RADIUS_QUANTILE)
      : 0;

    if (sourceRadius > 1e-9) {
      for (const home of validHomes) {
        const radialWeight = clamp(home.distance / sourceRadius, 0, 1);
        household_locs[home.id] = [
          layout.centerLat + Math.sin(home.angle) * layout.radiusLat * radialWeight,
          layout.centerLng + Math.cos(home.angle) * layout.radiusLng * radialWeight
        ];
      }
    }

    for (const home of groupHomes) {
      const id = String(home.id);
      if (id in household_locs) continue;

      const seed = hashString(`home:${id}`);
      const angle = hashUnit(seed, 1) * Math.PI * 2;
      const radialWeight = Math.sqrt(hashUnit(seed, 2));
      household_locs[id] = [
        layout.centerLat + Math.sin(angle) * layout.radiusLat * radialWeight,
        layout.centerLng + Math.cos(angle) * layout.radiusLng * radialWeight
      ];
    }
  }
}

function updateIcons(
  mapCenter: [number, number],
  sim_data: any,
  pap_data: any,
  hotspots: any,
  zoneGeoJSON: GeoJSONData | null
) {
  const icons: any[] = [];
  if (!sim_data || !pap_data) return icons;

  let minLat = Infinity,
    maxLat = -Infinity,
    minLng = Infinity,
    maxLng = -Infinity;
  let validPlaceCount = 0;

  // Older map.json caches can have lat/lon stored as strings (from papdata
  // where pandas inferred the CSV column as object dtype). Coerce on read so
  // Number.isFinite downstream doesn't reject every POI.
  const num = (v: unknown): number | null => {
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : null;
  };

  if (pap_data.places) {
    for (const pdata of pap_data.places) {
      const lat = num(pdata.latitude);
      const lng = num(pdata.longitude);
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
  const placeSpreadLat = hasPlaceBounds ? Math.max(maxLat - minLat, 0.02) : 0.06;
  const placeSpreadLng = hasPlaceBounds ? Math.max(maxLng - minLng, 0.02) : 0.06;
  const householdLayouts = computeCbgHouseholdLayouts(
    zoneGeoJSON,
    pap_data.homes,
    placeCenterLat,
    placeCenterLng,
    placeSpreadLat,
    placeSpreadLng
  );
  const zoneKey = zoneGeoJSON?.features?.length
    ? zoneGeoJSON.features.map((feature) => getFeatureCbgId(feature)).join(',')
    : 'no-zone';
  let homeChecksum = 0;
  for (const home of pap_data.homes ?? []) {
    const lat = num(home?.latitude);
    const lng = num(home?.longitude);
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
  const homeLayoutKey = Array.isArray(pap_data.homes)
    ? [
        pap_data.homes.length,
        homeChecksum,
        zoneKey,
        circleDigest,
        householdLayouts.fallback.centerLat.toFixed(4),
        householdLayouts.fallback.centerLng.toFixed(4),
        householdLayouts.fallback.radiusLat.toFixed(4)
      ].join(':')
    : 'empty';

  if (pap_data.homes && household_layout_key !== homeLayoutKey) {
    household_locs = {};
    household_layout_key = homeLayoutKey;
    buildHouseholdLayout(pap_data.homes, householdLayouts);
  }

  const processLocs = (type: string, dataArray: any[], statArray: number[]) => {
    if (!dataArray || !statArray) return;
    dataArray.forEach((data, index) => {
      let lat: number | null = num(data.latitude);
      let lng: number | null = num(data.longitude);
      if (type === 'homes') {
        data.label = `Home #${data.id}`;
        const layout = household_locs[String(data.id)];
        if (layout) {
          lat = layout[0];
          lng = layout[1];
        } else {
          const cbgId = normalizeCbgId(data?.cbg);
          const circle =
            (cbgId && householdLayouts.byCbg[cbgId]) || householdLayouts.fallback;
          const seed = hashString(`home:${data.id}`);
          const angle = hashUnit(seed, 1) * Math.PI * 2;
          const radialWeight = Math.sqrt(hashUnit(seed, 2));
          lat =
            circle.centerLat + Math.sin(angle) * circle.radiusLat * radialWeight;
          lng =
            circle.centerLng + Math.cos(angle) * circle.radiusLng * radialWeight;
        }
      } else if (lat === null || lng === null || (lat === 0 && lng === 0)) {
        if (!(data.id in place_locs)) {
          place_locs[data.id] = [
            placeCenterLat + (Math.random() - 0.5) * placeSpreadLat,
            placeCenterLng + (Math.random() - 0.5) * placeSpreadLng
          ];
        }
        lat = place_locs[data.id][0];
        lng = place_locs[data.id][1];
      }

      const pop = statArray[index * 2] ?? 0;
      const inf = statArray[index * 2 + 1] ?? 0;
      let description = `${pop} people\n${inf} infected`;
      if (type === 'places' && hotspots?.[data.id]) {
        description += `\n\nHotspot at hour${hotspots[data.id].length === 1 ? '' : 's'}: ${hotspots[data.id].map((t: number) => Math.floor(t / 60)).join(', ')}`;
      }
      icons.push({
        type,
        id: data.id,
        latitude: lat,
        longitude: lng,
        label: data.label,
        description,
        footprint: type === 'places' ? (data.footprint ?? null) : null,
        icon:
          (type === 'homes'
            ? icon_lookup.Home
            : icon_lookup[data.top_category]) ?? '❓',
        population: pop,
        infected: inf
      });
    });
  };

  processLocs('homes', pap_data.homes, sim_data.h);
  processLocs('places', pap_data.places, sim_data.p);
  return icons;
}

function applyAlpha(hex: string, alpha: number) {
  const bigint = parseInt(hex.replace('#', ''), 16);
  return `rgba(${(bigint >> 16) & 255},${(bigint >> 8) & 255},${bigint & 255},${alpha})`;
}

function EmojiOverlay({
  map,
  hotspots = {}
}: {
  map: any;
  hotspots: Record<string, number[]>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!map) return;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;

    function drawEmojis() {
      const { width, height } = map.getContainer().getBoundingClientRect();
      canvas.width = width;
      canvas.height = height;
      ctx.clearRect(0, 0, width, height);
      const features = map.queryRenderedFeatures(undefined, {
        source: 'points'
      });
      if (!features?.length) return;
      const zoom = map.getZoom();
      const time = Date.now() / 1000;
      features.forEach((f: any) => {
        const props = f.properties;
        if (!props || props.cluster || !props.icon) return;
        const [lng, lat] = f.geometry.coordinates;
        const pixel = map.project([lng, lat]);
        const infectionRatio = parseFloat(props.infection_ratio || 0);
        const adjusted = Math.sqrt(infectionRatio);
        let baseColor = '#4CAF50';
        if (adjusted >= 0.5) baseColor = '#F44336';
        else if (adjusted >= 0.35) baseColor = '#FF9800';
        else if (adjusted >= 0.2) baseColor = '#FFEB3B';
        const size = 6 + zoom * 1.2;
        const isHotspot =
          props.type === 'places' &&
          hotspots &&
          Object.keys(hotspots).includes(props.id);
        const pulse = isHotspot
          ? 0.5 + 0.5 * Math.sin(time * 4 + (parseInt(props.id, 36) % 10))
          : 0;
        const pulseSize = size * (1 + 0.3 * pulse);
        const pulseAlpha = isHotspot ? 0.4 + 0.4 * pulse : 1.0;
        ctx.beginPath();
        ctx.arc(pixel.x, pixel.y, pulseSize * 0.6, 0, Math.PI * 2);
        ctx.fillStyle = applyAlpha(baseColor, pulseAlpha);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.font = `${size}px 'Noto Color Emoji', sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(props.icon, pixel.x, pixel.y);
      });
    }

    map.on('render', drawEmojis);
    drawEmojis();
    return () => map.off('render', drawEmojis);
  }, [map, hotspots]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex: 5,
        pointerEvents: 'none'
      }}
    />
  );
}

const MAX_PERSON_DOTS = 8000;
const MAX_PLACE_DOTS_PER_LOCATION = 220;
const NO_FOOTPRINT_DOT_JITTER_DEGREES = 0.0008;

function hashString(input: string) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function hashUnit(seed: number, salt = 0) {
  let x = (seed + salt * 374761393) >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 2246822519);
  x ^= x >>> 13;
  x = Math.imul(x, 3266489917);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967295;
}

function makePeopleDotGeoJSON(pois: any[], mode: string) {
  const countKey = mode === 'infection' ? 'infected' : 'population';
  const totalPeople = pois.reduce((sum, poi) => {
    const value = Number(poi?.[countKey] ?? 0);
    return sum + (Number.isFinite(value) ? Math.max(0, value) : 0);
  }, 0);
  const peoplePerDot = Math.max(1, Math.ceil(totalPeople / MAX_PERSON_DOTS));

  const features: any[] = [];
  let reachedCap = false;

  for (const poi of pois) {
    const count = Math.max(0, Number(poi?.[countKey] ?? 0));
    if (!count || !Number.isFinite(poi?.latitude) || !Number.isFinite(poi?.longitude)) {
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
    let footprintDots: [number, number][] | null = null;
    if (!isHome && poi.footprint) {
      footprintDots = place_dot_layouts[footprintKey] ?? null;
      if (!footprintDots) {
        footprintDots = samplePointsInFootprint(
          poi.footprint,
          dotCount,
          baseSeed
        );
        place_dot_layouts[footprintKey] = footprintDots;
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
      const lat = footprintDot ? footprintDot[1] : poi.latitude + Math.sin(angle) * radius;
      const lng = footprintDot ? footprintDot[0] : poi.longitude + Math.cos(angle) * radius;

      features.push({
        type: 'Feature',
        properties: {
          id: `${poi.type}-${poi.id}-${i}`,
          loc_id: poi.id,
          loc_type: poi.type,
          label: poi.label,
        },
        geometry: {
          type: 'Point',
          coordinates: [lng, lat],
        },
      });
    }

    if (reachedCap) break;
  }

  return {
    type: 'FeatureCollection',
    features,
  };
}

function makeGeoJSON(pois: any[]) {
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
  };
}

interface ClusteredMapProps {
  currentTime: number;
  mapCenter: [number, number];
  pois: any[];
  zoneGeoJSON: any;
  hotspots: Record<string, number[]>;
  onMarkerClick: (info: { id: string; label: string; type: string }) => void;
  heatmapMode: string;
  peopleDotGeoJSON: any;
  peopleDotColor: string;
}

function ClusteredMap({
  currentTime: _currentTime,
  mapCenter,
  pois,
  zoneGeoJSON,
  hotspots,
  onMarkerClick,
  heatmapMode,
  peopleDotGeoJSON,
  peopleDotColor
}: ClusteredMapProps) {
  const mapRef = useRef<MapRef>(null);
  const [mapInstance, setMapInstance] = useState<any>(null);
  const [popupInfo, setPopupInfo] = useState<any>(null);
  const hasFitBounds = useRef(false);

  useEffect(() => {
    if (!mapInstance || !pois.length || hasFitBounds.current) return;
    let minLat = Infinity,
      maxLat = -Infinity,
      minLng = Infinity,
      maxLng = -Infinity;
    for (const poi of pois) {
      if (Number.isFinite(poi.latitude) && Number.isFinite(poi.longitude)) {
        minLat = Math.min(minLat, poi.latitude);
        maxLat = Math.max(maxLat, poi.latitude);
        minLng = Math.min(minLng, poi.longitude);
        maxLng = Math.max(maxLng, poi.longitude);
      }
    }
    if (minLat === Infinity) return;
    if (maxLat - minLat > 0.06 || maxLng - minLng > 0.06) {
      mapInstance.fitBounds(
        [
          [minLng, minLat],
          [maxLng, maxLat]
        ],
        { padding: 40, duration: 800, maxZoom: 14 }
      );
    }
    hasFitBounds.current = true;
  }, [mapInstance, pois]);

  useEffect(() => {
    if (!mapInstance) return;
    const markerLayers = [
      'clusters',
      'cluster-count',
      'unclustered-point-circle',
      'unclustered-point-emoji'
    ];
    const isMarkers = heatmapMode === 'markers';
    for (const id of markerLayers) {
      if (mapInstance.getLayer(id))
        mapInstance.setLayoutProperty(
          id,
          'visibility',
          isMarkers ? 'visible' : 'none'
        );
    }
    const isDots =
      heatmapMode === 'population' || heatmapMode === 'infection';
    for (const id of ['people-dots-places']) {
      if (mapInstance.getLayer(id))
        mapInstance.setLayoutProperty(
          id,
          'visibility',
          isDots ? 'visible' : 'none'
        );
    }
  }, [heatmapMode, mapInstance]);

  const handleMapLoad = (event: any) => {
    const map = event.target;
    setMapInstance(map);
  };

  useEffect(() => {
    if (!mapInstance) return;
    const frame = requestAnimationFrame(() => {
      const data = makeGeoJSON(pois);
      const source = mapInstance.getSource('points');
      if (source?.setData) source.setData(data);
    });
    return () => cancelAnimationFrame(frame);
  }, [pois, mapInstance]);

  useEffect(() => {
    setPopupInfo(null);
  }, []);

  const geojson = makeGeoJSON(pois);

  const handleClick = (event: any) => {
    const feature = event.features?.[0];
    if (!feature?.properties) return;
    const map = event.target;
    if (feature.properties.cluster) {
      const clusterId = feature.properties.cluster_id;
      map
        .getSource('points')
        .getClusterExpansionZoom(clusterId)
        .then((zoom: number) => {
          map.easeTo({
            center: feature.geometry.coordinates,
            zoom: zoom + 0.5,
            duration: 600
          });
        });
      return;
    }
    onMarkerClick({
      id: feature.properties.id,
      label: feature.properties.label,
      type: feature.properties.type
    });
    const coords = feature.geometry.coordinates;
    map.easeTo({
      center: coords,
      zoom: Math.max(map.getZoom(), 15),
      duration: 600
    });
    setPopupInfo(null);
    setTimeout(
      () =>
        setPopupInfo({
          coordinates: coords,
          label: feature.properties.label,
          description: feature.properties.description,
          icon: feature.properties.icon,
          id: feature.properties.id
        }),
      250
    );
  };

  const clusterColor = [
    'case',
    ['==', ['get', 'population'], 0],
    '#4CAF50',
    [
      'interpolate',
      ['linear'],
      ['sqrt', ['/', ['get', 'infected'], ['get', 'population']]],
      0,
      '#4CAF50',
      0.15,
      '#FFEB3B',
      0.35,
      '#FF9800',
      0.5,
      '#F44336'
    ]
  ];

  return (
    <div className="mapcontainer">
      <MapLibreMap
        ref={mapRef}
        onLoad={handleMapLoad}
        initialViewState={{
          latitude: mapCenter[0],
          longitude: mapCenter[1],
          zoom: 13
        }}
        style={{ width: '100%', height: '100%' }}
        mapStyle="https://basemaps.cartocdn.com/gl/positron-gl-style/style.json"
        interactiveLayerIds={[
          'clusters',
          'unclustered-point-circle',
          'unclustered-point-emoji'
        ]}
        onClick={handleClick}
      >
        {zoneGeoJSON?.features?.length ? (
          <Source id="zone-cbgs" type="geojson" data={zoneGeoJSON}>
            <Layer
              id="zone-cbgs-fill"
              type="fill"
              paint={{
                'fill-color': '#2563eb',
                'fill-opacity': 0.08
              }}
            />
            <Layer
              id="zone-cbgs-outline"
              type="line"
              paint={{
                'line-color': '#1d4ed8',
                'line-width': [
                  'interpolate',
                  ['linear'],
                  ['zoom'],
                  8, 0.8,
                  11, 1.2,
                  14, 2
                ] as any,
                'line-opacity': 0.45
              }}
            />
          </Source>
        ) : null}
        <Source
          id="points"
          type="geojson"
          data={geojson as any}
          cluster={true}
          clusterMaxZoom={18}
          clusterRadius={75}
          clusterMinPoints={3}
          clusterProperties={{
            population: ['+', ['to-number', ['get', 'population']]],
            infected: ['+', ['to-number', ['get', 'infected']]]
          }}
        >
          <Layer
            id="clusters"
            type="circle"
            filter={['has', 'point_count']}
            paint={{
              'circle-color': clusterColor as any,
              'circle-radius': [
                'step',
                ['get', 'point_count'],
                22,
                10,
                28,
                25,
                34
              ],
              'circle-opacity': 1,
              'circle-stroke-width': 1,
              'circle-stroke-color': '#fff'
            }}
          />
          <Layer
            id="cluster-count"
            type="symbol"
            filter={['has', 'point_count']}
            layout={{
              'text-field': [
                'format',
                ['get', 'population'],
                { 'font-scale': 1.2 },
                '\n',
                ['concat', 'Inf: ', ['get', 'infected']],
                { 'font-scale': 0.8 }
              ],
              'text-size': 12,
              'text-allow-overlap': true
            }}
            paint={{ 'text-color': '#fff', 'text-opacity': 1 }}
          />
          <Layer
            id="unclustered-point-circle"
            type="circle"
            filter={['!', ['has', 'point_count']]}
            paint={{
              'circle-radius': 14,
              'circle-color': clusterColor as any,
              'circle-opacity': 1,
              'circle-stroke-color': '#fff',
              'circle-stroke-width': 1
            }}
          />
          <Layer
            id="unclustered-point-emoji"
            type="symbol"
            filter={['!', ['has', 'point_count']]}
            layout={{
              'text-field': ['get', 'icon'],
              'text-size': 18,
              'text-allow-overlap': true,
              'text-font': ['Open Sans Regular']
            }}
            paint={{ 'text-color': '#000000', 'text-opacity': 1 }}
          />
        </Source>
        <Source id="people-dots" type="geojson" data={peopleDotGeoJSON}>
          <Layer
            id="people-dots-places"
            type="circle"
            filter={['!=', ['get', 'loc_type'], 'homes']}
            layout={
              {
                visibility:
                  heatmapMode === 'population' || heatmapMode === 'infection'
                    ? 'visible'
                    : 'none'
              } as any
            }
            paint={{
              'circle-radius': [
                'interpolate',
                ['linear'],
                ['zoom'],
                10, 1.5,
                13, 2.5,
                16, 4,
                18, 6,
              ] as any,
              'circle-color': peopleDotColor,
              'circle-opacity': 0.72,
              'circle-stroke-width': 0,
            }}
          />
        </Source>
        {zoneGeoJSON?.features?.length ? (
          <Source id="zone-cbgs-top-outline" type="geojson" data={zoneGeoJSON}>
            <Layer
              id="zone-cbgs-top-outline"
              type="line"
              paint={{
                'line-color': '#1d4ed8',
                'line-width': [
                  'interpolate',
                  ['linear'],
                  ['zoom'],
                  8, 1,
                  11, 1.5,
                  14, 2.4
                ] as any,
                'line-opacity': 0.8
              }}
            />
          </Source>
        ) : null}
        {popupInfo && (
          <Popup
            longitude={popupInfo.coordinates[0]}
            latitude={popupInfo.coordinates[1]}
            anchor="top"
            closeButton={false}
            onClose={() => setPopupInfo(null)}
            style={{ zIndex: 10, marginTop: '1rem' }}
          >
            <div className="max-w-36 whitespace-pre-line font-[Poppins] text-center">
              <div className="text-2xl mb-0.5 font-['Noto_Color_Emoji']">{popupInfo.icon}</div>
              <header className="text-sm font-bold mb-0.5">
                {popupInfo.label}
              </header>
              <p className="text-xs">{popupInfo.description}</p>
            </div>
          </Popup>
        )}
      </MapLibreMap>
      {mapInstance && heatmapMode === 'markers' && (
        <EmojiOverlay map={mapInstance} hotspots={hotspots} />
      )}
    </div>
  );
}

interface ModelMapProps {
  onMarkerClick: (info: { id: string; label: string; type: string }) => void;
  selectedZone: {
    latitude: number;
    longitude: number;
    cbg_list?: string[];
    start_date: string;
    length: number;
  };
}

export default function ModelMap({
  onMarkerClick,
  selectedZone
}: ModelMapProps) {
  const sim_data = useMapData((state) => state.simdata);
  const pap_data = useMapData((state) => state.papdata);
  const hotspots = useMapData((state) => state.hotspots) || {};
  const [zoneGeoJSON, setZoneGeoJSON] = useState<any>(null);

  const [maxHours, setMaxHours] = useState(1);
  const [currentTime, setCurrentTime] = useState(1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [heatmapMode, setHeatmapMode] = useState('markers');

  useEffect(() => {
    household_locs = {};
    place_locs = {};
    place_dot_layouts = {};
    household_layout_key = '';
  }, []);

  useEffect(() => {
    const cbgList = selectedZone?.cbg_list?.filter(Boolean) ?? [];
    if (cbgList.length === 0) {
      setZoneGeoJSON(null);
      return;
    }

    const controller = new AbortController();
    const cbgs = cbgList.join(',');
    const url = new URL('cbg-geojson', ALG_URL);
    url.searchParams.set('cbgs', cbgs);
    url.searchParams.set('include_neighbors', 'false');

    fetch(url.toString(), { signal: controller.signal })
      .then((resp) => (resp.ok ? resp.json() : null))
      .then((data) => {
        if (!controller.signal.aborted) {
          setZoneGeoJSON(data?.features?.length ? data : null);
        }
      })
      .catch((err) => {
        if ((err as Error)?.name !== 'AbortError') {
          console.warn('Failed to load zone CBG overlay:', err);
        }
      });

    return () => controller.abort();
  }, [selectedZone]);

  const availableTimesteps = useMemo(() => {
    if (!sim_data) return [];
    return Object.keys(sim_data)
      .map(Number)
      .filter((n) => !Number.isNaN(n))
      .sort((a, b) => a - b);
  }, [sim_data]);

  const findNearestTimestep = useCallback(
    (targetMinutes: number) => {
      if (availableTimesteps.length === 0) return null;
      let closest = availableTimesteps[0];
      for (const ts of availableTimesteps) {
        if (Math.abs(ts - targetMinutes) < Math.abs(closest - targetMinutes))
          closest = ts;
        if (ts > targetMinutes) break;
      }
      return closest;
    },
    [availableTimesteps]
  );

  const mapCenter = useMemo(
    () => [selectedZone.latitude, selectedZone.longitude] as [number, number],
    [selectedZone]
  );

  const pois = useMemo(() => {
    const targetMinutes = currentTime * 60;
    const nearestTs = findNearestTimestep(targetMinutes);
    const dataForTime =
      nearestTs !== null ? sim_data?.[nearestTs.toString()] : null;
    return updateIcons(mapCenter, dataForTime, pap_data, hotspots, zoneGeoJSON);
  }, [
    currentTime,
    hotspots,
    mapCenter,
    pap_data,
    sim_data,
    findNearestTimestep,
    zoneGeoJSON
  ]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (!isPlaying || availableTimesteps.length === 0) return;
      setCurrentTime((prev) => {
        const currentMinutes = Math.round(prev * 60);
        const nextIndex = availableTimesteps.findIndex(
          (ts) => ts > currentMinutes
        );
        if (nextIndex === -1) return prev;
        return availableTimesteps[nextIndex] / 60;
      });
    }, 750);
    return () => clearInterval(interval);
  }, [isPlaying, availableTimesteps]);

  const peopleDotColor = heatmapMode === 'infection' ? '#e53e3e' : '#3182ce';

  const peopleDotGeoJSON = useMemo(() => {
    if (heatmapMode !== 'population' && heatmapMode !== 'infection') {
      return { type: 'FeatureCollection', features: [] };
    }
    return makePeopleDotGeoJSON(pois, heatmapMode);
  }, [pois, heatmapMode]);

  useEffect(() => {
    if (sim_data) {
      const keys = Object.keys(sim_data)
        .map(Number)
        .filter((n) => !Number.isNaN(n));
      setMaxHours(keys.length > 0 ? Math.max(...keys) / 60 : 1);
    }
  }, [sim_data]);

  return (
    <div>
      <div className="heatmap-toggle">
        <MapLegend icon_lookup={icon_lookup} />
        <div className="heatmap-toggle-group">
          <Button
            variant={heatmapMode === 'markers' ? 'primary' : 'secondary'}
            className='text-xs'
            onClick={() => setHeatmapMode('markers')}
          >
            Markers
          </Button>
          <Button
            variant={heatmapMode === 'population' ? 'primary' : 'secondary'}
            className='text-xs'
            onClick={() => setHeatmapMode('population')}
          >
            Population
          </Button>
          <Button
            variant={heatmapMode === 'infection' ? 'primary' : 'secondary'}
            className='text-xs'
            onClick={() => setHeatmapMode('infection')}
          >
            Infection
          </Button>
        </div>
      </div>
      <ClusteredMap
        currentTime={currentTime}
        mapCenter={mapCenter}
        pois={pois}
        zoneGeoJSON={zoneGeoJSON}
        hotspots={hotspots as Record<string, number[]>}
        onMarkerClick={onMarkerClick}
        heatmapMode={heatmapMode}
        peopleDotGeoJSON={peopleDotGeoJSON}
        peopleDotColor={peopleDotColor}
      />
      <div className="mt-3 text-center w-full">
        {new Date(
          new Date(selectedZone.start_date).getTime() +
            currentTime * 60 * 60 * 1000
        ).toLocaleString('en-US', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
          weekday: 'short',
          hour: 'numeric',
          minute: '2-digit',
          timeZone: 'UTC'
        })}
      </div>
      <div className="flex items-center justify-center gap-3 mt-3">
        <Button
          variant='primary'
          className='py-1!'
          onClick={() => setIsPlaying(!isPlaying)}
        >
          {isPlaying ? (
            <i className="bi bi-pause-fill" />
          ) : (
            <i className="bi bi-play-fill" />
          )}
        </Button>
        <Slider
          className="w-full max-w-[90vw]"
          min={1}
          max={maxHours}
          value={currentTime}
          onChange={(e) => setCurrentTime(parseInt(e.target.value, 10))}
        />
      </div>
      <div className="flex justify-center mt-3">
        <input
          className="w-[10%] px-1 bg-(--color-bg-ivory) outline-solid outline-2 outline-(--color-primary-blue)"
          type="number"
          min={1}
          max={maxHours}
          value={currentTime}
          onChange={(e) => setCurrentTime(parseInt(e.target.value, 10))}
        />
      </div>
    </div>
  );
}
