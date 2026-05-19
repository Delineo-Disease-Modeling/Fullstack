import { useEffect, useState } from 'react';
import { fetchCandidatePois } from '@/features/cz-generation/api';
import type { PoiAnalysis } from '@/features/cz-generation/types';

type UseCandidatePoisOptions = {
  enabled: boolean;
  seedCbg: string;
  candidateCbg: string;
  clusterCbgs: string[];
  startDate: string;
  useTestData: boolean;
  limit?: number;
};

export function useCandidatePois({
  enabled,
  seedCbg,
  candidateCbg,
  clusterCbgs,
  startDate,
  useTestData,
  limit = 8
}: UseCandidatePoisOptions) {
  const [pois, setPois] = useState<PoiAnalysis[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!enabled || !candidateCbg) {
      setPois([]);
      setError('');
      setLoading(false);
      return undefined;
    }

    if (clusterCbgs.length === 0) {
      setPois([]);
      setError('');
      setLoading(false);
      return undefined;
    }

    let cancelled = false;
    setLoading(true);
    setError('');

    fetchCandidatePois({
      seed_cbg: seedCbg,
      candidate_cbg: candidateCbg,
      cluster_cbgs: clusterCbgs,
      start_date: startDate,
      use_test_data: useTestData,
      limit
    })
      .then((data) => {
        if (cancelled) {
          return;
        }
        setPois(Array.isArray(data?.pois) ? data.pois : []);
      })
      .catch((err) => {
        if (cancelled) {
          return;
        }
        setPois([]);
        setError(
          err instanceof Error ? err.message : 'Failed to load POI analysis.'
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
    candidateCbg,
    clusterCbgs,
    enabled,
    limit,
    seedCbg,
    startDate,
    useTestData
  ]);

  return { pois, loading, error };
}
