import { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import { Map, Popup, Source, Layer } from "react-map-gl/maplibre";
import useSimData from '../stores/simdata';

import 'maplibre-gl/dist/maplibre-gl.css';
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

const MAX_PERSON_DOTS = 8000;
const MAX_DOTS_PER_LOCATION = 300;
const DOT_JITTER_DEGREES = 0.0035;

var household_locs = {};
var place_locs = {};

function updateIcons(mapCenter, sim_data, pap_data, hotspots) {
  const icons = [];

  if (!sim_data) {
    return icons;
  }

  // Compute the bounding box of all places with valid coordinates.
  // Homes have no real coords, so we scatter them within this box so they
  // visually overlap with the places (which can be far from the CZ center
  // when CBG residents commute to a nearby city).
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  let validPlaceCount = 0;

  for (const pdata of Object.values(pap_data.places)) {
    const lat = pdata.latitude;
    const lng = pdata.longitude;
    if (lat && lng && !(lat === 0 && lng === 0)) {
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
      minLng = Math.min(minLng, lng);
      maxLng = Math.max(maxLng, lng);
      validPlaceCount++;
    }
  }

  // Fall back to mapCenter ± 0.03° when there are no places with valid coords
  const hasPlaceBounds = validPlaceCount > 0 && minLat !== Infinity;
  const homeCenterLat = hasPlaceBounds ? (minLat + maxLat) / 2 : mapCenter[0];
  const homeCenterLng = hasPlaceBounds ? (minLng + maxLng) / 2 : mapCenter[1];
  // Spread homes across the place bbox (at least ±0.01° so they aren't all stacked)
  const homeSpreadLat = hasPlaceBounds ? Math.max(maxLat - minLat, 0.02) : 0.06;
  const homeSpreadLng = hasPlaceBounds ? Math.max(maxLng - minLng, 0.02) : 0.06;

  const types = ['homes', 'places'];

  for (const type of types) {
    for (const [index, data] of Object.entries(pap_data[type])) {
      if (type === 'homes') {
        data.label = `Home #${index}`;

        if (!(index in household_locs)) {
          household_locs[index] = [
            homeCenterLat + (Math.random() - 0.5) * homeSpreadLat,
            homeCenterLng + (Math.random() - 0.5) * homeSpreadLng
          ];
        }

        data['latitude'] = household_locs[index][0];
        data['longitude'] = household_locs[index][1];
      } else if (type === 'places') {
        // If place has no valid coordinates (0,0), generate random ones like homes

        if (!data.latitude || !data.longitude || (data.latitude === 0 && data.longitude === 0)) {
     
          if (!(index in place_locs)) {
            place_locs[index] = [
              homeCenterLat + (Math.random() - 0.5) * homeSpreadLat,
              homeCenterLng + (Math.random() - 0.5) * homeSpreadLng
            ];
          }
          data['latitude'] = place_locs[index][0];
          data['longitude'] = place_locs[index][1];
        }
      }

      const pop = (type === 'homes' ? sim_data['homes'][index] : sim_data['places'][index]) ?? { population: 0, infected: 0 };

      let description = `${pop.population} people\n${pop.infected} infected`;
      if (type === 'places' && Object.keys(hotspots).includes(data.id)) {
        description += `\n\nHotspot at hour${hotspots[data.id].length === 1 ? '' : 's'}: ${hotspots[data.id].join(', ')}`;
      }

      const marker = {
        'type': type,
        'id': index,
        'latitude': data.latitude,
        'longitude': data.longitude,
        'label': data.label,
        'description': description,
        'icon': (type === 'homes' ? icon_lookup['Home'] : icon_lookup[pap_data[type][index]['top_category']]) ?? '❓',
        'population': pop.population,
        'infected': pop.infected
      }

      icons.push(marker);
    }
  }

  return icons;
}

function EmojiOverlay({ map, hotspots = {} }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!map) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    function drawEmojis() {
      const { width, height } = map.getContainer().getBoundingClientRect();
      canvas.width = width;
      canvas.height = height;
      ctx.clearRect(0, 0, width, height);

      const features = map.queryRenderedFeatures(undefined, { source: "points" });
      if (!features?.length) return;

      const zoom = map.getZoom();

      const time = Date.now() / 1000; // seconds for smooth pulse

      features.forEach((f) => {
        const props = f.properties;
        if (!props || props.cluster || !props.icon) return;

        const [lng, lat] = f.geometry.coordinates;
        const pixel = map.project([lng, lat]);

        // --- Infection ratio + sqrt curve like clusters ---
        const infectionRatio = parseFloat(props.infection_ratio || 0);
        const adjusted = Math.sqrt(infectionRatio);

        // --- Color curve (same as clusters) ---
        let baseColor = "#4CAF50"; // green
        if (adjusted >= 0.5) baseColor = "#F44336";   // red
        else if (adjusted >= 0.35) baseColor = "#FF9800"; // orange
        else if (adjusted >= 0.2) baseColor = "#FFEB3B";  // yellow

        // --- Zoom-scaled size ---
        const baseSize = 6;
        const scaleFactor = 1.2;
        const size = baseSize + zoom * scaleFactor;

        // --- Check if this ID is in hotspots ---
        const isHotspot = props.type === 'places' && Object.keys(hotspots).includes(props.id);

        // --- Pulse factor (sinusoidal between 0–1) ---
        const pulse = isHotspot
          ? 0.5 + 0.5 * Math.sin(time * 4 + parseInt(props.id, 36) % 10) // offset by id for desync
          : 0;

        const pulseSize = size * (1 + 0.3 * pulse); // up to 30% larger halo
        const pulseAlpha = isHotspot ? 0.4 + 0.4 * pulse : 1.0;

        // --- Draw pulsing or static halo ---
        ctx.beginPath();
        ctx.arc(pixel.x, pixel.y, pulseSize * 0.6, 0, Math.PI * 2);
        ctx.fillStyle = applyAlpha(baseColor, pulseAlpha);
        ctx.fill();

        // --- White outline for clarity ---
        ctx.strokeStyle = "rgba(255,255,255,0.9)";
        ctx.lineWidth = 2;
        ctx.stroke();

        // --- Draw emoji ---
        ctx.font = `${size}px 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(props.icon, pixel.x, pixel.y);
      });
    }

    // helper to apply alpha to hex color (returns rgba())
    function applyAlpha(hex, alpha) {
      const bigint = parseInt(hex.replace("#", ""), 16);
      const r = (bigint >> 16) & 255;
      const g = (bigint >> 8) & 255;
      const b = bigint & 255;
      return `rgba(${r},${g},${b},${alpha})`;
    }

    map.on("render", drawEmojis);
    drawEmojis(); // first draw immediately

    return () => map.off("render", drawEmojis);
  }, [map, hotspots]);

  return (
    <canvas
      ref={canvasRef}
      className="emoji-overlay-canvas"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        zIndex: 5,
        pointerEvents: "none",
      }}
    />
  );
}

function makeGeoJSON(pois) {
  return {
    type: "FeatureCollection",
    features: pois.map((poi) => ({
      type: "Feature",
      properties: {
        ...poi,
        infection_ratio: poi.population > 0 ? poi.infected / poi.population : 0,
      },
      geometry: {
        type: "Point",
        coordinates: [poi.longitude, poi.latitude],
      },
    })),
  };
}

function hashString(input) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function hashUnit(seed, salt = 0) {
  let x = (seed + salt * 374761393) >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 2246822519);
  x ^= x >>> 13;
  x = Math.imul(x, 3266489917);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967295;
}

function makePeopleDotGeoJSON(pois, mode) {
  const countKey = mode === 'infection' ? 'infected' : 'population';
  const totalPeople = pois.reduce((sum, poi) => {
    const value = Number(poi?.[countKey] ?? 0);
    return sum + (Number.isFinite(value) ? Math.max(0, value) : 0);
  }, 0);
  const peoplePerDot = Math.max(1, Math.ceil(totalPeople / MAX_PERSON_DOTS));

  const features = [];
  let reachedCap = false;

  for (const poi of pois) {
    const count = Math.max(0, Number(poi?.[countKey] ?? 0));
    if (!count || !Number.isFinite(poi?.latitude) || !Number.isFinite(poi?.longitude)) {
      continue;
    }

    const dotCount = Math.min(MAX_DOTS_PER_LOCATION, Math.ceil(count / peoplePerDot));
    const baseSeed = hashString(`${poi.type}:${poi.id}`);

    for (let i = 0; i < dotCount; i++) {
      if (features.length >= MAX_PERSON_DOTS) {
        reachedCap = true;
        break;
      }

      const angle = hashUnit(baseSeed, i) * Math.PI * 2;
      const radius = Math.sqrt(hashUnit(baseSeed, i + 100_000)) * DOT_JITTER_DEGREES;
      const lat = poi.latitude + Math.sin(angle) * radius;
      const lng = poi.longitude + Math.cos(angle) * radius;

      features.push({
        type: "Feature",
        properties: {
          id: `${poi.type}-${poi.id}-${i}`,
          loc_id: poi.id,
          loc_type: poi.type,
          label: poi.label,
        },
        geometry: {
          type: "Point",
          coordinates: [lng, lat],
        },
      });
    }

    if (reachedCap) {
      break;
    }
  }

  return {
    geojson: {
      type: "FeatureCollection",
      features,
    },
    peoplePerDot,
    dotCount: features.length,
    totalPeople,
  };
}

function ClusteredMap({ currentTime, mapCenter, pois, hotspots, onMarkerClick, mapMode, peopleDotGeoJSON, peopleDotColor }) {
  const mapRef = useRef();
  const [mapInstance, setMapInstance] = useState(null);
  const [popupInfo, setPopupInfo] = useState(null);
  const [fadeCircle, setFadeCircle] = useState(1);
  const [fadeLabel, setFadeLabel] = useState(1);
  const hasFitBounds = useRef(false);

  // Fit map bounds to include all POIs when data first loads
  useEffect(() => {
    if (!mapInstance || !pois.length || hasFitBounds.current) return;

    let minLat = Infinity, maxLat = -Infinity;
    let minLng = Infinity, maxLng = -Infinity;

    for (const poi of pois) {
      if (poi.latitude && poi.longitude) {
        minLat = Math.min(minLat, poi.latitude);
        maxLat = Math.max(maxLat, poi.latitude);
        minLng = Math.min(minLng, poi.longitude);
        maxLng = Math.max(maxLng, poi.longitude);
      }
    }

    if (minLat === Infinity) return; // no valid coords

    // Only refit if places actually extend beyond initial viewport
    const latSpread = maxLat - minLat;
    const lngSpread = maxLng - minLng;
    if (latSpread > 0.06 || lngSpread > 0.06) {
      mapInstance.fitBounds(
        [[minLng, minLat], [maxLng, maxLat]],
        { padding: 40, duration: 800, maxZoom: 14 }
      );
    }
    hasFitBounds.current = true;
  }, [mapInstance, pois]);

  // Toggle layer visibility based on map mode
  useEffect(() => {
    if (!mapInstance) return;
    const markerLayers = ['clusters', 'cluster-count', 'unclustered-point-circle', 'unclustered-point-emoji'];
    const isMarkers = mapMode === 'markers';
    for (const id of markerLayers) {
      if (mapInstance.getLayer(id)) {
        mapInstance.setLayoutProperty(id, 'visibility', isMarkers ? 'visible' : 'none');
      }
    }
    if (mapInstance.getLayer('people-dots')) {
      mapInstance.setLayoutProperty('people-dots', 'visibility', isMarkers ? 'none' : 'visible');
    }
  }, [mapMode, mapInstance]);

  const handleMapLoad = (event) => {
    const map = event.target;
    setMapInstance(map);

    // when zoom/pan ends → fade back to 1 (no fade-out)
    map.on("moveend", () => {
      const start = performance.now();
      const initialCircle = fadeCircle;
      const initialLabel = fadeLabel;
      const duration = 350; // total fade length

      const animate = (now) => {
        const t = Math.min((now - start) / duration, 1);
        // cubic ease-out
        const eased = 1 - Math.pow(1 - t, 3);

        // label fades a bit faster, circle lags ~0.15s
        const labelEase = Math.min(eased * 1.1, 1);
        const circleEase = Math.min(eased * 0.85 + 0.15, 1);

        setFadeLabel(initialLabel + (1 - initialLabel) * labelEase);
        setFadeCircle(initialCircle + (1 - initialCircle) * circleEase);

        if (t < 1) requestAnimationFrame(animate);
      };
      requestAnimationFrame(animate);
    });
  };

  // update GeoJSON when POIs change
  useEffect(() => {
    if (!mapInstance) return;
    const frame = requestAnimationFrame(() => {
      const data = makeGeoJSON(pois);
      const source = mapInstance.getSource("points");
      if (source && source.setData) source.setData(data);
      const peopleDotSource = mapInstance.getSource("people-dots");
      if (peopleDotSource && peopleDotSource.setData) peopleDotSource.setData(peopleDotGeoJSON);
    });
    return () => cancelAnimationFrame(frame);
  }, [pois, mapInstance, peopleDotGeoJSON]);

  useEffect(() => {
    setPopupInfo(null);
  }, [currentTime]);

  // toggle label visibility when too faint
  useEffect(() => {
    if (!mapInstance) return;
    const visibility = fadeLabel < 0.20 ? "none" : "visible";
    if (mapInstance.getLayer("cluster-count")) {
      mapInstance.setLayoutProperty("cluster-count", "visibility", visibility);
    }
  }, [fadeLabel, mapInstance]);

  const geojson = makeGeoJSON(pois);

  const handleClick = (event) => {
    const feature = event.features?.[0];
    if (!feature || !feature.properties) return;
    const map = event.target;

    if (feature.properties.cluster) {
      const clusterId = feature.properties.cluster_id;
      const source = map.getSource("points");
      source.getClusterExpansionZoom(clusterId, (err, zoom) => {
        if (err) return;
        map.easeTo({
          center: feature.geometry.coordinates,
          zoom: zoom + 0.5,
          duration: 1000,
        });
      });
      return;
    }

    onMarkerClick({
      id: feature.properties.id,
      label: feature.properties.label,
      type: feature.properties.type
    });

    const coords = feature.geometry.coordinates;
    const targetZoom = Math.max(map.getZoom(), 15);
    setPopupInfo(null);

    map.easeTo({ center: coords, zoom: targetZoom, duration: 600 });

    setTimeout(() => {
      setPopupInfo({
        coordinates: coords,
        label: feature.properties.label,
        description: feature.properties.description,
        icon: feature.properties.icon,
        id: feature.properties.id,
      });
    }, 250);
  };

  return (
    <div className="mapcontainer outline-solid outline-2 outline-[#70B4D4] relative">
      <Map
        ref={mapRef}
        onLoad={handleMapLoad}
        initialViewState={{
          latitude: mapCenter[0],
          longitude: mapCenter[1],
          zoom: 13,
        }}
        style={{ width: "100%", height: "100%" }}
        mapStyle="https://basemaps.cartocdn.com/gl/positron-gl-style/style.json"
        interactiveLayerIds={[
          "clusters",
          "unclustered-point-circle",
          "unclustered-point-emoji",
        ]}
        onClick={handleClick}
      >
        <Source
          id="points"
          type="geojson"
          data={geojson}
          cluster={true}
          clusterMaxZoom={18}
          clusterRadius={75}
          clusterMinPoints={3}
          clusterProperties={{
            population: ["+", ["to-number", ["get", "population"]]],
            infected: ["+", ["to-number", ["get", "infected"]]],
          }}
        >
          {/* 🟢 Cluster circles */}
          <Layer
            id="clusters"
            type="circle"
            filter={["has", "point_count"]}
            paint={{
              "circle-color": [
                "interpolate",
                ["linear"],
                ["sqrt", ["/", ["get", "infected"], ["get", "population"]]],
                0, "#4CAF50",
                0.15, "#FFEB3B",
                0.35, "#FF9800",
                0.5, "#F44336",
              ],
              "circle-radius": [
                "step",
                ["get", "point_count"],
                22, 10, 28, 25, 34,
              ],
              "circle-opacity": fadeCircle,
              "circle-stroke-width": 1,
              "circle-stroke-color": "#fff",
            }}
          />

          {/* 🔢 Cluster labels */}
          <Layer
            id="cluster-count"
            type="symbol"
            filter={["has", "point_count"]}
            layout={{
              "text-field": [
                "format",
                ["get", "population"], { "font-scale": 1.2 },
                "\n",
                ["concat", "Inf: ", ["get", "infected"]], { "font-scale": 0.8 },
              ],
              "text-size": 12,
              "text-allow-overlap": true,
            }}
            paint={{
              "text-color": "#fff",
              "text-opacity": fadeLabel,
            }}
          />

          {/* 🧍 Unclustered point circles */}
          <Layer
            id="unclustered-point-circle"
            type="circle"
            filter={["!", ["has", "point_count"]]}
            paint={{
              "circle-radius": 14,
              "circle-color": [
                "interpolate",
                ["linear"],
                ["sqrt", ["/", ["get", "infected"], ["get", "population"]]],
                0, "#4CAF50",
                0.15, "#FFEB3B",
                0.35, "#FF9800",
                0.5, "#F44336",
              ],
              "circle-opacity": fadeCircle,
              "circle-stroke-color": "#fff",
              "circle-stroke-width": 1,
            }}
          />

          {/* 😀 Emoji icons */}
          <Layer
            id="unclustered-point-emoji"
            type="symbol"
            filter={["!", ["has", "point_count"]]}
            layout={{
              "text-field": ["get", "icon"],
              "text-size": 18,
              "text-allow-overlap": true,
              "text-font": ["Open Sans Regular"],
            }}
            paint={{
              "text-color": "#000000",
              "text-opacity": fadeCircle,
            }}
          />

        </Source>

        {/* Dot cloud representation for population/infections */}
        <Source
          id="people-dots"
          type="geojson"
          data={peopleDotGeoJSON}
        >
          <Layer
            id="people-dots"
            type="circle"
            layout={{ "visibility": mapMode === 'markers' ? 'none' : 'visible' }}
            paint={{
              "circle-radius": [
                "interpolate", ["linear"], ["zoom"],
                9, 1.2,
                13, 2.2,
                16, 3.4
              ],
              "circle-color": peopleDotColor,
              "circle-opacity": 0.45,
              "circle-stroke-width": 0.35,
              "circle-stroke-color": "#ffffff",
              "circle-stroke-opacity": 0.65
            }}
          />
        </Source>

        {/* 💬 Popup */}
        {popupInfo && (
          <Popup
            longitude={popupInfo.coordinates[0]}
            latitude={popupInfo.coordinates[1]}
            anchor="top"
            closeButton={false}
            onClose={() => setPopupInfo(null)}
            style={{ zIndex: 10 }}
          >
            <div className="max-w-36 whitespace-pre-line font-[Poppins] text-center">
              <div className='text-2xl mb-0.5'>{popupInfo.icon}</div>
              <header className="text-sm font-bold mb-0.5">{popupInfo.label}</header>
              <p className="text-xs">{popupInfo.description}</p>
            </div>
          </Popup>
        )}
      </Map>

      {mapInstance && mapMode === 'markers' && <EmojiOverlay map={mapInstance} hotspots={hotspots} />}
    </div>
  );
}

export default function ModelMap({ onMarkerClick, selectedZone }) {
  const sim_data = useSimData((state) => state.simdata);
  const pap_data = useSimData((state) => state.papdata);

  // const [pois, setPois] = useState([]);
  const [maxHours, setMaxHours] = useState(1);
  const [hotspots, setHotspots] = useState({});

  const [currentTime, setCurrentTime] = useState(1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [mapMode, setMapMode] = useState('markers'); // 'markers' | 'population' | 'infection'

  // Clear cached home/place positions when papdata changes (new CZ or new sim)
  useEffect(() => {
    household_locs = {};
    place_locs = {};
  }, [pap_data]);

  // Get sorted list of available timesteps for interpolation
  const availableTimesteps = useMemo(() => {
    if (!sim_data) return [];
    return Object.keys(sim_data).map(Number).filter(n => !isNaN(n)).sort((a, b) => a - b);
  }, [sim_data]);

  // Find latest available timestep at or before the requested time.
  const findTimestepAtOrBefore = useCallback((targetMinutes) => {
    if (availableTimesteps.length === 0) return null;
    let selected = availableTimesteps[0];
    for (const ts of availableTimesteps) {
      if (ts > targetMinutes) {
        break;
      }
      selected = ts;
    }
    return selected;
  }, [availableTimesteps]);

  const mapCenter = useMemo(() => [selectedZone.latitude, selectedZone.longitude], [selectedZone]);
  const pois = useMemo(() => {
    const targetMinutes = currentTime * 60;
    const timestep = findTimestepAtOrBefore(targetMinutes);
    const dataForTime = timestep !== null ? sim_data[timestep.toString()] : null;
    return updateIcons(mapCenter, dataForTime, pap_data, hotspots);
  }, [currentTime, hotspots, mapCenter, pap_data, sim_data, findTimestepAtOrBefore]);

  const peopleDotMode = mapMode === 'infection' ? 'infection' : 'population';
  const peopleDotData = useMemo(() => makePeopleDotGeoJSON(pois, peopleDotMode), [pois, peopleDotMode]);
  const peopleDotColor = mapMode === 'infection' ? '#dc2626' : '#2563eb';

  useEffect(() => {
    const interval = setInterval(() => {
      if (!isPlaying) {
        return;
      }

      if (maxHours <= 0) {
        return;
      }

      setCurrentTime((prev) => Math.min(maxHours, prev + 1));
    }, 750);

    return () => clearInterval(interval);
  }, [isPlaying, maxHours]);

  useEffect(() => {
    if (isPlaying && currentTime >= maxHours) {
      setIsPlaying(false);
    }
  }, [currentTime, isPlaying, maxHours]);

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
          new_hotspots[index] = [...(new_hotspots[index] ?? []), timestamps[i] / 60];
        }
      }
    }

    const simDataKeys = Object.keys(sim_data).map(Number).filter(n => !isNaN(n));
    const maxTime = simDataKeys.length > 0 ? Math.max(...simDataKeys) : 60;
    setMaxHours(Math.max(1, Math.ceil(maxTime / 60)));
    setHotspots(new_hotspots);
  }, [sim_data, pap_data, mapCenter]);

  useEffect(() => {
    setCurrentTime((prev) => Math.min(prev, maxHours));
  }, [maxHours]);

  return (
    <div>
      <MapLegend icon_lookup={icon_lookup} />

      {/* Map Container */}
      {/* Map mode toggle */}
      <div className="heatmap-toggle">
        <button
          className={`heatmap-toggle-btn ${mapMode === 'markers' ? 'active' : ''}`}
          onClick={() => setMapMode('markers')}
          title="Show location markers"
        >
          📍 Markers
        </button>
        <button
          className={`heatmap-toggle-btn ${mapMode === 'population' ? 'active' : ''}`}
          onClick={() => setMapMode('population')}
          title="Show population dots"
        >
          👥 Population Dots
        </button>
        <button
          className={`heatmap-toggle-btn ${mapMode === 'infection' ? 'active' : ''}`}
          onClick={() => setMapMode('infection')}
          title="Show infection dots"
        >
          🦠 Infection Dots
        </button>
      </div>
      {mapMode !== 'markers' && (
        <div className='text-center text-xs text-gray-600 mb-2'>
          1 dot represents {peopleDotData.peoplePerDot.toLocaleString()} {peopleDotData.peoplePerDot === 1 ? 'person' : 'people'}.
          {' '}Dots are anchored to locations; movement is shown by changing dot counts over time.
        </div>
      )}

      <ClusteredMap
        currentTime={currentTime}
        mapCenter={mapCenter}
        pois={pois}
        hotspots={hotspots}
        onMarkerClick={onMarkerClick}
        mapMode={mapMode}
        peopleDotGeoJSON={peopleDotData.geojson}
        peopleDotColor={peopleDotColor}
      />

      <div className='mt-3 text-center w-full'>
        {new Date(new Date(selectedZone.start_date).getTime() + currentTime * 60 * 60 * 1000).toLocaleString('en-US', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
          weekday: 'short',
          hour: 'numeric',
          minute: '2-digit',
          timeZone: 'UTC'
        })}
      </div>

      {/* Slider Component */}
      <div className="flex items-center justify-center gap-3 mt-3">
        <button
          className="bg-[#70B4D4] text-white px-4 py-2 rounded-full font-semibold hover:brightness-90 transition"
          onClick={() => setIsPlaying(!isPlaying)}
        >
          {isPlaying ? <i className='bi bi-pause-fill' /> : <i className='bi bi-play-fill' />}
        </button>

        <input
          className='w-full max-w-[90vw]'
          type="range"
          min={1}
          max={maxHours}
          step={1}
          value={currentTime}
          onChange={(e) => {
            const next = Math.round(Number(e.target.value) || 1);
            setCurrentTime(Math.min(maxHours, Math.max(1, next)));
          }}
        />
      </div>

      {/* Input Box */}
      <div className='flex justify-center mt-3'>
        <input
          className='w-[10%] px-1 bg-[#fffff2] outline-solid outline-2 outline-[#70B4D4]'
          type="number"
          min={1}
          max={maxHours}
          step={1}
          value={currentTime}
          onChange={(e) => {
            const next = Math.round(Number(e.target.value) || 1);
            setCurrentTime(Math.min(maxHours, Math.max(1, next)));
          }}
        />
      </div>
    </div>
  );
}
