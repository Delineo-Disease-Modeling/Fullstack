import assert from 'node:assert/strict';
import { getEventListeners } from 'node:events';
import { beforeEach, test } from 'node:test';

const { fetchComparisonFrame, forgetComparisonFrames, loadComparisonWindow } =
  await import('./comparison-window-client.ts');
const { clearWindowFrameCache, loadWindowIncidence } = await import(
  './window-incidence-client.ts'
);

beforeEach(() => {
  clearWindowFrameCache();
});

const PLACES = [
  { id: '10', placekey: null, label: 'Harbor Pub', category: 'Bars' },
  { id: '20', placekey: null, label: 'Valley School', category: 'Schools' },
  { id: '30', placekey: null, label: 'Corner Shop', category: 'Shops' }
];
const HOURLY = [60, 120, 180, 240, 300, 360];

function run(simId, label, overrides = {}) {
  return {
    simId,
    label,
    zoneId: 6,
    lengthMinutes: 360,
    places: PLACES,
    timesteps: HOURLY,
    hasIncidence: true,
    metadata: null,
    ...overrides
  };
}

function runs(primary = {}, reference = {}) {
  return {
    primary: run(11, 'With interventions', primary),
    reference: run(10, 'Baseline', reference)
  };
}

// Cumulative counts that grow by `rate` per place per hour, so any window has
// a count that is easy to work out by hand. Home counts grow by `home` per hour.
function frames({ reference, primary }) {
  return async (simId, minutes) => {
    const hour = minutes / 60;
    const side = simId === 11 ? primary : reference;
    return {
      hinc: hour * side.home,
      pinc: PLACES.map((_, index) => hour * side.rate[index])
    };
  };
}

const COUNTS = {
  reference: { home: 3, rate: [4, 2, 0] },
  primary: { home: 1, rate: [1, 2, 3] }
};

test('both runs are loaded for the same window and come back together', async () => {
  const result = await loadComparisonWindow({
    runs: runs(),
    endMinutes: 360,
    windowHours: 3,
    fetchFrame: frames(COUNTS)
  });
  assert.deepEqual(result.keys, {
    endKey: 360,
    startKey: 180,
    coveredMinutes: 180
  });
  // hours 3 to 6: three hours of growth
  assert.deepEqual(result.reference, { home: 9, places: { 10: 12, 20: 6 } });
  assert.deepEqual(result.primary, {
    home: 3,
    places: { 10: 3, 20: 6, 30: 9 }
  });
});

test('a window that reaches before the first frame starts from zero for both runs', async () => {
  const result = await loadComparisonWindow({
    runs: runs(),
    endMinutes: 120,
    windowHours: 100,
    fetchFrame: frames(COUNTS)
  });
  assert.equal(result.keys.startKey, null);
  assert.deepEqual(result.reference, { home: 6, places: { 10: 8, 20: 4 } });
  assert.deepEqual(result.primary, {
    home: 2,
    places: { 10: 2, 20: 4, 30: 6 }
  });
});

test('each run is asked for its own frames, with the primary run listing the places', async () => {
  const asked = [];
  const fetchFrame = async (simId, minutes) => {
    asked.push(`${simId}:${minutes}`);
    return { hinc: 0, pinc: [0, 0, 0] };
  };
  await loadComparisonWindow({
    runs: runs(),
    endMinutes: 360,
    windowHours: 3,
    fetchFrame
  });
  assert.deepEqual(asked.sort(), ['10:180', '10:360', '11:180', '11:360']);
});

test('windows that do not cover the same frames are not subtracted', async () => {
  // the reference run ends at hour 3, so "6 h ending at 6" snaps to hour 3 there
  const result = await loadComparisonWindow({
    runs: runs({}, { timesteps: [60, 120, 180] }),
    endMinutes: 360,
    windowHours: 2,
    fetchFrame: frames(COUNTS)
  });
  assert.equal(result, null);
});

test('a run whose frames do not line up with the places makes the pair unavailable', async () => {
  const fetchFrame = async (simId) => ({
    hinc: 0,
    pinc: simId === 10 ? [1, 2] : [1, 2, 3] // the reference lacks a place
  });
  const result = await loadComparisonWindow({
    runs: runs(),
    endMinutes: 360,
    windowHours: 3,
    fetchFrame
  });
  assert.equal(result, null);
});

test('the first failure is reported and cancels the other run', async () => {
  let otherSignal = null;
  const fetchFrame = (simId, _minutes, signal) => {
    if (simId === 10) return Promise.reject(new Error('HTTP 500'));
    otherSignal = signal;
    return new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () =>
        reject(new DOMException('Aborted', 'AbortError'))
      );
    });
  };
  await assert.rejects(
    loadComparisonWindow({
      runs: runs(),
      endMinutes: 360,
      windowHours: 3,
      fetchFrame
    }),
    /HTTP 500/
  );
  assert.equal(otherSignal.aborted, true);
});

