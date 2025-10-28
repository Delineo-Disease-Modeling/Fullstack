import { useState, useEffect, useMemo } from 'react'; 
import { MapContainer, Marker, TileLayer, Popup } from 'react-leaflet';
import MarkerClusterGroup from "react-leaflet-cluster";
import L from 'leaflet';
import useSimData from '../stores/simdata';

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
      <div style="font-size:22px;text-align:center;">${icon_lookup[category] ?? '❓'}</div>
    </div>
    `
  })
}

// Function to create markers for public facilities
function createFacilityMarker(id, position, name, label, icon, proportion) {
  return [icon, name, label, position, proportion, id];
};

const createClusterCustomIcon = function (cluster) {
  // Check if any marker in the cluster has a `proportion > 0.0` (used as pulsing markers in your setup)
  //const hasPulsingMarkers = cluster.getAllChildMarkers().some(marker => marker.options.proportion > 0.0);
  const hasInfectedMarkers = cluster.getAllChildMarkers().some(marker => marker.options.proportion > 0.0);
  const hasPulsingMarkers = cluster.getAllChildMarkers().some(marker => marker.options.pulsing === true)

  const clusterClass = ['marker-cluster'];

  if (hasInfectedMarkers) {
    clusterClass.push('marker-cluster-medium');
  } else {
    clusterClass.push('marker-cluster-small');
  }

  if (hasPulsingMarkers) {
    clusterClass.push('pulsing-cluster');
  }

  return L.divIcon({
    html: `<div class="flex items-center justify-center w-full h-full text-sm font-medium">${cluster.getChildCount()}</div>`,
    className: clusterClass.join(' '),
    iconSize: L.point(40, 40, true)
  });
};

var household_locs = {};

function updateIcons(type, mapCenter, sim_data, pap_data, callback, hotspots) {
  var new_icons = [];

  for (const [index, data] of Object.entries(pap_data[type])) {
    if (type === 'homes') {
      data.label = `Home #${index}`;

      if (!(index in household_locs)) {
        household_locs[index] = [
          mapCenter[0] + (Math.random() * 0.06 - 0.03),
          mapCenter[1] + (Math.random() * 0.06 - 0.03)
        ];
      }

      data['latitude'] = household_locs[index][0];
      data['longitude'] = household_locs[index][1];
    }

    const map_range = (value, low1, high1, low2, high2) => {
      return low2 + (high2 - low2) * (value - low1) / (high1 - low1);
    }

    const pop = (type === 'homes' ? sim_data['homes'][index] : sim_data['places'][index]) ?? { population: 0, infected: 0 };
    const ratio = map_range(Math.min(pop.infected / pop.population, 0.3) * 5.0, 0.0, 0.3, 0.0, 1.0);
    const icon = type === 'homes' ? marker_icon("Home", ratio) : marker_icon(pap_data[type][index]['top_category'], ratio, Object.keys(hotspots).includes(index));

    const new_marker = createFacilityMarker(
      index,
      [data.latitude, data.longitude],
      data.label,
      `Pop:Inf ${pop.population}:${pop.infected}`,
      icon,
      pop.infected / pop.population
    );

    new_icons.push(new_marker);
  }

  callback(new_icons);
}

