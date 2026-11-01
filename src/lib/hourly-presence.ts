// "Busy hours": the people present at one place, hour by hour, laid out as a
// day x hour table, with the new infections at the place next to it.
// Pure functions only, so they can be tested without a browser or a server.
//
// What goes in is what the place chart already receives for one place from
// /api/simdata/[id]/chartdata?loc_type=places&loc_id=...: the people present
// per hour (only the hours when somebody was there; every other hour is 0) and
// the new infections per hour (every hour of the run, or none for runs that do
// not record them). Hour n of the series is the hour that ENDS at n hours after
// the start of the run: the engine writes the pattern of the first hour under
// the key 60 minutes (Algorithms patterns.py: (hour_idx + 1) * 60), so frame n
// is the hour 0-based index n - 1. A "day" is 24 such hours from the start of
// the run, not a calendar date.

import { HEAT_PALETTE, heatLevel, MAX_DAY_COLUMNS } from './daily-incidence.ts';
import type { DataPoint } from './simulation-data.ts';

export const HOURS_PER_DAY = 24;
export const PRESENCE_KEY = 'All People';
export const INCIDENCE_KEY = 'New infections';

// Counts are added up; keeping every total below 2^46 keeps them exact.
const MAX_EXACT_TOTAL = 2 ** 46;

export type HourCell = {
  people: number;
  // null when the run does not record new infections per place.
  newInfections: number | null;
};

export type HourlyPresence = {
  // Number of days shown; the last one may be shorter than 24 hours.
  days: number;
  // Hours of the run.
  hours: number;
  // cells[day][hour]; null after the end of the run (last day only).
  cells: ReadonlyArray<ReadonlyArray<HourCell | null>>;
  maxPeople: number;
  // The first cell with the most people, null when nobody was ever there.
  peak: { people: number; day: number; hour: number } | null;
  // Mean people present at each hour of the day over the days that have it.
  meanByHour: ReadonlyArray<number>;
  perDay: ReadonlyArray<{ peakPeople: number; newInfections: number | null }>;
  hasIncidence: boolean;
  // Sum of the new infections of the whole run, null without incidence.
  totalNewInfections: number | null;
  // Hours with at least one person present.
  occupiedHours: number;
};

export type HourlyFailure =
  | 'not-hourly'
  | 'too-long'
  | 'bad-data'
  | 'misaligned'
  | 'mismatch'
  | 'inexact';

export type HourlyResult =
  | { ok: true; value: HourlyPresence }
  | { ok: false; reason: HourlyFailure };

function isCount(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value < MAX_EXACT_TOTAL
  );
}

// Frame n must sit at n * 60 minutes: the table puts the hour at position
// n - 1, which is only right for a complete hourly grid starting at hour 1.
function isHourlyGrid(timesteps: readonly number[] | null | undefined) {
  if (!timesteps || timesteps.length === 0) return false;
  for (let index = 0; index < timesteps.length; index += 1) {
    if (timesteps[index] !== (index + 1) * 60) return false;
  }
  return true;
}

// Reads one series into an array indexed by hour - 1. Returns a failure when a
// point is not on the grid, repeats an hour or does not carry a count.
function readSeries(
  points: readonly DataPoint[],
  key: string,
  hours: number
): { ok: true; values: Array<number | undefined> } | { ok: false } {
  const values = new Array<number | undefined>(hours).fill(undefined);
  for (const point of points) {
    if (typeof point !== 'object' || point === null) return { ok: false };
    const time = point.time;
    if (!Number.isInteger(time) || time < 1 || time > hours) {
      return { ok: false };
    }
    const count = point[key];
    if (!isCount(count)) return { ok: false };
    if (values[time - 1] !== undefined) return { ok: false };
    values[time - 1] = count;
  }
  return { ok: true, values };
}

/**
 * Builds the day x hour table of one place.
 *
 * `timesteps` are the frame times of the run in minutes; they must be the
 * complete hourly grid 60, 120, ... `presence` is the `iot` series of the
 * place chart, `incidence` its `incidence` series. `expectedNewInfections` is
 * what the page already shows for this place over the whole run; when given and
 * the run has incidence, the hours must add up to it.
 *
 * Fails (with a reason) instead of showing a table that might be wrong.
 */
