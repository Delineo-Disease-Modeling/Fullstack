// GeoJSON builders for the model map's point layers: aggregate "people" dots,
// per-person status dots, POI footprints, and POI markers. Dot layouts are
// memoized in the shared `layoutCaches` (place-dot and person-dot caches).
import {
  halton,
  hashString,
  hashUnit,
  samplePointsInFootprint
} from './map-geometry.ts';
import { layoutCaches } from './map-layout-caches.ts';
import type {
  Coordinate,
  GeoJSONGeometry,
  GeoJSONPolygonGeometry,
  MapPoi,
  PeopleDotFeature,
  PeopleDotFeatureCollection,
  PeopleMapData,
  PersonStatusDotFeature,
  PersonStatusDotFeatureCollection,
  PoiFeatureCollection,
  PoiFootprintFeatureCollection
} from './map-types';

const MAX_PERSON_DOTS = 8000;
const MAX_PLACE_DOTS_PER_LOCATION = 220;
// Spread for POIs that have no footprint polygon (only a point). Kept tight so
// they read as a small cluster on the pin rather than a wide spray of dots that
// look unanchored. POIs that DO have a footprint never use this — their dots are
// clamped inside the polygon.
const NO_FOOTPRINT_DOT_JITTER_DEGREES = 0.00025;
// Cap on how much the no-footprint disk grows with occupancy (radius scales with
// sqrt(count)); keeps even busy footprint-less POIs from spraying too far.
const NO_FOOTPRINT_DISK_MAX_GROWTH = 3;

function computeDiskLayout(
  centerLat: number,
  centerLng: number,
  count: number,
  seed: number
): Coordinate[] {
  if (count <= 0) return [];
  const offsetA = 1 + Math.floor(hashUnit(seed, 11) * 997);
  const offsetB = 1 + Math.floor(hashUnit(seed, 13) * 997);
  // Scale the disk radius with sqrt(count) so density stays roughly constant,
  // capped so a busy footprint-less POI still reads as a contained cluster.
  const radius =
    NO_FOOTPRINT_DOT_JITTER_DEGREES *
    Math.min(NO_FOOTPRINT_DISK_MAX_GROWTH, Math.max(1, Math.sqrt(count / 24)));
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
    // Disabled POIs render as an empty black marker: suppress aggregate dots.
    if (poi.disabled) continue;

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
      footprintDots = layoutCaches.placeDotLayouts[footprintKey] ?? null;
      if (!footprintDots) {
        footprintDots = samplePointsInFootprint(
          poi.footprint,
          dotCount,
          baseSeed
        );
        layoutCaches.placeDotLayouts[footprintKey] = footprintDots;
      }
    }
    const hasFootprintDots = Boolean(footprintDots && footprintDots.length > 0);

    for (let i = 0; i < dotCount; i++) {
      if (features.length >= MAX_PERSON_DOTS) {
        reachedCap = true;
        break;
      }

      let lat: number;
      let lng: number;
      if (hasFootprintDots) {
        // Clamp inside the footprint: cycle interior samples if short so a
        // footprint POI never spills dots outside its polygon.
        const fp = (footprintDots as Coordinate[])[
          i % (footprintDots as Coordinate[]).length
        ];
        lng = fp[0];
        lat = fp[1];
      } else {
        // No footprint: a tight jitter disk around the POI point.
        const angle = hashUnit(baseSeed, i) * Math.PI * 2;
        const radius =
          Math.sqrt(hashUnit(baseSeed, i + 100_000)) *
          NO_FOOTPRINT_DOT_JITTER_DEGREES;
        lat = poi.latitude + Math.sin(angle) * radius;
        lng = poi.longitude + Math.cos(angle) * radius;
      }

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
    // Disabled POIs render as an empty black marker: suppress their people
    // dots entirely (visitors were rerouted away) rather than recoloring them.
    if (poi.disabled) {
      continue;
    }

    const sortedPeople = [...location.people].sort((left, right) =>
      left.id.localeCompare(right.id)
    );
    const count = sortedPeople.length;
    if (count === 0) continue;

    const layoutKey = `${location.type}:${location.id}:${count}`;
    let positions = layoutCaches.personLayoutCache[layoutKey];
    if (!positions) {
      const seed = hashString(layoutKey);
      const footprintPoints =
        location.type === 'places' && poi.footprint
          ? samplePointsInFootprint(poi.footprint, count, seed)
          : [];
      if (footprintPoints.length >= count) {
        positions = footprintPoints;
      } else if (footprintPoints.length > 0) {
        // Footprint POI whose sampling fell short (thin/awkward polygon): cycle
        // the interior points so dots NEVER spill outside the footprint.
        positions = Array.from(
          { length: count },
          (_, i) => footprintPoints[i % footprintPoints.length]
        );
      } else {
        // No usable footprint: a tight disk around the POI point.
        positions = computeDiskLayout(
          poi.latitude,
          poi.longitude,
          count,
          seed ^ 0x9e3779b1
        );
      }
      layoutCaches.personLayoutCache[layoutKey] = positions;
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
