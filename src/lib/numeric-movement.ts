import type { PatternMeta, PatternTimestep } from './simulation-data';

export type { PatternMeta } from './simulation-data';

/**
 * Reconstruct per-person location from the SoA engine's compact numeric
 * movement stream. The engine emits, per timestep, a `loc` array
 * (`loc[personIdx] = locationIdx`, -1 = unplaced) plus a one-time `meta` entry
 * mapping indices back to ids. This keeps the per-person map views working
 * without the engine ever materializing pid lists (the cost the numeric
 * snapshot exists to avoid). Legacy runs keep their `{homes,places:{id:[pids]}}`
 * shape and bypass these helpers.
 */

/** A timestep is in numeric form when it carries the per-person `loc` array. */
export function isNumericTimestep(
  value: PatternTimestep | null | undefined
): value is PatternTimestep & { loc: number[] } {
  return !!value && Array.isArray(value.loc);
}

/** Read `meta` from a parsed patterns object (non-timestep key), if present. */
export function getPatternMeta(
  patternData: Record<string, unknown>
): PatternMeta | null {
  const meta = patternData?.meta as PatternMeta | undefined;
  if (
    meta &&
    Array.isArray(meta.pids) &&
    Array.isArray(meta.loc_ids) &&
    typeof meta.n_homes === 'number'
  ) {
    return meta;
  }
  return null;
}

/**
 * Reconstruct `{ placeId: [pids] }` for a numeric timestep (places only — homes
 * are skipped, matching what the people-map view renders).
 */
export function placesFromNumeric(
  loc: number[],
  meta: PatternMeta
): Record<string, string[]> {
  const { pids, loc_ids, n_homes } = meta;
  const places: Record<string, string[]> = {};
  for (let personIdx = 0; personIdx < loc.length; personIdx += 1) {
    const locIdx = loc[personIdx];
    // -1 (unplaced) and home indices (< n_homes) are not rendered as place dots.
    if (locIdx < n_homes) continue;
    const placeId = loc_ids[locIdx];
    if (placeId === undefined) continue;
    const pid = pids[personIdx];
    if (pid === undefined) continue;
    let people = places[placeId];
    if (!people) {
      people = [];
      places[placeId] = people;
    }
    people.push(pid);
  }
  return places;
}

/** Decode a single location index into its `{type, id}` (homes or places). */
export function decodeLocationIndex(
  locIdx: number | undefined,
  meta: PatternMeta
): { type: 'homes' | 'places' | 'unknown'; id: string } {
  if (locIdx === undefined || locIdx < 0) {
    return { type: 'unknown', id: 'unknown' };
  }
  const id = meta.loc_ids[locIdx];
  if (id === undefined) {
    return { type: 'unknown', id: 'unknown' };
  }
  return locIdx < meta.n_homes
    ? { type: 'homes', id }
    : { type: 'places', id };
}
