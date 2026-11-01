// Pure helpers for the by-day heatmap: "how many new infections happened at
// each place on each day of the run". The engine emits CUMULATIVE per-place
// counts (`pinc`) and a cumulative home total (`hinc`) on every map frame, so a
// day is the difference of the frames at its two ends. Nothing here touches
// React, the network or the store, so it can be unit-tested.
//
// A "day" is 24 hours of simulation time from the start of the run, not a
// calendar date. When the run does not end on a multiple of 24 hours the last
// column is shorter, and says so.

import {
  type CumulativeFrame,
  computeWindowIncidence,
  hasValidCounts,
  hourlyGridRange,
  incidenceFor
} from './hotspot-window.ts';

const HOURS_PER_DAY = 24;
const LEVELS = 8;

// The most day columns shown. A support limit of the view, not a claim about
// how long a run may be; longer runs get a message and no download.
export const MAX_DAY_COLUMNS = 100;

// Counts are added up, and the colour level multiplies a count by 64; keeping
// every total below 2^46 keeps both exact. Real counts are nowhere near it.
export const MAX_EXACT_TOTAL = 2 ** 46;

export const ROW_LIMITS = [10, 20, 50] as const;

export type DayColumn = {
  // Position among the columns, from 0.
  index: number;
  // Elapsed simulation hours this column covers: after fromHour, up to toHour.
  fromHour: number;
  toHour: number;
  hours: number;
  // Shorter than a day (only the last column can be).
  partial: boolean;
};

export type DayPlan = {
  // Frame hours to download, ascending: an hour-0 start frame when the run has
  // one, then the end of every day.
  hours: number[];
  // 0 when the run has a frame at hour 0, which is then the start of day 1.
  // null otherwise: day 1 starts from zero, the same convention as the time
  // windows (the run starts with no recorded transmission).
  startHour: number | null;
  columns: DayColumn[];
};

export type PlanFailure = 'no-grid' | 'no-days' | 'starts-late' | 'too-long';

export type PlanResult =
  | { ok: true; plan: DayPlan }
  | { ok: false; reason: PlanFailure };

/**
 * Which frames a by-day view needs. Only a complete hourly grid qualifies (the
 * same test as the window controls), and its first frame must be at or before
 * hour 24 so that day 1 really is the first day.
 */
export function planDays(
  timesteps: readonly number[] | null | undefined
): PlanResult {
  const range = hourlyGridRange(timesteps);
  if (range === null) return { ok: false, reason: 'no-grid' };
  const { minHour, maxHour } = range;
  // A grid that only holds the frame at hour 0 has no day in it.
  if (maxHour <= 0) return { ok: false, reason: 'no-days' };
  if (minHour > HOURS_PER_DAY) return { ok: false, reason: 'starts-late' };
  if (Math.ceil(maxHour / HOURS_PER_DAY) > MAX_DAY_COLUMNS) {
    return { ok: false, reason: 'too-long' };
  }

  const ends: number[] = [];
  for (let hour = HOURS_PER_DAY; hour <= maxHour; hour += HOURS_PER_DAY) {
    ends.push(hour);
  }
  if (ends.length === 0 || ends[ends.length - 1] !== maxHour) {
    ends.push(maxHour);
  }

  const startHour = minHour === 0 ? 0 : null;
  const columns = ends.map((toHour, index) => {
    const fromHour = index === 0 ? 0 : ends[index - 1];
    const hours = toHour - fromHour;
    return {
      index,
      fromHour,
      toHour,
      hours,
      partial: hours < HOURS_PER_DAY
    };
  });
  return {
    ok: true,
    plan: {
      hours: startHour === 0 ? [0, ...ends] : ends,
      startHour,
      columns
    }
  };
}

export type DailyDay = {
  // null when the frames carry no home counter (not the same as zero).
  home: number | null;
  // Only places with infections; read with incidenceFor.
  places: Record<string, number>;
};

export type DailyIncidence = {
  columns: DayColumn[];
  days: DailyDay[];
  hasHome: boolean;
};

export type BuildFailure = 'bad-frames' | 'decreasing' | 'mismatch' | 'inexact';

export type BuildResult =
  | { ok: true; daily: DailyIncidence }
  | { ok: false; reason: BuildFailure };

export type WholeRun = {
  home: number;
  places: Readonly<Record<string, number>>;
};

function counts(frame: CumulativeFrame): number[] {
  // Valid frames only (hasValidCounts): non-negative numbers, truncated the
  // same way computeWindowIncidence truncates them.
  return (frame.pinc as number[]).map((value) => Math.trunc(value));
}

/**
 * Whether the LAST frame is consistent with the whole-run numbers the page
 * already shows. When the run starts from zero the days add up to exactly this
 * frame's counts, so a difference is known before the other frames are
 * downloaded. With a start frame at hour 0 the days add up to a difference of
 * two frames, which one frame cannot tell, so this says yes and buildDaily
 * decides. `frame` must already have passed hasValidCounts.
 */
