import React, {useState} from 'react';
import { MapContainer, Marker, Popup, TileLayer, SVGOverlay } from 'react-leaflet';
import L, { Icon, Point } from 'leaflet';

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

// var latLngBounds = L.latLngBounds([[32, -130], [13, -100]]);
// var svgOverlay = L.svgOverlay(facility, latLngBounds, {
//   opacity: 1.0,
//   interactive: true
// });

export default function ModelMap() {
  const [map, setMap] = useState(null);
  
  function MapParams(map2) {
    setMap(map2);

    console.log("hi");

    map.on('zoomend', function() {
      var currentZoom = map.getZoom();

      console.log(currentZoom);
  
  });

  }
  
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
    <MapContainer center={position} zoom={13} className='mapcontainer' whenCreated={setMap}>
      <TileLayer
        attribution='&amp;copy <a href="http://osm.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <SVGOverlay bounds={[[51, 0], [51.5, 0.5]]}>

      </SVGOverlay>
    </MapContainer>
  );
}