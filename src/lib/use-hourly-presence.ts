'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchPlaceSeries, type PlaceSeries } from './hourly-presence-client';

export type PlaceSeriesState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; series: PlaceSeries };

type Inputs = { simId: number; placeId: string; attempt: number };

type Slot = Inputs & {
  // null while the request is running.
  outcome: PlaceSeriesState | null;
};

function sameInputs(a: Inputs, b: Inputs) {
  return (
    a.simId === b.simId && a.placeId === b.placeId && a.attempt === b.attempt
  );
}

// The series of one place, fetched only while `enabled`. Every state is tied to
// the inputs it was produced for and shown only while those are still the
// current ones: switching the place or the run never shows the previous
// place's numbers under the new one, not even for one render.
export function usePlaceSeries({
  enabled,
  simId,
  placeId
}: {
  enabled: boolean;
  simId: number | null;
  placeId: string | null;
}) {
  const [attempt, setAttempt] = useState(0);
  const [slot, setSlot] = useState<Slot | null>(null);

  const inputs = useMemo<Inputs | null>(
    () =>
      enabled && simId != null && placeId != null
        ? { simId, placeId, attempt }
        : null,
    [enabled, simId, placeId, attempt]
  );

  useEffect(() => {
    if (inputs === null) {
      setSlot(null);
      return;
    }
    const controller = new AbortController();
    const mine = (previous: Slot | null) =>
      previous !== null && sameInputs(previous, inputs);
    setSlot({ ...inputs, outcome: null });
    fetchPlaceSeries(inputs.simId, inputs.placeId, controller.signal)
      .then((series) => {
        if (controller.signal.aborted) return;
        const outcome: PlaceSeriesState = { status: 'ready', series };
        setSlot((previous) =>
          mine(previous) && previous ? { ...previous, outcome } : previous
        );
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const outcome: PlaceSeriesState = {
          status: 'error',
          message:
            error instanceof Error
              ? error.message
              : 'Could not load this place.'
        };
        setSlot((previous) =>
          mine(previous) && previous ? { ...previous, outcome } : previous
        );
      });
    return () => controller.abort();
  }, [inputs]);

  const retry = useCallback(() => setAttempt((count) => count + 1), []);

  let state: PlaceSeriesState = { status: 'idle' };
  if (inputs !== null) {
    state =
      slot !== null && sameInputs(slot, inputs)
        ? (slot.outcome ?? { status: 'loading' })
        : { status: 'loading' };
  }
  return { state, retry };
}