function ClusteredMap({ timestamp, mapCenter, publicFacilities, households, onMarkerClick, hotspots }) {
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
        pulsing={type === 'places' && Object.keys(hotspots).includes(addr[5])}
        eventHandlers={{
          click: () => {
            onMarkerClick(addr[5], type === 'homes'); // Notify parent on click
          },
        }}
      >
        <Popup key={type + '_' + addr[5]}>
          <div className='w-36 whitespace-pre-line font-[Poppins]'>
            <header className='text-sm'>{addr[1]}</header>
            <p className='text-xs'>{addr[2]}</p>
            {type === 'places' && Object.keys(hotspots).includes(addr[5]) && (
              <p className='text-xs font-medium'>Hotspot at hour{hotspots[addr[5]].length === 1 ? '' : 's'}: {hotspots[addr[5]].join(', ')}</p>
            )}
          </div>
        </Popup>
      </Marker>
    );
  };

  return (
    <div className='mapcontainer outline-solid outline-2 outline-[#70B4D4]'>
      <MapContainer className="size-full" center={mapCenter} zoom={13} scrollWheelZoom={true} zoomControl={false}>
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

export default function ModelMap({ onMarkerClick, selectedId, isHousehold, selectedZone }) {
  const sim_data = useSimData((state) => state.simdata);
  const pap_data = useSimData((state) => state.papdata);

  const [publicFacilities, setPublicFacilities] = useState([]);
  const [households, setHouseholds] = useState([]);
  const [maxHours, setMaxHours] = useState(1);
  const [hotspots, setHotspots] = useState({});

  const [timestamp, setTimestamp] = useState(1); // State for zoom level and map slider

  const mapCenter = useMemo(() => [ selectedZone.latitude, selectedZone.longitude ], [selectedZone]);

  useEffect(() => {
    setHotspots(() => { return {}; });

    household_locs = {};

    // Calculate "hotspot" locations (facilities only)
    for (const index of Object.keys(pap_data['places'])) {
      const timestamps = Object.keys(sim_data).sort();

      for (let i = 1; i < timestamps.length; i++) {
        const prevpeople = sim_data[timestamps[i - 1]]?.['places']?.[index];
        const curpeople = sim_data[timestamps[i]]?.['places']?.[index];

        if (!prevpeople || !curpeople) {
          continue;
        }

        let previnfected = prevpeople.infected ?? 0;
        let curinfected = curpeople.infected ?? 0;

        if (curinfected > 0 && previnfected > 0 && curinfected >= previnfected * 5) {
          setHotspots((hs) => {
            if (hs[index]) {
              hs[index] = [ ...hs[index], timestamps[i] / 60 ];
            } else {
              hs[index] = [ timestamps[i] / 60 ];
            }

            return hs;
          });
        }
      }
    }

    setMaxHours(Math.max(...Object.keys(sim_data)) / 60);

    setHotspots((hs) => {
      updateIcons('places', mapCenter, sim_data['60'], pap_data, setPublicFacilities, hs);
      updateIcons('homes', mapCenter, sim_data['60'], pap_data, setHouseholds, hs);  
      return hs;
    });
  }, [sim_data, pap_data, mapCenter]);

  return (
    <div>
      <MapLegend icon_lookup={icon_lookup} />

      {/* Map Container */}
      <ClusteredMap
        timestamp={timestamp}
        mapCenter={mapCenter}
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
          className='w-full max-w-[95vw]'
          type="range"
          min={1}
          max={maxHours}
          value={timestamp}
          onChange={(e) => {
            const newTimestamp = parseInt(e.target.value);
            setTimestamp(newTimestamp);
            updateIcons('places', mapCenter, sim_data[(newTimestamp * 60).toString()], pap_data, setPublicFacilities, hotspots);
            updateIcons('homes', mapCenter, sim_data[(newTimestamp * 60).toString()], pap_data, setHouseholds, hotspots);
          }}
        />
        <div className='mt-3 text-center'>
          {new Date(new Date(selectedZone.start_date).getTime() + timestamp * 60 * 60 * 1000).toLocaleString('en-US', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
            weekday: 'short',
            hour: 'numeric',
            minute: '2-digit'
          })}
        </div>
      </div>

      {/* Input Box */}
      <div className='flex justify-center mt-3'>
        <input
          className='w-[10%] px-1 bg-[#fffff2] outline-solid outline-2 outline-[#70B4D4]'
          type="number"
          min={1}
          max={maxHours}
          value={timestamp}
          onChange={(e) => {
            const newTimestamp = parseInt(e.target.value);
            setTimestamp(newTimestamp);
            updateIcons('places', mapCenter, sim_data[(newTimestamp * 60).toString()], pap_data, setPublicFacilities, hotspots);
            updateIcons('homes', mapCenter, sim_data[(newTimestamp * 60).toString()], pap_data, setHouseholds, hotspots);
          }}
        />
      </div>
    </div>
  );
}