import assert from 'node:assert/strict';
import { getEventListeners } from 'node:events';
import { beforeEach, test } from 'node:test';

const {
  fetchComparisonRun,
  loadComparisonRuns,
  PRIMARY_LABEL,
  REFERENCE_LABEL
} = await import('./comparison-runs-client.ts');
const { clearWindowFrameCache, loadWindowIncidence } = await import(
  './window-incidence-client.ts'
);

const ORIGIN = 'http://localhost:3000';

beforeEach(() => {
  clearWindowFrameCache();
});

function manifest(overrides = {}) {
  return {
    name: 'Run',
    length: 180,
    zone: { id: 6 },
    metadata: { randseed: true, random_seed_behavior: 'random' },
    papdata: {
      places: [
        { id: '10', placekey: 'pk', label: 'Harbor Pub', top_category: 'Bars' },
        { id: '20', label: 'Valley School', top_category: 'Schools' }
      ]
    },
    timesteps: [60, 120, 180],
    incidence: { home: 0, places: {} },
    ...overrides
  };
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

test('fetchComparisonRun asks for the manifest without a time and describes the run', async () => {
  const urls = [];
  const signals = [];
  const caches = [];
  const fetchImpl = async (url, init) => {
    urls.push(String(url));
    signals.push(init.signal);
    caches.push(init.cache);
    return json({ data: manifest() });
  };
  const controller = new AbortController();
  const run = await fetchComparisonRun(
    11,
    'With interventions',
    controller.signal,
    fetchImpl,
    ORIGIN
  );
  assert.deepEqual(urls, [`${ORIGIN}/api/simdata/11/map`]);
  assert.equal(signals[0], controller.signal);
  // the server lets browsers keep a manifest for 30 s; a comparison must not
  assert.deepEqual(caches, ['no-store']);
  assert.equal(run.simId, 11);
  assert.equal(run.label, 'With interventions');
  assert.equal(run.zoneId, 6);
  assert.equal(run.hasIncidence, true);
  assert.deepEqual(
    run.places.map((place) => place.id),
    ['10', '20']
  );
});

test('fetchComparisonRun treats a 202 as an error, not as a manifest', async () => {
  const fetchImpl = async () => json({ status: 'processing' }, 202);
  await assert.rejects(
    fetchComparisonRun(5, 'x', undefined, fetchImpl, ORIGIN),
    /Run 5 is still being processed/
  );
});

test('fetchComparisonRun surfaces the server message and survives a body that is not JSON', async () => {
  await assert.rejects(
    fetchComparisonRun(
      5,
      'x',
      undefined,
      async () => json({ message: 'Could not find simdata #5' }, 404),
      ORIGIN
    ),
    /Could not find simdata #5/
  );
  await assert.rejects(
    fetchComparisonRun(
      5,
      'x',
      undefined,
      async () => new Response('<html>oops</html>', { status: 500 }),
      ORIGIN
    ),
    /Failed to load run 5 \(500\)/
  );
  await assert.rejects(
    fetchComparisonRun(
      5,
      'x',
      undefined,
      async () => json({ message: 7 }, 500),
      ORIGIN
    ),
    /Failed to load run 5 \(500\)/
  );
});

test('fetchComparisonRun rejects a 200 that is not a usable manifest', async () => {
  const bodies = [
    null,
    {},
    { data: null },
    { data: [] },
    { data: manifest({ papdata: null }) },
    { data: manifest({ timesteps: 'x' }) },
    { data: manifest({ papdata: { places: [{ id: 1 }, { id: 1 }] } }) }
  ];
  for (const body of bodies) {
    await assert.rejects(
      fetchComparisonRun(5, 'x', undefined, async () => json(body), ORIGIN),
      /unexpected description of run 5/,
      JSON.stringify(body)
    );
  }
  await assert.rejects(
    fetchComparisonRun(
      5,
      'x',
      undefined,
      async () => new Response('not json', { status: 200 }),
      ORIGIN
    ),
    /unexpected description/
  );
});

test('fetchComparisonRun does not call the network when already aborted', async () => {
  const controller = new AbortController();
  controller.abort();
  let called = false;
  await assert.rejects(
    fetchComparisonRun(
      5,
      'x',
      controller.signal,
      async () => {
        called = true;
        return json({ data: manifest() });
      },
      ORIGIN
    ),
    { name: 'AbortError' }
  );
  assert.equal(called, false);
});

function fakeFetchRun(manifests = {}) {
  const calls = [];
  const fetchRun = async (simId, label, signal) => {
    calls.push({ simId, label, signal });
    return {
      simId,
      label,
      zoneId: 6,
      lengthMinutes: 180,
      places: [],
      timesteps: [60],
      hasIncidence: true,
      metadata: manifests[simId] ?? null
    };
  };
  return { fetchRun, calls };
}

test('loadComparisonRuns loads the intervention run as primary and the baseline as reference', async () => {
  const { fetchRun, calls } = fakeFetchRun();
  const runs = await loadComparisonRuns({
    primaryId: 11,
    referenceId: 10,
    fetchRun
  });
  assert.equal(runs.primary.simId, 11);
  assert.equal(runs.primary.label, PRIMARY_LABEL);
  assert.equal(runs.reference.simId, 10);
  assert.equal(runs.reference.label, REFERENCE_LABEL);
  assert.deepEqual(calls.map((call) => call.simId).sort(), [10, 11]);
  assert.equal(PRIMARY_LABEL, 'With interventions');
  assert.equal(REFERENCE_LABEL, 'Baseline');
});

test('loadComparisonRuns forgets the window frames of the two runs, and only those', async () => {
  const frameCalls = [];
  const fetchFrame = async (simId, minutes) => {
    frameCalls.push(`${simId}:${minutes}`);
    return { hinc: 0, pinc: [1] };
  };
  const warm = (simId) =>
    loadWindowIncidence({
      simId,
      timesteps: [60, 120],
      placeIds: ['a'],
      endMinutes: 120,
      windowHours: 1,
      fetchFrame
    });
  await Promise.all([warm(10), warm(11), warm(1)]);
  assert.equal(frameCalls.length, 6);

  const { fetchRun } = fakeFetchRun();
  await loadComparisonRuns({ primaryId: 11, referenceId: 10, fetchRun });

  frameCalls.length = 0;
  await Promise.all([warm(10), warm(11), warm(1)]);
  // 10 and 11 asked the server again; 1 (and the id 11 vs 1 prefix) kept its frames
  assert.deepEqual(frameCalls.sort(), ['10:120', '10:60', '11:120', '11:60']);
});

test('loadComparisonRuns cancels the other request when one fails and reports the first error', async () => {
  let otherSignal = null;
  const fetchRun = (simId, _label, signal) => {
    if (simId === 11) return Promise.reject(new Error('HTTP 500'));
    otherSignal = signal;
    return new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () =>
        reject(new DOMException('Aborted', 'AbortError'))
      );
    });
  };
  await assert.rejects(
    loadComparisonRuns({ primaryId: 11, referenceId: 10, fetchRun }),
    /HTTP 500/
  );
  assert.equal(otherSignal.aborted, true);
});

