// Loads the same time window for the two runs of a comparison and hands both
// back together. No React here, so it can be tested with a fake frame fetcher.
//
// The two windows are only meaningful side by side when they cover exactly the
// same frames, so that is verified here instead of assumed: each run snaps the
// requested end hour to its own nearest frame, which would silently shift one
// window if the runs did not share a frame grid.

import { hasExactTotal, sameWindowKeys } from './compare-incidence.ts';
import type { ComparisonRuns } from './comparison-pair.ts';
import type { WindowFrameKeys, WindowIncidence } from './hotspot-window.ts';
import {
  type FrameFetcher,
  fetchIncidenceFrame,
  forgetRunFrames,
  loadWindowIncidence
} from './window-incidence-client.ts';

export type ComparisonWindowResult = {
  keys: WindowFrameKeys;
  reference: WindowIncidence;
  primary: WindowIncidence;
};

export type LoadComparisonWindowArgs = {
  runs: ComparisonRuns;
  endMinutes: number;
  windowHours: number;
  signal?: AbortSignal;
  fetchFrame?: FrameFetcher;
};

/**
 * Drop the frames remembered for both runs of a pair. Called whenever a pair
 * becomes active, however it arrived (loaded from the URL or handed in as a
 * prop), so a refreshed description of a run is never read against frames that
 * belong to an older one.
 */
export function forgetComparisonFrames(runs: ComparisonRuns) {
  forgetRunFrames(runs.primary.simId);
  forgetRunFrames(runs.reference.simId);
}

/**
 * One frame for a comparison, straight from the server. The page forgets the
 * frames it remembers when a pair is loaded, but the browser's own HTTP cache
 * (the server allows 30 s) would still hand back an older frame and mix it with
 * a newer manifest, so the comparison bypasses it.
 */
export function fetchComparisonFrame(
  simId: number,
  minutes: number,
  signal?: AbortSignal,
  fetchImpl: typeof fetch = fetch,
  origin?: string
) {
  return fetchIncidenceFrame(
    simId,
    minutes,
    signal,
    (input, init) => fetchImpl(input, { ...init, cache: 'no-store' }),
    origin
  );
}

/**
 * New infections inside one window for both runs. Resolves null when the pair
 * cannot be compared for this window: a run has no usable incidence for its
 * places, the two windows do not cover the same frames, or a run's counts are
 * too large to add up exactly. Rejects on network or server errors (the first
 * failure cancels the other run's requests) and when the signal aborts, even if
 * both answers had already arrived.
 */
export async function loadComparisonWindow({
  runs,
  endMinutes,
  windowHours,
  signal,
  fetchFrame = fetchComparisonFrame
}: LoadComparisonWindowArgs): Promise<ComparisonWindowResult | null> {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

  // The pair was checked to list the same places, so one id list serves both.
  const placeIds = runs.primary.places.map((place) => place.id);
  const inner = new AbortController();
  const forwardAbort = () => inner.abort();
  signal?.addEventListener('abort', forwardAbort, { once: true });
  const failFast = <T>(promise: Promise<T>): Promise<T> =>
    promise.catch((error: unknown) => {
      inner.abort();
      throw error;
    });
  const loadRun = (run: ComparisonRuns['primary']) =>
    failFast(
      loadWindowIncidence({
        simId: run.simId,
        timesteps: run.timesteps,
        placeIds,
        endMinutes,
        windowHours,
        signal: inner.signal,
        fetchFrame
      })
    );

  let primary: Awaited<ReturnType<typeof loadWindowIncidence>>;
  let reference: Awaited<ReturnType<typeof loadWindowIncidence>>;
  try {
    [primary, reference] = await Promise.all([
      loadRun(runs.primary),
      loadRun(runs.reference)
    ]);
  } finally {
    signal?.removeEventListener('abort', forwardAbort);
  }
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

  if (!primary || !reference) return null;
  if (!sameWindowKeys(primary.keys, reference.keys)) return null;
  // Both runs list the same places, so one catalogue serves for both.
  if (
    !hasExactTotal(primary.incidence, runs.primary.places) ||
    !hasExactTotal(reference.incidence, runs.primary.places)
  ) {
    return null;
  }
  return {
    keys: primary.keys,
    reference: reference.incidence,
    primary: primary.incidence
  };
}
