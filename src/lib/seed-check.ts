// Pure helpers for "Check against other random seeds": run the settings of the
// run on screen again a few times, each with a fresh random seed, and show how
// far the whole-run numbers move. One run is one draw; this makes the size of
// the draw visible. No React, no network and no store, so it is unit-testable
// via node:test. The hook that starts the runs is use-seed-check.ts.
import type { SimSettings } from '@/stores/simsettings';

// How many other seeds are run. Fixed, and said on the button: every one is a
// full simulation that is saved as a new run.
export const RERUN_COUNT = 5;

export type IncidenceCounts = {
  home: number;
  places: Record<string, number>;
};

// What the page needs from one finished run.
export type RunInfo = {
  metadata: unknown;
  zone: SimSettings['zone'];
  timesteps: number[];
  incidence: IncidenceCounts | null;
};

export type RunRow = {
  simId: number;
  total: number;
  // The one place with the most new infections; null when nobody was infected
  // at a place or when two or more places tie for the most.
  topPlaceId: string | null;
};

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

// Everybody who was newly infected in the run (home plus all places), or null
// when the counts are missing or not usable.
export function totalNewInfections(
  incidence: IncidenceCounts | null | undefined
): number | null {
  if (incidence == null || typeof incidence !== 'object') {
    return null;
  }
  const { home, places } = incidence;
  if (!isCount(home)) {
    return null;
  }
  if (places == null || typeof places !== 'object' || Array.isArray(places)) {
    return null;
  }
  let total = home;
  for (const count of Object.values(places)) {
    if (!isCount(count)) {
      return null;
    }
    total += count;
  }
  return Number.isSafeInteger(total) ? total : null;
}

// The place with strictly the most new infections. No place when nobody was
// infected at a place, and no place when the lead is shared: naming one of two
// tied places would be an arbitrary pick. Places in `ignore` (the stand-in for
// workplaces outside the zone) are not candidates; their infections still
// count in the total.
export function topPlaceId(
  incidence: IncidenceCounts | null | undefined,
  ignore?: ReadonlySet<string>
): string | null {
  if (totalNewInfections(incidence) === null || incidence == null) {
    return null;
  }
  let best: string | null = null;
  let bestCount = 0;
  let tied = false;
  for (const [id, count] of Object.entries(incidence.places)) {
    if (ignore?.has(id)) {
      continue;
    }
    if (count > bestCount) {
      best = id;
      bestCount = count;
      tied = false;
    } else if (count === bestCount && count > 0) {
      tied = true;
    }
  }
  return tied ? null : best;
}

// One table row from a loaded run; null when its counts are not usable.
export function rowFromRunInfo(
  simId: number,
  info: RunInfo,
  ignore?: ReadonlySet<string>
): RunRow | null {
  const total = totalNewInfections(info.incidence);
  if (total === null) {
    return null;
  }
  return { simId, total, topPlaceId: topPlaceId(info.incidence, ignore) };
}

export type SeedCheckSummary = {
  runs: number;
  // First row = the run on screen.
  thisTotal: number;
  min: number;
  max: number;
  median: number;
  // Places that led in at least one run, most runs first, ties by id.
  topPlaces: { placeId: string; runs: number }[];
  // Runs without a single leading place (nobody at a place, or a tie).
  noTopRuns: number;
};

export function summarizeSeedCheck(
  rows: readonly RunRow[]
): SeedCheckSummary | null {
  if (rows.length === 0) {
    return null;
  }
  const totals = rows.map((row) => row.total).sort((a, b) => a - b);
  const middle = Math.floor(totals.length / 2);
  const median =
    totals.length % 2 === 1
      ? totals[middle]
      : (totals[middle - 1] + totals[middle]) / 2;
  const counts = new Map<string, number>();
  let noTopRuns = 0;
  for (const row of rows) {
    if (row.topPlaceId === null) {
      noTopRuns += 1;
    } else {
      counts.set(row.topPlaceId, (counts.get(row.topPlaceId) ?? 0) + 1);
    }
  }
  const topPlaces = [...counts.entries()]
    .map(([placeId, runs]) => ({ placeId, runs }))
    .sort(
      (a, b) =>
        b.runs - a.runs ||
        (a.placeId < b.placeId ? -1 : a.placeId > b.placeId ? 1 : 0)
    );
  return {
    runs: rows.length,
    thisTotal: rows[0].total,
    min: totals[0],
    max: totals[totals.length - 1],
    median,
    topPlaces,
    noTopRuns
  };
}

