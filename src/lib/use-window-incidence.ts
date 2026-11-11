'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  loadWindowIncidence,
  type WindowIncidenceResult
} from './window-incidence-client';

export type WindowIncidenceState =
  | { status: 'idle' }
  | { status: 'loading' }
  // No window can be built for this run (older run without incidence, or data
  // that does not line up with the places).
  | { status: 'unavailable' }
  | { status: 'error'; message: string }
  | { status: 'ready'; result: WindowIncidenceResult };

type Ready = { simId: number; result: WindowIncidenceResult };
type Settled = {
  key: string;
  state: WindowIncidenceState;
  // The latest ready result, carried across requests so it can stay on screen
  // while the next window loads.
  lastReady: Ready | null;
};

// Wait for a slider to stop moving before downloading frames.
const DEBOUNCE_MS = 250;

// `timesteps` and `placeIds` are effect dependencies, so pass STABLE references
// (store values, or a useMemo result). Arrays rebuilt on every render would
// restart the request on every render, and each result re-renders again.
type Params = {
  simId: number | null | undefined;
  timesteps: readonly number[] | null;
  placeIds: readonly string[] | null;
  endMinutes: number | null;
  // null turns the window off (whole-run ranking), so nothing is fetched.
  windowHours: number | null;
};

// Incidence of the window that ends near `endMinutes`.
//
// `state` is tied to the request that produced it, so it is never the previous
// request's answer. While a new window of the SAME run loads, `staleResult` is
// the last ready result, which describes its own span (result.keys) and can be
// shown dimmed. It is null for a different run, so one run's numbers are never
// offered under another run.
export function useWindowIncidence({
  simId,
  timesteps,
  placeIds,
  endMinutes,
  windowHours
}: Params) {
  const [attempt, setAttempt] = useState(0);
  const [settled, setSettled] = useState<Settled | null>(null);

  const key = `${simId}|${endMinutes}|${windowHours}|${attempt}`;
  const enabled =
    simId != null &&
    timesteps != null &&
    placeIds != null &&
    endMinutes != null &&
    windowHours != null;

  useEffect(() => {
    if (
      simId == null ||
      timesteps == null ||
      placeIds == null ||
      endMinutes == null ||
      windowHours == null
    ) {
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      loadWindowIncidence({
        simId,
        timesteps,
        placeIds,
        endMinutes,
        windowHours,
        signal: controller.signal
      })
        .then((result) => {
          if (controller.signal.aborted) return;
          setSettled((previous) => ({
            key,
            state: result
              ? { status: 'ready', result }
              : { status: 'unavailable' },
            lastReady: result
              ? { simId, result }
              : (previous?.lastReady ?? null)
          }));
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          setSettled((previous) => ({
            key,
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
  }, [simId, timesteps, placeIds, endMinutes, windowHours, key]);

  const retry = useCallback(() => setAttempt((count) => count + 1), []);

  let state: WindowIncidenceState = { status: 'loading' };
  if (!enabled) {
    state = { status: 'idle' };
  } else if (settled && settled.key === key) {
    state = settled.state;
  }

  const lastReady = settled?.lastReady ?? null;
  const staleResult =
    state.status === 'loading' &&
    lastReady !== null &&
    lastReady.simId === simId
      ? lastReady.result
      : null;

  return { state, staleResult, retry };
}
