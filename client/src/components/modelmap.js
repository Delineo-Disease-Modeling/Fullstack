import React, { useState } from 'react';
import { MapContainer, Marker, Popup, TileLayer, LayersControl } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './modelmap.css';

import facility from '../assets/facility.svg';
import orangefacility from '../assets/orangefacility.svg';
import redfacility from '../assets/redfacility.svg';

const { Overlay } = LayersControl;

// Define custom icon
const facilityIcon = new L.Icon({
  iconRetinaUrl: facility,
  iconUrl: facility,
  iconSize: [36, 45],
  iconAnchor: [18, 45], // Half of icon's width and full height
});

const redFacilityIcon = new L.Icon({
  iconUrl: redfacility,
  iconRetinaUrl: redfacility,
  iconSize: [36, 45],
  iconAnchor: [18, 45], // Half of icon's width and full height
});

const orangeFacilityIcon = new L.Icon({
  iconUrl: orangefacility,
  iconRetinaUrl: orangefacility,
  iconSize: [36, 45],
  iconAnchor: [18, 45], // Half of icon's width and full height
});

// Function to create markers for public facilities
function createFacilityMarker(position, name, number, label, icon) {
  const marker = (
    <Marker key={number} position={position} icon={icon} style={{fill: "red"}}zoomPanOptions={{ minZoom: 10, maxZoom: 18 }}>
      <Popup>{name}<br></br>{label}</Popup>
    </Marker>
  );
  return { marker, name };
};

function updateFacilityIcons(curtime, patterns, sim_data, setPublicFacilities) {
  var facilities = [];

  curtime = curtime * 60;

  fetch('data/barnsdall/papdata.json').then((res) => {
    res.json().then((papdata) => {
      for (const [index, data] of Object.entries(papdata['places'])) {
        const number = parseInt(index) + 1;

        var facilityObject = null;
        var peopleAtFacility = patterns[curtime.toString()]?.['places']?.[number.toString()];

        if (peopleAtFacility) {
          var numInfected = 0.0;
          var curData = sim_data[curtime];

          if (curData) {
            for (const id of Object.keys(curData['delta'])) {
              if (peopleAtFacility.indexOf(id) !== -1) {
                numInfected += 1.0;
              }
            }

            for (const id of Object.keys(curData['omicron'])) {
              if (peopleAtFacility.indexOf(id) !== -1) {
                numInfected += 1.0;
              }
            }
          }

          var label_text = `Pop:Inf: ${peopleAtFacility.length}:${numInfected}`;

          if (numInfected / peopleAtFacility.length > 0.1) {
            facilityObject = createFacilityMarker([data.latitude, data.longitude], data.label, number, label_text, redFacilityIcon);
          } else if (numInfected / peopleAtFacility.length > 0.0) {
            facilityObject = createFacilityMarker([data.latitude, data.longitude], data.label, number, label_text, orangeFacilityIcon);
          } else {
            facilityObject = createFacilityMarker([data.latitude, data.longitude], data.label, number, label_text, facilityIcon);
          }
        } else {
          facilityObject = createFacilityMarker([data.latitude, data.longitude], data.label, number, '', facilityIcon);
        }

        if (facilityObject) {
          facilities.push(facilityObject);
        }
      }

      setPublicFacilities(facilities);
    });
  });
}

export default function ModelMap({ sim_data }) {
  const [ publicFacilities, setPublicFacilities ] = useState([]);
  const [ patterns, setPatterns ] = useState({});
  const [ maxHours, setMaxHours ] = useState(1);

  const [timestamp, setTimestamp] = useState(1); // State for zoom level and map slider

  React.useEffect(() => {
    const L = require('leaflet');
    delete L.Icon.Default.prototype._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: require('leaflet/dist/images/marker-icon-2x.png'),
      iconUrl: require('leaflet/dist/images/marker-icon.png'),
      shadowUrl: require('leaflet/dist/images/marker-shadow.png'),
    });

    fetch('data/barnsdall/patterns.json').then((res) => {
      res.json().then((data) => {
        console.log(Math.max(...Object.keys(data)))
        setMaxHours(Math.max(...Object.keys(data)) / 60);
        setPatterns(data);
        updateFacilityIcons(1, data, sim_data, setPublicFacilities);
      })
    })
  }, []);

  return (
    <div>
      {/* Map Container */}
      <MapContainer center={[36.562036, -96.160775]} zoom={13} className="mapcontainer">
        <LayersControl position="topright">
          <LayersControl.BaseLayer checked name="Map">
            <TileLayer
              attribution='&amp;copy <a href="http://osm.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
          </LayersControl.BaseLayer>
          <Overlay checked name="Public Facilities">
            {/* Render the markers for public facilities */}
            {publicFacilities.map(({ marker, name }) => (
              <LayersControl.Overlay checked key={name} name={name}>
                {marker}
              </LayersControl.Overlay>
            ))}
          </Overlay>
        </LayersControl>
      </MapContainer>

      {/* Slider Component */}
      <div style={{ width: '100%', marginTop: '20px' }}>
        <input 
          type="range" 
          min={1} 
          max={maxHours} 
          value={timestamp} 
          onChange={(e) => { setTimestamp(parseInt(e.target.value)); updateFacilityIcons(timestamp, patterns, sim_data, setPublicFacilities); }}
          style={{ width: '100%' }}
        />
        <div style={{ textAlign: 'center', marginTop: '12px' }}>
          {timestamp} Hours
        </div>
      </div>

      {/* Input Box */}
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: '12px' }}>
        <input 
          type="number" 
          min={1} 
          max={maxHours} 
          value={timestamp} 
          onChange={(e) => { setTimestamp(parseInt(e.target.value)); updateFacilityIcons(timestamp, patterns, sim_data, setPublicFacilities);}}
          style={{ width: '10%' }}
        />
      </div>
    </div>
  );
}