function plural(count: number, one: string, many: string) {
  return count === 1 ? one : many;
}

// The sentences shown above the table. `label` names a place by its id.
export function describeSeedCheck(
  summary: SeedCheckSummary,
  label: (placeId: string) => string
): string[] {
  const n = summary.runs;
  if (n < 2) {
    return [];
  }
  // A median of two middle values can be a half; it is shown as it is.
  const format = (value: number) =>
    value.toLocaleString('en-US', { maximumFractionDigits: 1 });
  if (summary.max === 0) {
    return [`Nobody was newly infected in any of the ${n} runs.`];
  }
  const lines: string[] = [];
  lines.push(
    summary.min === summary.max
      ? `Total new infections: ${format(summary.thisTotal)} in this run and in the other ${n - 1} ${plural(n - 1, 'run', 'runs')}.`
      : `Total new infections: ${format(summary.thisTotal)} in this run; ${format(summary.min)} to ${format(summary.max)} across all ${n} runs (median ${format(summary.median)}).`
  );
  const parts = summary.topPlaces.map(
    ({ placeId, runs }) => `${label(placeId)} in ${runs} of ${n} runs`
  );
  if (summary.noTopRuns > 0) {
    parts.push(
      `no single top place in ${summary.noTopRuns} ${plural(summary.noTopRuns, 'run', 'runs')}`
    );
  }
  lines.push(`Top hotspot: ${parts.join('; ')}.`);
  return lines;
}

// Hours of the run on screen, from its frames. Only an hourly grid
// (60, 120, ... minutes) has an unambiguous length; the zone's own length is
// not the run's (a short run in a 28-day zone).
export function runHours(timesteps: readonly number[] | null): number | null {
  if (!Array.isArray(timesteps) || timesteps.length === 0) {
    return null;
  }
  for (let index = 0; index < timesteps.length; index += 1) {
    if (timesteps[index] !== (index + 1) * 60) {
      return null;
    }
  }
  return timesteps.length;
}

// Two places can share a name; tell them apart by id, as the by-day heat map
// does, so a change of the leading place is not hidden behind equal names. A
// made-up label ("Starbucks (#7)") can equal another place's real name, so the
// final labels are checked once more.
export function placeLabels(
  places: readonly { id: string | number; label: string }[] | null | undefined
): Map<string, string> {
  const list = places ?? [];
  const counts = new Map<string, number>();
  for (const place of list) {
    counts.set(place.label, (counts.get(place.label) ?? 0) + 1);
  }
  const labels = new Map<string, string>();
  for (const place of list) {
    const id = String(place.id);
    labels.set(
      id,
      (counts.get(place.label) ?? 0) > 1
        ? `${place.label} (#${id})`
        : place.label
    );
  }
  const finalCounts = new Map<string, number>();
  for (const label of labels.values()) {
    finalCounts.set(label, (finalCounts.get(label) ?? 0) + 1);
  }
  for (const [id, label] of labels) {
    if ((finalCounts.get(label) ?? 0) > 1) {
      labels.set(id, `${label} [id ${id}]`);
    }
  }
  return labels;
}

export type RerunSettings =
  | { ok: true; settings: SimSettings }
  | { ok: false; reason: string };

