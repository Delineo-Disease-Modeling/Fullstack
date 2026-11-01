// Pure helpers for the time-windowed hotspot ranking: "where did transmission
// happen in the last W hours before time t". The engine emits CUMULATIVE
// per-place incidence (`pinc`, same order as the sorted papdata places) and a
// cumulative home total (`hinc`) on every map frame, so a window is just the
// difference of two frames. Nothing here touches React, the network or the
// store, so it is unit-testable.

import { findNearestTime } from './dots-synth.ts';

export type CumulativeFrame = {
  hinc?: unknown;
  pinc?: unknown;
};

export type WindowIncidence = {
  home: number;
  places: Record<string, number>;
};

export type WindowFrameKeys = {
  // Timestep (minutes) whose cumulative counts end the window.
  endKey: number;
  // Timestep (minutes) whose cumulative counts start it, always earlier than
  // endKey. null means the window reaches back before the first frame, so the
  // start counts are zero (the run begins with no recorded transmission; the
  // same convention as loadPlaceIncidenceSeries in map-cache.ts).
  startKey: number | null;
  // Minutes actually covered. See pickWindowKeys for how it relates to the
  // requested length.
  coveredMinutes: number;
};

// A cumulative count is a finite, non-negative number. Anything else (a
// string, null from a serialized NaN, a negative) means the cache is corrupt;
// treating it as zero would show "no infections" for bad data, so the caller
// gets null and reports the window as unavailable instead. Fractions are
// truncated like map-cache.ts toNonNegativeCount.
function readCount(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return null;
  }
  const count = Math.trunc(value);
  // Past 2^53 neighbouring integers are the same number, so a difference of
  // two such counts would silently be 0.
  return Number.isSafeInteger(count) ? count : null;
}

// `hinc` may be absent on a frame (no home counter), which is zero; present
// but invalid is corrupt.
function readOptionalCount(value: unknown): number | null {
  return value === undefined ? 0 : readCount(value);
}

function cleanTimesteps(timesteps: readonly number[]): number[] {
  const unique = new Set<number>();
  for (const timestep of timesteps) {
    if (
      typeof timestep === 'number' &&
      Number.isFinite(timestep) &&
      timestep >= 0
    ) {
      unique.add(timestep);
    }
  }
  // The manifest keeps cache-file order and never sorts, so do not trust it.
  return [...unique].sort((left, right) => left - right);
}

/**
 * Pick the two frames that bound a window of `windowHours` ending at the frame
 * nearest `endMinutes`. Returns null when the inputs cannot describe a window.
 *
 * The window snaps to the frames that exist: the start is the latest frame at
 * or before `endKey - windowHours`, so it covers at least the requested length
 * (a 1.5 h window over hourly frames covers 2 h) and always at least one frame
 * step. The exception is a window reaching before the first frame, which
 * covers the whole run so far and is therefore shorter than requested.
 * `coveredMinutes` always reports the real span.
 */
export function pickWindowKeys(
  timesteps: readonly number[] | null | undefined,
  endMinutes: number,
  windowHours: number
): WindowFrameKeys | null {
  if (!Array.isArray(timesteps)) return null;
  if (!Number.isFinite(endMinutes)) return null;
  if (!Number.isFinite(windowHours) || windowHours <= 0) return null;

  const sorted = cleanTimesteps(timesteps);
  const endKey = findNearestTime(sorted, endMinutes);
  if (endKey === null) return null;

  const target = endKey - windowHours * 60;
  let startKey: number | null = null;
  for (const timestep of sorted) {
    // `>= endKey` matters for windows so small that endKey - W rounds back to
    // endKey in floating point: without it the window would be empty.
    if (timestep > target || timestep >= endKey) break;
    startKey = timestep;
  }

  return {
    endKey,
    startKey,
    coveredMinutes: endKey - (startKey ?? 0)
  };
}

function incidenceArray(
  frame: CumulativeFrame | null,
  placeCount: number
): unknown[] | null {
  if (frame === null || typeof frame !== 'object') return null;
  const pinc = frame.pinc;
  // A frame whose array length does not match the places cannot be aligned by
  // index, and guessing would attribute infections to the wrong place.
  if (!Array.isArray(pinc) || pinc.length !== placeCount) return null;
  return pinc;
}

