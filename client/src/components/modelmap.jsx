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

      let description = `Pop:Inf ${pop.population}:${pop.infected}`;
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
        label: poi.label,
        description: poi.description,
        icon: poi.icon,
        type: poi.type,
        id: poi.id,
        population: poi.population,
        infected: poi.infected,
        infection_ratio: poi.population > 0 ? poi.infected / poi.population : 0,
      },
      geometry: {
        type: "Point",
        coordinates: [poi.longitude, poi.latitude],
      },
    })),
  };
}

function ClusteredMap({ mapCenter, pois, hotspots }) {
  const mapRef = useRef();
  const [mapInstance, setMapInstance] = useState(null);
  const [popupInfo, setPopupInfo] = useState(null);
  const [fadeInPhase, setFadeInPhase] = useState(false);

  const handleMapLoad = (event) => setMapInstance(event.target);

  // Update geojson when POIs change
  useEffect(() => {
    if (!mapInstance) return;
    const frame = requestAnimationFrame(() => {
      const source = mapInstance.getSource("points");
      if (source && source.setData) source.setData(makeGeoJSON(pois));
    });
    return () => cancelAnimationFrame(frame);
  }, [pois, mapInstance]);

  const geojson = makeGeoJSON(pois);

  /** 🎇 Main cluster burst animation + smart sub-explode */
  function animateClusterExpansion(map, clusterFeature) {
    const clusterId = clusterFeature.properties.cluster_id;
    const source = map.getSource("points");
    if (!source || !source.getClusterLeaves) return;

    const canvas = document.querySelector(".emoji-overlay-canvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    source.getClusterLeaves(clusterId, 100, 0, (err, leaves) => {
      if (err || !leaves?.length) return;

      const clusterCenter = clusterFeature.geometry.coordinates;
      const endPositions = leaves
        .map(f => f.geometry.coordinates)
        .filter(c => Array.isArray(c) && c.length === 2 && !isNaN(c[0]) && !isNaN(c[1]));

      const duration = 1000;
      const start = performance.now();
      let zoomStarted = false;
      let zoomTarget = null;

      // Ask for expansion zoom
      source.getClusterExpansionZoom(clusterId, (err, expansionZoom) => {
        if (!err) zoomTarget = expansionZoom + 0.5;
      });

      const safeArc = (x, y, r, color, alpha = 1) => {
        const radius = Math.max(0.1, isFinite(r) ? r : 0.1);
        if (radius > 0) {
          ctx.beginPath();
          ctx.arc(x, y, radius, 0, Math.PI * 2);
          ctx.fillStyle = color.includes("hsla") ? color : `rgba(255,255,255,${alpha})`;
          ctx.fill();
        }
      };

      function frame(now) {
        const t = Math.min((now - start) / duration, 1);
        const ease = t * (2 - t);
        const { width, height } = canvas;
        ctx.clearRect(0, 0, width, height);
        const clusterPoint = map.project(clusterCenter);
        if (!clusterPoint) return;

        // --- Shockwave ring ---
        const ringRadius = Math.max(0, 40 * ease);
        ctx.beginPath();
        ctx.arc(clusterPoint.x, clusterPoint.y, ringRadius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255,200,0,${0.4 * (1 - t)})`;
        ctx.lineWidth = Math.max(0, 3 * (1 - t));
        ctx.stroke();

        // --- Particles ---
        endPositions.forEach((end, i) => {
          const projected = map.project(end);
          if (!projected) return;
          const x = clusterPoint.x + (projected.x - clusterPoint.x) * ease;
          const y = clusterPoint.y + (projected.y - clusterPoint.y) * ease;
          const hue = 25 + (i * 25) % 80;
          safeArc(x, y, 5 + 4 * (1 - t), `hsla(${hue},100%,55%,${1 - t})`);
        });

        // --- Trigger zoom mid-animation ---
        if (!zoomStarted && t > 0.35 && zoomTarget) {
          zoomStarted = true;
          map.easeTo({
            center: clusterCenter,
            zoom: zoomTarget,
            duration: 1200,
            essential: true,
          });

          // After zoom completes, check visible clusters
          map.once("moveend", () => {
            const visible = map.queryRenderedFeatures(undefined, { source: "points" });
            const clusters = visible.filter(f => f.properties?.cluster);
            const ratio = visible.length > 0 ? clusters.length / visible.length : 0;

            // --- Secondary explosion if still mostly clusters ---
            if (ratio > 0.6 && clusters.length > 1) {
              const subStart = performance.now();
              const { width: w, height: h } = canvas;

              function explodeFrame(now2) {
                const t2 = Math.min((now2 - subStart) / 800, 1);
                const ease2 = 1 - Math.pow(1 - t2, 2);
                ctx.clearRect(0, 0, w, h);

                clusters.forEach((f, i) => {
                  const p = map.project(f.geometry.coordinates);
                  if (!p) return;
                  const angle = (i / clusters.length) * 2 * Math.PI;
                  const offset = 20 * ease2;
                  const x = p.x + Math.cos(angle) * offset;
                  const y = p.y + Math.sin(angle) * offset;
                  safeArc(x, y, 8 * (1 - 0.5 * t2), "rgba(255,150,0,0.6)");
                });

                if (t2 < 1) requestAnimationFrame(explodeFrame);
                else ctx.clearRect(0, 0, w, h);
              }

              requestAnimationFrame(explodeFrame);
            } else {
              ctx.clearRect(0, 0, canvas.width, canvas.height);
            }

            // Always fade in new icons after zoom completes
            setFadeInPhase(true);
            setTimeout(() => setFadeInPhase(false), 600);
          });
        }

        if (t < 1) requestAnimationFrame(frame);
        else ctx.clearRect(0, 0, width, height);
      }

      requestAnimationFrame(frame);
    });
  }

  /** 🖱 Handle clicks */
  const handleClick = (event) => {
    const feature = event.features?.[0];
    if (!feature || !feature.properties) return;
    const map = event.target;

    if (feature.properties.cluster) {
      animateClusterExpansion(map, feature);
      return;
    }

    // Non-clustered click → zoom + popup
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
    }, 200);
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
        {/* 🔹 Clustered points source */}
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
            paint={{ "text-color": "#fff" }}
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
              "circle-opacity": fadeInPhase
                ? ["interpolate", ["linear"], ["zoom"], 0, 0, 1, 1]
                : 1,
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
              "text-opacity": fadeInPhase ? 0 : 1,
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
            <div className="max-w-36 whitespace-pre-line font-[Poppins]">
              <div style={{ fontSize: "22px" }}>{popupInfo.icon}</div>
              <header className="text-sm font-bold">{popupInfo.label}</header>
              <p className="text-xs">{popupInfo.description}</p>
            </div>
          </Popup>
        )}
      </Map>

      {/* 🧩 Emoji overlay canvas */}
      {mapInstance && <EmojiOverlay map={mapInstance} hotspots={hotspots} />}
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
        selectedId={selectedId}
        isHousehold={isHousehold}
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