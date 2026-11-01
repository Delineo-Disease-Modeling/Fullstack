import assert from 'node:assert/strict';
import { getEventListeners } from 'node:events';
import { beforeEach, test } from 'node:test';

const {
  clearWindowFrameCache,
  FRAME_CACHE_LIMIT,
  fetchIncidenceFrame,
  forgetRunFrames,
  loadWindowIncidence
} = await import('./window-incidence-client.ts');

const ORIGIN = 'http://localhost:3000';
const PLACES = ['10', '20', '30'];
const HOURLY = [60, 120, 180, 240, 300, 360];

beforeEach(() => {
  clearWindowFrameCache();
});

function frameBody(minutes, { hinc = 0, pinc = [0, 0, 0] } = {}) {
  return {
    data: {
      time: minutes,
      requested_time: minutes,
      simdata: { [minutes]: { h: [1, 0], p: [1, 0], hinc, pinc } }
    }
  };
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

// A fake server: serves the frames it is given for the exact time, and logs
// every request so tests can count them.
function makeFetch(frames) {
  const calls = [];
  const impl = async (url) => {
    const minutes = Number(new URL(url).searchParams.get('time'));
    calls.push(String(url));
    const frame = frames[minutes];
    return frame
      ? json(frameBody(minutes, frame))
      : json({ message: 'no' }, 404);
  };
  return { impl, calls };
}

test('fetchIncidenceFrame asks for the exact frame and keeps only the incidence fields', async () => {
  const { impl, calls } = makeFetch({ 360: { hinc: 4, pinc: [1, 2, 3] } });
  const frame = await fetchIncidenceFrame(7, 360, undefined, impl, ORIGIN);
  assert.deepEqual(calls, ['http://localhost:3000/api/simdata/7/map?time=360']);
  assert.deepEqual(frame, { hinc: 4, pinc: [1, 2, 3] });
});

test('fetchIncidenceFrame treats a 202 as an error, not as a frame', async () => {
  const impl = async () => json({ processing: true, progress: 10 }, 202);
  await assert.rejects(
    fetchIncidenceFrame(7, 360, undefined, impl, ORIGIN),
    /still being processed/
  );
});

test('fetchIncidenceFrame surfaces the server message, and survives a non-JSON error body', async () => {
  await assert.rejects(
    fetchIncidenceFrame(
      7,
      360,
      undefined,
      async () => json({ message: 'Invalid time' }, 400),
      ORIGIN
    ),
    /Invalid time/
  );
  await assert.rejects(
    fetchIncidenceFrame(
      7,
      360,
      undefined,
      async () => new Response('<html>bad gateway</html>', { status: 502 }),
      ORIGIN
    ),
    /\(502\)/
  );
  // a 200 that is not JSON at all
  await assert.rejects(
    fetchIncidenceFrame(
      7,
      360,
      undefined,
      async () => new Response('oops', { status: 200 }),
      ORIGIN
    ),
    /unexpected map frame/
  );
});

test('fetchIncidenceFrame refuses a nearest-frame substitute', async () => {
  // The real endpoint answers with the nearest frame; asking for 360 and
  // getting 300 would silently shift the window.
  const impl = async () => json(frameBody(300, { pinc: [1, 1, 1] }));
  await assert.rejects(
    fetchIncidenceFrame(7, 360, undefined, impl, ORIGIN),
    /unexpected map frame/
  );
});

test('fetchIncidenceFrame rejects malformed bodies', async () => {
  for (const body of [
    null,
    [],
    { data: null },
    { data: { time: 360 } },
    { data: { time: 360, simdata: {} } },
    { data: { time: 360, simdata: { 360: null } } },
    { data: { time: 360, simdata: { 360: [1, 2] } } },
    { data: { time: 'x', simdata: { x: {} } } }
  ]) {
    await assert.rejects(
      fetchIncidenceFrame(7, 360, undefined, async () => json(body), ORIGIN),
      /unexpected map frame/,
      JSON.stringify(body)
    );
  }
});

test('fetchIncidenceFrame does not call the network when already aborted', async () => {
  const controller = new AbortController();
  controller.abort();
  let called = false;
  const impl = async () => {
    called = true;
    return json(frameBody(360));
  };
  await assert.rejects(
    fetchIncidenceFrame(7, 360, controller.signal, impl, ORIGIN),
    { name: 'AbortError' }
  );
  assert.equal(called, false);
});

function serverFor(ids = PLACES) {
  const frames = {};
  HOURLY.forEach((minutes, index) => {
    frames[minutes] = {
      hinc: index,
      pinc: ids.map((_, place) => index * (place + 1))
    };
  });
  return makeFetch(frames);
}

function loaderFor(server, overrides = {}) {
  return loadWindowIncidence({
    simId: 7,
    timesteps: HOURLY,
    placeIds: PLACES,
    endMinutes: 360,
    windowHours: 3,
    fetchFrame: (simId, minutes, signal) =>
      fetchIncidenceFrame(simId, minutes, signal, server.impl, ORIGIN),
    ...overrides
  });
}

test('loadWindowIncidence combines the end frame and the frame W hours earlier', async () => {
  const server = serverFor();
  const result = await loaderFor(server);
  // end 360 = index 5, start 180 = index 2; place k grows by (5-2)*(k+1)
  assert.deepEqual(result.keys, {
    endKey: 360,
    startKey: 180,
    coveredMinutes: 180
  });
  assert.equal(result.incidence.home, 3);
  assert.deepEqual(Object.entries(result.incidence.places), [
    ['10', 3],
    ['20', 6],
    ['30', 9]
  ]);
  assert.equal(server.calls.length, 2);
});

test('loadWindowIncidence downloads only the end frame when the window starts before the run', async () => {
  const server = serverFor();
  const result = await loaderFor(server, { endMinutes: 120, windowHours: 24 });
  assert.equal(result.keys.startKey, null);
  assert.equal(server.calls.length, 1);
  assert.equal(result.incidence.home, 1); // frame 120 has hinc 1, baseline 0
});

test('loadWindowIncidence requests both frames before waiting for either', async () => {
  const pending = [];
  const fetchFrame = (_simId, minutes) =>
    new Promise((resolve) => {
      pending.push({ minutes, resolve });
    });
  const run = loaderFor(null, { fetchFrame });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(pending.map((entry) => entry.minutes).sort(), [180, 360]);
  for (const entry of pending) {
    entry.resolve({ hinc: 0, pinc: [0, 0, 0] });
  }
  assert.ok(await run);
});

test('loadWindowIncidence reuses frames it already has', async () => {
  const server = serverFor();
  await loaderFor(server); // 360 and 180
  assert.equal(server.calls.length, 2);
  await loaderFor(server); // identical window: nothing new
  assert.equal(server.calls.length, 2);
  await loaderFor(server, { windowHours: 4 }); // shares 360, needs 120
  assert.equal(server.calls.length, 3);
});

test('loadWindowIncidence keeps frames of different runs apart', async () => {
  const server = serverFor();
  await loaderFor(server, { simId: 7 });
  await loaderFor(server, { simId: 8 });
  assert.equal(server.calls.length, 4);
  assert.ok(server.calls[2].includes('/api/simdata/8/map'));
});

test('loadWindowIncidence evicts the least recently used frames', async () => {
  const frames = {};
  const steps = Array.from({ length: 40 }, (_, k) => (k + 1) * 60);
  for (const minutes of steps) frames[minutes] = { hinc: 0, pinc: [0, 0, 0] };
  const server = makeFetch(frames);
  const load = (endMinutes) =>
    loaderFor(server, { timesteps: steps, endMinutes, windowHours: 1 });

  for (const minutes of steps) await load(minutes);
  const before = server.calls.length;
  await load(steps[steps.length - 1]); // most recent: still cached
  assert.equal(server.calls.length, before);
  await load(steps[1]); // long evicted: fetched again
  assert.ok(server.calls.length > before);
});

test('loadWindowIncidence does not cache a failed request', async () => {
  let fail = true;
  const calls = [];
  const fetchFrame = async (_simId, minutes) => {
    calls.push(minutes);
    if (fail) throw new Error('boom');
    return { hinc: 0, pinc: [1, 1, 1] };
  };
  await assert.rejects(loaderFor(null, { fetchFrame }), /boom/);
  fail = false;
  const result = await loaderFor(null, { fetchFrame });
  assert.ok(result);
  assert.ok(calls.length > 2);
});

test('loadWindowIncidence stops when aborted and leaves nothing cached', async () => {
  const controller = new AbortController();
  let calls = 0;
  const hanging = (_simId, _minutes, signal) =>
    new Promise((_resolve, reject) => {
      calls += 1;
      signal?.addEventListener('abort', () =>
        reject(new DOMException('Aborted', 'AbortError'))
      );
    });
  const run = loaderFor(null, {
    fetchFrame: hanging,
    signal: controller.signal
  });
  controller.abort();
  await assert.rejects(run, { name: 'AbortError' });
  assert.equal(calls, 2);

  const server = serverFor();
  await loaderFor(server);
  assert.equal(server.calls.length, 2); // nothing was cached by the aborted run
});

test('loadWindowIncidence resolves null for a run without incidence data', async () => {
  const fetchFrame = async () => ({ hinc: undefined, pinc: undefined });
  assert.equal(await loaderFor(null, { fetchFrame }), null);
  // the shape the processor writes when only hinc exists
  const hincOnly = async () => ({ hinc: 4, pinc: [] });
  assert.equal(await loaderFor(null, { fetchFrame: hincOnly }), null);
});

test('loadWindowIncidence resolves null, without downloading, when no window can be built', async () => {
  const server = serverFor();
  for (const overrides of [
    { simId: 0 },
    { simId: -1 },
    { simId: 1.5 },
    { simId: Number.NaN },
    { timesteps: null },
    { timesteps: [] },
    { placeIds: [] },
    { endMinutes: Number.NaN },
    { windowHours: 0 }
  ]) {
    assert.equal(
      await loaderFor(server, overrides),
      null,
      JSON.stringify(overrides)
    );
  }
  assert.equal(server.calls.length, 0);
});

test('loadWindowIncidence resolves null when the frames do not line up with the places', async () => {
  const server = serverFor();
  assert.equal(await loaderFor(server, { placeIds: ['10', '20'] }), null);
});

test('fetchIncidenceFrame hands the abort signal to fetch, so an abort cancels the download', async () => {
  const controller = new AbortController();
  let received;
  const impl = async (_url, init) => {
    received = init?.signal;
    return json(frameBody(360, { pinc: [1, 2, 3] }));
  };
  await fetchIncidenceFrame(7, 360, controller.signal, impl, ORIGIN);
  assert.equal(received, controller.signal);
});

test('loadWindowIncidence evicts the least recently USED frame, not the oldest inserted one', async () => {
  const steps = Array.from(
    { length: FRAME_CACHE_LIMIT + 2 },
    (_, index) => (index + 1) * 60
  );
  const frames = Object.fromEntries(
    steps.map((minutes) => [minutes, { hinc: 0, pinc: [0, 0, 0] }])
  );
  const server = makeFetch(frames);
  // A window far longer than the run needs only the end frame: one frame a load.
  const load = (endMinutes) =>
    loaderFor(server, { timesteps: steps, endMinutes, windowHours: 100000 });

  for (const minutes of steps.slice(0, FRAME_CACHE_LIMIT)) await load(minutes);
  assert.equal(server.calls.length, FRAME_CACHE_LIMIT); // cache is exactly full

  await load(steps[0]); // touch the oldest: it is now the most recently used
  assert.equal(server.calls.length, FRAME_CACHE_LIMIT);

  await load(steps[FRAME_CACHE_LIMIT]); // a new frame: one entry must go
  assert.equal(server.calls.length, FRAME_CACHE_LIMIT + 1);

  await load(steps[0]); // survived, because it was used recently
  assert.equal(server.calls.length, FRAME_CACHE_LIMIT + 1);

  await load(steps[1]); // the least recently used one was evicted
  assert.equal(server.calls.length, FRAME_CACHE_LIMIT + 2);
});

test('loadWindowIncidence does not remember a frame that has no incidence', async () => {
  let healthy = false;
  const calls = [];
  const fetchFrame = async (_simId, minutes) => {
    calls.push(minutes);
    return healthy
      ? { hinc: 1, pinc: [1, 1, 1] }
      : { hinc: undefined, pinc: undefined };
  };
  assert.equal(await loaderFor(null, { fetchFrame }), null);
  assert.equal(calls.length, 2);

  // The server recovers: the next request must ask again, not reuse the bad frame.
  healthy = true;
  const result = await loaderFor(null, { fetchFrame });
  assert.ok(result);
  assert.equal(calls.length, 4);

  // Good frames are remembered as before.
  await loaderFor(null, { fetchFrame });
  assert.equal(calls.length, 4);
});

test('loadWindowIncidence asks the server again after frames that could not be used', async () => {
  // a corrupt (but array-shaped) frame must not be remembered
  const frames = [
    { hinc: 0, pinc: [10, 'bad'] },
    { hinc: 0, pinc: [10, 12] }
  ];
  let calls = 0;
  const fetchFrame = async () => {
    calls += 1;
    return calls <= 1 ? frames[0] : frames[1];
  };
  const args = {
    simId: 7,
    timesteps: [60, 120, 180],
    placeIds: ['a', 'b'],
    endMinutes: 180,
    windowHours: 1000,
    fetchFrame
  };
  assert.equal(await loadWindowIncidence(args), null);
  const second = await loadWindowIncidence(args);
  assert.ok(second, 'a corrected server answer must be picked up');
  assert.equal(second.incidence.places.b, 12);
  assert.equal(calls, 2);

  // once usable, the frame is remembered again
  await loadWindowIncidence(args);
  assert.equal(calls, 2);
});

test('loadWindowIncidence forgets both frames of a window that could not be built', async () => {
  const calls = [];
  const fetchFrame = async (_simId, minutes) => {
    calls.push(minutes);
    return { hinc: 0, pinc: [1, 2, 3] }; // three places, but two ids below
  };
  const args = {
    ...{
      simId: 7,
      timesteps: HOURLY,
      placeIds: ['a', 'b'],
      endMinutes: 360,
      windowHours: 3
    },
    fetchFrame
  };
  assert.equal(await loadWindowIncidence(args), null);
  assert.deepEqual(calls.sort(), [180, 360]);
  assert.equal(await loadWindowIncidence(args), null);
  assert.equal(calls.length, 4); // both were fetched again
});

test('loadWindowIncidence cancels the other request when one frame fails, and reports the first error', async () => {
  let otherSignal;
  let otherSettled = false;
  const fetchFrame = (_simId, minutes, signal) => {
    if (minutes === 360) return Promise.reject(new Error('HTTP 500'));
    otherSignal = signal;
    return new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => {
        otherSettled = true;
        reject(new DOMException('Aborted', 'AbortError'));
      });
    });
  };
  const caller = new AbortController();
  await assert.rejects(
    loaderFor(null, { fetchFrame, signal: caller.signal }),
    /HTTP 500/ // not the AbortError of the request that was cancelled
  );
  assert.equal(otherSignal.aborted, true);
  assert.equal(otherSettled, true);
  // the caller's own signal was not touched
  assert.equal(caller.signal.aborted, false);
});