function setCount(target: Record<string, number>, key: string, value: number) {
  if (key === '__proto__') {
    // Plain assignment would set the prototype instead of adding a key.
    Object.defineProperty(target, key, {
      value,
      enumerable: true,
      writable: true,
      configurable: true
    });
  } else {
    target[key] = value;
  }
}

/**
 * New transmission events per place (and at home) between two cumulative
 * frames. `start` null (or undefined) means "from the beginning of the run".
 * `start` must be the EARLIER frame; use the keys from pickWindowKeys. Returns
 * null when the frames cannot be aligned with `placeIds` (old runs) or hold
 * invalid counts (corrupt data). A count that goes down between the frames (a
 * restarted cache) clamps to zero for that place.
 */
export function computeWindowIncidence(
  start: CumulativeFrame | null | undefined,
  end: CumulativeFrame,
  placeIds: readonly string[]
): WindowIncidence | null {
  if (!Array.isArray(placeIds) || placeIds.length === 0) return null;
  if (new Set(placeIds).size !== placeIds.length) return null;

  const startFrame = start ?? null;
  const endPinc = incidenceArray(end, placeIds.length);
  if (endPinc === null) return null;

  let startPinc: unknown[] | null = null;
  if (startFrame !== null) {
    startPinc = incidenceArray(startFrame, placeIds.length);
    if (startPinc === null) return null;
  }

  const places: Record<string, number> = {};
  for (let index = 0; index < placeIds.length; index += 1) {
    const endCount = readCount(endPinc[index]);
    const startCount = startPinc ? readCount(startPinc[index]) : 0;
    if (endCount === null || startCount === null) return null;
    const delta = endCount - startCount;
    if (delta > 0) setCount(places, placeIds[index], delta);
  }

  const endHome = readOptionalCount(end.hinc);
  const startHome = startFrame ? readOptionalCount(startFrame.hinc) : 0;
  if (endHome === null || startHome === null) return null;

  return { home: Math.max(0, endHome - startHome), places };
}

/**
 * One place's count from a counts object, 0 when it has none. Reads only the
 * object's own keys: a place whose id is also a built-in name ("toString",
 * "constructor") and that has no infections must not read the inherited
 * function. Works for the whole-run object from the server as well.
 */
export function incidenceFor(
  places: Readonly<Record<string, number>> | null | undefined,
  id: string
): number {
  if (!places || !Object.hasOwn(places, id)) return 0;
  const value = places[id];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/**
 * Whether a frame can be used for a run with `placeCount` places: `pinc` has
 * exactly one usable count per place (see readCount) and `hinc` is usable or
 * absent. This is the test computeWindowIncidence applies to a frame, minus
 * the comparison between two frames. Used to decide whether a downloaded frame
 * is worth remembering: a frame that fails it can only ever be reported as
 * unavailable, so keeping it would make a retry reuse the same bad data.
 */
export function hasValidCounts(
  frame: CumulativeFrame | null | undefined,
  placeCount: number
): boolean {
  if (!frame) return false;
  const pinc = incidenceArray(frame, placeCount);
  if (pinc === null) return false;
  for (const value of pinc) {
    if (readCount(value) === null) return false;
  }
  return readOptionalCount(frame.hinc) !== null;
}

const MINUTES_PER_HOUR = 60;

/**
 * First and last hour of a run whose frames form a complete hourly grid: every
 * usable frame sits at a whole number of hours and no hour is missing between
 * the first and the last. Returns null for anything else (no frames, a
 * half-hour frame, a gap).
 *
 * The window ranking offers a slider over whole hours. On such a grid every
 * hour of the slider has a frame of its own, so pickWindowKeys never moves the
 * chosen end hour, and a window of whole hours starts exactly W hours earlier
 * (or before the first frame). On any other grid it would, so the caller shows
 * no window controls and keeps the whole-run ranking. Uses the same cleaning
 * as pickWindowKeys.
 */
export function hourlyGridRange(
  timesteps: readonly number[] | null | undefined
): { minHour: number; maxHour: number } | null {
  if (!Array.isArray(timesteps)) return null;
  const sorted = cleanTimesteps(timesteps);
  if (sorted.length === 0) return null;
  const minHour = sorted[0] / MINUTES_PER_HOUR;
  if (!Number.isInteger(minHour)) return null;
  for (let index = 0; index < sorted.length; index += 1) {
    if (sorted[index] !== (minHour + index) * MINUTES_PER_HOUR) return null;
  }
  return { minHour, maxHour: minHour + sorted.length - 1 };
}
