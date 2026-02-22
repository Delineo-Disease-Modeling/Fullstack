'use client';

import { useState } from 'react';
import {
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  useMapEvents
} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

interface LatLng {
  lat: number;
  lng: number;
}

function LocationMarker({
  onLocationSelect,
  disabled
}: {
  onLocationSelect: (coords: string) => void;
  disabled: boolean;
}) {
  const [markerPosition, setMarkerPosition] = useState<LatLng | null>(null);

  useMapEvents({
    click(e: { latlng: LatLng }) {
      if (disabled) return;
      setMarkerPosition(e.latlng);
      onLocationSelect(
        `${e.latlng.lat.toFixed(4)}, ${e.latlng.lng.toFixed(4)}`
      );
    }
  });

  return markerPosition === null ? null : (
    <Marker position={markerPosition}>
      <Popup>
        Selected Location: {markerPosition.lat.toFixed(4)},{' '}
        {markerPosition.lng.toFixed(4)}
      </Popup>
    </Marker>
  );
}

export default function InteractiveMap({
  onLocationSelect,
  disabled
}: {
  onLocationSelect: (coords: string) => void;
  disabled: boolean;
}) {
  return (
    <MapContainer
      center={[39.3290708, -76.6219753]}
      zoom={10}
      style={{ height: '100%', width: '100%' }}
    >
      <TileLayer
        attribution="&copy; OpenStreetMap contributors"
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <LocationMarker onLocationSelect={onLocationSelect} disabled={disabled} />
    </MapContainer>
  );
}
