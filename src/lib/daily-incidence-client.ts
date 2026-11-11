// Loads the frames behind the by-day heatmap and turns them into per-day counts.
// No React here, so it can be tested with a fake frame fetcher.
//
// The frames come straight from the server (`cache: 'no-store'`): the server
// lets browsers keep them for 30 s, and a frame cached for an older version of
// the run must not be mixed with the description of the run the page holds.
// Nothing is remembered between calls. The load is all-or-nothing, so a partly
// filled matrix never reaches the screen.

import {
  type BuildFailure,
  buildDaily,
  type DailyIncidence,
  finalFrameMatches,
  type PlanFailure,
  planDays,
  type WholeRun
} from './daily-incidence.ts';
import { type CumulativeFrame, hasValidCounts } from './hotspot-window.ts';
import {
  type FrameFetcher,
  fetchIncidenceFrame
} from './window-incidence-client.ts';

// A few at a time: every frame is a request the server answers by reading the
// run's cache file, and a cold cache is rebuilt once per request in flight.
export const DAILY_CONCURRENCY = 4;
export const DAILY_DEADLINE_MS = 90_000;

export type DailyFailure = PlanFailure | BuildFailure | 'bad-places';

export type DailyResult =
  | { ok: true; daily: DailyIncidence }
  | { ok: false; reason: DailyFailure };

/**
 * One frame, straight from the server. fetchIncidenceFrame also refuses a
 * response for another time (the server answers with the nearest frame when
 * the one asked for does not exist), a 202 and a malformed body.
 */
export function fetchFreshFrame(
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

export type LoadDailyArgs = {
  simId: number;
  timesteps: readonly number[] | null | undefined;
  placeIds: readonly string[];
  // What the page already shows for the whole run; the days must add up to it.
  wholeRun: WholeRun;
  signal?: AbortSignal;
  fetchFrame?: FrameFetcher;
  concurrency?: number;
  deadlineMs?: number;
  onProgress?: (done: number, total: number) => void;
};

function abortError() {
  return new DOMException('Aborted', 'AbortError');
}

/**
 * The new infections per place and per day of a run. Resolves with a reason
 * (and downloads nothing, or only one frame) when a by-day view is not possible
 * for the run: not a complete hourly grid, too long, unusable place list,
 * frames that do not line up or do not add up. Rejects on network or server
 * errors (the first real error is the one reported), when the deadline passes,
 * and when the signal aborts, even if every answer had already arrived.
 */
export async function loadDailyIncidence({
  simId,
  timesteps,
  placeIds,
  wholeRun,
  signal,
  fetchFrame = fetchFreshFrame,
  concurrency = DAILY_CONCURRENCY,
  deadlineMs = DAILY_DEADLINE_MS,
  onProgress
}: LoadDailyArgs): Promise<DailyResult> {
  if (signal?.aborted) throw abortError();

  const planned = planDays(timesteps);
  if (!planned.ok) return planned;
  const { plan } = planned;
  if (
    placeIds.length === 0 ||
    placeIds.some((id) => id === '') ||
    new Set(placeIds).size !== placeIds.length
  ) {
    return { ok: false, reason: 'bad-places' };
  }

  const total = plan.hours.length;
  // One slot per frame hour, filled by position, never by completion order.
  const frames: Array<CumulativeFrame | undefined> = new Array(total).fill(
    undefined
  );
  const inner = new AbortController();
  const forwardAbort = () => inner.abort();
  signal?.addEventListener('abort', forwardAbort, { once: true });
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    inner.abort();
  }, deadlineMs);

  // A request that is cancelled stops counting at once, even when the fetcher
  // itself ignores the signal and answers later.
  const cancellable = <T>(promise: Promise<T>): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      if (inner.signal.aborted) {
        // Nobody will wait for this promise: take its failure so it does not
        // surface as an unhandled rejection.
        promise.catch(() => {});
        reject(abortError());
        return;
      }
      const onAbort = () => reject(abortError());
      inner.signal.addEventListener('abort', onAbort, { once: true });
      promise.then(
        (value) => {
          inner.signal.removeEventListener('abort', onAbort);
          resolve(value);
        },
        (error: unknown) => {
          inner.signal.removeEventListener('abort', onAbort);
          reject(error);
        }
      );
    });

  let done = 0;
  const load = async (index: number) => {
    // A cancelled load starts no further request.
    if (inner.signal.aborted) throw abortError();
    const frame = await cancellable(
      fetchFrame(simId, plan.hours[index] * 60, inner.signal)
    );
    // Cancelled while the answer was being delivered: record nothing.
    if (inner.signal.aborted) throw abortError();
    frames[index] = frame;
    done += 1;
    onProgress?.(done, total);
  };

  try {
    // The last frame first: if the run cannot be shown at all (a home-only
    // frame, a wrong place count), that is found out with one request.
    const last = total - 1;
    await load(last);
    // Cancelled while the first answer was reported: none of the early answers
    // below may be given to a caller that has gone.
    if (inner.signal.aborted) throw abortError();
    const lastFrame = frames[last];
    if (!lastFrame || !hasValidCounts(lastFrame, placeIds.length)) {
      return { ok: false, reason: 'bad-frames' };
    }
    // The last frame already says whether the days can add up to the whole-run
    // numbers (when the run starts from zero), so a run that cannot is refused
    // after one request, not after all of them.
    if (!finalFrameMatches(plan, lastFrame, placeIds, wholeRun)) {
      return { ok: false, reason: 'mismatch' };
    }

    let next = 0;
    let failed = false;
    let firstError: unknown;
    const worker = async () => {
      while (!failed) {
        const index = next;
        next += 1;
        if (index >= last) return;
        try {
          await load(index);
        } catch (error) {
          if (!failed) {
            failed = true;
            firstError = error;
            inner.abort();
          }
          return;
        }
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(Math.max(1, concurrency), last) }, worker)
    );
    if (failed) throw firstError;
  } catch (error) {
    if (timedOut && !signal?.aborted) {
      throw new Error('Loading the days took too long.');
    }
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', forwardAbort);
  }
  if (signal?.aborted) throw abortError();

  return buildDaily(plan, frames, placeIds, wholeRun);
}
