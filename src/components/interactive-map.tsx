'use client';

import type { FeatureCollection, GeoJsonProperties, Geometry } from 'geojson';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MapRef } from 'react-map-gl/maplibre';
import {
  Layer,
  type MapLayerMouseEvent,
  Map as MapLibreMap,
  Marker,
  Source
} from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { SeedEditAction } from '@/features/cz-generation/types';
import {
  createCircleGeoJson,
  type GeoJSONData,
  getBoundsForGeoJson,
  getFeatureCbgId,
  getFeatureCenterFromGeoJson,
  normalizeCbgId
} from '@/lib/cz-geo';

type ScreenPoint = {
  x: number;
  y: number;
};

type DragBox = {
  start: ScreenPoint;
  current: ScreenPoint;
};

const MIN_DRAG_DISTANCE = 6;

export default function InteractiveMap({
  onLocationSelect,
  disabled,
  seedGeoJSON = null,
  seedCbgId = '',
  seedCbgIds = [],
  originalSeedCbgIds = [],
  seedGuardRadiusKm = 0,
  showSeedGuardCircle = false,
  seedEditMode = false,
  seedEditAction = 'observe',
  onSeedCbgSelect = null
}: {
  onLocationSelect: (coords: string) => void;
  disabled: boolean;
  seedGeoJSON?: GeoJSONData | null;
  seedCbgId?: string;
  seedCbgIds?: string[];
  originalSeedCbgIds?: string[];
  seedGuardRadiusKm?: number;
  showSeedGuardCircle?: boolean;
  seedEditMode?: boolean;
  seedEditAction?: SeedEditAction;
  onSeedCbgSelect?: ((cbgIds: string[]) => void) | null;
}) {
  const mapRef = useRef<MapRef>(null);
  const fittedSeedKeyRef = useRef('');
  const [mapLoaded, setMapLoaded] = useState(false);
  const [marker, setMarker] = useState<{ lat: number; lng: number } | null>(
    null
  );
  const [hoverCbgId, setHoverCbgId] = useState<string | null>(null);
  const [dragBox, setDragBox] = useState<DragBox | null>(null);
  const isSeedSelectionActive =
    seedEditMode && seedEditAction !== 'observe' && !disabled;

  const seedCbgSet = useMemo(
    () =>
      new Set(seedCbgIds.map((cbgId) => normalizeCbgId(cbgId)).filter(Boolean)),
    [seedCbgIds]
  );
  const seedFitKey = useMemo(() => {
    const resolvedSeedCbgs = originalSeedCbgIds
      .map((cbgId) => normalizeCbgId(cbgId))
      .filter(Boolean);

    if (resolvedSeedCbgs.length) {
      return [...resolvedSeedCbgs].sort().join(',');
    }

    return normalizeCbgId(seedCbgId) || '';
  }, [originalSeedCbgIds, seedCbgId]);
  const originalSeedCbgSet = useMemo(
    () =>
      new Set(
        originalSeedCbgIds.map((cbgId) => normalizeCbgId(cbgId)).filter(Boolean)
      ),
    [originalSeedCbgIds]
  );

  const seedBounds = useMemo(
    () => getBoundsForGeoJson(seedGeoJSON),
    [seedGeoJSON]
  );

  const seedCircleCenter = useMemo(
    () =>
      showSeedGuardCircle
        ? getFeatureCenterFromGeoJson(seedGeoJSON, seedCbgId)
        : null,
    [seedGeoJSON, seedCbgId, showSeedGuardCircle]
  );

  const seedCircleGeoJSON = useMemo(
    () =>
      seedCircleCenter
        ? createCircleGeoJson(seedCircleCenter, Number(seedGuardRadiusKm))
        : null,
    [seedCircleCenter, seedGuardRadiusKm]
  );
  const seedPreviewData = useMemo(() => {
    if (!seedGeoJSON?.features) {
      return null;
    }

    return {
      ...seedGeoJSON,
      features: seedGeoJSON.features.map((feature) => {
        const cbgId = getFeatureCbgId(feature);
        const isSelected = seedCbgSet.has(cbgId);
        const wasOriginal = originalSeedCbgSet.has(cbgId);
        const isRemoved = !isSelected && wasOriginal;
        const isCandidate = !isSelected && !wasOriginal;

        return {
          ...feature,
          properties: {
            ...feature.properties,
            _cbg_id: cbgId,
            _hover_fill_color:
              seedEditAction === 'remove' ? '#ef4444' : '#22c55e',
            _hover_line_color:
              seedEditAction === 'remove' ? '#991b1b' : '#166534',
            _fill_color: seedEditMode
              ? isSelected
                ? '#22c55e'
                : isRemoved
                  ? '#ef4444'
                  : '#d1d5db'
              : '#86efac',
            _fill_opacity: seedEditMode
              ? isSelected
                ? 0.54
                : isRemoved
                  ? 0.28
                  : isCandidate
                    ? 0.16
                  : 0.2
              : 0.28,
            _line_color: seedEditMode
              ? isSelected
                ? '#15803d'
                : isRemoved
                  ? '#b91c1c'
                  : '#6b7280'
              : '#15803d',
            _line_width: seedEditMode
              ? isSelected || isRemoved
                ? 2.5
                : 1.25
              : 2
          }
        };
      })
    } as FeatureCollection<Geometry, GeoJsonProperties>;
  }, [
    originalSeedCbgSet,
    seedCbgSet,
    seedEditAction,
    seedEditMode,
    seedGeoJSON
  ]);
  const seedGuardPreviewData = seedCircleGeoJSON as FeatureCollection<
    Geometry,
    GeoJsonProperties
  > | null;

  const hoverFilter = useMemo(
    () =>
      hoverCbgId
        ? ([
            '==',
            ['get', '_cbg_id'],
            hoverCbgId
          ] as unknown as maplibregl.ExpressionSpecification)
        : ([
            '==',
            ['get', '_cbg_id'],
            ''
          ] as unknown as maplibregl.ExpressionSpecification),
    [hoverCbgId]
  );

  const getCbgIdsFromRenderedFeatures = useCallback(
    (features: Array<{ properties?: GeoJsonProperties }>) =>
      Array.from(
        new Set(
          features
            .map((feature) =>
              normalizeCbgId(
                feature.properties?._cbg_id ??
                  feature.properties?.GEOID ??
                  feature.properties?.CensusBlockGroup
              )
            )
            .filter(Boolean)
        )
      ),
    []
  );

  const fitToSeedBounds = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map || !seedBounds || !seedFitKey) {
      return;
    }

    if (fittedSeedKeyRef.current === seedFitKey) {
      return;
    }

    map.fitBounds(seedBounds, {
      padding: 24,
      maxZoom: 13,
      duration: 0
    });
    fittedSeedKeyRef.current = seedFitKey;
  }, [seedBounds, seedFitKey]);

  useEffect(() => {
    fitToSeedBounds();
  }, [fitToSeedBounds]);

  const handleClick = useCallback(
    (e: { lngLat: { lat: number; lng: number } }) => {
      if (disabled) {
        return;
      }
      if (seedEditMode) {
        return;
      }
      const { lat, lng } = e.lngLat;
      setMarker({ lat, lng });
      onLocationSelect(`${lat.toFixed(4)}, ${lng.toFixed(4)}`);
    },
    [disabled, onLocationSelect, seedEditMode]
  );

  const handleMouseDown = useCallback(
    (e: MapLayerMouseEvent) => {
      if (!isSeedSelectionActive) {
        return;
      }

      e.preventDefault();
      e.originalEvent.preventDefault();
      mapRef.current?.getMap().dragPan.disable();
      const point = { x: e.point.x, y: e.point.y };
      setDragBox({ start: point, current: point });
    },
    [isSeedSelectionActive]
  );

  const handleMouseMove = useCallback(
    (e: MapLayerMouseEvent) => {
      const feature = e.features?.[0];
      const nextHover = normalizeCbgId(
        feature?.properties?._cbg_id ??
          feature?.properties?.GEOID ??
          feature?.properties?.CensusBlockGroup
      );
      setHoverCbgId(isSeedSelectionActive ? nextHover || null : null);

      if (!dragBox || !isSeedSelectionActive) {
        return;
      }

      setDragBox((prev) =>
        prev
          ? {
              ...prev,
              current: { x: e.point.x, y: e.point.y }
            }
          : null
      );
    },
    [dragBox, isSeedSelectionActive]
  );

  const handleMouseUp = useCallback(
    (e: MapLayerMouseEvent) => {
      if (!dragBox || !isSeedSelectionActive) {
        return;
      }

      const map = mapRef.current?.getMap();
      map?.dragPan.enable();
      setDragBox(null);

      if (!map || !onSeedCbgSelect) {
        return;
      }

      const end = { x: e.point.x, y: e.point.y };
      const width = Math.abs(end.x - dragBox.start.x);
      const height = Math.abs(end.y - dragBox.start.y);

      const features =
        width >= MIN_DRAG_DISTANCE || height >= MIN_DRAG_DISTANCE
          ? map.queryRenderedFeatures(
              [
                [
                  Math.min(dragBox.start.x, end.x),
                  Math.min(dragBox.start.y, end.y)
                ],
                [
                  Math.max(dragBox.start.x, end.x),
                  Math.max(dragBox.start.y, end.y)
                ]
              ],
              { layers: ['seed-preview-fill'] }
            )
          : map.queryRenderedFeatures([dragBox.start.x, dragBox.start.y], {
              layers: ['seed-preview-fill']
            });

      const selectedIds = getCbgIdsFromRenderedFeatures(features);
      if (selectedIds.length) {
        onSeedCbgSelect(selectedIds);
      }
    },
    [
      dragBox,
      getCbgIdsFromRenderedFeatures,
      isSeedSelectionActive,
      onSeedCbgSelect
    ]
  );

  const handleMouseLeave = useCallback(() => {
    setHoverCbgId(null);
  }, []);

  const dragBoxStyle = useMemo(() => {
    if (!dragBox) {
      return null;
    }

    return {
      left: Math.min(dragBox.start.x, dragBox.current.x),
      top: Math.min(dragBox.start.y, dragBox.current.y),
      width: Math.abs(dragBox.current.x - dragBox.start.x),
      height: Math.abs(dragBox.current.y - dragBox.start.y)
    };
  }, [dragBox]);

  useEffect(() => {
    if (!isSeedSelectionActive) {
      setDragBox(null);
      setHoverCbgId(null);
      mapRef.current?.getMap().dragPan.enable();
    }
  }, [isSeedSelectionActive]);

  useEffect(
    () => () => {
      mapRef.current?.getMap().dragPan.enable();
    },
    []
  );

  return (
    <div
      className="relative h-full w-full"
      style={{
        opacity: mapLoaded ? 1 : 0,
        transition: 'opacity 400ms ease'
      }}
    >
      <MapLibreMap
        ref={mapRef}
        initialViewState={{
          latitude: 39.3291,
          longitude: -76.622,
          zoom: 10
        }}
        style={{ width: '100%', height: '100%' }}
        mapStyle="https://basemaps.cartocdn.com/gl/positron-gl-style/style.json"
        interactiveLayerIds={isSeedSelectionActive ? ['seed-preview-fill'] : []}
        onLoad={() => { fitToSeedBounds(); setMapLoaded(true); }}
        onClick={handleClick}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        cursor={isSeedSelectionActive ? 'crosshair' : ''}
      >
        {seedPreviewData && (
          <Source id="seed-preview" type="geojson" data={seedPreviewData}>
            <Layer
              id="seed-preview-fill"
              type="fill"
              paint={{
                'fill-color': ['get', '_fill_color'],
                'fill-opacity': ['get', '_fill_opacity']
              }}
            />
            <Layer
              id="seed-preview-outline"
              type="line"
              paint={{
                'line-color': ['get', '_line_color'],
                'line-width': ['get', '_line_width']
              }}
            />
            {isSeedSelectionActive && (
              <Layer
                id="seed-preview-hover"
                type="fill"
                filter={hoverFilter}
                paint={{
                  'fill-color': ['get', '_hover_fill_color'],
                  'fill-opacity': 0.42
                }}
              />
            )}
            {isSeedSelectionActive && (
              <Layer
                id="seed-preview-hover-outline"
                type="line"
                filter={hoverFilter}
                paint={{
                  'line-color': ['get', '_hover_line_color'],
                  'line-width': 3
                }}
              />
            )}
          </Source>
        )}
        {seedGuardPreviewData && (
          <Source
            id="seed-guard-preview"
            type="geojson"
            data={seedGuardPreviewData}
          >
            <Layer
              id="seed-guard-preview-fill"
              type="fill"
              paint={{
                'fill-color': '#60a5fa',
                'fill-opacity': 0.06
              }}
            />
            <Layer
              id="seed-guard-preview-outline"
              type="line"
              paint={{
                'line-color': '#2563eb',
                'line-width': 2,
                'line-dasharray': [3, 2]
              }}
            />
          </Source>
        )}
        {marker && !seedEditMode && (
          <Marker latitude={marker.lat} longitude={marker.lng} anchor="bottom">
            <div style={{ fontSize: '24px' }}>📍</div>
          </Marker>
        )}
      </MapLibreMap>
      {dragBoxStyle && (
        <div
          className="pointer-events-none absolute border-2 border-[#2563eb] bg-[#60a5fa]/15"
          style={dragBoxStyle}
        />
      )}
      {seedEditMode && (
        <div className="pointer-events-none absolute bottom-3 left-3 rounded-md border border-gray-200 bg-white/95 px-3 py-2 text-xs font-medium text-gray-700 shadow-sm">
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-sm border border-[#15803d] bg-[#22c55e]" />
            <span>Selected seed CBGs</span>
          </div>
          <div className="mt-1 flex items-center gap-2">
            <span className="h-3 w-3 rounded-sm border border-[#b91c1c] bg-[#ef4444]" />
            <span>Removed original CBGs</span>
          </div>
          <div className="mt-1 flex items-center gap-2">
            <span className="h-3 w-3 rounded-sm border border-[#6b7280] bg-[#d1d5db]" />
            <span>Available CBGs</span>
          </div>
        </div>
      )}
    </div>
  );
}
