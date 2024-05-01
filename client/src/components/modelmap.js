import React, { useState } from 'react';
import { MapContainer, Marker, TileLayer, Popup, LayersControl } from 'react-leaflet';
import MarkerClusterGroup from "react-leaflet-cluster";
import L from 'leaflet';

import 'leaflet/dist/leaflet.css';
import './modelmap.css';

const {Overlay} = LayersControl;

const g_facility_icon = new L.Icon({
  iconUrl: require("../assets/facility.svg").default,
  iconSize: new L.Point(40, 47)
});

const o_facility_icon = new L.Icon({
  iconUrl: require("../assets/orangefacility.svg").default,
  iconSize: new L.Point(40, 47)
});

const r_facility_icon = new L.Icon({
  iconUrl: require("../assets/redfacility.svg").default,
  iconSize: new L.Point(40, 47)
});

const g_household_icon = new L.Icon({
  iconUrl: require("../assets/household.svg").default,
  iconSize: new L.Point(40, 47)
});

const o_household_icon = new L.Icon({
  iconUrl: require("../assets/orangehousehold.svg").default,
  iconSize: new L.Point(40, 47)
});

const r_household_icon = new L.Icon({
  iconUrl: require("../assets/redhousehold.svg").default,
  iconSize: new L.Point(40, 47)
});

// Function to create markers for public facilities
function createFacilityMarker(position, name, label, icon, proportion) {
  return [ icon, name, label, position, proportion ];
};

const map_centers = {
  'barnsdall': [36.562036, -96.160775],
  'hagerstown': [39.64168, -77.718986]
}

const createClusterCustomIcon = function (cluster) {
  var colored = cluster.getAllChildMarkers().some(x => x.options.proportion > 0.0);

  // return new L.DivIcon({ 
  //   html: `<div><span>${cluster.getChildCount()}</span></div>`, 
  //   className: 'marker-cluster ' + colored ? 'marker-cluster-medium' : 'marker-cluster-small', 
  //   iconSize: new L.Point(40, 40, true) 
  // });

  return L.divIcon({
    html: `<span class="marker-cluster">${cluster.getChildCount()}</span>`,
    className: colored ? 'marker-cluster-medium marker-cluster' : 'marker-cluster-small marker-cluster',
    iconSize: L.point(40, 40, true)
  });
}

var household_locs = {};

function updateIcons(curtime, type, location, patterns, sim_data, callback) {
  var new_icons = [];

  curtime = (curtime * 60).toString();

  fetch(`data/${location}/papdata.json`).then((res) => {
    res.json().then((papdata) => {
      for (const [index, data] of Object.entries(papdata[type])) {
        if (type === 'homes') {
          data.label = `Home #${index}`;

          if (!(index in household_locs)) {
            household_locs[index] = [ 
              map_centers[location][0] + (Math.random() * 0.06 - 0.03), 
              map_centers[location][1] + (Math.random() * 0.06 - 0.03) 
            ];
          }

          data['latitude'] = household_locs[index][0];
          data['longitude'] = household_locs[index][1];  
        }

        var new_marker = null;
        var peopleAtFacility = patterns[curtime]?.[type]?.[index];

        var icon = type === 'homes' ? g_household_icon : g_facility_icon;
        var label_text = `Pop:Inf: 0:0`;

        if (peopleAtFacility) {
          var numInfected = 0.0;
          var curData = sim_data[curtime];

          if (curData) {
            for (const variant of Object.keys(curData)) {
              for (const id of Object.keys(curData[variant])) {
                if (peopleAtFacility.indexOf(id) !== -1) {
                  numInfected += 1.0;
                }
              }
            }
          }

          label_text = `Pop:Inf: ${peopleAtFacility.length}:${numInfected}`;

          if (numInfected / peopleAtFacility.length > 0.1) {
            icon = type === 'homes' ? r_household_icon : r_facility_icon;
          } else if (numInfected / peopleAtFacility.length > 0.0) {
            icon = type === 'homes' ? o_household_icon : o_facility_icon;
          }

          new_marker = createFacilityMarker([data.latitude, data.longitude], data.label, label_text, icon, numInfected / peopleAtFacility.length)
        } else {
          new_marker = createFacilityMarker([data.latitude, data.longitude], data.label, label_text, icon, 0.0);
        }

        if (new_marker?.length) {
          new_icons.push(new_marker);
        }
      }

      callback(new_icons);
    });
  });
}

