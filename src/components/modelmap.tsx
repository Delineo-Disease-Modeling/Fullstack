'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Layer,
  Map as MapLibreMap,
  Popup,
  Source
} from 'react-map-gl/maplibre';
import type { MapRef } from 'react-map-gl/maplibre';
import useMapData from '@/stores/mapdata';

import 'maplibre-gl/dist/maplibre-gl.css';
import '@/styles/modelmap.css';
import MapLegend from './maplegend';
import Slider from '@/components/ui/slider';
import Button from '@/components/ui/button';
import { Pause, Play } from 'lucide-react';
import {
  iconLookup,
  makeGeoJSON,
  makePeopleDotGeoJSON,
  makePersonStatusDotGeoJSON,
  resetModelMapLayoutCaches,
  updateIcons,
  type GeoJSONData,
  type MapPoi,
  type PeopleDotFeatureCollection,
  type PeopleMapData,
  type PersonStatusDotFeatureCollection
} from '@/features/model-map/map-data';
import {
  applyAlpha,
  CLUSTER_COLOR_EXPRESSION,
  HEATMAP_MODES,
  PEOPLE_MAP_PREFETCH_STEPS,
  PERSON_STATUS_DOT_RADIUS,
  PLAYBACK_INTERVAL_MS,
  POINTS_CLUSTER_PROPERTIES,
  RECOVERED_DOT_COLOR,
  type HeatmapMode
} from '@/features/model-map/map-constants';

function getMapStorageKey(simId: number | null | undefined, field: string) {
  return `delineo:model-map:${simId ?? 'unknown'}:${field}`;
}

function getStoredHeatmapMode(
  simId: number | null | undefined,
  fallback: HeatmapMode
) {
  if (typeof window === 'undefined' || !window.sessionStorage) {
    return fallback;
  }

  const stored = window.sessionStorage.getItem(
    getMapStorageKey(simId, 'heatmap-mode')
  );
  return HEATMAP_MODES.includes(stored as HeatmapMode)
    ? (stored as HeatmapMode)
    : fallback;
}

function getStoredCurrentTime(
  simId: number | null | undefined,
  fallback: number
) {
  if (typeof window === 'undefined' || !window.sessionStorage) {
    return fallback;
  }

  const stored = Number.parseFloat(
    window.sessionStorage.getItem(getMapStorageKey(simId, 'current-time')) ?? ''
  );
  return Number.isFinite(stored) && stored >= 1 ? stored : fallback;
}

function getPeopleMapCacheKey(simId: number, timestep: number) {
  return `${simId}:${timestep}`;
}

type PointFeatureProperties = {
  cluster?: boolean;
  cluster_id?: number;
  description?: string;
  icon?: string;
  id?: string | number;
  infected?: number | string;
  infection_ratio?: number | string;
  label?: string;
  point_count?: number | string;
  population?: number | string;
  type?: string;
};

type RenderedPointFeature = {
  properties?: PointFeatureProperties;
  geometry: {
    coordinates: [number, number];
  };
};

type MapSourceApi = {
  setData?: (data: unknown) => void;
  getClusterExpansionZoom?: (clusterId: number) => Promise<number>;
};

