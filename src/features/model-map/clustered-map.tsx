'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { MapRef } from 'react-map-gl/maplibre';
import {
  Layer,
  Map as MapLibreMap,
  Popup,
  Source
} from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import '@/styles/modelmap.css';
import EmojiOverlay from '@/features/model-map/emoji-overlay';
import {
  CASE_CLUSTER_MAX_ZOOM,
  CASE_DETAIL_MIN_ZOOM,
  CLUSTER_COLOR_EXPRESSION,
  type HeatmapMode,
  PERSON_STATUS_DOT_RADIUS,
  POINTS_CLUSTER_PROPERTIES,
  RECOVERED_DOT_COLOR
} from '@/features/model-map/map-constants';
import {
  type GeoJSONData,
  type MapPoi,
  makeGeoJSON,
  makePoiFootprintGeoJSON,
  type PeopleDotFeatureCollection,
  type PersonStatusDotFeatureCollection
} from '@/features/model-map/map-data';
import type {
  MapClickEvent,
  MapLoadEvent,
  ModelMapInstance,
  PopupInfo,
  RenderedMapFeature
} from '@/features/model-map/map-types';

const DISABLED_POI_COLOR = '#111827';

interface ClusteredMapProps {
  currentTime: number;
  mapCenter: [number, number];
  pois: MapPoi[];
  // Timestep-invariant POI geometry (footprints/labels) — derived from a zeroed
  // sim so it doesn't change every playback tick. Feeds the footprint/label
  // layers; the live per-frame `pois` still feeds clusters/markers and popups.
  stablePois: MapPoi[];
  zoneGeoJSON: GeoJSONData | null;
  hotspots: Record<string, number[]>;
  onMarkerClick: (info: { id: string; label: string; type: string }) => void;
  heatmapMode: HeatmapMode;
  peopleDotGeoJSON: PeopleDotFeatureCollection;
  peopleDotColor: string;
  personStatusDotGeoJSON: PersonStatusDotFeatureCollection;
  onCaseDotsVisibilityChange?: (visible: boolean) => void;
  focusPoi?: { id: string; nonce: number } | null;
}

function asPointCoordinate(value: unknown): [number, number] | null {
  if (
    Array.isArray(value) &&
    value.length >= 2 &&
    typeof value[0] === 'number' &&
    typeof value[1] === 'number' &&
    Number.isFinite(value[0]) &&
    Number.isFinite(value[1])
  ) {
    return [value[0], value[1]];
  }
  return null;
}

function getFeaturePointCoordinate(
  feature: RenderedMapFeature | undefined
): [number, number] | null {
  return asPointCoordinate(feature?.geometry?.coordinates);
}