test('an aborted caller is rejected, even when every frame is cached, and no listener is left', async () => {
  const fetchFrame = frames(COUNTS);
  const args = { runs: runs(), endMinutes: 360, windowHours: 3, fetchFrame };
  assert.ok(await loadComparisonWindow(args)); // warms the cache

  const caller = new AbortController();
  const pending = loadComparisonWindow({ ...args, signal: caller.signal });
  caller.abort(); // in the same tick as the cached frames resolve
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(getEventListeners(caller.signal, 'abort').length, 0);

  clearWindowFrameCache(); // so a request would really have to ask the server
  const already = new AbortController();
  already.abort();
  let called = false;
  await assert.rejects(
    loadComparisonWindow({
      ...args,
      signal: already.signal,
      fetchFrame: async () => {
        called = true;
        return { hinc: 0, pinc: [0, 0, 0] };
      }
    }),
    { name: 'AbortError' }
  );
  assert.equal(called, false);

  const ok = new AbortController();
  assert.ok(await loadComparisonWindow({ ...args, signal: ok.signal }));
  assert.equal(getEventListeners(ok.signal, 'abort').length, 0);
});

test('a pair that makes no sense resolves null without asking the server', async () => {
  let called = false;
  const fetchFrame = async () => {
    called = true;
    return { hinc: 0, pinc: [] };
  };
  const empty = {
    primary: run(11, 'p', { places: [] }),
    reference: run(10, 'r', { places: [] })
  };
  assert.equal(
    await loadComparisonWindow({
      runs: empty,
      endMinutes: 360,
      windowHours: 3,
      fetchFrame
    }),
    null
  );
  assert.equal(called, false);
});

test('the places are listed by the primary run', async () => {
  const seen = [];
  const reference = run(10, 'Baseline', {
    places: PLACES.map((place) => ({ ...place, id: `r${place.id}` }))
  });
  const result = await loadComparisonWindow({
    runs: { primary: run(11, 'With interventions'), reference },
    endMinutes: 360,
    windowHours: 3,
    fetchFrame: async (simId, minutes) => {
      seen.push(simId);
      return { hinc: 0, pinc: [minutes / 60, 0, 0] };
    }
  });
  assert.deepEqual(Object.keys(result.primary.places), ['10']);
  assert.deepEqual(Object.keys(result.reference.places), ['10']);
});

test('a primary run that cannot be read makes the pair unavailable, like a reference that cannot', async () => {
  const result = await loadComparisonWindow({
    runs: runs(),
    endMinutes: 360,
    windowHours: 3,
    fetchFrame: async (simId) => ({
      hinc: 0,
      pinc: simId === 11 ? [1, 2] : [1, 2, 3] // the primary lacks a place
    })
  });
  assert.equal(result, null);
});

test('a caller that aborts cancels the requests that are still pending', async () => {
  const signals = [];
  const fetchFrame = (_simId, _minutes, signal) => {
    signals.push(signal);
    return new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () =>
        reject(new DOMException('Aborted', 'AbortError'))
      );
    });
  };
  const caller = new AbortController();
  const pending = loadComparisonWindow({
    runs: runs(),
    endMinutes: 360,
    windowHours: 3,
    fetchFrame,
    signal: caller.signal
  });
  caller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  assert.ok(signals.length > 0);
  assert.ok(signals.every((signal) => signal.aborted));
});

test('an abort that lands after the frames arrived but before the answer is returned still rejects', async () => {
  // A signal that reads "not aborted" on the first look and "aborted" afterwards,
  // like a caller that gives up while the two windows are being combined.
  let reads = 0;
  const signal = new EventTarget();
  Object.defineProperty(signal, 'aborted', {
    get() {
      reads += 1;
      return reads > 1;
    }
  });
  await assert.rejects(
    loadComparisonWindow({
      runs: runs(),
      endMinutes: 360,
      windowHours: 3,
      fetchFrame: frames(COUNTS),
      signal
    }),
    { name: 'AbortError' }
  );
});

function frameResponse(minutes, hinc, pinc) {
  return new Response(
    JSON.stringify({
      data: {
        time: minutes,
        requested_time: minutes,
        simdata: { [minutes]: { h: [], p: [], hinc, pinc } }
      }
    }),
    { status: 200, headers: { 'content-type': 'application/json' } }
  );
}

