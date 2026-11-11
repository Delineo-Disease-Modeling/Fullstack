import assert from 'node:assert/strict';
import { getEventListeners } from 'node:events';
import { test } from 'node:test';

const { DAILY_CONCURRENCY, fetchFreshFrame, loadDailyIncidence } = await import(
  './daily-incidence-client.ts'
);

const IDS = ['a', 'b', 'c'];

function grid(first, last) {
  const out = [];
  for (let hour = first; hour <= last; hour += 1) out.push(hour * 60);
  return out;
}

// A run whose place `a` gets 1 new infection every hour, `b` 2 every 2nd hour,
// and home 1 every hour: cumulative counts are easy to work out by hand.
function cumulative(minutes) {
  const hour = minutes / 60;
  return { hinc: hour, pinc: [hour, 2 * Math.floor(hour / 2), 0] };
}

function wholeRunAt(lastHour) {
  const end = cumulative(lastHour * 60);
  return { home: end.hinc, places: { a: end.pinc[0], b: end.pinc[1] } };
}

function tracker(frameFor = cumulative) {
  const state = { asked: [], inFlight: 0, maxInFlight: 0, signals: [] };
  const fetchFrame = async (simId, minutes, signal) => {
    state.asked.push(`${simId}:${minutes}`);
    state.signals.push(signal);
    state.inFlight += 1;
    state.maxInFlight = Math.max(state.maxInFlight, state.inFlight);
    await new Promise((resolve) => setTimeout(resolve, 1));
    state.inFlight -= 1;
    return frameFor(minutes);
  };
  return { fetchFrame, state };
}

test('loads one frame per day end, the last one first, and adds the days up', async () => {
  const { fetchFrame, state } = tracker();
  const progress = [];
  const result = await loadDailyIncidence({
    simId: 7,
    timesteps: grid(1, 120),
    placeIds: IDS,
    wholeRun: wholeRunAt(120),
    fetchFrame,
    onProgress: (done, total) => progress.push([done, total])
  });
  assert.equal(result.ok, true);
  assert.equal(state.asked[0], '7:7200'); // hour 120, the last day end
  assert.deepEqual(
    [...state.asked].sort(),
    ['7:1440', '7:2880', '7:4320', '7:5760', '7:7200'].sort()
  );
  const { days, columns } = result.daily;
  assert.equal(columns.length, 5);
  assert.deepEqual(
    days.map((d) => d.home),
    [24, 24, 24, 24, 24]
  );
  assert.deepEqual(
    days.map((d) => d.places.a),
    [24, 24, 24, 24, 24]
  );
  assert.deepEqual(
    days.map((d) => d.places.b),
    [24, 24, 24, 24, 24]
  );
  assert.deepEqual(
    progress.map((p) => p[0]),
    [1, 2, 3, 4, 5]
  );
  assert.ok(progress.every((p) => p[1] === 5));
  assert.equal(
    state.signals.every((s) => s && typeof s.aborted === 'boolean'),
    true
  );
});

test('never has more than the allowed number of requests in flight', async () => {
  const { fetchFrame, state } = tracker();
  const result = await loadDailyIncidence({
    simId: 1,
    timesteps: grid(1, 24 * 30),
    placeIds: IDS,
    wholeRun: wholeRunAt(24 * 30),
    fetchFrame
  });
  assert.equal(result.ok, true);
  assert.equal(state.asked.length, 30); // one request per day, no more
  assert.ok(state.maxInFlight <= DAILY_CONCURRENCY, `${state.maxInFlight}`);
  assert.ok(state.maxInFlight >= 2); // and it does use the pool
  assert.equal(DAILY_CONCURRENCY, 4);
});

test('frames are placed by day, not by the order they arrive in', async () => {
  const delays = { 1440: 30, 2880: 20, 4320: 10, 5760: 1 };
  const fetchFrame = async (_simId, minutes) => {
    await new Promise((resolve) => setTimeout(resolve, delays[minutes] ?? 1));
    return cumulative(minutes);
  };
  const result = await loadDailyIncidence({
    simId: 1,
    timesteps: grid(1, 96),
    placeIds: IDS,
    wholeRun: wholeRunAt(96),
    fetchFrame,
    concurrency: 4
  });
  assert.equal(result.ok, true);
  assert.deepEqual(
    result.daily.days.map((d) => d.home),
    [24, 24, 24, 24]
  );
});

