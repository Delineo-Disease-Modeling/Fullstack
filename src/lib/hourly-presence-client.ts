// Loads the series of one place for the "Busy hours" table from the existing
// /api/simdata/[id]/chartdata?loc_type=places&loc_id=... endpoint, the one the
// place chart already uses. No React here, so it can be tested with a fake
// fetch. Nothing is remembered between calls: the table follows the run the
// page holds, and an answer cached for an older version of the run must not be
// mixed with it.

import type { DataPoint } from './simulation-data.ts';

export type PlaceSeries = {
  // People present per hour (only the hours with somebody there).
  presence: DataPoint[];
  // New infections per hour, null for runs that do not record them.
  incidence: DataPoint[] | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * The people present and the new infections of one place, per hour. Rejects on
 * network errors, on a 202 (the run is still being processed), on an error
 * answer and on a body that is not a chart; resolves with an empty presence
 * series when nobody was ever at the place.
 */
export async function fetchPlaceSeries(
  simId: number,
  placeId: string,
  signal?: AbortSignal,
  fetchImpl: typeof fetch = fetch,
  origin: string = window.location.origin
): Promise<PlaceSeries> {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  const url = new URL(`/api/simdata/${simId}/chartdata`, origin);
  url.searchParams.set('loc_type', 'places');
  url.searchParams.set('loc_id', placeId);

  const response = await fetchImpl(url, { signal, cache: 'no-store' });
  if (response.status === 202) {
    throw new Error('This run is still being processed.');
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      isRecord(body) && typeof body.message === 'string'
        ? body.message
        : `Failed to load this place (${response.status}).`;
    throw new Error(message);
  }

  const data = isRecord(body) ? body.data : null;
  if (!isRecord(data) || !Array.isArray(data.iot)) {
    throw new Error('The server returned an unexpected chart.');
  }
  if (typeof data.error === 'string' && data.error) {
    throw new Error(data.error);
  }
  const incidence = Array.isArray(data.incidence)
    ? (data.incidence as DataPoint[])
    : null;
  return { presence: data.iot as DataPoint[], incidence };
}
