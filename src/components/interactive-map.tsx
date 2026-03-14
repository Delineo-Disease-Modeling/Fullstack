'use client';

import { useCallback, useState } from 'react';
import { Map, Marker } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';

export default function InteractiveMap({
  onLocationSelect,
  disabled
}: {
  onLocationSelect: (coords: string) => void;
  disabled: boolean;
}) {
  const [marker, setMarker] = useState<{ lat: number; lng: number } | null>(null);

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
    <Map
      initialViewState={{
        latitude: 39.3291,
        longitude: -76.6220,
        zoom: 10
      }}
      style={{ width: '100%', height: '100%' }}
      mapStyle="https://basemaps.cartocdn.com/gl/positron-gl-style/style.json"
      onClick={handleClick}
    >
      {marker && (
        <Marker latitude={marker.lat} longitude={marker.lng} anchor="bottom">
          <div style={{ fontSize: '24px' }}>📍</div>
        </Marker>
      )}
    </Map>
  );
}
