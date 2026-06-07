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
  zoneGeoJSON: GeoJSONData | null;
  hotspots: Record<string, number[]>;
  onMarkerClick: (info: { id: string; label: string; type: string }) => void;
  heatmapMode: HeatmapMode;
  peopleDotGeoJSON: PeopleDotFeatureCollection;
  peopleDotColor: string;
  personStatusDotGeoJSON: PersonStatusDotFeatureCollection;
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
  const showPeopleDotLayer =
    heatmapMode === 'population' ||
    heatmapMode === 'infection' ||
    (heatmapMode === 'people' &&
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
    const isPeople = heatmapMode === 'people';
    for (const id of [
      'poi-footprint-fill',
      'poi-footprint-outline',
      'poi-footprint-labels'
    ]) {
      if (mapInstance.getLayer(id))
        mapInstance.setLayoutProperty(
          id,
          'visibility',
          isPeople ? 'visible' : 'none'
        );
    }
    for (const id of [
      'person-status-uninfected',
      'person-status-recovered',
      'person-status-infected',
      'person-status-disabled'
    ]) {
      if (mapInstance.getLayer(id))
        mapInstance.setLayoutProperty(
          id,
          'visibility',
          isPeople ? 'visible' : 'none'
        );
    }
  }, [heatmapMode, mapInstance, showPeopleDotLayer]);

  const handleMapLoad = (event: MapLoadEvent) => {
    const map = event.target as ModelMapInstance;
    setMapInstance(map);
  };

  useEffect(() => {
    setPopupInfo(null);
  }, []);

  const geojson = useMemo(() => makeGeoJSON(pois), [pois]);
  const poiFootprintGeoJSON = useMemo(
    () => makePoiFootprintGeoJSON(pois),
    [pois]
  );
  const poiLabelGeoJSON = useMemo(
    () => makeGeoJSON(pois.filter((poi) => poi.type === 'places')),
    [pois]
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
      const source = map.getSource('points');
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
  const peopleDotPaintColor = [
    'case',
    ['==', ['get', 'disabled'], true],
    DISABLED_POI_COLOR,
    peopleDotColor
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
          'poi-footprint-fill',
          'poi-footprint-outline',
          'poi-footprint-labels'
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
              'circle-color': peopleDotPaintColor,
              'circle-opacity': 0.72,
              'circle-stroke-width': 0
            }}
          />
        </Source>
        <Source id="poi-footprints" type="geojson" data={poiFootprintGeoJSON}>
          <Layer
            id="poi-footprint-fill"
            type="fill"
            minzoom={13}
            layout={
              {
                visibility: heatmapMode === 'people' ? 'visible' : 'none'
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
            minzoom={13}
            layout={
              {
                visibility: heatmapMode === 'people' ? 'visible' : 'none'
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
          <Layer
            id="person-status-disabled"
            type="circle"
            filter={['==', ['get', 'disabled'], true]}
            layout={
              {
                visibility: heatmapMode === 'people' ? 'visible' : 'none'
              } as const
            }
            paint={{
              'circle-radius': PERSON_STATUS_DOT_RADIUS,
              'circle-color': DISABLED_POI_COLOR,
              'circle-opacity': 0.88,
              'circle-stroke-width': 0
            }}
          />
        </Source>
        <Source id="poi-label-points" type="geojson" data={poiLabelGeoJSON}>
          <Layer
            id="poi-footprint-labels"
            type="symbol"
            minzoom={13.2}
            layout={
              {
                visibility: heatmapMode === 'people' ? 'visible' : 'none',
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
