import {
  type GeoJSONData,
  getFeatureCbgId,
  normalizeCbgId
} from '../../lib/cz-geo.ts';
import {
  CLUSTER_ALGORITHM_OPTIONS,
  type ClusterAlgorithm
} from './constants.ts';
import type {
  TraceClusterDelta,
  TracePayload,
  TraceStep
} from './types.ts';

export function isClusterAlgorithm(
  value: unknown
): value is ClusterAlgorithm {
  return CLUSTER_ALGORITHM_OPTIONS.some((option) => option.value === value);
}

function applyClusterDelta(reference: string[], delta: TraceClusterDelta) {
  const removed = new Set(delta.removed ?? []);
  return [
    ...reference.filter((cbg) => !removed.has(cbg)),
    ...(delta.added ?? [])
  ];
}

// With step_encoding 'delta' the Algorithms server sends each step's
// cluster_before as a change against the previous step's cluster_after ([] for
// the first step) and cluster_after as a change against cluster_before. This
// rebuilds the full lists; see Algorithms czcode_modules/trace_encoding.py.
export function expandTracePayload(
  trace: TracePayload | null | undefined
): TracePayload | null {
  if (!trace) {
    return null;
  }
  if (trace.step_encoding !== 'delta' || !Array.isArray(trace.steps)) {
    return trace;
  }

  let previousAfter: string[] = [];
  const steps = trace.steps.map((step) => {
    const { cluster_before_delta, cluster_after_delta, ...rest } = step;
    const expanded: TraceStep = { ...rest };
    if (cluster_before_delta) {
      expanded.cluster_before = applyClusterDelta(
        previousAfter,
        cluster_before_delta
      );
    }
    if (cluster_after_delta) {
      expanded.cluster_after = applyClusterDelta(
        expanded.cluster_before ?? [],
        cluster_after_delta
      );
    }
    previousAfter = expanded.cluster_after ?? [];
    return expanded;
  });

  const { step_encoding: _stepEncoding, ...payload } = trace;
  return { ...payload, steps };
}