test('loadWindowIncidence cancels both requests when the caller aborts, and leaves no listener behind', async () => {
  const caller = new AbortController();
  const seen = [];
  const fetchFrame = (_simId, _minutes, signal) =>
    new Promise((_resolve, reject) => {
      seen.push(signal);
      signal.addEventListener('abort', () =>
        reject(new DOMException('Aborted', 'AbortError'))
      );
    });
  const run = loaderFor(null, { fetchFrame, signal: caller.signal });
  await new Promise((resolve) => setImmediate(resolve));
  caller.abort();
  await assert.rejects(run, { name: 'AbortError' });
  assert.equal(seen.length, 2);
  assert.ok(seen.every((signal) => signal.aborted));
  assert.equal(getEventListeners(caller.signal, 'abort').length, 0);
});

test('loadWindowIncidence leaves no abort listener on the caller signal after success', async () => {
  const caller = new AbortController();
  const server = serverFor();
  assert.ok(await loaderFor(server, { signal: caller.signal }));
  assert.equal(getEventListeners(caller.signal, 'abort').length, 0);
});

test('loadWindowIncidence with an already aborted signal does not hang', async () => {
  const caller = new AbortController();
  caller.abort();
  const server = serverFor();
  await assert.rejects(loaderFor(server, { signal: caller.signal }), {
    name: 'AbortError'
  });
});

