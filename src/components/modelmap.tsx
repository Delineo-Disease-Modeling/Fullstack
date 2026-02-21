'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Layer, Map, Popup, Source } from 'react-map-gl/maplibre';
import useMapData from '@/stores/mapdata';

import 'maplibre-gl/dist/maplibre-gl.css';
import '@/styles/modelmap.css';
import MapLegend from './maplegend';

const icon_lookup: Record<string, string> = {
  'Depository Credit Intermediation': '🏦',
  'Restaurants and Other Eating Places': '🍽️',
  'Offices of Physicians': '🏥',
  'Religious Organizations': '⛪',
  'Personal Care Services': '🏢',
  'Child Day Care Services': '🏫',
  'Death Care Services': '🪦',
  'Elementary and Secondary Schools': '🏫',
  Florists: '💐',
  'Museums, Historical Sites, and Similar Institutions': '🏛️',
  'Grocery Stores': '🛒',
  'Nursing Care Facilities (Skilled Nursing Facilities)': '🏥',
  'Justice, Public Order, and Safety Activities': '🚔',
  'Administration of Economic Programs': '🏛️',
  'General Merchandise Stores, including Warehouse Clubs and Supercenters':
    '🏬',
  'Gasoline Stations': '⛽',
  'Agencies, Brokerages, and Other Insurance Related Activities': '🏢',
  'Automotive Repair and Maintenance': '🚗',
  'Specialty Food Stores': '🏪',
  'Coating, Engraving, Heat Treating, and Allied Activities': '🏢',
  'Building Material and Supplies Dealers': '🏢',
  'Postal Service': '📬',
  Home: '🏠'
};

let household_locs: Record<string, [number, number]> = {};
let place_locs: Record<string, [number, number]> = {};

function updateIcons(
  mapCenter: [number, number],
  sim_data: any,
  pap_data: any,
  hotspots: any
) {
  const icons: any[] = [];
  if (!sim_data || !pap_data) return icons;

  let minLat = Infinity,
    maxLat = -Infinity,
    minLng = Infinity,
    maxLng = -Infinity;
  let validPlaceCount = 0;

  if (pap_data.places) {
    for (const pdata of pap_data.places) {
      const lat = pdata.latitude,
        lng = pdata.longitude;
      if (lat && lng && !(lat === 0 && lng === 0)) {
        minLat = Math.min(minLat, lat);
        maxLat = Math.max(maxLat, lat);
        minLng = Math.min(minLng, lng);
        maxLng = Math.max(maxLng, lng);
        validPlaceCount++;
      }
    }
  }

  const hasPlaceBounds = validPlaceCount > 0 && minLat !== Infinity;
  const homeCenterLat = hasPlaceBounds ? (minLat + maxLat) / 2 : mapCenter[0];
  const homeCenterLng = hasPlaceBounds ? (minLng + maxLng) / 2 : mapCenter[1];
  const homeSpreadLat = hasPlaceBounds ? Math.max(maxLat - minLat, 0.02) : 0.06;
  const homeSpreadLng = hasPlaceBounds ? Math.max(maxLng - minLng, 0.02) : 0.06;

  const processLocs = (type: string, dataArray: any[], statArray: number[]) => {
    if (!dataArray || !statArray) return;
    dataArray.forEach((data, index) => {
      let lat = data.latitude,
        lng = data.longitude;
      if (type === 'homes') {
        data.label = `Home #${data.id}`;
        if (!(data.id in household_locs)) {
          household_locs[data.id] = [
            homeCenterLat + (Math.random() - 0.5) * homeSpreadLat,
            homeCenterLng + (Math.random() - 0.5) * homeSpreadLng
          ];
        }
        lat = household_locs[data.id][0];
        lng = household_locs[data.id][1];
      } else if (!lat || !lng || (lat === 0 && lng === 0)) {
        if (!(data.id in place_locs)) {
          place_locs[data.id] = [
            homeCenterLat + (Math.random() - 0.5) * homeSpreadLat,
            homeCenterLng + (Math.random() - 0.5) * homeSpreadLng
          ];
        }
        lat = place_locs[data.id][0];
        lng = place_locs[data.id][1];
      }

      const pop = statArray[index * 2] ?? 0;
      const inf = statArray[index * 2 + 1] ?? 0;
      let description = `${pop} people\n${inf} infected`;
      if (type === 'places' && hotspots?.[data.id]) {
        description += `\n\nHotspot at hour${hotspots[data.id].length === 1 ? '' : 's'}: ${hotspots[data.id].map((t: number) => Math.floor(t / 60)).join(', ')}`;
      }
      icons.push({
        type,
        id: data.id,
        latitude: lat,
        longitude: lng,
        label: data.label,
        description,
        icon:
          (type === 'homes'
            ? icon_lookup.Home
            : icon_lookup[data.top_category]) ?? '❓',
        population: pop,
        infected: inf
      });
    });
  };

  processLocs('homes', pap_data.homes, sim_data.h);
  processLocs('places', pap_data.places, sim_data.p);
  return icons;
}

