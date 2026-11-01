// Pure arithmetic for the baseline-versus-intervention comparison: per-place
// (or per-type) change of new infections between two runs for the same window.
// "Change" is always primary minus reference, so a reduction is negative.

import type { ComparisonPlace } from './comparison-pair.ts';
import { incidenceFor, type WindowFrameKeys } from './hotspot-window.ts';

export type WindowCounts = {
  home: number;
  places: Readonly<Record<string, number>>;
};

export type Totals = {
  reference: number;
  primary: number;
  change: number;
  // Relative change against the reference; null when the reference is zero.
  percent: number | null;
};

export type ChangeRow = {
  id: string;
  label: string;
  category: string;
  reference: number;
  primary: number;
  change: number;
  percent: number | null;
};

export type ComparisonResult = {
  home: Totals;
  places: Totals;
  all: Totals;
  // Every place with a non-zero count in either run, in catalog order.
  placeRows: ChangeRow[];
};

// No percentage exists when the reference is zero (not zero, not infinity).
export function percentChange(
  reference: number,
  primary: number
): number | null {
  return reference > 0 ? (primary - reference) / reference : null;
}

function totals(reference: number, primary: number): Totals {
  return {
    reference,
    primary,
    change: primary - reference,
    percent: percentChange(reference, primary)
  };
}

/**
 * Whether one window's counts can be added up exactly: the home count plus every
 * place's count stays a safe integer. Counts are never negative, so every
 * subtotal (the places, a category, the total) is then exact too. Real counts
 * are nowhere near the limit; this only refuses totals beyond the safe-integer
 * range (above 2^53 - 1), where a sum can no longer be trusted to be exact.
 */
export function hasExactTotal(
  counts: WindowCounts,
  places: readonly ComparisonPlace[]
): boolean {
  let sum = counts.home;
  if (!Number.isSafeInteger(sum)) return false;
  for (const place of places) {
    sum += incidenceFor(counts.places, place.id);
    if (!Number.isSafeInteger(sum)) return false;
  }
  return true;
}

/**
 * Compare two runs' counts for the same window. Walks the whole place catalog,
 * so a place that has infections in only one run is not lost, and sums the
 * place totals before anything is cut off.
 */
export function compareCounts(
  reference: WindowCounts,
  primary: WindowCounts,
  places: readonly ComparisonPlace[]
): ComparisonResult {
  const placeRows: ChangeRow[] = [];
  let referencePlaces = 0;
  let primaryPlaces = 0;
  for (const place of places) {
    const before = incidenceFor(reference.places, place.id);
    const after = incidenceFor(primary.places, place.id);
    referencePlaces += before;
    primaryPlaces += after;
    if (before === 0 && after === 0) continue;
    placeRows.push({
      id: place.id,
      label: place.label,
      category: place.category,
      reference: before,
      primary: after,
      change: after - before,
      percent: percentChange(before, after)
    });
  }
  return {
    home: totals(reference.home, primary.home),
    places: totals(referencePlaces, primaryPlaces),
    all: totals(reference.home + referencePlaces, primary.home + primaryPlaces),
    placeRows
  };
}

/**
 * Net change per place category. Both runs' counts are added up per category
 * across every place first, so an increase in one place cancels a decrease in
 * another place of the same category instead of being ranked on its own.
 * Categories are listed in the order they first appear in the whole catalog,
 * not in the order of the places that happen to have infections, so a tie
 * between categories does not move when the time window does.
 */
export function categoryRows(
  placeRows: readonly ChangeRow[],
  places: readonly ComparisonPlace[]
): ChangeRow[] {
  const byCategory = new Map<string, { reference: number; primary: number }>();
  for (const place of places) {
    if (!byCategory.has(place.category)) {
      byCategory.set(place.category, { reference: 0, primary: 0 });
    }
  }
  for (const row of placeRows) {
    const sum = byCategory.get(row.category) ?? { reference: 0, primary: 0 };
    sum.reference += row.reference;
    sum.primary += row.primary;
    byCategory.set(row.category, sum);
  }
  // Counts are never negative, so a category with a zero total in both runs had
  // no infections at all and, like a place without any, is left out.
  return [...byCategory.entries()]
    .filter(([, sum]) => sum.reference !== 0 || sum.primary !== 0)
    .map(([category, sum]) => ({
      id: category,
      label: category,
      category,
      reference: sum.reference,
      primary: sum.primary,
      change: sum.primary - sum.reference,
      percent: percentChange(sum.reference, sum.primary)
    }));
}

/**
 * Largest absolute change first. Ties go to the row with the larger count in
 * either run, then to the earlier row of the input, so the order does not
 * depend on how the engine happened to list the places.
 */
export function rankByChange(
  rows: readonly ChangeRow[],
  limit: number
): ChangeRow[] {
  return rows
    .map((row, index) => ({ row, index }))
    .sort((left, right) => {
      const byChange = Math.abs(right.row.change) - Math.abs(left.row.change);
      if (byChange !== 0) return byChange;
      const byCount =
        Math.max(right.row.reference, right.row.primary) -
        Math.max(left.row.reference, left.row.primary);
      if (byCount !== 0) return byCount;
      return left.index - right.index;
    })
    .slice(0, Math.max(0, limit))
    .map((entry) => entry.row);
}

// Two windows can be subtracted only when they cover exactly the same frames.
export function sameWindowKeys(
  left: WindowFrameKeys,
  right: WindowFrameKeys
): boolean {
  return left.endKey === right.endKey && left.startKey === right.startKey;
}

const MINUS = '−';

// A change with an explicit sign: +12, −93, 0. (A real minus sign, which reads
// as one in a table and is not mistaken for a hyphen.)
export function formatChange(change: number): string {
  const size = Math.abs(change).toLocaleString('en-US');
  if (change > 0) return `+${size}`;
  if (change < 0) return `${MINUS}${size}`;
  return '0';
}

// The relative change as a signed percentage. Empty when there is none (the
// reference was zero). A change too small to show as 1% reads "<1%", never "0%".
export function formatPercent(percent: number | null): string {
  if (percent === null) return '';
  const rounded = Math.round(Math.abs(percent) * 100);
  const sign = percent > 0 ? '+' : percent < 0 ? MINUS : '';
  if (rounded === 0) return percent === 0 ? '0%' : `${sign}<1%`;
  return `${sign}${rounded.toLocaleString('en-US')}%`;
}
