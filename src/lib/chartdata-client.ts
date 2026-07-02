import type { ChartData, DataPoint } from './simulation-data';

export type ChartLoc = { id: string; type: string };

const PROCESSING_RETRY_MS = 15000;

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Fetch a run's chart data from `/api/simdata/[id]/chartdata`. With no `loc`,
 * the endpoint returns the zone-wide `global_stats`; with a `loc` it returns
 * that location's per-timestep breakdown. A 202 means stats are still being
 * processed — we poll until they're ready (or the signal aborts).
 */
export async function fetchChartData(
  simId: number,
  loc?: ChartLoc | null,
  signal?: AbortSignal,
  onProcessing?: () => void
): Promise<ChartData> {
  const url = new URL(
    `/api/simdata/${simId}/chartdata`,
    window.location.origin
  );
  if (loc) {
    url.searchParams.append('loc_type', loc.type);
    url.searchParams.append('loc_id', loc.id);
  }

  while (true) {
    const res = await fetch(url, { signal });
    if (res.status === 202) {
      onProcessing?.();
      await delay(PROCESSING_RETRY_MS, signal);
      continue;
    }
    const json = await res.json();
    if (!res.ok) {
      throw new Error(
        json?.message || `Failed to fetch chart data (${res.status})`
      );
    }
    return json.data as ChartData;
  }
}

export type OutcomeStats = {
  /** Peak number of people simultaneously infected. */
  peakInfected: number;
  /** Time (hours) at which the peak occurs. */
  peakTimeHours: number;
  /** Cumulative people ever infected (attack count) by the end of the run. */
  totalInfected: number;
  /** Number of people infected at initialization. */
  seededInfected: number;
  /** Cumulative infections after subtracting the initial seed cohort. */
  newInfections: number;
};

function numericValue(point: DataPoint | undefined, key: string): number | null {
  if (!point) return null;
  const value = point[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Unique people represented by the per-disease series at a timestep.
 *
 * For zone-wide simulator snapshots this includes terminal states such as
 * Recovered/Removed because the disease map keeps everyone with a timeline.
 */
export function diseaseTotalAtPoint(point: DataPoint | undefined): number {
  let total = 0;
  if (!point) return total;
  for (const [key, value] of Object.entries(point)) {
    if (
      key !== 'time' &&
      key !== 'All People' &&
      typeof value === 'number' &&
      Number.isFinite(value)
    ) {
      total += value;
    }
  }
  return total;
}

/**
 * Current active infections from the disease series and state buckets.
 *
 * Zone-wide `iot` counts include recovered/removed people, so subtract terminal
 * states. Per-place dots already store active infected separately; those points
 * include `All People` and satisfy Susceptible + Infected + Recovered = total,
 * so the disease count is already active and should not be reduced again.
 */
export function currentInfectionsAtPoint(
  iotPoint: DataPoint | undefined,
  statePoint: DataPoint | undefined
): number {
  const diseaseTotal = diseaseTotalAtPoint(iotPoint);
  const recovered = numericValue(statePoint, 'Recovered') ?? 0;
  const removed = numericValue(statePoint, 'Removed') ?? 0;
  const allPeople = numericValue(iotPoint, 'All People');
  const susceptible = numericValue(statePoint, 'Susceptible');

  if (allPeople != null && susceptible != null) {
    const simpleBucketTotal = susceptible + diseaseTotal + recovered + removed;
    if (Math.abs(simpleBucketTotal - allPeople) < 1e-6) {
      return Math.max(0, diseaseTotal);
    }
  }

  return Math.max(0, diseaseTotal - recovered - removed);
}

function getMetadataRecord(metadata: unknown): Record<string, unknown> | null {
  return metadata && typeof metadata === 'object'
    ? (metadata as Record<string, unknown>)
    : null;
}

function getSeededInfectedCount(metadata: unknown) {
  const record = getMetadataRecord(metadata);
  if (!record) return 0;

  const ids = record.initial_infected_ids;
  if (Array.isArray(ids)) {
    return ids.map((id) => String(id).trim()).filter(Boolean).length;
  }

  const count = Number(record.initial_infected_count);
  return Number.isFinite(count) ? Math.max(0, count) : 0;
}

/**
 * Headline outcomes from a run's zone-wide `global_stats`.
 *
 * NOTE: BITMASK_STATES are not mutually exclusive (a person can be
 * Infected + Infectious + Symptomatic at once), so we never sum the raw
 * `states` columns to count infections. Cumulative attack count comes from the
 * monotonic `Susceptible` series (population − Susceptible_final); active
 * infections are the disease total after terminal states are removed.
 */
export function computeOutcomeStats(stats: ChartData): OutcomeStats {
  const iot = stats.iot ?? [];
  const states = stats.states ?? [];
  const statesByTime = new Map(
    states
      .filter((point) => typeof point.time === 'number')
      .map((point) => [point.time, point])
  );

  let peakInfected = 0;
  let peakTimeHours = 0;
  for (let index = 0; index < iot.length; index += 1) {
    const point = iot[index];
    const statePoint = statesByTime.get(point.time) ?? states[index];
    const active = currentInfectionsAtPoint(point, statePoint);
    if (active > peakInfected) {
      peakInfected = active;
      peakTimeHours = typeof point.time === 'number' ? point.time : 0;
    }
  }

  let totalInfected = 0;
  if (states.length > 0) {
    const firstSusceptible = Number(states[0].Susceptible ?? 0);
    const lastSusceptible = Number(states[states.length - 1].Susceptible ?? 0);
    const population = firstSusceptible + diseaseTotalAtPoint(iot[0]);
    totalInfected = Math.max(0, population - lastSusceptible);
  }

  const seededInfected = getSeededInfectedCount(stats.metadata);
  const newInfections = Math.max(0, totalInfected - seededInfected);

  return {
    peakInfected,
    peakTimeHours,
    totalInfected,
    seededInfected,
    newInfections
  };
}