export function finalFrameMatches(
  plan: DayPlan,
  frame: CumulativeFrame,
  placeIds: readonly string[],
  wholeRun: WholeRun
): boolean {
  if (plan.startHour !== null) return true;
  const last = counts(frame);
  return placeIds.every(
    (id, index) => last[index] === incidenceFor(wholeRun.places, id)
  );
}

/**
 * The per-day counts from the downloaded frames, in the order of `plan.hours`.
 *
 * Refuses (instead of showing something made up) when the frames do not add up:
 * a frame that is missing or invalid, a cumulative count that goes DOWN between
 * two frames (the time windows would clamp it to zero and invent a history),
 * days that do not add up to the whole-run numbers the page already shows, or
 * totals too large to add exactly.
 */
export function buildDaily(
  plan: DayPlan,
  frames: ReadonlyArray<CumulativeFrame | null | undefined>,
  placeIds: readonly string[],
  wholeRun: WholeRun
): BuildResult {
  const bad = (reason: BuildFailure): BuildResult => ({ ok: false, reason });
  if (frames.length !== plan.hours.length) return bad('bad-frames');
  const complete: CumulativeFrame[] = [];
  for (const frame of frames) {
    if (!frame || !hasValidCounts(frame, placeIds.length)) {
      return bad('bad-frames');
    }
    complete.push(frame);
  }
  const hasHome = complete.every((frame) => frame.hinc !== undefined);

  // Counts never go down in a cumulative series. A frame whose count is lower
  // than the one before it means the cache was rebuilt or mixed.
  for (let index = 1; index < complete.length; index += 1) {
    const before = counts(complete[index - 1]);
    const after = counts(complete[index]);
    for (let place = 0; place < after.length; place += 1) {
      if (after[place] < before[place]) return bad('decreasing');
    }
    if (hasHome) {
      const homeBefore = Math.trunc(complete[index - 1].hinc as number);
      const homeAfter = Math.trunc(complete[index].hinc as number);
      if (homeAfter < homeBefore) return bad('decreasing');
    }
  }

  const offset = plan.startHour === 0 ? 1 : 0;
  const days: DailyDay[] = [];
  const sums = new Map<string, number>();
  let homeSum = 0;
  let grand = 0;
  for (let index = 0; index < plan.columns.length; index += 1) {
    const end = complete[offset + index];
    const start =
      index === 0
        ? offset === 1
          ? complete[0]
          : null
        : complete[offset + index - 1];
    const window = computeWindowIncidence(start, end, placeIds);
    if (window === null) return bad('bad-frames');
    const home = hasHome ? window.home : null;
    days.push({ home, places: window.places });
    for (const id of placeIds) {
      const value = incidenceFor(window.places, id);
      if (value > 0) {
        sums.set(id, (sums.get(id) ?? 0) + value);
        grand += value;
      }
    }
    if (home !== null) {
      homeSum += home;
      grand += home;
    }
  }
  if (grand > MAX_EXACT_TOTAL) return bad('inexact');

  // The days must add up to what the page already shows for the whole run
  // (taken from the run's description, a separate request).
  for (const id of placeIds) {
    if ((sums.get(id) ?? 0) !== incidenceFor(wholeRun.places, id)) {
      return bad('mismatch');
    }
  }
  if (hasHome && homeSum !== wholeRun.home) return bad('mismatch');

  return { ok: true, daily: { columns: plan.columns, days, hasHome } };
}

export type HeatPlace = {
  id: string;
  label: string;
  category: string;
};

// Same fallbacks as the ranking table.
export function toHeatPlaces(
  places: ReadonlyArray<{
    id: string | number;
    label?: string | null;
    top_category?: string | null;
  }>
): HeatPlace[] {
  return places.map((place) => ({
    id: String(place.id),
    label: place.label || `Place #${place.id}`,
    category: place.top_category || 'Uncategorized'
  }));
}

export type HeatView = 'pois' | 'types';

export type HeatRow = {
  id: string;
  label: string;
  // One count per day column.
  counts: number[];
  total: number;
};

export type Heatmap = {
  rows: HeatRow[];
  // Rows with infections that did not fit under the row limit.
  hiddenRows: number;
  hiddenTotal: number;
  // The largest count among the DISPLAYED rows; the colours are relative to it.
  maxCell: number;
  footer: {
    // Over ALL places, not only the displayed rows.
    places: number[];
    // null when the run records no home counts.
    home: number[] | null;
  };
};

type Candidate = {
  id: string;
  label: string;
  counts: number[];
  total: number;
  order: number;
};

function rankCandidates(candidates: Candidate[]): Candidate[] {
  return candidates
    .filter((candidate) => candidate.total > 0)
    .sort(
      (left, right) => right.total - left.total || left.order - right.order
    );
}

