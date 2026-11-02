// Pure helpers for the "Neighborhoods over time" table: "how many of the people
// at home in each neighborhood had been infected, on each day of the run".
//
// Every map frame carries `h`, two numbers per home in papdata order: how many
// people are at home at that moment and how many of those have ever been
// infected. A frame therefore says nothing about people who are away from home.
// The table reads one frame per day, at the last hour of the simulation day
// (hour 24 of the day, counted from the start of the run, not by the clock; no
// claim is made about the time of day), and says how many people that was. On
// the public zone we checked, 70% to 81% of the residents are at home at that
// hour (58% to 77% at hour 3, and about 40% around midday), and in our
// synthetic zone about 99%. The counts are taken at one hour of the day, so a
// person who is away at that hour is not counted that day. The last reading of
// a run that ends on a whole day is the last frame of the run, the same moment
// as the whole-run numbers the page shows.
//
// The rate divides by the people at home, not by the residents: `members` is
// only roughly the number of people who live in a home (an archived zone has
// homes with more people present than members), and a person who is away says
// nothing about the infections at home. How many of the residents were at home
// is shown next to every rate, and a neighborhood where fewer than half were
// at home is marked, because there the rate describes only a few people.
//
// A "day" is 24 hours of simulation time from the start of the run, not a
// calendar date. Nothing here touches React, the network or the store, so it
// can be unit-tested.

import { MAX_DAY_COLUMNS } from './daily-incidence.ts';
import { hourlyGridRange } from './hotspot-window.ts';

const HOURS_PER_DAY = 24;

// The hour of each day the table is read at: the last one, the frame at the end
// of the day (the same frames the by-day heat map ends its days with).
export const READING_HOUR = 24;

// A neighborhood is marked when fewer than this share of its residents were at
// home at the reading, that is when most of them were away.
export const LOW_AT_HOME_PERCENT = 50;

// The most neighborhood rows shown. A support limit of the view; the rest are
// counted in a note.
export const MAX_NEIGHBORHOOD_ROWS = 50;

export type PlanFailure = 'no-grid' | 'no-days' | 'too-long';

export type NeighborhoodPlan = {
  // Elapsed simulation hour of every frame to download, ascending.
  hours: number[];
  // Day number (from 1) each of those frames belongs to.
  days: number[];
  // The last hour of the run, for the note that says what lies after the last
  // reading.
  runHours: number;
};

export type PlanResult =
  | { ok: true; plan: NeighborhoodPlan }
  | { ok: false; reason: PlanFailure };

/**
 * Which frames the table needs: the last one of every whole day of the run.
 * Only a complete hourly grid qualifies (the same test as the window controls).
 * A day whose reading frame is not in the run (a grid that starts later, a last
 * day that is cut short) has no column.
 */
export function planNeighborhoodDays(
  timesteps: readonly number[] | null | undefined
): PlanResult {
  const range = hourlyGridRange(timesteps);
  if (range === null) return { ok: false, reason: 'no-grid' };
  const { minHour, maxHour } = range;
  const dayCount = Math.ceil(maxHour / HOURS_PER_DAY);
  if (dayCount > MAX_DAY_COLUMNS) return { ok: false, reason: 'too-long' };

  const hours: number[] = [];
  const days: number[] = [];
  for (let day = 1; day <= dayCount; day += 1) {
    const hour = (day - 1) * HOURS_PER_DAY + READING_HOUR;
    if (hour >= minHour && hour <= maxHour) {
      hours.push(hour);
      days.push(day);
    }
  }
  if (hours.length === 0) return { ok: false, reason: 'no-days' };
  return { ok: true, plan: { hours, days, runHours: maxHour } };
}

export type Layout = {
  // The neighborhoods (census block groups), in order of first appearance.
  ids: string[];
  // Residents of each neighborhood, summed over its homes.
  residents: number[];
  // The neighborhood (index into ids) of every home, in papdata order.
  groupOfHome: number[];
};

export type LayoutResult =
  | { ok: true; layout: Layout }
  | { ok: false; reason: 'bad-homes' };

