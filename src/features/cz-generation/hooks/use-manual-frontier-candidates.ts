import { useEffect, useState } from 'react';
import {
  fetchFrontierCandidates,
  type FrontierCandidatesResponse
} from '@/features/cz-generation/api';
import type { ClusterAlgorithm } from '@/features/cz-generation/constants';
import type { TraceCandidate } from '@/features/cz-generation/types';
import { normalizeCbgId } from '@/lib/cz-geo';

type UseManualFrontierCandidatesOptions = {
  enabled: boolean;
  seedCbg: string;
  cbgs: string[];
  clusterAlgorithm: ClusterAlgorithm;
  minPop: number;
  startDate: string;
  useTestData: boolean;
  seedGuardDistanceKm: number;
  mobilityPruneMinSeedCapturePct: number;
  selectedCbg: string;
  onFallbackCbg: (cbg: string) => void;
};

export function useManualFrontierCandidates({
  enabled,
  seedCbg,
  cbgs,
  clusterAlgorithm,
  minPop,
  startDate,
  useTestData,
  seedGuardDistanceKm,
  mobilityPruneMinSeedCapturePct,
  selectedCbg,
  onFallbackCbg
}: UseManualFrontierCandidatesOptions) {
  const [candidates, setCandidates] = useState<TraceCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!enabled || !seedCbg || !cbgs.length) {
      setCandidates([]);
      setError('');
      setLoading(false);
      return undefined;
    }

    let cancelled = false;
    setLoading(true);
    setError('');

    const req: Record<string, unknown> = {
      seed_cbg: seedCbg,
      cbg_list: cbgs,
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
    if (clusterAlgorithm === 'mobility_prune') {
      const minSeedCapture = Number(mobilityPruneMinSeedCapturePct) / 100;
      if (Number.isFinite(minSeedCapture)) {
        req.mobility_prune_min_seed_capture = Math.min(
          1,
          Math.max(0, minSeedCapture)
        );
      }
    }

    fetchFrontierCandidates(req)
      .then((data: FrontierCandidatesResponse) => {
        if (cancelled) {
          return;
        }

        const nextCandidates = Array.isArray(data?.candidates)
          ? data.candidates
          : [];
        setCandidates(nextCandidates);

        const selectedNow = normalizeCbgId(selectedCbg);
        const selectedStillValid =
          (selectedNow && cbgs.includes(selectedNow)) ||
          nextCandidates.some(
            (candidate) => normalizeCbgId(candidate?.cbg) === selectedNow
          );

        if (!selectedStillValid) {
          onFallbackCbg(
            normalizeCbgId(nextCandidates[0]?.cbg || cbgs[0] || '')
          );
        }
      })
      .catch((err) => {
        if (cancelled) {
          return;
        }
        setCandidates([]);
        setError(
          err instanceof Error
            ? err.message
            : 'Failed to load frontier candidates.'
        );
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    cbgs,
    clusterAlgorithm,
    enabled,
    minPop,
    mobilityPruneMinSeedCapturePct,
    onFallbackCbg,
    seedCbg,
    seedGuardDistanceKm,
    selectedCbg,
    startDate,
    useTestData
  ]);

  return { candidates, loading, error };
}
