'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Layer, Map as MapLibreMap, Source } from 'react-map-gl/maplibre';
import type { MapRef } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  createCircleGeoJson,
  getBoundsForGeoJson,
  getFeatureCbgId,
  getFeatureCenterFromGeoJson,
  normalizeCbgId,
  type GeoJSONFeature,
  type GeoJSONData,
  type LatLng
} from '@/lib/cz-geo';

const TRACE_LOW_COLOR = '#fde68a';
const TRACE_HIGH_COLOR = '#dc2626';

type TraceCandidate = {
  cbg?: string;
  score?: number;
  selected?: boolean;
  rank?: number;
  [key: string]: unknown;
};

type TraceLayerData = {
  clusterSet: Set<string>;
  candidateByCbg: Map<string, TraceCandidate>;
  selectedCbg?: string;
  minScore: number;
  maxScore: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function hexToRgb(hex: string) {
  const cleaned = hex.replace('#', '');
  const expanded =
    cleaned.length === 3
      ? cleaned
          .split('')
          .map((char) => char + char)
          .join('')
      : cleaned;
  const intVal = parseInt(expanded, 16);
  return {
    r: (intVal >> 16) & 255,
    g: (intVal >> 8) & 255,
    b: intVal & 255
  };
}

function rgbToHex({ r, g, b }: { r: number; g: number; b: number }) {
  const toHex = (component: number) =>
    component.toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function interpolateHexColor(startHex: string, endHex: string, t: number) {
  const start = hexToRgb(startHex);
  const end = hexToRgb(endHex);
  const ratio = clamp(Number.isFinite(t) ? t : 0, 0, 1);

  return rgbToHex({
    r: Math.round(start.r + (end.r - start.r) * ratio),
    g: Math.round(start.g + (end.g - start.g) * ratio),
    b: Math.round(start.b + (end.b - start.b) * ratio)
  });
}

export default function CBGMap({
  cbgData,
  center = null,
  onCBGClick,
  onMapBackgroundClick,
  onTraceCbgInspect = null,
  selectedCBGs,
  seedCbgId = '',
  seedGuardRadiusKm = 0,
  showSeedGuardCircle = false,
  traceLayer = null,
  editingEnabled = true,
  focusedCbgId = '',
  focusNonce = 0
}: {
  cbgData: GeoJSONData;
  center?: [number, number] | null;
  onCBGClick: (cbgId: string, properties: Record<string, unknown>) => void;
  onMapBackgroundClick: (latlng: LatLng) => void;
  onTraceCbgInspect?: ((cbgId: string, properties: Record<string, unknown>) => void) | null;
  selectedCBGs: string[];
  seedCbgId?: string;
  seedGuardRadiusKm?: number;
  showSeedGuardCircle?: boolean;
  traceLayer?: TraceLayerData | null;
  editingEnabled?: boolean;
  focusedCbgId?: string;
  focusNonce?: number;
}) {
  const mapRef = useRef<MapRef>(null);
  const hasFittedRef = useRef(false);
  const lastFocusedTargetRef = useRef('');
  const [hoverCbgId, setHoverCbgId] = useState<string | null>(null);

  const seedCircleCenter = useMemo(
    () =>
      showSeedGuardCircle
        ? getFeatureCenterFromGeoJson(cbgData, seedCbgId)
        : null,
    [cbgData, seedCbgId, showSeedGuardCircle]
  );

  const seedCircleGeoJSON = useMemo(
    () =>
      seedCircleCenter
        ? createCircleGeoJson(seedCircleCenter, Number(seedGuardRadiusKm))
        : null,
    [seedCircleCenter, seedGuardRadiusKm]
  );

  const initialFitGeoJson = useMemo<GeoJSONData | null>(() => {
    if (!cbgData?.features?.length) {
      return null;
    }

    const selectedSet = new Set(
      selectedCBGs.map((cbgId) => normalizeCbgId(cbgId)).filter(Boolean)
    );

    if (!selectedSet.size) {
      return cbgData;
    }

    const selectedFeatures = cbgData.features.filter((feature) =>
      selectedSet.has(getFeatureCbgId(feature))
    );

    if (!selectedFeatures.length) {
      return cbgData;
    }

    return {
      type: 'FeatureCollection',
      features: selectedFeatures
    };
  }, [cbgData, selectedCBGs]);

  const bounds = useMemo(
    () => getBoundsForGeoJson(initialFitGeoJson),
    [initialFitGeoJson]
  );

  const getCandidateHeatColor = useCallback(
    (score: number) => {
      if (!traceLayer) {
        return TRACE_LOW_COLOR;
      }
      const hasRange =
        Number.isFinite(traceLayer.minScore) &&
        Number.isFinite(traceLayer.maxScore) &&
        traceLayer.maxScore > traceLayer.minScore;
      const normalized = hasRange
        ? (Number(score) - traceLayer.minScore) /
          (traceLayer.maxScore - traceLayer.minScore)
        : 1;
      return interpolateHexColor(TRACE_LOW_COLOR, TRACE_HIGH_COLOR, normalized);
    },
    [traceLayer]
  );

  const taggedData = useMemo(() => {
    if (!cbgData?.features) {
      return cbgData;
    }

    return {
      ...cbgData,
      features: cbgData.features.map((f) => ({
        ...f,
        properties: {
          ...f.properties,
          _cbg_id: getFeatureCbgId(f),
          ...(() => {
            const cbgId = getFeatureCbgId(f);
            const isFocused = cbgId === focusedCbgId;
            const candidate = cbgId ? traceLayer?.candidateByCbg.get(cbgId) : null;

            if (traceLayer) {
              if (traceLayer.clusterSet.has(cbgId)) {
                return {
                  _fill_color: '#1d4ed8',
                  _fill_opacity: 0.74,
                  _line_color: isFocused ? '#0f172a' : '#1e3a8a',
                  _line_width: isFocused ? 4 : 2.25
                };
              }

              if (traceLayer.selectedCbg === cbgId) {
                return {
                  _fill_color: '#f97316',
                  _fill_opacity: 0.85,
                  _line_color: isFocused ? '#0f172a' : '#9a3412',
                  _line_width: isFocused ? 4.75 : 3
                };
              }

              if (candidate) {
                return {
                  _fill_color: getCandidateHeatColor(Number(candidate.score ?? 0)),
                  _fill_opacity: 0.75,
                  _line_color: isFocused ? '#0f172a' : '#7c2d12',
                  _line_width: isFocused ? 4 : 2
                };
              }

              return {
                _fill_color: '#d1d5db',
                _fill_opacity: 0.12,
                _line_color: isFocused ? '#0f172a' : '#9ca3af',
                _line_width: isFocused ? 4 : 1.25
              };
            }

            const isSelected = selectedCBGs.includes(cbgId);
            return {
              _fill_color: isSelected ? '#70B4D4' : '#BDBDBD',
              _fill_opacity: isSelected ? 0.6 : 0.2,
              _line_color: isFocused
                ? '#0f172a'
                : isSelected
                  ? '#1f2937'
                  : '#6b7280',
              _line_width: isFocused ? 4 : isSelected ? 2 : 1.25
            };
          })()
        }
      }))
    };
  }, [cbgData, focusedCbgId, getCandidateHeatColor, selectedCBGs, traceLayer]);

  const focusedFeature = useMemo<GeoJSONFeature | null>(
    () =>
      taggedData?.features?.find(
        (item) => getFeatureCbgId(item) === focusedCbgId
      ) ?? null,
    [focusedCbgId, taggedData]
  );
  const focusTarget = `${focusedCbgId}:${focusNonce}`;

  const fitBoundsToData = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map || !bounds || hasFittedRef.current || selectedCBGs.length === 0) {
      return;
    }

    map.fitBounds(bounds, { padding: 16, maxZoom: 15, duration: 0 });
    hasFittedRef.current = true;
  }, [bounds, selectedCBGs.length]);

  useEffect(() => {
    fitBoundsToData();
  }, [fitBoundsToData]);

  const handleMapLoad = useCallback(() => {
    fitBoundsToData();
  }, [fitBoundsToData]);

  const handleClick = useCallback(
    (e: { lngLat: { lat: number; lng: number }; features?: { properties?: Record<string, unknown> }[] }) => {
      const feature = e.features?.[0];
      if (feature?.properties) {
        const cbgId = (feature.properties._cbg_id as string) || '';
        if (cbgId) {
          if (traceLayer && onTraceCbgInspect) {
            onTraceCbgInspect(cbgId, feature.properties);
            return;
          }
          if (!editingEnabled) {
            return;
          }
          onCBGClick(cbgId, feature.properties);
          return;
        }
      }
      if (editingEnabled) {
        onMapBackgroundClick({ lat: e.lngLat.lat, lng: e.lngLat.lng });
      }
    },
    [editingEnabled, onCBGClick, onMapBackgroundClick, onTraceCbgInspect, traceLayer]
  );

  const handleMouseLeave = useCallback(() => {
    setHoverCbgId(null);
  }, []);

  const handleMapMouseMove = useCallback(
    (e: { features?: { properties?: Record<string, unknown> }[] }) => {
      const feature = e.features?.[0];
      const cbgId = (feature?.properties?._cbg_id as string) || null;
      setHoverCbgId(cbgId);
    },
    []
  );

  // Hover highlight filter
  const hoverFilter = useMemo(
    () => hoverCbgId
      ? ['==', ['get', '_cbg_id'], hoverCbgId] as unknown as maplibregl.ExpressionSpecification
      : ['==', ['get', '_cbg_id'], ''] as unknown as maplibregl.ExpressionSpecification,
    [hoverCbgId]
  );

  useEffect(() => {
    const [normalized] = focusTarget.split(':');
    if (!normalized) {
      lastFocusedTargetRef.current = '';
      return;
    }

    if (lastFocusedTargetRef.current === focusTarget) {
      return;
    }

    const map = mapRef.current?.getMap();
    const feature = focusedFeature;
    if (!map || !feature) {
      return;
    }

    const featureBounds = getBoundsForGeoJson({
      type: 'FeatureCollection',
      features: [feature]
    });
    if (!featureBounds) {
      return;
    }

    map.fitBounds(featureBounds, {
      padding: 72,
      maxZoom: 11.25,
      duration: 0
    });
    lastFocusedTargetRef.current = focusTarget;
  }, [focusTarget, focusedFeature]);

  return (
    <MapLibreMap
      ref={mapRef}
      initialViewState={{
        latitude: center?.[0] ?? 39.3291,
        longitude: center?.[1] ?? -76.6220,
        zoom: 12
      }}
      style={{ width: '100%', height: '100%' }}
      mapStyle="https://basemaps.cartocdn.com/gl/positron-gl-style/style.json"
      interactiveLayerIds={['cbg-fill']}
      onLoad={handleMapLoad}
      onClick={handleClick}
      onMouseMove={handleMapMouseMove}
      onMouseLeave={handleMouseLeave}
      cursor={hoverCbgId ? 'pointer' : ''}
    >
      {seedCircleGeoJSON && (
        <Source
          id="seed-guard-circle"
          type="geojson"
          data={seedCircleGeoJSON as GeoJSON.FeatureCollection}
        >
          <Layer
            id="seed-guard-circle-fill"
            type="fill"
            paint={{
              'fill-color': '#60a5fa',
              'fill-opacity': 0.06
            }}
          />
          <Layer
            id="seed-guard-circle-line"
            type="line"
            paint={{
              'line-color': '#2563eb',
              'line-width': 2,
              'line-dasharray': [3, 2]
            }}
          />
        </Source>
      )}
      <Source id="cbg-data" type="geojson" data={taggedData as GeoJSON.FeatureCollection}>
        <Layer
          id="cbg-fill"
          type="fill"
          paint={{
            'fill-color': ['get', '_fill_color'],
            'fill-opacity': ['get', '_fill_opacity']
          }}
        />
        <Layer
          id="cbg-outline"
          type="line"
          paint={{
            'line-color': ['get', '_line_color'],
            'line-width': ['get', '_line_width']
          }}
        />
        <Layer
          id="cbg-hover"
          type="fill"
          filter={hoverFilter}
          paint={{
            'fill-color': '#70B4D4',
            'fill-opacity': 0.9
          }}
        />
        <Layer
          id="cbg-hover-outline"
          type="line"
          filter={hoverFilter}
          paint={{
            'line-color': '#1f2937',
            'line-width': 3
          }}
        />
      </Source>
    </MapLibreMap>
  );
}
