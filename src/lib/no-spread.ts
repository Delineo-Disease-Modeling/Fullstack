// Pure check behind the "nobody was newly infected" notice. The engine emits
// cumulative incidence (a home total and per-place counts), so a run where the
// disease never spread to anyone new comes back as a home total of 0 and no
// place above 0. A run that never emitted incidence is null, which says
// nothing about spread, so it must not count as "no spread". No React and no
// store, so it is unit-testable via node:test.

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
