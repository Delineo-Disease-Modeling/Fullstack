// Loads the frames behind the "Neighborhoods over time" table and turns them
// into per-neighborhood counts. No React here, so it can be tested with a fake
// frame fetcher.
//
// The frames come straight from the server (`cache: 'no-store'`), the same way
// the by-day heat map reads them: the server lets browsers keep a frame for
// 30 s, and a frame cached for an older version of the run must not be mixed
// with the description of the run the page holds. Only the sums per
// neighborhood are kept from a frame (its `h` array is large), and nothing is
// remembered between calls. The load is all-or-nothing, so a partly filled
// table never reaches the screen.

import {
  type BuildFailure,
  buildLayout,
  buildNeighborhoodTable,
  type FrameSummary,
  type NeighborhoodTable,
  type PlanFailure,
  planNeighborhoodDays,
  summarizeFrame
} from './neighborhood-rates.ts';

// A few at a time: every frame is a request the server answers by reading the
// run's cache file, and a cold cache is rebuilt once per request in flight.
export const NEIGHBORHOOD_CONCURRENCY = 4;
export const NEIGHBORHOOD_DEADLINE_MS = 90_000;

export type NeighborhoodFailure = PlanFailure | BuildFailure | 'bad-homes';

export type NeighborhoodResult =
  | { ok: true; table: NeighborhoodTable }
  | { ok: false; reason: NeighborhoodFailure };

// What a fetcher gives back: the `h` array of the frame, not yet checked.
export type HomeFrameFetcher = (
  simId: number,
  minutes: number,
  signal?: AbortSignal
) => Promise<unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * The `h` array of one map frame, straight from the server. The endpoint
 * answers with the NEAREST frame, so the answer must be exactly the requested
 * one; a 202 (processing, or an unreadable cache) and a malformed body are
 * errors, not frames. The array itself is checked by summarizeFrame.
 */
export async function fetchHomeFrame(
  simId: number,
  minutes: number,
  signal?: AbortSignal,
  fetchImpl: typeof fetch = fetch,
  origin: string = window.location.origin
): Promise<unknown> {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  const url = new URL(`/api/simdata/${simId}/map`, origin);
  url.searchParams.set('time', String(minutes));

  const response = await fetchImpl(url, { signal, cache: 'no-store' });
  if (response.status === 202) {
    throw new Error('This run is still being processed.');
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      isRecord(body) && typeof body.message === 'string'
        ? body.message
        : `Failed to load map frame (${response.status}).`;
    throw new Error(message);
  }

  const data = isRecord(body) ? body.data : null;
  const time = isRecord(data) ? Number(data.time) : Number.NaN;
  const frames = isRecord(data) ? data.simdata : null;
  const frame = isRecord(frames) ? frames[String(time)] : undefined;
  if (time !== minutes || !isRecord(frame)) {
    throw new Error('The server returned an unexpected map frame.');
  }
  return frame.h;
}

export type LoadNeighborhoodArgs = {
  simId: number;
  timesteps: readonly number[] | null | undefined;
  // papdata.homes: every home with its neighborhood (`cbg`) and `members`.
  homes: unknown;
  signal?: AbortSignal;
  fetchFrame?: HomeFrameFetcher;
  concurrency?: number;
  deadlineMs?: number;
  onProgress?: (done: number, total: number) => void;
};

function abortError() {
  return new DOMException('Aborted', 'AbortError');
}

// A frame that arrived but cannot be used for this run.
class UnusableFrame extends Error {}

/**
 * The table of a run. Resolves with a reason (and downloads nothing, or only
 * one frame) when the view is not possible for the run: not a complete hourly
 * grid, too long, homes without a neighborhood, frames that do not line up.
 * Rejects on network or server errors (the first real error is the one
 * reported), when the deadline passes, and when the signal aborts, even if every
 * answer had already arrived.
 */
export async function loadNeighborhoodRates({
  simId,
  timesteps,
  homes,
  signal,
  fetchFrame = fetchHomeFrame,
  concurrency = NEIGHBORHOOD_CONCURRENCY,
  deadlineMs = NEIGHBORHOOD_DEADLINE_MS,
  onProgress
}: LoadNeighborhoodArgs): Promise<NeighborhoodResult> {
  if (signal?.aborted) throw abortError();

  const planned = planNeighborhoodDays(timesteps);
  if (!planned.ok) return planned;
  const { plan } = planned;
  const laid = buildLayout(homes);
  if (!laid.ok) return laid;
  const { layout } = laid;

  const total = plan.hours.length;
  // One slot per frame, filled by position, never by completion order.
  const summaries: Array<FrameSummary | undefined> = new Array(total).fill(
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
    const h = await cancellable(
      fetchFrame(simId, plan.hours[index] * 60, inner.signal)
    );
    // Cancelled while the answer was being delivered: record nothing.
    if (inner.signal.aborted) throw abortError();
    const summary = summarizeFrame(h, layout);
    if (summary === null) throw new UnusableFrame();
    summaries[index] = summary;
    done += 1;
    onProgress?.(done, total);
  };

  try {
    // The last frame first: if the run cannot be shown at all (a wrong number
    // of homes, counts that are not counts), that is found out with one
    // request.
    const last = total - 1;
    await load(last);
    // Cancelled while the first answer was reported: none of the early answers
    // below may be given to a caller that has gone.
    if (inner.signal.aborted) throw abortError();

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
    if (error instanceof UnusableFrame && !signal?.aborted) {
      return { ok: false, reason: 'bad-frames' };
    }
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', forwardAbort);
  }
  if (signal?.aborted) throw abortError();

  return buildNeighborhoodTable(plan, summaries, layout);
}
