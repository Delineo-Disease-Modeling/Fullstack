// Pure helpers for comparing two runs of the same zone in the hotspot panel
// (the run with interventions against its baseline). Nothing here touches
// React, the network or the store, so it is unit-testable.
//
// The URL only names the two runs. It does not prove that they can be compared:
// they may belong to different zones, have different lengths or frame grids, or
// list different places. Every check that can be made from a run's manifest is
// made here, and a failed check means "not comparable", never a guess.

import { hourlyGridRange } from './hotspot-window.ts';

export type ComparisonPlace = {
  id: string;
  placekey: string | null;
  label: string;
  category: string;
};

// What the comparison needs to know about one run. It is built from the run's
// manifest (GET /api/simdata/{id}/map) and carries the place descriptors, so a
// parent that already holds the manifest can pass the same shape as a prop.
export type ComparisonRun = {
  simId: number;
  label: string;
  zoneId: number | null;
  lengthMinutes: number | null;
  places: readonly ComparisonPlace[];
  timesteps: readonly number[];
  // false for runs without per-place incidence (older runs): null is not zero.
  hasIncidence: boolean;
  metadata: Readonly<Record<string, unknown>> | null;
};

export type ComparisonRuns = {
  // The run being examined (with interventions).
  primary: ComparisonRun;
  // The run it is compared against (the baseline).
  reference: ComparisonRun;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const RUN_ID = /^\d{1,15}$/;

// A run id from a URL: digits only, positive, small enough to be exact.
export function parseRunId(value: unknown): number | null {
  if (typeof value !== 'string' || !RUN_ID.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

// `/simulator/<run_id>?baseline=<id>`: the route's run is the intervention run
// and `baseline` is the run it is compared against. null when either id is not
// a valid run id or both name the same run.
export function parseComparisonTargets(
  runIdParam: unknown,
  baselineParam: unknown
): { primaryId: number; referenceId: number } | null {
  const primaryId = parseRunId(runIdParam);
  const referenceId = parseRunId(baselineParam);
  if (primaryId === null || referenceId === null) return null;
  if (primaryId === referenceId) return null;
  return { primaryId, referenceId };
}

/**
 * Build a ComparisonRun from the `data` object of a map manifest, or null when
 * the manifest is not usable (missing or malformed places or frame times,
 * duplicate place ids). Places without a label get the same fallback name the
 * ranking uses.
 */
export function normalizeManifest(
  simId: number,
  label: string,
  data: unknown
): ComparisonRun | null {
  if (!isRecord(data)) return null;
  const papdata = data.papdata;
  if (!isRecord(papdata) || !Array.isArray(papdata.places)) return null;

  const places: ComparisonPlace[] = [];
  const seen = new Set<string>();
  for (const raw of papdata.places) {
    if (!isRecord(raw)) return null;
    const idValue = raw.id;
    if (typeof idValue !== 'string' && typeof idValue !== 'number') return null;
    const id = String(idValue);
    if (seen.has(id)) return null;
    seen.add(id);
    places.push({
      id,
      placekey: typeof raw.placekey === 'string' ? raw.placekey : null,
      label:
        typeof raw.label === 'string' && raw.label !== ''
          ? raw.label
          : `Place #${id}`,
      category:
        typeof raw.top_category === 'string' && raw.top_category !== ''
          ? raw.top_category
          : 'Uncategorized'
    });
  }

  const timesteps = data.timesteps;
  if (
    !Array.isArray(timesteps) ||
    !timesteps.every(
      (time) => typeof time === 'number' && Number.isFinite(time)
    )
  ) {
    return null;
  }

  const zone = data.zone;
  const zoneId =
    isRecord(zone) && Number.isInteger(zone.id) ? (zone.id as number) : null;
  const length = data.length;
  const lengthMinutes =
    typeof length === 'number' && Number.isFinite(length) && length > 0
      ? length
      : null;

  return {
    simId,
    label,
    zoneId,
    lengthMinutes,
    places,
    timesteps: timesteps as number[],
    hasIncidence: isRecord(data.incidence),
    metadata: isRecord(data.metadata) ? data.metadata : null
  };
}

export type NotComparableReason =
  | 'same-run'
  | 'no-incidence'
  | 'no-places'
  | 'different-zone'
  | 'different-length'
  | 'different-places'
  | 'different-frames';

export type Comparability =
  | {
      ok: true;
      // First and last whole hour that both runs have a frame for.
      range: { minHour: number; maxHour: number };
      // Things that do not block the comparison but a reader should know.
      notes: string[];
    }
  | { ok: false; reason: NotComparableReason; message: string };

const NOT_COMPARABLE: Record<NotComparableReason, string> = {
  'same-run': 'Both ids name the same run, so there is nothing to compare.',
  'no-incidence':
    'One of the runs has no per-place incidence data (older run), so the two cannot be compared.',
  'no-places': 'These runs list no places, so there is nothing to compare.',
  'different-zone':
    'The runs belong to different zones, so they cannot be compared.',
  'different-length':
    'The runs have different lengths, so they cannot be compared.',
  'different-places':
    'The runs list different places (the zone data changed between them), so they cannot be compared.',
  'different-frames':
    'The runs do not have the same complete hourly frames, so they cannot be compared.'
};

function fail(reason: NotComparableReason): Comparability {
  return { ok: false, reason, message: NOT_COMPARABLE[reason] };
}

function samePlaces(
  left: readonly ComparisonPlace[],
  right: readonly ComparisonPlace[]
): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    const a = left[index];
    const b = right[index];
    if (
      a.id !== b.id ||
      a.placekey !== b.placekey ||
      a.label !== b.label ||
      a.category !== b.category
    ) {
      return false;
    }
  }
  return true;
}

function interventionList(
  metadata: Readonly<Record<string, unknown>> | null
): Array<Record<string, unknown>> | null {
  const list = metadata?.interventions;
  // A malformed list says nothing, it must not read as "no interventions".
  if (!Array.isArray(list) || !list.every(isRecord)) return null;
  return list;
}

// True when some intervention of the run actually changes behaviour. A capacity
// multiplier of 1 means no limit, anything else counts.
function hasActiveIntervention(
  metadata: Readonly<Record<string, unknown>> | null
): boolean | null {
  const list = interventionList(metadata);
  if (list === null) return null;
  const positive = (value: unknown) => typeof value === 'number' && value > 0;
  return list.some(
    (entry) =>
      positive(entry.mask) ||
      positive(entry.vaccine) ||
      positive(entry.lockdown) ||
      positive(entry.selfiso) ||
      (typeof entry.capacity === 'number' && entry.capacity < 1)
  );
}

const SETTING_KEYS: Array<[string, string]> = [
  ['disease_name', 'disease'],
  ['variants', 'variants'],
  ['dmp_mode', 'disease model mode'],
  ['initial_infected_count', 'initial infected count']
];

function differingSettings(
  left: Readonly<Record<string, unknown>> | null,
  right: Readonly<Record<string, unknown>> | null
): string[] {
  if (!left || !right) return [];
  const names: string[] = [];
  for (const [key, name] of SETTING_KEYS) {
    if (left[key] === undefined || right[key] === undefined) continue;
    if (JSON.stringify(left[key]) !== JSON.stringify(right[key])) {
      names.push(name);
    }
  }
  return names;
}

/**
 * Whether two runs can be compared, and what a reader should know about them.
 * A failed check blocks the comparison. A missing piece of provenance (zone id
 * or length absent from a manifest) does not block it, but is reported in
 * `notes` as unverified instead of being assumed fine.
 */
export function checkComparable(runs: ComparisonRuns): Comparability {
  const { primary, reference } = runs;
  if (primary.simId === reference.simId) return fail('same-run');
  if (!primary.hasIncidence || !reference.hasIncidence) {
    return fail('no-incidence');
  }
  if (primary.places.length === 0 || reference.places.length === 0) {
    return fail('no-places');
  }
  if (
    primary.zoneId !== null &&
    reference.zoneId !== null &&
    primary.zoneId !== reference.zoneId
  ) {
    return fail('different-zone');
  }
  if (
    primary.lengthMinutes !== null &&
    reference.lengthMinutes !== null &&
    primary.lengthMinutes !== reference.lengthMinutes
  ) {
    return fail('different-length');
  }
  if (!samePlaces(primary.places, reference.places)) {
    return fail('different-places');
  }
  const primaryRange = hourlyGridRange(primary.timesteps);
  const referenceRange = hourlyGridRange(reference.timesteps);
  if (
    primaryRange === null ||
    referenceRange === null ||
    primaryRange.minHour !== referenceRange.minHour ||
    primaryRange.maxHour !== referenceRange.maxHour
  ) {
    return fail('different-frames');
  }

  const notes: string[] = [];
  if (
    primary.zoneId === null ||
    reference.zoneId === null ||
    primary.lengthMinutes === null ||
    reference.lengthMinutes === null
  ) {
    notes.push('Could not verify that both runs use the same zone and length.');
  }
  const differing = differingSettings(reference.metadata, primary.metadata);
  if (differing.length > 0) {
    notes.push(`The runs also differ in: ${differing.join(', ')}.`);
  }
  if (hasActiveIntervention(reference.metadata) === true) {
    notes.push('The baseline run has interventions of its own.');
  }
  if (hasActiveIntervention(primary.metadata) === false) {
    notes.push('The run with interventions has no interventions set.');
  }
  return { ok: true, range: primaryRange, notes };
}

export type SeedPairing = 'same-fixed' | 'different' | 'unknown';

type SeedInfo = { kind: 'random' } | { kind: 'fixed'; token: string };

// What a run's metadata says about its random numbers. Only a recognised,
// consistent record counts. `random_seed_behavior` holds a constant token for
// every fixed-seed run, so an explicit seed number chosen by a script is NOT
// recorded there.
function seedInfo(
  metadata: Readonly<Record<string, unknown>> | null
): SeedInfo | null {
  if (!metadata) return null;
  const { randseed, random_seed_behavior: behavior } = metadata;
  if (randseed === true && behavior === 'random') return { kind: 'random' };
  if (
    randseed === false &&
    typeof behavior === 'string' &&
    behavior.startsWith('deterministic:') &&
    behavior.length > 'deterministic:'.length
  ) {
    return { kind: 'fixed', token: behavior };
  }
  return null;
}

/**
 * Whether the two runs are likely to share their random draws. 'different' when
 * either run used random draws, or the fixed seeds are recorded differently.
 * 'unknown' when a record is missing or not understood and neither run is
 * known to be random.
 */
export function seedPairing(
  reference: Readonly<Record<string, unknown>> | null,
  primary: Readonly<Record<string, unknown>> | null
): SeedPairing {
  const a = seedInfo(reference);
  const b = seedInfo(primary);
  if (a?.kind === 'random' || b?.kind === 'random') return 'different';
  if (a === null || b === null) return 'unknown';
  return a.token === b.token ? 'same-fixed' : 'different';
}

const SEED_NOTES: Record<SeedPairing, string> = {
  'same-fixed':
    'Both runs used a fixed random seed, which reduces noise but does not remove it.',
  different:
    'The runs used different random draws, so small differences can be noise.',
  unknown:
    'The random seeds of these runs are not recorded, so small differences can be noise.'
};

export function seedNote(pairing: SeedPairing): string {
  return SEED_NOTES[pairing];
}