/**
 * The rows of the heatmap. The catalogue order is the order of `catalog` (the
 * order the counts arrive in); ties go to the earlier place, or to the category
 * the whole catalogue mentions first. Types first add the counts up per category
 * over every place, then rank. The footer always covers every place.
 */
export function buildHeatmap(
  daily: DailyIncidence,
  catalog: readonly HeatPlace[],
  view: HeatView,
  rowLimit: number
): Heatmap {
  const dayCount = daily.days.length;
  const footerPlaces = new Array<number>(dayCount).fill(0);

  const perPlace: Candidate[] = catalog.map((place, order) => {
    const placeCounts = daily.days.map((day, dayIndex) => {
      const value = incidenceFor(day.places, place.id);
      footerPlaces[dayIndex] += value;
      return value;
    });
    return {
      id: place.id,
      label: place.label,
      counts: placeCounts,
      total: placeCounts.reduce((sum, value) => sum + value, 0),
      order
    };
  });

  let candidates: Candidate[];
  if (view === 'pois') {
    candidates = rankCandidates(perPlace);
    // Two places can share a name; tell them apart by id so a reader (and a
    // screen reader) can too. Decided over all ranked places, so the label of a
    // row does not change with the row limit.
    const seen = new Map<string, number>();
    for (const candidate of candidates) {
      seen.set(candidate.label, (seen.get(candidate.label) ?? 0) + 1);
    }
    candidates = candidates.map((candidate) =>
      (seen.get(candidate.label) ?? 0) > 1
        ? { ...candidate, label: `${candidate.label} (#${candidate.id})` }
        : candidate
    );
  } else {
    // Categories in the order the whole catalogue first mentions them.
    const byCategory = new Map<string, Candidate>();
    for (const place of catalog) {
      if (byCategory.has(place.category)) continue;
      byCategory.set(place.category, {
        id: place.category,
        label: place.category,
        counts: new Array<number>(dayCount).fill(0),
        total: 0,
        order: byCategory.size
      });
    }
    perPlace.forEach((entry, index) => {
      const category = byCategory.get(catalog[index].category);
      if (!category) return;
      entry.counts.forEach((value, dayIndex) => {
        category.counts[dayIndex] += value;
      });
      category.total += entry.total;
    });
    candidates = rankCandidates([...byCategory.values()]);
  }

  const limit = Math.max(0, rowLimit);
  const shown = candidates.slice(0, limit);
  const hidden = candidates.slice(limit);
  let maxCell = 0;
  for (const row of shown) {
    for (const value of row.counts) if (value > maxCell) maxCell = value;
  }

  return {
    rows: shown.map(({ id, label, counts: rowCounts, total }) => ({
      id,
      label,
      counts: rowCounts,
      total
    })),
    hiddenRows: hidden.length,
    hiddenTotal: hidden.reduce((sum, row) => sum + row.total, 0),
    maxCell,
    footer: {
      places: footerPlaces,
      home: daily.hasHome ? daily.days.map((day) => day.home ?? 0) : null
    }
  };
}

/**
 * The colour level of a cell, 0 for none and 1 to 8 otherwise, on a square-root
 * scale relative to `max`: level L is the smallest with count <= max * (L / 8)^2.
 * Integer arithmetic, so a count exactly on a boundary does not tip over.
 */
export function heatLevel(count: number, max: number): number {
  if (!(count > 0) || !(max > 0)) return 0;
  for (let level = 1; level < LEVELS; level += 1) {
    if (64 * count <= level * level * max) return level;
  }
  return LEVELS;
}

export type HeatColor = { background: string; color: string };

// Index = heatLevel. Level 0 is "no infections"; 1 to 8 run from light to dark
// blue. Light levels take dark text and dark levels take white text, and every
// pair keeps a contrast ratio of at least 4.5 (checked in the tests).
export const HEAT_PALETTE: readonly HeatColor[] = [
  { background: '#f4f6f7', color: '#5b6470' },
  { background: '#d8eaf4', color: '#1f2937' },
  { background: '#a9d1e6', color: '#1f2937' },
  { background: '#7bb9d9', color: '#1f2937' },
  { background: '#4fa3cc', color: '#1f2937' },
  { background: '#297aa3', color: '#ffffff' },
  { background: '#206282', color: '#ffffff' },
  { background: '#194a63', color: '#ffffff' },
  { background: '#113243', color: '#ffffff' }
];

/** Short and long names of a column, for the header and for screen readers. */
export function describeColumn(column: DayColumn): {
  label: string;
  note: string | null;
  full: string;
} {
  const day = column.index + 1;
  const span = `hours ${column.fromHour} to ${column.toHour}`;
  return column.partial
    ? {
        label: String(day),
        note: `${column.hours} h`,
        full: `Day ${day}, only the first ${column.hours} hours of it (${span}); not a full day`
      }
    : { label: String(day), note: null, full: `Day ${day}, ${span}` };
}
