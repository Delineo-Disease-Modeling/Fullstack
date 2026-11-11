// Pure check behind the "nobody was newly infected" notice. The engine emits
// cumulative incidence (a home total and per-place counts), so a run where the
// disease never spread to anyone new comes back as a home total of 0 and no
// place above 0. A run that never emitted incidence is null, which says
// nothing about spread, so it must not count as "no spread". A run with only a
// handful of new infections (under 1% of the people who live in the zone) is
// told apart the same way. No React and no store, so it is unit-testable via
// node:test.

import { buildLayout } from './neighborhood-rates.ts';
import { totalNewInfections } from './seed-check.ts';

// "Only a few": fewer new infections than this share of the residents. Chosen
// from the runs we measured on our own synthetic zone, where a run either dies
// out with 0 to 4 new infections or becomes an outbreak of thousands, so any
// share between the two picks out the same runs there. It is a reading aid for
// the note, not a statistic.
export const FEW_INFECTIONS_PERCENT = 1;

export type WholeRunIncidence = {
  home: number;
  places: Record<string, number>;
};

// True only when the run reported incidence and every count in it is zero.
// Anything unusable (null, a non-number, an array of places) is not evidence.
export function hasNoNewInfections(
  incidence: WholeRunIncidence | null | undefined
): boolean {
  if (incidence == null || typeof incidence !== 'object') {
    return false;
  }
  const { home, places } = incidence;
  if (home !== 0) {
    return false;
  }
  if (places == null || typeof places !== 'object' || Array.isArray(places)) {
    return false;
  }
  return Object.values(places).every((count) => count === 0);
}

/**
 * The number of people who live in the zone, from papdata.homes; null unless
 * every home has a neighborhood and a usable number of members (the same test
 * the neighborhood table uses), because a sum over only some of the homes
 * would make a run look bigger than it is.
 */
export function totalResidents(homes: unknown): number | null {
  const laid = buildLayout(homes);
  if (!laid.ok) {
    return null;
  }
  return laid.layout.residents.reduce((sum, count) => sum + count, 0);
}

/**
 * True when somebody was newly infected, but fewer people than
 * FEW_INFECTIONS_PERCENT of the residents. False for no infections (that has
 * its own note), for unusable counts and for an unknown number of residents.
 */
export function hasFewNewInfections(
  incidence: WholeRunIncidence | null | undefined,
  residents: number | null | undefined
): boolean {
  const total = totalNewInfections(incidence);
  if (total === null || total === 0) {
    return false;
  }
  if (
    typeof residents !== 'number' ||
    !Number.isFinite(residents) ||
    !(residents > 0)
  ) {
    return false;
  }
  return total * 100 < FEW_INFECTIONS_PERCENT * residents;
}
