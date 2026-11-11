// Loads what "Check against other random seeds" needs from a finished run: the
// same /map answer the run page itself reads (settings in its metadata, its
// zone, its frame times and whole-run incidence). The body comes over the
// network, so it is checked before anything is built from it.
import type { IncidenceCounts, RunInfo } from './seed-check.ts';

type FetchLike = (
  input: string,
  init?: { cache?: 'no-store'; signal?: AbortSignal }
) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}>;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function messageOf(payload: unknown): string | null {
  const record = asRecord(payload);
  if (!record) {
    return null;
  }
  for (const key of ['message', 'error']) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
  }
  return null;
}

export async function fetchRunInfo(
  simId: number,
  signal?: AbortSignal,
  fetchImpl: FetchLike = fetch as unknown as FetchLike,
  origin = ''
): Promise<RunInfo> {
  const response = await fetchImpl(`${origin}/api/simdata/${simId}/map`, {
    cache: 'no-store',
    signal
  });
  if (response.status === 202) {
    throw new Error('This run is still being processed.');
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      messageOf(payload) ??
        `Could not load run ${simId} (status ${response.status}).`
    );
  }
  const data = asRecord(asRecord(payload)?.data);
  if (!data) {
    throw new Error(`Run ${simId} came back in an unexpected form.`);
  }
  const timesteps = data.timesteps;
  if (
    !Array.isArray(timesteps) ||
    !timesteps.every((value) => typeof value === 'number')
  ) {
    throw new Error(`Run ${simId} came back without its frame times.`);
  }
  let incidence: IncidenceCounts | null = null;
  if (data.incidence != null) {
    const record = asRecord(data.incidence);
    const places = asRecord(record?.places);
    if (!record || !places || typeof record.home !== 'number') {
      throw new Error(`Run ${simId} came back with unusable infection counts.`);
    }
    incidence = {
      home: record.home,
      places: places as Record<string, number>
    };
  }
  return {
    metadata: data.metadata ?? null,
    zone: (asRecord(data.zone) ?? null) as RunInfo['zone'],
    timesteps: timesteps as number[],
    incidence
  };
}

// The id of the DMP matrix the website's new-run form assigns to every variant
// (the one marked default), or null when there is none or the list cannot be
// read: a run is then started without a matrix, as the form itself would.
export async function fetchDefaultMatrixId(
  signal?: AbortSignal,
  fetchImpl: FetchLike = fetch as unknown as FetchLike,
  origin = ''
): Promise<number | null> {
  try {
    const response = await fetchImpl(`${origin}/api/dmp/matrices`, {
      cache: 'no-store',
      signal
    });
    if (!response.ok) {
      return null;
    }
    const list = asRecord(await response.json().catch(() => null))?.data;
    if (!Array.isArray(list)) {
      return null;
    }
    for (const item of list) {
      const record = asRecord(item);
      if (
        record?.is_default === true &&
        typeof record.id === 'number' &&
        Number.isSafeInteger(record.id) &&
        record.id > 0
      ) {
        return record.id;
      }
    }
    return null;
  } catch {
    return null;
  }
}
