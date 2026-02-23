import { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { MapContainer, TileLayer, Marker, Popup, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import { ALG_URL, DB_URL } from "../env";
import axios from 'axios';
import useAuth from "../stores/auth";

import zip_cbg_json from '../data/zip_to_cbg.json';

import 'leaflet/dist/leaflet.css';
import './cz-generation.css';

const CLUSTER_ALGORITHM_OPTIONS = [
  { value: 'czi_balanced', label: 'Balanced CZI (Recommended)' },
  { value: 'czi_optimal_cap', label: 'CZI Optimal (MILP, Beta)' },
  { value: 'greedy_fast', label: 'Greedy Fast (Legacy)' },
  { value: 'greedy_weight', label: 'Greedy Weight (Legacy)' },
  { value: 'greedy_ratio', label: 'Greedy Ratio (Legacy)' },
];

const TRACE_LOW_COLOR = '#fde68a';
const TRACE_HIGH_COLOR = '#dc2626';
const EMPTY_LIST = [];

function normalizeCbgId(cbgId) {
  if (cbgId === null || cbgId === undefined) return '';
  const raw = String(cbgId).trim();
  if (!raw) return '';
  if (/^\d+$/.test(raw)) {
    if (raw.length === 11) {
      return raw.padStart(12, '0');
    }
    return raw;
  }
  return raw;
}

function getFeatureCbgId(feature) {
  return normalizeCbgId(feature?.properties?.GEOID || feature?.properties?.CensusBlockGroup);
}

function mergeGeoJsonFeatures(baseGeoJson, extraGeoJson) {
  if (!baseGeoJson && !extraGeoJson) return null;
  if (!baseGeoJson) return extraGeoJson;
  if (!extraGeoJson) return baseGeoJson;

  const merged = [];
  const seen = new Set();

  const appendFeatures = (collection) => {
    if (!collection || !Array.isArray(collection.features)) return;
    for (const feature of collection.features) {
      const cbgId = getFeatureCbgId(feature);
      if (!cbgId || seen.has(cbgId)) continue;
      seen.add(cbgId);
      merged.push(feature);
    }
  };

  appendFeatures(baseGeoJson);
  appendFeatures(extraGeoJson);

  return {
    type: 'FeatureCollection',
    features: merged,
  };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function hexToRgb(hex) {
  const cleaned = String(hex).replace('#', '');
  const expanded = cleaned.length === 3
    ? cleaned.split('').map((char) => char + char).join('')
    : cleaned;
  const intVal = parseInt(expanded, 16);
  return {
    r: (intVal >> 16) & 255,
    g: (intVal >> 8) & 255,
    b: intVal & 255,
  };
}

function rgbToHex({ r, g, b }) {
  const toHex = (component) => component.toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function interpolateHexColor(startHex, endHex, t) {
  const start = hexToRgb(startHex);
  const end = hexToRgb(endHex);
  const ratio = clamp(Number.isFinite(t) ? t : 0, 0, 1);

  return rgbToHex({
    r: Math.round(start.r + (end.r - start.r) * ratio),
    g: Math.round(start.g + (end.g - start.g) * ratio),
    b: Math.round(start.b + (end.b - start.b) * ratio),
  });
}

function InteractiveMap({ onLocationSelect, disabled }) {
  const [ markerPosition, setMarkerPosition ] = useState(null);

  function LocationMarker() {
    useMapEvents({
      click(e) {
        if (disabled) {
          return;
        }

        setMarkerPosition(e.latlng);
        const coords = `${e.latlng.lat.toFixed(4)}, ${e.latlng.lng.toFixed(4)}`;
        onLocationSelect(coords);
      }
    });

    return markerPosition === null ? null : (
      <Marker position={markerPosition}>
        <Popup>
          Selected Location: {markerPosition.lat.toFixed(4)}, {markerPosition.lng.toFixed(4)}
        </Popup>
      </Marker>
    );
  }

  return (
    <MapContainer
      center={[39.3290708, -76.6219753]}
      zoom={10}
      style={{ height: '100%', width: '100%'}}
    >
      <TileLayer
        attribution='&copy; OpenStreetMap contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      <LocationMarker />
    </MapContainer>
  );
}

// Static CBG Map component for viewing and editing CBGs after generation
function CBGMap({
  cbgData,
  center,
  onCBGClick,
  onMapBackgroundClick,
  onTraceCbgInspect,
  selectedCBGs,
  traceLayer,
  editingEnabled = true,
  focusedCbgId,
  focusNonce = 0
}) {
  const geoJsonLayerRef = useRef(null);
  const layersRef = useRef(new Map()); // Map of cbgId -> layer
  const selectedRef = useRef(selectedCBGs); // Keep ref to avoid stale closures
  const traceLayerRef = useRef(traceLayer);
  const focusedRef = useRef(normalizeCbgId(focusedCbgId));
  const hasFittedRef = useRef(false);

  // Update refs when state changes
  useEffect(() => {
    selectedRef.current = selectedCBGs;
  }, [selectedCBGs]);

  useEffect(() => {
    traceLayerRef.current = traceLayer;
  }, [traceLayer]);

  useEffect(() => {
    focusedRef.current = normalizeCbgId(focusedCbgId);
  }, [focusedCbgId]);

  const focusCbgOnMap = (map, cbgId) => {
    const normalized = normalizeCbgId(cbgId);
    if (!normalized) return;
    const layer = layersRef.current.get(normalized);
    if (!layer) return;

    try {
      const bounds = layer.getBounds?.();
      if (bounds && bounds.isValid()) {
        map.fitBounds(bounds, { padding: [30, 30], maxZoom: 13 });
      }
      if (layer.bringToFront) {
        layer.bringToFront();
      }
    } catch {
      // No-op: focusing is a UX enhancement and should not break map rendering.
    }
  };

  const getCandidateHeatColor = (score) => {
    const layer = traceLayerRef.current;
    if (!layer) return TRACE_LOW_COLOR;
    const min = Number(layer.minScore);
    const max = Number(layer.maxScore);
    const hasRange = Number.isFinite(min) && Number.isFinite(max) && max > min;
    const normalized = hasRange ? (Number(score) - min) / (max - min) : 1;
    return interpolateHexColor(TRACE_LOW_COLOR, TRACE_HIGH_COLOR, normalized);
  };

  const getStyleForCbg = (rawCbgId) => {
    const cbgId = normalizeCbgId(rawCbgId);
    const activeTrace = traceLayerRef.current;
    const isFocused = focusedRef.current && focusedRef.current === cbgId;
    const applyFocusedBorder = (style) => {
      if (!isFocused) {
        return {
          ...style,
          dashArray: null,
        };
      }
      return {
        ...style,
        color: '#0f172a',
        weight: Math.max((style.weight ?? 1) + 1.75, 4),
        opacity: 1,
        dashArray: null,
      };
    };

    if (activeTrace) {
      if (activeTrace.clusterSet?.has(cbgId)) {
        return applyFocusedBorder({
          fillColor: '#1d4ed8',
          weight: 2.25,
          opacity: 1,
          color: '#1e3a8a',
          fillOpacity: 0.74,
        });
      }

      if (activeTrace.selectedCbg === cbgId) {
        return applyFocusedBorder({
          fillColor: '#f97316',
          weight: 3,
          opacity: 1,
          color: '#9a3412',
          fillOpacity: 0.85,
        });
      }

      const candidate = activeTrace.candidateByCbg?.get(cbgId);
      if (candidate) {
        return applyFocusedBorder({
          fillColor: getCandidateHeatColor(candidate.score),
          weight: 2,
          opacity: 1,
          color: '#7c2d12',
          fillOpacity: 0.75,
        });
      }

      return applyFocusedBorder({
        fillColor: '#d1d5db',
        weight: 1.25,
        opacity: 1,
        color: '#9ca3af',
        fillOpacity: 0.12,
      });
    }

    const isSelected = selectedRef.current?.includes(cbgId);
    return applyFocusedBorder({
      fillColor: isSelected ? '#70B4D4' : '#BDBDBD',
      weight: isSelected ? 2 : 1.25,
      opacity: 1,
      color: isSelected ? '#1f2937' : '#6b7280',
      fillOpacity: isSelected ? 0.6 : 0.2,
    });
  };

  // Update layer styles when selection/trace changes (without remounting)
  useEffect(() => {
    layersRef.current.forEach((layer, cbgId) => {
      layer.setStyle(getStyleForCbg(cbgId));
    });
  }, [selectedCBGs, traceLayer, focusedCbgId]);

  // Component that adds GeoJSON to map
  function GeoJSONLayer() {
    const map = useMap();

    useEffect(() => {
      if (!cbgData) return;

      // Clear previous layer
      if (geoJsonLayerRef.current) {
        map.removeLayer(geoJsonLayerRef.current);
        layersRef.current.clear();
      }

      // Create new GeoJSON layer
      const geoJsonLayer = L.geoJSON(cbgData, {
        style: (feature) => {
          const cbgId = getFeatureCbgId(feature);
          return getStyleForCbg(cbgId);
        },
        onEachFeature: (feature, layer) => {
          const cbgId = getFeatureCbgId(feature);

          // Store layer reference
          layersRef.current.set(cbgId, layer);

          layer.on({
            click: (e) => {
              L.DomEvent.stopPropagation(e);
              if (traceLayerRef.current && onTraceCbgInspect) {
                onTraceCbgInspect(cbgId, feature.properties);
                return;
              }
              if (!editingEnabled) {
                return;
              }
              if (onCBGClick) {
                onCBGClick(cbgId, feature.properties);
              }
            },
            mouseover: (e) => {
              const baseStyle = getStyleForCbg(cbgId);
              e.target.setStyle({
                weight: Math.max(baseStyle.weight + 0.75, 2.75),
                fillOpacity: Math.min((baseStyle.fillOpacity ?? 0.2) + 0.15, 0.95),
              });
            },
            mouseout: (e) => {
              e.target.setStyle(getStyleForCbg(cbgId));
            }
          });
        }
      });

      geoJsonLayer.addTo(map);
      geoJsonLayerRef.current = geoJsonLayer;

      // Fit bounds only once
      if (!hasFittedRef.current) {
        const bounds = geoJsonLayer.getBounds();
        if (bounds.isValid()) {
          map.invalidateSize();
          map.fitBounds(bounds, { padding: [20, 20], maxZoom: 12 });
          hasFittedRef.current = true;
        }
      }

      if (focusedCbgId) {
        focusCbgOnMap(map, focusedCbgId);
      }

      return () => {
        if (geoJsonLayerRef.current) {
          map.removeLayer(geoJsonLayerRef.current);
        }
      };
    }, [map, cbgData, editingEnabled]);

    return null;
  }

  function FocusController() {
    const map = useMap();

    useEffect(() => {
      if (!focusedCbgId) return;
      focusCbgOnMap(map, focusedCbgId);
    }, [map, focusedCbgId, focusNonce]);

    return null;
  }

  function BackgroundClickLayer() {
    useMapEvents({
      click(e) {
        if (!editingEnabled) {
          return;
        }
        if (onMapBackgroundClick) {
          onMapBackgroundClick(e.latlng);
        }
      }
    });

    return null;
  }

  return (
    <MapContainer
      center={center || [39.3290708, -76.6219753]}
      zoom={12}
      style={{ height: '100%', width: '100%' }}
    >
      <TileLayer
        attribution='&copy; OpenStreetMap contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <BackgroundClickLayer />
      <FocusController />
      <GeoJSONLayer />
    </MapContainer>
  );
}

function FormField({
  label,
  name,
  type,
  placeholder,
  defaultValue,
  disabled,
  value,
  onChange,
  min,
  max,
  options,
  required = true
}) {
  return (
    <div className='flex flex-col gap-0.5'>
      <label htmlFor={name}>{label}</label>
      {type === 'textarea' ? (
        <textarea
          className='formfield'
          name={name}
          id={name}
          type={type}
          placeholder={placeholder}
          disabled={disabled}
          value={value}
          onChange={onChange}
          required={required}
        />
      ) : type === 'select' ? (
        <select
          className='formfield'
          name={name}
          id={name}
          disabled={disabled}
          value={value}
          onChange={onChange}
          required={required}
        >
          {options?.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ): (
        <input
          className='formfield'
          name={name}
          id={name}
          type={type}
          placeholder={placeholder}
          defaultValue={defaultValue}
          disabled={disabled}
          value={value}
          onChange={onChange}
          min={min}
          max={max}
          required={required}
        />
      )}
    </div>
  );
}

export default function CZGeneration() {
  const navigate = useNavigate();
  const user = useAuth((state) => state.user);
  const isResolvingMapClickRef = useRef(false);

  const [ location, setLocation ] = useState('');
  const [ minPop, setMinPop ] = useState(5000);
  const [ clusterAlgorithm, setClusterAlgorithm ] = useState('czi_balanced');
  const [ showAdvancedClustering, setShowAdvancedClustering ] = useState(false);
  const [ distancePenaltyWeight, setDistancePenaltyWeight ] = useState(0.02);
  const [ distanceScaleKm, setDistanceScaleKm ] = useState(20);
  const [ optimalClusteringParams, setOptimalClusteringParams ] = useState(null);
  const [ startDate, setStartDate ] = useState('2019-01-01');  // Default to 2019 (pattern files are from 2019)
  const [ endDate, setEndDate ] = useState('2019-01-15');      // Default 2 weeks
  const [ description, setDescription ] = useState('');
  const [ loading, setLoading ] = useState(false);
  
  // Two-phase state
  const [ phase, setPhase ] = useState('input'); // 'input' | 'edit' | 'finalizing'
  const [ cbgGeoJSON, setCbgGeoJSON ] = useState(null);
  const [ selectedCBGs, setSelectedCBGs ] = useState([]);
  const [ seedCBG, setSeedCBG ] = useState('');
  const [ useTestData, setUseTestData ] = useState(false);
  const [ mapCenter, setMapCenter ] = useState(null);
  const [ cityName, setCityName ] = useState('');
  const [ growthTrace, setGrowthTrace ] = useState(null);
  const [ traceEnabled, setTraceEnabled ] = useState(false);
  const [ traceStepIndex, setTraceStepIndex ] = useState(0);
  const [ selectedTraceCandidateCbg, setSelectedTraceCandidateCbg ] = useState('');
  const [ focusedTraceCbg, setFocusedTraceCbg ] = useState('');
  const [ focusedTraceNonce, setFocusedTraceNonce ] = useState(0);
  const [ resolvedFocusedTraceCbg, setResolvedFocusedTraceCbg ] = useState('');
  const [ mapFocusWarning, setMapFocusWarning ] = useState('');
  const [ candidatePois, setCandidatePois ] = useState([]);
  const [ candidatePoiLoading, setCandidatePoiLoading ] = useState(false);
  const [ candidatePoiError, setCandidatePoiError ] = useState('');
  const [ zoneEditMode, setZoneEditMode ] = useState(false);
  const [ manualFrontierCandidates, setManualFrontierCandidates ] = useState([]);
  const [ manualFrontierLoading, setManualFrontierLoading ] = useState(false);
  const [ manualFrontierError, setManualFrontierError ] = useState('');
  const [ zoneMetrics, setZoneMetrics ] = useState(null);
  const [ zoneMetricsLoading, setZoneMetricsLoading ] = useState(false);
  const [ zoneMetricsError, setZoneMetricsError ] = useState('');
  const attemptedTraceGeoJsonFetchRef = useRef(new Set());
  const editViewportHeightClass = 'h-[calc(100vh-13rem)] min-h-[34rem] max-h-[48rem]';
  const setupViewportHeightClass = 'h-[calc(100vh-18rem)] min-h-[30rem] max-h-[44rem]';

  // Derived state
  const hasGenerated = phase === 'edit';
  const isFinalizing = phase === 'finalizing';

  if (!user) {
    navigate('/simulator');
  }
  const traceSteps = growthTrace?.steps ?? [];
  const maxTraceStep = traceSteps.length > 0 ? traceSteps.length - 1 : 0;
  const activeTraceStep = traceSteps[Math.min(traceStepIndex, maxTraceStep)] ?? null;
  const activeTraceCandidates = Array.isArray(activeTraceStep?.candidates)
    ? activeTraceStep.candidates
    : EMPTY_LIST;
  const selectedTraceCandidate = useMemo(
    () => activeTraceCandidates.find(
      (candidate) => normalizeCbgId(candidate?.cbg) === normalizeCbgId(selectedTraceCandidateCbg)
    ) || null,
    [activeTraceCandidates, selectedTraceCandidateCbg]
  );
  const selectedTraceFeatureProperties = useMemo(() => {
    if (!selectedTraceCandidateCbg || !Array.isArray(cbgGeoJSON?.features)) {
      return null;
    }
    const normalized = normalizeCbgId(selectedTraceCandidateCbg);
    const feature = cbgGeoJSON.features.find(
      (item) => getFeatureCbgId(item) === normalized
    );
    return feature?.properties || null;
  }, [cbgGeoJSON, selectedTraceCandidateCbg]);
  const traceLayer = useMemo(() => {
    if (!traceEnabled || !activeTraceStep) {
      return null;
    }

    const clusterSet = new Set(
      Array.isArray(activeTraceStep.cluster_before)
        ? activeTraceStep.cluster_before.map((cbg) => normalizeCbgId(cbg))
        : []
    );

    const candidateByCbg = new Map();
    let minScore = Infinity;
    let maxScore = -Infinity;
    for (const candidate of (activeTraceStep.candidates || [])) {
      const cbgId = normalizeCbgId(candidate?.cbg);
      if (!cbgId) continue;
      const score = Number(candidate?.score ?? 0);
      if (Number.isFinite(score)) {
        minScore = Math.min(minScore, score);
        maxScore = Math.max(maxScore, score);
      }
      candidateByCbg.set(cbgId, { ...candidate, score });
    }

    const hasScoreRange = Number.isFinite(minScore) && Number.isFinite(maxScore);
    return {
      clusterSet,
      candidateByCbg,
      selectedCbg: normalizeCbgId(activeTraceStep.selected_cbg),
      minScore: hasScoreRange ? minScore : 0,
      maxScore: hasScoreRange ? maxScore : 1,
    };
  }, [traceEnabled, activeTraceStep]);
  const manualEditPanelsActive = hasGenerated && (!growthTrace || zoneEditMode);
  const showCandidatePanels = Boolean(traceLayer) || manualEditPanelsActive;
  const displayCandidates = traceLayer
    ? activeTraceCandidates
    : manualEditPanelsActive
      ? manualFrontierCandidates
      : EMPTY_LIST;
  const selectedManualCandidate = useMemo(
    () => manualFrontierCandidates.find(
      (candidate) => normalizeCbgId(candidate?.cbg) === normalizeCbgId(selectedTraceCandidateCbg)
    ) || null,
    [manualFrontierCandidates, selectedTraceCandidateCbg]
  );
  const selectedAnalysisCandidate = traceLayer ? selectedTraceCandidate : selectedManualCandidate;
  const selectedTraceStatus = (() => {
    const normalized = normalizeCbgId(selectedTraceCandidateCbg);
    if (!normalized || !traceLayer) {
      return 'N/A';
    }
    if (traceLayer.clusterSet?.has(normalized)) {
      return 'Current Cluster';
    }
    if (selectedTraceCandidate) {
      return selectedTraceCandidate.selected ? 'Selected Next Candidate' : 'Frontier Candidate';
    }
    return 'Outside Current Frontier';
  })();
  const selectedManualStatus = (() => {
    const normalized = normalizeCbgId(selectedTraceCandidateCbg);
    if (!normalized || !manualEditPanelsActive) {
      return 'N/A';
    }
    if (selectedCBGs.includes(normalized)) {
      return 'Current Cluster';
    }
    if (selectedManualCandidate) {
      return 'Frontier Candidate';
    }
    return 'Outside Current Frontier';
  })();
  const selectedAnalysisStatus = traceLayer ? selectedTraceStatus : selectedManualStatus;
  const activeMapTraceLayer = zoneEditMode ? null : traceLayer;
  const showTraceControls = Boolean(growthTrace) && !zoneEditMode;

  useEffect(() => {
    if (traceStepIndex > maxTraceStep) {
      setTraceStepIndex(maxTraceStep);
    }
  }, [traceStepIndex, maxTraceStep]);

  useEffect(() => {
    if (!traceSteps.length) {
      setTraceEnabled(false);
    }
  }, [traceSteps.length]);

  useEffect(() => {
    if (!traceEnabled || !activeTraceStep) {
      if (!manualEditPanelsActive) {
        setSelectedTraceCandidateCbg('');
        setFocusedTraceCbg('');
        setResolvedFocusedTraceCbg('');
        setMapFocusWarning('');
        setCandidatePois([]);
        setCandidatePoiError('');
        setCandidatePoiLoading(false);
      }
      return;
    }

    const defaultCandidateCbg = normalizeCbgId(
      activeTraceStep.selected_cbg || activeTraceStep.candidates?.[0]?.cbg || ''
    );
    setSelectedTraceCandidateCbg(defaultCandidateCbg);
    setFocusedTraceCbg(defaultCandidateCbg);
    setFocusedTraceNonce((prev) => prev + 1);
  }, [traceEnabled, activeTraceStep, manualEditPanelsActive]);

  useEffect(() => {
    if (!showCandidatePanels) {
      setResolvedFocusedTraceCbg('');
      setMapFocusWarning('');
      return;
    }

    const focused = normalizeCbgId(focusedTraceCbg);
    if (!focused) {
      setResolvedFocusedTraceCbg('');
      setMapFocusWarning('');
      return;
    }

    const featureExists = Array.isArray(cbgGeoJSON?.features) && cbgGeoJSON.features.some(
      (feature) => getFeatureCbgId(feature) === focused
    );
    if (featureExists) {
      setResolvedFocusedTraceCbg(focused);
      setMapFocusWarning('');
      return;
    }

    const nearestFallback = (() => {
      if (!Array.isArray(cbgGeoJSON?.features)) {
        return '';
      }

      const allIds = Array.from(new Set(
        cbgGeoJSON.features
          .map((feature) => getFeatureCbgId(feature))
          .filter(Boolean)
      ));
      if (!allIds.length) {
        return '';
      }

      const targetNum = Number.parseInt(focused, 10);
      const hasTargetNum = Number.isFinite(targetNum);
      const closestByNumericDistance = (ids) => {
        if (!ids.length) {
          return '';
        }
        if (!hasTargetNum) {
          return ids[0];
        }
        let bestId = ids[0];
        let bestDelta = Infinity;
        for (const id of ids) {
          const numericId = Number.parseInt(id, 10);
          if (!Number.isFinite(numericId)) {
            continue;
          }
          const delta = Math.abs(numericId - targetNum);
          if (delta < bestDelta) {
            bestDelta = delta;
            bestId = id;
          }
        }
        return bestId;
      };

      const prefixLengths = [11, 10, 9, 8, 7, 6, 5, 2];
      for (const prefixLen of prefixLengths) {
        const prefix = focused.slice(0, prefixLen);
        if (!prefix) {
          continue;
        }
        const matches = allIds.filter((id) => id.startsWith(prefix));
        if (matches.length) {
          return closestByNumericDistance(matches);
        }
      }

      return closestByNumericDistance(allIds);
    })();

    if (nearestFallback && nearestFallback !== focused) {
      setResolvedFocusedTraceCbg(nearestFallback);
      setMapFocusWarning(
        `CBG ${focused} is missing map geometry. Showing nearest available CBG (${nearestFallback}) on the map.`
      );
      return;
    }

    setResolvedFocusedTraceCbg('');
    setMapFocusWarning(
      `CBG ${focused} is missing map geometry, and no nearby fallback geometry was found.`
    );
  }, [showCandidatePanels, focusedTraceCbg, cbgGeoJSON]);

  useEffect(() => {
    if (!showCandidatePanels || !focusedTraceCbg || !Array.isArray(cbgGeoJSON?.features)) {
      return;
    }

    const normalized = normalizeCbgId(focusedTraceCbg);
    if (!normalized) {
      return;
    }

    const featureExists = cbgGeoJSON.features.some(
      (feature) => getFeatureCbgId(feature) === normalized
    );
    if (featureExists || attemptedTraceGeoJsonFetchRef.current.has(normalized)) {
      return;
    }

    attemptedTraceGeoJsonFetchRef.current.add(normalized);
    axios.get(`${ALG_URL}cbg-geojson`, {
      params: {
        cbgs: normalized,
        include_neighbors: 'false'
      }
    }).then((resp) => {
      if (resp.data?.features?.length) {
        setCbgGeoJSON((prev) => mergeGeoJsonFeatures(prev, resp.data));
      }
    }).catch((err) => {
      console.warn(`Failed to load GeoJSON for focused trace CBG ${normalized}:`, err);
    });
  }, [showCandidatePanels, focusedTraceCbg, cbgGeoJSON]);

  useEffect(() => {
    if (!showCandidatePanels || !selectedTraceCandidateCbg) {
      return;
    }

    const poiCluster = traceLayer
      ? (Array.isArray(activeTraceStep?.cluster_before) ? activeTraceStep.cluster_before : [])
      : selectedCBGs;
    if (!poiCluster.length) {
      setCandidatePois([]);
      setCandidatePoiError('');
      return;
    }

    let cancelled = false;
    setCandidatePoiLoading(true);
    setCandidatePoiError('');

    axios.post(`${ALG_URL}candidate-pois`, {
      seed_cbg: seedCBG,
      candidate_cbg: selectedTraceCandidateCbg,
      cluster_cbgs: poiCluster,
      start_date: startDate,
      use_test_data: useTestData,
      limit: 8,
    }).then((resp) => {
      if (cancelled) return;
      setCandidatePois(resp?.data?.pois || []);
    }).catch((err) => {
      if (cancelled) return;
      setCandidatePois([]);
      setCandidatePoiError(err?.response?.data?.message || 'Failed to load POI analysis.');
    }).finally(() => {
      if (cancelled) return;
      setCandidatePoiLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [
    showCandidatePanels,
    traceLayer,
    activeTraceStep,
    selectedTraceCandidateCbg,
    selectedCBGs,
    seedCBG,
    startDate,
    useTestData
  ]);

  useEffect(() => {
    if (!manualEditPanelsActive || !seedCBG || !selectedCBGs.length) {
      setManualFrontierCandidates([]);
      setManualFrontierError('');
      setManualFrontierLoading(false);
      return;
    }

    let cancelled = false;
    setManualFrontierLoading(true);
    setManualFrontierError('');

    const req = {
      seed_cbg: seedCBG,
      cbg_list: selectedCBGs,
      algorithm: clusterAlgorithm,
      min_pop: Number(minPop),
      start_date: startDate,
      use_test_data: useTestData,
      limit: 2000,
    };
    if (clusterAlgorithm === 'czi_balanced') {
      const weight = Number(distancePenaltyWeight);
      const scale = Number(distanceScaleKm);
      if (Number.isFinite(weight)) {
        req.distance_penalty_weight = weight;
      }
      if (Number.isFinite(scale)) {
        req.distance_scale_km = scale;
      }
    }

    axios.post(`${ALG_URL}frontier-candidates`, req).then((resp) => {
      if (cancelled) return;
      const nextCandidates = Array.isArray(resp?.data?.candidates) ? resp.data.candidates : [];
      setManualFrontierCandidates(nextCandidates);

      const selectedNow = normalizeCbgId(selectedTraceCandidateCbg);
      const selectedStillValid =
        (selectedNow && selectedCBGs.includes(selectedNow)) ||
        nextCandidates.some((candidate) => normalizeCbgId(candidate?.cbg) === selectedNow);

      if (!selectedStillValid) {
        const fallbackCbg = normalizeCbgId(nextCandidates[0]?.cbg || selectedCBGs[0] || '');
        setSelectedTraceCandidateCbg(fallbackCbg);
        setFocusedTraceCbg(fallbackCbg);
        if (fallbackCbg) {
          setFocusedTraceNonce((prev) => prev + 1);
        }
      }
    }).catch((err) => {
      if (cancelled) return;
      setManualFrontierCandidates([]);
      setManualFrontierError(err?.response?.data?.message || 'Failed to load frontier candidates.');
    }).finally(() => {
      if (cancelled) return;
      setManualFrontierLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [
    manualEditPanelsActive,
    seedCBG,
    selectedCBGs,
    clusterAlgorithm,
    minPop,
    startDate,
    useTestData,
    distancePenaltyWeight,
    distanceScaleKm
  ]);

  useEffect(() => {
    if (!manualEditPanelsActive || !seedCBG || !selectedCBGs.length) {
      setZoneMetrics(null);
      setZoneMetricsError('');
      setZoneMetricsLoading(false);
      return;
    }

    let cancelled = false;
    setZoneMetricsLoading(true);
    setZoneMetricsError('');

    axios.post(`${ALG_URL}cz-metrics`, {
      seed_cbg: seedCBG,
      cbg_list: selectedCBGs,
      use_test_data: useTestData,
    }).then((resp) => {
      if (cancelled) return;
      setZoneMetrics(resp?.data || null);
    }).catch((err) => {
      if (cancelled) return;
      setZoneMetrics(null);
      setZoneMetricsError(err?.response?.data?.message || 'Failed to compute zone metrics.');
    }).finally(() => {
      if (cancelled) return;
      setZoneMetricsLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [manualEditPanelsActive, seedCBG, selectedCBGs, useTestData]);

  // Finalize CZ - create DB record and generate patterns with the final CBG list
  const finalizeCZ = async () => {
    if (selectedCBGs.length === 0) {
      alert('Please select at least one CBG');
      return;
    }
    
    setPhase('finalizing');
    try {
      const start = new Date(startDate);
      const end = new Date(endDate);
      const lengthHours = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60));
      const trimmedDescription = String(description ?? '').trim();
      const now = new Date();
      const algorithmLabel = CLUSTER_ALGORITHM_OPTIONS.find(
        (option) => option.value === clusterAlgorithm
      )?.label || clusterAlgorithm;

      const generatedDescription = [
        `Auto-generated on ${now.toLocaleString()}`,
        `Location: ${cityName || location || 'N/A'}`,
        `Seed CBG: ${seedCBG || 'N/A'}`,
        `Algorithm: ${algorithmLabel}`,
        `Minimum population: ${Number(minPop || 0).toLocaleString()}`,
        `Date range: ${startDate} to ${endDate}`,
        `CBGs in zone: ${selectedCBGs.length}`,
        `Test data mode: ${useTestData ? 'Yes' : 'No'}`,
      ];

      if (clusterAlgorithm === 'czi_balanced') {
        generatedDescription.push(
          `Distance penalty weight: ${distancePenaltyWeight}`,
          `Distance scale (km): ${distanceScaleKm}`
        );
      }

      if (clusterAlgorithm === 'czi_optimal_cap' && optimalClusteringParams) {
        generatedDescription.push(
          `Optimal clustering params: ${JSON.stringify(optimalClusteringParams)}`
        );
      }

      const descriptionToSave = trimmedDescription || generatedDescription.join('\n');
      if (!trimmedDescription) {
        setDescription(descriptionToSave);
      }
      
      console.log('Finalizing CZ with CBGs:', selectedCBGs);
      const resp = await axios.post(`${ALG_URL}finalize-cz`, {
        name: cityName,
        description: descriptionToSave,
        cbg_list: selectedCBGs,
        start_date: start.toISOString(),
        length: lengthHours,
        latitude: mapCenter?.[0] || 0,
        longitude: mapCenter?.[1] || 0,
        user_id: user.id,
        use_test_data: useTestData
      });
      
      if (resp.status === 200 && resp.data?.id) {
        console.log('CZ finalized with ID:', resp.data.id);
        navigate('/simulator');
      } else {
        throw new Error('Failed to finalize CZ');
      }
    } catch (err) {
      console.error('Error finalizing CZ:', err);
      alert(err?.response?.data?.message || 'Failed to create convenience zone. Please try again.');
      setPhase('edit'); // Go back to edit phase
    }
  };

  // Handle CBG click to toggle selection
  const handleCBGClick = async (cbgId, properties) => {
    const normalized = normalizeCbgId(cbgId);
    if (normalized) {
      setSelectedTraceCandidateCbg(normalized);
      setFocusedTraceCbg(normalized);
      setFocusedTraceNonce((prev) => prev + 1);
    }

    const wasInCluster = selectedCBGs.includes(cbgId);
    
    if (wasInCluster) {
      // Remove CBG from selection
      setSelectedCBGs(prev => prev.filter(id => id !== cbgId));
    } else {
      // Add CBG to selection
      setSelectedCBGs(prev => [...prev, cbgId]);
      
      // If this was a border CBG (not originally in cluster), fetch its neighbors
      if (!properties.in_cluster) {
        try {
          // Fetch neighbors for the newly added CBG
          const resp = await axios.get(`${ALG_URL}cbg-geojson`, {
            params: {
              cbgs: cbgId,
              include_neighbors: 'true'
            }
          });
          
          if (resp.data?.features) {
            setCbgGeoJSON((prev) => mergeGeoJsonFeatures(prev, resp.data));
          }
        } catch (err) {
          console.warn('Failed to fetch neighbors for newly added CBG:', err);
          // Non-critical - the CBG is still added, just no new neighbors shown
        }
      }
    }
  };

  const handleTraceCbgInspect = (cbgId) => {
    const normalized = normalizeCbgId(cbgId);
    if (!normalized) {
      return;
    }
    setSelectedTraceCandidateCbg(normalized);
    setFocusedTraceCbg(normalized);
    setFocusedTraceNonce((prev) => prev + 1);
  };

  const jumpToTraceStep = (targetIndex) => {
    const clamped = Math.max(0, Math.min(maxTraceStep, targetIndex));
    setTraceStepIndex(clamped);

    const step = traceSteps[clamped];
    if (!step) {
      return;
    }

    const defaultCandidateCbg = normalizeCbgId(
      step.selected_cbg || step.candidates?.[0]?.cbg || ''
    );
    if (!defaultCandidateCbg) {
      return;
    }

    setSelectedTraceCandidateCbg(defaultCandidateCbg);
    setFocusedTraceCbg(defaultCandidateCbg);
    setFocusedTraceNonce((prev) => prev + 1);
  };

  const handleMapBackgroundClick = async (latlng) => {
    if (!latlng || isResolvingMapClickRef.current) {
      return;
    }

    const stateHint = String(selectedCBGs?.[0] ?? '').slice(0, 2);
    if (!stateHint) {
      return;
    }

    isResolvingMapClickRef.current = true;
    try {
      const resp = await axios.get(`${ALG_URL}cbg-at-point`, {
        params: {
          latitude: latlng.lat,
          longitude: latlng.lng,
          state_fips: stateHint
        }
      });

      const clickedCbg = resp.data?.cbg;
      if (!clickedCbg || selectedCBGs.includes(clickedCbg)) {
        return;
      }

      await handleCBGClick(clickedCbg, {
        population: resp.data?.population || 0,
        in_cluster: false
      });
    } catch (err) {
      if (err?.response?.status !== 404) {
        console.warn('Failed to resolve clicked map location to CBG:', err);
      }
    } finally {
      isResolvingMapClickRef.current = false;
    }
  };

  const loc_lookup = async (location) => {
    const resp = await fetch(`${DB_URL}lookup-zip`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ location })
    });

    if (!resp.ok) {
      return null;
    }

    return await resp.json();
  };

  const zip_to_cbg = (location) => {
    const cbgs = zip_cbg_json[location];
    if (!Array.isArray(cbgs) || cbgs.length === 0) {
      return undefined;
    }

    // ZIPs can overlap multiple CBGs (and occasionally multiple counties).
    // Choose a stable "core" CBG by taking the most common county (state+county FIPS).
    const countyCounts = new Map();
    for (const cbg of cbgs) {
      if (typeof cbg !== 'string' || cbg.length < 5) continue;
      const county = cbg.slice(0, 5);
      countyCounts.set(county, (countyCounts.get(county) ?? 0) + 1);
    }

    let bestCounty = cbgs[0]?.slice(0, 5);
    let bestCount = -1;
    for (const [county, count] of countyCounts.entries()) {
      if (count > bestCount) {
        bestCounty = county;
        bestCount = count;
      }
    }

    return cbgs.find((cbg) => typeof cbg === 'string' && cbg.startsWith(bestCounty)) ?? cbgs[0];
  };

  const generateCZ = (formdata) => {
    const func_body = async (formdata) => {
      console.log(formdata);

      const rawLocationInput = String(formdata.get('location') ?? '').trim();
      const isTestMode = rawLocationInput.toUpperCase() === 'TEST';
      setUseTestData(isTestMode);
      const zipMatch = rawLocationInput.match(/^\d{5}(?:-\d{4})?$/);
      const userZip = zipMatch ? rawLocationInput.slice(0, 5) : null;

      // If user entered a valid ZIP, try to use it directly first
      let core_cbg = null;
      let location = null;
      let cityName = isTestMode ? 'TEST' : rawLocationInput;

      if (isTestMode) {
        // Backend will pick a seed CBG from data/TEST/test.csv if cbg is not supplied.
      } else if (userZip) {
        // User entered a ZIP code - try local lookup first (no Google API needed)
        core_cbg = zip_to_cbg(userZip);
        // Avoid external ZIP lookup noise/failures; ZIP-only input is sufficient for clustering.
        if (core_cbg) {
          cityName = rawLocationInput;
        }
      } else {
        // User entered a city/address - need Google API to resolve ZIP
        location = await loc_lookup(rawLocationInput);
        if (location?.['zip_code']) {
          core_cbg = zip_to_cbg(location['zip_code']);
          cityName = location['city'] ?? rawLocationInput;
        }
      }
  
      if (!isTestMode && !core_cbg) {
        console.error('Could not find location. Try entering a 5-digit ZIP code.');
        alert('Could not find location. Please try entering a 5-digit ZIP code (e.g., 21201 for Baltimore).');
        return;
      }
  
      // Phase 1: Just cluster CBGs (fast) - don't create DB record yet
      const clusterReq = {
        min_pop: +formdata.get('min_pop'),
        algorithm: clusterAlgorithm,
        start_date: formdata.get('start_date'),
        use_test_data: isTestMode
      };
      if (clusterAlgorithm === 'czi_balanced') {
        const weight = Number(distancePenaltyWeight);
        const scale = Number(distanceScaleKm);
        if (Number.isFinite(weight)) {
          clusterReq.distance_penalty_weight = weight;
        }
        if (Number.isFinite(scale)) {
          clusterReq.distance_scale_km = scale;
        }
      } else if (clusterAlgorithm === 'czi_optimal_cap') {
        // Keep defaults explicit for repeatability.
        clusterReq.optimal_candidate_limit = 120;
        clusterReq.optimal_population_floor_ratio = 0.9;
        clusterReq.optimal_mip_rel_gap = 0.02;
        clusterReq.optimal_time_limit_sec = 20;
        clusterReq.optimal_max_iters = 8;
      }
      if (core_cbg) {
        clusterReq.cbg = core_cbg;
      }
      const { status, data } = await axios.post(`${ALG_URL}cluster-cbgs`, clusterReq);

      if (status !== 200) {
        throw new Error('Status code mismatch');
      }

      if (!data?.cluster) {
        throw new Error('Invalid response (missing cluster)');
      }

      // Store cluster data for editing
      const cluster = data.cluster || [];
      setSelectedCBGs(cluster);
      setSeedCBG(data.seed_cbg || core_cbg || '');
      setMapCenter(data.center || null);
      if (data.algorithm) {
        setClusterAlgorithm(data.algorithm);
      }
      if (data.clustering_params && data.algorithm === 'czi_balanced') {
        const rawWeight = data.clustering_params.distance_penalty_weight;
        const rawScale = data.clustering_params.distance_scale_km;
        const nextWeight = Number(rawWeight);
        const nextScale = Number(rawScale);
        if (rawWeight !== null && rawWeight !== undefined && Number.isFinite(nextWeight)) {
          setDistancePenaltyWeight(nextWeight);
        }
        if (rawScale !== null && rawScale !== undefined && Number.isFinite(nextScale)) {
          setDistanceScaleKm(nextScale);
        }
        setOptimalClusteringParams(null);
      } else if (data.clustering_params && data.algorithm === 'czi_optimal_cap') {
        setOptimalClusteringParams(data.clustering_params);
      } else {
        setOptimalClusteringParams(null);
      }
      setCityName(cityName);
      setGrowthTrace(data.trace || null);
      setTraceStepIndex(0);
      setTraceEnabled(Boolean(data.trace?.steps?.length));
      setZoneEditMode(false);
      setManualFrontierCandidates([]);
      setManualFrontierError('');
      setZoneMetrics(null);
      setZoneMetricsError('');
      
      // GeoJSON is returned directly from cluster-cbgs
      if (data.geojson || data.trace_geojson) {
        setCbgGeoJSON(mergeGeoJsonFeatures(data.geojson, data.trace_geojson));
      }
      
      setPhase('edit');
    };

    if (loading) {
      return;
    }

    setLoading(true);
    func_body(formdata)
      .catch((err) => {
        console.error(err);
        alert(err?.response?.data?.message || 'Failed to cluster CBGs. Please try again.');
      })
      .finally(() => setLoading(false));
  }

  return (
    <div className='w-full flex justify-center px-2 py-2'>
      <form action={generateCZ} className='w-full max-w-[2200px] flex flex-col gap-4 items-center'>
        {hasGenerated ? (
          <div className='w-full flex flex-col gap-4'>
            <div className='flex gap-4 w-full flex-wrap 2xl:flex-nowrap'>
              <div className={`${editViewportHeightClass} relative flex-1 min-w-[44rem]`}>
                {cbgGeoJSON ? (
                  <CBGMap
                    cbgData={cbgGeoJSON}
                    center={null}
                    onCBGClick={handleCBGClick}
                    onMapBackgroundClick={handleMapBackgroundClick}
                    onTraceCbgInspect={handleTraceCbgInspect}
                    selectedCBGs={selectedCBGs}
                    traceLayer={activeMapTraceLayer}
                    editingEnabled={!activeMapTraceLayer}
                    focusedCbgId={resolvedFocusedTraceCbg || focusedTraceCbg}
                    focusNonce={focusedTraceNonce}
                  />
                ) : (
                  <div className='h-full w-full flex items-center justify-center bg-gray-100 text-gray-500'>
                    <div className='text-center'>
                      <p>CBG map not available</p>
                      <p className='text-sm'>GeoJSON endpoint needed on Algorithms server</p>
                    </div>
                  </div>
                )}
              </div>
              {showCandidatePanels && (
                <div className={`${editViewportHeightClass} w-[22rem] max-w-[22rem] bg-[#fffff2] border border-[#70B4D4] rounded-lg flex flex-col overflow-hidden`}>
                  <div className='px-4 py-3 border-b border-[#70B4D4] text-lg font-semibold'>
                    Frontier Candidates ({displayCandidates.length})
                  </div>
                  <div className='flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-2'>
                    {!traceLayer && manualFrontierLoading ? (
                      <div className='text-sm text-gray-500 px-2 py-2'>
                        Loading frontier candidates...
                      </div>
                    ) : !traceLayer && manualFrontierError ? (
                      <div className='text-sm text-red-700 px-2 py-2'>
                        {manualFrontierError}
                      </div>
                    ) : displayCandidates.length === 0 ? (
                      <div className='text-sm text-gray-500 px-2 py-2'>
                        {traceLayer ? 'No candidates at this step.' : 'No frontier candidates for the current zone.'}
                      </div>
                    ) : (
                      displayCandidates.map((candidate) => {
                        const cbgId = normalizeCbgId(candidate?.cbg);
                        const isActive = cbgId === normalizeCbgId(selectedTraceCandidateCbg);
                        return (
                          <button
                            type='button'
                            key={cbgId}
                            className={`text-left px-4 py-4 rounded border transition-colors ${
                              isActive
                                ? 'bg-[#e0f2fe] border-[#0284c7]'
                                : 'bg-white border-[#d1d5db] hover:border-[#70B4D4]'
                            }`}
                            onClick={() => {
                              setSelectedTraceCandidateCbg(cbgId);
                              setFocusedTraceCbg(cbgId);
                              setFocusedTraceNonce((prev) => prev + 1);
                            }}
                          >
                            <div className='text-base font-semibold leading-tight'>
                              #{candidate.rank ?? '?'} {cbgId}
                            </div>
                            <div className='text-base text-gray-700 mt-1'>
                              Score: {Number(candidate.score ?? 0).toFixed(4)}
                            </div>
                            <div className='text-base text-gray-600'>
                              To cluster: {Number(candidate.movement_to_cluster ?? 0).toLocaleString(undefined, { maximumFractionDigits: 1 })}
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
              {showCandidatePanels && (
                <div className={`${editViewportHeightClass} w-[22rem] max-w-[22rem] bg-[#fffff2] border border-[#70B4D4] rounded-lg flex flex-col overflow-hidden`}>
                  <div className='px-4 py-3 border-b border-[#70B4D4] text-lg font-semibold'>
                    CBG Analysis
                  </div>
                  <div className='px-4 py-3 border-b border-[#d1d5db] text-sm space-y-1'>
                    <div><span className='font-semibold'>CBG:</span> {selectedTraceCandidateCbg || 'N/A'}</div>
                    <div><span className='font-semibold'>Population:</span> {selectedTraceFeatureProperties?.population ?? 'N/A'}</div>
                    <div><span className='font-semibold'>Status:</span> {selectedAnalysisStatus}</div>
                    {selectedAnalysisCandidate && (
                      <>
                        <div><span className='font-semibold'>Rank:</span> #{selectedAnalysisCandidate.rank ?? '?'}</div>
                        <div><span className='font-semibold'>Score:</span> {Number(selectedAnalysisCandidate.score ?? 0).toFixed(4)}</div>
                        <div><span className='font-semibold'>To Cluster:</span> {Number(selectedAnalysisCandidate.movement_to_cluster ?? 0).toLocaleString(undefined, { maximumFractionDigits: 1 })}</div>
                        <div><span className='font-semibold'>To Outside:</span> {Number(selectedAnalysisCandidate.movement_to_outside ?? 0).toLocaleString(undefined, { maximumFractionDigits: 1 })}</div>
                        {selectedAnalysisCandidate.czi_after !== undefined && (
                          <div><span className='font-semibold'>CZI After Add:</span> {Number(selectedAnalysisCandidate.czi_after ?? 0).toFixed(4)}</div>
                        )}
                      </>
                    )}
                  </div>
                  <div className='px-4 py-3 border-b border-[#70B4D4] text-sm font-semibold'>
                    Top POIs From Current Cluster
                  </div>
                  <div className='flex-1 overflow-y-auto px-4 py-3'>
                    {candidatePoiLoading ? (
                      <div className='text-sm text-gray-500'>Loading POI analysis...</div>
                    ) : candidatePoiError ? (
                      <div className='text-sm text-red-700'>{candidatePoiError}</div>
                    ) : candidatePois.length === 0 ? (
                      <div className='text-sm text-gray-500'>No cluster-to-POI flow found for this CBG.</div>
                    ) : (
                      <div className='flex flex-col gap-2'>
                        {candidatePois.map((poi) => (
                          <div key={`${poi.placekey || poi.location_name}-${poi.rank}`} className='text-sm leading-snug'>
                            <div className='font-medium'>
                              {poi.rank}. {poi.location_name || 'Unknown POI'}
                            </div>
                            <div className='text-gray-600'>
                              Flow: {Number(poi.cluster_flow ?? 0).toLocaleString(undefined, { maximumFractionDigits: 1 })}
                              {' '}({Number((poi.flow_share ?? 0) * 100).toFixed(1)}%)
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {mapFocusWarning && (
              <div className='w-full px-3 py-2 rounded-lg border border-amber-400 bg-amber-100 text-amber-900 text-sm'>
                {mapFocusWarning}
              </div>
            )}

            <div className='w-full p-2.5 bg-[#fffff2] outline outline-2 outline-[#70B4D4] rounded-lg flex flex-wrap items-end justify-between gap-3'>
              <div>
                {showTraceControls ? (
                  <>
                    <div className='text-sm font-semibold mb-2'>Trace Controls</div>
                    {growthTrace?.supports_stepwise && traceSteps.length > 0 ? (
                      <>
                        <label className='flex items-center gap-2 text-xs mb-2'>
                          <input
                            type='checkbox'
                            checked={traceEnabled}
                            onChange={(e) => setTraceEnabled(e.target.checked)}
                          />
                          Show frontier heat map
                        </label>
                        <div className='text-xs text-gray-600'>
                          Step {Math.min(traceStepIndex, maxTraceStep) + 1} of {traceSteps.length}
                        </div>
                        <div className='mt-2 flex gap-2'>
                          <button
                            type='button'
                            className='px-2 py-1 text-xs rounded border border-[#70B4D4] disabled:opacity-40'
                            disabled={!traceEnabled || traceStepIndex <= 0}
                            onClick={() => jumpToTraceStep(traceStepIndex - 1)}
                          >
                            Previous Step
                          </button>
                          <button
                            type='button'
                            className='px-2 py-1 text-xs rounded border border-[#70B4D4] disabled:opacity-40'
                            disabled={!traceEnabled || traceStepIndex >= maxTraceStep}
                            onClick={() => jumpToTraceStep(traceStepIndex + 1)}
                          >
                            Next Step
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className='text-xs text-gray-600'>
                        {growthTrace?.note || 'This algorithm does not expose a step-by-step greedy expansion trace.'}
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div className='text-sm font-semibold mb-2'>Zone Metrics (Live)</div>
                    {zoneMetricsLoading ? (
                      <div className='text-xs text-gray-600'>Computing CZI...</div>
                    ) : zoneMetricsError ? (
                      <div className='text-xs text-red-700'>{zoneMetricsError}</div>
                    ) : zoneMetrics ? (
                      <div className='flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-700'>
                        <div><span className='font-semibold'>CBGs:</span> {zoneMetrics.cbg_count ?? selectedCBGs.length}</div>
                        <div><span className='font-semibold'>CZI:</span> {Number(zoneMetrics.czi ?? 0).toFixed(4)}</div>
                        <div><span className='font-semibold'>Inside:</span> {Number(zoneMetrics.movement_inside ?? 0).toLocaleString(undefined, { maximumFractionDigits: 1 })}</div>
                        <div><span className='font-semibold'>Boundary:</span> {Number(zoneMetrics.movement_boundary ?? 0).toLocaleString(undefined, { maximumFractionDigits: 1 })}</div>
                      </div>
                    ) : (
                      <div className='text-xs text-gray-600'>No metrics available.</div>
                    )}
                    <div className='mt-1 text-xs text-gray-600'>
                      Click CBGs on the map to add/remove them. Frontier candidates update automatically.
                    </div>
                  </>
                )}
              </div>
              <div className='flex items-center gap-2'>
                {growthTrace && !zoneEditMode && (
                  <button
                    type='button'
                    onClick={() => {
                      setZoneEditMode(true);
                      setTraceEnabled(false);
                    }}
                    disabled={loading || isFinalizing}
                    className='px-4 py-2 rounded-lg border border-[#70B4D4] bg-white text-[#1f2937] font-semibold disabled:opacity-40'
                  >
                    Edit Zone
                  </button>
                )}
                {growthTrace && zoneEditMode && (
                  <button
                    type='button'
                    onClick={() => {
                      setZoneEditMode(false);
                      setTraceEnabled(Boolean(growthTrace?.steps?.length));
                    }}
                    disabled={loading || isFinalizing}
                    className='px-4 py-2 rounded-lg border border-[#70B4D4] bg-white text-[#1f2937] font-semibold disabled:opacity-40'
                  >
                    Trace View
                  </button>
                )}
                <button
                  type='button'
                  onClick={finalizeCZ}
                  disabled={loading || isFinalizing}
                  className='px-4 py-2 rounded-lg border border-[#70B4D4] bg-[#e0f2fe] text-[#1f2937] font-semibold disabled:opacity-40'
                >
                  {isFinalizing ? 'Generating Patterns...' : 'Finalize & Generate'}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className='w-full flex flex-col gap-4'>
            <div className={`${setupViewportHeightClass} w-full`}>
              <InteractiveMap
                onLocationSelect={setLocation}
                disabled={loading}
              />
            </div>
            <div className='w-full rounded-lg border border-[#70B4D4] bg-[#fffff2] p-4'>
              <div className='flex flex-wrap gap-4 items-end'>
                <div className='w-[22rem] max-w-full'>
                  <FormField
                    label='City, Address, or Location'
                    name='location'
                    type='text'
                    placeholder='e.g. 55902'
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    disabled={loading}
                  />
                </div>
                <div className='w-[16rem] max-w-full'>
                  <FormField
                    label='Minimum Population'
                    name='min_pop'
                    type='number'
                    value={minPop}
                    min={100}
                    max={100_000}
                    onChange={(e) => setMinPop(e.target.value)}
                    disabled={loading}
                  />
                </div>
                <div className='w-[22rem] max-w-full'>
                  <FormField
                    label='Clustering Algorithm'
                    name='algorithm'
                    type='select'
                    value={clusterAlgorithm}
                    options={CLUSTER_ALGORITHM_OPTIONS}
                    onChange={(e) => setClusterAlgorithm(e.target.value)}
                    disabled={loading}
                  />
                </div>

                <div className='w-[11rem] max-w-full'>
                  <FormField
                    label='Start Date'
                    name='start_date'
                    type='date'
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    disabled={loading}
                  />
                </div>
                <div className='w-[11rem] max-w-full'>
                  <FormField
                    label='End Date'
                    name='end_date'
                    type='date'
                    value={endDate}
                    min={startDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    disabled={loading}
                  />
                </div>
                <div className='w-[26rem] max-w-full'>
                  <FormField
                    label='Description'
                    name='description'
                    type='textarea'
                    placeholder='a short description for this convenience zone...'
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    disabled={loading}
                    required={false}
                  />
                </div>
              </div>

              {clusterAlgorithm === 'czi_optimal_cap' && (
                <div className='mt-3 text-xs text-gray-600 rounded-lg border border-[#70B4D4] p-3 bg-[#fffff2]'>
                  CZI Optimal treats `Minimum Population` as a population cap and searches for a
                  high-CZI connected zone within a floor-to-cap band.
                </div>
              )}

              {clusterAlgorithm === 'czi_balanced' && (
                <div className='mt-3 rounded-lg border border-[#70B4D4] p-3 bg-[#fffff2] max-w-[30rem]'>
                  <button
                    type='button'
                    className='text-sm font-semibold text-left w-full'
                    onClick={() => setShowAdvancedClustering((v) => !v)}
                    disabled={loading}
                  >
                    Advanced Clustering {showAdvancedClustering ? 'v' : '>'}
                  </button>
                  {showAdvancedClustering && (
                    <div className='mt-3 flex flex-col gap-3'>
                      <FormField
                        label='Distance Penalty Weight'
                        name='distance_penalty_weight'
                        type='number'
                        value={distancePenaltyWeight}
                        min={0}
                        max={1}
                        onChange={(e) => setDistancePenaltyWeight(e.target.value)}
                        disabled={loading}
                      />
                      <FormField
                        label='Distance Scale (km)'
                        name='distance_scale_km'
                        type='number'
                        value={distanceScaleKm}
                        min={0.1}
                        max={500}
                        onChange={(e) => setDistanceScaleKm(e.target.value)}
                        disabled={loading}
                      />
                      <div className='text-xs text-gray-600'>
                        Higher `Distance Penalty Weight` favors closer CBGs more strongly.
                        `Distance Scale` controls how quickly distance penalty grows (larger = softer penalty).
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className='mt-4 flex justify-end'>
                <button
                  type='submit'
                  disabled={loading}
                  className='px-4 py-2 rounded-lg border border-[#70B4D4] bg-[#e0f2fe] text-[#1f2937] font-semibold disabled:opacity-40'
                >
                  {loading ? 'Clustering...' : 'Preview CBGs'}
                </button>
              </div>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}
