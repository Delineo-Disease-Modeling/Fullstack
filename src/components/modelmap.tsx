'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useMapData, { type SimData } from '@/stores/mapdata';

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
  getFeatureCbgId,
  iconLookup,
  makePeopleDotGeoJSON,
  makePersonStatusDotGeoJSON,
  normalizeCbgId,
  type PeopleDotFeatureCollection,
  type PeopleMapData,
  type PersonStatusDotFeatureCollection,
  resetModelMapLayoutCaches,
  updateIcons
} from '@/features/model-map/map-data';
import { type DotsBundle, synthesizeFromBundle } from '@/lib/dots-synth';
import {
  getMapStorageKey,
  getPeopleMapCacheKey,
  getStoredCurrentTime,
  getStoredHeatmapMode
} from '@/features/model-map/map-storage';
import MapLegend from './maplegend';

function getMapFrameCacheKey(simId: number, timestep: number) {
  return `${simId}:${timestep}`;
}

// Stable empty default so the `pois` memo isn't invalidated by a fresh `{}`
// reference on every render while hotspots are still loading.
const EMPTY_HOTSPOTS: Record<string, number[]> = {};

// Max consecutive playback ticks to wait for an unloaded Cases frame before
// advancing anyway. When the whole-run dots bundle is loaded, frames are
// synthesized client-side (instant) and this buffer is bypassed entirely — it
// only governs the per-frame /people-map FALLBACK path (runs with no baked
// bundle), where each fetch can take ~0.4-1.7s over the WAN. Holding long enough
// to ride out a slow frame keeps the dots on screen instead of blanking to
// "Loading cases...". At PLAYBACK_INTERVAL_MS (750ms), 6 holds caps a stall at
// ~4.5s.
const MAX_BUFFER_HOLDS = 6;

function getSeedCbgIdsKey(seedCbgIds: readonly string[] | undefined) {
  const normalized = new Set<string>();
  for (const cbgId of seedCbgIds ?? []) {
    const normalizedCbgId = normalizeCbgId(cbgId);
    if (normalizedCbgId) {
      normalized.add(normalizedCbgId);
    }
  }
  return [...normalized].sort().join(',');
}

