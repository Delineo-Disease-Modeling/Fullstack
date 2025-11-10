import { useRef, useState, useEffect, useMemo } from 'react'; 
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

var household_locs = {};

function updateIcons(mapCenter, sim_data, pap_data, hotspots) {
  const icons = [];

  if (!sim_data) {
    return icons;
  }

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
        const isHotspot = props.type === 'place' && Object.keys(hotspots).includes(props.id);

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

function ClusteredMap({ currentTime, mapCenter, pois, hotspots, onMarkerClick }) {
  const mapRef = useRef();
  const [mapInstance, setMapInstance] = useState(null);
  const [popupInfo, setPopupInfo] = useState(null);
  const [fadeCircle, setFadeCircle] = useState(1);
  const [fadeLabel, setFadeLabel] = useState(1);

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
      const source = mapInstance.getSource("points");
      if (source && source.setData) source.setData(makeGeoJSON(pois));
    });
    return () => cancelAnimationFrame(frame);
  }, [pois, mapInstance]);

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

      {mapInstance && <EmojiOverlay map={mapInstance} hotspots={hotspots} />}
    </div>
  );
}

export default function ModelMap({ onMarkerClick, selectedZone })
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
    }, 750);

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
        hotspots={hotspots}
        onMarkerClick={onMarkerClick}
      />

      <div className='mt-3 text-center w-full'>
        {new Date(new Date(selectedZone.start_date).getTime() + currentTime * 60 * 60 * 1000).toLocaleString('en-US', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
          weekday: 'short',
          hour: 'numeric',
          minute: '2-digit'
        })}
      </div>

      {/* Slider Component */}
      <div className="flex items-center justify-center gap-3 mt-3">
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