'use client';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSession } from '@/lib/auth-client';
import {
  mergeGeoJsonFeatures,
  normalizeCbgId,
  getFeatureCbgId,
  type GeoJSONData,
  type LatLng
} from '@/lib/cz-geo';
import '@/styles/cz-generation.css';

const InteractiveMap = dynamic(() => import('@/components/interactive-map'), {
  ssr: false
});
const CBGMap = dynamic(() => import('@/components/cbg-map'), { ssr: false });

const CLUSTER_ALGORITHM_OPTIONS = [
  { value: 'greedy_fast', label: 'Greedy Fast' },
  { value: 'greedy_weight_seed_guard', label: 'Greedy Weight + Seed Guard' }
] as const;

type ClusterAlgorithm = (typeof CLUSTER_ALGORITHM_OPTIONS)[number]['value'];

type TraceCandidate = {
  cbg?: string;
  score?: number;
  rank?: number;
  selected?: boolean;
  movement_to_cluster?: number;
  movement_to_full_cluster?: number;
  movement_to_outside?: number;
  movement_contributes_after_selection?: boolean;
  seed_distance_km?: number;
  czi_after?: number;
  [key: string]: unknown;
};

const EMPTY_LIST: TraceCandidate[] = [];

type TraceStep = {
  cluster_before?: string[];
  cluster_after?: string[];
  selected_cbg?: string;
  candidates?: TraceCandidate[];
};

type TracePayload = {
  algorithm?: string;
  supports_stepwise?: boolean;
  steps?: TraceStep[];
  note?: string;
};

type TraceLayerData = {
  clusterSet: Set<string>;
  candidateByCbg: Map<string, TraceCandidate>;
  selectedCbg?: string;
  minScore: number;
  maxScore: number;
};

type PoiAnalysis = {
  placekey?: string;
  location_name?: string;
  rank?: number;
  cluster_flow?: number;
  flow_share?: number;
};

type ZoneMetrics = {
  movement_inside?: number;
  movement_boundary?: number;
  czi?: number;
  cbg_count?: number;
};

type ResolvedSeedLookup = {
  query: string;
  cbg: string;
  cityName: string;
};

function isClusterAlgorithm(value: unknown): value is ClusterAlgorithm {
  return CLUSTER_ALGORITHM_OPTIONS.some((option) => option.value === value);
}

