'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DailyIncidence, WholeRun } from './daily-incidence';
import {
  type DailyFailure,
  loadDailyIncidence
} from './daily-incidence-client';

export type DailyState =
  | { status: 'idle' }
  | { status: 'loading'; done: number; total: number }
  | { status: 'unavailable'; reason: DailyFailure }
  | { status: 'error'; message: string }
  | { status: 'ready'; daily: DailyIncidence };

type PlaceLike = { id: string | number };

type Params<P extends PlaceLike> = {
  // Nothing is requested until this is true (the section is opened).
  enabled: boolean;
  simId: number | null;
  // Pass STABLE values (store values or useMemo results): they decide when the
  // request restarts, and a new array on every render would restart it on
  // every render.
  timesteps: readonly number[] | null;
  places: readonly P[] | null;
  wholeRun: WholeRun | null;
};

type Inputs<P extends PlaceLike> = {
  simId: number;
  timesteps: readonly number[];
  places: readonly P[];
  wholeRun: WholeRun;
  attempt: number;
};

type Slot<P extends PlaceLike> = Inputs<P> & {
  done: number;
  total: number;
  // null while the request is running.
  outcome: DailyState | null;
};

function sameInputs<P extends PlaceLike>(a: Inputs<P>, b: Inputs<P>) {
  return (
    a.simId === b.simId &&
    a.timesteps === b.timesteps &&
    a.places === b.places &&
    a.wholeRun === b.wholeRun &&
    a.attempt === b.attempt
  );
}

// The days of one run, fetched only while `enabled`. Closing the section drops
// them, so opening it again starts from fresh data. Every state is tied to the
// inputs it was produced for, and is only shown while those are still the
// current inputs: a run switch, a new place list or a retry never shows the
// previous run's numbers under the new one, not even for one render.
export function useDailyIncidence<P extends PlaceLike>({
  enabled,
  simId,
  timesteps,
  places,
  wholeRun
}: Params<P>) {
  const [attempt, setAttempt] = useState(0);
  const [slot, setSlot] = useState<Slot<P> | null>(null);

  const inputs = useMemo<Inputs<P> | null>(
    () =>
      enabled &&
      simId != null &&
      timesteps != null &&
      places != null &&
      wholeRun != null
        ? { simId, timesteps, places, wholeRun, attempt }
        : null,
    [enabled, simId, timesteps, places, wholeRun, attempt]
  );

  useEffect(() => {
    if (inputs === null) {
      setSlot(null);
      return;
    }
    const controller = new AbortController();
    const mine = (previous: Slot<P> | null) =>
      previous !== null && sameInputs(previous, inputs);
    setSlot({ ...inputs, done: 0, total: 0, outcome: null });
    loadDailyIncidence({
      simId: inputs.simId,
      timesteps: inputs.timesteps,
      placeIds: inputs.places.map((place) => String(place.id)),
      wholeRun: inputs.wholeRun,
      signal: controller.signal,
      onProgress: (done, total) => {
        if (controller.signal.aborted) return;
        setSlot((previous) =>
          mine(previous) && previous ? { ...previous, done, total } : previous
        );
      }
    })
      .then((result) => {
        if (controller.signal.aborted) return;
        const outcome: DailyState = result.ok
          ? { status: 'ready', daily: result.daily }
          : { status: 'unavailable', reason: result.reason };
        setSlot((previous) =>
          mine(previous) && previous ? { ...previous, outcome } : previous
        );
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const outcome: DailyState = {
          status: 'error',
          message:
            error instanceof Error
              ? error.message
              : 'Could not load the days of this run.'
        };
        setSlot((previous) =>
          mine(previous) && previous ? { ...previous, outcome } : previous
        );
      });
    return () => controller.abort();
  }, [inputs]);

  const retry = useCallback(() => setAttempt((count) => count + 1), []);

  let state: DailyState = { status: 'idle' };
  if (inputs !== null) {
    state =
      slot !== null && sameInputs(slot, inputs)
        ? (slot.outcome ?? {
            status: 'loading',
            done: slot.done,
            total: slot.total
          })
        : { status: 'loading', done: 0, total: 0 };
  }
  return { state, retry };
}
