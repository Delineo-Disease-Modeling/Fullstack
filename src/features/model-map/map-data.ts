// Model-map data layer. The bulk of the geometry/layout/dot logic lives in
// sibling modules (`map-geometry`, `map-layout-caches`, `household-layout`,
// `map-dots`); this file keeps the POI icon table + the `updateIcons`
// orchestrator and re-exports the public API so importers (and the unit tests)
// keep a single import site at `@/features/model-map/map-data`.
import {
  getFeatureCbgId,
  hashString,
  hashUnit,
  normalizeCbgId,
  toNumber
} from './map-geometry.ts';
import {
  buildHouseholdLayout,
  computeCbgHouseholdLayouts
} from './household-layout.ts';
import { layoutCaches } from './map-layout-caches.ts';
import type {
  Coordinate,
  GeoJSONData,
  HotspotsByLocation,
  MapLocation,
  MapPoi,
  MapPoiType,
  PapDataForMap,
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

export {
  clamp,
  getFeatureCbgId,
  getGeometryPoints,
  halton,
  hashString,
  hashUnit,
  normalizeCbgId,
  pointInGeometry,
  quantileSorted,
  samplePointsInFootprint,
  summarizeGeometry,
  toNumber
} from './map-geometry.ts';
export { resetModelMapLayoutCaches } from './map-layout-caches.ts';
export { computeCbgHouseholdLayouts } from './household-layout.ts';
export {
  makeGeoJSON,
  makePeopleDotGeoJSON,
  makePersonStatusDotGeoJSON,
  makePoiFootprintGeoJSON
} from './map-dots.ts';

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

  if (papData.homes && layoutCaches.householdLayoutKey !== homeLayoutKey) {
    layoutCaches.householdLocs = {};
    layoutCaches.householdLayoutKey = homeLayoutKey;
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
        const layout = layoutCaches.householdLocs[dataId];
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
        if (!(dataId in layoutCaches.placeLocs)) {
          layoutCaches.placeLocs[dataId] = [
            placeCenterLat + (Math.random() - 0.5) * placeSpreadLat,
            placeCenterLng + (Math.random() - 0.5) * placeSpreadLng
          ];
        }
        lat = layoutCaches.placeLocs[dataId][0];
        lng = layoutCaches.placeLocs[dataId][1];
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