test('a corrupt frame is not remembered even when the other request of the window fails', async () => {
  // The start frame arrives with a bad count, the end request fails (HTTP 500).
  // After the server recovers, the next attempt must succeed on its own.
  let healthy = false;
  const calls = [];
  const fetchFrame = async (_simId, minutes) => {
    calls.push(minutes);
    if (!healthy) {
      if (minutes === 360) throw new Error('HTTP 500');
      return { hinc: 0, pinc: [1, 'bad', 3] };
    }
    return minutes === 360
      ? { hinc: 0, pinc: [2, 4, 6] }
      : { hinc: 0, pinc: [1, 2, 3] };
  };
  const args = {
    simId: 7,
    timesteps: HOURLY,
    placeIds: ['a', 'b', 'c'],
    endMinutes: 360,
    windowHours: 3,
    fetchFrame
  };
  await assert.rejects(loadWindowIncidence(args), /HTTP 500/);
  healthy = true;
  const second = await loadWindowIncidence(args);
  assert.ok(second, 'the second attempt must not be poisoned by the first');
  assert.deepEqual(Object.entries(second.incidence.places), [
    ['a', 1],
    ['b', 2],
    ['c', 3]
  ]);
});

test('a caller that has already aborted gets a rejection even when every frame is cached', async () => {
  const server = serverFor();
  assert.ok(await loaderFor(server)); // warms the end and the start frame
  const calls = server.calls.length;

  const caller = new AbortController();
  caller.abort();
  await assert.rejects(loaderFor(server, { signal: caller.signal }), {
    name: 'AbortError'
  });
  assert.equal(server.calls.length, calls); // and nothing was downloaded
});

