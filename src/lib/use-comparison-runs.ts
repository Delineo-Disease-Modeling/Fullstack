'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ComparisonRuns } from './comparison-pair';
import { loadComparisonRuns } from './comparison-runs-client';

export type ComparisonRunsState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; runs: ComparisonRuns };

type Params = {
  // Nothing is requested until this is true (the comparison is switched on).
  enabled: boolean;
  primaryId: number | null;
  referenceId: number | null;
};

// The two runs behind a comparison, fetched only while `enabled`. Switching the
// comparison off drops them, so switching it on again starts from fresh data.
// `state` is tied to the request that produced it, never to a previous one.
export function useComparisonRuns({ enabled, primaryId, referenceId }: Params) {
  const [attempt, setAttempt] = useState(0);
  const [settled, setSettled] = useState<{
    key: string;
    state: ComparisonRunsState;
  } | null>(null);

  const key = `${primaryId}|${referenceId}|${attempt}`;
  const active = enabled && primaryId != null && referenceId != null;

  useEffect(() => {
    if (!active || primaryId == null || referenceId == null) {
      setSettled(null);
      return;
    }
    const controller = new AbortController();
    loadComparisonRuns({ primaryId, referenceId, signal: controller.signal })
      .then((runs) => {
        if (controller.signal.aborted) return;
        setSettled({ key, state: { status: 'ready', runs } });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setSettled({
          key,
          state: {
            status: 'error',
            message:
              error instanceof Error
                ? error.message
                : 'Could not load the runs to compare.'
          }
        });
      });
    return () => controller.abort();
  }, [active, primaryId, referenceId, key]);

  const retry = useCallback(() => setAttempt((count) => count + 1), []);

  let state: ComparisonRunsState = { status: 'loading' };
  if (!active) {
    state = { status: 'idle' };
  } else if (settled && settled.key === key) {
    state = settled.state;
  }
  return { state, retry };
}
