import React, { useState } from 'react';
import { MapContainer, Marker, Popup, TileLayer } from 'react-leaflet';
import L from 'leaflet';
import facility from '../assets/facility.svg';
import 'leaflet/dist/leaflet.css';
import './modelmap.css';

const position = [36.562036, -96.160775];

// Define custom icon
const iconFacility = new L.Icon({
  iconUrl: facility,
  iconRetinaUrl: facility,
  iconSize: [60, 75],
  iconAnchor: [30, 75], // Half of icon's width and full height
});

export default function ModelMap() {
  const [map, setMap] = useState(null);

  React.useEffect(() => {
    const L = require('leaflet');
    delete L.Icon.Default.prototype._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: require('leaflet/dist/images/marker-icon-2x.png'),
      iconUrl: require('leaflet/dist/images/marker-icon.png'),
      shadowUrl: require('leaflet/dist/images/marker-shadow.png'),
    });
  }, []);

  return (
    <MapContainer center={position} zoom={13} className="mapcontainer" whenCreated={setMap}>
      <TileLayer
        attribution='&amp;copy <a href="http://osm.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Marker position={position} icon={iconFacility} zoomPanOptions={{ minZoom: 10, maxZoom: 18 }}>
        <Popup>This building is brown.</Popup>
      </Marker>
    </MapContainer>
  );
}