export function buildHourlyPresence({
  timesteps,
  presence,
  incidence,
  expectedNewInfections
}: {
  timesteps: readonly number[] | null | undefined;
  presence: readonly DataPoint[] | null | undefined;
  incidence: readonly DataPoint[] | null | undefined;
  expectedNewInfections?: number | null;
}): HourlyResult {
  if (!isHourlyGrid(timesteps) || !timesteps) {
    return { ok: false, reason: 'not-hourly' };
  }
  const hours = timesteps.length;
  const days = Math.ceil(hours / HOURS_PER_DAY);
  if (days > MAX_DAY_COLUMNS) return { ok: false, reason: 'too-long' };

  if (presence != null && !Array.isArray(presence)) {
    return { ok: false, reason: 'bad-data' };
  }
  const present = readSeries(presence ?? [], PRESENCE_KEY, hours);
  if (!present.ok) return { ok: false, reason: 'misaligned' };

  const hasIncidence = Array.isArray(incidence) && incidence.length > 0;
  let newInfections: Array<number | undefined> | null = null;
  if (hasIncidence && incidence) {
    const series = readSeries(incidence, INCIDENCE_KEY, hours);
    if (!series.ok) return { ok: false, reason: 'misaligned' };
    // The server writes one point per frame or none; a gap means the series
    // does not describe this run's grid.
    if (series.values.some((value) => value === undefined)) {
      return { ok: false, reason: 'misaligned' };
    }
    newInfections = series.values;
  }

  let total: number | null = null;
  if (newInfections) {
    total = 0;
    for (const value of newInfections) total += value ?? 0;
    if (total >= MAX_EXACT_TOTAL) return { ok: false, reason: 'inexact' };
    if (
      expectedNewInfections != null &&
      Number.isFinite(expectedNewInfections) &&
      total !== expectedNewInfections
    ) {
      return { ok: false, reason: 'mismatch' };
    }
  }

  const cells: Array<Array<HourCell | null>> = [];
  const perDay: Array<{ peakPeople: number; newInfections: number | null }> =
    [];
  const sums = new Array<number>(HOURS_PER_DAY).fill(0);
  const counts = new Array<number>(HOURS_PER_DAY).fill(0);
  let maxPeople = 0;
  let peak: HourlyPresence['peak'] = null;
  let occupiedHours = 0;

  for (let day = 0; day < days; day += 1) {
    const row: Array<HourCell | null> = [];
    let peakPeople = 0;
    let dayInfections: number | null = newInfections ? 0 : null;
    for (let hour = 0; hour < HOURS_PER_DAY; hour += 1) {
      const index = day * HOURS_PER_DAY + hour;
      if (index >= hours) {
        row.push(null);
        continue;
      }
      const people = present.values[index] ?? 0;
      const infections = newInfections ? (newInfections[index] ?? 0) : null;
      row.push({ people, newInfections: infections });
      sums[hour] += people;
      counts[hour] += 1;
      if (people > 0) occupiedHours += 1;
      if (people > peakPeople) peakPeople = people;
      if (people > maxPeople) {
        maxPeople = people;
        peak = { people, day, hour };
      }
      if (dayInfections !== null && infections !== null) {
        dayInfections += infections;
      }
    }
    cells.push(row);
    perDay.push({ peakPeople, newInfections: dayInfections });
  }

  const meanByHour = sums.map((sum, hour) =>
    counts[hour] > 0 ? sum / counts[hour] : 0
  );

  return {
    ok: true,
    value: {
      days,
      hours,
      cells,
      maxPeople,
      peak,
      meanByHour,
      perDay,
      hasIncidence: newInfections !== null,
      totalNewInfections: total,
      occupiedHours
    }
  };
}

/**
 * The table of one place for the screen. The people present are what matters;
 * if only the infections fail to line up (they do not add up to the page, or
 * they are incomplete), the table is built without them and `infectionsLeftOut`
 * says so, instead of hiding hours that are fine. Failures of the people or of
 * the grid still fail the whole table.
 */
export function buildPlaceTable(args: {
  timesteps: readonly number[] | null | undefined;
  presence: readonly DataPoint[] | null | undefined;
  incidence: readonly DataPoint[] | null | undefined;
  expectedNewInfections?: number | null;
}): { result: HourlyResult; infectionsLeftOut: boolean } {
  const full = buildHourlyPresence(args);
  const hadIncidence = Array.isArray(args.incidence) && args.incidence.length > 0;
  if (full.ok) {
    // The page knows this place had new infections but the answer carried no
    // series (or an empty one): the column is missing, and that is said too.
    const expected = args.expectedNewInfections;
    const missing =
      !hadIncidence &&
      typeof expected === 'number' &&
      Number.isFinite(expected) &&
      expected > 0;
    return { result: full, infectionsLeftOut: missing };
  }
  if (!hadIncidence) {
    return { result: full, infectionsLeftOut: false };
  }
  const peopleOnly = buildHourlyPresence({
    ...args,
    incidence: null,
    expectedNewInfections: null
  });
  return { result: peopleOnly, infectionsLeftOut: peopleOnly.ok };
}

/** The hour of the day with the highest mean number of people, first on a tie. */
export function busiestHourOfDay(
  meanByHour: readonly number[]
): { hour: number; mean: number } | null {
  let best: { hour: number; mean: number } | null = null;
  for (let hour = 0; hour < meanByHour.length; hour += 1) {
    const mean = meanByHour[hour];
    if (mean > 0 && (best === null || mean > best.mean)) best = { hour, mean };
  }
  return best;
}

/** Colour of a cell: the same blue scale as the by-day heat map. */
export function presenceColor(people: number, max: number) {
  return HEAT_PALETTE[heatLevel(people, max)];
}

function plural(count: number, one: string, many: string) {
  return `${count.toLocaleString('en-US')} ${count === 1 ? one : many}`;
}

/**
 * The hour as people read it: 1 to 24 within a day, like the hours on the
 * chart's time axis (hour n of the run is the n-th hour since the start). The
 * table itself is indexed from 0.
 */
export function hourNumber(hour: number) {
  return hour + 1;
}

/** What a screen reader (and the tooltip) says for one cell. */
export function describeHour(day: number, hour: number, cell: HourCell) {
  const people = plural(cell.people, 'person', 'people');
  const infections =
    cell.newInfections === null
      ? ''
      : `, ${plural(cell.newInfections, 'new infection', 'new infections')}`;
  return `Day ${day + 1}, hour ${hourNumber(hour)}: ${people}${infections}`;
}
