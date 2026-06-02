'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useMapData from '@/stores/mapdata';

import 'maplibre-gl/dist/maplibre-gl.css';
import '@/styles/modelmap.css';
import { Pause, Play } from 'lucide-react';
import Button from '@/components/ui/button';
import Slider from '@/components/ui/slider';
import ClusteredMap from '@/features/model-map/clustered-map';
import {
  type HeatmapMode,
  PEOPLE_MAP_PREFETCH_STEPS,
  PLAYBACK_INTERVAL_MS
} from '@/features/model-map/map-constants';
import {
  type GeoJSONData,
  iconLookup,
  makePeopleDotGeoJSON,
  makePersonStatusDotGeoJSON,
  type PeopleDotFeatureCollection,
  type PeopleMapData,
  type PersonStatusDotFeatureCollection,
  resetModelMapLayoutCaches,
  updateIcons
} from '@/features/model-map/map-data';
import {
  getMapStorageKey,
  getPeopleMapCacheKey,
  getStoredCurrentTime,
  getStoredHeatmapMode
} from '@/features/model-map/map-storage';
import MapLegend from './maplegend';

interface ModelMapProps {
  onMarkerClick: (info: { id: string; label: string; type: string }) => void;
  simId?: number | null;
  disabledPoiIds?: ReadonlySet<string>;
  selectedZone: {
    latitude: number;
    longitude: number;
    cbg_list?: string[];
    start_date: string;
    length: number;
  };
}