interface ModelMapProps {
  onMarkerClick: (info: { id: string; label: string; type: string }) => void;
  simId?: number | null;
  disabledPoiIds?: ReadonlySet<string>;
  seedCbgIds?: string[];
  // A POI to fly the Cases map to (e.g. clicked in the hotspot rankings). The
  // `nonce` changes on every request so repeat clicks on the same POI re-fly.
  focusPoi?: { id: string; nonce: number } | null;
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
  focusPoi,
  simId,
  seedCbgIds,
  selectedZone
}: ModelMapProps) {
  const sim_data = useMapData((state) => state.simdata);
  const pap_data = useMapData((state) => state.papdata);
  const hotspots = useMapData((state) => state.hotspots) ?? EMPTY_HOTSPOTS;
  const timesteps = useMapData((state) => state.timesteps);
  const setSimData = useMapData((state) => state.setSimData);
  const [baseZoneGeoJSON, setBaseZoneGeoJSON] = useState<GeoJSONData | null>(
    null
  );

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
  const [caseDotsVisible, setCaseDotsVisible] = useState(false);
  const peopleMapDataSimId = useRef<number | null>(null);
  const peopleMapCache = useRef<Map<string, PeopleMapData>>(new Map());
  const peopleMapRequests = useRef<Map<string, Promise<PeopleMapData>>>(
    new Map()
  );
  const mapFrameRequests = useRef<Map<string, Promise<SimData>>>(new Map());
  const bufferHoldsRef = useRef(0);
  // Whole-run compact dots bundle: fetched once per run so playback frames are
  // synthesized client-side instead of re-fetched per tick. Null when the run
  // has no baked bundle (then the per-frame /people-map path is used).
  const dotsBundleRef = useRef<DotsBundle | null>(null);
  const dotsBundleSimId = useRef<number | null>(null);
  const [dotsBundleReady, setDotsBundleReady] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const [mapFrameError, setMapFrameError] = useState<string | null>(null);
  const seedCbgIdsKey = useMemo(
    () => getSeedCbgIdsKey(seedCbgIds),
    [seedCbgIds]
  );
  const seedCbgSet = useMemo(
    () => new Set(seedCbgIdsKey ? seedCbgIdsKey.split(',') : []),
    [seedCbgIdsKey]
  );
  const zoneGeoJSON = useMemo(() => {
    if (!baseZoneGeoJSON?.features?.length) {
      return null;
    }

    return {
      ...baseZoneGeoJSON,
      features: baseZoneGeoJSON.features.map((feature) => {
        const cbgId = getFeatureCbgId(feature);
        return {
          ...feature,
          properties: {
            ...feature.properties,
            _cbg_id: cbgId,
            _is_seed_cbg: seedCbgSet.has(cbgId)
          }
        };
      })
    } satisfies GeoJSONData;
  }, [baseZoneGeoJSON, seedCbgSet]);

  useEffect(() => {
    resetModelMapLayoutCaches();
  }, []);

  useEffect(() => {
    setCurrentTime(getStoredCurrentTime(simId, 1));
    setHeatmapMode(getStoredHeatmapMode(simId, 'markers'));
    peopleMapDataSimId.current = null;
    setPeopleMapData(null);
    setPeopleMapError(null);
    setMapFrameError(null);
    setCaseDotsVisible(false);
    dotsBundleRef.current = null;
    dotsBundleSimId.current = null;
    setDotsBundleReady(false);
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

  // When a POI is selected from the hotspot rankings, surface it on the Cases
  // map: switch to the Cases ("people") view, scroll the map into view (the
  // rankings sit below it), and let ClusteredMap handle the fly-to.
  useEffect(() => {
    if (!focusPoi) return;
    setHeatmapMode('people');
    panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [focusPoi]);

  useEffect(() => {
    const cbgList = selectedZone?.cbg_list?.filter(Boolean) ?? [];
    if (cbgList.length === 0) {
      setBaseZoneGeoJSON(null);
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
          setBaseZoneGeoJSON(data?.features?.length ? data : null);
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
    if (timesteps?.length) {
      return timesteps;
    }
    if (!sim_data) return [];
    return Object.keys(sim_data)
      .map(Number)
      .filter((n) => !Number.isNaN(n))
      .sort((a, b) => a - b);
  }, [sim_data, timesteps]);

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

  const loadMapFrameData = useCallback(
    async (timestep: number) => {
      if (!simId) {
        throw new Error('Missing simulation id.');
      }

      const timestepKey = timestep.toString();
      const currentSimData = useMapData.getState().simdata;
      if (currentSimData?.[timestepKey]) {
        return { [timestepKey]: currentSimData[timestepKey] } satisfies SimData;
      }

      const cacheKey = getMapFrameCacheKey(simId, timestep);
      const existingRequest = mapFrameRequests.current.get(cacheKey);
      if (existingRequest) {
        return existingRequest;
      }

      const request = fetch(`/api/simdata/${simId}/map?time=${timestep}`)
        .then(async (response) => {
          if (!response.ok) {
            throw new Error(`Map frame request failed: ${response.status}`);
          }
          return response.json() as Promise<{ data?: { simdata?: SimData } }>;
        })
        .then((json) => {
          if (!json.data?.simdata) {
            throw new Error('Map frame response did not include simdata.');
          }
          return json.data.simdata;
        })
        .finally(() => {
          mapFrameRequests.current.delete(cacheKey);
        });

      mapFrameRequests.current.set(cacheKey, request);
      return request;
    },
    [simId]
  );

  // Only the *current* frame's data feeds the icons. Depending on this slice
  // rather than the whole `sim_data` object keeps prefetching/merging future
  // frames — which replaces the `sim_data` reference on every store write —
  // from needlessly recomputing the current frame's POIs.
  const currentFrameData =
    selectedTimestep !== null
      ? (sim_data?.[selectedTimestep.toString()] ?? null)
      : null;

  const pois = useMemo(() => {
    const nextPois = updateIcons(
      mapCenter,
      currentFrameData,
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
    currentFrameData,
    zoneGeoJSON
  ]);

  // Person dots only need static place geometry (lat/lng/footprint/label),
  // which is identical across timesteps. Deriving it from papData with a zeroed
  // sim — rather than the per-frame `pois` — lets the dot FeatureCollection memo
  // skip rebuilding on every count/icon recompute; it now rebuilds only when
  // occupancy (selectedPeopleMapData) actually changes.
  const stableDotPois = useMemo(() => {
    if (!pap_data) {
      return [];
    }
    const base = updateIcons(
      mapCenter,
      { h: [], p: [] },
      pap_data,
      {},
      zoneGeoJSON
    );
    if (!disabledPoiIds?.size) {
      return base;
    }
    return base.map((poi) =>
      poi.type === 'places' && disabledPoiIds.has(String(poi.id))
        ? { ...poi, disabled: true }
        : poi
    );
  }, [disabledPoiIds, mapCenter, pap_data, zoneGeoJSON]);

  const selectedMapFrameLoaded =
    selectedTimestep !== null && Boolean(sim_data?.[selectedTimestep]);

  useEffect(() => {
    if (!simId || selectedTimestep === null || selectedMapFrameLoaded) {
      return;
    }

    let active = true;
    setMapFrameError(null);

    loadMapFrameData(selectedTimestep)
      .then((nextSimData) => {
        if (active) {
          setSimData(nextSimData);
        }
      })
      .catch((error) => {
        if (!active) {
          return;
        }
        console.warn('Failed to load map frame data:', error);
        setMapFrameError('Map frame is still loading.');
      });

    return () => {
      active = false;
    };
  }, [
    loadMapFrameData,
    selectedMapFrameLoaded,
    selectedTimestep,
    setSimData,
    simId
  ]);

  useEffect(() => {
    if (
      !simId ||
      selectedTimestep === null ||
      availableTimesteps.length === 0 ||
      !selectedMapFrameLoaded
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

    let active = true;
    const preloadUpcoming = async () => {
      // Fetch the upcoming frames concurrently instead of serially, then merge
      // them in a single store update.
      const results = await Promise.all(
        upcomingTimesteps.map((timestep) =>
          loadMapFrameData(timestep).catch((error) => {
            console.warn('Failed to preload map frame data:', error);
            return null;
          })
        )
      );
      if (!active) return;
      const merged: SimData = Object.assign(
        {},
        ...results.filter((r): r is SimData => r !== null)
      );
      if (Object.keys(merged).length > 0) {
        setSimData(merged);
      }
    };

    preloadUpcoming();
    return () => {
      active = false;
    };
  }, [
    availableTimesteps,
    loadMapFrameData,
    selectedMapFrameLoaded,
    selectedTimestep,
    setSimData,
    simId
  ]);

  // Fetch the whole-run compact dots bundle ONCE when the Cases view opens, so
  // playback frames are synthesized client-side (instant) instead of being
  // re-fetched per tick — the large per-frame payloads choke playback over the
  // WAN on prod. Runs with no baked bundle return 409 and fall back to the
  // per-frame /people-map path below.
  useEffect(() => {
    if (heatmapMode !== 'people' || !caseDotsVisible || !simId) {
      return;
    }
    if (dotsBundleSimId.current === simId) {
      return; // already loaded (or attempted) for this run
    }

    let active = true;
    const controller = new AbortController();
    fetch(`/api/simdata/${simId}/dots`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          return null; // 409 (no bundle) / error -> per-frame fallback
        }
        const json = (await response.json()) as {
          data?: { place_ids?: string[]; frames?: Record<string, number[]> };
        };
        return json.data ?? null;
      })
      .then((data) => {
        if (!active) {
          return;
        }
        dotsBundleSimId.current = simId;
        if (
          data?.place_ids &&
          data.frames &&
          Object.keys(data.frames).length > 0
        ) {
          const frames = data.frames;
          const sortedTimes = Object.keys(frames)
            .map(Number)
            .filter((value) => Number.isFinite(value))
            .sort((a, b) => a - b);
          dotsBundleRef.current = {
            placeIds: data.place_ids,
            frames,
            sortedTimes
          };
        } else {
          dotsBundleRef.current = null;
        }
        setDotsBundleReady(Boolean(dotsBundleRef.current));
      })
      .catch((error) => {
        if (!active || controller.signal.aborted) {
          return;
        }
        console.warn('Failed to load dots bundle:', error);
        dotsBundleSimId.current = simId;
        dotsBundleRef.current = null;
        setDotsBundleReady(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [caseDotsVisible, heatmapMode, simId]);

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
    if (
      heatmapMode !== 'people' ||
      !caseDotsVisible ||
      !simId ||
      selectedTimestep === null ||
      dotsBundleReady
    ) {
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
  }, [
    caseDotsVisible,
    heatmapMode,
    loadPeopleMapData,
    selectedTimestep,
    simId,
    dotsBundleReady
  ]);

  const selectedPeopleMapData = useMemo(() => {
    if (
      heatmapMode !== 'people' ||
      !caseDotsVisible ||
      !simId ||
      selectedTimestep === null
    ) {
      return null;
    }

    // Whole-run bundle loaded: synthesize the frame locally (zero network).
    if (
      dotsBundleReady &&
      dotsBundleSimId.current === simId &&
      dotsBundleRef.current
    ) {
      return synthesizeFromBundle(dotsBundleRef.current, selectedTimestep);
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
  }, [
    caseDotsVisible,
    heatmapMode,
    peopleMapData,
    selectedTimestep,
    simId,
    dotsBundleReady
  ]);

  useEffect(() => {
    if (
      heatmapMode !== 'people' ||
      !caseDotsVisible ||
      !simId ||
      selectedTimestep === null ||
      availableTimesteps.length === 0 ||
      !selectedPeopleMapData ||
      dotsBundleReady // bundle path synthesizes locally — no prefetch needed
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

    let active = true;
    const preloadUpcoming = async () => {
      if (!active) return;
      // Warm the cache for upcoming frames concurrently so the playback buffer
      // (MAX_BUFFER_HOLDS) stops stalling on serial ~0.4-1.7s fetches.
      await Promise.all(
        upcomingTimesteps.map((timestep) =>
          loadPeopleMapData(timestep).catch((error) => {
            console.warn('Failed to preload person-level map data:', error);
          })
        )
      );
    };

    preloadUpcoming();
    return () => {
      active = false;
    };
  }, [
    availableTimesteps,
    caseDotsVisible,
    heatmapMode,
    loadPeopleMapData,
    selectedPeopleMapData,
    selectedTimestep,
    simId,
    dotsBundleReady
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
        const nextTimestep = availableTimesteps[nextIndex];
        // Buffer like a video player: when the Cases dots are showing, don't
        // advance to a frame whose per-person data hasn't loaded yet. The
        // /people-map fetch (~0.4-1.7s) is slower than PLAYBACK_INTERVAL_MS, so
        // advancing eagerly blanks the dots ("Loading cases..."). Holding on the
        // current (already-loaded) frame keeps the dots on screen until the next
        // frame is cached.
        const nextFrameReady =
          heatmapMode !== 'people' ||
          !caseDotsVisible ||
          !simId ||
          dotsBundleReady || // bundle path: every frame is synthesized instantly
          peopleMapError !== null ||
          peopleMapCache.current.has(getPeopleMapCacheKey(simId, nextTimestep));
        if (!nextFrameReady && bufferHoldsRef.current < MAX_BUFFER_HOLDS) {
          bufferHoldsRef.current += 1;
          return prev;
        }
        bufferHoldsRef.current = 0;
        return nextTimestep / 60;
      });
    }, PLAYBACK_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [
    isPlaying,
    availableTimesteps,
    heatmapMode,
    caseDotsVisible,
    simId,
    peopleMapError,
    dotsBundleReady
  ]);

  const peopleMapLoading =
    heatmapMode === 'people' &&
    caseDotsVisible &&
    !!simId &&
    selectedTimestep !== null &&
    !selectedPeopleMapData &&
    !peopleMapError;

  const peopleDotColor = heatmapMode === 'infection' ? '#dc2626' : '#2563eb';

  const peopleDotGeoJSON = useMemo<PeopleDotFeatureCollection>(() => {
    if (peopleMapLoading) {
      return makePeopleDotGeoJSON(pois, 'population');
    }
    if (heatmapMode !== 'population' && heatmapMode !== 'infection') {
      return { type: 'FeatureCollection', features: [] };
    }
    return makePeopleDotGeoJSON(pois, heatmapMode);
  }, [pois, heatmapMode, peopleMapLoading]);

  const personStatusDotGeoJSON = useMemo<PersonStatusDotFeatureCollection>(
    () =>
      heatmapMode === 'people' && caseDotsVisible
        ? makePersonStatusDotGeoJSON(stableDotPois, selectedPeopleMapData)
        : { type: 'FeatureCollection', features: [] },
    [caseDotsVisible, heatmapMode, selectedPeopleMapData, stableDotPois]
  );

  useEffect(() => {
    setMaxHours(
      availableTimesteps.length > 0 ? Math.max(...availableTimesteps) / 60 : 1
    );
  }, [availableTimesteps]);

  useEffect(() => {
    if (availableTimesteps.length === 0 || maxHours <= 1) return;
    setCurrentTime((prev) => {
      if (!Number.isFinite(prev)) return 1;
      return Math.min(Math.max(prev, 1), maxHours);
    });
  }, [availableTimesteps.length, maxHours]);

  return (
    <div className="modelmap_panel" ref={panelRef}>
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
          {caseDotsVisible && (
            <span className="people-map-key-item">
              <span className="people-map-swatch people-map-swatch-blue" />
              Uninfected
            </span>
          )}
          <span className="people-map-key-item">
            <span className="people-map-swatch people-map-swatch-red" />
            Infected
          </span>
          {caseDotsVisible && (
            <span className="people-map-key-item">
              <span className="people-map-swatch people-map-swatch-recovered" />
              Recovered
            </span>
          )}
          {disabledPoiIds && disabledPoiIds.size > 0 && (
            <span className="people-map-key-item">
              <span className="people-map-swatch people-map-swatch-disabled" />
              Disabled
            </span>
          )}
          {selectedPeopleMapData && selectedPeopleMapData.sample_rate > 1 && (
            <span className="people-map-key-note">
              sampled 1 in {selectedPeopleMapData.sample_rate}
            </span>
          )}
          {selectedPeopleMapData?.source === 'aggregate' && (
            <span className="people-map-key-note">aggregate cases</span>
          )}
          {peopleMapError && (
            <span className="people-map-key-note">{peopleMapError}</span>
          )}
          {mapFrameError && (
            <span className="people-map-key-note">{mapFrameError}</span>
          )}
          {peopleMapLoading && (
            <span className="people-map-key-note">Loading cases...</span>
          )}
        </div>
      )}
      <ClusteredMap
        currentTime={currentTime}
        mapCenter={mapCenter}
        pois={pois}
        stablePois={stableDotPois}
        zoneGeoJSON={zoneGeoJSON}
        hotspots={hotspots as Record<string, number[]>}
        onMarkerClick={onMarkerClick}
        heatmapMode={heatmapMode}
        peopleDotGeoJSON={peopleDotGeoJSON}
        peopleDotColor={peopleDotColor}
        personStatusDotGeoJSON={personStatusDotGeoJSON}
        onCaseDotsVisibilityChange={setCaseDotsVisible}
        focusPoi={focusPoi}
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