test('an aborted caller is rejected before the inputs are even looked at', async () => {
  const caller = new AbortController();
  caller.abort();
  await assert.rejects(
    loaderFor(null, {
      simId: 0,
      signal: caller.signal,
      fetchFrame: async () => ({})
    }),
    { name: 'AbortError' }
  );
});

test('a frame of the wrong length is not remembered even when the other request of the window fails', async () => {
  // Same recovery scenario as the corrupt-count test, with counts that are all
  // fine but too few, too many or none: the first attempt must not leave the
  // start frame behind for the second one to trip over.
  for (const badPinc of [[], [1, 2], [1, 2, 3, 4]]) {
    clearWindowFrameCache();
    let healthy = false;
    const calls = [];
    const fetchFrame = async (_simId, minutes) => {
      calls.push(minutes);
      if (!healthy) {
        if (minutes === 360) throw new Error('HTTP 500');
        return { hinc: 0, pinc: badPinc };
      }
      return minutes === 360
        ? { hinc: 0, pinc: [2, 4, 6] }
        : { hinc: 0, pinc: [1, 2, 3] };
    };
    const args = {
      simId: 7,
      timesteps: HOURLY,
      placeIds: ['a', 'b', 'c'],
      endMinutes: 360,
      windowHours: 3,
      fetchFrame
    };
    await assert.rejects(loadWindowIncidence(args), /HTTP 500/);
    healthy = true;
    const second = await loadWindowIncidence(args);
    assert.ok(second, `[${badPinc}] must not poison the second attempt`);
    assert.deepEqual(Object.entries(second.incidence.places), [
      ['a', 1],
      ['b', 2],
      ['c', 3]
    ]);
    assert.deepEqual(calls.sort(), [180, 180, 360, 360]); // asked again
  }
});