export default function ModelMap({
  onMarkerClick,
  disabledPoiIds,
  simId,
  selectedZone
}: ModelMapProps) {
  const sim_data = useMapData((state) => state.simdata);
  const pap_data = useMapData((state) => state.papdata);
  const hotspots = useMapData((state) => state.hotspots) || {};
  const [zoneGeoJSON, setZoneGeoJSON] = useState<GeoJSONData | null>(null);

  const [maxHours, setMaxHours] = useState(1);
  const [currentTime, setCurrentTime] = useState(() =>
    getStoredCurrentTime(simId, 1)
  );
  const [isPlaying, setIsPlaying] = useState(false);
  const [heatmapMode, setHeatmapMode] = useState<HeatmapMode>(() =>
    getStoredHeatmapMode(simId, 'markers')
  );
  const [peopleMapData, setPeopleMapData] = useState<PeopleMapData | null>(
    null
  );
  const [peopleMapError, setPeopleMapError] = useState<string | null>(null);
  const peopleMapDataSimId = useRef<number | null>(null);
  const peopleMapCache = useRef<Map<string, PeopleMapData>>(new Map());
  const peopleMapRequests = useRef<Map<string, Promise<PeopleMapData>>>(
    new Map()
  );

  useEffect(() => {
    resetModelMapLayoutCaches();
  }, []);

  useEffect(() => {
    setCurrentTime(getStoredCurrentTime(simId, 1));
    setHeatmapMode(getStoredHeatmapMode(simId, 'markers'));
    peopleMapDataSimId.current = null;
    setPeopleMapData(null);
    setPeopleMapError(null);
  }, [simId]);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.sessionStorage) return;
    window.sessionStorage.setItem(
      getMapStorageKey(simId, 'current-time'),
      currentTime.toString()
    );
  }, [currentTime, simId]);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.sessionStorage) return;
    window.sessionStorage.setItem(
      getMapStorageKey(simId, 'heatmap-mode'),
      heatmapMode
    );
  }, [heatmapMode, simId]);

  useEffect(() => {
    const cbgList = selectedZone?.cbg_list?.filter(Boolean) ?? [];
    if (cbgList.length === 0) {
      setZoneGeoJSON(null);
      return;
    }

    const controller = new AbortController();
    const cbgs = cbgList.join(',');
    const url = new URL('/api/cbg-geojson', window.location.origin);
    url.searchParams.set('cbgs', cbgs);
    url.searchParams.set('include_neighbors', 'false');

    fetch(url.toString(), { signal: controller.signal })
      .then((resp) => (resp.ok ? resp.json() : null))
      .then((data) => {
        if (!controller.signal.aborted) {
          setZoneGeoJSON(data?.features?.length ? data : null);
        }
      })
      .catch((err) => {
        if ((err as Error)?.name !== 'AbortError') {
          console.warn('Failed to load zone CBG overlay:', err);
        }
      });

    return () => controller.abort();
  }, [selectedZone]);

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

  const selectedTimestep = useMemo(() => {
    const targetMinutes = currentTime * 60;
    return findNearestTimestep(targetMinutes);
  }, [currentTime, findNearestTimestep]);

  const pois = useMemo(() => {
    const dataForTime =
      selectedTimestep !== null
        ? sim_data?.[selectedTimestep.toString()]
        : null;
    const nextPois = updateIcons(
      mapCenter,
      dataForTime,
      pap_data,
      hotspots,
      zoneGeoJSON
    );
    if (!disabledPoiIds?.size) {
      return nextPois;
    }
    return nextPois.map((poi) =>
      poi.type === 'places' && disabledPoiIds.has(String(poi.id))
        ? { ...poi, disabled: true }
        : poi
    );
  }, [
    disabledPoiIds,
    hotspots,
    mapCenter,
    pap_data,
    sim_data,
    selectedTimestep,
    zoneGeoJSON
  ]);

  const loadPeopleMapData = useCallback(
    async (timestep: number) => {
      if (!simId) {
        throw new Error('Missing simulation id.');
      }

      const cacheKey = getPeopleMapCacheKey(simId, timestep);
      const cached = peopleMapCache.current.get(cacheKey);
      if (cached) {
        return cached;
      }

      const existingRequest = peopleMapRequests.current.get(cacheKey);
      if (existingRequest) {
        return existingRequest;
      }

      const request = fetch(`/api/simdata/${simId}/people-map?time=${timestep}`)
        .then(async (response) => {
          if (!response.ok) {
            throw new Error(`People map request failed: ${response.status}`);
          }
          return response.json() as Promise<{ data?: PeopleMapData }>;
        })
        .then((json) => {
          if (!json.data) {
            throw new Error('People map response did not include data.');
          }
          peopleMapCache.current.set(cacheKey, json.data);
          return json.data;
        })
        .finally(() => {
          peopleMapRequests.current.delete(cacheKey);
        });

      peopleMapRequests.current.set(cacheKey, request);
      return request;
    },
    [simId]
  );

  useEffect(() => {
    if (heatmapMode !== 'people' || !simId || selectedTimestep === null) {
      return;
    }

    let active = true;
    setPeopleMapError(null);

    loadPeopleMapData(selectedTimestep)
      .then((data) => {
        if (!active) {
          return;
        }
        peopleMapDataSimId.current = simId;
        setPeopleMapData(data);
      })
      .catch((error) => {
        if (!active) {
          return;
        }
        console.warn('Failed to load person-level map data:', error);
        setPeopleMapError('Person-level map data is unavailable.');
      });

    return () => {
      active = false;
    };
  }, [heatmapMode, loadPeopleMapData, selectedTimestep, simId]);

  useEffect(() => {
    if (
      heatmapMode !== 'people' ||
      !simId ||
      selectedTimestep === null ||
      availableTimesteps.length === 0
    ) {
      return;
    }

    const selectedIndex = availableTimesteps.indexOf(selectedTimestep);
    if (selectedIndex === -1) {
      return;
    }

    const upcomingTimesteps = availableTimesteps.slice(
      selectedIndex + 1,
      selectedIndex + 1 + PEOPLE_MAP_PREFETCH_STEPS
    );

    for (const timestep of upcomingTimesteps) {
      loadPeopleMapData(timestep).catch((error) => {
        console.warn('Failed to preload person-level map data:', error);
      });
    }
  }, [
    availableTimesteps,
    heatmapMode,
    loadPeopleMapData,
    selectedTimestep,
    simId
  ]);

  useEffect(() => {
    if (!isPlaying || availableTimesteps.length === 0) {
      return;
    }

    const interval = setInterval(() => {
      setCurrentTime((prev) => {
        const currentMinutes = Math.round(prev * 60);
        const nextIndex = availableTimesteps.findIndex(
          (ts) => ts > currentMinutes
        );
        if (nextIndex === -1) return prev;
        return availableTimesteps[nextIndex] / 60;
      });
    }, PLAYBACK_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [isPlaying, availableTimesteps]);

  const peopleDotColor = heatmapMode === 'infection' ? '#dc2626' : '#2563eb';

  const peopleDotGeoJSON = useMemo<PeopleDotFeatureCollection>(() => {
    if (heatmapMode !== 'population' && heatmapMode !== 'infection') {
      return { type: 'FeatureCollection', features: [] };
    }
    return makePeopleDotGeoJSON(pois, heatmapMode);
  }, [pois, heatmapMode]);

  const selectedPeopleMapData = useMemo(() => {
    if (heatmapMode !== 'people' || !simId || selectedTimestep === null) {
      return null;
    }

    if (
      peopleMapDataSimId.current === simId &&
      peopleMapData?.requested_time === selectedTimestep
    ) {
      return peopleMapData;
    }

    return (
      peopleMapCache.current.get(
        getPeopleMapCacheKey(simId, selectedTimestep)
      ) ?? null
    );
  }, [heatmapMode, peopleMapData, selectedTimestep, simId]);

  const personStatusDotGeoJSON = useMemo<PersonStatusDotFeatureCollection>(
    () =>
      heatmapMode === 'people'
        ? makePersonStatusDotGeoJSON(pois, selectedPeopleMapData)
        : { type: 'FeatureCollection', features: [] },
    [heatmapMode, selectedPeopleMapData, pois]
  );

  useEffect(() => {
    if (sim_data) {
      const keys = Object.keys(sim_data)
        .map(Number)
        .filter((n) => !Number.isNaN(n));
      setMaxHours(keys.length > 0 ? Math.max(...keys) / 60 : 1);
    }
  }, [sim_data]);

  useEffect(() => {
    if (!sim_data || maxHours <= 1) return;
    setCurrentTime((prev) => {
      if (!Number.isFinite(prev)) return 1;
      return Math.min(Math.max(prev, 1), maxHours);
    });
  }, [maxHours, sim_data]);

  return (
    <div className="modelmap_panel">
      <div className="heatmap-toggle">
        <MapLegend icon_lookup={iconLookup} />
        <div className="heatmap-toggle-group">
          <Button
            variant={heatmapMode === 'markers' ? 'primary' : 'secondary'}
            className="text-xs"
            onClick={() => setHeatmapMode('markers')}
          >
            Markers
          </Button>
          <Button
            variant={heatmapMode === 'people' ? 'primary' : 'secondary'}
            className="text-xs"
            onClick={() => setHeatmapMode('people')}
          >
            Cases
          </Button>
        </div>
      </div>
      {heatmapMode === 'people' && (
        <div className="people-map-key">
          <span className="people-map-key-item">
            <span className="people-map-swatch people-map-swatch-blue" />
            Uninfected
          </span>
          <span className="people-map-key-item">
            <span className="people-map-swatch people-map-swatch-red" />
            Infected
          </span>
          <span className="people-map-key-item">
            <span className="people-map-swatch people-map-swatch-recovered" />
            Recovered
          </span>
          {selectedPeopleMapData && selectedPeopleMapData.sample_rate > 1 && (
            <span className="people-map-key-note">
              sampled 1 in {selectedPeopleMapData.sample_rate}
            </span>
          )}
          {peopleMapError && (
            <span className="people-map-key-note">{peopleMapError}</span>
          )}
        </div>
      )}
      <ClusteredMap
        currentTime={currentTime}
        mapCenter={mapCenter}
        pois={pois}
        zoneGeoJSON={zoneGeoJSON}
        hotspots={hotspots as Record<string, number[]>}
        onMarkerClick={onMarkerClick}
        heatmapMode={heatmapMode}
        peopleDotGeoJSON={peopleDotGeoJSON}
        peopleDotColor={peopleDotColor}
        personStatusDotGeoJSON={personStatusDotGeoJSON}
      />
      <div className="modelmap_current_time">
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
      <div className="modelmap_timeline_controls">
        <Button
          variant="primary"
          className="modelmap_play_button py-1!"
          onClick={() => setIsPlaying(!isPlaying)}
          aria-label={isPlaying ? 'Pause timeline' : 'Play timeline'}
        >
          {isPlaying ? (
            <Pause size={14} fill="currentColor" />
          ) : (
            <Play size={14} fill="currentColor" />
          )}
        </Button>
        <Slider
          className="modelmap_slider"
          min={1}
          max={maxHours}
          value={currentTime}
          onChange={(e) => setCurrentTime(parseInt(e.target.value, 10))}
        />
        <input
          className="modelmap_time_input"
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