test('a run that cannot be shown by day is reported with no download at all', async () => {
  let called = false;
  const fetchFrame = async () => {
    called = true;
    return cumulative(60);
  };
  const run = (timesteps, placeIds = IDS) =>
    loadDailyIncidence({
      simId: 1,
      timesteps,
      placeIds,
      wholeRun: wholeRunAt(24),
      fetchFrame
    });
  assert.deepEqual(await run(null), { ok: false, reason: 'no-grid' });
  assert.deepEqual(await run([60, 120, 240]), { ok: false, reason: 'no-grid' });
  assert.deepEqual(await run(grid(25, 100)), {
    ok: false,
    reason: 'starts-late'
  });
  assert.deepEqual(await run(grid(1, 2401)), { ok: false, reason: 'too-long' });
  assert.deepEqual(await run(grid(1, 48), []), {
    ok: false,
    reason: 'bad-places'
  });
  assert.deepEqual(await run(grid(1, 48), ['a', 'a']), {
    ok: false,
    reason: 'bad-places'
  });
  assert.deepEqual(await run(grid(1, 48), ['a', '']), {
    ok: false,
    reason: 'bad-places'
  });
  assert.equal(called, false);
});

test('a last frame that cannot be used stops the load after one request', async () => {
  const { fetchFrame, state } = tracker(() => ({ hinc: 5, pinc: [] })); // home only
  const result = await loadDailyIncidence({
    simId: 1,
    timesteps: grid(1, 24 * 20),
    placeIds: IDS,
    wholeRun: wholeRunAt(24 * 20),
    fetchFrame
  });
  assert.deepEqual(result, { ok: false, reason: 'bad-frames' });
  assert.equal(state.asked.length, 1);
});

test('frames that do not add up are reported, not shown', async () => {
  const { fetchFrame } = tracker();
  const wrong = { home: 1, places: { a: 1 } };
  const result = await loadDailyIncidence({
    simId: 1,
    timesteps: grid(1, 48),
    placeIds: IDS,
    wholeRun: wrong,
    fetchFrame
  });
  assert.deepEqual(result, { ok: false, reason: 'mismatch' });
  // a count that goes down between two day ends
  const down = await loadDailyIncidence({
    simId: 1,
    timesteps: grid(1, 48),
    placeIds: IDS,
    wholeRun: wholeRunAt(48),
    fetchFrame: async (_s, minutes) =>
      minutes === 1440 ? { hinc: 24, pinc: [50, 0, 0] } : cumulative(minutes)
  });
  assert.deepEqual(down, { ok: false, reason: 'decreasing' });
});

test('the first real error is reported, queued requests stop and the others are cancelled', async () => {
  const asked = [];
  const signals = [];
  const fetchFrame = (_simId, minutes, signal) => {
    asked.push(minutes);
    signals.push(signal);
    if (minutes === 24 * 60 * 3) return Promise.reject(new Error('HTTP 500'));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => resolve(cumulative(minutes)), 30);
      signal.addEventListener('abort', () => {
        clearTimeout(timer);
        reject(new DOMException('Aborted', 'AbortError'));
      });
    });
  };
  await assert.rejects(
    loadDailyIncidence({
      simId: 1,
      timesteps: grid(1, 24 * 40),
      placeIds: IDS,
      wholeRun: wholeRunAt(24 * 40),
      fetchFrame,
      concurrency: 2
    }),
    /HTTP 500/
  );
  assert.ok(asked.length < 40, `asked ${asked.length} of 40 frames`);
  assert.ok(signals.every((s) => s.aborted));
});

