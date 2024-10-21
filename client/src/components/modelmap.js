import React, { useState } from 'react';
import { MapContainer, Marker, TileLayer, Popup } from 'react-leaflet';
import MarkerClusterGroup from "react-leaflet-cluster";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { CustomTooltip } from './customtooltip';
import L from 'leaflet';

import 'leaflet/dist/leaflet.css';
import './modelmap.css';

const icon_lookup = {
  "Depository Credit Intermediation": "🏦",
  "Restaurants and Other Eating Places": "🍽️",
  "Offices of Physicians": "🏥",
  "Religious Organizations": "⛪",
  "Personal Care Services": "🏢",
  "Child Day Care Services": "🏫",
  "Death Care Services": "🪦",
  "Elementary and Secondary Schools": "🏫",
  "Florists": "💐",
  "Museums, Historical Sites, and Similar Institutions": "🏛️",
  "Grocery Stores": "🛒",
  "Nursing Care Facilities (Skilled Nursing Facilities)": "🏥",
  "Justice, Public Order, and Safety Activities": "🚔",
  "Administration of Economic Programs": "🏛️",
  "General Merchandise Stores, including Warehouse Clubs and Supercenters": "🏬",
  "Gasoline Stations": "⛽",
  "Agencies, Brokerages, and Other Insurance Related Activities": "🏢",
  "Automotive Repair and Maintenance": "🚗",
  "Specialty Food Stores": "🏪",
  "Coating, Engraving, Heat Treating, and Allied Activities": "🏢",
  "Building Material and Supplies Dealers": "🏢",
  "Postal Service": "📬",
  "Home": "🏠" 
}

const marker_icon = (category, color) => { 
  return new L.divIcon({
    html: `
    <div style="display:flex;justify-content:center;align-items:center;text-align:center;background-color:${color};width:30px;height:30px">
      <div style="font-size:25px;text-align:center;">${icon_lookup[category]}</div>
    </div>
    `
  })
}

// Function to create markers for public facilities
function createFacilityMarker(id, position, name, label, icon, proportion) {
  return [icon, name, label, position, proportion, id];
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

function updateIcons(curtime, type, location, patterns, sim_data, pap_data, callback) {
  var new_icons = [];

  curtime = (curtime * 60).toString();

  for (const [index, data] of Object.entries(pap_data[type])) {
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

    var icon = type === 'homes' ? marker_icon("Home", 'green') : marker_icon(pap_data[type][index]['top_category'], 'green');
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
        icon = type === 'homes' ? marker_icon("Home", 'red') : marker_icon(pap_data[type][index]['top_category'], 'red');
      } else if (numInfected / peopleAtFacility.length > 0.0) {
        icon = type === 'homes' ? marker_icon("Home", 'red') : marker_icon(pap_data[type][index]['top_category'], 'orange');
      }  

      new_marker = createFacilityMarker(index, [data.latitude, data.longitude], data.label, label_text, icon, numInfected / peopleAtFacility.length)
    } else {
      new_marker = createFacilityMarker(index, [data.latitude, data.longitude], data.label, label_text, icon, 0.0);
    }

    if (new_marker?.length) {
      new_icons.push(new_marker);
    }
  }

  callback(new_icons);
}

function ClusteredMap({ location, timestamp, publicFacilities, households, loc_patterns }) {
  const marker_icon = (type, addr, index) => (
    <Marker
    icon={addr[0]}
    key={index}
    position={addr[3]}
    title={addr[1]}
    proportion={addr[4]}
    >
      <Popup>
        <div>
          <h4>{addr[1]}</h4>
          <p>{addr[2]}</p>
          {/* Recharts LineChart using the graph data from move_patterns */}
          <LineChart
            width={300}
            height={200}
            data={loc_patterns[type][addr[5]]} // This is the time-series data for the graph
            margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
          >
            <CartesianGrid stroke="#ccc" />
            <XAxis dataKey="time" label={{ value: 'Time (h)', position: 'insideBottomRight', offset: 0 }} />
            <YAxis label={{ value: 'Number', angle: -90, position: 'insideLeft', offset: 0 }} />
            <Tooltip content={CustomTooltip}/>
            <Legend />
            <Line type="monotone" dataKey="num_people" stroke="#8884d8" dot={false} />
            <Line type="monotone" dataKey="num_infected" stroke="#82ca9d" dot={false}  />
          </LineChart>
        </div>
      </Popup>
    </Marker>
  );

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
        {publicFacilities.map((addr, index) => marker_icon('places', addr, index))}
        {households.map((addr, index) => marker_icon('homes', addr, index))}
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

export default function ModelMap({ sim_data, move_patterns, pap_data, location }) {
  const [publicFacilities, setPublicFacilities] = useState([]);
  const [households, setHouseholds] = useState([]);
  const [maxHours, setMaxHours] = useState(1);
  const [locPatterns, setLocPatterns] = useState({});

  const [timestamp, setTimestamp] = useState(1); // State for zoom level and map slider

  React.useEffect(() => {
    household_locs = {};

    setMaxHours(Math.max(...Object.keys(move_patterns)) / 60);
    updateIcons(1, 'places', location, move_patterns, sim_data, pap_data, setPublicFacilities);
    updateIcons(1, 'homes', location, move_patterns, sim_data, pap_data, setHouseholds);

    let loc_patterns = { 'homes': {}, 'places': {} };

    ['homes', 'places'].forEach((label) => {
      for (const time of Object.keys(move_patterns)) {
        for (const obj_id of Object.keys(pap_data[label])) {
          if (!loc_patterns[label][obj_id]) {
            loc_patterns[label][obj_id] = [];
          }
          if (!move_patterns[time][label][obj_id]) {
            loc_patterns[label][obj_id].push({ 'num_people': 0 });
            loc_patterns[label][obj_id].push({ 'num_infected': 0 });
          } else {
            let num_infected = 0;
            for (const variant of Object.keys(sim_data[time])) {
              for (const id of Object.keys(sim_data[time][variant])) {
                if (move_patterns[time][label][obj_id].indexOf(id) !== -1) {
                  num_infected += 1;
                }
              }
            }
            loc_patterns[label][obj_id].push({
              'time': parseInt(time) / 60,
              'num_people': move_patterns[time][label][obj_id].length,
              'num_infected': num_infected
            });
          }
        }
      }
    });

    setLocPatterns(loc_patterns);
    console.log(loc_patterns);
  }, []);

  return (
    <div>
      {/* Map Container */}
      <ClusteredMap location={location} timestamp={timestamp} publicFacilities={publicFacilities} households={households} loc_patterns={locPatterns} />

      {/* Slider Component */}
      <div style={{ width: '100%', marginTop: '20px' }}>
        <input
          type="range"
          min={1}
          max={maxHours}
          value={timestamp}
          onChange={(e) => {
            setTimestamp(parseInt(e.target.value));
            updateIcons(parseInt(e.target.value), 'places', location, move_patterns, sim_data, pap_data, setPublicFacilities);
            updateIcons(parseInt(e.target.value), 'homes', location, move_patterns, sim_data, pap_data, setHouseholds);
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
            setTimestamp(parseInt(e.target.value));
            updateIcons(parseInt(e.target.value), 'places', location, move_patterns, sim_data, pap_data, setPublicFacilities);
            updateIcons(parseInt(e.target.value), 'homes', location, move_patterns, sim_data, pap_data, setHouseholds);
          }}
          style={{ width: '10%' }}
        />
      </div>
    </div>
  );
}