export function clampIndex(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function dedupeCbgList(values: string[]) {
  return Array.from(
    new Set(values.map((value) => normalizeCbgId(value)).filter(Boolean))
  );
}

export function getMapSeedCbgIds({
  algorithmSeedCbgs,
  guidedSeedCbgs,
  resolvedSeedCbgs,
  seedCbg,
  setupSeedCbgs
}: {
  algorithmSeedCbgs?: string[] | null;
  guidedSeedCbgs?: string[] | null;
  resolvedSeedCbgs?: string[] | null;
  seedCbg?: string | null;
  setupSeedCbgs?: string[] | null;
}) {
  const source =
    (guidedSeedCbgs?.length ? guidedSeedCbgs : null) ??
    (setupSeedCbgs?.length ? setupSeedCbgs : null) ??
    (resolvedSeedCbgs?.length ? resolvedSeedCbgs : null) ??
    (algorithmSeedCbgs?.length ? algorithmSeedCbgs : null) ??
    (seedCbg ? [seedCbg] : []);

  return dedupeCbgList(source);
}

export function sameStringArray(a: string[], b: string[]) {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

export function filterGeoJsonByCbgs(
  geoJson: GeoJSONData | null | undefined,
  cbgs: string[]
) {
  if (!geoJson?.features?.length) {
    return null;
  }

  const cbgSet = new Set(
    cbgs.map((cbg) => normalizeCbgId(cbg)).filter(Boolean)
  );
  const features = geoJson.features.filter((feature) =>
    cbgSet.has(getFeatureCbgId(feature))
  );

  if (!features.length) {
    return null;
  }

  return {
    type: 'FeatureCollection',
    features
  } satisfies GeoJSONData;
}

export function getCbgIdsFromGeoJson(
  geoJson: GeoJSONData | null | undefined
) {
  return dedupeCbgList(
    (geoJson?.features ?? []).map((feature) => getFeatureCbgId(feature))
  );
}

export function monthFromDate(dateStr: string): string {
  return String(dateStr || '').slice(0, 7);
}

export function startDateFromMonth(month: string): string {
  return `${month}-01`;
}

export function endDateFromMonth(month: string): string {
  const [yStr, mStr] = month.split('-');
  const y = Number(yStr);
  const m = Number(mStr);
  if (!Number.isFinite(y) || !Number.isFinite(m)) {
    return `${month}-28`;
  }
  const nextMonth = m === 12 ? 1 : m + 1;
  const nextYear = m === 12 ? y + 1 : y;
  return `${nextYear.toString().padStart(4, '0')}-${nextMonth
    .toString()
    .padStart(2, '0')}-01`;
}

export function dateOnlyToUtcIso(dateStr: string): string {
  return `${dateStr}T00:00:00.000Z`;
}

export function monthFromEndDate(endDate: string): string {
  const [yStr, mStr] = endDate.split('-');
  const y = Number(yStr);
  const m = Number(mStr);
  if (!Number.isFinite(y) || !Number.isFinite(m)) {
    return monthFromDate(endDate);
  }
  const prevMonth = m === 1 ? 12 : m - 1;
  const prevYear = m === 1 ? y - 1 : y;
  return `${prevYear.toString().padStart(4, '0')}-${prevMonth
    .toString()
    .padStart(2, '0')}`;
}

export function normalizeAvailableMonths(availableMonths: string[]) {
  return Array.from(
    new Set(
      availableMonths.filter((month) => /^\d{4}-\d{2}$/.test(month))
    )
  ).sort();
}

export function coerceDateRangeToAvailableMonths(
  startDate: string,
  endDate: string,
  availableMonths: string[]
) {
  const months = normalizeAvailableMonths(availableMonths);
  if (months.length === 0) {
    return {
      startDate,
      endDate,
      changed: false
    };
  }

  let nextStartMonth = monthFromDate(startDate);
  if (!months.includes(nextStartMonth)) {
    nextStartMonth = months[0];
  }

  let nextEndMonth = monthFromEndDate(endDate);
  if (!months.includes(nextEndMonth) || nextEndMonth < nextStartMonth) {
    nextEndMonth = nextStartMonth;
  }

  const nextStartDate = startDateFromMonth(nextStartMonth);
  const nextEndDate = endDateFromMonth(nextEndMonth);

  return {
    startDate: nextStartDate,
    endDate: nextEndDate,
    changed: nextStartDate !== startDate || nextEndDate !== endDate
  };
}

export function formatMonthLabel(month: string): string {
  const [yStr, mStr] = month.split('-');
  const y = Number(yStr);
  const m = Number(mStr);
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) {
    return month;
  }
  const date = new Date(Date.UTC(y, m - 1, 1));
  return date.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC'
  });
}

export function getLengthHours(startDate: string, endDate: string) {
  const start = Date.parse(dateOnlyToUtcIso(startDate));
  const end = Date.parse(dateOnlyToUtcIso(endDate));
  if (Number.isNaN(start) || Number.isNaN(end)) {
    return null;
  }
  return Math.ceil((end - start) / (1000 * 60 * 60));
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

export async function readJsonObject(
  response: Response
): Promise<Record<string, unknown> | null> {
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.toLowerCase().includes('application/json')) {
    return null;
  }

  const payload = await response.json().catch(() => null);
  return isRecord(payload) ? payload : null;
}

export function getResponseErrorMessage(
  response: Response,
  payload: Record<string, unknown> | null,
  fallback: string
) {
  if (typeof payload?.message === 'string' && payload.message.trim()) {
    return payload.message;
  }

  if (typeof payload?.error === 'string' && payload.error.trim()) {
    return payload.error;
  }

  if (response.status === 404) {
    return 'The clustering endpoint was not found on the deployed Algorithms service.';
  }

  return fallback;
}

export function getPayloadErrorMessage(
  payload: Record<string, unknown> | null,
  fallback: string
) {
  if (typeof payload?.message === 'string' && payload.message.trim()) {
    return payload.message;
  }

  if (typeof payload?.error === 'string' && payload.error.trim()) {
    return payload.error;
  }

  return fallback;
}