// What a rerun starts from for everything the run's metadata does not set. It
// is NOT the page's settings store: that holds whatever the last new-run form
// or run page left in it, which has nothing to do with the run on screen. Every
// field that changes a simulation is taken from the metadata below; these only
// fill the rest (the same values as the store's own defaults, which a test
// keeps equal).
export const RERUN_DEFAULTS: SimSettings = {
  sim_id: null,
  zone: null,
  hours: 84,
  randseed: true,
  usecache: true,
  initial_infected_count: 1,
  initial_infected_ids: [],
  disease_name: 'COVID-19',
  variants: ['Delta'],
  dmp_mode: 'auto',
  model_path_by_variant: { Delta: 'variant.Delta.general' },
  matrix_by_variant: {},
  disabled_poi_ids: [],
  interventions: [
    { time: 0, mask: 0, vaccine: 0, capacity: 1, lockdown: 0, selfiso: 0 }
  ],
  compareBaseline: false
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

// A list of names or ids as the metadata holds it. Blank entries are dropped;
// anything that is not a string or a number makes the whole list unusable
// (it is never turned into "null" or "[object Object]").
function nameList(value: unknown, allowNumbers: boolean): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const out: string[] = [];
  for (const item of value) {
    if (typeof item === 'string') {
      const name = item.trim();
      if (name) {
        out.push(name);
      }
    } else if (
      allowNumbers &&
      typeof item === 'number' &&
      Number.isFinite(item)
    ) {
      out.push(String(item));
    } else {
      return null;
    }
  }
  return out;
}

const INTERVENTION_KEYS = [
  'time',
  'mask',
  'vaccine',
  'capacity',
  'lockdown',
  'selfiso'
] as const;

// The whole schedule or nothing: one bad row is not dropped quietly.
function interventionSchedule(
  value: unknown
): SimSettings['interventions'] | null {
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }
  const out: SimSettings['interventions'] = [];
  for (const item of value) {
    const record = asRecord(item);
    if (
      !record ||
      !INTERVENTION_KEYS.every(
        (key) => typeof record[key] === 'number' && Number.isFinite(record[key])
      )
    ) {
      return null;
    }
    out.push({
      time: record.time as number,
      mask: record.mask as number,
      vaccine: record.vaccine as number,
      capacity: record.capacity as number,
      lockdown: record.lockdown as number,
      selfiso: record.selfiso as number
    });
  }
  return out;
}

// variant -> model path (a string, or null for the default model).
function modelPaths(value: unknown): Record<string, string | null> | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }
  const out: Record<string, string | null> = {};
  for (const [variant, path] of Object.entries(record)) {
    if (path !== null && typeof path !== 'string') {
      return null;
    }
    out[variant] = path;
  }
  return out;
}

// The settings to run again: those the run on screen was started with, read
// from its metadata, over its own length, with a fresh random seed. A run whose
// metadata does not hold every setting that changes a simulation, or holds one
// that is not usable, is refused rather than filled up or repaired. The
// metadata records the people who WERE infected at the start (as many as the
// count says), so they are kept: only the random seed differs.
//
// The DMP matrix is not recorded. The website's new-run form assigns the
// default matrix to every variant, so a rerun does the same when a default
// exists (`options.defaultMatrixId`), as a new run from the form would; a
// different matrix chosen at the start is not copied. (With and without the
// default matrix, 20 runs each: about the same mean, a different spread.)
export function buildRerunSettings(
  info: Pick<RunInfo, 'metadata' | 'zone' | 'timesteps'>,
  defaults: SimSettings = RERUN_DEFAULTS,
  options: { defaultMatrixId?: number | null } = {}
): RerunSettings {
  if (!info.zone) {
    return {
      ok: false,
      reason: 'This run has no zone, so it cannot be run again.'
    };
  }
  const hours = runHours(info.timesteps);
  if (hours === null) {
    return {
      ok: false,
      reason:
        'This run does not have an hourly time grid, so it cannot be run again.'
    };
  }
  const record = asRecord(info.metadata);
  const missing: string[] = [];
  const count = record?.initial_infected_count;
  const countOk =
    typeof count === 'number' && Number.isSafeInteger(count) && count >= 0;
  if (!countOk) {
    missing.push('initial infected count');
  }
  const ids = nameList(record?.initial_infected_ids, true);
  // The run records who was infected, as many people as it says. Fewer would
  // mean the rerun draws other people and "the same people" would be untrue.
  if (ids === null || (countOk && ids.length !== count)) {
    missing.push('initial infected people');
  }
  const dmp = record?.dmp_mode;
  if (dmp !== 'auto' && dmp !== 'required' && dmp !== 'off') {
    missing.push('DMP mode');
  }
  const disease =
    typeof record?.disease_name === 'string' ? record.disease_name.trim() : '';
  if (!disease) {
    missing.push('disease');
  }
  const variants = nameList(record?.variants, false);
  if (variants === null || variants.length === 0) {
    missing.push('variants');
  }
  const paths = modelPaths(record?.model_path_by_variant);
  if (paths === null) {
    missing.push('disease model');
  }
  const interventions = interventionSchedule(record?.interventions);
  if (interventions === null) {
    missing.push('interventions');
  }
  // Absent means no place was disabled; present but not a list is a gap.
  const disabled =
    record && 'disabled_poi_ids' in record
      ? nameList(record.disabled_poi_ids, true)
      : [];
  if (disabled === null) {
    missing.push('disabled places');
  }
  if (
    missing.length > 0 ||
    !countOk ||
    ids === null ||
    (dmp !== 'auto' && dmp !== 'required' && dmp !== 'off') ||
    variants === null ||
    paths === null ||
    interventions === null ||
    disabled === null
  ) {
    return {
      ok: false,
      reason: `This run does not record all of its settings (${missing.join(', ')}), so it cannot be run again.`
    };
  }
  const matrixId = options.defaultMatrixId;
  const matrix: Record<string, number | null> = {};
  if (
    typeof matrixId === 'number' &&
    Number.isSafeInteger(matrixId) &&
    matrixId > 0
  ) {
    for (const variant of variants) {
      matrix[variant] = matrixId;
    }
  }
  return {
    ok: true,
    settings: {
      ...defaults,
      initial_infected_count: count,
      initial_infected_ids: ids,
      dmp_mode: dmp,
      disease_name: disease,
      variants,
      model_path_by_variant: paths,
      interventions,
      sim_id: null,
      zone: info.zone,
      hours,
      randseed: true,
      disabled_poi_ids: disabled,
      matrix_by_variant: matrix,
      compareBaseline: false
    }
  };
}