test('an aborted caller is rejected, even when every answer had arrived, and no listener is left', async () => {
  const caller = new AbortController();
  const { fetchFrame } = tracker();
  const pending = loadDailyIncidence({
    simId: 1,
    timesteps: grid(1, 48),
    placeIds: IDS,
    wholeRun: wholeRunAt(48),
    fetchFrame,
    signal: caller.signal
  });
  caller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(getEventListeners(caller.signal, 'abort').length, 0);

  const already = new AbortController();
  already.abort();
  let called = false;
  await assert.rejects(
    loadDailyIncidence({
      simId: 1,
      timesteps: grid(1, 48),
      placeIds: IDS,
      wholeRun: wholeRunAt(48),
      signal: already.signal,
      fetchFrame: async () => {
        called = true;
        return cumulative(60);
      }
    }),
    { name: 'AbortError' }
  );
  assert.equal(called, false);

  const ok = new AbortController();
  const result = await loadDailyIncidence({
    simId: 1,
    timesteps: grid(1, 48),
    placeIds: IDS,
    wholeRun: wholeRunAt(48),
    fetchFrame,
    signal: ok.signal
  });
  assert.equal(result.ok, true);
  assert.equal(getEventListeners(ok.signal, 'abort').length, 0);
});

test('a fetcher that ignores the abort signal cannot keep the load waiting', async () => {
  const caller = new AbortController();
  const fetchFrame = () => new Promise(() => {}); // never answers, ignores abort
  const pending = loadDailyIncidence({
    simId: 1,
    timesteps: grid(1, 48),
    placeIds: IDS,
    wholeRun: wholeRunAt(48),
    fetchFrame,
    signal: caller.signal
  });
  setTimeout(() => caller.abort(), 5);
  await assert.rejects(pending, { name: 'AbortError' });
});

test('the deadline ends a load that never finishes, with a plain message', async () => {
  const signals = [];
  const fetchFrame = (_s, _m, signal) => {
    signals.push(signal);
    return new Promise(() => {});
  };
  await assert.rejects(
    loadDailyIncidence({
      simId: 1,
      timesteps: grid(1, 48),
      placeIds: IDS,
      wholeRun: wholeRunAt(48),
      fetchFrame,
      deadlineMs: 20
    }),
    /took too long/
  );
  assert.ok(signals.every((s) => s.aborted));
});

test('late answers after a failure do not write into the result or the progress', async () => {
  const progress = [];
  let release;
  const slow = new Promise((resolve) => {
    release = resolve;
  });
  const fetchFrame = async (_s, minutes) => {
    if (minutes === 24 * 60 * 5) return cumulative(minutes); // the last day, first
    if (minutes === 24 * 60 * 2) throw new Error('boom');
    await slow; // ignores abort, answers after the failure
    return cumulative(minutes);
  };
  const pending = loadDailyIncidence({
    simId: 1,
    timesteps: grid(1, 24 * 5),
    placeIds: IDS,
    wholeRun: wholeRunAt(24 * 5),
    fetchFrame,
    concurrency: 4,
    onProgress: (done) => progress.push(done)
  });
  await assert.rejects(pending, /boom/);
  const before = progress.length;
  release();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(progress.length, before);
});

test('a caller that gives up just as the last frame arrives is still rejected', async () => {
  const caller = new AbortController();
  const { fetchFrame } = tracker();
  await assert.rejects(
    loadDailyIncidence({
      simId: 1,
      timesteps: grid(1, 48),
      placeIds: IDS,
      wholeRun: wholeRunAt(48),
      fetchFrame,
      signal: caller.signal,
      onProgress: (done, total) => {
        if (done === total) caller.abort(); // every answer is already in
      }
    }),
    { name: 'AbortError' }
  );
});

test('a concurrency of zero still loads, one request at a time', async () => {
  const { fetchFrame, state } = tracker();
  const result = await loadDailyIncidence({
    simId: 1,
    timesteps: grid(1, 96),
    placeIds: IDS,
    wholeRun: wholeRunAt(96),
    fetchFrame,
    concurrency: 0
  });
  assert.equal(result.ok, true);
  assert.equal(state.maxInFlight, 1);
});

