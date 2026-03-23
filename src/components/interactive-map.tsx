'use client';

import type { FeatureCollection, GeoJsonProperties, Geometry } from 'geojson';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Layer, Map as MapLibreMap, Marker, Source } from 'react-map-gl/maplibre';
import type { MapRef } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  createCircleGeoJson,
  getBoundsForGeoJson,
  getFeatureCenterFromGeoJson,
  type GeoJSONData
} from '@/lib/cz-geo';

export default function InteractiveMap({
  onLocationSelect,
  disabled,
  seedGeoJSON = null,
  seedCbgId = '',
  seedGuardRadiusKm = 0,
  showSeedGuardCircle = false
}: {
  onLocationSelect: (coords: string) => void;
  disabled: boolean;
  seedGeoJSON?: GeoJSONData | null;
  seedCbgId?: string;
  seedGuardRadiusKm?: number;
  showSeedGuardCircle?: boolean;
}) {
  const mapRef = useRef<MapRef>(null);
  const hasFittedRef = useRef(false);
  const [marker, setMarker] = useState<{ lat: number; lng: number } | null>(null);

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
  const seedPreviewData = seedGeoJSON as FeatureCollection<
    Geometry,
    GeoJsonProperties
  > | null;
  const seedGuardPreviewData = seedCircleGeoJSON as FeatureCollection<
    Geometry,
    GeoJsonProperties
  > | null;

  const fitToSeedBounds = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map || !seedBounds || hasFittedRef.current) {
      return;
    }

    map.fitBounds(seedBounds, {
      padding: 24,
      maxZoom: 13,
      duration: 0
    });
    hasFittedRef.current = true;
  }, [seedBounds]);

  useEffect(() => {
    hasFittedRef.current = false;
    fitToSeedBounds();
  }, [fitToSeedBounds]);

  const handleClick = useCallback(
    (e: { lngLat: { lat: number; lng: number } }) => {
      if (disabled) {
        return;
      }
      const { lat, lng } = e.lngLat;
      setMarker({ lat, lng });
      onLocationSelect(`${lat.toFixed(4)}, ${lng.toFixed(4)}`);
    },
    [disabled, onLocationSelect]
  );

  return (
    <MapLibreMap
      ref={mapRef}
      initialViewState={{
        latitude: 39.3291,
        longitude: -76.6220,
        zoom: 10
      }}
      style={{ width: '100%', height: '100%' }}
      mapStyle="https://basemaps.cartocdn.com/gl/positron-gl-style/style.json"
      onLoad={fitToSeedBounds}
      onClick={handleClick}
    >
      {seedPreviewData && (
        <Source id="seed-preview" type="geojson" data={seedPreviewData}>
          <Layer
            id="seed-preview-fill"
            type="fill"
            paint={{
              'fill-color': '#93c5fd',
              'fill-opacity': 0.22
            }}
          />
          <Layer
            id="seed-preview-outline"
            type="line"
            paint={{
              'line-color': '#2563eb',
              'line-width': 2
            }}
          />
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
      {marker && (
        <Marker latitude={marker.lat} longitude={marker.lng} anchor="bottom">
          <div style={{ fontSize: '24px' }}>📍</div>
        </Marker>
      )}
    </MapLibreMap>
  );
}