export type SeedCheckState =
  | { status: 'idle' }
  | {
      status: 'running';
      simId: number;
      // The run on screen first, then every finished rerun.
      rows: RunRow[];
      progress: number | null;
      message: string | null;
    }
  | { status: 'done'; simId: number; rows: RunRow[] }
  | { status: 'stopped'; simId: number; rows: RunRow[] }
  | { status: 'error'; simId: number; rows: RunRow[]; message: string };

export type SeedCheckAction =
  | { type: 'begin'; simId: number }
  | { type: 'first-row'; simId: number; row: RunRow }
  | { type: 'progress'; simId: number; value?: number; message?: string }
  | { type: 'run-done'; simId: number; row: RunRow }
  | { type: 'fail'; simId: number; message: string }
  | { type: 'stop'; simId: number }
  | { type: 'reset' };

export const IDLE: SeedCheckState = { status: 'idle' };

// Every action names the run it belongs to; one for another run than the state
// holds is dropped, so a slow answer never lands under the wrong run.
export function seedCheckReducer(
  state: SeedCheckState,
  action: SeedCheckAction
): SeedCheckState {
  if (action.type === 'reset') {
    return IDLE;
  }
  if (action.type === 'begin') {
    return {
      status: 'running',
      simId: action.simId,
      rows: [],
      progress: null,
      message: null
    };
  }
  if (state.status === 'idle' || state.simId !== action.simId) {
    return state;
  }
  if (state.status !== 'running') {
    return state;
  }
  switch (action.type) {
    case 'first-row':
      return state.rows.length === 0 ? { ...state, rows: [action.row] } : state;
    case 'progress':
      return {
        ...state,
        progress:
          typeof action.value === 'number' && Number.isFinite(action.value)
            ? Math.max(0, Math.min(100, action.value))
            : state.progress,
        message: action.message ?? state.message
      };
    case 'run-done': {
      if (state.rows.length === 0 || state.rows.length > RERUN_COUNT) {
        return state;
      }
      const rows = [...state.rows, action.row];
      return rows.length > RERUN_COUNT
        ? { status: 'done', simId: state.simId, rows }
        : { ...state, rows, progress: null, message: null };
    }
    case 'fail':
      return {
        status: 'error',
        simId: state.simId,
        rows: state.rows,
        message: action.message
      };
    case 'stop':
      return { status: 'stopped', simId: state.simId, rows: state.rows };
    default:
      return state;
  }
}
