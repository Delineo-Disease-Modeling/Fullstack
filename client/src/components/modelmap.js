import React from 'react';
import { MapContainer, Marker, Popup, TileLayer } from 'react-leaflet';
import { Icon, Point } from 'leaflet';

import facility from '../assets/facility.svg';

import 'leaflet/dist/leaflet.css';
import './modelmap.css';

const position = [36.562036, -96.160775]

const iconFacility = new Icon({
  iconUrl: facility,
  iconRetinaUrl: facility,
  iconAnchor: null,
  popupAnchor: null,
  shadowUrl: null,
  shadowSize: null,
  shadowAnchor: null,
  iconSize: new Point(60, 75),
  className: 'leaflet-div-icon'
});

export default function ModelMap() {
  React.useEffect(() => {
    const L = require("leaflet");

    delete L.Icon.Default.prototype._getIconUrl;

    L.Icon.Default.mergeOptions({
      iconRetinaUrl: require("leaflet/dist/images/marker-icon-2x.png"),
      iconUrl: require("leaflet/dist/images/marker-icon.png"),
      shadowUrl: require("leaflet/dist/images/marker-shadow.png")
    });
  }, []);

  return (
    <MapContainer center={position} zoom={13} className='mapcontainer'>
      <TileLayer
        attribution='&amp;copy <a href="http://osm.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Marker position={position} icon={iconFacility}>
        <Popup>
          Popup
        </Popup>
      </Marker>
    </MapContainer>
  );
}