function applyAlpha(hex: string, alpha: number) {
  const bigint = parseInt(hex.replace('#', ''), 16);
  return `rgba(${(bigint >> 16) & 255},${(bigint >> 8) & 255},${bigint & 255},${alpha})`;
}

function EmojiOverlay({
  map,
  hotspots = {}
}: {
  map: any;
  hotspots: Record<string, number[]>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!map) return;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;

    function drawEmojis() {
      const { width, height } = map.getContainer().getBoundingClientRect();
      canvas.width = width;
      canvas.height = height;
      ctx.clearRect(0, 0, width, height);
      const features = map.queryRenderedFeatures(undefined, {
        source: 'points'
      });
      if (!features?.length) return;
      const zoom = map.getZoom();
      const time = Date.now() / 1000;
      features.forEach((f: any) => {
        const props = f.properties;
        if (!props || props.cluster || !props.icon) return;
        const [lng, lat] = f.geometry.coordinates;
        const pixel = map.project([lng, lat]);
        const infectionRatio = parseFloat(props.infection_ratio || 0);
        const adjusted = Math.sqrt(infectionRatio);
        let baseColor = '#4CAF50';
        if (adjusted >= 0.5) baseColor = '#F44336';
        else if (adjusted >= 0.35) baseColor = '#FF9800';
        else if (adjusted >= 0.2) baseColor = '#FFEB3B';
        const size = 6 + zoom * 1.2;
        const isHotspot =
          props.type === 'places' &&
          hotspots &&
          Object.keys(hotspots).includes(props.id);
        const pulse = isHotspot
          ? 0.5 + 0.5 * Math.sin(time * 4 + (parseInt(props.id, 36) % 10))
          : 0;
        const pulseSize = size * (1 + 0.3 * pulse);
        const pulseAlpha = isHotspot ? 0.4 + 0.4 * pulse : 1.0;
        ctx.beginPath();
        ctx.arc(pixel.x, pixel.y, pulseSize * 0.6, 0, Math.PI * 2);
        ctx.fillStyle = applyAlpha(baseColor, pulseAlpha);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.font = `${size}px 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(props.icon, pixel.x, pixel.y);
      });
    }

    map.on('render', drawEmojis);
    drawEmojis();
    return () => map.off('render', drawEmojis);
  }, [map, hotspots]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex: 5,
        pointerEvents: 'none'
      }}
    />
  );
}

function makeGeoJSON(pois: any[]) {
  return {
    type: 'FeatureCollection',
    features: pois.map((poi) => ({
      type: 'Feature',
      properties: {
        ...poi,
        infection_ratio: poi.population > 0 ? poi.infected / poi.population : 0
      },
      geometry: { type: 'Point', coordinates: [poi.longitude, poi.latitude] }
    }))
  };
}

interface ClusteredMapProps {
  currentTime: number;
  mapCenter: [number, number];
  pois: any[];
  hotspots: Record<string, number[]>;
  onMarkerClick: (info: { id: string; label: string; type: string }) => void;
  heatmapMode: string;
}

function ClusteredMap({
  currentTime,
  mapCenter,
  pois,
  hotspots,
  onMarkerClick,
  heatmapMode
}: ClusteredMapProps) {
  const mapRef = useRef<any>(null);
  const [mapInstance, setMapInstance] = useState<any>(null);
  const [popupInfo, setPopupInfo] = useState<any>(null);
  const [fadeCircle, setFadeCircle] = useState(1);
  const [fadeLabel, setFadeLabel] = useState(1);
  const hasFitBounds = useRef(false);

  useEffect(() => {
    if (!mapInstance || !pois.length || hasFitBounds.current) return;
    let minLat = Infinity,
      maxLat = -Infinity,
      minLng = Infinity,
      maxLng = -Infinity;
    for (const poi of pois) {
      if (poi.latitude && poi.longitude) {
        minLat = Math.min(minLat, poi.latitude);
        maxLat = Math.max(maxLat, poi.latitude);
        minLng = Math.min(minLng, poi.longitude);
        maxLng = Math.max(maxLng, poi.longitude);
      }
    }
    if (minLat === Infinity) return;
    if (maxLat - minLat > 0.06 || maxLng - minLng > 0.06) {
      mapInstance.fitBounds(
        [
          [minLng, minLat],
          [maxLng, maxLat]
        ],
        { padding: 40, duration: 800, maxZoom: 14 }
      );
    }
    hasFitBounds.current = true;
  }, [mapInstance, pois]);

  useEffect(() => {
    if (!mapInstance) return;
    const markerLayers = [
      'clusters',
      'cluster-count',
      'unclustered-point-circle',
      'unclustered-point-emoji'
    ];
    const isMarkers = heatmapMode === 'markers';
    for (const id of markerLayers) {
      if (mapInstance.getLayer(id))
        mapInstance.setLayoutProperty(
          id,
          'visibility',
          isMarkers ? 'visible' : 'none'
        );
    }
    if (mapInstance.getLayer('heatmap-population'))
      mapInstance.setLayoutProperty(
        'heatmap-population',
        'visibility',
        heatmapMode === 'population' ? 'visible' : 'none'
      );
    if (mapInstance.getLayer('heatmap-infection'))
      mapInstance.setLayoutProperty(
        'heatmap-infection',
        'visibility',
        heatmapMode === 'infection' ? 'visible' : 'none'
      );
    const isHeatmap =
      heatmapMode === 'population' || heatmapMode === 'infection';
    if (mapInstance.getLayer('heatmap-location-dots'))
      mapInstance.setLayoutProperty(
        'heatmap-location-dots',
        'visibility',
        isHeatmap ? 'visible' : 'none'
      );
  }, [heatmapMode, mapInstance]);

  const handleMapLoad = (event: any) => {
    const map = event.target;
    setMapInstance(map);
    map.on('moveend', () => {
      const start = performance.now();
      const animate = (now: number) => {
        const t = Math.min((now - start) / 350, 1);
        const eased = 1 - (1 - t) ** 3;
        setFadeLabel(Math.min(eased * 1.1, 1));
        setFadeCircle(Math.min(eased * 0.85 + 0.15, 1));
        if (t < 1) requestAnimationFrame(animate);
      };
      requestAnimationFrame(animate);
    });
  };

  useEffect(() => {
    if (!mapInstance) return;
    const frame = requestAnimationFrame(() => {
      const data = makeGeoJSON(pois);
      const source = mapInstance.getSource('points');
      if (source?.setData) source.setData(data);
      const heatmapSource = mapInstance.getSource('heatmap-points');
      if (heatmapSource?.setData) heatmapSource.setData(data);
    });
    return () => cancelAnimationFrame(frame);
  }, [pois, mapInstance]);

  useEffect(() => {
    setPopupInfo(null);
  }, []);

  useEffect(() => {
    if (!mapInstance) return;
    if (mapInstance.getLayer('cluster-count'))
      mapInstance.setLayoutProperty(
        'cluster-count',
        'visibility',
        fadeLabel < 0.2 ? 'none' : 'visible'
      );
  }, [fadeLabel, mapInstance]);

  const geojson = makeGeoJSON(pois);

  const handleClick = (event: any) => {
    const feature = event.features?.[0];
    if (!feature?.properties) return;
    const map = event.target;
    if (feature.properties.cluster) {
      const clusterId = feature.properties.cluster_id;
      map
        .getSource('points')
        .getClusterExpansionZoom(clusterId, (err: any, zoom: number) => {
          if (err) return;
          map.easeTo({
            center: feature.geometry.coordinates,
            zoom: zoom + 0.5,
            duration: 1000
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
    map.easeTo({
      center: coords,
      zoom: Math.max(map.getZoom(), 15),
      duration: 600
    });
    setPopupInfo(null);
    setTimeout(
      () =>
        setPopupInfo({
          coordinates: coords,
          label: feature.properties.label,
          description: feature.properties.description,
          icon: feature.properties.icon,
          id: feature.properties.id
        }),
      250
    );
  };

  const clusterColor = [
    'interpolate',
    ['linear'],
    ['sqrt', ['/', ['get', 'infected'], ['get', 'population']]],
    0,
    '#4CAF50',
    0.15,
    '#FFEB3B',
    0.35,
    '#FF9800',
    0.5,
    '#F44336'
  ];

  return (
    <div className="mapcontainer outline-solid outline-2 outline-[var(--color-primary-blue)] relative">
      <Map
        ref={mapRef}
        onLoad={handleMapLoad}
        initialViewState={{
          latitude: mapCenter[0],
          longitude: mapCenter[1],
          zoom: 13
        }}
        style={{ width: '100%', height: '100%' }}
        mapStyle="https://basemaps.cartocdn.com/gl/positron-gl-style/style.json"
        interactiveLayerIds={[
          'clusters',
          'unclustered-point-circle',
          'unclustered-point-emoji',
          'heatmap-location-dots'
        ]}
        onClick={handleClick}
      >
        <Source
          id="points"
          type="geojson"
          data={geojson as any}
          cluster={true}
          clusterMaxZoom={18}
          clusterRadius={75}
          clusterMinPoints={3}
          clusterProperties={{
            population: ['+', ['to-number', ['get', 'population']]],
            infected: ['+', ['to-number', ['get', 'infected']]]
          }}
        >
          <Layer
            id="clusters"
            type="circle"
            filter={['has', 'point_count']}
            paint={{
              'circle-color': clusterColor as any,
              'circle-radius': [
                'step',
                ['get', 'point_count'],
                22,
                10,
                28,
                25,
                34
              ],
              'circle-opacity': fadeCircle,
              'circle-stroke-width': 1,
              'circle-stroke-color': '#fff'
            }}
          />
          <Layer
            id="cluster-count"
            type="symbol"
            filter={['has', 'point_count']}
            layout={{
              'text-field': [
                'format',
                ['get', 'population'],
                { 'font-scale': 1.2 },
                '\n',
                ['concat', 'Inf: ', ['get', 'infected']],
                { 'font-scale': 0.8 }
              ],
              'text-size': 12,
              'text-allow-overlap': true
            }}
            paint={{ 'text-color': '#fff', 'text-opacity': fadeLabel }}
          />
          <Layer
            id="unclustered-point-circle"
            type="circle"
            filter={['!', ['has', 'point_count']]}
            paint={{
              'circle-radius': 14,
              'circle-color': clusterColor as any,
              'circle-opacity': fadeCircle,
              'circle-stroke-color': '#fff',
              'circle-stroke-width': 1
            }}
          />
          <Layer
            id="unclustered-point-emoji"
            type="symbol"
            filter={['!', ['has', 'point_count']]}
            layout={{
              'text-field': ['get', 'icon'],
              'text-size': 18,
              'text-allow-overlap': true,
              'text-font': ['Open Sans Regular']
            }}
            paint={{ 'text-color': '#000000', 'text-opacity': fadeCircle }}
          />
        </Source>
        <Source id="heatmap-points" type="geojson" data={geojson as any}>
          <Layer
            id="heatmap-population"
            type="heatmap"
            layout={
              {
                visibility: heatmapMode === 'population' ? 'visible' : 'none'
              } as any
            }
            paint={{
              'heatmap-weight': [
                'interpolate',
                ['linear'],
                ['get', 'population'],
                0,
                0,
                5,
                0.3,
                20,
                0.7,
                50,
                1
              ] as any,
              'heatmap-intensity': [
                'interpolate',
                ['linear'],
                ['zoom'],
                10,
                0.5,
                15,
                1.5
              ] as any,
              'heatmap-radius': [
                'interpolate',
                ['linear'],
                ['zoom'],
                10,
                30,
                13,
                50,
                16,
                80
              ] as any,
              'heatmap-color': [
                'interpolate',
                ['linear'],
                ['heatmap-density'],
                0,
                'rgba(0,0,0,0)',
                0.1,
                'rgba(65,105,225,0.3)',
                0.3,
                'rgba(0,191,255,0.5)',
                0.5,
                'rgba(0,255,127,0.6)',
                0.7,
                'rgba(255,255,0,0.7)',
                0.9,
                'rgba(255,165,0,0.85)',
                1.0,
                'rgba(255,0,0,0.9)'
              ] as any,
              'heatmap-opacity': 0.85
            }}
          />
          <Layer
            id="heatmap-infection"
            type="heatmap"
            layout={
              {
                visibility: heatmapMode === 'infection' ? 'visible' : 'none'
              } as any
            }
            paint={{
              'heatmap-weight': [
                'interpolate',
                ['linear'],
                ['get', 'infected'],
                0,
                0,
                1,
                0.3,
                5,
                0.6,
                15,
                1
              ] as any,
              'heatmap-intensity': [
                'interpolate',
                ['linear'],
                ['zoom'],
                10,
                0.6,
                15,
                2
              ] as any,
              'heatmap-radius': [
                'interpolate',
                ['linear'],
                ['zoom'],
                10,
                30,
                13,
                50,
                16,
                80
              ] as any,
              'heatmap-color': [
                'interpolate',
                ['linear'],
                ['heatmap-density'],
                0,
                'rgba(0,0,0,0)',
                0.1,
                'rgba(255,255,200,0.3)',
                0.3,
                'rgba(255,200,50,0.5)',
                0.5,
                'rgba(255,130,0,0.65)',
                0.7,
                'rgba(220,50,0,0.8)',
                0.9,
                'rgba(170,0,0,0.9)',
                1.0,
                'rgba(100,0,0,0.95)'
              ] as any,
              'heatmap-opacity': 0.85
            }}
          />
          <Layer
            id="heatmap-location-dots"
            type="circle"
            minzoom={14}
            layout={
              {
                visibility:
                  heatmapMode === 'population' || heatmapMode === 'infection'
                    ? 'visible'
                    : 'none'
              } as any
            }
            paint={{
              'circle-radius': [
                'interpolate',
                ['linear'],
                ['zoom'],
                10,
                4,
                14,
                8,
                18,
                12
              ] as any,
              'circle-color': '#ffffff',
              'circle-opacity': 0.9,
              'circle-stroke-color': '#333333',
              'circle-stroke-width': 1.5,
              'circle-stroke-opacity': 0.8
            }}
          />
        </Source>
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
              <div className="text-2xl mb-0.5">{popupInfo.icon}</div>
              <header className="text-sm font-bold mb-0.5">
                {popupInfo.label}
              </header>
              <p className="text-xs">{popupInfo.description}</p>
            </div>
          </Popup>
        )}
      </Map>
      {mapInstance && heatmapMode === 'markers' && (
        <EmojiOverlay map={mapInstance} hotspots={hotspots} />
      )}
    </div>
  );
}

interface ModelMapProps {
  onMarkerClick: (info: { id: string; label: string; type: string }) => void;
  selectedZone: {
    latitude: number;
    longitude: number;
    start_date: string;
    length: number;
  };
}

export default function ModelMap({
  onMarkerClick,
  selectedZone
}: ModelMapProps) {
  const sim_data = useMapData((state) => state.simdata);
  const pap_data = useMapData((state) => state.papdata);
  const hotspots = useMapData((state) => state.hotspots) || {};

  const [maxHours, setMaxHours] = useState(1);
  const [currentTime, setCurrentTime] = useState(1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [heatmapMode, setHeatmapMode] = useState('markers');

  useEffect(() => {
    household_locs = {};
    place_locs = {};
  }, []);

  const availableTimesteps = useMemo(() => {
    if (!sim_data) return [];
    return Object.keys(sim_data)
      .map(Number)
      .filter((n) => !Number.isNaN(n))
      .sort((a, b) => a - b);
  }, [sim_data]);

  const findNearestTimestep = useCallback(
    (targetMinutes: number) => {
      if (availableTimesteps.length === 0) return null;
      let closest = availableTimesteps[0];
      for (const ts of availableTimesteps) {
        if (Math.abs(ts - targetMinutes) < Math.abs(closest - targetMinutes))
          closest = ts;
        if (ts > targetMinutes) break;
      }
      return closest;
    },
    [availableTimesteps]
  );

  const mapCenter = useMemo(
    () => [selectedZone.latitude, selectedZone.longitude] as [number, number],
    [selectedZone]
  );

  const pois = useMemo(() => {
    const targetMinutes = currentTime * 60;
    const nearestTs = findNearestTimestep(targetMinutes);
    const dataForTime =
      nearestTs !== null ? sim_data?.[nearestTs.toString()] : null;
    return updateIcons(mapCenter, dataForTime, pap_data, hotspots);
  }, [
    currentTime,
    hotspots,
    mapCenter,
    pap_data,
    sim_data,
    findNearestTimestep
  ]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (!isPlaying || availableTimesteps.length === 0) return;
      setCurrentTime((prev) => {
        const currentMinutes = Math.round(prev * 60);
        const nextIndex = availableTimesteps.findIndex(
          (ts) => ts > currentMinutes
        );
        if (nextIndex === -1) return prev;
        return availableTimesteps[nextIndex] / 60;
      });
    }, 750);
    return () => clearInterval(interval);
  }, [isPlaying, availableTimesteps]);

  useEffect(() => {
    if (sim_data) {
      const keys = Object.keys(sim_data)
        .map(Number)
        .filter((n) => !Number.isNaN(n));
      setMaxHours(keys.length > 0 ? Math.max(...keys) / 60 : 1);
    }
  }, [sim_data]);

  return (
    <div>
      <MapLegend icon_lookup={icon_lookup} />
      <div className="heatmap-toggle">
        <button
          className={`heatmap-toggle-btn ${heatmapMode === 'markers' ? 'active' : ''}`}
          onClick={() => setHeatmapMode('markers')}
          title="Show location markers"
        >
          📍 Markers
        </button>
        <button
          className={`heatmap-toggle-btn ${heatmapMode === 'population' ? 'active' : ''}`}
          onClick={() => setHeatmapMode('population')}
          title="Show population density heatmap"
        >
          👥 Population
        </button>
        <button
          className={`heatmap-toggle-btn ${heatmapMode === 'infection' ? 'active' : ''}`}
          onClick={() => setHeatmapMode('infection')}
          title="Show infection density heatmap"
        >
          🦠 Infections
        </button>
      </div>
      <ClusteredMap
        currentTime={currentTime}
        mapCenter={mapCenter}
        pois={pois}
        hotspots={hotspots as Record<string, number[]>}
        onMarkerClick={onMarkerClick}
        heatmapMode={heatmapMode}
      />
      <div className="mt-3 text-center w-full">
        {new Date(
          new Date(selectedZone.start_date).getTime() +
            currentTime * 60 * 60 * 1000
        ).toLocaleString('en-US', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
          weekday: 'short',
          hour: 'numeric',
          minute: '2-digit',
          timeZone: 'UTC'
        })}
      </div>
      <div className="flex items-center justify-center gap-3 mt-3">
        <button
          className="bg-[var(--color-primary-blue)] text-white px-4 py-2 rounded-full font-semibold hover:brightness-90 transition"
          onClick={() => setIsPlaying(!isPlaying)}
        >
          {isPlaying ? (
            <i className="bi bi-pause-fill" />
          ) : (
            <i className="bi bi-play-fill" />
          )}
        </button>
        <input
          className="w-full max-w-[90vw]"
          type="range"
          min={1}
          max={maxHours}
          value={currentTime}
          onChange={(e) => setCurrentTime(parseInt(e.target.value, 10))}
        />
      </div>
      <div className="flex justify-center mt-3">
        <input
          className="w-[10%] px-1 bg-[var(--color-bg-ivory)] outline-solid outline-2 outline-[var(--color-primary-blue)]"
          type="number"
          min={1}
          max={maxHours}
          value={currentTime}
          onChange={(e) => setCurrentTime(parseInt(e.target.value, 10))}
        />
      </div>
    </div>
  );
}