test('a frame that fits the places is still remembered', async () => {
  let calls = 0;
  const fetchFrame = async (_simId, minutes) => {
    calls += 1;
    return { hinc: 0, pinc: minutes === 360 ? [2, 4, 6] : [1, 2, 3] };
  };
  const args = {
    simId: 7,
    timesteps: HOURLY,
    placeIds: ['a', 'b', 'c'],
    endMinutes: 360,
    windowHours: 3,
    fetchFrame
  };
  assert.ok(await loadWindowIncidence(args));
  assert.ok(await loadWindowIncidence(args));
  assert.equal(calls, 2);
});

test('a caller that aborts in the same tick as cached frames resolve gets a rejection', async () => {
  const server = serverFor();
  assert.ok(await loaderFor(server)); // warms the end and the start frame
  const calls = server.calls.length;

  const caller = new AbortController();
  const pending = loaderFor(server, { signal: caller.signal });
  caller.abort(); // the cached frames are already on their way to resolving
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(server.calls.length, calls);
  assert.equal(getEventListeners(caller.signal, 'abort').length, 0);
});

test('a caller that aborts while a fetcher ignores the signal gets a rejection', async () => {
  // fetchFrame does not look at the signal, so the downloads finish anyway.
  const caller = new AbortController();
  const fetchFrame = async (_simId, minutes) => {
    await new Promise((resolve) => setTimeout(resolve, 5));
    return { hinc: 0, pinc: minutes === 360 ? [2, 4, 6] : [1, 2, 3] };
  };
  const pending = loadWindowIncidence({
    simId: 7,
    timesteps: HOURLY,
    placeIds: ['a', 'b', 'c'],
    endMinutes: 360,
    windowHours: 3,
    signal: caller.signal,
    fetchFrame
  });
  caller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
});