function ClusteredMap({ location, timestamp, publicFacilities, households }) {
  return (
    <MapContainer center={map_centers[location]} zoom={13} scrollWheelZoom={true} className="mapcontainer">
      <TileLayer
        attribution='&copy; <a href="http://osm.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      <MarkerClusterGroup
        chunkedLoading
        iconCreateFunction={createClusterCustomIcon}
        maxClusterRadius={150}
        key={Date.now()}
      >
        {publicFacilities.map((addr, index) => (
          <Marker
            icon={addr[0]}
            key={index}
            position={addr[3]}
            title={addr[1]}
            proportion={addr[4]}
          >
            <Popup>{addr[1]}<br></br>{addr[2]}</Popup>
          </Marker>
        ))}

        {households.map((addr, index) => (
          <Marker
            icon={addr[0]}
            key={index}
            position={addr[3]}
            title={addr[1]}
            proportion={addr[4]}
          >
            <Popup>{addr[1]}<br></br>{addr[2]}</Popup>
          </Marker>
        ))}
      </MarkerClusterGroup>

      {/* <LayersControl position="topright">
        <LayersControl.BaseLayer checked name="Map">
          <TileLayer
            attribution='&amp;copy <a href="http://osm.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
        </LayersControl.BaseLayer>

        <Overlay checked name="Facilities">
          <MarkerClusterGroup chunkedLoading>
            {publicFacilities.map((addr, index) => (
              <Marker
                icon={addr[0]}
                key={index}
                position={addr[3]}
                title={addr[1]}
              >
                <Popup>{addr[1]}<br></br>{addr[2]}</Popup>
              </Marker>
            ))}
          </MarkerClusterGroup>
        </Overlay>

        <Overlay checked name="Households">
          <MarkerClusterGroup chunkedLoading>
            {households.map((addr, index) => (
              <Marker
                icon={addr[0]}
                key={index}
                position={addr[3]}
                title={addr[1]}
              >
                <Popup>{addr[1]}<br></br>{addr[2]}</Popup>
              </Marker>
            ))}
          </MarkerClusterGroup>
        </Overlay>
      </LayersControl> */}
    </MapContainer>
  );
}

export default function ModelMap({ sim_data, location }) {
  const [ publicFacilities, setPublicFacilities ] = useState([]);
  const [ households, setHouseholds ] = useState([]);
  const [ patterns, setPatterns ] = useState({});
  const [ maxHours, setMaxHours ] = useState(1);

  const [timestamp, setTimestamp] = useState(1); // State for zoom level and map slider

  React.useEffect(() => {
    household_locs = {};

    fetch(`data/${location}/patterns.json`).then((res) => {
      res.json().then((data) => {
        setMaxHours(Math.max(...Object.keys(data)) / 60);
        setPatterns(data);
        updateIcons(1, 'places', location, data, sim_data, setPublicFacilities);
        updateIcons(1, 'homes', location, data, sim_data, setHouseholds);
      })
    })
  }, []);

  return (
    <div>
      {/* Map Container */}
      <ClusteredMap location={location} timestamp={timestamp} publicFacilities={publicFacilities} households={households} />

      {/* Slider Component */}
      <div style={{ width: '100%', marginTop: '20px' }}>
        <input 
          type="range" 
          min={1} 
          max={maxHours} 
          value={timestamp} 
          onChange={(e) => {
            setTimestamp(parseInt(e.target.value)); updateIcons(timestamp, 'places', location, patterns, sim_data, setPublicFacilities);
            setTimestamp(parseInt(e.target.value)); updateIcons(timestamp, 'homes', location, patterns, sim_data, setHouseholds);
          }}
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
          onChange={(e) => { 
            setTimestamp(parseInt(e.target.value)); updateIcons(timestamp, 'places', location, patterns, sim_data, setPublicFacilities);
            setTimestamp(parseInt(e.target.value)); updateIcons(timestamp, 'homes', location, patterns, sim_data, setHouseholds);
          }}
          style={{ width: '10%' }}
        />
      </div>
    </div>
  );
}