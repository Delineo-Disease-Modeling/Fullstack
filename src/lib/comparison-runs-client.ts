// Client-side loading of the two runs behind a baseline-versus-intervention
// comparison: their manifests (GET /api/simdata/{id}/map without a time), turned
// into ComparisonRuns. No React here, so it can be tested with a fake fetch.
//
// Nothing is cached between calls, and the browser's own HTTP cache (the server
// allows 30 s) is bypassed: a manifest can change when a run is processed again,
// and a comparison must never mix a new manifest with older frames. Each call
// also drops the window frames remembered for the two runs.

import {
  type ComparisonRun,
  type ComparisonRuns,
  normalizeManifest
} from './comparison-pair.ts';
import { forgetRunFrames } from './window-incidence-client.ts';

// Same names the results page gives these runs.
export const PRIMARY_LABEL = 'With interventions';
export const REFERENCE_LABEL = 'Baseline';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Fetch one run's manifest and describe it. A 202 (still processing, or an
 * unreadable cache) is an error here, not a manifest. The body must be a
 * well-formed manifest, or the call fails instead of handing back a guess.
 */
export async function fetchComparisonRun(
  simId: number,
  label: string,
  signal?: AbortSignal,
  fetchImpl: typeof fetch = fetch,
  origin: string = window.location.origin
): Promise<ComparisonRun> {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  const url = new URL(`/api/simdata/${simId}/map`, origin);
  const response = await fetchImpl(url, { signal, cache: 'no-store' });
  if (response.status === 202) {
    throw new Error(`Run ${simId} is still being processed.`);
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      isRecord(body) && typeof body.message === 'string'
        ? body.message
        : `Failed to load run ${simId} (${response.status}).`;
    throw new Error(message);
  }
  const run = normalizeManifest(
    simId,
    label,
    isRecord(body) ? body.data : null
  );
  if (!run) {
    throw new Error(
      `The server returned an unexpected description of run ${simId}.`
    );
  }
  return run;
}

export type LoadRunsArgs = {
  primaryId: number;
  referenceId: number;
  signal?: AbortSignal;
  fetchRun?: typeof fetchComparisonRun;
};

/**
 * Load both runs in parallel. When one fails the other request is cancelled,
 * and the first failure is the one reported. Rejects with an AbortError when
 * the caller's signal aborts, even if both answers had already arrived.
 */
export async function loadComparisonRuns({
  primaryId,
  referenceId,
  signal,
  fetchRun = fetchComparisonRun
}: LoadRunsArgs): Promise<ComparisonRuns> {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  forgetRunFrames(primaryId);
  forgetRunFrames(referenceId);

  const inner = new AbortController();
  const forwardAbort = () => inner.abort();
  signal?.addEventListener('abort', forwardAbort, { once: true });
  const failFast = <T>(promise: Promise<T>): Promise<T> =>
    promise.catch((error: unknown) => {
      inner.abort();
      throw error;
    });

  let primary: ComparisonRun;
  let reference: ComparisonRun;
  try {
    [primary, reference] = await Promise.all([
      failFast(fetchRun(primaryId, PRIMARY_LABEL, inner.signal)),
      failFast(fetchRun(referenceId, REFERENCE_LABEL, inner.signal))
    ]);
  } finally {
    signal?.removeEventListener('abort', forwardAbort);
  }
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  return { primary, reference };
}