/**
 * Which neighborhood every home belongs to and how many people live there.
 * Refuses (instead of leaving some homes out, which would bias every rate)
 * when a home has no neighborhood or no usable count of members, or when a
 * neighborhood has nobody living in it.
 */
export function buildLayout(homes: unknown): LayoutResult {
  const bad: LayoutResult = { ok: false, reason: 'bad-homes' };
  if (!Array.isArray(homes) || homes.length === 0) return bad;
  const indexOf = new Map<string, number>();
  const ids: string[] = [];
  const residents: number[] = [];
  const groupOfHome: number[] = [];
  for (const home of homes as unknown[]) {
    if (typeof home !== 'object' || home === null) return bad;
    const { cbg, members } = home as { cbg?: unknown; members?: unknown };
    if (typeof cbg !== 'string' || cbg === '') return bad;
    if (!isCount(members)) return bad;
    let group = indexOf.get(cbg);
    if (group === undefined) {
      group = ids.length;
      indexOf.set(cbg, group);
      ids.push(cbg);
      residents.push(0);
    }
    residents[group] += members;
    groupOfHome.push(group);
  }
  if (residents.some((count) => !(count > 0) || count > MAX_COUNT)) return bad;
  return { ok: true, layout: { ids, residents, groupOfHome } };
}

export type FrameSummary = {
  // Per neighborhood: people at home, and how many of them had been infected.
  present: number[];
  infected: number[];
};

// The largest count accepted for one home or one neighborhood: 2^26, about 67
// million. No neighborhood is anywhere near it, and below it a product of two
// counts stays under 2^52, so the comparison of rates in compareCells is exact
// and a rate is never infinite.
export const MAX_COUNT = 2 ** 26;

function isCount(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= MAX_COUNT
  );
}

/**
 * The people at home and the infected among them, per neighborhood, from the
 * `h` array of one frame. Null when `h` cannot be used: not an array, not two
 * counts per home, a count that is not a whole non-negative number, or more
 * infected than present (infected people at home are a part of the people at
 * home).
 */
export function summarizeFrame(
  h: unknown,
  layout: Layout
): FrameSummary | null {
  const homes = layout.groupOfHome.length;
  if (!Array.isArray(h) || h.length !== 2 * homes) return null;
  const groups = layout.ids.length;
  const present = new Array<number>(groups).fill(0);
  const infected = new Array<number>(groups).fill(0);
  for (let home = 0; home < homes; home += 1) {
    const here: unknown = h[2 * home];
    const ill: unknown = h[2 * home + 1];
    if (!isCount(here) || !isCount(ill) || ill > here) return null;
    const group = layout.groupOfHome[home];
    present[group] += here;
    infected[group] += ill;
  }
  // A sum of many counts that are each fine can still be too large.
  if (present.some((count) => count > MAX_COUNT)) return null;
  return { present, infected };
}

export type NeighborhoodCell = { present: number; infected: number };

export type NeighborhoodRow = {
  id: string;
  residents: number;
  // One cell per column.
  cells: NeighborhoodCell[];
};

export type NeighborhoodColumn = {
  // Day number, from 1.
  day: number;
  // Elapsed simulation hour of the reading.
  hour: number;
};

export type NeighborhoodTable = {
  columns: NeighborhoodColumn[];
  // Every neighborhood, highest rate on the last day first.
  rows: NeighborhoodRow[];
  // All neighborhoods together, per column.
  totals: NeighborhoodCell[];
  residents: number;
  runHours: number;
};

export type BuildFailure = 'bad-frames';

export type BuildResult =
  | { ok: true; table: NeighborhoodTable }
  | { ok: false; reason: BuildFailure };

// Infected per 1,000 people at home, null when nobody was at home.
export function ratePer1000(infected: number, present: number): number | null {
  return present > 0 ? (1000 * infected) / present : null;
}

