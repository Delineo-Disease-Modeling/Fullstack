'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchCbgAtPoint,
  fetchCbgGeoJson,
  lookupLocation
} from '@/features/cz-generation/api';
import { CandidateAnalysisPanel } from '@/features/cz-generation/components/candidate-analysis-panel';
import { ConnectedCitiesPanel } from '@/features/cz-generation/components/connected-cities-panel';
import { FrontierCandidatesPanel } from '@/features/cz-generation/components/frontier-candidates-panel';
import { GeneratedActionBar } from '@/features/cz-generation/components/generated-action-bar';
import { GuidedTermsHelpModal } from '@/features/cz-generation/components/guided-terms-help-modal';
import { SetupSeedPanel } from '@/features/cz-generation/components/setup-seed-panel';
import {
  CLUSTER_ALGORITHM_MANUAL,
  CLUSTER_ALGORITHM_OPTIONS,
  EMPTY_LIST,
  GUIDED_REGION_PALETTE,
  GUIDED_SEED_STYLE,
  type ClusterAlgorithm
} from '@/features/cz-generation/constants';
import {
  clampIndex,
  dedupeCbgList,
  endDateFromMonth,
  monthFromDate,
  monthFromEndDate,
  sameStringArray,
  startDateFromMonth
} from '@/features/cz-generation/helpers';
import { useCandidatePois } from '@/features/cz-generation/hooks/use-candidate-pois';
import { useCzMetrics } from '@/features/cz-generation/hooks/use-cz-metrics';
import { useGenerationPreviewSubmit } from '@/features/cz-generation/hooks/use-generation-preview-submit';
import { useManualFrontierCandidates } from '@/features/cz-generation/hooks/use-manual-frontier-candidates';
import { usePatternAvailability } from '@/features/cz-generation/hooks/use-pattern-availability';
import { useSeedEditing } from '@/features/cz-generation/hooks/use-seed-editing';
import { useZoneFinalization } from '@/features/cz-generation/hooks/use-zone-finalization';
import type {
  ClusterAlgorithmMetadata,
  GuidedDestinationCandidate,
  GuidedSecondOrderMetadata,
  GuidedSelectionStyle,
  TraceCandidate,
  TraceLayerData,
  TracePayload
} from '@/features/cz-generation/types';
import {
  type GeoJSONData,
  getBoundsForGeoJson,
  getFeatureCbgId,
  type LatLng,
  mergeGeoJsonFeatures,
  normalizeCbgId
} from '@/lib/cz-geo';
import { getStateFromCBG } from '@/lib/simulation-zone';
import '@/styles/cz-generation.css';

const InteractiveMap = dynamic(() => import('@/components/interactive-map'), {
  ssr: false
});
const CBGMap = dynamic(() => import('@/components/cbg-map'), { ssr: false });

const EMPTY_CBG_LIST: string[] = [];

