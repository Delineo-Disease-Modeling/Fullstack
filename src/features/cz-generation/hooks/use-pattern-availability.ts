import { useEffect, useMemo, useState } from 'react';
import { fetchPatternAvailability } from '@/features/cz-generation/api';

export function usePatternAvailability(detectedStateAbbr: string | null) {
  const [availableMonths, setAvailableMonths] = useState<string[]>([]);
  const [availableMonthsLoading, setAvailableMonthsLoading] = useState(false);

  useEffect(() => {
    if (!detectedStateAbbr) {
      setAvailableMonths([]);
      setAvailableMonthsLoading(false);
      return undefined;
    }

    const controller = new AbortController();
    let cancelled = false;
    setAvailableMonthsLoading(true);

    fetchPatternAvailability(
      {
        state: detectedStateAbbr,
        startDate: '2018-01-01',
        endDate: '2025-12-31'
      },
      controller.signal
    )
      .then((resp) => {
        if (cancelled) {
          return;
        }
        const months = Array.isArray(resp?.data?.available_months)
          ? resp.data.available_months.filter(
              (month): month is string => typeof month === 'string'
            )
          : [];
        setAvailableMonths(months);
      })
      .catch((err) => {
        if ((err as Error).name === 'AbortError') {
          return;
        }
        console.warn('Failed to load available months:', err);
        if (!cancelled) {
          setAvailableMonths([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setAvailableMonthsLoading(false);
        }
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [detectedStateAbbr]);

  const monthOptions = useMemo(
    () => [...availableMonths].sort(),
    [availableMonths]
  );

  return {
    availableMonths,
    availableMonthsLoading,
    monthOptions
  };
}