test('a start frame that was requested but came back empty is unavailable, not a zero baseline', async () => {
  for (const missing of [null, undefined]) {
    clearWindowFrameCache();
    const calls = [];
    const fetchFrame = async (_simId, minutes) => {
      calls.push(minutes);
      return minutes === 360 ? { hinc: 5, pinc: [1, 2, 3] } : missing;
    };
    const args = {
      simId: 7,
      timesteps: HOURLY,
      placeIds: ['a', 'b', 'c'],
      endMinutes: 360,
      windowHours: 3, // starts at 180, so a start frame is required
      fetchFrame
    };
    assert.equal(await loadWindowIncidence(args), null, String(missing));
    // and the end frame is not kept either, a retry asks the server again
    assert.equal(await loadWindowIncidence(args), null);
    assert.equal(calls.length, 4);
  }
});

test('a window that really starts before the run still counts from zero', async () => {
  const calls = [];
  const fetchFrame = async (_simId, minutes) => {
    calls.push(minutes);
    return { hinc: 5, pinc: [1, 2, 3] };
  };
  const result = await loadWindowIncidence({
    simId: 7,
    timesteps: HOURLY,
    placeIds: ['a', 'b', 'c'],
    endMinutes: 120,
    windowHours: 24, // reaches before the first frame
    fetchFrame
  });
  assert.deepEqual(calls, [120]);
  assert.equal(result.keys.startKey, null);
  assert.equal(result.incidence.home, 5);
  assert.deepEqual(result.incidence.places, { a: 1, b: 2, c: 3 });
});

test('frames remembered for another number of places are dropped once they fail to line up', async () => {
  const calls = [];
  let places = 3;
  const fetchFrame = async (_simId, minutes) => {
    calls.push(minutes);
    return { hinc: 0, pinc: Array.from({ length: places }, (_, i) => i + 1) };
  };
  const base = {
    simId: 7,
    timesteps: HOURLY,
    endMinutes: 360,
    windowHours: 3,
    fetchFrame
  };
  assert.ok(await loadWindowIncidence({ ...base, placeIds: ['a', 'b', 'c'] }));
  assert.equal(calls.length, 2);

  // The run was processed again and now has four places.
  places = 4;
  const four = { ...base, placeIds: ['a', 'b', 'c', 'd'] };
  assert.equal(await loadWindowIncidence(four), null); // the old frames do not fit
  assert.ok(await loadWindowIncidence(four), 'both old frames must be dropped');
  assert.equal(calls.length, 4);
});

test('forgetRunFrames drops the frames of one run and no other, even when ids share leading digits', async () => {
  const asked = [];
  const fetchFrame = async (simId, minutes) => {
    asked.push(`${simId}:${minutes}`);
    return { hinc: 0, pinc: [1, 2, 3] };
  };
  const warm = (simId) =>
    loadWindowIncidence({
      simId,
      timesteps: HOURLY,
      placeIds: PLACES,
      endMinutes: 120,
      windowHours: 1,
      fetchFrame
    });
  await Promise.all([warm(1), warm(11), warm(111)]);
  assert.equal(asked.length, 6);

  forgetRunFrames(1);
  asked.length = 0;
  await Promise.all([warm(1), warm(11), warm(111)]);
  assert.deepEqual(asked.sort(), ['1:120', '1:60']); // only run 1 asked again

  forgetRunFrames(999); // unknown run: nothing happens
  asked.length = 0;
  await Promise.all([warm(1), warm(11), warm(111)]);
  assert.equal(asked.length, 0);
});