test('a caller that gives up between the first frame and the rest is rejected, even if the fetcher ignores abort', async () => {
  const caller = new AbortController();
  let calls = 0;
  const fetchFrame = (_simId, minutes) => {
    calls += 1;
    // the last day answers; the others never do and ignore the signal
    return minutes === 24 * 60 * 4
      ? Promise.resolve(cumulative(minutes))
      : new Promise(() => {});
  };
  await assert.rejects(
    loadDailyIncidence({
      simId: 1,
      timesteps: grid(1, 96),
      placeIds: IDS,
      wholeRun: wholeRunAt(96),
      fetchFrame,
      signal: caller.signal,
      onProgress: (done) => {
        if (done === 1) caller.abort();
      }
    }),
    { name: 'AbortError' }
  );
  assert.ok(calls >= 1);
});

test('a run whose last frame already disagrees with the whole-run numbers costs one request', async () => {
  const { fetchFrame, state } = tracker();
  // 100 days; the page says place a had 1 more infection than the frames show
  const wrong = { home: 2400, places: { a: 2401, b: 2400 } };
  const result = await loadDailyIncidence({
    simId: 1,
    timesteps: grid(1, 2400),
    placeIds: IDS,
    wholeRun: wrong,
    fetchFrame
  });
  assert.deepEqual(result, { ok: false, reason: 'mismatch' });
  assert.equal(state.asked.length, 1);
});

test('the early check does not refuse a run that starts from an hour-0 frame', async () => {
  // counters are 3 at hour 0 and 8 at hour 48: the days add up to 5, which is
  // what the page shows, although the last frame alone says 8
  const frames = { 0: [3, 0, 0], 1440: [6, 0, 0], 2880: [8, 0, 0] };
  const result = await loadDailyIncidence({
    simId: 1,
    timesteps: grid(0, 48),
    placeIds: IDS,
    wholeRun: { home: 0, places: { a: 5 } },
    fetchFrame: async (_s, minutes) => ({ hinc: 0, pinc: frames[minutes] })
  });
  assert.equal(result.ok, true);
  assert.deepEqual(
    result.daily.days.map((d) => d.places.a),
    [3, 2]
  );
});

