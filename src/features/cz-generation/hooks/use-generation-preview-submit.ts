import { useCallback, type FormEvent } from 'react';
import {
  fetchSecondOrderDestinations,
  getClusteringProgressUrl,
  lookupLocation,
  startClusteringPreview
} from '@/features/cz-generation/api';
import type { ClusterAlgorithm } from '@/features/cz-generation/constants';
import {
  dedupeCbgList,
  getPayloadErrorMessage,
  isClusterAlgorithm,
  isRecord
} from '@/features/cz-generation/helpers';
import type {
  ClusterAlgorithmMetadata,
  ClusteringPreviewResponse,
  GuidedDestinationCandidate,
  GuidedSecondOrderMetadata,
  ResolvedSeedLookup,
  TracePayload
} from '@/features/cz-generation/types';
import {
  type GeoJSONData,
  getBoundsForGeoJson,
  mergeGeoJsonFeatures
} from '@/lib/cz-geo';

type Phase = 'input' | 'edit' | 'finalizing';

type UseGenerationPreviewSubmitParams = {
  loading: boolean;
  location: string;
  setUseTestData: (value: boolean) => void;
  setSeedEditMode: (value: boolean) => void;
  resolvedSeedLookup: ResolvedSeedLookup | null;
  setupSeedCbg: string;
  setupSeedCbgs: string[];
  setupResolvedCityName: string;
  seedGuardNeedsResolvedSeed: boolean;
  setResolvedSeedLookup: (value: ResolvedSeedLookup | null) => void;
  setError: (value: string) => void;
  setLoading: (value: boolean) => void;
  setAlgorithmMetadata: (value: ClusterAlgorithmMetadata | null) => void;
  setGuidedMetadata: (value: GuidedSecondOrderMetadata | null) => void;
  setGuidedDestinations: (value: GuidedDestinationCandidate[]) => void;
  setGuidedSeedCbgs: (value: string[]) => void;
  setSelectedGuidedDestinationIds: (value: string[]) => void;
  setGuidedDestinationError: (value: string) => void;
  isGuidedSecondOrderAlgorithm: boolean;
  setGuidedDestinationLoading: (value: boolean) => void;
  startDate: string;
  setupSeedGeoJSON: GeoJSONData | null;
  loadSeedGeoJson: (
    seedCbgs: string[],
    includeNeighbors: boolean
  ) => Promise<GeoJSONData>;
  setSetupSeedGeoJSON: (value: GeoJSONData | null) => void;
  setSelectedCBGs: (value: string[]) => void;
  setSeedCBG: (value: string) => void;
  setTotalPopulation: (value: number) => void;
  setCityName: (value: string) => void;
  setGrowthTrace: (value: TracePayload | null) => void;
  setTraceStepIndex: (value: number) => void;
  setTraceEnabled: (value: boolean) => void;
  setZoneEditMode: (value: boolean) => void;
  setSelectedTraceCandidateCbg: (value: string) => void;
  setFocusedTraceCbg: (value: string) => void;
  setCbgGeoJSON: (value: GeoJSONData | null) => void;
  setMapCenter: (value: [number, number] | null) => void;
  setPhase: (value: Phase) => void;
  minPop: number;
  clusterAlgorithm: ClusterAlgorithm;
  seedGuardDistanceKm: number;
  mobilityPruneMinSeedCapturePct: number;
  setClusterAlgorithm: (value: ClusterAlgorithm) => void;
  setSeedGuardDistanceKm: (value: number) => void;
  setMobilityPruneMinSeedCapturePct: (value: number) => void;
};