type ModelMapInstance = {
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

type PopupInfo = {
  coordinates: [number, number];
  description: string;
  icon: string;
  id: string;
  label: string;
};

type MapLoadEvent = {
  target: unknown;
};

type MapClickEvent = {
  target: unknown;
  features?: unknown[];
};

function EmojiOverlay({
  map,
  hotspots = {}
}: {
  map: ModelMapInstance;
  hotspots: Record<string, number[]>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!map) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const overlayCanvas = canvas;
    const overlayContext = ctx;

    function drawEmojis() {
      const { width, height } = map.getContainer().getBoundingClientRect();
      overlayCanvas.width = width;
      overlayCanvas.height = height;
      overlayContext.clearRect(0, 0, width, height);
      const features = map.queryRenderedFeatures(undefined, {
        source: 'points'
      });
      if (!features?.length) return;
      const zoom = map.getZoom();
      const time = Date.now() / 1000;
      features.forEach((f) => {
        const props = f.properties;
        if (!props || props.cluster || !props.icon) return;
        const [lng, lat] = f.geometry.coordinates;
        const pixel = map.project([lng, lat]);
        const infectionRatio = Number.parseFloat(
          String(props.infection_ratio || 0)
        );
        const adjusted = Math.sqrt(infectionRatio);
        let baseColor = '#4CAF50';
        if (adjusted >= 0.5) baseColor = '#F44336';
        else if (adjusted >= 0.35) baseColor = '#FF9800';
        else if (adjusted >= 0.2) baseColor = '#FFEB3B';
        const size = 6 + zoom * 1.2;
        const isHotspot =
          props.type === 'places' &&
          hotspots &&
          Object.keys(hotspots).includes(String(props.id ?? ''));
        const pulse = isHotspot
          ? 0.5 +
            0.5 *
              Math.sin(time * 4 + (parseInt(String(props.id ?? ''), 36) % 10))
          : 0;
        const pulseSize = size * (1 + 0.3 * pulse);
        const pulseAlpha = isHotspot ? 0.4 + 0.4 * pulse : 1.0;
        overlayContext.beginPath();
        overlayContext.arc(pixel.x, pixel.y, pulseSize * 0.6, 0, Math.PI * 2);
        overlayContext.fillStyle = applyAlpha(baseColor, pulseAlpha);
        overlayContext.fill();
        overlayContext.strokeStyle = 'rgba(255,255,255,0.9)';
        overlayContext.lineWidth = 2;
        overlayContext.stroke();
        overlayContext.font = `${size}px 'Noto Color Emoji', sans-serif`;
        overlayContext.textAlign = 'center';
        overlayContext.textBaseline = 'middle';
        overlayContext.fillText(props.icon, pixel.x, pixel.y);
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

interface ClusteredMapProps {
  currentTime: number;
  mapCenter: [number, number];
  pois: MapPoi[];
  zoneGeoJSON: GeoJSONData | null;
  hotspots: Record<string, number[]>;
  onMarkerClick: (info: { id: string; label: string; type: string }) => void;
  heatmapMode: HeatmapMode;
  peopleDotGeoJSON: PeopleDotFeatureCollection;
  peopleDotColor: string;
  personStatusDotGeoJSON: PersonStatusDotFeatureCollection;
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
  peopleDotColor,
  personStatusDotGeoJSON
}: ClusteredMapProps) {
  const mapRef = useRef<MapRef>(null);
  const [mapInstance, setMapInstance] = useState<ModelMapInstance | null>(null);
  const [popupInfo, setPopupInfo] = useState<PopupInfo | null>(null);
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
    const isDots = heatmapMode === 'population' || heatmapMode === 'infection';
    for (const id of ['people-dots-places']) {
      if (mapInstance.getLayer(id))
        mapInstance.setLayoutProperty(
          id,
          'visibility',
          isDots ? 'visible' : 'none'
        );
    }
    const isPeople = heatmapMode === 'people';
    for (const id of [
      'person-status-uninfected',
      'person-status-recovered',
      'person-status-infected'
    ]) {
      if (mapInstance.getLayer(id))
        mapInstance.setLayoutProperty(
          id,
          'visibility',
          isPeople ? 'visible' : 'none'
        );
    }
  }, [heatmapMode, mapInstance]);

  const handleMapLoad = (event: MapLoadEvent) => {
    const map = event.target as ModelMapInstance;
    setMapInstance(map);
  };

  useEffect(() => {
    setPopupInfo(null);
  }, []);

  const geojson = useMemo(() => makeGeoJSON(pois), [pois]);

  const handleClick = (event: MapClickEvent) => {
    const feature = event.features?.[0] as RenderedPointFeature | undefined;
    if (!feature?.properties) return;
    const props = feature.properties;
    const map = event.target as ModelMapInstance;
    if (props.cluster) {
      const clusterId = props.cluster_id;
      if (clusterId === undefined) return;
      const source = map.getSource('points');
      if (!source?.getClusterExpansionZoom) return;
      source.getClusterExpansionZoom(clusterId).then((zoom: number) => {
        map.easeTo({
          center: feature.geometry.coordinates,
          zoom: zoom + 0.5,
          duration: 600
        });
      });
      return;
    }
    if (props.id === undefined || !props.label || !props.type) return;
    const markerId = String(props.id);
    const markerLabel = props.label;
    const markerType = props.type;
    onMarkerClick({
      id: markerId,
      label: markerLabel,
      type: markerType
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
          label: markerLabel,
          description: props.description ?? '',
          icon: props.icon ?? '',
          id: markerId
        }),
      250
    );
  };

  const clusterColor = CLUSTER_COLOR_EXPRESSION;

  return (
    <div
      className="mapcontainer"
      style={{
        opacity: mapInstance ? 1 : 0,
        transition: 'opacity 400ms ease'
      }}
    >
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
          <Source
            id="zone-cbgs"
            type="geojson"
            data={zoneGeoJSON as unknown as string}
          >
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
                  8,
                  0.8,
                  11,
                  1.2,
                  14,
                  2
                ] as const,
                'line-opacity': 0.45
              }}
            />
          </Source>
        ) : null}
        <Source
          id="points"
          type="geojson"
          data={geojson}
          cluster={true}
          clusterMaxZoom={18}
          clusterRadius={75}
          clusterMinPoints={3}
          clusterProperties={POINTS_CLUSTER_PROPERTIES}
        >
          <Layer
            id="clusters"
            type="circle"
            filter={['has', 'point_count']}
            paint={{
              'circle-color': clusterColor,
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
              'circle-color': clusterColor,
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
              } as const
            }
            paint={{
              'circle-radius': [
                'interpolate',
                ['linear'],
                ['zoom'],
                10,
                1.5,
                13,
                2.5,
                16,
                4,
                18,
                6
              ] as const,
              'circle-color': peopleDotColor,
              'circle-opacity': 0.72,
              'circle-stroke-width': 0
            }}
          />
        </Source>
        <Source
          id="person-status-dots"
          type="geojson"
          data={personStatusDotGeoJSON}
        >
          <Layer
            id="person-status-uninfected"
            type="circle"
            filter={[
              'all',
              ['==', ['get', 'infected'], false],
              ['!=', ['get', 'recovered'], true]
            ]}
            layout={
              {
                visibility: heatmapMode === 'people' ? 'visible' : 'none'
              } as const
            }
            paint={{
              'circle-radius': PERSON_STATUS_DOT_RADIUS,
              'circle-color': '#2563eb',
              'circle-opacity': 0.25,
              'circle-stroke-width': 0
            }}
          />
          <Layer
            id="person-status-recovered"
            type="circle"
            filter={[
              'all',
              ['==', ['get', 'infected'], false],
              ['==', ['get', 'recovered'], true]
            ]}
            layout={
              {
                visibility: heatmapMode === 'people' ? 'visible' : 'none'
              } as const
            }
            paint={{
              'circle-radius': PERSON_STATUS_DOT_RADIUS,
              'circle-color': RECOVERED_DOT_COLOR,
              'circle-opacity': 0.35,
              'circle-stroke-width': 0
            }}
          />
          <Layer
            id="person-status-infected"
            type="circle"
            filter={['==', ['get', 'infected'], true]}
            layout={
              {
                visibility: heatmapMode === 'people' ? 'visible' : 'none'
              } as const
            }
            paint={{
              'circle-radius': PERSON_STATUS_DOT_RADIUS,
              'circle-color': '#dc2626',
              'circle-opacity': 0.95,
              'circle-stroke-width': 0
            }}
          />
        </Source>
        {zoneGeoJSON?.features?.length ? (
          <Source
            id="zone-cbgs-top"
            type="geojson"
            data={zoneGeoJSON as unknown as string}
          >
            <Layer
              id="zone-cbgs-top-outline"
              type="line"
              paint={{
                'line-color': '#1d4ed8',
                'line-width': [
                  'interpolate',
                  ['linear'],
                  ['zoom'],
                  8,
                  1,
                  11,
                  1.5,
                  14,
                  2.4
                ] as const,
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
              <div className="text-2xl mb-0.5 font-['Noto_Color_Emoji']">
                {popupInfo.icon}
              </div>
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
  simId?: number | null;
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
  simId,
  selectedZone
}: ModelMapProps) {
  const sim_data = useMapData((state) => state.simdata);
  const pap_data = useMapData((state) => state.papdata);
  const hotspots = useMapData((state) => state.hotspots) || {};
  const [zoneGeoJSON, setZoneGeoJSON] = useState<GeoJSONData | null>(null);

  const [maxHours, setMaxHours] = useState(1);
  const [currentTime, setCurrentTime] = useState(() =>
    getStoredCurrentTime(simId, 1)
  );
  const [isPlaying, setIsPlaying] = useState(false);
  const [heatmapMode, setHeatmapMode] = useState<HeatmapMode>(() =>
    getStoredHeatmapMode(simId, 'markers')
  );
  const [peopleMapData, setPeopleMapData] = useState<PeopleMapData | null>(
    null
  );
  const [peopleMapError, setPeopleMapError] = useState<string | null>(null);
  const peopleMapDataSimId = useRef<number | null>(null);
  const peopleMapCache = useRef<Map<string, PeopleMapData>>(new Map());
  const peopleMapRequests = useRef<Map<string, Promise<PeopleMapData>>>(
    new Map()
  );

  useEffect(() => {
    resetModelMapLayoutCaches();
  }, []);

  useEffect(() => {
    setCurrentTime(getStoredCurrentTime(simId, 1));
    setHeatmapMode(getStoredHeatmapMode(simId, 'markers'));
    peopleMapDataSimId.current = null;
    setPeopleMapData(null);
    setPeopleMapError(null);
  }, [simId]);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.sessionStorage) return;
    window.sessionStorage.setItem(
      getMapStorageKey(simId, 'current-time'),
      currentTime.toString()
    );
  }, [currentTime, simId]);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.sessionStorage) return;
    window.sessionStorage.setItem(
      getMapStorageKey(simId, 'heatmap-mode'),
      heatmapMode
    );
  }, [heatmapMode, simId]);

  useEffect(() => {
    const cbgList = selectedZone?.cbg_list?.filter(Boolean) ?? [];
    if (cbgList.length === 0) {
      setZoneGeoJSON(null);
      return;
    }

    const controller = new AbortController();
    const cbgs = cbgList.join(',');
    const url = new URL('/api/cbg-geojson', window.location.origin);
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

  const selectedTimestep = useMemo(() => {
    const targetMinutes = currentTime * 60;
    return findNearestTimestep(targetMinutes);
  }, [currentTime, findNearestTimestep]);

  const pois = useMemo(() => {
    const dataForTime =
      selectedTimestep !== null
        ? sim_data?.[selectedTimestep.toString()]
        : null;
    return updateIcons(mapCenter, dataForTime, pap_data, hotspots, zoneGeoJSON);
  }, [hotspots, mapCenter, pap_data, sim_data, selectedTimestep, zoneGeoJSON]);

  const loadPeopleMapData = useCallback(
    async (timestep: number) => {
      if (!simId) {
        throw new Error('Missing simulation id.');
      }

      const cacheKey = getPeopleMapCacheKey(simId, timestep);
      const cached = peopleMapCache.current.get(cacheKey);
      if (cached) {
        return cached;
      }

      const existingRequest = peopleMapRequests.current.get(cacheKey);
      if (existingRequest) {
        return existingRequest;
      }

      const request = fetch(`/api/simdata/${simId}/people-map?time=${timestep}`)
        .then(async (response) => {
          if (!response.ok) {
            throw new Error(`People map request failed: ${response.status}`);
          }
          return response.json() as Promise<{ data?: PeopleMapData }>;
        })
        .then((json) => {
          if (!json.data) {
            throw new Error('People map response did not include data.');
          }
          peopleMapCache.current.set(cacheKey, json.data);
          return json.data;
        })
        .finally(() => {
          peopleMapRequests.current.delete(cacheKey);
        });

      peopleMapRequests.current.set(cacheKey, request);
      return request;
    },
    [simId]
  );

  useEffect(() => {
    if (heatmapMode !== 'people' || !simId || selectedTimestep === null) {
      return;
    }

    let active = true;
    setPeopleMapError(null);

    loadPeopleMapData(selectedTimestep)
      .then((data) => {
        if (!active) {
          return;
        }
        peopleMapDataSimId.current = simId;
        setPeopleMapData(data);
      })
      .catch((error) => {
        if (!active) {
          return;
        }
        console.warn('Failed to load person-level map data:', error);
        setPeopleMapError('Person-level map data is unavailable.');
      });

    return () => {
      active = false;
    };
  }, [heatmapMode, loadPeopleMapData, selectedTimestep, simId]);

  useEffect(() => {
    if (
      heatmapMode !== 'people' ||
      !simId ||
      selectedTimestep === null ||
      availableTimesteps.length === 0
    ) {
      return;
    }

    const selectedIndex = availableTimesteps.indexOf(selectedTimestep);
    if (selectedIndex === -1) {
      return;
    }

    const upcomingTimesteps = availableTimesteps.slice(
      selectedIndex + 1,
      selectedIndex + 1 + PEOPLE_MAP_PREFETCH_STEPS
    );

    for (const timestep of upcomingTimesteps) {
      loadPeopleMapData(timestep).catch((error) => {
        console.warn('Failed to preload person-level map data:', error);
      });
    }
  }, [
    availableTimesteps,
    heatmapMode,
    loadPeopleMapData,
    selectedTimestep,
    simId
  ]);

  useEffect(() => {
    if (!isPlaying || availableTimesteps.length === 0) {
      return;
    }

    const interval = setInterval(() => {
      setCurrentTime((prev) => {
        const currentMinutes = Math.round(prev * 60);
        const nextIndex = availableTimesteps.findIndex(
          (ts) => ts > currentMinutes
        );
        if (nextIndex === -1) return prev;
        return availableTimesteps[nextIndex] / 60;
      });
    }, PLAYBACK_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [isPlaying, availableTimesteps]);

  const peopleDotColor = heatmapMode === 'infection' ? '#dc2626' : '#2563eb';

  const peopleDotGeoJSON = useMemo<PeopleDotFeatureCollection>(() => {
    if (heatmapMode !== 'population' && heatmapMode !== 'infection') {
      return { type: 'FeatureCollection', features: [] };
    }
    return makePeopleDotGeoJSON(pois, heatmapMode);
  }, [pois, heatmapMode]);

  const selectedPeopleMapData = useMemo(() => {
    if (heatmapMode !== 'people' || !simId || selectedTimestep === null) {
      return null;
    }

    if (
      peopleMapDataSimId.current === simId &&
      peopleMapData?.requested_time === selectedTimestep
    ) {
      return peopleMapData;
    }

    return (
      peopleMapCache.current.get(
        getPeopleMapCacheKey(simId, selectedTimestep)
      ) ?? null
    );
  }, [heatmapMode, peopleMapData, selectedTimestep, simId]);

  const personStatusDotGeoJSON = useMemo<PersonStatusDotFeatureCollection>(
    () =>
      heatmapMode === 'people'
        ? makePersonStatusDotGeoJSON(pois, selectedPeopleMapData)
        : { type: 'FeatureCollection', features: [] },
    [heatmapMode, selectedPeopleMapData, pois]
  );

  useEffect(() => {
    if (sim_data) {
      const keys = Object.keys(sim_data)
        .map(Number)
        .filter((n) => !Number.isNaN(n));
      setMaxHours(keys.length > 0 ? Math.max(...keys) / 60 : 1);
    }
  }, [sim_data]);

  useEffect(() => {
    if (!sim_data || maxHours <= 1) return;
    setCurrentTime((prev) => {
      if (!Number.isFinite(prev)) return 1;
      return Math.min(Math.max(prev, 1), maxHours);
    });
  }, [maxHours, sim_data]);

  return (
    <div>
      <div className="heatmap-toggle">
        <MapLegend icon_lookup={iconLookup} />
        <div className="heatmap-toggle-group">
          <Button
            variant={heatmapMode === 'markers' ? 'primary' : 'secondary'}
            className="text-xs"
            onClick={() => setHeatmapMode('markers')}
          >
            Markers
          </Button>
          <Button
            variant={heatmapMode === 'people' ? 'primary' : 'secondary'}
            className="text-xs"
            onClick={() => setHeatmapMode('people')}
          >
            Cases
          </Button>
        </div>
      </div>
      {heatmapMode === 'people' && (
        <div className="people-map-key">
          <span className="people-map-key-item">
            <span className="people-map-swatch people-map-swatch-blue" />
            Uninfected
          </span>
          <span className="people-map-key-item">
            <span className="people-map-swatch people-map-swatch-red" />
            Infected
          </span>
          <span className="people-map-key-item">
            <span className="people-map-swatch people-map-swatch-recovered" />
            Recovered
          </span>
          {selectedPeopleMapData && selectedPeopleMapData.sample_rate > 1 && (
            <span className="people-map-key-note">
              sampled 1 in {selectedPeopleMapData.sample_rate}
            </span>
          )}
          {peopleMapError && (
            <span className="people-map-key-note">{peopleMapError}</span>
          )}
        </div>
      )}
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
        personStatusDotGeoJSON={personStatusDotGeoJSON}
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
          variant="primary"
          className="py-1!"
          onClick={() => setIsPlaying(!isPlaying)}
        >
          {isPlaying ? (
            <Pause size={14} fill="currentColor" />
          ) : (
            <Play size={14} fill="currentColor" />
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
