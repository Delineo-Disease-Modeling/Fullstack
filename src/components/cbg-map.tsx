'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Layer, Map, Popup, Source } from 'react-map-gl/maplibre';
import type { MapRef } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';

interface LatLng {
  lat: number;
  lng: number;
}

interface GeoJSONData {
  type: string;
  features: Array<{
    type: string;
    properties: Record<string, unknown>;
    geometry: object;
  }>;
}

export default function CBGMap({
  cbgData,
  onCBGClick,
  onMapBackgroundClick,
  selectedCBGs
}: {
  cbgData: GeoJSONData;
  onCBGClick: (cbgId: string, properties: Record<string, unknown>) => void;
  onMapBackgroundClick: (latlng: LatLng) => void;
  selectedCBGs: string[];
}) {
  const mapRef = useRef<MapRef>(null);
  const hasFittedRef = useRef(false);
  const [hoverCbgId, setHoverCbgId] = useState<string | null>(null);
  const [popupInfo, setPopupInfo] = useState<{
    lng: number;
    lat: number;
    cbgId: string;
    population: string;
    inZone: boolean;
  } | null>(null);

  // Tag each feature with its CBG ID for filter expressions
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
          _cbg_id:
            (f.properties?.GEOID as string) ||
            (f.properties?.CensusBlockGroup as string) ||
            ''
        }
      }))
    };
  }, [cbgData]);

  // Reset fit flag when CBG data changes so we re-center for new data
  useEffect(() => {
    hasFittedRef.current = false;
  }, [cbgData]);

  // Fit map bounds to CBG features
  const fitBoundsToData = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map || !cbgData?.features?.length || hasFittedRef.current) {
      return;
    }

    let minLng = Infinity, maxLng = -Infinity;
    let minLat = Infinity, maxLat = -Infinity;

    for (const feature of cbgData.features) {
      const coords = (feature.geometry as { coordinates: number[][][][] })?.coordinates;
      if (!coords) {
        continue;
      }
      // Handle both Polygon and MultiPolygon
      const rings = Array.isArray(coords[0]?.[0]?.[0]) ? coords.flat() : coords;
      for (const ring of rings) {
        for (const point of ring as unknown as number[][]) {
          minLng = Math.min(minLng, point[0]);
          maxLng = Math.max(maxLng, point[0]);
          minLat = Math.min(minLat, point[1]);
          maxLat = Math.max(maxLat, point[1]);
        }
      }
    }

    if (minLng !== Infinity) {
      map.fitBounds(
        [[minLng, minLat], [maxLng, maxLat]],
        { padding: 20, maxZoom: 14, duration: 0 }
      );
      hasFittedRef.current = true;
    }
  }, [cbgData]);

  // Fit bounds when data arrives (if map is already loaded)
  useEffect(() => {
    fitBoundsToData();
  }, [fitBoundsToData]);

  // Also fit bounds when map finishes loading (if data arrived first)
  const handleMapLoad = useCallback(() => {
    fitBoundsToData();
  }, [fitBoundsToData]);

  // Build a set for selected CBGs (used in filter expressions)
  const selectedSet = useMemo(() => new Set(selectedCBGs), [selectedCBGs]);

  // MapLibre GL expressions for selected/unselected styling
  const selectedFilter = useMemo(
    () => ['in', ['get', '_cbg_id'], ['literal', selectedCBGs]] as unknown as maplibregl.ExpressionSpecification,
    [selectedCBGs]
  );
  const unselectedFilter = useMemo(
    () => ['!', ['in', ['get', '_cbg_id'], ['literal', selectedCBGs]]] as unknown as maplibregl.ExpressionSpecification,
    [selectedCBGs]
  );

  const handleClick = useCallback(
    (e: { lngLat: { lat: number; lng: number }; features?: { properties?: Record<string, unknown> }[] }) => {
      const feature = e.features?.[0];
      if (feature?.properties) {
        const cbgId = (feature.properties._cbg_id as string) || '';
        if (cbgId) {
          onCBGClick(cbgId, feature.properties);
          return;
        }
      }
      // Background click
      onMapBackgroundClick({ lat: e.lngLat.lat, lng: e.lngLat.lng });
    },
    [onCBGClick, onMapBackgroundClick]
  );

  const handleMouseMove = useCallback(
    (e: { features?: { properties?: Record<string, unknown> }[] }) => {
      const feature = e.features?.[0];
      const cbgId = (feature?.properties?._cbg_id as string) || null;
      setHoverCbgId(cbgId);

      if (feature?.properties && cbgId) {
        // We don't have lngLat from mousemove features directly,
        // so we use popup on hover via state
        setPopupInfo(null); // Clear popup on hover to avoid stale state
      }
    },
    []
  );

  const handleMouseLeave = useCallback(() => {
    setHoverCbgId(null);
    setPopupInfo(null);
  }, []);

  // Show tooltip on hover using a different approach — track mouse position
  const handleMapMouseMove = useCallback(
    (e: { lngLat: { lat: number; lng: number }; features?: { properties?: Record<string, unknown> }[] }) => {
      const feature = e.features?.[0];
      const cbgId = (feature?.properties?._cbg_id as string) || null;
      setHoverCbgId(cbgId);

      if (cbgId && feature?.properties) {
        const pop = feature.properties.population ?? 'N/A';
        const inZone = selectedSet.has(cbgId);
        setPopupInfo({
          lng: e.lngLat.lng,
          lat: e.lngLat.lat,
          cbgId,
          population: String(pop),
          inZone
        });
      } else {
        setPopupInfo(null);
      }
    },
    [selectedSet]
  );

  // Hover highlight filter
  const hoverFilter = useMemo(
    () => hoverCbgId
      ? ['==', ['get', '_cbg_id'], hoverCbgId] as unknown as maplibregl.ExpressionSpecification
      : ['==', ['get', '_cbg_id'], ''] as unknown as maplibregl.ExpressionSpecification,
    [hoverCbgId]
  );

  return (
    <Map
      ref={mapRef}
      initialViewState={{
        latitude: 39.3291,
        longitude: -76.6220,
        zoom: 12
      }}
      style={{ width: '100%', height: '100%' }}
      mapStyle="https://basemaps.cartocdn.com/gl/positron-gl-style/style.json"
      interactiveLayerIds={['cbg-fill-selected', 'cbg-fill-unselected']}
      onLoad={handleMapLoad}
      onClick={handleClick}
      onMouseMove={handleMapMouseMove}
      onMouseLeave={handleMouseLeave}
      cursor={hoverCbgId ? 'pointer' : ''}
    >
      <Source id="cbg-data" type="geojson" data={taggedData as GeoJSON.FeatureCollection}>
        {/* Unselected fill */}
        <Layer
          id="cbg-fill-unselected"
          type="fill"
          filter={unselectedFilter}
          paint={{
            'fill-color': '#BDBDBD',
            'fill-opacity': 0.2
          }}
        />
        {/* Selected fill */}
        <Layer
          id="cbg-fill-selected"
          type="fill"
          filter={selectedFilter}
          paint={{
            'fill-color': '#70B4D4',
            'fill-opacity': 0.6
          }}
        />
        {/* Unselected outline */}
        <Layer
          id="cbg-outline-unselected"
          type="line"
          filter={unselectedFilter}
          paint={{
            'line-color': '#6b7280',
            'line-width': 1.25
          }}
        />
        {/* Selected outline */}
        <Layer
          id="cbg-outline-selected"
          type="line"
          filter={selectedFilter}
          paint={{
            'line-color': '#1f2937',
            'line-width': 2
          }}
        />
        {/* Hover highlight */}
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
      {popupInfo && (
        <Popup
          longitude={popupInfo.lng}
          latitude={popupInfo.lat}
          anchor="bottom"
          closeButton={false}
          closeOnClick={false}
        >
          <div className="text-xs font-[Poppins]">
            <strong>CBG:</strong> {popupInfo.cbgId}<br />
            <strong>Population:</strong> {popupInfo.population}<br />
            <strong>Status:</strong> {popupInfo.inZone ? 'In Zone' : 'Click to Add'}
          </div>
        </Popup>
      )}
    </Map>
  );
}
