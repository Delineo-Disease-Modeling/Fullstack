'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ComparisonRuns } from './comparison-pair';
import {
  type ComparisonWindowResult,
  forgetComparisonFrames,
  loadComparisonWindow
} from './comparison-window-client';

export type ComparisonWindowState =
  | { status: 'idle' }
  | { status: 'loading' }
  // The pair cannot be compared for this window (a run has no usable
  // incidence, or the two windows do not cover the same frames).
  | { status: 'unavailable' }
  | { status: 'error'; message: string }
  | { status: 'ready'; result: ComparisonWindowResult };

type Settled = {
  key: string;
  runs: ComparisonRuns;
  state: ComparisonWindowState;
  // The latest ready pair, kept so it can stay on screen while the next window
  // loads. It is a complete pair (both runs, one window) with its own keys.
  lastReady: { runs: ComparisonRuns; result: ComparisonWindowResult } | null;
};

// Wait for a slider to stop moving before downloading frames.
const DEBOUNCE_MS = 250;

type Params = {
  // Pass a STABLE object (a state value or a useMemo result): it is an effect
  // dependency, and a new object on every render would restart the request on
  // every render. null turns the comparison off, so nothing is fetched.
  runs: ComparisonRuns | null;
  endMinutes: number | null;
  windowHours: number | null;
};

// The same window for both runs of a comparison. Both columns are published
// together by one request, so a ready state never mixes the new window of one
// run with the old window of the other. While the next window of the SAME pair
// loads, `staleResult` is the previous complete pair, which describes its own
// span. It is null for a different pair (for example after the runs were
// loaded again).
export function useComparisonWindow({ runs, endMinutes, windowHours }: Params) {
  const [attempt, setAttempt] = useState(0);
  const [settled, setSettled] = useState<Settled | null>(null);

  const key = `${runs?.primary.simId}|${runs?.reference.simId}|${endMinutes}|${windowHours}|${attempt}`;
  const enabled = runs != null && endMinutes != null && windowHours != null;

  // A new pair, from any source, never reads frames remembered for an older
  // description of the same runs, and never shows a result from an earlier
  // activation (a pair that is switched to B and back to A before B loaded would
  // otherwise get A's old result, not marked as refreshing). This effect is
  // declared before the one that loads, so it runs first; the slider does not
  // change `runs`, so moving it keeps the frames and the last result.
  useEffect(() => {
    if (runs != null) forgetComparisonFrames(runs);
    setSettled(null);
  }, [runs]);

  useEffect(() => {
    if (runs == null || endMinutes == null || windowHours == null) {
      // Switched off: what was loaded belongs to the previous activation.
      setSettled(null);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      loadComparisonWindow({
        runs,
        endMinutes,
        windowHours,
        signal: controller.signal
      })
        .then((result) => {
          if (controller.signal.aborted) return;
          setSettled((previous) => ({
            key,
            runs,
            state: result
              ? { status: 'ready', result }
              : { status: 'unavailable' },
            lastReady: result ? { runs, result } : (previous?.lastReady ?? null)
          }));
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          setSettled((previous) => ({
            key,
            runs,
            state: {
              status: 'error',
              message:
                error instanceof Error
                  ? error.message
                  : 'Could not load this window.'
            },
            lastReady: previous?.lastReady ?? null
          }));
        });
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [runs, endMinutes, windowHours, key]);

  const retry = useCallback(() => setAttempt((count) => count + 1), []);

  let state: ComparisonWindowState = { status: 'loading' };
  if (!enabled) {
    state = { status: 'idle' };
  } else if (settled && settled.key === key && settled.runs === runs) {
    state = settled.state;
  }

  const lastReady = settled?.lastReady ?? null;
  const staleResult =
    state.status === 'loading' && lastReady !== null && lastReady.runs === runs
      ? lastReady.result
      : null;

  return { state, staleResult, retry };
}