test('loadComparisonRuns rejects when the caller aborts, even if both answers arrived, and leaves no listener', async () => {
  const caller = new AbortController();
  const { fetchRun } = fakeFetchRun();
  const pending = loadComparisonRuns({
    primaryId: 11,
    referenceId: 10,
    fetchRun,
    signal: caller.signal
  });
  caller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(getEventListeners(caller.signal, 'abort').length, 0);

  const ok = new AbortController();
  await loadComparisonRuns({
    primaryId: 11,
    referenceId: 10,
    fetchRun,
    signal: ok.signal
  });
  assert.equal(getEventListeners(ok.signal, 'abort').length, 0);
});

test('loadComparisonRuns cancels pending requests when the caller aborts', async () => {
  const signals = [];
  const fetchRun = (_simId, _label, signal) => {
    signals.push(signal);
    return new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () =>
        reject(new DOMException('Aborted', 'AbortError'))
      );
    });
  };
  const caller = new AbortController();
  const pending = loadComparisonRuns({
    primaryId: 11,
    referenceId: 10,
    fetchRun,
    signal: caller.signal
  });
  caller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(signals.length, 2);
  assert.ok(signals.every((signal) => signal.aborted));
  assert.equal(getEventListeners(caller.signal, 'abort').length, 0);
});

test('loadComparisonRuns with an already aborted signal asks for nothing', async () => {
  const caller = new AbortController();
  caller.abort();
  const { fetchRun, calls } = fakeFetchRun();
  await assert.rejects(
    loadComparisonRuns({
      primaryId: 11,
      referenceId: 10,
      fetchRun,
      signal: caller.signal
    }),
    { name: 'AbortError' }
  );
  assert.equal(calls.length, 0);
});
