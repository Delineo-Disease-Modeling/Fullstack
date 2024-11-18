import { useState, useEffect } from 'react'; 
import { MapContainer, Marker, TileLayer, Popup } from 'react-leaflet';
import MarkerClusterGroup from "react-leaflet-cluster";
import L from 'leaflet';

import 'leaflet/dist/leaflet.css';
import './modelmap.css';
import MapLegend from './maplegend';

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

const marker_icon = (category, percent, pulse) => { 
  const rgb_to_hex = (r, g, b) => {
    return "#" + ((1 << 24) | (r << 16) | (g << 8) | (b)).toString(16).slice(1);
  };

  const percent_to_hex = (per) => {
    const RED_COLOR = [222.0, 49.0, 99.0];
    const GREEN_COLOR = [80.0, 200.0, 120.0];

    if (per <= 0.0 || isNaN(per)) {
      return rgb_to_hex(...GREEN_COLOR);
    } else if (per >= 1.0) {
      return rgb_to_hex(...RED_COLOR);
    }

    const diff = [0, 1, 2].map(i => RED_COLOR[i] - GREEN_COLOR[i]);
    const final = [0, 1, 2].map(i => GREEN_COLOR[i] + (per * diff[i]));

    return rgb_to_hex(...final.map(x => Math.round(x)));
  };

  const pulseClass = pulse ? 'pulse-icon' : ''; //percent >= 0.8 ? 'pulse-intense' : percent >= 0.2 ? 'pulse-icon' : '';

  return new L.divIcon({
    className: '',
    html: `
    <div class="${pulseClass}" style="display:flex;justify-content:center;align-items:center;text-align:center;background-color:${percent_to_hex(percent)};width:30px;height:30px;border-radius:50%;">
      <div style="font-size:22px;text-align:center;">${icon_lookup[category]}</div>
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
  // Check if any marker in the cluster has a `proportion > 0.0` (used as pulsing markers in your setup)
  //const hasPulsingMarkers = cluster.getAllChildMarkers().some(marker => marker.options.proportion > 0.0);
  const hasInfecteMarkers = cluster.getAllChildMarkers().some(marker => marker.options.proportion > 0.0);
  const hasPulsingMarkers = cluster.getAllChildMarkers().some(marker => marker.options.pulsing === true)

  const clusterClass = ['marker-cluster'];

  if (hasInfecteMarkers) {
    clusterClass.push('marker-cluster-medium');
  } else {
    clusterClass.push('marker-cluster-small');
  }

  if (hasPulsingMarkers) {
    clusterClass.push('pulsing-cluster');
  }

  return L.divIcon({
    html: `<span class="marker-cluster">${cluster.getChildCount()}</span>`,
    className: clusterClass.join(' '),
    iconSize: L.point(40, 40, true)
  });
};

var household_locs = {};

function updateIcons(curtime, type, location, patterns, sim_data, pap_data, callback, hotspots) {
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

    var icon = type === 'homes' ? marker_icon("Home", 0.0) : marker_icon(pap_data[type][index]['top_category'], 0.0, hotspots.includes(index));
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

      label_text = `Population: ${peopleAtFacility.length}\nInfected: ${numInfected}`;

      const map_range = (value, low1, high1, low2, high2) => {
        return low2 + (high2 - low2) * (value - low1) / (high1 - low1);
      }

      const ratio = map_range(Math.min(numInfected / peopleAtFacility.length, 0.3) * 5.0, 0.0, 0.3, 0.0, 1.0);
      icon = type === 'homes' ? marker_icon("Home", ratio) : marker_icon(pap_data[type][index]['top_category'], ratio, hotspots.includes(index));

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

// eslint-disable-next-line no-unused-vars
function ClusteredMap({ timestamp, location, publicFacilities, households, onMarkerClick, selectedId, isHousehold, hotspots }) {
  const marker_icon_component = (type, addr, index) => {
    //const isSelected = selectedId === addr[5] && ((type === 'homes') === isHousehold);
    const selectedIcon = addr[0]; //isSelected ? marker_icon('selected_category', 0.0) : addr[0];

    return (
      <Marker
        icon={selectedIcon}
        key={index}
        position={addr[3]}
        title={addr[1]}
        proportion={addr[4]}
        pulsing={type === 'places' && hotspots.includes(addr[5])}
        eventHandlers={{
          click: () => {
            onMarkerClick(addr[5], type === 'homes'); // Notify parent on click
          },
        }}
      >
        <Popup key={type + '_' + addr[5]}>
          <div style={{width:'120px', whiteSpace: 'pre-line'}}>
            <h style={{fontSize: '14px'}}>{addr[1]}</h>
            <p style={{fontSize: '12px'}}>{addr[2]}</p>
          </div>
        </Popup>
      </Marker>
    );
  };

  return (
    <div className='outline outline-2 outline-[#70B4D4]'>
      <MapContainer className="mapcontainer" center={map_centers[location]} zoom={13} scrollWheelZoom={true} zoomControl={false}>
        <TileLayer
          attribution='&copy; <a href="http://osm.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <MarkerClusterGroup
          chunkedLoading
          iconCreateFunction={createClusterCustomIcon}
          maxClusterRadius={150}
          key={timestamp}
        >
          {publicFacilities.map((addr, index) => marker_icon_component('places', addr, index))}
          {households.map((addr, index) => marker_icon_component('homes', addr, index))}
        </MarkerClusterGroup>
      </MapContainer>       
    </div>
  );
}

export default function ModelMap({ sim_data, move_patterns, pap_data, location, onMarkerClick, selectedId, isHousehold }) {
  const [publicFacilities, setPublicFacilities] = useState([]);
  const [households, setHouseholds] = useState([]);
  const [maxHours, setMaxHours] = useState(1);
  const [hotspots, setHotspots] = useState([]);

  const [timestamp, setTimestamp] = useState(1); // State for zoom level and map slider

  useEffect(() => {
    household_locs = {};

    // Calculate "hotspot" locations (facilities only)
    for (const index of Object.keys(pap_data['places'])) {
      const timestamps = Object.keys(move_patterns).sort();

      for (let i = 1; i < timestamps.length; i++) {
        const prevpeople = move_patterns[timestamps[i - 1]]?.['places']?.[index];
        const curpeople = move_patterns[timestamps[i]]?.['places']?.[index];

        if (curpeople >= prevpeople * 1.3) {
          setHotspots((hs) => [index, ...hs]);
        }
      }
    }

    setMaxHours(Math.max(...Object.keys(move_patterns)) / 60);

    setHotspots((hs) => {
      // Save unique facilities only    
      const set = [...(new Set(hs))];
      updateIcons(1, 'places', location, move_patterns, sim_data, pap_data, setPublicFacilities, set);
      updateIcons(1, 'homes', location, move_patterns, sim_data, pap_data, setHouseholds, set);  
      return set;
    });
  }, [sim_data, move_patterns, pap_data, location]);

  return (
    <div>
      <MapLegend icon_lookup={icon_lookup} />

      {/* Map Container */}
      <ClusteredMap
        timestamp={timestamp}
        location={location}
        publicFacilities={publicFacilities}
        households={households}
        onMarkerClick={onMarkerClick}
        selectedId={selectedId}
        isHousehold={isHousehold}
        hotspots={hotspots}
      />

      {/* Slider Component */}
      <div className='w-full mt-5'>
        <input
          className='min-w-full'
          type="range"
          min={1}
          max={maxHours}
          value={timestamp}
          onChange={(e) => {
            const newTimestamp = parseInt(e.target.value);
            setTimestamp(newTimestamp);
            updateIcons(newTimestamp, 'places', location, move_patterns, sim_data, pap_data, setPublicFacilities, hotspots);
            updateIcons(newTimestamp, 'homes', location, move_patterns, sim_data, pap_data, setHouseholds, hotspots);
          }}
        />
        <div className='text-center mt-3'>
          {timestamp} Hours
        </div>
      </div>

      {/* Input Box */}
      <div className='flex justify-center mt-3'>
        <input
          className='w-[10%] px-1 bg-[#fffff2] outline outline-2 outline-[#70B4D4]'
          type="number"
          min={1}
          max={maxHours}
          value={timestamp}
          onChange={(e) => {
            const newTimestamp = parseInt(e.target.value);
            setTimestamp(newTimestamp);
            updateIcons(newTimestamp, 'places', location, move_patterns, sim_data, pap_data, setPublicFacilities, hotspots);
            updateIcons(newTimestamp, 'homes', location, move_patterns, sim_data, pap_data, setHouseholds, hotspots);
          }}
        />
      </div>
    </div>
  );
}