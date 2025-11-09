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

function updateIcons(mapCenter, sim_data, pap_data, hotspots) {
  const icons = [];

  const types = ['homes', 'places'];

  for (const type of types) {
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

      const marker = {
        'type': type,
        'id': index,
        'latitude': data.latitude,
        'longitude': data.longitude,
        'label': data.label,
        'description': `Pop:Inf ${pop.population}:${pop.infected}`,
        'icon': icon,
        'population': pop.population,
        'infected': pop.infected
      }

      icons.push(marker);
    }
  }

  return icons;
}

function ClusteredMap({ currentTime, mapCenter, pois, onMarkerClick, hotspots }) {
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
        >
          {pois.map((data, index) => (
            <Marker
              icon={data.icon}
              key={`${index}-${currentTime}`}
              position={[data.latitude, data.longitude]}
              title={data.label}
              proportion={data.infected / data.population}
              pulsing={data.type === 'places' && Object.keys(hotspots).includes(data.id)}
              eventHandlers={{
                click: () => {
                  onMarkerClick(data.id, data.type === 'homes');
                },
              }}
            >
              <Popup>
                <div className='w-36 whitespace-pre-line font-[Poppins]'>
                  <header className='text-sm'>{data.label}</header>
                  <p className='text-xs'>{data.description}</p>
                  {data.type === 'places' && Object.keys(hotspots).includes(data.id) && (
                    <p className='text-xs font-medium'>Hotspot at hour{hotspots[data.id].length === 1 ? '' : 's'}: {hotspots[data.id].join(', ')}</p>
                  )}
                </div>
              </Popup>
            </Marker>
          ))}
        </MarkerClusterGroup>
      </MapContainer>       
    </div>
  );
}

export default function ModelMap({ onMarkerClick, selectedId, isHousehold, selectedZone })
 {
  const sim_data = useSimData((state) => state.simdata);
  const pap_data = useSimData((state) => state.papdata);

  // const [pois, setPois] = useState([]);
  const [maxHours, setMaxHours] = useState(1);
  const [hotspots, setHotspots] = useState({});

  const [currentTime, setCurrentTime] = useState(1);
  const [isPlaying, setIsPlaying] = useState(false);

  const mapCenter = useMemo(() => [ selectedZone.latitude, selectedZone.longitude ], [selectedZone]);
  const pois = useMemo(() => {
    return updateIcons(mapCenter, sim_data[(currentTime * 60).toString()], pap_data, hotspots);
  }, [currentTime, hotspots, mapCenter, pap_data, sim_data]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (!isPlaying) {
        return;
      }

      setCurrentTime(prev => (prev < maxHours ? prev + 1 : prev));
    }, 1000);

    return () => clearInterval(interval);
  }, [isPlaying, maxHours]);

  useEffect(() => {
    const new_hotspots = {};

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
          new_hotspots[index] = [ ...(new_hotspots[index] ?? []), timestamps[i] / 60 ];
        }
      }
    }

    setMaxHours(Math.max(...Object.keys(sim_data)) / 60);
    setHotspots(new_hotspots);
  }, [sim_data, pap_data, mapCenter]);

  return (
    <div>
      <MapLegend icon_lookup={icon_lookup} />

      {/* Map Container */}
      <ClusteredMap
        currentTime={currentTime}
        mapCenter={mapCenter}
        pois={pois}
        onMarkerClick={onMarkerClick}
        selectedId={selectedId}
        isHousehold={isHousehold}
        hotspots={hotspots}
      />

      {/* Slider Component */}
      <div className="flex items-center justify-center gap-3 mt-5">
        <button
          className="bg-[#70B4D4] text-white px-4 py-2 rounded-full font-semibold hover:brightness-90 transition"
          onClick={() => setIsPlaying(!isPlaying)}
        >
          {isPlaying ? 'Pause' : 'Play'}
        </button>

        <input
          className='w-full max-w-[90vw]'
          type="range"
          min={1}
          max={maxHours}
          value={currentTime}
          onChange={(e) => setCurrentTime(parseInt(e.target.value))}
        />
        <div className='mt-3 text-center'>
          {new Date(new Date(selectedZone.start_date).getTime() + currentTime * 60 * 60 * 1000).toLocaleString('en-US', {
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
          value={currentTime}
          onChange={(e) => setCurrentTime(parseInt(e.target.value))}
        />
      </div>
    </div>
  );
}