// Higher rate first, compared exactly (a cross product of whole numbers, far
// below 2^53 for any real population) so that equal rates are really equal.
// A neighborhood with nobody at home has no rate and goes last.
function compareCells(a: NeighborhoodCell, b: NeighborhoodCell): number {
  if (a.present === 0 || b.present === 0) {
    if (a.present === b.present) return 0;
    return a.present === 0 ? 1 : -1;
  }
  const left = a.infected * b.present;
  const right = b.infected * a.present;
  if (left === right) return 0;
  return left > right ? -1 : 1;
}

/**
 * The table from the downloaded frames, in the order of `plan.hours`.
 *
 * Refuses (instead of showing something made up) when the frames do not fit the
 * run: a frame that is missing or was not summarized for these neighborhoods.
 * The people at home are not checked against the residents: see the top of the
 * file.
 */
export function buildNeighborhoodTable(
  plan: NeighborhoodPlan,
  summaries: ReadonlyArray<FrameSummary | null | undefined>,
  layout: Layout
): BuildResult {
  const bad = (reason: BuildFailure): BuildResult => ({ ok: false, reason });
  const groups = layout.ids.length;
  if (summaries.length !== plan.hours.length) return bad('bad-frames');
  const complete: FrameSummary[] = [];
  for (const summary of summaries) {
    if (
      !summary ||
      summary.present.length !== groups ||
      summary.infected.length !== groups
    ) {
      return bad('bad-frames');
    }
    complete.push(summary);
  }
  for (const summary of complete) {
    for (let group = 0; group < groups; group += 1) {
      if (
        !isCount(summary.present[group]) ||
        !isCount(summary.infected[group]) ||
        summary.infected[group] > summary.present[group]
      ) {
        return bad('bad-frames');
      }
    }
  }

  const rows: NeighborhoodRow[] = layout.ids.map((id, group) => ({
    id,
    residents: layout.residents[group],
    cells: complete.map((summary) => ({
      present: summary.present[group],
      infected: summary.infected[group]
    }))
  }));
  const last = complete.length - 1;
  rows.sort((a, b) => {
    const byRate = compareCells(a.cells[last], b.cells[last]);
    if (byRate !== 0) return byRate;
    const byCount = b.cells[last].infected - a.cells[last].infected;
    if (byCount !== 0) return byCount;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  const sum = (values: readonly number[]) =>
    values.reduce((total, value) => total + value, 0);
  return {
    ok: true,
    table: {
      columns: plan.days.map((day, index) => ({
        day,
        hour: plan.hours[index]
      })),
      rows,
      totals: complete.map((summary) => ({
        present: sum(summary.present),
        infected: sum(summary.infected)
      })),
      residents: sum(layout.residents),
      runHours: plan.runHours
    }
  };
}

/** The rows that are shown, and how many are left out. */
export function limitRows(
  table: NeighborhoodTable,
  limit: number = MAX_NEIGHBORHOOD_ROWS
): { rows: NeighborhoodRow[]; hiddenRows: number; maxRate: number } {
  const rows = table.rows.slice(0, Math.max(0, limit));
  let maxRate = 0;
  for (const row of rows) {
    for (const cell of row.cells) {
      const rate = ratePer1000(cell.infected, cell.present);
      if (rate !== null && rate > maxRate) maxRate = rate;
    }
  }
  return { rows, hiddenRows: table.rows.length - rows.length, maxRate };
}

/** Whether most of the residents were away: fewer than LOW_AT_HOME_PERCENT of them at home. */
export function isMostlyAway(present: number, residents: number): boolean {
  return residents > 0 && present * 100 < LOW_AT_HOME_PERCENT * residents;
}

/** How many neighborhoods are marked on the last day (all of them, not only the shown). */
export function mostlyAwayCount(table: NeighborhoodTable): number {
  const last = table.columns.length - 1;
  if (last < 0) return 0;
  return table.rows.filter((row) =>
    isMostlyAway(row.cells[last].present, row.residents)
  ).length;
}

/** The lowest and highest rate on the last day, null with fewer than two. */
export function lastDaySpread(
  table: NeighborhoodTable
): { lowest: number; highest: number; day: number; count: number } | null {
  const last = table.columns.length - 1;
  if (last < 0) return null;
  const rates: number[] = [];
  for (const row of table.rows) {
    const rate = ratePer1000(row.cells[last].infected, row.cells[last].present);
    if (rate !== null) rates.push(rate);
  }
  if (rates.length < 2) return null;
  return {
    lowest: Math.min(...rates),
    highest: Math.max(...rates),
    day: table.columns[last].day,
    count: rates.length
  };
}

/**
 * A rate for a cell: one decimal below 10, whole numbers from 10 up. A rate
 * above zero is never shown as 0.0.
 */
export function formatRate(rate: number | null): string {
  if (rate === null) return '–';
  if (!(rate > 0)) return '·';
  const tenth = Math.round(rate * 10) / 10;
  if (tenth === 0) return '<0.1';
  return tenth >= 10 ? String(Math.round(rate)) : tenth.toFixed(1);
}

/** A rate inside a sentence: a plain 0 instead of the dot used in the table. */
export function formatRateInText(rate: number | null): string {
  return rate === 0 ? '0' : formatRate(rate);
}

/**
 * The people at home as a share of the residents LISTED for the neighborhood,
 * rounded down so it never shows 100% when somebody listed is away. The listed
 * number is only roughly right (a home can have one person more at home than
 * members), so more people at home than listed is shown as such, never capped.
 */
export function formatShare(present: number, residents: number): string {
  if (!(residents > 0)) return '–';
  if (present > residents) return '>100%';
  if (present === residents) return '100%';
  return `${Math.floor((100 * present) / residents)}%`;
}

function plural(count: number, one: string, many: string) {
  return `${count.toLocaleString('en-US')} ${count === 1 ? one : many}`;
}

/** What a screen reader (and the tooltip) says for one cell. */
export function describeNeighborhoodCell(
  id: string,
  day: number,
  cell: NeighborhoodCell
): string {
  if (cell.present === 0) {
    return `Day ${day}, ${id}: nobody was at home at the end of the day`;
  }
  const rate = formatRateInText(ratePer1000(cell.infected, cell.present));
  return `Day ${day}, ${id}: ${cell.infected.toLocaleString(
    'en-US'
  )} of ${plural(cell.present, 'person', 'people')} at home had been infected (${rate} per 1,000)`;
}

/**
 * What a census block group code is made of: 2 digits for the state, 3 for the
 * county, 6 for the tract and 1 for the block group. Null for anything that is
 * not a 12-digit code, so nothing is guessed about other kinds of ids.
 */
export function describeBlockGroup(id: string): string | null {
  const match = /^(\d{2})(\d{3})(\d{6})(\d)$/.exec(id);
  if (!match) return null;
  return `Census block group ${id}: state ${match[1]}, county ${match[2]}, tract ${match[3]}, block group ${match[4]}`;
}

/**
 * What the last day's count covers of the run: the people at home on that day
 * who had been infected by then (the people infected at the start are among
 * them), against the new infections the whole run recorded (home plus places;
 * the people infected at the start are not in that number). A run where the
 * infected people are away from home at the reading hour shows far fewer, and
 * this is where a reader sees it. The last day's count is meant, not the whole
 * table: a person who is away on that day can be in the count of an earlier day.
 * Null when the run's total is unknown.
 */
export function describeCoverage(
  table: NeighborhoodTable,
  newInfections: number | null
): string | null {
  const last = table.columns.length - 1;
  if (last < 0 || newInfections === null) return null;
  const seen = table.totals[last].infected;
  const count = (value: number) => value.toLocaleString('en-US');
  // Infections after the last reading exist only when the run goes on after it.
  const later = table.runHours > table.columns[last].hour;
  return `On day ${table.columns[last].day}, ${count(seen)} ${
    seen === 1 ? 'person' : 'people'
  } at home had been infected, counting those infected at the start. The whole run recorded ${count(newInfections)} new ${
    newInfections === 1 ? 'infection' : 'infections'
  }, not counting the people infected at the start. Infected people who were away from home at that hour${
    later ? ', or who were infected later,' : ''
  } are not in that day's count.`;
}
