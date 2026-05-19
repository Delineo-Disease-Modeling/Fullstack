import { useEffect, useState } from 'react';
import { fetchCzMetrics } from '@/features/cz-generation/api';
import type { ZoneMetrics } from '@/features/cz-generation/types';

type UseCzMetricsOptions = {
  enabled: boolean;
  seedCbg: string;
  cbgs: string[];
  startDate: string;
  useTestData: boolean;
  debounceMs?: number;
  errorMessage?: string;
  warnMessage?: string;
};

export function useCzMetrics({
  enabled,
  seedCbg,
  cbgs,
  startDate,
  useTestData,
  debounceMs = 0,
  errorMessage,
  warnMessage
}: UseCzMetricsOptions) {
  const [metrics, setMetrics] = useState<ZoneMetrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!enabled || !seedCbg || cbgs.length === 0) {
      setMetrics(null);
      setError('');
      setLoading(false);
      return undefined;
    }

    let cancelled = false;

    const loadMetrics = async () => {
      setLoading(true);
      setError('');

      try {
        const data = await fetchCzMetrics({
          seed_cbg: seedCbg,
          cbg_list: cbgs,
          start_date: startDate,
          use_test_data: useTestData
        });
        if (!cancelled) {
          setMetrics(data || null);
        }
      } catch (err) {
        if (cancelled) {
          return;
        }

        setMetrics(null);
        if (warnMessage) {
          console.warn(warnMessage, err);
        }
        if (errorMessage) {
          setError(err instanceof Error ? err.message : errorMessage);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    const timer =
      debounceMs > 0 ? setTimeout(loadMetrics, debounceMs) : null;
    if (!timer) {
      void loadMetrics();
    }

    return () => {
      cancelled = true;
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [
    cbgs,
    debounceMs,
    enabled,
    errorMessage,
    seedCbg,
    startDate,
    useTestData,
    warnMessage
  ]);

  return { metrics, loading, error };
}