function getPoiCenterFromProperties(
  props: RenderedMapFeature['properties']
): [number, number] | null {
  const lat = Number(props?.latitude);
  const lng = Number(props?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return [lng, lat];
}

export default function ClusteredMap({
  currentTime: _currentTime,
  mapCenter,
  pois,
  stablePois,
  zoneGeoJSON,
  hotspots,
  onMarkerClick,
  heatmapMode,
  peopleDotGeoJSON,
  peopleDotColor,
  personStatusDotGeoJSON,
  onCaseDotsVisibilityChange,
  focusPoi
}: ClusteredMapProps) {
  const mapRef = useRef<MapRef>(null);
  const [mapInstance, setMapInstance] = useState<ModelMapInstance | null>(null);
  const [popupInfo, setPopupInfo] = useState<PopupInfo | null>(null);
  const [caseDotsZoom, setCaseDotsZoom] = useState(false);
  const [caseDetailZoom, setCaseDetailZoom] = useState(false);
  const hasFitBounds = useRef(false);
  const lastFocusNonce = useRef<number | null>(null);
  // Cases view tiers: clustered infection bubbles when zoomed out, individual
  // person dots once past CASE_CLUSTER_MAX_ZOOM, and POI footprints/labels once
  // past CASE_DETAIL_MIN_ZOOM.
  const showCaseClusterLayer = heatmapMode === 'people' && !caseDotsZoom;
  const showCaseDotsLayer = heatmapMode === 'people' && caseDotsZoom;
  const showCaseDetailLayer = heatmapMode === 'people' && caseDetailZoom;
  const showPeopleDotLayer =
    heatmapMode === 'population' ||
    heatmapMode === 'infection' ||
    (showCaseDotsLayer &&
      personStatusDotGeoJSON.features.length === 0 &&
      peopleDotGeoJSON.features.length > 0);

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

  // Fly the map to a POI requested from the hotspot rankings. Guarded on the
  // nonce so it runs once per click (this effect also re-runs when `pois`/the
  // map settle); if the POI isn't loaded yet we leave the nonce unhandled so a
  // later `pois` update retries the fly-to.
  useEffect(() => {
    if (!focusPoi || !mapInstance) return;
    if (lastFocusNonce.current === focusPoi.nonce) return;
    const poi = pois.find(
      (candidate) =>
        candidate.type === 'places' &&
        String(candidate.id) === String(focusPoi.id)
    );
    if (!poi || !Number.isFinite(poi.latitude) || !Number.isFinite(poi.longitude)) {
      return;
    }
    lastFocusNonce.current = focusPoi.nonce;
    mapInstance.easeTo({
      center: [poi.longitude, poi.latitude],
      zoom: Math.max(mapInstance.getZoom(), 16),
      duration: 700
    });
  }, [focusPoi, mapInstance, pois]);

  useEffect(() => {
    if (!mapInstance) return;

    const updateCaseZoom = () => {
      const zoom = mapInstance.getZoom();
      const nextDots = zoom >= CASE_CLUSTER_MAX_ZOOM;
      const nextDetail = zoom >= CASE_DETAIL_MIN_ZOOM;
      setCaseDotsZoom((previous) => (previous === nextDots ? previous : nextDots));
      setCaseDetailZoom((previous) =>
        previous === nextDetail ? previous : nextDetail
      );
    };

    updateCaseZoom();
    mapInstance.on('zoom', updateCaseZoom);
    mapInstance.on('moveend', updateCaseZoom);

    return () => {
      mapInstance.off('zoom', updateCaseZoom);
      mapInstance.off('moveend', updateCaseZoom);
    };
  }, [mapInstance]);

  // Notify the parent of dots-visibility from an effect (not inside the zoom
  // setState updater) so we never call ModelMap's setState mid-render.
  useEffect(() => {
    onCaseDotsVisibilityChange?.(caseDotsZoom);
  }, [caseDotsZoom, onCaseDotsVisibilityChange]);

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
    for (const id of ['people-dots-places']) {
      if (mapInstance.getLayer(id))
        mapInstance.setLayoutProperty(
          id,
          'visibility',
          showPeopleDotLayer ? 'visible' : 'none'
        );
    }
    for (const id of [
      'case-clusters-circle',
      'case-clusters-count',
      'case-clusters-point'
    ]) {
      if (mapInstance.getLayer(id))
        mapInstance.setLayoutProperty(
          id,
          'visibility',
          showCaseClusterLayer ? 'visible' : 'none'
        );
    }
    for (const id of [
      'poi-footprint-fill',
      'poi-footprint-outline',
      'poi-footprint-labels'
    ]) {
      if (mapInstance.getLayer(id))
        mapInstance.setLayoutProperty(
          id,
          'visibility',
          showCaseDetailLayer ? 'visible' : 'none'
        );
    }
    for (const id of [
      'person-status-uninfected',
      'person-status-recovered',
      'person-status-infected'
    ]) {
      if (mapInstance.getLayer(id))
        mapInstance.setLayoutProperty(
          id,
          'visibility',
          showCaseDotsLayer ? 'visible' : 'none'
        );
    }
  }, [
    heatmapMode,
    mapInstance,
    showCaseClusterLayer,
    showCaseDetailLayer,
    showCaseDotsLayer,
    showPeopleDotLayer
  ]);

  const handleMapLoad = (event: MapLoadEvent) => {
    const map = event.target as ModelMapInstance;
    setMapInstance(map);
  };

  useEffect(() => {
    setPopupInfo(null);
  }, []);

  const geojson = useMemo(() => makeGeoJSON(pois), [pois]);
  // Footprints + labels are visually timestep-invariant (their paint/layout read
  // only `disabled`/`label`), so derive them from the stable POI geometry rather
  // than the per-frame `pois`. Building from `pois` re-set both sources every
  // playback tick — their features bake in per-frame counts — forcing a full
  // polygon re-tessellation + label collision pass that, on large/sampled runs,
  // overran the frame interval and made the outlines/labels flicker.
  const poiFootprintGeoJSON = useMemo(
    () => makePoiFootprintGeoJSON(stablePois),
    [stablePois]
  );
  const poiLabelGeoJSON = useMemo(
    () => makeGeoJSON(stablePois.filter((poi) => poi.type === 'places')),
    [stablePois]
  );

  // Hotspot hours for the open popup, read from the same `hotspots` prop the
  // map renders from (minutes → hour), so the popup needn't re-bake them.
  const popupHotspotHours = useMemo(() => {
    if (!popupInfo) return null;
    const hours = hotspots?.[popupInfo.id];
    if (!hours || hours.length === 0) return null;
    return hours.map((t) => Math.floor(t / 60)).join(', ');
  }, [popupInfo, hotspots]);

  const handleClick = (event: MapClickEvent) => {
    const feature = event.features?.[0] as RenderedMapFeature | undefined;
    if (!feature?.properties) return;
    const props = feature.properties;
    const map = event.target as ModelMapInstance;
    if (props.cluster) {
      const clusterId = props.cluster_id;
      if (clusterId === undefined) return;
      const clusterCoordinates = getFeaturePointCoordinate(feature);
      if (!clusterCoordinates) return;
      const source = map.getSource(
        heatmapMode === 'people' ? 'case-clusters' : 'points'
      );
      if (!source?.getClusterExpansionZoom) return;
      source.getClusterExpansionZoom(clusterId).then((zoom: number) => {
        map.easeTo({
          center: clusterCoordinates,
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
    const coords =
      getFeaturePointCoordinate(feature) ?? getPoiCenterFromProperties(props);
    if (!coords) return;
    map.easeTo({
      center: coords,
      zoom: Math.max(map.getZoom(), 15),
      duration: 600
    });
    // Only the Markers source (live per-frame `pois`) opens this popup, so its
    // feature props already carry current counts.
    setPopupInfo(null);
    setTimeout(
      () =>
        setPopupInfo({
          coordinates: coords,
          label: markerLabel,
          icon: props.icon ?? '',
          id: markerId,
          category: props.top_category,
          population: Number(props.population ?? 0),
          infected: Number(props.infected ?? 0),
          infectionRatio: Number(props.infection_ratio ?? 0)
        }),
      250
    );
  };

  const clusterColor = CLUSTER_COLOR_EXPRESSION;
  const unclusteredPointColor = [
    'case',
    ['==', ['get', 'disabled'], true],
    DISABLED_POI_COLOR,
    clusterColor
  ] as unknown as string;
  const footprintPaintColor = [
    'case',
    ['==', ['get', 'disabled'], true],
    DISABLED_POI_COLOR,
    '#0f766e'
  ] as unknown as string;

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
          'unclustered-point-emoji',
          'case-clusters-circle',
          'case-clusters-point'
          // POI footprint/label layers are intentionally NOT interactive: in the
          // Cases view the name label is shown inline and the popup is reserved
          // for the Markers view. (Case clusters above stay clickable to zoom in.)
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
          id="case-clusters"
          type="geojson"
          data={geojson}
          cluster={true}
          clusterMaxZoom={14}
          clusterRadius={60}
          clusterMinPoints={2}
          clusterProperties={POINTS_CLUSTER_PROPERTIES}
        >
          <Layer
            id="case-clusters-circle"
            type="circle"
            filter={['has', 'point_count']}
            maxzoom={CASE_CLUSTER_MAX_ZOOM}
            layout={
              {
                visibility: showCaseClusterLayer ? 'visible' : 'none'
              } as const
            }
            paint={{
              'circle-color': clusterColor,
              'circle-radius': [
                'interpolate',
                ['linear'],
                ['sqrt', ['to-number', ['get', 'population']]],
                0,
                8,
                10,
                16,
                40,
                26,
                100,
                38
              ] as const,
              'circle-opacity': 0.85,
              'circle-stroke-width': 1,
              'circle-stroke-color': '#fff'
            }}
          />
          <Layer
            id="case-clusters-count"
            type="symbol"
            filter={['has', 'point_count']}
            maxzoom={CASE_CLUSTER_MAX_ZOOM}
            layout={
              {
                visibility: showCaseClusterLayer ? 'visible' : 'none',
                'text-field': ['get', 'population'],
                'text-size': 12,
                'text-allow-overlap': true,
                'text-font': ['Open Sans Regular']
              } as const
            }
            paint={{ 'text-color': '#fff', 'text-opacity': 0.95 }}
          />
          <Layer
            id="case-clusters-point"
            type="circle"
            filter={['!', ['has', 'point_count']]}
            maxzoom={CASE_CLUSTER_MAX_ZOOM}
            layout={
              {
                visibility: showCaseClusterLayer ? 'visible' : 'none'
              } as const
            }
            paint={{
              'circle-color': clusterColor,
              'circle-radius': [
                'interpolate',
                ['linear'],
                ['sqrt', ['to-number', ['get', 'population']]],
                0,
                4,
                10,
                7,
                40,
                11
              ] as const,
              'circle-opacity': 0.85,
              'circle-stroke-width': 1,
              'circle-stroke-color': '#fff'
            }}
          />
        </Source>
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
              'text-field': ['get', 'population'],
              'text-size': 13,
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
              'circle-color': unclusteredPointColor,
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
            minzoom={CASE_CLUSTER_MAX_ZOOM}
            filter={['!=', ['get', 'loc_type'], 'homes']}
            layout={
              {
                visibility: showPeopleDotLayer ? 'visible' : 'none'
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
        <Source id="poi-footprints" type="geojson" data={poiFootprintGeoJSON}>
          <Layer
            id="poi-footprint-fill"
            type="fill"
            minzoom={CASE_DETAIL_MIN_ZOOM}
            layout={
              {
                visibility: showCaseDetailLayer ? 'visible' : 'none'
              } as const
            }
            paint={{
              'fill-color': footprintPaintColor,
              'fill-opacity': [
                'interpolate',
                ['linear'],
                ['zoom'],
                13,
                0.08,
                16,
                0.18
              ] as const
            }}
          />
          <Layer
            id="poi-footprint-outline"
            type="line"
            minzoom={CASE_DETAIL_MIN_ZOOM}
            layout={
              {
                visibility: showCaseDetailLayer ? 'visible' : 'none'
              } as const
            }
            paint={{
              'line-color': footprintPaintColor,
              'line-opacity': [
                'interpolate',
                ['linear'],
                ['zoom'],
                13,
                0.32,
                16,
                0.75
              ] as const,
              'line-width': [
                'interpolate',
                ['linear'],
                ['zoom'],
                13,
                0.6,
                16,
                1.4,
                18,
                2.2
              ] as const
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
            minzoom={CASE_CLUSTER_MAX_ZOOM}
            filter={[
              'all',
              ['==', ['get', 'infected'], false],
              ['!=', ['get', 'recovered'], true]
            ]}
            layout={
              {
                visibility: showCaseDotsLayer ? 'visible' : 'none'
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
            minzoom={CASE_CLUSTER_MAX_ZOOM}
            filter={[
              'all',
              ['==', ['get', 'infected'], false],
              ['==', ['get', 'recovered'], true]
            ]}
            layout={
              {
                visibility: showCaseDotsLayer ? 'visible' : 'none'
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
            minzoom={CASE_CLUSTER_MAX_ZOOM}
            filter={['==', ['get', 'infected'], true]}
            layout={
              {
                visibility: showCaseDotsLayer ? 'visible' : 'none'
              } as const
            }
            paint={{
              'circle-radius': PERSON_STATUS_DOT_RADIUS,
              'circle-color': '#dc2626',
              'circle-opacity': 0.95,
              'circle-stroke-width': 0
            }}
          />
          {/* Disabled POIs emit no person dots (suppressed in map-data); their
              "disabled" state shows as the black footprint/marker, not dots. */}
        </Source>
        <Source id="poi-label-points" type="geojson" data={poiLabelGeoJSON}>
          <Layer
            id="poi-footprint-labels"
            type="symbol"
            minzoom={CASE_DETAIL_MIN_ZOOM}
            layout={
              {
                visibility: showCaseDetailLayer ? 'visible' : 'none',
                'text-field': ['get', 'label'],
                'text-size': [
                  'interpolate',
                  ['linear'],
                  ['zoom'],
                  13.2,
                  10.5,
                  17,
                  13
                ],
                'text-font': ['Open Sans Regular'],
                'text-anchor': 'top',
                'text-offset': [0, 1.1],
                'text-max-width': 12,
                'text-padding': 3,
                'text-allow-overlap': false,
                'text-ignore-placement': false
              } as const
            }
            paint={{
              'text-color': '#111827',
              'text-halo-color': '#ffffff',
              'text-halo-width': 1.6,
              'text-opacity': [
                'interpolate',
                ['linear'],
                ['zoom'],
                13.2,
                0,
                13.8,
                1
              ] as const
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
            <div className="max-w-44 font-[Poppins] text-center">
              <div className="text-2xl mb-0.5 font-['Noto_Color_Emoji']">
                {popupInfo.icon}
              </div>
              <header className="text-sm font-bold leading-tight">
                {popupInfo.label}
              </header>
              {popupInfo.category && (
                <p className="text-[11px] italic text-(--color-text-muted) mb-1">
                  {popupInfo.category}
                </p>
              )}
              <p className="text-xs">
                {popupInfo.population}{' '}
                {popupInfo.population === 1 ? 'person' : 'people'} ·{' '}
                {popupInfo.infected} infected
              </p>
              {popupInfo.population > 0 && (
                <p className="text-xs font-semibold">
                  {Math.round(popupInfo.infectionRatio * 100)}% infected
                </p>
              )}
              {popupHotspotHours && (
                <p className="text-[11px] mt-1">
                  Hotspot at hour{popupHotspotHours.includes(',') ? 's' : ''}:{' '}
                  {popupHotspotHours}
                </p>
              )}
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
