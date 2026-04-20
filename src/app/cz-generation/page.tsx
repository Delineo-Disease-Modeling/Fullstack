'use client';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSession } from '@/lib/auth-client';
import {
  mergeGeoJsonFeatures,
  normalizeCbgId,
  getFeatureCbgId,
  getBoundsForGeoJson,
  type GeoJSONData,
  type LatLng
} from '@/lib/cz-geo';
import type { ConvenienceZone } from '@/stores/simsettings';
import { getStateFromCBG } from '@/lib/simulation-zone';
import '@/styles/cz-generation.css';

const InteractiveMap = dynamic(() => import('@/components/interactive-map'), {
  ssr: false
});
const CBGMap = dynamic(() => import('@/components/cbg-map'), { ssr: false });

const CLUSTER_ALGORITHM_OPTIONS = [
  {
    value: 'guided_second_order_regions',
    label: 'Guided Connected Cities'
  },
  {
    value: 'hierarchical_core_satellites',
    label: 'Hierarchical Core + Satellites'
  },
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
  algorithm_metadata?: HierarchicalAlgorithmMetadata | null;
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
  seedName: string;
  seedCbgs: string[];
  seedZip?: string;
};

type LookupLocationResult = {
  cbg: string;
  city: string;
  state: string;
  zip?: string;
  seed_type: 'zip' | 'cbg';
  seed_name: string;
  seed_cbgs: string[];
};

type HierarchicalSatellite = {
  unit_id?: string;
  label?: string;
  population?: number;
  coupling?: number;
  shared_flow?: number;
  cbg_count?: number;
};

type HierarchicalAlgorithmMetadata = {
  seed_cbgs?: string[];
  seed_zip_codes?: string[];
  core_cluster?: string[];
  core_population?: number;
  core_containment?: {
    origin?: number;
    destination?: number;
    zone?: number;
  };
  final_containment?: {
    origin?: number;
    destination?: number;
    zone?: number;
  };
  selected_satellites?: HierarchicalSatellite[];
  external_pressure_share?: number;
  population_target_met?: boolean;
};

type GuidedLinkedCbgDetail = {
  cbg?: string;
  population?: number;
  seed_outbound_flow?: number;
  seed_inbound_flow?: number;
  seed_bidirectional_flow?: number;
  distance_km?: number;
  gateway_score?: number;
};

type GuidedDestinationCandidate = {
  unit_id: string;
  label: string;
  unit_type?: string;
  cbgs: string[];
  gateway_cbgs?: GuidedLinkedCbgDetail[];
  cbg_count?: number;
  city_cbg_count?: number;
  zip_codes?: string[];
  zip_count?: number;
  population?: number;
  city_population?: number;
  outbound_flow?: number;
  inbound_flow?: number;
  bidirectional_flow?: number;
  coupling?: number;
  share_of_seed_external_bidirectional?: number;
  share_of_seed_total_movement?: number;
  share_of_seed_external_outbound?: number;
  cumulative_external_bidirectional_share?: number;
  cumulative_external_outbound_share?: number;
  cumulative_seed_total_movement_share?: number;
  captured_bidirectional_flow?: number;
  captured_bidirectional_flow_share?: number;
  distance_km?: number;
  recommended?: boolean;
};

type GuidedSecondOrderMetadata = {
  seed_cbg: string;
  seed_cbgs: string[];
  seed_zip_codes?: string[];
  seed_city_labels?: string[];
  missing_seed_cbgs?: string[];
  seed_population?: number;
  total_seed_movement?: number;
  total_seed_internal_movement?: number;
  total_seed_external_outbound_flow?: number;
  total_seed_external_inbound_flow?: number;
  total_seed_external_bidirectional_flow?: number;
  unit_type?: string;
  approximation_note?: string;
  destination_count?: number;
  destinations: GuidedDestinationCandidate[];
  recommended_unit_ids?: string[];
  recommended_captured_external_bidirectional_share?: number;
  recommended_captured_external_outbound_share?: number;
  recommended_captured_seed_total_movement_share?: number;
  recommended_explicit_population?: number;
  recommended_explicit_population_cap?: number;
};

type GuidedSelectionStyle = {
  fillColor: string;
  lineColor: string;
};

type ClusteringPreviewResponse = {
  cluster?: string[];
  clustering_id?: number | string;
  seed_cbg?: string;
  center?: [number, number] | null;
  size?: number | string;
  use_test_data?: boolean;
  algorithm_metadata?: HierarchicalAlgorithmMetadata | null;
  trace?: TracePayload | null;
  algorithm?: string;
  clustering_params?: {
    seed_guard_distance_km?: number | string;
  } | null;
  geojson?: GeoJSONData | null;
  trace_geojson?: GeoJSONData | null;
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
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >
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
            onChange as
              | React.ChangeEventHandler<HTMLTextAreaElement>
              | undefined
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

function dedupeCbgList(values: string[]) {
  return Array.from(
    new Set(values.map((value) => normalizeCbgId(value)).filter(Boolean))
  );
}

function sameStringArray(a: string[], b: string[]) {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

const GUIDED_REGION_PALETTE: GuidedSelectionStyle[] = [
  { fillColor: '#f59e0b', lineColor: '#b45309' },
  { fillColor: '#10b981', lineColor: '#047857' },
  { fillColor: '#ef4444', lineColor: '#b91c1c' },
  { fillColor: '#06b6d4', lineColor: '#0e7490' },
  { fillColor: '#eab308', lineColor: '#a16207' },
  { fillColor: '#f97316', lineColor: '#c2410c' }
];

const GUIDED_SEED_STYLE: GuidedSelectionStyle = {
  fillColor: '#2563eb',
  lineColor: '#1d4ed8'
};

const GUIDED_SOFT_EXPLICIT_POPULATION = 25000;
const GUIDED_HARD_EXPLICIT_POPULATION = 50000;

function monthFromDate(dateStr: string): string {
  return String(dateStr || '').slice(0, 7);
}

function startDateFromMonth(month: string): string {
  return `${month}-01`;
}

function endDateFromMonth(month: string): string {
  const [yStr, mStr] = month.split('-');
  const y = Number(yStr);
  const m = Number(mStr);
  if (!Number.isFinite(y) || !Number.isFinite(m)) {
    return `${month}-28`;
  }
  const nextMonth = m === 12 ? 1 : m + 1;
  const nextYear = m === 12 ? y + 1 : y;
  return `${nextYear.toString().padStart(4, '0')}-${nextMonth
    .toString()
    .padStart(2, '0')}-01`;
}

function monthFromEndDate(endDate: string): string {
  const [yStr, mStr] = endDate.split('-');
  const y = Number(yStr);
  const m = Number(mStr);
  if (!Number.isFinite(y) || !Number.isFinite(m)) {
    return monthFromDate(endDate);
  }
  const prevMonth = m === 1 ? 12 : m - 1;
  const prevYear = m === 1 ? y - 1 : y;
  return `${prevYear.toString().padStart(4, '0')}-${prevMonth
    .toString()
    .padStart(2, '0')}`;
}

function formatMonthLabel(month: string): string {
  const [yStr, mStr] = month.split('-');
  const y = Number(yStr);
  const m = Number(mStr);
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) {
    return month;
  }
  const date = new Date(Date.UTC(y, m - 1, 1));
  return date.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC'
  });
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

async function fetchZoneById(zoneId: number): Promise<ConvenienceZone | null> {
  try {
    const res = await fetch('/api/convenience-zones');
    if (!res.ok) return null;
    const json = await res.json().catch(() => ({}));
    const zones = Array.isArray(json?.data) ? json.data : [];
    const match = zones.find((z: ConvenienceZone) => z.id === zoneId);
    return match?.ready ? (match as ConvenienceZone) : null;
  } catch {
    return null;
  }
}

