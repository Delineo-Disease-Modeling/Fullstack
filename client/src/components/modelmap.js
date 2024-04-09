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
  iconUrl: facility,
  iconRetinaUrl: facility,
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
function createFacilityMarker(position, name, number, icon) {
  const marker = (
    <Marker key={number} position={position} icon={icon} zoomPanOptions={{ minZoom: 10, maxZoom: 18 }}>
      <Popup>{name}</Popup>
    </Marker>
  );
  return { marker, name };
};

function updateFacilityIcons(curtime, patterns, sim_data, setPublicFacilities, setFacilityMap) {
  var facilities = [];
  const facilityMap = new Map();

  curtime = curtime * 60;

  fetch('data/barnsdall/papdata.json').then((res) => {
    res.json().then((papdata) => {
      for (const [index, data] of Object.entries(papdata['places'])) {
        const number = parseInt(index) + 1;

        var facilityObject = createFacilityMarker([data.latitude, data.longitude], data.label, number, facilityIcon);
        var peopleAtFacility = patterns[curtime.toString()]?.['places']?.[number.toString()];
        var numInfected = 0.0;

        if (peopleAtFacility) {
          console.log(peopleAtFacility);
          var curData = sim_data[curtime];

          if (curData) {
            for (const id of Object.keys(curData['delta'])) {
              if (peopleAtFacility.find(x => x === id)) {
                numInfected += 1.0;
              }
            }

            for (const id of Object.keys(curData['omicron'])) {
              if (peopleAtFacility.find(x => x === id)) {
                numInfected += 1.0;
              }
            }
          }

          console.log(numInfected);

          if (numInfected / 3.0 > 0.5) {
            facilityObject = createFacilityMarker([data.latitude, data.longitude], data.label, number, redFacilityIcon);
          } else if (numInfected / 3.0 > 0.0) {
            facilityObject = createFacilityMarker([data.latitude, data.longitude], data.label, number, orangeFacilityIcon);
          }
        }

        facilities.push(facilityObject);
        facilityMap.set(number, facilityObject); // Store facility number and object in the map
      }

      setPublicFacilities(facilities);
      setFacilityMap(facilityMap); // Set the facility map state
    });
  });
}

export default function ModelMap({ sim_data }) {
  const [map, setMap] = useState(null);
  const [publicFacilities, setPublicFacilities] = useState([]);
  const [facilityMap, setFacilityMap] = useState(new Map()); // Map to store facility number and object
  const [patterns, setPatterns] = useState({});

  const [timestamp, setTimestamp] = useState(13); // State for zoom level and map slider

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
        setPatterns(data);
        updateFacilityIcons(0, patterns, sim_data, setPublicFacilities, setFacilityMap);
      })
    })
  }, [patterns, sim_data]);

  return (
    <div>
      {/* Map Container */}
      <MapContainer center={[36.562036, -96.160775]} zoom={13} className="mapcontainer" whenCreated={setMap}>
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
          max={1666} 
          value={timestamp} 
          onChange={(e) => { setTimestamp(parseInt(e.target.value)); updateFacilityIcons(timestamp, patterns, sim_data, setPublicFacilities, setFacilityMap); }}
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
          max={1666} 
          value={timestamp} 
          onChange={(e) => { setTimestamp(parseInt(e.target.value)); updateFacilityIcons(timestamp, patterns, sim_data, setPublicFacilities, setFacilityMap);}}
          style={{ width: '10%' }}
        />
      </div>
    </div>
  );
}