export default function CZGeneration() {
  const isResolvingMapClickRef = useRef(false);
  const attemptedTraceGeoJsonFetchRef = useRef(new Set<string>());

  const [location, setLocation] = useState('');
  const [minPop, setMinPop] = useState(5000);
  const [clusterAlgorithm, setClusterAlgorithm] =
    useState<ClusterAlgorithm>('mobility_prune');
  const [showAdvancedClustering, setShowAdvancedClustering] = useState(false);
  const [seedGuardDistanceKm, setSeedGuardDistanceKm] = useState(20);
  const [mobilityPruneMinSeedCapturePct, setMobilityPruneMinSeedCapturePct] =
    useState(80);
  const {
    setupSeedCbg,
    setupSeedLabel,
    setupSeedCount,
    setupSeedCbgs,
    resolvedSetupSeedCbgs,
    setupSeedGeoJSON,
    seedEditMode,
    seedEditAction,
    seedEditLoading,
    seedEditError,
    setupResolvedCityName,
    resolvedSeedLookup,
    seedResolveError,
    seedAdjustmentSummary,
    activeSetupSeedGeoJSON,
    seedStateCbg: editedSeedStateCbg,
    setSetupSeedGeoJSON,
    setSeedEditMode,
    setSeedEditAction,
    setResolvedSeedLookup,
    setSeedResolveError,
    resetSeedPreview,
    loadSeedGeoJson,
    beginSeedEdit,
    updateEditableSeedSelection,
    finishSeedEdit,
    cancelSeedEdit,
    resetAdjustedSeed,
    showMoreSeedEditNeighbors,
    applyResolvedSeedPreview,
    clearSeedPreviewWithError
  } = useSeedEditing();
  const [resolvingSeed, setResolvingSeed] = useState(false);
  const [startDate, setStartDate] = useState('2019-01-01');
  const [endDate, setEndDate] = useState('2019-02-01');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [phase, setPhase] = useState<'input' | 'edit' | 'finalizing'>('input');
  const [cbgGeoJSON, setCbgGeoJSON] = useState<GeoJSONData | null>(null);
  const [selectedCBGs, setSelectedCBGs] = useState<string[]>([]);
  const [seedCBG, setSeedCBG] = useState('');
  const [totalPopulation, setTotalPopulation] = useState(0);
  const [useTestData, setUseTestData] = useState(false);
  const [mapCenter, setMapCenter] = useState<[number, number] | null>(null);
  const [cityName, setCityName] = useState('');
  const [growthTrace, setGrowthTrace] = useState<TracePayload | null>(null);
  const [algorithmMetadata, setAlgorithmMetadata] =
    useState<ClusterAlgorithmMetadata | null>(null);
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
  const [showAlgorithmGuide, setShowAlgorithmGuide] = useState(false);
  const [showGuidedTermsHelp, setShowGuidedTermsHelp] = useState(false);
  const [showGuidedSummaryPanel, setShowGuidedSummaryPanel] = useState(false);
  const [traceEnabled, setTraceEnabled] = useState(false);
  const [traceStepIndex, setTraceStepIndex] = useState(0);
  const [selectedTraceCandidateCbg, setSelectedTraceCandidateCbg] =
    useState('');
  const [focusedTraceCbg, setFocusedTraceCbg] = useState('');
  const [focusedTraceNonce, setFocusedTraceNonce] = useState(0);
  const [zoneEditMode, setZoneEditMode] = useState(false);
  const hasGenerated = phase === 'edit' || phase === 'finalizing';
  const isFinalizing = phase === 'finalizing';
  const isGuidedSecondOrderAlgorithm =
    clusterAlgorithm === 'guided_second_order_regions';
  const isMobilityPruneAlgorithm = clusterAlgorithm === 'mobility_prune';
  const guidedSelectionMode = hasGenerated && isGuidedSecondOrderAlgorithm;
  const isTestLocationInput =
    String(location ?? '')
      .trim()
      .toUpperCase() === 'TEST';
  const traceSteps = growthTrace?.steps ?? [];
  const mobilityPruneMetadata =
    hasGenerated &&
    isMobilityPruneAlgorithm &&
    algorithmMetadata?.bounded_envelope
      ? algorithmMetadata
      : null;
  const mapSeedCbgIds = useMemo(() => {
    const source = algorithmMetadata?.seed_cbgs?.length
      ? algorithmMetadata.seed_cbgs
      : guidedSeedCbgs.length
        ? guidedSeedCbgs
        : seedCBG
          ? [seedCBG]
          : [];
    return Array.from(
      new Set(source.map((cbg) => normalizeCbgId(cbg)).filter(Boolean))
    );
  }, [algorithmMetadata, guidedSeedCbgs, seedCBG]);
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
  const handleManualFrontierFallback = useCallback((fallbackCbg: string) => {
    setSelectedTraceCandidateCbg(fallbackCbg);
    setFocusedTraceCbg(fallbackCbg);
    if (fallbackCbg) {
      setFocusedTraceNonce((prev) => prev + 1);
    }
  }, []);
  const handleTraceCandidateSelect = useCallback((cbgId: string) => {
    setSelectedTraceCandidateCbg(cbgId);
    setFocusedTraceCbg(cbgId);
    setFocusedTraceNonce((prev) => prev + 1);
  }, []);
  const {
    candidates: manualFrontierCandidates,
    loading: manualFrontierLoading,
    error: manualFrontierError
  } = useManualFrontierCandidates({
    enabled: !guidedSelectionMode && manualEditPanelsActive,
    seedCbg: seedCBG,
    cbgs: selectedCBGs,
    clusterAlgorithm,
    minPop,
    startDate,
    useTestData,
    seedGuardDistanceKm,
    mobilityPruneMinSeedCapturePct,
    selectedCbg: selectedTraceCandidateCbg,
    onFallbackCbg: handleManualFrontierFallback
  });
  const candidatePoiCluster = useMemo(
    () =>
      traceLayer
        ? Array.isArray(activeTraceStep?.cluster_before)
          ? activeTraceStep.cluster_before
          : EMPTY_CBG_LIST
        : selectedCBGs,
    [activeTraceStep, selectedCBGs, traceLayer]
  );
  const {
    pois: candidatePois,
    loading: candidatePoiLoading,
    error: candidatePoiError
  } = useCandidatePois({
    enabled: showCandidatePanels,
    seedCbg: seedCBG,
    candidateCbg: selectedTraceCandidateCbg,
    clusterCbgs: candidatePoiCluster,
    startDate,
    useTestData
  });
  const { metrics: _cziMetrics, loading: _cziLoading } = useCzMetrics({
    enabled: hasGenerated,
    seedCbg: seedCBG,
    cbgs: selectedCBGs,
    startDate,
    useTestData,
    debounceMs: 180,
    warnMessage: 'Failed to compute CZI metrics:'
  });
  const {
    metrics: zoneMetrics,
    loading: zoneMetricsLoading,
    error: zoneMetricsError
  } = useCzMetrics({
    enabled: !guidedSelectionMode && manualEditPanelsActive,
    seedCbg: seedCBG,
    cbgs: selectedCBGs,
    startDate,
    useTestData,
    errorMessage: 'Failed to compute zone metrics.'
  });
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

  const seedStateCbg =
    editedSeedStateCbg || seedCBG || selectedCBGs[0] || '';
  const detectedStateAbbr = getStateFromCBG(
    seedStateCbg ? [seedStateCbg] : null
  );
  const { availableMonths, availableMonthsLoading, monthOptions } =
    usePatternAvailability(detectedStateAbbr);

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
    fetchCbgGeoJson(selectedCBGs, false)
      .then((geojson) => {
        if (cancelled || !geojson?.features?.length) {
          return;
        }
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
  }, [guidedSelectionMode, selectedCBGs]);

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
    fetchCbgGeoJson([normalized], false)
      .then((geojson) => {
        if (geojson?.features?.length) {
          setCbgGeoJSON((prev) => mergeGeoJsonFeatures(prev, geojson));
        }
      })
      .catch((err) => {
        console.warn(
          `Failed to load GeoJSON for focused trace CBG ${normalized}:`,
          err
        );
      });
  }, [cbgGeoJSON, focusedTraceCbg, showCandidatePanels]);

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
      const normalizedSeedCbgs = dedupeCbgList(
        seedCbgs.length ? seedCbgs : coreCbg ? [coreCbg] : []
      );
      if (!coreCbg) {
        throw new Error(
          'Could not resolve a seed CBG. Try a 5-digit ZIP code such as 21201.'
        );
      }

      const seedGeoJson = await loadSeedGeoJson(normalizedSeedCbgs, false);
      const cityName =
        locationData?.city && locationData?.state
          ? `${locationData.city}, ${locationData.state}`
          : locationData?.city || locationData?.state || rawLocationInput;
      applyResolvedSeedPreview({
        query: rawLocationInput,
        coreCbg,
        cityName,
        seedName: locationData?.seed_name || coreCbg,
        seedCbgs: normalizedSeedCbgs,
        seedGeoJson,
        seedZip: locationData?.zip
      });
    } catch (err) {
      clearSeedPreviewWithError(
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
      const data = await fetchCbgGeoJson([normalized], true);
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
      const data = await fetchCbgAtPoint(latlng, stateHint);
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

  const handleGenerateSubmit = useGenerationPreviewSubmit({
    loading,
    location,
    setUseTestData,
    setSeedEditMode,
    resolvedSeedLookup,
    setupSeedCbg,
    setupSeedCbgs,
    setupResolvedCityName,
    seedGuardNeedsResolvedSeed,
    setResolvedSeedLookup,
    setError,
    setLoading,
    setAlgorithmMetadata,
    setGuidedMetadata,
    setGuidedDestinations,
    setGuidedSeedCbgs,
    setSelectedGuidedDestinationIds,
    setGuidedDestinationError,
    isGuidedSecondOrderAlgorithm,
    setGuidedDestinationLoading,
    startDate,
    setupSeedGeoJSON,
    loadSeedGeoJson,
    setSetupSeedGeoJSON,
    setSelectedCBGs,
    setSeedCBG,
    setTotalPopulation,
    setCityName,
    setGrowthTrace,
    setTraceStepIndex,
    setTraceEnabled,
    setZoneEditMode,
    setSelectedTraceCandidateCbg,
    setFocusedTraceCbg,
    setCbgGeoJSON,
    setMapCenter,
    setPhase,
    minPop,
    clusterAlgorithm,
    seedGuardDistanceKm,
    mobilityPruneMinSeedCapturePct,
    setClusterAlgorithm,
    setSeedGuardDistanceKm,
    setMobilityPruneMinSeedCapturePct
  });

  const {
    isPending,
    savingHtmlMap,
    finalizeProgress,
    finalizeStatusMessage,
    finalizeCZ,
    saveCZHtmlMap
  } = useZoneFinalization({
    selectedCBGs,
    startDate,
    endDate,
    guidedSelectionMode,
    guidedSelectionSummary,
    description,
    setDescription,
    cityName,
    location,
    seedCBG,
    clusterAlgorithm,
    mobilityPruneMinSeedCapturePct,
    isGuidedSecondOrderAlgorithm,
    minPop,
    useTestData,
    guidedMetadata,
    guidedSelectedDestinations,
    seedGuardDistanceKm,
    mapCenter,
    setError,
    setPhase
  });

  if (isPending) {
    return (
      <div className="czgen_page">
        <p className="czgen_lede" style={{ textAlign: 'center', paddingTop: '60px' }}>
          Loading...
        </p>
      </div>
    );
  }

  return (
    <div className="czgen_page">
      {isFinalizing && (
        <div
          className="czgen_modal_overlay"
          role="dialog"
          aria-modal="true"
          aria-live="polite"
        >
          <div className="czgen_modal">
            <p className="czgen_modal_title">Generating convenience zone</p>
            <p className="czgen_modal_subtitle">
              {finalizeStatusMessage || 'Preparing movement patterns...'}
            </p>
            <div className="czgen_progress_track">
              <div
                className="czgen_progress_fill"
                style={{
                  width: `${Math.max(2, Math.min(100, finalizeProgress))}%`
                }}
              />
            </div>
            <div className="mt-2 text-right text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>
              {finalizeProgress}%
            </div>
            <p className="mt-3 text-xs" style={{ color: 'var(--color-text-muted)' }}>
              This can take a few minutes. You&apos;ll be taken to the simulator
              automatically once generation is complete.
            </p>
          </div>
        </div>
      )}
      {showAlgorithmGuide && (
        <div
          className="czgen_modal_overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="algorithm-guide-title"
          tabIndex={-1}
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setShowAlgorithmGuide(false);
            }
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              setShowAlgorithmGuide(false);
            }
          }}
        >
          <div className="czgen_modal" style={{ width: 'min(34rem, 92vw)' }}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p id="algorithm-guide-title" className="czgen_modal_title">
                  Algorithm Guide
                </p>
                <p className="czgen_modal_subtitle">
                  Start with Mobility Prune unless the zone needs manual city
                  selection or diagnostic tracing.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAlgorithmGuide(false)}
                className="czgen_btn czgen_btn--sm"
                style={{ flexShrink: 0 }}
              >
                Close
              </button>
            </div>
            <div className="mt-4 flex flex-col gap-3">
              {CLUSTER_ALGORITHM_OPTIONS.map((option) => {
                const manual = CLUSTER_ALGORITHM_MANUAL[option.value];
                return (
                  <div
                    key={option.value}
                    className="border-l-4 px-3 py-2 text-sm"
                    style={{
                      borderColor: 'var(--color-primary-blue-soft)',
                      background: 'var(--color-bg-surface)',
                      color: 'var(--color-text-muted)',
                      borderRadius: '0 8px 8px 0'
                    }}
                  >
                    <div className="flex flex-wrap items-center gap-2 font-semibold" style={{ color: 'var(--color-text-main)' }}>
                      <span>{option.label}</span>
                      {manual.recommended && (
                        <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: 'rgba(22,163,74,0.1)', color: '#166534' }}>
                          default
                        </span>
                      )}
                    </div>
                    <div className="mt-1">{manual.summary}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
      <GuidedTermsHelpModal
        open={showGuidedTermsHelp}
        onClose={() => setShowGuidedTermsHelp(false)}
      />
      {!hasGenerated && (
        <div className="czgen_header" data-aos="fade-up" data-aos-once="true">
          <h1 className="czgen_title">Generate a Convenience Zone</h1>
          <p className="czgen_lede">
            Define your simulation&apos;s geographic area by selecting a location and clustering nearby Census Block Groups.
          </p>
        </div>
      )}
      <form
        onSubmit={handleGenerateSubmit}
        className="czgen_form"
      >
        {hasGenerated ? (
          <div className="w-full flex flex-col gap-4">
            <div className="flex gap-4 w-full flex-wrap 2xl:flex-nowrap">
              <div className="czgen_map h-[50vh] min-h-80 max-h-140 lg:h-[calc(100vh-13rem)] lg:min-h-136 lg:max-h-192 relative flex-1 min-w-0 w-full lg:min-w-176">
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
                    seedCbgIds={mapSeedCbgIds}
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
                <ConnectedCitiesPanel
                  seedLabel={guidedSeedLabel}
                  destinations={guidedDestinations}
                  selectedDestinationIds={selectedGuidedDestinationIds}
                  selectedDestinations={guidedSelectedDestinations}
                  selectedCbgCount={selectedCBGs.length}
                  metadata={guidedMetadata}
                  selectionSummary={guidedSelectionSummary}
                  styleByUnitId={guidedStyleByUnitId}
                  loading={guidedDestinationLoading}
                  error={guidedDestinationError}
                  isFinalizing={isFinalizing}
                  showSummary={showGuidedSummaryPanel}
                  onShowSummary={() => setShowGuidedSummaryPanel(true)}
                  onHideSummary={() => setShowGuidedSummaryPanel(false)}
                  onShowTermsHelp={() => setShowGuidedTermsHelp(true)}
                  onUseRecommended={selectRecommendedGuidedDestinations}
                  onSeedOnly={() => setSelectedGuidedDestinationIds([])}
                  onToggleDestination={toggleGuidedDestination}
                />
              )}

              {showCandidatePanels && (
                <FrontierCandidatesPanel
                  candidates={displayCandidates}
                  hasTraceLayer={Boolean(traceLayer)}
                  loading={manualFrontierLoading}
                  error={manualFrontierError}
                  selectedCbg={selectedTraceCandidateCbg}
                  onSelectCbg={handleTraceCandidateSelect}
                />
              )}

              {showCandidatePanels && (
                <CandidateAnalysisPanel
                  selectedCbg={selectedTraceCandidateCbg}
                  population={selectedTraceFeatureProperties?.population}
                  status={selectedAnalysisStatus}
                  candidate={selectedAnalysisCandidate}
                  pois={candidatePois}
                  poisLoading={candidatePoiLoading}
                  poisError={candidatePoiError}
                />
              )}
            </div>

            <GeneratedActionBar
              guidedSelectionMode={guidedSelectionMode}
              selectedGuidedDestinationCount={
                selectedGuidedDestinationIds.length
              }
              selectedCbgCount={selectedCBGs.length}
              guidedSelectedDestinationSummary={
                guidedSelectedDestinationSummary
              }
              guidedSelectionSummary={guidedSelectionSummary}
              mobilityPruneMetadata={mobilityPruneMetadata}
              totalPopulation={totalPopulation}
              showTraceControls={showTraceControls}
              growthTrace={growthTrace}
              traceStepCount={traceSteps.length}
              traceEnabled={traceEnabled}
              traceStepIndex={traceStepIndex}
              maxTraceStep={maxTraceStep}
              onTraceEnabledChange={setTraceEnabled}
              onJumpTraceStep={jumpToTraceStep}
              zoneMetricsLoading={zoneMetricsLoading}
              zoneMetricsError={zoneMetricsError}
              zoneMetrics={zoneMetrics}
              clusterAlgorithm={clusterAlgorithm}
              manualEditPanelsActive={manualEditPanelsActive}
              seedGuardDistanceKm={seedGuardDistanceKm}
              onSeedGuardDistanceChange={setSeedGuardDistanceKm}
              loading={loading}
              isFinalizing={isFinalizing}
              algorithmMetadata={algorithmMetadata}
              zoneEditMode={zoneEditMode}
              onEnterZoneEditMode={() => {
                setZoneEditMode(true);
                setTraceEnabled(false);
              }}
              onEnterTraceView={() => {
                setZoneEditMode(false);
                setTraceEnabled(Boolean(growthTrace?.steps?.length));
              }}
              onSaveHtmlMap={saveCZHtmlMap}
              savingHtmlMap={savingHtmlMap}
              onFinalize={finalizeCZ}
            />
          </div>
        ) : (
          <div className="w-full flex flex-col gap-4 lg:flex-row lg:items-stretch" data-aos="fade-up" data-aos-once="true" data-aos-delay="80">
            <div className="czgen_map h-[50vh] min-h-80 max-h-112 lg:h-[calc(100vh-6rem)] lg:min-h-168 lg:max-h-none w-full lg:min-w-0 lg:flex-1">
              <InteractiveMap
                onLocationSelect={(coords) => {
                  resetSeedPreview();
                  setLocation(coords);
                }}
                disabled={loading || resolvingSeed || seedEditLoading}
                seedGeoJSON={activeSetupSeedGeoJSON}
                seedCbgId={setupSeedCbg}
                seedCbgIds={setupSeedCbgs}
                originalSeedCbgIds={resolvedSetupSeedCbgs}
                seedGuardRadiusKm={seedGuardDistanceKm}
                showSeedGuardCircle={
                  clusterAlgorithm === 'greedy_weight_seed_guard'
                }
                seedEditMode={seedEditMode}
                seedEditAction={seedEditAction}
                onSeedCbgSelect={updateEditableSeedSelection}
              />
            </div>

            <SetupSeedPanel
              location={location}
              onLocationChange={(value) => {
                resetSeedPreview();
                setLocation(value);
              }}
              loading={loading}
              resolvingSeed={resolvingSeed}
              seedEditLoading={seedEditLoading}
              onResolveSeedPreview={resolveSeedPreview}
              isTestLocationInput={isTestLocationInput}
              clusterAlgorithm={clusterAlgorithm}
              onClusterAlgorithmChange={setClusterAlgorithm}
              onShowAlgorithmGuide={() => setShowAlgorithmGuide(true)}
              mobilityPruneMinSeedCapturePct={
                mobilityPruneMinSeedCapturePct
              }
              onMobilityPruneMinSeedCapturePctChange={
                setMobilityPruneMinSeedCapturePct
              }
              isGuidedSecondOrderAlgorithm={isGuidedSecondOrderAlgorithm}
              minPop={minPop}
              onMinPopChange={setMinPop}
              monthOptions={monthOptions}
              availableMonthsLoading={availableMonthsLoading}
              detectedStateAbbr={detectedStateAbbr}
              startDate={startDate}
              endDate={endDate}
              onStartDateChange={setStartDate}
              onEndDateChange={setEndDate}
              description={description}
              onDescriptionChange={setDescription}
              setupSeedCbg={setupSeedCbg}
              setupSeedLabel={setupSeedLabel}
              setupSeedCount={setupSeedCount}
              setupResolvedCityName={setupResolvedCityName}
              seedGuardDistanceKm={seedGuardDistanceKm}
              seedAdjustmentSummary={seedAdjustmentSummary}
              seedEditMode={seedEditMode}
              seedEditAction={seedEditAction}
              onSeedEditActionChange={setSeedEditAction}
              onFinishSeedEdit={finishSeedEdit}
              onCancelSeedEdit={cancelSeedEdit}
              onShowMoreSeedEditNeighbors={() => {
                void showMoreSeedEditNeighbors();
              }}
              onBeginSeedEdit={() => {
                void beginSeedEdit();
              }}
              onResetAdjustedSeed={() => {
                void resetAdjustedSeed();
              }}
              seedEditError={seedEditError}
              seedResolveError={seedResolveError}
              showAdvancedClustering={showAdvancedClustering}
              onToggleAdvancedClustering={() =>
                setShowAdvancedClustering((prev) => !prev)
              }
              onSeedGuardDistanceChange={setSeedGuardDistanceKm}
              seedGuardNeedsResolvedSeed={seedGuardNeedsResolvedSeed}
            />
          </div>
        )}

        {error && (
          <div className="czgen_error">{error}</div>
        )}
      </form>
    </div>
  );
}