test('fetchComparisonFrame asks the server for the exact frame and never uses the browser cache', async () => {
  const seen = [];
  const controller = new AbortController();
  const fetchImpl = async (url, init) => {
    seen.push({ url: String(url), cache: init.cache, signal: init.signal });
    return frameResponse(360, 4, [1, 2, 3]);
  };
  const frame = await fetchComparisonFrame(
    7,
    360,
    controller.signal,
    fetchImpl,
    'http://localhost:3000'
  );
  assert.deepEqual(frame, { hinc: 4, pinc: [1, 2, 3] });
  assert.deepEqual(
    seen.map((entry) => [entry.url, entry.cache]),
    [['http://localhost:3000/api/simdata/7/map?time=360', 'no-store']]
  );
  assert.equal(seen[0].signal, controller.signal);
});

test('by default a comparison loads its frames with the browser cache bypassed', async () => {
  const realFetch = globalThis.fetch;
  const hadWindow = 'window' in globalThis;
  const realWindow = globalThis.window;
  const caches = [];
  globalThis.window = { location: { origin: 'http://localhost:3000' } };
  globalThis.fetch = async (url, init) => {
    caches.push(init.cache);
    return frameResponse(
      Number(new URL(url).searchParams.get('time')),
      0,
      [0, 0, 0]
    );
  };
  try {
    const result = await loadComparisonWindow({
      runs: runs(),
      endMinutes: 360,
      windowHours: 3
    });
    assert.ok(result);
    assert.equal(caches.length, 4); // two frames for each of the two runs
    assert.ok(caches.every((cache) => cache === 'no-store'));
  } finally {
    globalThis.fetch = realFetch;
    if (hadWindow) globalThis.window = realWindow;
    else delete globalThis.window;
  }
});

test('forgetComparisonFrames drops the frames of both runs of a pair, and only those', async () => {
  const asked = [];
  const fetchFrame = async (simId, minutes) => {
    asked.push(`${simId}:${minutes}`);
    return { hinc: 0, pinc: [0, 0, 0] };
  };
  const pair = () =>
    loadComparisonWindow({
      runs: runs(),
      endMinutes: 360,
      windowHours: 3,
      fetchFrame
    });
  const unrelated = () =>
    loadWindowIncidence({
      simId: 1,
      timesteps: HOURLY,
      placeIds: ['10', '20', '30'],
      endMinutes: 360,
      windowHours: 3,
      fetchFrame
    });
  await Promise.all([pair(), unrelated()]);
  assert.equal(asked.length, 6);

  asked.length = 0;
  await Promise.all([pair(), unrelated()]);
  assert.equal(asked.length, 0); // everything came from the page's memory

  // a new description of the same two runs (for example handed in as a prop)
  forgetComparisonFrames(runs());
  await Promise.all([pair(), unrelated()]);
  // the pair asks the server again; the unrelated run 1 (and 11 vs 1) keeps its frames
  assert.deepEqual(asked.sort(), ['10:180', '10:360', '11:180', '11:360']);
});

test('a pair whose counts cannot be added up exactly is unavailable, not rounded', async () => {
  const MAX = Number.MAX_SAFE_INTEGER;
  const big = (last) => async (_simId, minutes) => ({
    hinc: 0,
    pinc: minutes === 180 ? [0, 0, 0] : last
  });
  const load = (fetchFrame) =>
    loadComparisonWindow({
      runs: runs(),
      endMinutes: 360,
      windowHours: 3,
      fetchFrame
    });
  // each count is fine on its own, but 10 and 20 together are not
  assert.equal(await load(big([MAX, 1, 0])), null);
  // the same size of count that still adds up exactly is shown
  clearWindowFrameCache(); // the first load left its frames in the page's memory
  const ok = await load(big([MAX, 0, 0]));
  assert.equal(ok.primary.places['10'], MAX);
  assert.equal(ok.reference.places['10'], MAX);
});

test('either run alone having counts that cannot be added up exactly makes the pair unavailable', async () => {
  const MAX = Number.MAX_SAFE_INTEGER;
  const load = (hugeSimId) =>
    loadComparisonWindow({
      runs: runs(),
      endMinutes: 360,
      windowHours: 3,
      fetchFrame: async (simId, minutes) => ({
        hinc: 0,
        pinc:
          minutes === 180
            ? [0, 0, 0]
            : simId === hugeSimId
              ? [MAX, 1, 0]
              : [1, 1, 1]
      })
    });
  assert.equal(await load(10), null); // only the reference (baseline) is huge
  clearWindowFrameCache();
  assert.equal(await load(11), null); // only the primary is huge
  clearWindowFrameCache();
  assert.ok(await load(99)); // neither
});