function waitForZoneReady(
  zoneId: number,
  onProgress: (percent: number) => void
): Promise<ConvenienceZone | null> {
  return new Promise((resolve) => {
    let done = false;
    let currentProgress = 15;
    let es: EventSource | null = null;

    const finish = (zone: ConvenienceZone | null) => {
      if (done) return;
      done = true;
      if (progressTimer) clearInterval(progressTimer);
      if (pollTimer) clearInterval(pollTimer);
      if (es) es.close();
      resolve(zone);
    };

    const progressTimer = window.setInterval(() => {
      if (done) return;
      currentProgress = Math.min(
        92,
        currentProgress + (92 - currentProgress) * 0.05
      );
      onProgress(Math.round(currentProgress));
    }, 1000);

    const checkReady = async () => {
      const zone = await fetchZoneById(zoneId);
      if (zone) finish(zone);
    };

    const pollTimer = window.setInterval(checkReady, 5000);

    try {
      es = new EventSource('/api/convenience-zones/events');
      es.onmessage = (ev) => {
        try {
          const payload = JSON.parse(ev.data);
          if (
            payload?.type === 'zone-ready' &&
            Number(payload.zone_id) === zoneId
          ) {
            checkReady();
          }
        } catch {
          // ignore non-JSON heartbeats
        }
      };
      es.onerror = () => {
        // polling remains as fallback
      };
    } catch {
      // EventSource may be unavailable; polling will still run
    }

    checkReady();
  });
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
  const [clusterAlgorithm, setClusterAlgorithm] = useState<ClusterAlgorithm>(
    'guided_second_order_regions'
  );
  const [showAdvancedClustering, setShowAdvancedClustering] = useState(false);
  const [seedGuardDistanceKm, setSeedGuardDistanceKm] = useState(20);
  const [setupSeedCbg, setSetupSeedCbg] = useState('');
  const [setupSeedLabel, setSetupSeedLabel] = useState('');
  const [setupSeedCount, setSetupSeedCount] = useState(0);
  const [setupSeedGeoJSON, setSetupSeedGeoJSON] = useState<GeoJSONData | null>(
    null
  );
  const [setupResolvedCityName, setSetupResolvedCityName] = useState('');
  const [resolvedSeedLookup, setResolvedSeedLookup] =
    useState<ResolvedSeedLookup | null>(null);
  const [resolvingSeed, setResolvingSeed] = useState(false);
  const [seedResolveError, setSeedResolveError] = useState('');
  const [startDate, setStartDate] = useState('2019-01-01');
  const [endDate, setEndDate] = useState('2019-02-01');
  const [availableMonths, setAvailableMonths] = useState<string[]>([]);
  const [availableMonthsLoading, setAvailableMonthsLoading] = useState(false);
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [phase, setPhase] = useState<'input' | 'edit' | 'finalizing'>('input');
  const [cbgGeoJSON, setCbgGeoJSON] = useState<GeoJSONData | null>(null);
  const [selectedCBGs, setSelectedCBGs] = useState<string[]>([]);
  const [seedCBG, setSeedCBG] = useState('');
  const [, setTotalPopulation] = useState(0);
  const [useTestData, setUseTestData] = useState(false);
  const [mapCenter, setMapCenter] = useState<[number, number] | null>(null);
  const [cityName, setCityName] = useState('');
  const [growthTrace, setGrowthTrace] = useState<TracePayload | null>(null);
  const [algorithmMetadata, setAlgorithmMetadata] =
    useState<HierarchicalAlgorithmMetadata | null>(null);
  const [guidedMetadata, setGuidedMetadata] =
    useState<GuidedSecondOrderMetadata | null>(null);
  const [guidedDestinations, setGuidedDestinations] = useState<
    GuidedDestinationCandidate[]
  >([]);
  const [guidedSeedCbgs, setGuidedSeedCbgs] = useState<string[]>([]);
  const [selectedGuidedDestinationIds, setSelectedGuidedDestinationIds] =
    useState<string[]>([]);
  const [guidedDestinationLoading, setGuidedDestinationLoading] =
    useState(false);
  const [guidedDestinationError, setGuidedDestinationError] = useState('');
  const [showGuidedTermsHelp, setShowGuidedTermsHelp] = useState(false);
  const [showGuidedSummaryPanel, setShowGuidedSummaryPanel] = useState(false);
  const [traceEnabled, setTraceEnabled] = useState(false);
  const [traceStepIndex, setTraceStepIndex] = useState(0);
  const [selectedTraceCandidateCbg, setSelectedTraceCandidateCbg] =
    useState('');
  const [focusedTraceCbg, setFocusedTraceCbg] = useState('');
  const [focusedTraceNonce, setFocusedTraceNonce] = useState(0);
  const [candidatePois, setCandidatePois] = useState<PoiAnalysis[]>([]);
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
  const [_cziMetrics, setCziMetrics] = useState<ZoneMetrics | null>(null);
  const [_cziLoading, setCziLoading] = useState(false);
  const [finalizeProgress, setFinalizeProgress] = useState(0);
  const [finalizeStatusMessage, setFinalizeStatusMessage] = useState('');
  const hasGenerated = phase === 'edit' || phase === 'finalizing';
  const isFinalizing = phase === 'finalizing';
  const isGuidedSecondOrderAlgorithm =
    clusterAlgorithm === 'guided_second_order_regions';
  const guidedSelectionMode = hasGenerated && isGuidedSecondOrderAlgorithm;
  const isTestLocationInput =
    String(location ?? '')
      .trim()
      .toUpperCase() === 'TEST';
  const traceSteps = growthTrace?.steps ?? [];
  const maxTraceStep = traceSteps.length > 0 ? traceSteps.length - 1 : 0;
  const activeTraceStep =
    traceSteps[clampIndex(traceStepIndex, 0, maxTraceStep)] ?? null;
  const activeTraceCandidates = Array.isArray(activeTraceStep?.candidates)
    ? activeTraceStep.candidates
    : EMPTY_LIST;

  const guidedSelectedDestinations = useMemo(
    () =>
      guidedDestinations.filter((destination) =>
        selectedGuidedDestinationIds.includes(destination.unit_id)
      ),
    [guidedDestinations, selectedGuidedDestinationIds]
  );

  const guidedSelectionSummary = useMemo(() => {
    const selectedLinkedOutboundFlow = guidedSelectedDestinations.reduce(
      (sum, destination) =>
        sum +
        (destination.gateway_cbgs ?? []).reduce(
          (inner, detail) => inner + Number(detail.seed_outbound_flow ?? 0),
          0
        ),
      0
    );
    const selectedLinkedOutboundShare = Math.min(
      1,
      Number(guidedMetadata?.total_seed_external_outbound_flow ?? 0) > 0
        ? selectedLinkedOutboundFlow /
            Number(guidedMetadata?.total_seed_external_outbound_flow ?? 0)
        : 0
    );
    const selectedExternalBidirectionalShare = Math.min(
      1,
      guidedSelectedDestinations.reduce(
        (sum, destination) =>
          sum + Number(destination.share_of_seed_external_bidirectional ?? 0),
        0
      )
    );
    const selectedSeedMovementShare = Math.min(
      1,
      guidedSelectedDestinations.reduce(
        (sum, destination) =>
          sum + Number(destination.share_of_seed_total_movement ?? 0),
        0
      )
    );
    const selectedPopulation =
      Number(guidedMetadata?.seed_population ?? 0) +
      guidedSelectedDestinations.reduce(
        (sum, destination) => sum + Number(destination.population ?? 0),
        0
      );
    return {
      selectedLinkedOutboundFlow,
      selectedLinkedOutboundShare,
      selectedExternalBidirectionalShare,
      selectedSeedMovementShare,
      externalRemainderShare: Math.max(
        0,
        1 - selectedExternalBidirectionalShare
      ),
      selectedPopulation
    };
  }, [guidedMetadata, guidedSelectedDestinations]);

  const guidedSeedLabel = useMemo(() => {
    if (guidedMetadata?.seed_city_labels?.length) {
      return guidedMetadata.seed_city_labels.join(', ');
    }
    if (guidedMetadata?.seed_zip_codes?.length) {
      return guidedMetadata.seed_zip_codes.join(', ');
    }
    return `${guidedSeedCbgs.length} seed CBGs`;
  }, [guidedMetadata, guidedSeedCbgs]);

  const guidedSelectedDestinationSummary = useMemo(() => {
    const labels = guidedSelectedDestinations
      .map((destination) => destination.label)
      .filter(Boolean);
    if (labels.length === 0) {
      return 'Seed only';
    }
    if (labels.length <= 3) {
      return labels.join(', ');
    }
    return `${labels.slice(0, 3).join(', ')} +${labels.length - 3} more`;
  }, [guidedSelectedDestinations]);

  const guidedStyleByUnitId = useMemo(() => {
    const styleMap = new Map<string, GuidedSelectionStyle>();
    guidedSelectedDestinations.forEach((destination, index) => {
      styleMap.set(
        destination.unit_id,
        GUIDED_REGION_PALETTE[index % GUIDED_REGION_PALETTE.length]
      );
    });
    return styleMap;
  }, [guidedSelectedDestinations]);

  const guidedSelectionStyleByCbg = useMemo(() => {
    if (!guidedSelectionMode) {
      return null;
    }
    const styleMap = new Map<string, GuidedSelectionStyle>();
    guidedSeedCbgs.forEach((cbg) => {
      const normalized = normalizeCbgId(cbg);
      if (normalized) {
        styleMap.set(normalized, GUIDED_SEED_STYLE);
      }
    });
    guidedSelectedDestinations.forEach((destination) => {
      const style =
        guidedStyleByUnitId.get(destination.unit_id) || GUIDED_SEED_STYLE;
      destination.cbgs.forEach((cbg) => {
        const normalized = normalizeCbgId(cbg);
        if (normalized) {
          styleMap.set(normalized, style);
        }
      });
    });
    return styleMap;
  }, [
    guidedSeedCbgs,
    guidedSelectedDestinations,
    guidedSelectionMode,
    guidedStyleByUnitId
  ]);

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
  const showCandidatePanels =
    !guidedSelectionMode && (Boolean(traceLayer) || manualEditPanelsActive);
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
  }, [
    manualEditPanelsActive,
    manualFrontierCandidates,
    selectedCBGs,
    selectedTraceCandidateCbg
  ]);

  const activeMapTraceLayer = guidedSelectionMode
    ? null
    : manualEditPanelsActive
      ? manualHeatmapLayer
      : traceLayer;
  const showTraceControls = Boolean(growthTrace) && !zoneEditMode;
  const seedGuardNeedsResolvedSeed =
    clusterAlgorithm === 'greedy_weight_seed_guard' && !isTestLocationInput;

  const resetSeedPreview = useCallback(() => {
    setSetupSeedCbg('');
    setSetupSeedLabel('');
    setSetupSeedCount(0);
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

  const seedStateCbg = setupSeedCbg || seedCBG || selectedCBGs[0] || '';
  const detectedStateAbbr = getStateFromCBG(
    seedStateCbg ? [seedStateCbg] : null
  );

  useEffect(() => {
    if (!detectedStateAbbr) {
      setAvailableMonths([]);
      setAvailableMonthsLoading(false);
      return undefined;
    }

    const controller = new AbortController();
    setAvailableMonthsLoading(true);

    const params = new URLSearchParams({
      state: detectedStateAbbr,
      start_date: '2018-01-01',
      end_date: '2025-12-31'
    });

    fetch(algUrl(`pattern-availability?${params.toString()}`), {
      signal: controller.signal
    })
      .then(async (resp) => {
        if (!resp.ok) {
          throw new Error(`Pattern availability failed: ${resp.status}`);
        }
        const json = await resp.json();
        const months = Array.isArray(json?.data?.available_months)
          ? (json.data.available_months as unknown[]).filter(
              (m): m is string => typeof m === 'string'
            )
          : [];
        setAvailableMonths(months);
      })
      .catch((err) => {
        if ((err as Error).name === 'AbortError') {
          return;
        }
        console.warn('Failed to load available months:', err);
        setAvailableMonths([]);
      })
      .finally(() => {
        setAvailableMonthsLoading(false);
      });

    return () => controller.abort();
  }, [algUrl, detectedStateAbbr]);

  const monthOptions = useMemo(
    () => [...availableMonths].sort(),
    [availableMonths]
  );

  useEffect(() => {
    if (availableMonths.length === 0) return;
    const currentStart = monthFromDate(startDate);
    const currentEnd = monthFromEndDate(endDate);
    if (!availableMonths.includes(currentStart)) {
      const nextStart = availableMonths[0];
      setStartDate(startDateFromMonth(nextStart));
      if (!availableMonths.includes(currentEnd) || currentEnd < nextStart) {
        setEndDate(endDateFromMonth(nextStart));
      }
    } else if (!availableMonths.includes(currentEnd)) {
      setEndDate(endDateFromMonth(currentStart));
    }
  }, [availableMonths, startDate, endDate]);

  useEffect(() => {
    if (phase !== 'input') {
      return;
    }
    resetSeedPreview();
  }, [phase, resetSeedPreview]);

  useEffect(() => {
    if (!guidedSelectionMode) {
      setShowGuidedSummaryPanel(false);
      return;
    }

    const nextSelectedCBGs = dedupeCbgList([
      ...guidedSeedCbgs,
      ...guidedSelectedDestinations.flatMap((destination) => destination.cbgs)
    ]);

    setSelectedCBGs((prev) =>
      sameStringArray(prev, nextSelectedCBGs) ? prev : nextSelectedCBGs
    );
    setTotalPopulation(guidedSelectionSummary.selectedPopulation);
  }, [
    guidedSeedCbgs,
    guidedSelectedDestinations,
    guidedSelectionMode,
    guidedSelectionSummary.selectedPopulation
  ]);

  useEffect(() => {
    if (!guidedSelectionMode || selectedCBGs.length === 0) {
      return;
    }

    let cancelled = false;
    fetch(
      `${algUrl('cbg-geojson')}?cbgs=${encodeURIComponent(
        selectedCBGs.join(',')
      )}&include_neighbors=false`
    )
      .then(async (resp) => {
        const data = await resp.json().catch(() => null);
        if (cancelled || !resp.ok || !data?.features?.length) {
          return;
        }
        const geojson = data as GeoJSONData;
        setCbgGeoJSON(geojson);
        const bounds = getBoundsForGeoJson(geojson);
        if (bounds) {
          setMapCenter([
            (bounds[0][1] + bounds[1][1]) / 2,
            (bounds[0][0] + bounds[1][0]) / 2
          ]);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.warn('Failed to load guided selection GeoJSON:', err);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [algUrl, guidedSelectionMode, selectedCBGs]);

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
    if (
      featureExists ||
      attemptedTraceGeoJsonFetchRef.current.has(normalized)
    ) {
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
      return;
    }

    const poiCluster = traceLayer
      ? Array.isArray(activeTraceStep?.cluster_before)
        ? activeTraceStep.cluster_before
        : []
      : selectedCBGs;
    if (!poiCluster.length) {
      setCandidatePois([]);
      setCandidatePoiError('');
      return;
    }

    let cancelled = false;
    setCandidatePoiLoading(true);
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
        if (!resp.ok) {
          throw new Error(
            getResponseErrorMessage(resp, data, 'Failed to load POI analysis.')
          );
        }
        setCandidatePois(
          Array.isArray(data?.pois) ? (data.pois as PoiAnalysis[]) : []
        );
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
    if (
      guidedSelectionMode ||
      !manualEditPanelsActive ||
      !seedCBG ||
      !selectedCBGs.length
    ) {
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
          err instanceof Error
            ? err.message
            : 'Failed to load frontier candidates.'
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
    guidedSelectionMode,
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
    if (
      guidedSelectionMode ||
      !manualEditPanelsActive ||
      !seedCBG ||
      !selectedCBGs.length
    ) {
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
  }, [
    algUrl,
    guidedSelectionMode,
    manualEditPanelsActive,
    seedCBG,
    selectedCBGs,
    startDate,
    useTestData
  ]);

  const lookupLocation = async (
    query: string
  ): Promise<LookupLocationResult | null> => {
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
    (clusteringId: number): Promise<ClusteringPreviewResponse> =>
      new Promise((resolve, reject) => {
        let settled = false;
        const eventSource = new EventSource(
          algUrl(`clustering-progress/${clusteringId}`)
        );
        const timeout = window.setTimeout(
          () => {
            if (settled) {
              return;
            }
            settled = true;
            eventSource.close();
            reject(
              new Error(
                'Timed out waiting for the clustering preview to finish.'
              )
            );
          },
          5 * 60 * 1000
        );

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

          finish(() => resolve(result as ClusteringPreviewResponse));
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
      const seedCbgs = Array.isArray(locationData?.seed_cbgs)
        ? locationData.seed_cbgs.filter(
            (cbg): cbg is string => typeof cbg === 'string'
          )
        : coreCbg
          ? [coreCbg]
          : [];
      if (!coreCbg) {
        throw new Error(
          'Could not resolve a seed CBG. Try a 5-digit ZIP code such as 21201.'
        );
      }

      const resp = await fetch(
        `${algUrl('cbg-geojson')}?cbgs=${encodeURIComponent(
          seedCbgs.join(',')
        )}&include_neighbors=false`
      );
      const seedGeoJson = await resp.json();
      if (!resp.ok || !seedGeoJson?.features?.length) {
        throw new Error(
          seedGeoJson?.message ||
            'Resolved the seed CBG, but could not load its map boundary.'
        );
      }

      setSetupSeedCbg(coreCbg);
      setSetupSeedLabel(locationData?.seed_name || coreCbg);
      setSetupSeedCount(seedCbgs.length);
      setSetupSeedGeoJSON(seedGeoJson);
      const cityName =
        locationData?.city && locationData?.state
          ? `${locationData.city}, ${locationData.state}`
          : locationData?.city || locationData?.state || rawLocationInput;
      setSetupResolvedCityName(cityName);
      setResolvedSeedLookup({
        query: rawLocationInput,
        cbg: coreCbg,
        cityName,
        seedName: locationData?.seed_name || coreCbg,
        seedCbgs,
        seedZip: locationData?.zip
      });
    } catch (err) {
      setSetupSeedCbg('');
      setSetupSeedLabel('');
      setSetupSeedCount(0);
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

  const toggleGuidedDestination = (destination: GuidedDestinationCandidate) => {
    setSelectedGuidedDestinationIds((prev) => {
      const next = prev.includes(destination.unit_id)
        ? prev.filter((unitId) => unitId !== destination.unit_id)
        : [...prev, destination.unit_id];
      return guidedDestinations
        .map((item) => item.unit_id)
        .filter((unitId) => next.includes(unitId));
    });
    const focusCbg = normalizeCbgId(destination.cbgs?.[0] || '');
    if (focusCbg) {
      setFocusedTraceCbg(focusCbg);
      setFocusedTraceNonce((prev) => prev + 1);
    }
  };

  const selectRecommendedGuidedDestinations = () => {
    const recommendedIds = guidedDestinations
      .filter((destination) => destination.recommended)
      .map((destination) => destination.unit_id);
    setSelectedGuidedDestinationIds(recommendedIds);
  };

  const handleGenerateSubmit = async (
    event: React.FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();
    if (loading) {
      return;
    }

    const rawLocationInput = String(location ?? '').trim();
    const isTestMode = rawLocationInput.toUpperCase() === 'TEST';
    setUseTestData(isTestMode);

    const cachedSeedLookup =
      resolvedSeedLookup?.query === rawLocationInput
        ? resolvedSeedLookup
        : null;
    let coreCbg = setupSeedCbg || cachedSeedLookup?.cbg || null;
    let resolvedSeedCbgs =
      cachedSeedLookup?.seedCbgs ||
      (setupSeedCbg ? [setupSeedCbg] : ([] as string[]));
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
        resolvedSeedCbgs = Array.isArray(resolved?.seed_cbgs)
          ? resolved.seed_cbgs.filter(
              (cbg): cbg is string => typeof cbg === 'string'
            )
          : coreCbg
            ? [coreCbg]
            : [];
        resolvedCityName =
          resolved?.city && resolved?.state
            ? `${resolved.city}, ${resolved.state}`
            : resolved?.city || resolved?.state || rawLocationInput;
        if (coreCbg) {
          setResolvedSeedLookup({
            query: rawLocationInput,
            cbg: coreCbg,
            cityName: resolvedCityName,
            seedName: resolved?.seed_name || coreCbg,
            seedCbgs: resolvedSeedCbgs,
            seedZip: resolved?.zip
          });
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to resolve location.'
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

    setError('');
    setLoading(true);
    setAlgorithmMetadata(null);
    setGuidedMetadata(null);
    setGuidedDestinations([]);
    setGuidedSeedCbgs([]);
    setSelectedGuidedDestinationIds([]);
    setGuidedDestinationError('');

    try {
      if (isGuidedSecondOrderAlgorithm) {
        setGuidedDestinationLoading(true);
        const resp = await fetch(algUrl('second-order-destinations'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cbg: coreCbg,
            seed_cbgs: resolvedSeedCbgs,
            start_date: startDate,
            use_test_data: isTestMode,
            limit: 12
          })
        });
        const data = (await readJsonObject(resp)) as Record<
          string,
          unknown
        > | null;
        if (!resp.ok || !data) {
          throw new Error(
            getResponseErrorMessage(
              resp,
              data,
              'Failed to load connected city destinations.'
            )
          );
        }

        let seedGeoJson = setupSeedGeoJSON;
        if (!seedGeoJson?.features?.length) {
          const seedGeoResp = await fetch(
            `${algUrl('cbg-geojson')}?cbgs=${encodeURIComponent(
              resolvedSeedCbgs.join(',')
            )}&include_neighbors=false`
          );
          const seedGeoData = await seedGeoResp.json().catch(() => null);
          if (!seedGeoResp.ok || !seedGeoData?.features?.length) {
            throw new Error(
              seedGeoData?.message ||
                'Resolved the seed region, but could not load its map boundary.'
            );
          }
          seedGeoJson = seedGeoData as GeoJSONData;
        }

        const destinations = Array.isArray(data.destinations)
          ? (data.destinations as GuidedDestinationCandidate[]).filter(
              (destination) =>
                Boolean(destination?.unit_id) &&
                Array.isArray(destination?.cbgs)
            )
          : [];
        const recommendedIds = Array.isArray(data.recommended_unit_ids)
          ? (data.recommended_unit_ids as unknown[])
              .filter((unitId): unitId is string => typeof unitId === 'string')
              .filter((unitId) =>
                destinations.some(
                  (destination) => destination.unit_id === unitId
                )
              )
          : destinations
              .filter((destination) => destination.recommended)
              .map((destination) => destination.unit_id);

        const nextGuidedMetadata = {
          ...(data as GuidedSecondOrderMetadata),
          seed_cbg: String(data.seed_cbg || coreCbg || ''),
          seed_cbgs: Array.isArray(data.seed_cbgs)
            ? (data.seed_cbgs as unknown[]).filter(
                (cbg): cbg is string => typeof cbg === 'string'
              )
            : resolvedSeedCbgs,
          destinations,
          recommended_unit_ids: recommendedIds
        };
        const initialSelectedCBGs = dedupeCbgList([
          ...nextGuidedMetadata.seed_cbgs,
          ...destinations
            .filter((destination) =>
              recommendedIds.includes(destination.unit_id)
            )
            .flatMap((destination) => destination.cbgs)
        ]);

        setGuidedMetadata(nextGuidedMetadata);
        setGuidedDestinations(destinations);
        setGuidedSeedCbgs(nextGuidedMetadata.seed_cbgs);
        setSelectedGuidedDestinationIds(recommendedIds);
        setSelectedCBGs(initialSelectedCBGs);
        setSeedCBG(nextGuidedMetadata.seed_cbg);
        setTotalPopulation(
          Number(nextGuidedMetadata.seed_population ?? 0) +
            destinations
              .filter((destination) =>
                recommendedIds.includes(destination.unit_id)
              )
              .reduce(
                (sum, destination) => sum + Number(destination.population ?? 0),
                0
              )
        );
        setCityName(resolvedCityName);
        setUseTestData(Boolean(data.use_test_data ?? isTestMode));
        setGrowthTrace(null);
        setTraceStepIndex(0);
        setTraceEnabled(false);
        setZoneEditMode(false);
        setManualFrontierCandidates([]);
        setManualFrontierError('');
        setZoneMetrics(null);
        setZoneMetricsError('');
        setCandidatePois([]);
        setCandidatePoiError('');
        setSelectedTraceCandidateCbg('');
        setFocusedTraceCbg('');
        setCbgGeoJSON(seedGeoJson);
        const seedBounds = getBoundsForGeoJson(seedGeoJson);
        if (seedBounds) {
          setMapCenter([
            (seedBounds[0][1] + seedBounds[1][1]) / 2,
            (seedBounds[0][0] + seedBounds[1][0]) / 2
          ]);
        }
        setPhase('edit');
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
      if (resolvedSeedCbgs.length > 0) {
        clusterReq.seed_cbgs = resolvedSeedCbgs;
      }

      const resp = await fetch(algUrl('cluster-cbgs'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(clusterReq)
      });
      const kickoffData = (await readJsonObject(
        resp
      )) as ClusteringPreviewResponse | null;
      if (!resp.ok) {
        throw new Error(
          getResponseErrorMessage(
            resp,
            kickoffData,
            'Failed to cluster CBGs. Please try again.'
          )
        );
      }

      let data = kickoffData;
      if (!Array.isArray(data?.cluster)) {
        const clusteringId = Number(data?.clustering_id);
        if (Number.isInteger(clusteringId) && clusteringId > 0) {
          data = await waitForClusteringResult(clusteringId);
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
      setAlgorithmMetadata(
        data.algorithm_metadata || data.trace?.algorithm_metadata || null
      );
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
        setCbgGeoJSON(
          mergeGeoJsonFeatures(data.geojson || null, data.trace_geojson || null)
        );
      }

      setPhase('edit');
    } catch (err) {
      console.error(err);
      setAlgorithmMetadata(null);
      setGuidedMetadata(null);
      setGuidedDestinations([]);
      setGuidedSeedCbgs([]);
      setSelectedGuidedDestinationIds([]);
      setGuidedDestinationError(
        err instanceof Error
          ? err.message
          : 'Failed to load connected city destinations.'
      );
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to cluster CBGs. Please try again.'
      );
    } finally {
      setGuidedDestinationLoading(false);
      setLoading(false);
    }
  };

  const finalizeCZ = async () => {
    if (selectedCBGs.length === 0) {
      setError('Please select at least one CBG');
      return;
    }

    if (isPending) {
      setError('Please wait for your login session to finish loading.');
      return;
    }

    if (!user?.id) {
      setError(
        'Please log in before finalizing and generating a convenience zone.'
      );
      return;
    }

    const lengthHours = getLengthHours(startDate, endDate);
    if (!lengthHours || lengthHours <= 0) {
      setError('End date must be after start date.');
      return;
    }

    if (
      guidedSelectionMode &&
      guidedSelectionSummary.selectedPopulation >
        GUIDED_HARD_EXPLICIT_POPULATION
    ) {
      setError(
        `Guided explicit population is ${Number(
          guidedSelectionSummary.selectedPopulation
        ).toLocaleString()}, which is above the supported cap of ${GUIDED_HARD_EXPLICIT_POPULATION.toLocaleString()}. Remove some connected cities before finalizing.`
      );
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
        isGuidedSecondOrderAlgorithm
          ? 'Minimum population filter: not used in guided connected cities mode'
          : `Minimum population: ${Number(minPop || 0).toLocaleString()}`,
        `Date range: ${startDate} to ${endDate}`,
        `CBGs in zone: ${selectedCBGs.length}`,
        `Test data mode: ${useTestData ? 'Yes' : 'No'}`
      ];

      if (isGuidedSecondOrderAlgorithm && guidedMetadata) {
        const selectedLabels = guidedSelectedDestinations.map(
          (destination) => destination.label
        );
        generatedDescription.push(
          `Seed region: ${
            guidedMetadata.seed_city_labels?.join(', ') ||
            guidedMetadata.seed_zip_codes?.join(', ') ||
            `${guidedMetadata.seed_cbgs.length} seed CBGs`
          }`
        );
        generatedDescription.push(
          `Selected connected cities: ${
            selectedLabels.length ? selectedLabels.join(', ') : 'Seed only'
          }`
        );
        generatedDescription.push(
          `Explicit linked CBGs: ${selectedCBGs.length}`
        );
        generatedDescription.push(
          `Explicit population: ${Number(
            guidedSelectionSummary.selectedPopulation || 0
          ).toLocaleString()}`
        );
        generatedDescription.push(
          `Captured external outbound flow (linked CBGs): ${(
            guidedSelectionSummary.selectedLinkedOutboundShare * 100
          ).toFixed(1)}%`
        );
        generatedDescription.push(
          `Captured total seed movement: ${(
            guidedSelectionSummary.selectedSeedMovementShare * 100
          ).toFixed(1)}%`
        );
        generatedDescription.push(
          `Unmodeled external pressure: ${(
            guidedSelectionSummary.externalRemainderShare * 100
          ).toFixed(1)}%`
        );
      }

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
          data?.message ||
            'Failed to create convenience zone. Please try again.'
        );
      }

      const zoneId: number = data.id;
      setFinalizeProgress(15);
      setFinalizeStatusMessage('Zone saved. Generating movement patterns...');

      await waitForZoneReady(zoneId, (pct) => {
        setFinalizeProgress(pct);
      });

      setFinalizeProgress(100);
      setFinalizeStatusMessage('Generation complete. Opening simulator...');

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
        `${
          suggestedName
            .replace(/[^A-Za-z0-9._-]+/g, '-')
            .replace(/^-+|-+$/g, '') || 'cz-map'
        }.html`;

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
      {isFinalizing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-live="polite"
        >
          <div className="w-[min(32rem,90vw)] rounded-2xl border border-[#70B4D4] bg-white px-6 py-6 shadow-2xl">
            <div className="text-lg font-semibold text-[#1f2937]">
              Generating convenience zone
            </div>
            <div className="mt-1 text-sm text-gray-600">
              {finalizeStatusMessage || 'Preparing movement patterns...'}
            </div>
            <div className="mt-4 h-3 w-full overflow-hidden rounded-full bg-[#e5e7eb]">
              <div
                className="h-full rounded-full bg-[#70B4D4] transition-all duration-300"
                style={{
                  width: `${Math.max(2, Math.min(100, finalizeProgress))}%`
                }}
              />
            </div>
            <div className="mt-2 text-right text-xs font-medium text-gray-600">
              {finalizeProgress}%
            </div>
            <div className="mt-3 text-xs text-gray-500">
              This can take a few minutes. You&apos;ll be taken to the simulator
              automatically once generation is complete.
            </div>
          </div>
        </div>
      )}
      {showGuidedTermsHelp && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="guided-terms-title"
          tabIndex={-1}
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setShowGuidedTermsHelp(false);
            }
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              setShowGuidedTermsHelp(false);
            }
          }}
        >
          <div className="max-h-[88vh] w-[min(42rem,92vw)] overflow-y-auto rounded-2xl border border-[#70B4D4] bg-white px-6 py-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div
                  id="guided-terms-title"
                  className="text-lg font-semibold text-[#1f2937]"
                >
                  How Guided Ranking Works
                </div>
                <div className="mt-1 text-sm text-gray-600">
                  The city cards use plain-language labels. This panel maps
                  those labels back to the ranking terms and explains which
                  values drive ordering versus selection context.
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowGuidedTermsHelp(false)}
                className="rounded border border-[#d1d5db] px-3 py-1 text-sm font-semibold text-[#1f2937] hover:border-[#70B4D4]"
              >
                Close
              </button>
            </div>

            <div className="mt-4 flex flex-col gap-3 text-sm text-gray-700">
              <div className="rounded-lg bg-[#f8fafc] px-3 py-3 text-xs text-gray-700">
                <div className="font-semibold text-[#1f2937]">
                  Connection (<code>coupling</code>)
                </div>
                <div className="mt-1">
                  Distance-adjusted two-way connection between the seed and a
                  city. This is the main ranking score, so the list is ordered
                  by this value.
                </div>
                <pre className="mt-2 overflow-x-auto whitespace-pre-wrap font-mono text-[11px] leading-5 text-[#1f2937]">
                  {`bidirectional_flow = outbound_flow + inbound_flow

coupling =
  bidirectional_flow / (1 + distance_km / distance_scale_km)`}
                </pre>
                <div className="mt-2">
                  <span className="font-semibold">Terms:</span>{' '}
                  <code>outbound_flow</code> is travel from the seed to the
                  city, aggregated across the full city approximation.{' '}
                  <code>inbound_flow</code> is travel from the city back to the
                  seed, also aggregated across the full city approximation.{' '}
                  <code>distance_km</code> is the distance from the seed to the
                  selected linked CBG layer for that city.{' '}
                  <code>distance_scale_km</code> is the distance penalty scale.
                </div>
              </div>
              <div className="rounded-lg bg-[#f8fafc] px-3 py-3 text-xs text-gray-700">
                <div className="font-semibold text-[#1f2937]">
                  Trips Leaving Seed (
                  <code>share_of_seed_external_outbound</code>)
                </div>
                <div className="mt-1">
                  On each city card, this is the portion of trips leaving the
                  seed that go to that full connected city. It remains a
                  city-level ranking/context metric.
                </div>
                <pre className="mt-2 overflow-x-auto whitespace-pre-wrap font-mono text-[11px] leading-5 text-[#1f2937]">
                  {`share_of_seed_external_outbound =
  outbound_flow / total_seed_external_outbound_flow`}
                </pre>
                <div className="mt-2">
                  <span className="font-semibold">Terms:</span>{' '}
                  <code>total_seed_external_outbound_flow</code> only counts
                  trips that leave the seed for outside destinations. The
                  numerator is the full city approximation&apos;s outbound flow,
                  not only the linked CBG subset.
                </div>
              </div>
              <div className="rounded-lg bg-[#f8fafc] px-3 py-3 text-xs text-gray-700">
                <div className="font-semibold text-[#1f2937]">
                  Trips Leaving Seed In Summary
                </div>
                <div className="mt-1">
                  In the footer and selection summary, this is computed only
                  from the selected linked CBG subset, summed across the chosen
                  cities.
                </div>
                <pre className="mt-2 overflow-x-auto whitespace-pre-wrap font-mono text-[11px] leading-5 text-[#1f2937]">
                  {`linked_subset_trips_leaving_seed =
  selected_linked_outbound_flow / total_seed_external_outbound_flow`}
                </pre>
                <div className="mt-2">
                  <span className="font-semibold">Terms:</span>{' '}
                  <code>selected_linked_outbound_flow</code> is the sum of
                  <code>seed_outbound_flow</code> across the linked CBGs kept
                  explicit in the zone.
                </div>
              </div>
              <div className="rounded-lg bg-[#f8fafc] px-3 py-3 text-xs text-gray-700">
                <div className="font-semibold text-[#1f2937]">
                  Linked CBGs (<code>cbg_count</code>)
                </div>
                <div className="mt-1">
                  Number of linked CBGs that would be kept explicit for this
                  city. This is selection context, not part of the ranking
                  formula.
                </div>
              </div>
              <div className="rounded-lg bg-[#f8fafc] px-3 py-3 text-xs text-gray-700">
                <div className="font-semibold text-[#1f2937]">
                  Added Population (<code>population</code>)
                </div>
                <div className="mt-1">
                  Estimated explicit population contributed by that city&apos;s
                  linked CBG layer. This helps judge zone size, but it also is
                  not part of the ranking formula.
                </div>
              </div>
              <div className="rounded-lg bg-[#f8fafc] px-3 py-3 text-xs text-gray-700">
                <div className="font-semibold text-[#1f2937]">
                  Linked Coverage (
                  <code>captured_bidirectional_flow_share</code>)
                </div>
                <div className="mt-1">
                  Portion of the city&apos;s two-way seed connection that is
                  covered by the selected linked CBGs. This is the note shown at
                  the bottom of each card.
                </div>
                <pre className="mt-2 overflow-x-auto whitespace-pre-wrap font-mono text-[11px] leading-5 text-[#1f2937]">
                  {`captured_bidirectional_flow_share =
  captured_gateway_bidirectional_flow / bidirectional_flow`}
                </pre>
                <div className="mt-2">
                  <span className="font-semibold">Terms:</span>{' '}
                  <code>captured_gateway_bidirectional_flow</code> is the
                  two-way travel covered by the chosen linked CBG subset for
                  that city. <code>bidirectional_flow</code> is the full
                  city-level two-way travel between the seed and that city.
                </div>
              </div>
              <div className="rounded-lg bg-[#eff6ff] px-3 py-2 text-xs text-[#1e3a8a]">
                The list is ranked by <code>coupling</code>, shown as{' '}
                <span className="font-semibold">Connection</span>. The other
                values help decide whether that city is worth keeping in the
                explicit zone once you see its linked CBG count and population
                impact. If you want linked-CBG-only metrics, use the summary
                UI&apos;s{' '}
                <span className="font-semibold">Trips Leaving Seed</span> for
                outbound capture and the city card&apos;s{' '}
                <code>captured_bidirectional_flow_share</code> for two-way
                coverage.
              </div>
            </div>
          </div>
        </div>
      )}
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
                    selectionStyleByCbg={guidedSelectionStyleByCbg}
                    editingEnabled={
                      !guidedSelectionMode &&
                      (manualEditPanelsActive || !activeMapTraceLayer)
                    }
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

              {guidedSelectionMode && (
                <div className="relative h-[calc(100vh-13rem)] min-h-[34rem] max-h-[48rem] w-[25rem] max-w-[25rem] bg-[#fffff2] border border-[#70B4D4] rounded-lg flex flex-col overflow-hidden">
                  <div className="px-4 py-4 border-b border-[#70B4D4]">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-lg font-semibold leading-tight">
                          Connected Cities
                        </div>
                        <div className="mt-1 text-sm text-gray-600">
                          Choose the connected cities whose linked CBGs should
                          stay explicit in the simulation.
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setShowGuidedSummaryPanel(true)}
                        className="rounded border border-[#70B4D4] bg-white px-3 py-1 text-xs font-semibold text-[#1f2937] hover:bg-[#eff6ff]"
                      >
                        Selection Summary
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowGuidedTermsHelp(true)}
                        className="shrink-0 rounded border border-[#70B4D4] bg-white px-3 py-1 text-xs font-semibold text-[#1f2937] hover:bg-[#eff6ff]"
                      >
                        How Ranking Works
                      </button>
                    </div>
                    <div className="mt-3 text-xs text-gray-600">
                      <span className="font-semibold text-[#1f2937]">
                        Seed:
                      </span>{' '}
                      {guidedSeedLabel}
                    </div>
                  </div>
                  <div className="px-4 py-3 border-b border-[#d1d5db] flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={selectRecommendedGuidedDestinations}
                      disabled={guidedDestinationLoading || isFinalizing}
                      className="px-3 py-2 rounded border border-[#70B4D4] bg-white text-sm font-semibold disabled:opacity-40"
                    >
                      Use Recommended
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedGuidedDestinationIds([])}
                      disabled={guidedDestinationLoading || isFinalizing}
                      className="px-3 py-2 rounded border border-[#d1d5db] bg-white text-sm font-semibold disabled:opacity-40"
                    >
                      Seed Only
                    </button>
                    <div className="w-full text-xs text-gray-600">
                      {guidedDestinations.length} ranked cities. Click a city to
                      include or remove its linked CBGs.
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-2">
                    {guidedDestinationLoading ? (
                      <div className="text-sm text-gray-500 px-2 py-2">
                        Loading connected cities and linked CBGs...
                      </div>
                    ) : guidedDestinationError ? (
                      <div className="text-sm text-red-700 px-2 py-2">
                        {guidedDestinationError}
                      </div>
                    ) : guidedDestinations.length === 0 ? (
                      <div className="text-sm text-gray-500 px-2 py-2">
                        No significant outbound cities were found for this seed.
                      </div>
                    ) : (
                      guidedDestinations.map((destination, index) => {
                        const isSelected =
                          selectedGuidedDestinationIds.includes(
                            destination.unit_id
                          );
                        const style =
                          guidedStyleByUnitId.get(destination.unit_id) ||
                          GUIDED_SEED_STYLE;
                        return (
                          <button
                            type="button"
                            key={destination.unit_id}
                            className={`text-left px-3.5 py-3 rounded border transition-colors ${
                              isSelected
                                ? 'bg-[#e0f2fe] border-[#0284c7]'
                                : 'bg-white border-[#d1d5db] hover:border-[#70B4D4]'
                            }`}
                            onClick={() => toggleGuidedDestination(destination)}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex items-center gap-2 text-base font-semibold leading-tight">
                                <span
                                  className="inline-block h-3 w-3 rounded-full border"
                                  style={{
                                    backgroundColor: style.fillColor,
                                    borderColor: style.lineColor
                                  }}
                                />
                                <span>
                                  #{index + 1} {destination.label}
                                </span>
                              </div>
                              {destination.recommended && (
                                <span className="rounded-full bg-[#dbeafe] px-2 py-0.5 text-[11px] font-semibold text-[#1d4ed8]">
                                  Recommended
                                </span>
                              )}
                            </div>
                            <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs text-gray-600">
                              <div>
                                <div className="font-semibold text-[#1f2937]">
                                  Connection
                                </div>
                                <div>
                                  {Number(destination.coupling ?? 0).toFixed(3)}
                                </div>
                              </div>
                              <div>
                                <div className="font-semibold text-[#1f2937]">
                                  Trips Leaving Seed
                                </div>
                                <div>
                                  {Number(
                                    (destination.share_of_seed_external_outbound ??
                                      0) * 100
                                  ).toFixed(1)}
                                  %
                                </div>
                              </div>
                              <div>
                                <div className="font-semibold text-[#1f2937]">
                                  Linked CBGs
                                </div>
                                <div>
                                  {Number(
                                    destination.cbg_count ??
                                      destination.cbgs.length
                                  ).toLocaleString()}
                                </div>
                              </div>
                              <div>
                                <div className="font-semibold text-[#1f2937]">
                                  Added Population
                                </div>
                                <div>
                                  {Number(
                                    destination.population ?? 0
                                  ).toLocaleString()}
                                </div>
                              </div>
                            </div>
                            <div className="mt-3 text-xs text-gray-500">
                              Linked CBG layer captures{' '}
                              {Number(
                                (destination.captured_bidirectional_flow_share ??
                                  0) * 100
                              ).toFixed(1)}
                              % of this city&apos;s two-way seed connection.
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                  <div
                    className={`absolute inset-0 z-20 bg-[#fffff2] transition-transform duration-200 ease-out ${
                      showGuidedSummaryPanel
                        ? 'translate-x-0'
                        : 'translate-x-full pointer-events-none'
                    }`}
                    aria-hidden={!showGuidedSummaryPanel}
                  >
                    <div className="flex h-full flex-col">
                      <div className="flex items-start justify-between gap-3 border-b border-[#70B4D4] px-4 py-4">
                        <div className="min-w-0">
                          <div className="text-lg font-semibold text-[#1f2937]">
                            Selection Summary
                          </div>
                          <div className="mt-1 text-sm text-gray-600">
                            Guided metrics and the current explicit-zone
                            summary.
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowGuidedSummaryPanel(false)}
                          className="shrink-0 rounded border border-[#d1d5db] bg-white px-3 py-1 text-xs font-semibold text-[#1f2937] hover:border-[#70B4D4]"
                        >
                          Close
                        </button>
                      </div>
                      <div className="flex-1 overflow-y-auto px-4 py-4">
                        <div className="rounded-lg border border-[#dbeafe] bg-[#f8fbff] px-3 py-3">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#2563eb]">
                            Seed Region
                          </div>
                          <div className="mt-1 text-sm font-semibold text-[#1f2937]">
                            {guidedSeedLabel}
                          </div>
                          {guidedMetadata?.approximation_note && (
                            <div className="mt-1 text-xs text-gray-600">
                              {guidedMetadata.approximation_note}
                            </div>
                          )}
                        </div>
                        <div className="mt-4 grid grid-cols-2 gap-2">
                          <div className="rounded-lg border border-[#dbeafe] bg-white px-3 py-2">
                            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#2563eb]">
                              Selected
                            </div>
                            <div className="mt-1 text-lg font-semibold text-[#1f2937]">
                              {selectedGuidedDestinationIds.length}
                            </div>
                            <div className="text-xs text-gray-500">cities</div>
                          </div>
                          <div className="rounded-lg border border-[#dbeafe] bg-white px-3 py-2">
                            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#2563eb]">
                              Linked CBGs
                            </div>
                            <div className="mt-1 text-lg font-semibold text-[#1f2937]">
                              {selectedCBGs.length}
                            </div>
                            <div className="text-xs text-gray-500">
                              explicit units
                            </div>
                          </div>
                          <div className="rounded-lg border border-[#dbeafe] bg-white px-3 py-2">
                            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#2563eb]">
                              Explicit Pop
                            </div>
                            <div className="mt-1 text-lg font-semibold text-[#1f2937]">
                              {Number(
                                guidedSelectionSummary.selectedPopulation || 0
                              ).toLocaleString()}
                            </div>
                            <div className="text-xs text-gray-500">
                              residents
                            </div>
                          </div>
                          <div className="rounded-lg border border-[#dbeafe] bg-white px-3 py-2">
                            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#2563eb]">
                              Trips Leaving Seed Captured
                            </div>
                            <div className="mt-1 text-lg font-semibold text-[#1f2937]">
                              {(
                                guidedSelectionSummary.selectedLinkedOutboundShare *
                                100
                              ).toFixed(1)}
                              %
                            </div>
                            <div className="text-xs text-gray-500">
                              linked subset
                            </div>
                          </div>
                          <div className="rounded-lg border border-[#dbeafe] bg-white px-3 py-2">
                            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#2563eb]">
                              Seed Movement
                            </div>
                            <div className="mt-1 text-lg font-semibold text-[#1f2937]">
                              {(
                                guidedSelectionSummary.selectedSeedMovementShare *
                                100
                              ).toFixed(1)}
                              %
                            </div>
                            <div className="text-xs text-gray-500">
                              represented
                            </div>
                          </div>
                        </div>
                        <div className="mt-4 rounded-lg border border-[#e5e7eb] bg-white px-3 py-3 text-xs text-gray-700">
                          <div className="font-semibold text-[#1f2937]">
                            Selected Cities
                          </div>
                          <div className="mt-1">
                            {guidedSelectedDestinations.length
                              ? guidedSelectedDestinations
                                  .map((destination) => destination.label)
                                  .join(', ')
                              : 'Seed only'}
                          </div>
                        </div>
                        <div className="mt-3 rounded-lg border border-[#e5e7eb] bg-white px-3 py-3 text-xs text-gray-700">
                          <span className="font-semibold text-[#1f2937]">
                            Outside connections not modeled explicitly:
                          </span>{' '}
                          {(
                            guidedSelectionSummary.externalRemainderShare * 100
                          ).toFixed(1)}
                          %
                        </div>
                        {guidedSelectionSummary.selectedPopulation >
                          GUIDED_SOFT_EXPLICIT_POPULATION && (
                          <div className="mt-3 text-xs text-amber-700">
                            This selection is above the preferred
                            explicit-population band of{' '}
                            {GUIDED_SOFT_EXPLICIT_POPULATION.toLocaleString()}.
                          </div>
                        )}
                        {guidedSelectionSummary.selectedPopulation >
                          GUIDED_HARD_EXPLICIT_POPULATION && (
                          <div className="mt-1 text-xs text-red-700">
                            Finalize is disabled above{' '}
                            {GUIDED_HARD_EXPLICIT_POPULATION.toLocaleString()}{' '}
                            explicit residents.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

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
                      {String(
                        selectedTraceFeatureProperties?.population ?? 'N/A'
                      )}
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
                          {Number(selectedAnalysisCandidate.score ?? 0).toFixed(
                            4
                          )}
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
                            {selectedAnalysisCandidate.movement_contributes_after_selection
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
                      <div className="text-sm text-red-700">
                        {candidatePoiError}
                      </div>
                    ) : candidatePois.length === 0 ? (
                      <div className="text-sm text-gray-500">
                        No cluster-to-POI flow found for this CBG.
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
                              ({Number((poi.flow_share ?? 0) * 100).toFixed(1)}
                              %)
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div
              className={`w-full rounded-lg bg-[#fffff2] outline outline-2 outline-[#70B4D4] ${
                guidedSelectionMode
                  ? 'p-4 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between'
                  : 'p-2.5 flex flex-wrap items-start justify-between gap-3'
              }`}
            >
              {guidedSelectionMode ? (
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-[#1f2937]">
                    Ready to Generate
                  </div>
                  <div className="mt-1 text-sm text-gray-700">
                    {selectedGuidedDestinationIds.length
                      ? `Selected ${selectedGuidedDestinationIds.length} cities and ${selectedCBGs.length} linked CBGs: ${guidedSelectedDestinationSummary}.`
                      : `Seed only is selected right now. The explicit layer contains ${selectedCBGs.length} seed CBGs.`}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-gray-700">
                    <div className="rounded-full border border-[#dbeafe] bg-white px-3 py-1">
                      <span className="font-semibold text-[#1f2937]">
                        Trips Leaving Seed Captured (linked CBGs):
                      </span>{' '}
                      {(
                        guidedSelectionSummary.selectedLinkedOutboundShare * 100
                      ).toFixed(1)}
                      %
                    </div>
                    <div className="rounded-full border border-[#dbeafe] bg-white px-3 py-1">
                      <span className="font-semibold text-[#1f2937]">
                        Explicit Pop:
                      </span>{' '}
                      {Number(
                        guidedSelectionSummary.selectedPopulation ?? 0
                      ).toLocaleString()}
                    </div>
                  </div>
                  {guidedSelectionSummary.selectedPopulation >
                  GUIDED_HARD_EXPLICIT_POPULATION ? (
                    <div className="mt-3 text-xs text-red-700">
                      Finalize is disabled above{' '}
                      {GUIDED_HARD_EXPLICIT_POPULATION.toLocaleString()}{' '}
                      explicit residents.
                    </div>
                  ) : guidedSelectionSummary.selectedPopulation >
                    GUIDED_SOFT_EXPLICIT_POPULATION ? (
                    <div className="mt-3 text-xs text-amber-700">
                      This selection is above the preferred explicit-population
                      band of {GUIDED_SOFT_EXPLICIT_POPULATION.toLocaleString()}
                      .
                    </div>
                  ) : (
                    <div className="mt-3 text-xs text-gray-600">
                      Choose connected cities on the right. The map updates as
                      you change the explicit linked CBG layer.
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <div>
                    {showTraceControls ? (
                      <>
                        <div className="text-sm font-semibold mb-2">
                          Trace Controls
                        </div>
                        {growthTrace?.supports_stepwise &&
                        traceSteps.length > 0 ? (
                          <>
                            <label className="flex items-center gap-2 text-xs mb-2">
                              <input
                                type="checkbox"
                                checked={traceEnabled}
                                onChange={(e) =>
                                  setTraceEnabled(e.target.checked)
                                }
                              />
                              Show frontier heat map
                            </label>
                            <div className="text-xs text-gray-600">
                              Step {Math.min(traceStepIndex, maxTraceStep) + 1}{' '}
                              of {traceSteps.length}
                            </div>
                            <div className="mt-2 flex gap-2">
                              <button
                                type="button"
                                className="px-2 py-1 text-xs rounded border border-[#70B4D4] disabled:opacity-40"
                                disabled={!traceEnabled || traceStepIndex <= 0}
                                onClick={() =>
                                  jumpToTraceStep(traceStepIndex - 1)
                                }
                              >
                                Previous Step
                              </button>
                              <button
                                type="button"
                                className="px-2 py-1 text-xs rounded border border-[#70B4D4] disabled:opacity-40"
                                disabled={
                                  !traceEnabled ||
                                  traceStepIndex >= maxTraceStep
                                }
                                onClick={() =>
                                  jumpToTraceStep(traceStepIndex + 1)
                                }
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
                    ) : zoneMetricsLoading ? (
                      <>
                        <div className="text-sm font-semibold mb-2">
                          Zone Metrics (Live)
                        </div>
                        <div className="text-xs text-gray-600">
                          Computing CZI...
                        </div>
                      </>
                    ) : zoneMetricsError ? (
                      <>
                        <div className="text-sm font-semibold mb-2">
                          Zone Metrics (Live)
                        </div>
                        <div className="text-xs text-red-700">
                          {zoneMetricsError}
                        </div>
                      </>
                    ) : zoneMetrics ? (
                      <>
                        <div className="text-sm font-semibold mb-2">
                          Zone Metrics (Live)
                        </div>
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
                        <div className="mt-1 text-xs text-gray-600">
                          Click CBGs on the map to add or remove them. Frontier
                          candidates update automatically.
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="text-sm font-semibold mb-2">
                          Zone Metrics (Live)
                        </div>
                        <div className="text-xs text-gray-600">
                          No metrics available.
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
                          Blue ring shows the seed guard radius and updates live
                          as you change it.
                        </div>
                      </div>
                    )}

                  {algorithmMetadata && (
                    <div className="min-w-[16rem] max-w-[22rem] flex flex-col gap-1 text-xs text-gray-700">
                      <div className="text-sm font-semibold text-[#1f2937]">
                        Hierarchy Summary
                      </div>
                      <div>
                        <span className="font-semibold">Seed:</span>{' '}
                        {algorithmMetadata.seed_zip_codes?.length
                          ? algorithmMetadata.seed_zip_codes.join(', ')
                          : `${algorithmMetadata.seed_cbgs?.length ?? 0} seed CBGs`}
                      </div>
                      <div>
                        <span className="font-semibold">Core:</span>{' '}
                        {algorithmMetadata.core_cluster?.length ?? 0} CBGs
                        {algorithmMetadata.core_population !== undefined
                          ? `, pop ${Number(
                              algorithmMetadata.core_population
                            ).toLocaleString()}`
                          : ''}
                      </div>
                      <div>
                        <span className="font-semibold">Satellites:</span>{' '}
                        {algorithmMetadata.selected_satellites?.length ?? 0}
                      </div>
                      {algorithmMetadata.selected_satellites &&
                        algorithmMetadata.selected_satellites.length > 0 && (
                          <div>
                            <span className="font-semibold">Selected:</span>{' '}
                            {algorithmMetadata.selected_satellites
                              .map(
                                (item) =>
                                  item.label || item.unit_id || 'Unknown'
                              )
                              .join(', ')}
                          </div>
                        )}
                      {algorithmMetadata.external_pressure_share !==
                        undefined && (
                        <div>
                          <span className="font-semibold">
                            External Pressure:
                          </span>{' '}
                          {Number(
                            (algorithmMetadata.external_pressure_share ?? 0) *
                              100
                          ).toFixed(1)}
                          %
                        </div>
                      )}
                      {algorithmMetadata.population_target_met !==
                        undefined && (
                        <div>
                          <span className="font-semibold">
                            Population Target:
                          </span>{' '}
                          {algorithmMetadata.population_target_met
                            ? 'Met'
                            : 'Not met'}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}

              <div
                className={`flex flex-wrap items-center gap-2 ${
                  guidedSelectionMode ? 'xl:justify-end' : ''
                }`}
              >
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
                  disabled={
                    loading ||
                    isFinalizing ||
                    (guidedSelectionMode &&
                      guidedSelectionSummary.selectedPopulation >
                        GUIDED_HARD_EXPLICIT_POPULATION)
                  }
                  className="px-4 py-2 rounded-lg border border-[#70B4D4] bg-[#e0f2fe] text-[#1f2937] font-semibold disabled:opacity-40"
                >
                  {isFinalizing
                    ? 'Generating Patterns...'
                    : 'Finalize & Generate'}
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
                  {!isGuidedSecondOrderAlgorithm && (
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
                  )}
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
                  {(() => {
                    const monthsReady = monthOptions.length > 0;
                    const placeholderLabel = availableMonthsLoading
                      ? 'Loading available months...'
                      : detectedStateAbbr
                        ? 'No months available for this state'
                        : 'Resolve seed to see available months';
                    const placeholderOption = [
                      { value: '', label: placeholderLabel }
                    ];
                    const startValue = monthsReady
                      ? monthFromDate(startDate)
                      : '';
                    const endValue = monthsReady
                      ? monthFromEndDate(endDate)
                      : '';
                    const startOptions = monthsReady
                      ? monthOptions.map((month) => ({
                          value: month,
                          label: formatMonthLabel(month)
                        }))
                      : placeholderOption;
                    const endOptions = monthsReady
                      ? monthOptions
                          .filter((month) => month >= monthFromDate(startDate))
                          .map((month) => ({
                            value: month,
                            label: formatMonthLabel(month)
                          }))
                      : placeholderOption;
                    return (
                      <>
                        <div className="w-full">
                          <FormField
                            label="Start Month"
                            name="start_month"
                            type="select"
                            value={startValue}
                            options={startOptions}
                            onChange={(e) => {
                              const nextMonth = e.target.value;
                              if (!nextMonth) return;
                              const nextStart = startDateFromMonth(nextMonth);
                              setStartDate(nextStart);
                              if (monthFromEndDate(endDate) < nextMonth) {
                                setEndDate(endDateFromMonth(nextMonth));
                              }
                            }}
                            disabled={loading || !monthsReady}
                          />
                        </div>
                        <div className="w-full">
                          <FormField
                            label="End Month"
                            name="end_month"
                            type="select"
                            value={endValue}
                            options={endOptions}
                            onChange={(e) => {
                              const nextMonth = e.target.value;
                              if (!nextMonth) return;
                              setEndDate(endDateFromMonth(nextMonth));
                            }}
                            disabled={loading || !monthsReady}
                          />
                        </div>
                      </>
                    );
                  })()}
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
                        {setupSeedLabel || setupSeedCbg}
                        {setupSeedCount > 0 ? ` (${setupSeedCount} CBGs)` : ''}
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

                {isGuidedSecondOrderAlgorithm && (
                  <div className="rounded-lg border border-[#70B4D4] bg-[#eff6ff] px-3 py-2 text-xs text-[#1e3a8a]">
                    This mode starts with the full seed region, ranks nearby
                    connected cities by how much travel they share with it, and
                    asks you which connected cities should contribute linked
                    CBGs to the explicit simulation.
                  </div>
                )}

                {clusterAlgorithm === 'greedy_weight_seed_guard' && (
                  <div className="rounded-lg border border-[#70B4D4] p-3 bg-[#fffff2] w-full">
                    <button
                      type="button"
                      className="text-sm font-semibold text-left w-full"
                      onClick={() => setShowAdvancedClustering((prev) => !prev)}
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
                    {loading
                      ? isGuidedSecondOrderAlgorithm
                        ? 'Loading Cities...'
                        : 'Clustering...'
                      : isGuidedSecondOrderAlgorithm
                        ? 'Choose Connected Cities'
                        : 'Preview CBGs'}
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
