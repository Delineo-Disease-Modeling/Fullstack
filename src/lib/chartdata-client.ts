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

/** Active infected at a timestep = sum of the per-disease counts in `iot`. */
function activeInfected(point: DataPoint | undefined): number {
  if (!point) return 0;
  let total = 0;
  for (const [key, value] of Object.entries(point)) {
    if (key !== 'time' && typeof value === 'number') total += value;
  }
  return total;
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
 * Infected + Infectious + Symptomatic at once), so we never sum the `states`
 * columns to count infections. Active infections come from summing `iot`'s
 * disease counts; the cumulative attack count comes from the monotonic
 * `Susceptible` series (population − Susceptible_final).
 */
export function computeOutcomeStats(stats: ChartData): OutcomeStats {
  const iot = stats.iot ?? [];
  const states = stats.states ?? [];

  let peakInfected = 0;
  let peakTimeHours = 0;
  for (const point of iot) {
    const active = activeInfected(point);
    if (active > peakInfected) {
      peakInfected = active;
      peakTimeHours = typeof point.time === 'number' ? point.time : 0;
    }
  }

  let totalInfected = 0;
  if (states.length > 0) {
    const firstSusceptible = Number(states[0].Susceptible ?? 0);
    const lastSusceptible = Number(states[states.length - 1].Susceptible ?? 0);
    const population = firstSusceptible + activeInfected(iot[0]);
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