test('a caller that gives up after the first frame starts no further request, and nothing is left unhandled', async () => {
  const unhandled = [];
  const onUnhandled = (reason) => unhandled.push(reason);
  process.on('unhandledRejection', onUnhandled);
  try {
    const caller = new AbortController();
    let calls = 0;
    // like a real fetch: an already cancelled signal rejects at once
    const fetchFrame = (_simId, minutes, signal) => {
      calls += 1;
      return signal.aborted
        ? Promise.reject(new DOMException('Aborted', 'AbortError'))
        : Promise.resolve(cumulative(minutes));
    };
    await assert.rejects(
      loadDailyIncidence({
        simId: 1,
        timesteps: grid(1, 96),
        placeIds: IDS,
        wholeRun: wholeRunAt(96),
        fetchFrame,
        signal: caller.signal,
        onProgress: () => caller.abort()
      }),
      { name: 'AbortError' }
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(calls, 1);
    assert.deepEqual(unhandled, []);
  } finally {
    process.off('unhandledRejection', onUnhandled);
  }
});

test('a caller that gives up while the first frame is reported is rejected even when that frame ends the load early', async () => {
  const run = async (finalFrame, wholeRun) => {
    const caller = new AbortController();
    await assert.rejects(
      loadDailyIncidence({
        simId: 1,
        timesteps: grid(1, 48),
        placeIds: IDS,
        wholeRun,
        fetchFrame: async () => finalFrame,
        signal: caller.signal,
        onProgress: () => caller.abort()
      }),
      { name: 'AbortError' }
    );
  };
  // the last frame disagrees with the whole-run numbers: would resolve 'mismatch'
  await run({ hinc: 0, pinc: [2, 0, 0] }, { home: 0, places: { a: 3 } });
  // the last frame cannot be used: would resolve 'bad-frames'
  await run({ hinc: 0, pinc: [2, 0] }, { home: 0, places: { a: 2 } });
});

test('a fetcher that cancels the caller and then returns a rejected promise leaves nothing unhandled', async () => {
  const unhandled = [];
  const onUnhandled = (reason) => unhandled.push(reason);
  process.on('unhandledRejection', onUnhandled);
  try {
    const caller = new AbortController();
    const fetchFrame = () => {
      caller.abort(); // the cancel lands while the request is being made
      return Promise.reject(new DOMException('Aborted', 'AbortError'));
    };
    await assert.rejects(
      loadDailyIncidence({
        simId: 1,
        timesteps: grid(1, 48),
        placeIds: IDS,
        wholeRun: wholeRunAt(48),
        fetchFrame,
        signal: caller.signal
      }),
      { name: 'AbortError' }
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.deepEqual(unhandled, []);
  } finally {
    process.off('unhandledRejection', onUnhandled);
  }
});

test('an answer that is delivered just as the caller cancels is not recorded or reported', async () => {
  const caller = new AbortController();
  const progress = [];
  // the answer is ready, then the cancel lands before the load continues
  const fetchFrame = (_simId, minutes) => {
    const answer = Promise.resolve(cumulative(minutes));
    answer.then(() => {}).then(() => caller.abort());
    return answer;
  };
  await assert.rejects(
    loadDailyIncidence({
      simId: 1,
      timesteps: grid(1, 48),
      placeIds: IDS,
      wholeRun: wholeRunAt(48),
      fetchFrame,
      signal: caller.signal,
      onProgress: (done) => progress.push(done)
    }),
    { name: 'AbortError' }
  );
  assert.deepEqual(progress, []);
});

// -------------------------------------------------------- fetchFreshFrame

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

test('fetchFreshFrame asks the server for the exact frame and never uses the browser cache', async () => {
  const seen = [];
  const controller = new AbortController();
  const frame = await fetchFreshFrame(
    7,
    1440,
    controller.signal,
    async (url, init) => {
      seen.push({ url: String(url), cache: init.cache, signal: init.signal });
      return frameResponse(1440, 4, [1, 2, 3]);
    },
    'http://localhost:3000'
  );
  assert.deepEqual(frame, { hinc: 4, pinc: [1, 2, 3] });
  assert.deepEqual(
    seen.map((s) => [s.url, s.cache]),
    [['http://localhost:3000/api/simdata/7/map?time=1440', 'no-store']]
  );
  assert.equal(seen[0].signal, controller.signal);
});

test('fetchFreshFrame refuses the nearest frame the server substitutes for a missing one', async () => {
  await assert.rejects(
    fetchFreshFrame(
      7,
      1440,
      undefined,
      async () => frameResponse(1380, 0, [0, 0, 0]), // asked for 1440, got 1380
      'http://localhost:3000'
    ),
    /unexpected map frame/
  );
  await assert.rejects(
    fetchFreshFrame(
      7,
      1440,
      undefined,
      async () => new Response('{}', { status: 202 }),
      'http://localhost:3000'
    ),
    /still being processed/
  );
});

test('by default the days are loaded with the browser cache bypassed', async () => {
  const realFetch = globalThis.fetch;
  const hadWindow = 'window' in globalThis;
  const realWindow = globalThis.window;
  const caches = [];
  globalThis.window = { location: { origin: 'http://localhost:3000' } };
  globalThis.fetch = async (url, init) => {
    caches.push(init.cache);
    const minutes = Number(new URL(url).searchParams.get('time'));
    const frame = cumulative(minutes);
    return frameResponse(minutes, frame.hinc, frame.pinc);
  };
  try {
    const result = await loadDailyIncidence({
      simId: 1,
      timesteps: grid(1, 72),
      placeIds: IDS,
      wholeRun: wholeRunAt(72)
    });
    assert.equal(result.ok, true);
    assert.equal(caches.length, 3);
    assert.ok(caches.every((cache) => cache === 'no-store'));
  } finally {
    globalThis.fetch = realFetch;
    if (hadWindow) globalThis.window = realWindow;
    else delete globalThis.window;
  }
});

test('the timesteps and place lists given are not changed', async () => {
  const { fetchFrame } = tracker();
  const timesteps = grid(1, 48);
  const placeIds = [...IDS];
  const copyT = [...timesteps];
  const copyP = [...placeIds];
  await loadDailyIncidence({
    simId: 1,
    timesteps,
    placeIds,
    wholeRun: wholeRunAt(48),
    fetchFrame
  });
  assert.deepEqual(timesteps, copyT);
  assert.deepEqual(placeIds, copyP);
});