type FormFieldProps = {
  label: string;
  name: string;
  type: 'text' | 'number' | 'date' | 'textarea' | 'select';
  placeholder?: string;
  disabled?: boolean;
  value?: string | number;
  onChange?: (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => void;
  min?: number | string;
  max?: number | string;
  options?: Array<{ value: string; label: string }>;
  required?: boolean;
};

function FormField({
  label,
  name,
  type,
  placeholder,
  disabled,
  value,
  onChange,
  min,
  max,
  options,
  required = true
}: FormFieldProps) {
  return (
    <div className="flex flex-col gap-0.5">
      <label htmlFor={name}>{label}</label>
      {type === 'textarea' ? (
        <textarea
          className="formfield"
          name={name}
          id={name}
          placeholder={placeholder}
          disabled={disabled}
          value={value as string}
          onChange={
            onChange as React.ChangeEventHandler<HTMLTextAreaElement> | undefined
          }
          required={required}
        />
      ) : type === 'select' ? (
        <select
          className="formfield"
          name={name}
          id={name}
          disabled={disabled}
          value={value as string}
          onChange={
            onChange as React.ChangeEventHandler<HTMLSelectElement> | undefined
          }
          required={required}
        >
          {options?.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          className="formfield"
          name={name}
          id={name}
          type={type}
          placeholder={placeholder}
          disabled={disabled}
          value={value as string | number}
          onChange={
            onChange as React.ChangeEventHandler<HTMLInputElement> | undefined
          }
          min={min}
          max={max}
          required={required}
        />
      )}
    </div>
  );
}

function clampIndex(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function toInputDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function getDefaultEndDate(startDate: string) {
  const start = new Date(`${startDate}T00:00:00`);
  if (Number.isNaN(start.getTime())) {
    return '2019-01-15';
  }
  start.setDate(start.getDate() + 14);
  return toInputDate(start);
}

function getLengthHours(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return null;
  }
  return Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

async function readJsonObject(
  response: Response
): Promise<Record<string, unknown> | null> {
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.toLowerCase().includes('application/json')) {
    return null;
  }

  const payload = await response.json().catch(() => null);
  return isRecord(payload) ? payload : null;
}

function getResponseErrorMessage(
  response: Response,
  payload: Record<string, unknown> | null,
  fallback: string
) {
  if (typeof payload?.message === 'string' && payload.message.trim()) {
    return payload.message;
  }

  if (typeof payload?.error === 'string' && payload.error.trim()) {
    return payload.error;
  }

  if (response.status === 404) {
    return 'The clustering endpoint was not found on the deployed Algorithms service.';
  }

  return fallback;
}

function getPayloadErrorMessage(
  payload: Record<string, unknown> | null,
  fallback: string
) {
  if (typeof payload?.message === 'string' && payload.message.trim()) {
    return payload.message;
  }

  if (typeof payload?.error === 'string' && payload.error.trim()) {
    return payload.error;
  }

  return fallback;
}

export default function CZGeneration() {
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const user = session?.user;
  const isResolvingMapClickRef = useRef(false);
  const attemptedTraceGeoJsonFetchRef = useRef(new Set<string>());

  const ALG_URL = process.env.NEXT_PUBLIC_ALG_URL || 'http://localhost:1880/';
  const algUrl = useCallback(
    (path: string) => new URL(path, ALG_URL).toString(),
    [ALG_URL]
  );

  const [location, setLocation] = useState('');
  const [minPop, setMinPop] = useState(5000);
  const [clusterAlgorithm, setClusterAlgorithm] =
    useState<ClusterAlgorithm>('greedy_fast');
  const [showAdvancedClustering, setShowAdvancedClustering] = useState(false);
  const [seedGuardDistanceKm, setSeedGuardDistanceKm] = useState(20);
  const [setupSeedCbg, setSetupSeedCbg] = useState('');
  const [setupSeedGeoJSON, setSetupSeedGeoJSON] = useState<GeoJSONData | null>(
    null
  );
  const [setupResolvedCityName, setSetupResolvedCityName] = useState('');
  const [resolvedSeedLookup, setResolvedSeedLookup] =
    useState<ResolvedSeedLookup | null>(null);
  const [resolvingSeed, setResolvingSeed] = useState(false);
  const [seedResolveError, setSeedResolveError] = useState('');
  const [startDate, setStartDate] = useState('2019-01-01');
  const [endDate, setEndDate] = useState('2019-01-15');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [phase, setPhase] = useState<'input' | 'edit' | 'finalizing'>(
    'input'
  );
  const [cbgGeoJSON, setCbgGeoJSON] = useState<GeoJSONData | null>(null);
  const [selectedCBGs, setSelectedCBGs] = useState<string[]>([]);
  const [seedCBG, setSeedCBG] = useState('');
  const [, setTotalPopulation] = useState(0);
  const [useTestData, setUseTestData] = useState(false);
  const [mapCenter, setMapCenter] = useState<[number, number] | null>(null);
  const [cityName, setCityName] = useState('');
  const [growthTrace, setGrowthTrace] = useState<TracePayload | null>(null);
  const [traceEnabled, setTraceEnabled] = useState(false);
  const [traceStepIndex, setTraceStepIndex] = useState(0);
  const [selectedTraceCandidateCbg, setSelectedTraceCandidateCbg] =
    useState('');
  const [focusedTraceCbg, setFocusedTraceCbg] = useState('');
  const [focusedTraceNonce, setFocusedTraceNonce] = useState(0);
  const [candidatePois, setCandidatePois] = useState<PoiAnalysis[]>([]);
  const [candidatePoiDebug, setCandidatePoiDebug] = useState<Record<string, unknown> | null>(null);
  const [candidatePoiLoading, setCandidatePoiLoading] = useState(false);
  const [candidatePoiError, setCandidatePoiError] = useState('');
  const [manualFrontierCandidates, setManualFrontierCandidates] = useState<
    TraceCandidate[]
  >([]);
  const [manualFrontierLoading, setManualFrontierLoading] = useState(false);
  const [manualFrontierError, setManualFrontierError] = useState('');
  const [zoneMetrics, setZoneMetrics] = useState<ZoneMetrics | null>(null);
  const [zoneMetricsLoading, setZoneMetricsLoading] = useState(false);
  const [zoneMetricsError, setZoneMetricsError] = useState('');
  const [savingHtmlMap, setSavingHtmlMap] = useState(false);
  const [zoneEditMode, setZoneEditMode] = useState(false);
  const [cziMetrics, setCziMetrics] = useState<ZoneMetrics | null>(null);
  const [cziLoading, setCziLoading] = useState(false);
  const [finalizeProgress, setFinalizeProgress] = useState(0);
  const [finalizeStatusMessage, setFinalizeStatusMessage] = useState('');
  const hasGenerated = phase === 'edit' || phase === 'finalizing';
  const isFinalizing = phase === 'finalizing';
  const isTestLocationInput =
    String(location ?? '').trim().toUpperCase() === 'TEST';
  const traceSteps = growthTrace?.steps ?? [];
  const maxTraceStep = traceSteps.length > 0 ? traceSteps.length - 1 : 0;
  const activeTraceStep = traceSteps[clampIndex(traceStepIndex, 0, maxTraceStep)] ?? null;
  const activeTraceCandidates = Array.isArray(activeTraceStep?.candidates)
    ? activeTraceStep.candidates
    : EMPTY_LIST;

  const selectedTraceCandidate = useMemo(
    () =>
      activeTraceCandidates.find(
        (candidate) =>
          normalizeCbgId(candidate?.cbg) ===
          normalizeCbgId(selectedTraceCandidateCbg)
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

  const traceLayer = useMemo<TraceLayerData | null>(() => {
    if (!traceEnabled || !activeTraceStep) {
      return null;
    }

    const clusterSet = new Set(
      Array.isArray(activeTraceStep.cluster_before)
        ? activeTraceStep.cluster_before.map((cbg) => normalizeCbgId(cbg))
        : []
    );
    const candidateByCbg = new Map<string, TraceCandidate>();
    let minScore = Infinity;
    let maxScore = -Infinity;

    for (const candidate of activeTraceStep.candidates || []) {
      const cbgId = normalizeCbgId(candidate?.cbg);
      if (!cbgId) {
        continue;
      }
      const score = Number(candidate?.score ?? 0);
      if (Number.isFinite(score)) {
        minScore = Math.min(minScore, score);
        maxScore = Math.max(maxScore, score);
      }
      candidateByCbg.set(cbgId, { ...candidate, score });
    }

    return {
      clusterSet,
      candidateByCbg,
      selectedCbg: normalizeCbgId(activeTraceStep.selected_cbg),
      minScore: Number.isFinite(minScore) ? minScore : 0,
      maxScore: Number.isFinite(maxScore) ? maxScore : 1
    };
  }, [activeTraceStep, traceEnabled]);

  const manualEditPanelsActive = hasGenerated && (!growthTrace || zoneEditMode);
  const showCandidatePanels = Boolean(traceLayer) || manualEditPanelsActive;
  const displayCandidates = traceLayer
    ? activeTraceCandidates
    : manualEditPanelsActive
      ? manualFrontierCandidates
      : EMPTY_LIST;

  const selectedManualCandidate = useMemo(
    () =>
      manualFrontierCandidates.find(
        (candidate) =>
          normalizeCbgId(candidate?.cbg) ===
          normalizeCbgId(selectedTraceCandidateCbg)
      ) || null,
    [manualFrontierCandidates, selectedTraceCandidateCbg]
  );

  const selectedAnalysisCandidate = traceLayer
    ? selectedTraceCandidate
    : selectedManualCandidate;

  const selectedTraceStatus = useMemo(() => {
    const normalized = normalizeCbgId(selectedTraceCandidateCbg);
    if (!normalized || !traceLayer) {
      return 'N/A';
    }
    if (traceLayer.clusterSet.has(normalized)) {
      return 'Current Cluster';
    }
    if (selectedTraceCandidate) {
      return selectedTraceCandidate.selected
        ? 'Selected Next Candidate'
        : 'Frontier Candidate';
    }
    return 'Outside Current Frontier';
  }, [selectedTraceCandidate, selectedTraceCandidateCbg, traceLayer]);

  const selectedManualStatus = useMemo(() => {
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
  }, [
    manualEditPanelsActive,
    selectedCBGs,
    selectedManualCandidate,
    selectedTraceCandidateCbg
  ]);

  const selectedAnalysisStatus = traceLayer
    ? selectedTraceStatus
    : selectedManualStatus;

  const manualHeatmapLayer = useMemo<TraceLayerData | null>(() => {
    if (!manualEditPanelsActive) {
      return null;
    }

    const clusterSet = new Set(
      selectedCBGs.map((cbg) => normalizeCbgId(cbg)).filter(Boolean)
    );
    const candidateByCbg = new Map<string, TraceCandidate>();
    let minScore = Infinity;
    let maxScore = -Infinity;

    for (const candidate of manualFrontierCandidates || []) {
      const cbgId = normalizeCbgId(candidate?.cbg);
      if (!cbgId) {
        continue;
      }
      const score = Number(candidate?.score ?? 0);
      if (Number.isFinite(score)) {
        minScore = Math.min(minScore, score);
        maxScore = Math.max(maxScore, score);
      }
      candidateByCbg.set(cbgId, { ...candidate, score });
    }

    return {
      clusterSet,
      candidateByCbg,
      selectedCbg: normalizeCbgId(selectedTraceCandidateCbg),
      minScore: Number.isFinite(minScore) ? minScore : 0,
      maxScore: Number.isFinite(maxScore) ? maxScore : 1
    };
  }, [manualEditPanelsActive, manualFrontierCandidates, selectedCBGs, selectedTraceCandidateCbg]);

  const activeMapTraceLayer = manualEditPanelsActive
    ? manualHeatmapLayer
    : traceLayer;
  const showTraceControls = Boolean(growthTrace) && !zoneEditMode;
  const seedGuardNeedsResolvedSeed =
    clusterAlgorithm === 'greedy_weight_seed_guard' && !isTestLocationInput;

  const resetSeedPreview = useCallback(() => {
    setSetupSeedCbg('');
    setSetupSeedGeoJSON(null);
    setSetupResolvedCityName('');
    setResolvedSeedLookup(null);
    setSeedResolveError('');
  }, []);

  useEffect(() => {
    if (!user && !isPending) {
      router.replace('/simulator');
    }
  }, [isPending, router, user]);

  useEffect(() => {
    if (phase !== 'input') {
      return;
    }
    resetSeedPreview();
  }, [phase, resetSeedPreview]);

  useEffect(() => {
    if (traceStepIndex > maxTraceStep) {
      setTraceStepIndex(maxTraceStep);
    }
  }, [maxTraceStep, traceStepIndex]);

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
  }, [activeTraceStep, manualEditPanelsActive, traceEnabled]);

  useEffect(() => {
    if (!showCandidatePanels || !focusedTraceCbg || !cbgGeoJSON?.features) {
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
    fetch(`${algUrl('cbg-geojson')}?cbgs=${normalized}&include_neighbors=false`)
      .then((resp) => (resp.ok ? resp.json() : null))
      .then((data) => {
        if (data?.features?.length) {
          setCbgGeoJSON((prev) => mergeGeoJsonFeatures(prev, data));
        }
      })
      .catch((err) => {
        console.warn(
          `Failed to load GeoJSON for focused trace CBG ${normalized}:`,
          err
        );
      });
  }, [algUrl, cbgGeoJSON, focusedTraceCbg, showCandidatePanels]);

  useEffect(() => {
    if (!hasGenerated || !seedCBG || selectedCBGs.length === 0) {
      setCziMetrics(null);
      setCziLoading(false);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      setCziLoading(true);
      try {
        const resp = await fetch(algUrl('cz-metrics'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            seed_cbg: seedCBG,
            cbg_list: selectedCBGs,
            start_date: startDate,
            use_test_data: useTestData
          })
        });
        const data = await resp.json();
        if (!cancelled) {
          setCziMetrics(resp.ok ? data : null);
        }
      } catch (err) {
        if (!cancelled) {
          setCziMetrics(null);
        }
        console.warn('Failed to compute CZI metrics:', err);
      } finally {
        if (!cancelled) {
          setCziLoading(false);
        }
      }
    }, 180);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [algUrl, hasGenerated, seedCBG, selectedCBGs, startDate, useTestData]);

  useEffect(() => {
    if (!showCandidatePanels || !selectedTraceCandidateCbg) {
      setCandidatePoiDebug(null);
      return;
    }

    const poiCluster = traceLayer
      ? Array.isArray(activeTraceStep?.cluster_before)
        ? activeTraceStep.cluster_before
        : []
      : selectedCBGs;
    if (!poiCluster.length) {
      setCandidatePois([]);
      setCandidatePoiDebug(null);
      setCandidatePoiError('');
      return;
    }

    let cancelled = false;
    setCandidatePoiLoading(true);
    setCandidatePoiDebug(null);
    setCandidatePoiError('');

    fetch(algUrl('candidate-pois'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        seed_cbg: seedCBG,
        candidate_cbg: selectedTraceCandidateCbg,
        cluster_cbgs: poiCluster,
        start_date: startDate,
        use_test_data: useTestData,
        limit: 8
      })
    })
      .then(async (resp) => {
        const data = await readJsonObject(resp);
        if (cancelled) {
          return;
        }
        setCandidatePoiDebug(
          isRecord(data?.debug) ? (data.debug as Record<string, unknown>) : null
        );
        if (!resp.ok) {
          throw new Error(
            getResponseErrorMessage(
              resp,
              data,
              'Failed to load POI analysis.'
            )
          );
        }
        setCandidatePois(Array.isArray(data?.pois) ? (data.pois as PoiAnalysis[]) : []);
      })
      .catch((err) => {
        if (cancelled) {
          return;
        }
        setCandidatePois([]);
        setCandidatePoiError(
          err instanceof Error ? err.message : 'Failed to load POI analysis.'
        );
      })
      .finally(() => {
        if (!cancelled) {
          setCandidatePoiLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    activeTraceStep,
    algUrl,
    seedCBG,
    selectedCBGs,
    selectedTraceCandidateCbg,
    showCandidatePanels,
    startDate,
    traceLayer,
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

    const req: Record<string, unknown> = {
      seed_cbg: seedCBG,
      cbg_list: selectedCBGs,
      algorithm: clusterAlgorithm,
      min_pop: Number(minPop),
      start_date: startDate,
      use_test_data: useTestData,
      limit: 2000
    };

    if (clusterAlgorithm === 'greedy_weight_seed_guard') {
      if (Number.isFinite(Number(seedGuardDistanceKm))) {
        req.seed_guard_distance_km = Number(seedGuardDistanceKm);
      }
    }

    fetch(algUrl('frontier-candidates'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req)
    })
      .then(async (resp) => {
        const data = await resp.json();
        if (cancelled) {
          return;
        }
        if (!resp.ok) {
          throw new Error(
            data?.message || 'Failed to load frontier candidates.'
          );
        }
        const nextCandidates = Array.isArray(data?.candidates)
          ? data.candidates
          : [];
        setManualFrontierCandidates(nextCandidates);

        const selectedNow = normalizeCbgId(selectedTraceCandidateCbg);
        const selectedStillValid =
          (selectedNow && selectedCBGs.includes(selectedNow)) ||
          nextCandidates.some(
            (candidate: TraceCandidate) =>
              normalizeCbgId(candidate?.cbg) === selectedNow
          );

        if (!selectedStillValid) {
          const fallbackCbg = normalizeCbgId(
            nextCandidates[0]?.cbg || selectedCBGs[0] || ''
          );
          setSelectedTraceCandidateCbg(fallbackCbg);
          setFocusedTraceCbg(fallbackCbg);
          if (fallbackCbg) {
            setFocusedTraceNonce((prev) => prev + 1);
          }
        }
      })
      .catch((err) => {
        if (cancelled) {
          return;
        }
        setManualFrontierCandidates([]);
        setManualFrontierError(
          err instanceof Error ? err.message : 'Failed to load frontier candidates.'
        );
      })
      .finally(() => {
        if (!cancelled) {
          setManualFrontierLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    algUrl,
    clusterAlgorithm,
    manualEditPanelsActive,
    minPop,
    seedCBG,
    seedGuardDistanceKm,
    selectedCBGs,
    selectedTraceCandidateCbg,
    startDate,
    useTestData
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

    fetch(algUrl('cz-metrics'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        seed_cbg: seedCBG,
        cbg_list: selectedCBGs,
        start_date: startDate,
        use_test_data: useTestData
      })
    })
      .then(async (resp) => {
        const data = await resp.json();
        if (cancelled) {
          return;
        }
        if (!resp.ok) {
          throw new Error(data?.message || 'Failed to compute zone metrics.');
        }
        setZoneMetrics(data || null);
      })
      .catch((err) => {
        if (cancelled) {
          return;
        }
        setZoneMetrics(null);
        setZoneMetricsError(
          err instanceof Error ? err.message : 'Failed to compute zone metrics.'
        );
      })
      .finally(() => {
        if (!cancelled) {
          setZoneMetricsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [algUrl, manualEditPanelsActive, seedCBG, selectedCBGs, startDate, useTestData]);

  const lookupLocation = async (
    query: string
  ): Promise<{ cbg: string; city: string; state: string } | null> => {
    const location = String(query ?? '').trim();
    if (!location) {
      return null;
    }

    const resp = await fetch('/api/lookup-location', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ location })
    });
    if (resp.status === 404) {
      return null;
    }

    if (!resp.ok) {
      const payload = await readJsonObject(resp);
      throw new Error(
        getResponseErrorMessage(
          resp,
          payload,
          `Location lookup failed with status ${resp.status}`
        )
      );
    }

    return resp.json();
  };

  const waitForClusteringResult = useCallback(
    (clusteringId: number): Promise<Record<string, unknown>> =>
      new Promise((resolve, reject) => {
        let settled = false;
        const eventSource = new EventSource(
          algUrl(`clustering-progress/${clusteringId}`)
        );
        const timeout = window.setTimeout(() => {
          if (settled) {
            return;
          }
          settled = true;
          eventSource.close();
          reject(
            new Error('Timed out waiting for the clustering preview to finish.')
          );
        }, 5 * 60 * 1000);

        const finish = (callback: () => void) => {
          if (settled) {
            return;
          }
          settled = true;
          window.clearTimeout(timeout);
          eventSource.close();
          callback();
        };

        eventSource.onmessage = (event) => {
          let payload: Record<string, unknown> | null = null;
          try {
            const parsed = JSON.parse(event.data);
            payload = isRecord(parsed) ? parsed : null;
          } catch {
            finish(() =>
              reject(
                new Error(
                  'Received an invalid clustering progress payload from the Algorithms service.'
                )
              )
            );
            return;
          }

          if (payload?.error) {
            finish(() =>
              reject(
                new Error(
                  getPayloadErrorMessage(
                    payload,
                    'Failed to cluster CBGs. Please try again.'
                  )
                )
              )
            );
            return;
          }

          if (!payload?.done) {
            return;
          }

          const result = isRecord(payload.result) ? payload.result : null;
          if (!result) {
            finish(() =>
              reject(
                new Error(
                  'Clustering finished without returning the preview result payload.'
                )
              )
            );
            return;
          }

          finish(() => resolve(result));
        };

        eventSource.onerror = () => {
          finish(() =>
            reject(
              new Error(
                'Lost connection to the Algorithms service while previewing CBGs.'
              )
            )
          );
        };
      }),
    [algUrl]
  );

  const resolveSeedPreview = async () => {
    const rawLocationInput = String(location ?? '').trim();
    if (!rawLocationInput) {
      setSeedResolveError('Enter a location or ZIP first.');
      return;
    }

    if (rawLocationInput.toUpperCase() === 'TEST') {
      setSeedResolveError('Seed preview is unavailable in TEST mode.');
      return;
    }

    setResolvingSeed(true);
    setSeedResolveError('');
    try {
      const locationData = await lookupLocation(rawLocationInput);
      const coreCbg = locationData?.cbg;
      if (!coreCbg) {
        throw new Error(
          'Could not resolve a seed CBG. Try a 5-digit ZIP code such as 21201.'
        );
      }

      const resp = await fetch(
        `${algUrl('cbg-geojson')}?cbgs=${coreCbg}&include_neighbors=false`
      );
      const seedGeoJson = await resp.json();
      if (!resp.ok || !seedGeoJson?.features?.length) {
        throw new Error(
          seedGeoJson?.message ||
            'Resolved the seed CBG, but could not load its map boundary.'
        );
      }

      setSetupSeedCbg(coreCbg);
      setSetupSeedGeoJSON(seedGeoJson);
      const cityName =
        locationData?.city && locationData?.state
          ? `${locationData.city}, ${locationData.state}`
          : locationData?.city || locationData?.state || rawLocationInput;
      setSetupResolvedCityName(cityName);
      setResolvedSeedLookup({
        query: rawLocationInput,
        cbg: coreCbg,
        cityName
      });
    } catch (err) {
      setSetupSeedCbg('');
      setSetupSeedGeoJSON(null);
      setSetupResolvedCityName('');
      setResolvedSeedLookup(null);
      setSeedResolveError(
        err instanceof Error ? err.message : 'Failed to resolve the seed CBG.'
      );
    } finally {
      setResolvingSeed(false);
    }
  };

  const handleCBGClick = async (
    cbgId: string,
    properties: Record<string, unknown>
  ) => {
    const normalized = normalizeCbgId(cbgId);
    const wasInCluster = selectedCBGs.includes(normalized);

    if (wasInCluster) {
      setSelectedCBGs((prev) => prev.filter((id) => id !== normalized));
      setTotalPopulation((prev) => prev - Number(properties.population || 0));
      return;
    }

    setSelectedCBGs((prev) => [...prev, normalized]);
    setTotalPopulation((prev) => prev + Number(properties.population || 0));

    if (properties.in_cluster) {
      return;
    }

    try {
      const resp = await fetch(
        `${algUrl('cbg-geojson')}?cbgs=${normalized}&include_neighbors=true`
      );
      const data = await resp.json();
      if (data?.features) {
        setCbgGeoJSON((prev) => mergeGeoJsonFeatures(prev, data));
      }
    } catch (err) {
      console.warn('Failed to fetch neighbors for newly added CBG:', err);
    }
  };

  const handleMapBackgroundClick = async (latlng: LatLng) => {
    if (!latlng || isResolvingMapClickRef.current) {
      return;
    }
    const stateHint = String(selectedCBGs?.[0] ?? '').slice(0, 2);
    if (!stateHint) {
      return;
    }

    isResolvingMapClickRef.current = true;
    try {
      const resp = await fetch(
        `${algUrl('cbg-at-point')}?latitude=${latlng.lat}&longitude=${latlng.lng}&state_fips=${stateHint}`
      );
      const data = await resp.json();
      const clickedCbg = data?.cbg;
      if (!clickedCbg || selectedCBGs.includes(clickedCbg)) {
        return;
      }
      await handleCBGClick(clickedCbg, {
        population: data?.population || 0,
        in_cluster: false
      });
    } catch (err) {
      console.warn('Failed to resolve clicked map location to CBG:', err);
    } finally {
      isResolvingMapClickRef.current = false;
    }
  };

  const jumpToTraceStep = (index: number) => {
    if (!traceSteps.length) {
      return;
    }
    setTraceStepIndex(clampIndex(index, 0, maxTraceStep));
  };

  const handleTraceCbgInspect = (cbgId: string) => {
    const normalized = normalizeCbgId(cbgId);
    setSelectedTraceCandidateCbg(normalized);
    setFocusedTraceCbg(normalized);
    setFocusedTraceNonce((prev) => prev + 1);
  };

  const handleGenerateSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loading) {
      return;
    }

    const rawLocationInput = String(location ?? '').trim();
    const isTestMode = rawLocationInput.toUpperCase() === 'TEST';
    setUseTestData(isTestMode);

    const cachedSeedLookup =
      resolvedSeedLookup?.query === rawLocationInput ? resolvedSeedLookup : null;
    let coreCbg = setupSeedCbg || cachedSeedLookup?.cbg || null;
    let resolvedCityName =
      setupResolvedCityName ||
      cachedSeedLookup?.cityName ||
      (isTestMode ? 'TEST' : rawLocationInput);

    if (seedGuardNeedsResolvedSeed && !coreCbg) {
      setError(
        'Resolve the seed first so you can verify the seed guard radius before previewing.'
      );
      return;
    }

    if (!isTestMode && !coreCbg) {
      try {
        const resolved = await lookupLocation(rawLocationInput);
        coreCbg = resolved?.cbg || null;
        resolvedCityName =
          resolved?.city && resolved?.state
            ? `${resolved.city}, ${resolved.state}`
            : resolved?.city || resolved?.state || rawLocationInput;
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : 'Failed to resolve location.'
        );
        return;
      }
    }

    if (!isTestMode && !coreCbg) {
      setError(
        'Could not find location. Please try entering a 5-digit ZIP code (e.g. 21201 for Baltimore).'
      );
      return;
    }

    const clusterReq: Record<string, unknown> = {
      min_pop: Number(minPop),
      algorithm: clusterAlgorithm,
      start_date: startDate,
      use_test_data: isTestMode,
      include_trace: true
    };

    if (clusterAlgorithm === 'greedy_weight_seed_guard') {
      if (Number.isFinite(Number(seedGuardDistanceKm))) {
        clusterReq.seed_guard_distance_km = Number(seedGuardDistanceKm);
      }
    }

    if (coreCbg) {
      clusterReq.cbg = coreCbg;
    }

    setError('');
    setLoading(true);

    try {
      const resp = await fetch(algUrl('cluster-cbgs'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(clusterReq)
      });
      const kickoffData = (await readJsonObject(resp)) as
        | Record<string, unknown>
        | null;
      if (!resp.ok) {
        throw new Error(
          getResponseErrorMessage(
            resp,
            kickoffData,
            'Failed to cluster CBGs. Please try again.'
          )
        );
      }

      let data = kickoffData as Record<string, any> | null;
      if (!Array.isArray(data?.cluster)) {
        const clusteringId = Number(data?.clustering_id);
        if (Number.isInteger(clusteringId) && clusteringId > 0) {
          data = (await waitForClusteringResult(clusteringId)) as Record<
            string,
            any
          >;
        }
      }

      if (!Array.isArray(data?.cluster)) {
        throw new Error(
          getPayloadErrorMessage(
            kickoffData,
            'The Algorithms service returned an unexpected clustering response.'
          )
        );
      }

      const cluster = data.cluster.filter(
        (cbg: unknown): cbg is string => typeof cbg === 'string'
      );
      setSelectedCBGs(cluster);
      setSeedCBG(data.seed_cbg || coreCbg || '');
      setMapCenter(data.center || null);
      setTotalPopulation(Number(data.size || 0));
      setCityName(resolvedCityName);
      setUseTestData(Boolean(data.use_test_data ?? isTestMode));
      if (isClusterAlgorithm(data.algorithm)) {
        setClusterAlgorithm(data.algorithm);
      }

      if (
        data.clustering_params &&
        data.algorithm === 'greedy_weight_seed_guard'
      ) {
        const rawThreshold = Number(
          data.clustering_params.seed_guard_distance_km
        );
        if (Number.isFinite(rawThreshold)) {
          setSeedGuardDistanceKm(rawThreshold);
        }
      }

      setGrowthTrace(data.trace || null);
      setTraceStepIndex(0);
      setTraceEnabled(Boolean(data.trace?.steps?.length));
      setZoneEditMode(false);
      setManualFrontierCandidates([]);
      setManualFrontierError('');
      setZoneMetrics(null);
      setZoneMetricsError('');
      setCandidatePois([]);
      setCandidatePoiError('');

      if (data.geojson || data.trace_geojson) {
        setCbgGeoJSON(mergeGeoJsonFeatures(data.geojson, data.trace_geojson));
      }

      setPhase('edit');
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to cluster CBGs. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  const finalizeCZ = async () => {
    if (selectedCBGs.length === 0) {
      setError('Please select at least one CBG');
      return;
    }

    const lengthHours = getLengthHours(startDate, endDate);
    if (!lengthHours || lengthHours <= 0) {
      setError('End date must be after start date.');
      return;
    }

    setPhase('finalizing');
    setError('');
    setFinalizeProgress(5);
    setFinalizeStatusMessage('Creating convenience zone...');

    try {
      const trimmedDescription = String(description ?? '').trim();
      const now = new Date();
      const algorithmLabel =
        CLUSTER_ALGORITHM_OPTIONS.find(
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
        `Test data mode: ${useTestData ? 'Yes' : 'No'}`
      ];

      if (clusterAlgorithm === 'greedy_weight_seed_guard') {
        generatedDescription.push(
          `Seed guard distance (km): ${seedGuardDistanceKm}`
        );
      }

      const descriptionToSave =
        trimmedDescription || generatedDescription.join('\n');
      if (!trimmedDescription) {
        setDescription(descriptionToSave);
      }

      const resp = await fetch(algUrl('finalize-cz'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: cityName,
          description: descriptionToSave,
          cbg_list: selectedCBGs,
          start_date: new Date(`${startDate}T00:00:00`).toISOString(),
          length: lengthHours,
          latitude: mapCenter?.[0] || 0,
          longitude: mapCenter?.[1] || 0,
          user_id: user?.id,
          use_test_data: useTestData
        })
      });
      const data = await resp.json();
      if (!resp.ok || !data?.id) {
        throw new Error(
          data?.message || 'Failed to create convenience zone. Please try again.'
        );
      }

      setFinalizeProgress(100);
      setFinalizeStatusMessage('Generation started. Redirecting...');

      router.push('/simulator');
    } catch (err) {
      console.error('Error finalizing CZ:', err);
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to create convenience zone. Please try again.'
      );
      setPhase('edit');
    }
  };

  const saveCZHtmlMap = async () => {
    if (!selectedCBGs.length) {
      setError('Please select at least one CBG');
      return;
    }

    setSavingHtmlMap(true);
    try {
      const suggestedName =
        String(cityName || location || 'cz-map').trim() || 'cz-map';
      const resp = await fetch(algUrl('export-cz-map-html'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cbg_list: selectedCBGs,
          name: suggestedName
        })
      });
      if (!resp.ok) {
        const errorData = await resp.json().catch(() => null);
        throw new Error(
          errorData?.message || 'Failed to export the CZ HTML map.'
        );
      }

      const blob = await resp.blob();
      const disposition = resp.headers.get('content-disposition') || '';
      const filenameMatch = disposition.match(/filename="?([^"]+)"?/);
      const filename =
        filenameMatch?.[1] ||
        `${suggestedName
          .replace(/[^A-Za-z0-9._-]+/g, '-')
          .replace(/^-+|-+$/g, '') || 'cz-map'}.html`;

      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to save CZ HTML map:', err);
      setError(
        err instanceof Error ? err.message : 'Failed to export the CZ HTML map.'
      );
    } finally {
      setSavingHtmlMap(false);
    }
  };

  if (isPending) {
    return <div className="text-white text-center mt-20">Loading...</div>;
  }

  if (!user) {
    return null;
  }

  return (
    <div className="w-full flex justify-center px-2 py-2">
      <form
        onSubmit={handleGenerateSubmit}
        className="w-full max-w-[2200px] flex flex-col gap-4 items-center"
      >
        {hasGenerated ? (
          <div className="w-full flex flex-col gap-4">
            <div className="flex gap-4 w-full flex-wrap 2xl:flex-nowrap">
              <div className="h-[calc(100vh-13rem)] min-h-[34rem] max-h-[48rem] relative flex-1 min-w-[44rem]">
                {cbgGeoJSON ? (
                  <CBGMap
                    cbgData={cbgGeoJSON}
                    center={null}
                    onCBGClick={handleCBGClick}
                    onMapBackgroundClick={handleMapBackgroundClick}
                    onTraceCbgInspect={
                      manualEditPanelsActive ? null : handleTraceCbgInspect
                    }
                    selectedCBGs={selectedCBGs}
                    seedCbgId={seedCBG}
                    seedGuardRadiusKm={seedGuardDistanceKm}
                    showSeedGuardCircle={
                      clusterAlgorithm === 'greedy_weight_seed_guard'
                    }
                    traceLayer={activeMapTraceLayer}
                    editingEnabled={manualEditPanelsActive || !activeMapTraceLayer}
                    focusedCbgId={focusedTraceCbg}
                    focusNonce={focusedTraceNonce}
                  />
                ) : (
                  <div className="h-full w-full flex items-center justify-center bg-gray-100 text-gray-500">
                    <div className="text-center">
                      <p>CBG map not available</p>
                      <p className="text-sm">
                        GeoJSON endpoint needed on Algorithms server
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {showCandidatePanels && (
                <div className="h-[calc(100vh-13rem)] min-h-[34rem] max-h-[48rem] w-[22rem] max-w-[22rem] bg-[#fffff2] border border-[#70B4D4] rounded-lg flex flex-col overflow-hidden">
                  <div className="px-4 py-3 border-b border-[#70B4D4] text-lg font-semibold">
                    Frontier Candidates ({displayCandidates.length})
                  </div>
                  <div className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-2">
                    {!traceLayer && manualFrontierLoading ? (
                      <div className="text-sm text-gray-500 px-2 py-2">
                        Loading frontier candidates...
                      </div>
                    ) : !traceLayer && manualFrontierError ? (
                      <div className="text-sm text-red-700 px-2 py-2">
                        {manualFrontierError}
                      </div>
                    ) : displayCandidates.length === 0 ? (
                      <div className="text-sm text-gray-500 px-2 py-2">
                        {traceLayer
                          ? 'No candidates at this step.'
                          : 'No frontier candidates for the current zone.'}
                      </div>
                    ) : (
                      displayCandidates.map((candidate) => {
                        const cbgId = normalizeCbgId(candidate?.cbg);
                        const isActive =
                          cbgId === normalizeCbgId(selectedTraceCandidateCbg);
                        return (
                          <button
                            type="button"
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
                            <div className="text-base font-semibold leading-tight">
                              #{candidate.rank ?? '?'} {cbgId}
                            </div>
                            <div className="text-base text-gray-700 mt-1">
                              Score: {Number(candidate.score ?? 0).toFixed(4)}
                            </div>
                            <div className="text-base text-gray-600">
                              To cluster:{' '}
                              {Number(
                                candidate.movement_to_cluster ?? 0
                              ).toLocaleString(undefined, {
                                maximumFractionDigits: 1
                              })}
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              )}

              {showCandidatePanels && (
                <div className="h-[calc(100vh-13rem)] min-h-[34rem] max-h-[48rem] w-[22rem] max-w-[22rem] bg-[#fffff2] border border-[#70B4D4] rounded-lg flex flex-col overflow-hidden">
                  <div className="px-4 py-3 border-b border-[#70B4D4] text-lg font-semibold">
                    CBG Analysis
                  </div>
                  <div className="px-4 py-3 border-b border-[#d1d5db] text-sm space-y-1">
                    <div>
                      <span className="font-semibold">CBG:</span>{' '}
                      {selectedTraceCandidateCbg || 'N/A'}
                    </div>
                    <div>
                      <span className="font-semibold">Population:</span>{' '}
                      {String(selectedTraceFeatureProperties?.population ?? 'N/A')}
                    </div>
                    <div>
                      <span className="font-semibold">Status:</span>{' '}
                      {selectedAnalysisStatus}
                    </div>
                    {selectedAnalysisCandidate && (
                      <>
                        <div>
                          <span className="font-semibold">Rank:</span> #
                          {selectedAnalysisCandidate.rank ?? '?'}
                        </div>
                        <div>
                          <span className="font-semibold">Score:</span>{' '}
                          {Number(
                            selectedAnalysisCandidate.score ?? 0
                          ).toFixed(4)}
                        </div>
                        <div>
                          <span className="font-semibold">To Cluster:</span>{' '}
                          {Number(
                            selectedAnalysisCandidate.movement_to_cluster ?? 0
                          ).toLocaleString(undefined, {
                            maximumFractionDigits: 1
                          })}
                        </div>
                        {selectedAnalysisCandidate.movement_to_full_cluster !==
                          undefined && (
                          <div>
                            <span className="font-semibold">
                              To Full Cluster:
                            </span>{' '}
                            {Number(
                              selectedAnalysisCandidate.movement_to_full_cluster ??
                                0
                            ).toLocaleString(undefined, {
                              maximumFractionDigits: 1
                            })}
                          </div>
                        )}
                        <div>
                          <span className="font-semibold">To Outside:</span>{' '}
                          {Number(
                            selectedAnalysisCandidate.movement_to_outside ?? 0
                          ).toLocaleString(undefined, {
                            maximumFractionDigits: 1
                          })}
                        </div>
                        {selectedAnalysisCandidate.seed_distance_km !==
                          undefined && (
                          <div>
                            <span className="font-semibold">
                              Seed Distance:
                            </span>{' '}
                            {Number(
                              selectedAnalysisCandidate.seed_distance_km ?? 0
                            ).toFixed(2)}{' '}
                            km
                          </div>
                        )}
                        {selectedAnalysisCandidate.movement_contributes_after_selection !==
                          undefined && (
                          <div>
                            <span className="font-semibold">
                              Contributes After Add:
                            </span>{' '}
                            {selectedAnalysisCandidate
                              .movement_contributes_after_selection
                              ? 'Yes'
                              : 'No'}
                          </div>
                        )}
                        {selectedAnalysisCandidate.czi_after !== undefined && (
                          <div>
                            <span className="font-semibold">
                              CZI After Add:
                            </span>{' '}
                            {Number(
                              selectedAnalysisCandidate.czi_after ?? 0
                            ).toFixed(4)}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                  <div className="px-4 py-3 border-b border-[#70B4D4] text-sm font-semibold">
                    Top POIs From Current Cluster
                  </div>
                  <div className="flex-1 overflow-y-auto px-4 py-3">
                    {candidatePoiLoading ? (
                      <div className="text-sm text-gray-500">
                        Loading POI analysis...
                      </div>
                    ) : candidatePoiError ? (
                      <div className="space-y-3">
                        <div className="text-sm text-red-700">
                          {candidatePoiError}
                        </div>
                        {candidatePoiDebug && (
                          <div className="rounded border border-[#d1d5db] bg-white/80 p-2">
                            <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-700">
                              Debug Snapshot
                            </div>
                            <pre className="mt-1 whitespace-pre-wrap break-all text-[11px] leading-4 text-gray-600">
                              {JSON.stringify(candidatePoiDebug, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    ) : candidatePois.length === 0 ? (
                      <div className="space-y-3">
                        <div className="text-sm text-gray-500">
                          No cluster-to-POI flow found for this CBG.
                        </div>
                        {candidatePoiDebug && (
                          <div className="rounded border border-[#d1d5db] bg-white/80 p-2">
                            <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-700">
                              Debug Snapshot
                            </div>
                            <pre className="mt-1 whitespace-pre-wrap break-all text-[11px] leading-4 text-gray-600">
                              {JSON.stringify(candidatePoiDebug, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2">
                        {candidatePois.map((poi) => (
                          <div
                            key={`${poi.placekey || poi.location_name}-${poi.rank}`}
                            className="text-sm leading-snug"
                          >
                            <div className="font-medium">
                              {poi.rank}. {poi.location_name || 'Unknown POI'}
                            </div>
                            <div className="text-gray-600">
                              Flow:{' '}
                              {Number(poi.cluster_flow ?? 0).toLocaleString(
                                undefined,
                                {
                                  maximumFractionDigits: 1
                                }
                              )}{' '}
                              ({Number((poi.flow_share ?? 0) * 100).toFixed(1)}%)
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="w-full p-2.5 bg-[#fffff2] outline outline-2 outline-[#70B4D4] rounded-lg flex flex-wrap items-end justify-between gap-3">
              <div>
                {showTraceControls ? (
                  <>
                    <div className="text-sm font-semibold mb-2">
                      Trace Controls
                    </div>
                    {growthTrace?.supports_stepwise && traceSteps.length > 0 ? (
                      <>
                        <label className="flex items-center gap-2 text-xs mb-2">
                          <input
                            type="checkbox"
                            checked={traceEnabled}
                            onChange={(e) => setTraceEnabled(e.target.checked)}
                          />
                          Show frontier heat map
                        </label>
                        <div className="text-xs text-gray-600">
                          Step {Math.min(traceStepIndex, maxTraceStep) + 1} of{' '}
                          {traceSteps.length}
                        </div>
                        <div className="mt-2 flex gap-2">
                          <button
                            type="button"
                            className="px-2 py-1 text-xs rounded border border-[#70B4D4] disabled:opacity-40"
                            disabled={!traceEnabled || traceStepIndex <= 0}
                            onClick={() => jumpToTraceStep(traceStepIndex - 1)}
                          >
                            Previous Step
                          </button>
                          <button
                            type="button"
                            className="px-2 py-1 text-xs rounded border border-[#70B4D4] disabled:opacity-40"
                            disabled={!traceEnabled || traceStepIndex >= maxTraceStep}
                            onClick={() => jumpToTraceStep(traceStepIndex + 1)}
                          >
                            Next Step
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="text-xs text-gray-600">
                        {growthTrace?.note ||
                          'This algorithm does not expose a step-by-step greedy expansion trace.'}
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div className="text-sm font-semibold mb-2">
                      Zone Metrics (Live)
                    </div>
                    {zoneMetricsLoading ? (
                      <div className="text-xs text-gray-600">
                        Computing CZI...
                      </div>
                    ) : zoneMetricsError ? (
                      <div className="text-xs text-red-700">
                        {zoneMetricsError}
                      </div>
                    ) : zoneMetrics ? (
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-700">
                        <div>
                          <span className="font-semibold">CBGs:</span>{' '}
                          {zoneMetrics.cbg_count ?? selectedCBGs.length}
                        </div>
                        <div>
                          <span className="font-semibold">CZI:</span>{' '}
                          {Number(zoneMetrics.czi ?? 0).toFixed(4)}
                        </div>
                        <div>
                          <span className="font-semibold">Inside:</span>{' '}
                          {Number(
                            zoneMetrics.movement_inside ?? 0
                          ).toLocaleString(undefined, {
                            maximumFractionDigits: 1
                          })}
                        </div>
                        <div>
                          <span className="font-semibold">Boundary:</span>{' '}
                          {Number(
                            zoneMetrics.movement_boundary ?? 0
                          ).toLocaleString(undefined, {
                            maximumFractionDigits: 1
                          })}
                        </div>
                      </div>
                    ) : (
                      <div className="text-xs text-gray-600">
                        No metrics available.
                      </div>
                    )}
                    <div className="mt-1 text-xs text-gray-600">
                      Click CBGs on the map to add or remove them. Frontier
                      candidates update automatically.
                    </div>
                  </>
                )}
              </div>

              {clusterAlgorithm === 'greedy_weight_seed_guard' &&
                manualEditPanelsActive && (
                  <div className="min-w-[15rem] max-w-[18rem] flex flex-col gap-1">
                    <label
                      htmlFor="seed_guard_distance_live"
                      className="text-sm font-semibold"
                    >
                      Seed Guard Radius (km)
                    </label>
                    <input
                      id="seed_guard_distance_live"
                      className="formfield"
                      type="number"
                      min={0}
                      max={500}
                      value={seedGuardDistanceKm}
                      onChange={(e) =>
                        setSeedGuardDistanceKm(Number(e.target.value))
                      }
                      disabled={loading || isFinalizing}
                    />
                    <div className="text-xs text-gray-600">
                      Blue ring shows the seed guard radius and updates live as
                      you change it.
                    </div>
                  </div>
                )}

              <div className="flex items-center gap-2">
                {isFinalizing && (
                  <div className="w-full rounded-lg border border-[#70B4D4] bg-white px-4 py-3">
                    <div className="h-2.5 w-full overflow-hidden rounded-full bg-[#d1d5db]">
                      <div
                        className="h-full rounded-full bg-[#70B4D4] transition-all duration-300"
                        style={{
                          width: `${Math.max(
                            2,
                            Math.min(100, finalizeProgress)
                          )}%`
                        }}
                      />
                    </div>
                    <div className="mt-2 text-xs text-gray-600">
                      {finalizeStatusMessage || 'Generating convenience zone...'}{' '}
                      {finalizeProgress}%
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                {growthTrace && !zoneEditMode && (
                  <button
                    type="button"
                    onClick={() => {
                      setZoneEditMode(true);
                      setTraceEnabled(false);
                    }}
                    disabled={loading || isFinalizing}
                    className="px-4 py-2 rounded-lg border border-[#70B4D4] bg-white text-[#1f2937] font-semibold disabled:opacity-40"
                  >
                    Edit Zone
                  </button>
                )}
                {growthTrace && zoneEditMode && (
                  <button
                    type="button"
                    onClick={() => {
                      setZoneEditMode(false);
                      setTraceEnabled(Boolean(growthTrace?.steps?.length));
                    }}
                    disabled={loading || isFinalizing}
                    className="px-4 py-2 rounded-lg border border-[#70B4D4] bg-white text-[#1f2937] font-semibold disabled:opacity-40"
                  >
                    Trace View
                  </button>
                )}
                <button
                  type="button"
                  onClick={saveCZHtmlMap}
                  disabled={loading || isFinalizing || savingHtmlMap}
                  className="px-4 py-2 rounded-lg border border-[#70B4D4] bg-white text-[#1f2937] font-semibold disabled:opacity-40"
                >
                  {savingHtmlMap ? 'Saving HTML Map...' : 'Save HTML Map'}
                </button>
                <button
                  type="button"
                  onClick={finalizeCZ}
                  disabled={loading || isFinalizing}
                  className="px-4 py-2 rounded-lg border border-[#70B4D4] bg-[#e0f2fe] text-[#1f2937] font-semibold disabled:opacity-40"
                >
                  {isFinalizing ? 'Generating Patterns...' : 'Finalize & Generate'}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="w-full flex flex-col gap-4 lg:flex-row lg:items-stretch">
            <div className="h-[calc(100vh-10rem)] min-h-[36rem] lg:h-[calc(100vh-6rem)] lg:min-h-[42rem] w-full lg:min-w-0 lg:flex-1">
              <InteractiveMap
                onLocationSelect={(coords) => {
                  resetSeedPreview();
                  setLocation(coords);
                }}
                disabled={loading || resolvingSeed}
                seedGeoJSON={setupSeedGeoJSON}
                seedCbgId={setupSeedCbg}
                seedGuardRadiusKm={seedGuardDistanceKm}
                showSeedGuardCircle={
                  clusterAlgorithm === 'greedy_weight_seed_guard'
                }
              />
            </div>

            <div className="w-full rounded-lg border border-[#70B4D4] bg-[#fffff2] p-4 lg:w-[30rem] xl:w-[32rem] lg:flex-none lg:h-[calc(100vh-6rem)] lg:overflow-y-auto">
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end lg:flex-col xl:flex-row xl:items-end">
                  <div className="flex-1 min-w-0">
                    <FormField
                      label="City, Address, or Location"
                      name="location"
                      type="text"
                      placeholder="e.g. 55902 or TEST"
                      value={location}
                      onChange={(e) => {
                        resetSeedPreview();
                        setLocation(e.target.value);
                      }}
                      disabled={loading || resolvingSeed}
                    />
                  </div>
                  <div className="w-full sm:w-[12rem] lg:w-full xl:w-[12rem]">
                    <button
                      type="button"
                      onClick={resolveSeedPreview}
                      disabled={
                        loading ||
                        resolvingSeed ||
                        !location.trim() ||
                        isTestLocationInput
                      }
                      className="w-full px-4 py-2 rounded-lg border border-[#70B4D4] bg-white text-[#1f2937] font-semibold disabled:opacity-40"
                    >
                      {resolvingSeed ? 'Resolving Seed...' : 'Resolve Seed'}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="w-full">
                    <FormField
                      label="Minimum Population"
                      name="min_pop"
                      type="number"
                      value={minPop}
                      min={100}
                      max={100_000}
                      onChange={(e) => setMinPop(Number(e.target.value))}
                      disabled={loading}
                    />
                  </div>
                  <div className="w-full sm:col-span-2">
                    <FormField
                      label="Clustering Algorithm"
                      name="algorithm"
                      type="select"
                      value={clusterAlgorithm}
                      options={CLUSTER_ALGORITHM_OPTIONS.map((option) => ({
                        value: option.value,
                        label: option.label
                      }))}
                      onChange={(e) =>
                        setClusterAlgorithm(e.target.value as ClusterAlgorithm)
                      }
                      disabled={loading}
                    />
                  </div>
                  <div className="w-full">
                    <FormField
                      label="Start Date"
                      name="start_date"
                      type="date"
                      value={startDate}
                      onChange={(e) => {
                        const nextStart = e.target.value;
                        setStartDate(nextStart);
                        const currentLength = getLengthHours(nextStart, endDate);
                        if (!currentLength || currentLength <= 0) {
                          setEndDate(getDefaultEndDate(nextStart));
                        }
                      }}
                      disabled={loading}
                    />
                  </div>
                  <div className="w-full">
                    <FormField
                      label="End Date"
                      name="end_date"
                      type="date"
                      value={endDate}
                      min={startDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      disabled={loading}
                    />
                  </div>
                  <div className="w-full sm:col-span-2">
                    <FormField
                      label="Description"
                      name="description"
                      type="textarea"
                      placeholder="a short description for this convenience zone..."
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      disabled={loading}
                      required={false}
                    />
                  </div>
                </div>

                {(setupSeedCbg || seedResolveError || isTestLocationInput) && (
                  <div className="flex flex-col gap-2 text-sm">
                    {setupSeedCbg && (
                      <div className="rounded-lg border border-[#70B4D4] bg-[#eff6ff] px-3 py-2 text-[#1e3a8a]">
                        <span className="font-semibold">Resolved Seed:</span>{' '}
                        {setupSeedCbg}
                        {setupResolvedCityName
                          ? ` for ${setupResolvedCityName}`
                          : ''}
                        {clusterAlgorithm === 'greedy_weight_seed_guard'
                          ? ` | Blue ring radius: ${seedGuardDistanceKm} km`
                          : ''}
                      </div>
                    )}
                    {!setupSeedCbg && isTestLocationInput && (
                      <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900">
                        Seed preview is unavailable in TEST mode.
                      </div>
                    )}
                    {seedResolveError && (
                      <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-red-700">
                        {seedResolveError}
                      </div>
                    )}
                  </div>
                )}

                {clusterAlgorithm === 'greedy_weight_seed_guard' && (
                  <div className="text-xs text-gray-600">
                    Resolve the seed, adjust the blue radius, then preview the
                    cluster.
                  </div>
                )}

                {clusterAlgorithm === 'greedy_weight_seed_guard' && (
                  <div className="rounded-lg border border-[#70B4D4] p-3 bg-[#fffff2] w-full">
                    <button
                      type="button"
                      className="text-sm font-semibold text-left w-full"
                      onClick={() =>
                        setShowAdvancedClustering((prev) => !prev)
                      }
                      disabled={loading}
                    >
                      Advanced Clustering {showAdvancedClustering ? 'v' : '>'}
                    </button>
                    {showAdvancedClustering && (
                      <div className="mt-3 flex flex-col gap-3">
                        <FormField
                          label="Seed Guard Distance (km)"
                          name="seed_guard_distance_km"
                          type="number"
                          value={seedGuardDistanceKm}
                          min={0}
                          max={500}
                          onChange={(e) =>
                            setSeedGuardDistanceKm(Number(e.target.value))
                          }
                          disabled={loading}
                        />
                        <div className="text-xs text-gray-600">
                          Distant CBGs can still be added, but they will stop
                          influencing later picks.
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="pt-1">
                  <button
                    type="submit"
                    disabled={
                      loading ||
                      resolvingSeed ||
                      (seedGuardNeedsResolvedSeed && !setupSeedCbg)
                    }
                    className="w-full px-4 py-2 rounded-lg border border-[#70B4D4] bg-[#e0f2fe] text-[#1f2937] font-semibold disabled:opacity-40"
                  >
                    {loading ? 'Clustering...' : 'Preview CBGs'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="text-red-500 text-center mx-4 max-w-100">{error}</div>
        )}

      </form>
    </div>
  );
}