export function useGenerationPreviewSubmit({
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
}: UseGenerationPreviewSubmitParams) {
  const waitForClusteringResult = useCallback(
    (clusteringId: number): Promise<ClusteringPreviewResponse> =>
      new Promise((resolve, reject) => {
        let settled = false;
        const eventSource = new EventSource(
          getClusteringProgressUrl(clusteringId)
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
    []
  );

  return useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (loading) {
        return;
      }

      const rawLocationInput = String(location ?? '').trim();
      const isTestMode = rawLocationInput.toUpperCase() === 'TEST';
      setUseTestData(isTestMode);
      setSeedEditMode(false);

      const cachedSeedLookup =
        resolvedSeedLookup?.query === rawLocationInput
          ? resolvedSeedLookup
          : null;
      let coreCbg = setupSeedCbg || cachedSeedLookup?.cbg || null;
      let resolvedSeedCbgs =
        setupSeedCbgs.length > 0
          ? setupSeedCbgs
          : cachedSeedLookup?.seedCbgs ||
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
          const data = await fetchSecondOrderDestinations({
            cbg: coreCbg,
            seed_cbgs: resolvedSeedCbgs,
            start_date: startDate,
            use_test_data: isTestMode,
            limit: 12
          });

          let seedGeoJson = setupSeedGeoJSON;
          if (!seedGeoJson?.features?.length) {
            seedGeoJson = await loadSeedGeoJson(resolvedSeedCbgs, false);
            setSetupSeedGeoJSON(seedGeoJson);
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
                .filter(
                  (unitId): unitId is string => typeof unitId === 'string'
                )
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
                  (sum, destination) =>
                    sum + Number(destination.population ?? 0),
                  0
                )
          );
          setCityName(resolvedCityName);
          setUseTestData(Boolean(data.use_test_data ?? isTestMode));
          setGrowthTrace(null);
          setTraceStepIndex(0);
          setTraceEnabled(false);
          setZoneEditMode(false);
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
        if (clusterAlgorithm === 'mobility_prune') {
          const minSeedCapture = Number(mobilityPruneMinSeedCapturePct) / 100;
          if (Number.isFinite(minSeedCapture)) {
            clusterReq.mobility_prune_min_seed_capture = Math.min(
              1,
              Math.max(0, minSeedCapture)
            );
          }
        }

        if (coreCbg) {
          clusterReq.cbg = coreCbg;
        }
        if (resolvedSeedCbgs.length > 0) {
          clusterReq.seed_cbgs = resolvedSeedCbgs;
        }

        const kickoffData = await startClusteringPreview(clusterReq);

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
        const responseAlgorithm = isClusterAlgorithm(data.algorithm)
          ? data.algorithm
          : clusterAlgorithm;
        if (isClusterAlgorithm(data.algorithm)) {
          setClusterAlgorithm(responseAlgorithm);
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
        if (data.clustering_params && data.algorithm === 'mobility_prune') {
          const rawMinSeedCapture = Number(
            data.clustering_params.min_seed_capture
          );
          if (Number.isFinite(rawMinSeedCapture)) {
            setMobilityPruneMinSeedCapturePct(
              Math.round(Math.min(1, Math.max(0, rawMinSeedCapture)) * 100)
            );
          }
        }

        setGrowthTrace(data.trace || null);
        setTraceStepIndex(0);
        setTraceEnabled(
          Boolean(data.trace?.steps?.length) &&
            responseAlgorithm !== 'mobility_prune'
        );
        setZoneEditMode(false);

        if (data.geojson || data.trace_geojson) {
          setCbgGeoJSON(
            mergeGeoJsonFeatures(
              data.geojson || null,
              data.trace_geojson || null
            )
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
    },
    [
      clusterAlgorithm,
      isGuidedSecondOrderAlgorithm,
      loadSeedGeoJson,
      loading,
      location,
      minPop,
      mobilityPruneMinSeedCapturePct,
      resolvedSeedLookup,
      seedGuardDistanceKm,
      seedGuardNeedsResolvedSeed,
      setAlgorithmMetadata,
      setCbgGeoJSON,
      setCityName,
      setClusterAlgorithm,
      setError,
      setFocusedTraceCbg,
      setGrowthTrace,
      setGuidedDestinationError,
      setGuidedDestinationLoading,
      setGuidedDestinations,
      setGuidedMetadata,
      setGuidedSeedCbgs,
      setLoading,
      setMapCenter,
      setMobilityPruneMinSeedCapturePct,
      setPhase,
      setResolvedSeedLookup,
      setSeedCBG,
      setSeedEditMode,
      setSeedGuardDistanceKm,
      setSelectedCBGs,
      setSelectedGuidedDestinationIds,
      setSelectedTraceCandidateCbg,
      setSetupSeedGeoJSON,
      setTotalPopulation,
      setTraceEnabled,
      setTraceStepIndex,
      setUseTestData,
      setZoneEditMode,
      setupResolvedCityName,
      setupSeedCbg,
      setupSeedCbgs,
      setupSeedGeoJSON,
      startDate,
      waitForClusteringResult
    ]
  );
}
