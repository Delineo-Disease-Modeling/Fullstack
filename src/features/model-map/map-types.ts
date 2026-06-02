export type Coordinate = [number, number];

export type GeoJSONGeometry = {
  type?: string;
  coordinates?: unknown;
};

type GeoJSONPosition = number[];

export type GeoJSONPolygonGeometry =
  | {
      type: 'Polygon';
      coordinates: GeoJSONPosition[][];
    }
  | {
      type: 'MultiPolygon';
      coordinates: GeoJSONPosition[][][];
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
  top_category?: string;
  description: string;
  footprint: GeoJSONGeometry | null;
  icon: string;
  population: number;
  infected: number;
  disabled?: boolean;
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
    disabled: boolean;
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

export type PeopleMapPerson = {
  id: string;
  infected: boolean;
  newly_infected: boolean;
  recovered: boolean;
};

export type PeopleMapLocation = {
  type: MapPoiType;
  id: string;
  people: PeopleMapPerson[];
};

export type PeopleMapData = {
  time: number;
  requested_time: number;
  total_people: number;
  returned_people: number;
  sample_rate: number;
  locations: PeopleMapLocation[];
};

export type PersonStatusDotFeature = {
  type: 'Feature';
  properties: {
    id: string;
    person_id: string;
    loc_id: string;
    loc_type: MapPoiType;
    label: string;
    infected: boolean;
    newly_infected: boolean;
    recovered: boolean;
    disabled: boolean;
  };
  geometry: {
    type: 'Point';
    coordinates: Coordinate;
  };
};

export type PersonStatusDotFeatureCollection = {
  type: 'FeatureCollection';
  features: PersonStatusDotFeature[];
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

export type PoiFootprintFeature = {
  type: 'Feature';
  properties: MapPoi & {
    infection_ratio: number;
  };
  geometry: GeoJSONPolygonGeometry;
};

export type PoiFootprintFeatureCollection = {
  type: 'FeatureCollection';
  features: PoiFootprintFeature[];
};

// Structural MapLibre map-instance and event shapes used by the model-map
// rendering components. Intentionally narrow (only the surface the component
// actually calls) rather than the full maplibre-gl types.
export type PointFeatureProperties = {
  cluster?: boolean;
  cluster_id?: number;
  description?: string;
  disabled?: boolean | string;
  icon?: string;
  id?: string | number;
  infected?: number | string;
  infection_ratio?: number | string;
  label?: string;
  latitude?: number | string;
  longitude?: number | string;
  point_count?: number | string;
  population?: number | string;
  top_category?: string;
  type?: string;
};

export type RenderedPointFeature = {
  properties?: PointFeatureProperties;
  geometry: {
    coordinates: [number, number];
  };
};

export type RenderedMapFeature = {
  properties?: PointFeatureProperties;
  geometry?: {
    coordinates?: unknown;
  };
};

export type MapSourceApi = {
  setData?: (data: unknown) => void;
  getClusterExpansionZoom?: (clusterId: number) => Promise<number>;
};

export type ModelMapInstance = {
  easeTo: (options: {
    center: [number, number];
    zoom: number;
    duration: number;
  }) => void;
  fitBounds: (
    bounds: [[number, number], [number, number]],
    options: { padding: number; duration: number; maxZoom: number }
  ) => void;
  getContainer: () => HTMLElement;
  getLayer: (id: string) => unknown;
  getSource: (id: string) => MapSourceApi | undefined;
  getZoom: () => number;
  off: (eventName: 'render', listener: () => void) => void;
  on: (eventName: 'render', listener: () => void) => void;
  project: (coordinate: [number, number]) => { x: number; y: number };
  queryRenderedFeatures: (
    geometry?: unknown,
    options?: { source?: string; layers?: string[] }
  ) => RenderedPointFeature[];
  setLayoutProperty: (id: string, name: string, value: string) => void;
};

export type PopupInfo = {
  coordinates: [number, number];
  icon: string;
  id: string;
  label: string;
  category?: string;
  population: number;
  infected: number;
  infectionRatio: number;
};

export type MapLoadEvent = {
  target: unknown;
};

export type MapClickEvent = {
  target: unknown;
  features?: unknown[];
};
