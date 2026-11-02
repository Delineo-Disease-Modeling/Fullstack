'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { NeighborhoodTable } from './neighborhood-rates';
import {
  loadNeighborhoodRates,
  type NeighborhoodFailure
} from './neighborhood-rates-client';

export type NeighborhoodState =
  | { status: 'idle' }
  | { status: 'loading'; done: number; total: number }
  | { status: 'unavailable'; reason: NeighborhoodFailure }
  | { status: 'error'; message: string }
  | { status: 'ready'; table: NeighborhoodTable };

type Params = {
  // Nothing is requested until this is true (the section is opened).
  enabled: boolean;
  simId: number | null;
  // Pass STABLE values (store values or useMemo results): they decide when the
  // request restarts, and a new array on every render would restart it on
  // every render.
  timesteps: readonly number[] | null;
  homes: readonly unknown[] | null;
};

type Inputs = {
  simId: number;
  timesteps: readonly number[];
  homes: readonly unknown[];
  attempt: number;
};

type Slot = Inputs & {
  done: number;
  total: number;
  // null while the request is running.
  outcome: NeighborhoodState | null;
};

function sameInputs(a: Inputs, b: Inputs) {
  return (
    a.simId === b.simId &&
    a.timesteps === b.timesteps &&
    a.homes === b.homes &&
    a.attempt === b.attempt
  );
}

// The neighborhoods of one run, fetched only while `enabled`. Closing the
// section drops them, so opening it again starts from fresh data. Every state is
// tied to the inputs it was produced for, and is only shown while those are
// still the current inputs: a run switch, a new home list or a retry never
// shows the previous run's numbers under the new one, not even for one render.
export function useNeighborhoodRates({
  enabled,
  simId,
  timesteps,
  homes
}: Params) {
  const [attempt, setAttempt] = useState(0);
  const [slot, setSlot] = useState<Slot | null>(null);

  const inputs = useMemo<Inputs | null>(
    () =>
      enabled && simId != null && timesteps != null && homes != null
        ? { simId, timesteps, homes, attempt }
        : null,
    [enabled, simId, timesteps, homes, attempt]
  );

  useEffect(() => {
    if (inputs === null) {
      setSlot(null);
      return;
    }
    const controller = new AbortController();
    const mine = (previous: Slot | null) =>
      previous !== null && sameInputs(previous, inputs);
    setSlot({ ...inputs, done: 0, total: 0, outcome: null });
    loadNeighborhoodRates({
      simId: inputs.simId,
      timesteps: inputs.timesteps,
      homes: inputs.homes,
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
        const outcome: NeighborhoodState = result.ok
          ? { status: 'ready', table: result.table }
          : { status: 'unavailable', reason: result.reason };
        setSlot((previous) =>
          mine(previous) && previous ? { ...previous, outcome } : previous
        );
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const outcome: NeighborhoodState = {
          status: 'error',
          message:
            error instanceof Error
              ? error.message
              : 'Could not load the neighborhoods of this run.'
        };
        setSlot((previous) =>
          mine(previous) && previous ? { ...previous, outcome } : previous
        );
      });
    return () => controller.abort();
  }, [inputs]);

  const retry = useCallback(() => setAttempt((count) => count + 1), []);

  let state: NeighborhoodState = { status: 'idle' };
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
