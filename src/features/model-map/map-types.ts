export type Coordinate = [number, number];

export type GeoJSONGeometry = {
  type?: string;
  coordinates?: unknown;
};

export type GeoJSONFeature = {
  type?: string;
  properties?: Record<string, unknown>;
  geometry?: GeoJSONGeometry | null;
};

export type GeoJSONData = {
  type?: string;
  features?: GeoJSONFeature[];
};

export type HotspotsByLocation = Record<string, number[]>;

export type MapLocation = {
  id: string | number;
  cbg?: unknown;
  latitude?: unknown;
  longitude?: unknown;
  label?: string;
  top_category?: string;
  footprint?: GeoJSONGeometry | null;
};

export type PapDataForMap = {
  homes?: MapLocation[];
  places?: MapLocation[];
};

export type SimTimeDataForMap = {
  h?: number[];
  p?: number[];
};

export type MapPoiType = 'homes' | 'places';

export type MapPoi = {
  type: MapPoiType;
  id: string | number;
  latitude: number;
  longitude: number;
  label: string;
  description: string;
  footprint: GeoJSONGeometry | null;
  icon: string;
  population: number;
  infected: number;
};

export type HouseholdCircleLayout = {
  anchorLat: number;
  anchorLng: number;
  centerLat: number;
  centerLng: number;
  radiusLat: number;
  radiusLng: number;
};

export type HouseholdLayoutBundle = {
  fallback: HouseholdCircleLayout;
  byCbg: Record<string, HouseholdCircleLayout>;
};

export type HouseholdCircleDraft = {
  cbgId: string;
  anchorLat: number;
  anchorLng: number;
  x: number;
  y: number;
  radius: number;
  homeCount: number;
};

export type PeopleDotFeature = {
  type: 'Feature';
  properties: {
    id: string;
    loc_id: string | number;
    loc_type: MapPoiType;
    label: string;
  };
  geometry: {
    type: 'Point';
    coordinates: Coordinate;
  };
};

export type PeopleDotFeatureCollection = {
  type: 'FeatureCollection';
  features: PeopleDotFeature[];
};

export type PoiFeature = {
  type: 'Feature';
  properties: MapPoi & {
    infection_ratio: number;
  };
  geometry: {
    type: 'Point';
    coordinates: Coordinate;
  };
};

export type PoiFeatureCollection = {
  type: 'FeatureCollection';
  features: PoiFeature[];
};
