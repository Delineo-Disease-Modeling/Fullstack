// Client-side loading for the windowed hotspot ranking. A window needs the
// cumulative incidence of two map frames; this fetches them from the existing
// /api/simdata/[id]/map?time= endpoint and combines them with
// hotspot-window.ts. It keeps its own small cache and never writes to the
// shared map store, because that store evicts frames the playing map needs.
// No React here, so it can be tested with a fake fetch.

import {
  type CumulativeFrame,
  computeWindowIncidence,
  hasValidCounts,
  pickWindowKeys,
  type WindowFrameKeys,
  type WindowIncidence
} from './hotspot-window.ts';

export type WindowIncidenceResult = {
  keys: WindowFrameKeys;
  incidence: WindowIncidence;
};

export type FrameFetcher = (
  simId: number,
  minutes: number,
  signal?: AbortSignal
) => Promise<CumulativeFrame>;

// Only the incidence fields are kept (a full frame also carries the large
// h and p arrays), so this stays small even for big zones.
export const FRAME_CACHE_LIMIT = 24;
const frameCache = new Map<string, CumulativeFrame>();

export function clearWindowFrameCache() {
  frameCache.clear();
}

// Drop what is remembered for one run (its frames are keyed `<simId>:<minutes>`).
export function forgetRunFrames(simId: number) {
  const prefix = `${simId}:`;
  for (const key of [...frameCache.keys()]) {
    if (key.startsWith(prefix)) frameCache.delete(key);
  }
}

function frameKey(simId: number, minutes: number) {
  return `${simId}:${minutes}`;
}

function readCache(key: string): CumulativeFrame | undefined {
  const frame = frameCache.get(key);
  if (frame) {
    // Re-insert so the Map's order is least-recently-used first.
    frameCache.delete(key);
    frameCache.set(key, frame);
  }
  return frame;
}

function writeCache(key: string, frame: CumulativeFrame) {
  frameCache.delete(key);
  frameCache.set(key, frame);
  while (frameCache.size > FRAME_CACHE_LIMIT) {
    const oldest = frameCache.keys().next();
    if (oldest.done) break;
    frameCache.delete(oldest.value);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Fetch one map frame and return only its cumulative incidence fields. The
 * endpoint answers with the NEAREST frame, so the answer must be exactly the
 * requested one or the window would be computed from the wrong time. A 202
 * (processing, or an unreadable cache) is an error here, not a frame.
 */
export async function fetchIncidenceFrame(
  simId: number,
  minutes: number,
  signal?: AbortSignal,
  fetchImpl: typeof fetch = fetch,
  origin: string = window.location.origin
): Promise<CumulativeFrame> {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  const url = new URL(`/api/simdata/${simId}/map`, origin);
  url.searchParams.set('time', String(minutes));

  const response = await fetchImpl(url, { signal });
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
  return { hinc: frame.hinc, pinc: frame.pinc };
}

async function loadFrame(
  simId: number,
  minutes: number,
  placeCount: number,
  signal: AbortSignal | undefined,
  fetchFrame: FrameFetcher
): Promise<CumulativeFrame> {
  const key = frameKey(simId, minutes);
  const cached = readCache(key);
  if (cached) return cached;
  const frame = await fetchFrame(simId, minutes, signal);
  // Only remember frames that can be used for this run: one usable count per
  // place. A frame with a bad count, the wrong length or no counts must not
  // stick: the next request should ask the server again, even when this window
  // fails for another reason before the frames are combined.
  if (hasValidCounts(frame, placeCount)) writeCache(key, frame);
  return frame;
}

export type LoadWindowArgs = {
  simId: number;
  timesteps: readonly number[] | null | undefined;
  placeIds: readonly string[];
  endMinutes: number;
  windowHours: number;
  signal?: AbortSignal;
  fetchFrame?: FrameFetcher;
};

/**
 * Load the incidence of the window ending near `endMinutes`. Resolves null when
 * no window can be built for this run (no usable frames, a run without
 * incidence, or frames that do not line up with the places). Rejects on
 * network or server errors and when the signal aborts.
 */
export async function loadWindowIncidence({
  simId,
  timesteps,
  placeIds,
  endMinutes,
  windowHours,
  signal,
  fetchFrame = fetchIncidenceFrame
}: LoadWindowArgs): Promise<WindowIncidenceResult | null> {
  // A caller that has already given up gets a rejection, even when every
  // frame it asked for is in the cache.
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  if (!Number.isInteger(simId) || simId <= 0) return null;
  // Nothing to align the frames with: do not download them for nothing.
  if (!Array.isArray(placeIds) || placeIds.length === 0) return null;
  const keys = pickWindowKeys(timesteps, endMinutes, windowHours);
  if (!keys) return null;

  // When one frame fails the other request is cancelled too, instead of being
  // left to hang. Promise.all reports the first failure, which is the real one.
  const inner = new AbortController();
  const forwardAbort = () => inner.abort();
  signal?.addEventListener('abort', forwardAbort, { once: true });
  const failFast = <T>(promise: Promise<T>): Promise<T> =>
    promise.catch((error: unknown) => {
      inner.abort();
      throw error;
    });

  let end: CumulativeFrame;
  let start: CumulativeFrame | null;
  try {
    [end, start] = await Promise.all([
      failFast(
        loadFrame(simId, keys.endKey, placeIds.length, inner.signal, fetchFrame)
      ),
      keys.startKey === null
        ? Promise.resolve(null)
        : failFast(
            loadFrame(
              simId,
              keys.startKey,
              placeIds.length,
              inner.signal,
              fetchFrame
            )
          )
    ]);
  } finally {
    signal?.removeEventListener('abort', forwardAbort);
  }

  // The caller may have given up while the frames were arriving, or in the
  // same tick as cached frames resolved: aborting cannot undo a promise that
  // is already settled, so check again before returning a result.
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

  // A null start means "from the beginning of the run", which is right only
  // when no start frame was asked for. A requested start frame that came back
  // empty is unusable, not a zero baseline (that would inflate every count).
  const startMissing = keys.startKey !== null && start == null;
  const incidence = startMissing
    ? null
    : computeWindowIncidence(start, end, placeIds);
  if (!incidence) {
    // Frames that could not be used are not kept, so a retry asks the server
    // again instead of reusing data that may have been bad.
    frameCache.delete(frameKey(simId, keys.endKey));
    if (keys.startKey !== null) {
      frameCache.delete(frameKey(simId, keys.startKey));
    }
    return null;
  }
  return { keys, incidence };
}
