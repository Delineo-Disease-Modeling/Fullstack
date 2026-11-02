import assert from 'node:assert/strict';
import { test } from 'node:test';

const { NEIGHBORHOOD_CONCURRENCY, fetchHomeFrame, loadNeighborhoodRates } =
  await import('./neighborhood-rates-client.ts');
const {
  buildLayout,
  buildNeighborhoodTable,
  planNeighborhoodDays,
  summarizeFrame
} = await import('./neighborhood-rates.ts');

const ORIGIN = 'http://localhost:3000';

function grid(first, last) {
  const out = [];
  for (let hour = first; hour <= last; hour += 1) out.push(hour * 60);
  return out;
}

// Four homes in two neighborhoods: A has 3 residents, B has 7.
const HOMES = [
  { id: '1', cbg: 'A', members: 2 },
  { id: '2', cbg: 'B', members: 3 },
  { id: '3', cbg: 'A', members: 1 },
  { id: '4', cbg: 'B', members: 4 }
];

// Everybody is at home; one more person per neighborhood is infected on every
// day, so the `h` array for a given time is easy to work out by hand (the frame
// at the end of day d is the one at hour 24 * d).
function framesH(minutes) {
  const day = Math.floor((minutes / 60 - 1) / 24) + 1;
  return [2, Math.min(day, 2), 3, Math.min(day, 3), 1, 0, 4, 0];
}

function tracker(hFor = framesH) {
  const state = { asked: [], inFlight: 0, maxInFlight: 0, signals: [] };
  const fetchFrame = async (simId, minutes, signal) => {
    state.asked.push(`${simId}:${minutes}`);
    state.signals.push(signal);
    state.inFlight += 1;
    state.maxInFlight = Math.max(state.maxInFlight, state.inFlight);
    await new Promise((resolve) => setTimeout(resolve, 1));
    state.inFlight -= 1;
    return hFor(minutes);
  };
  return { fetchFrame, state };
}

// ---------------------------------------------------------------- the fetch

function response(body, init = {}) {
  return {
    status: init.status ?? 200,
    ok: (init.status ?? 200) < 300,
    json: async () => {
      if (body === undefined) throw new Error('not json');
      return body;
    }
  };
}

function frameBody(minutes, h, extra = {}) {
  return {
    data: { time: minutes, simdata: { [String(minutes)]: { h, ...extra } } }
  };
}

test('the frame is asked for by minutes, straight from the server', async () => {
  const calls = [];
  const h = [2, 1, 3, 0, 1, 1, 4, 2];
  const result = await fetchHomeFrame(
    7,
    180,
    undefined,
    async (url, init) => {
      calls.push({ url: String(url), init });
      return response(frameBody(180, h));
    },
    ORIGIN
  );
  assert.deepEqual(result, h);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `${ORIGIN}/api/simdata/7/map?time=180`);
  assert.equal(calls[0].init.cache, 'no-store');
});

test('the signal is passed on, and an aborted one asks for nothing', async () => {
  const controller = new AbortController();
  let seen;
  await fetchHomeFrame(
    1,
    60,
    controller.signal,
    async (_url, init) => {
      seen = init.signal;
      return response(frameBody(60, []));
    },
    ORIGIN
  );
  assert.equal(seen, controller.signal);
  controller.abort();
  let asked = false;
  await assert.rejects(
    fetchHomeFrame(
      1,
      60,
      controller.signal,
      async () => {
        asked = true;
        return response(frameBody(60, []));
      },
      ORIGIN
    ),
    { name: 'AbortError' }
  );
  assert.equal(asked, false);
});

test('a frame for another time is not a frame (the server answers with the nearest)', async () => {
  await assert.rejects(
    fetchHomeFrame(
      1,
      180,
      undefined,
      async () => response(frameBody(240, [])),
      ORIGIN
    ),
    /unexpected map frame/
  );
});

test('a body that is not a frame is an error', async () => {
  const cases = [
    response(undefined),
    response(null),
    response({}),
    response({ data: null }),
    response({ data: { time: 180 } }),
    response({ data: { time: 180, simdata: null } }),
    response({ data: { time: 180, simdata: { 180: null } } }),
    response({ data: { time: 180, simdata: { 180: [1, 2] } } }),
    response({ data: { time: 'x', simdata: {} } }),
    response([1, 2, 3])
  ];
  for (const one of cases) {
    await assert.rejects(
      fetchHomeFrame(1, 180, undefined, async () => one, ORIGIN),
      /unexpected map frame/
    );
  }
});

test('a frame without the h array comes back as it is, for summarizeFrame to refuse', async () => {
  const result = await fetchHomeFrame(
    1,
    180,
    undefined,
    async () => response({ data: { time: 180, simdata: { 180: { p: [] } } } }),
    ORIGIN
  );
  assert.equal(result, undefined);
});

test('a run that is still processing and a server error are errors with a message', async () => {
  await assert.rejects(
    fetchHomeFrame(
      1,
      60,
      undefined,
      async () => response({}, { status: 202 }),
      ORIGIN
    ),
    /still being processed/
  );
  await assert.rejects(
    fetchHomeFrame(
      1,
      60,
      undefined,
      async () => response({ message: 'Run not found' }, { status: 404 }),
      ORIGIN
    ),
    /Run not found/
  );
  await assert.rejects(
    fetchHomeFrame(
      1,
      60,
      undefined,
      async () => response(undefined, { status: 500 }),
      ORIGIN
    ),
    /Failed to load map frame \(500\)/
  );
});

// ---------------------------------------------------------------- the load

test('the table is the one the pure helpers build from the same frames', async () => {
  const timesteps = grid(1, 75);
  const { fetchFrame, state } = tracker();
  const result = await loadNeighborhoodRates({
    simId: 9,
    timesteps,
    homes: HOMES,
    fetchFrame
  });
  assert.equal(result.ok, true);

  const plan = planNeighborhoodDays(timesteps).plan;
  const layout = buildLayout(HOMES).layout;
  const expected = buildNeighborhoodTable(
    plan,
    plan.hours.map((hour) => summarizeFrame(framesH(hour * 60), layout)),
    layout
  );
  assert.deepEqual(result.table, expected.table);
  // A 75-hour run has readings at the ends of its 3 whole days: hours 24, 48 and 72.
  assert.deepEqual(
    [...state.asked].sort(),
    [24, 48, 72].map((hour) => `9:${hour * 60}`).sort()
  );
});

test('exactly the last frame of every whole day is asked for, the last one first', async () => {
  const { fetchFrame, state } = tracker();
  await loadNeighborhoodRates({
    simId: 9,
    timesteps: grid(1, 84),
    homes: HOMES,
    fetchFrame
  });
  assert.equal(state.asked[0], `9:${72 * 60}`);
  assert.deepEqual(
    [...state.asked].sort(),
    [24, 48, 72].map((hour) => `9:${hour * 60}`).sort()
  );
});

test('at most four frames are in flight at once, and the number can be changed', async () => {
  const many = tracker();
  await loadNeighborhoodRates({
    simId: 1,
    timesteps: grid(1, 24 * 20),
    homes: HOMES,
    fetchFrame: many.fetchFrame
  });
  assert.equal(NEIGHBORHOOD_CONCURRENCY, 4);
  assert.equal(many.state.asked.length, 20);
  assert.ok(many.state.maxInFlight <= 4);
  assert.ok(many.state.maxInFlight >= 2);

  const one = tracker();
  await loadNeighborhoodRates({
    simId: 1,
    timesteps: grid(1, 24 * 6),
    homes: HOMES,
    fetchFrame: one.fetchFrame,
    concurrency: 1
  });
  assert.equal(one.state.maxInFlight, 1);

  // A nonsense number still loads everything, one at a time.
  const zero = tracker();
  const result = await loadNeighborhoodRates({
    simId: 1,
    timesteps: grid(1, 24 * 6),
    homes: HOMES,
    fetchFrame: zero.fetchFrame,
    concurrency: 0
  });
  assert.equal(result.ok, true);
  assert.equal(zero.state.maxInFlight, 1);
});

test('a run with a single reading needs one request', async () => {
  const { fetchFrame, state } = tracker();
  const result = await loadNeighborhoodRates({
    simId: 1,
    timesteps: grid(1, 24),
    homes: HOMES,
    fetchFrame
  });
  assert.equal(result.ok, true);
  assert.equal(state.asked.length, 1);
  assert.equal(result.table.columns.length, 1);
});

test('progress counts every frame once, up to the total', async () => {
  const { fetchFrame } = tracker();
  const seen = [];
  await loadNeighborhoodRates({
    simId: 1,
    timesteps: grid(1, 24 * 5),
    homes: HOMES,
    fetchFrame,
    onProgress: (done, total) => seen.push([done, total])
  });
  assert.deepEqual(seen, [
    [1, 5],
    [2, 5],
    [3, 5],
    [4, 5],
    [5, 5]
  ]);
});

test('a view that is not possible downloads nothing', async () => {
  const cases = [
    [{ timesteps: null, homes: HOMES }, 'no-grid'],
    [{ timesteps: grid(1, 2), homes: HOMES }, 'no-days'],
    [{ timesteps: grid(1, 2401), homes: HOMES }, 'too-long'],
    [{ timesteps: grid(1, 100), homes: null }, 'bad-homes'],
    [{ timesteps: grid(1, 100), homes: [] }, 'bad-homes'],
    [
      { timesteps: grid(1, 100), homes: [...HOMES, { id: '5', members: 1 }] },
      'bad-homes'
    ]
  ];
  for (const [args, reason] of cases) {
    const { fetchFrame, state } = tracker();
    const result = await loadNeighborhoodRates({
      simId: 1,
      fetchFrame,
      ...args
    });
    assert.deepEqual(result, { ok: false, reason });
    assert.equal(state.asked.length, 0);
  }
});

test('a last frame that cannot be used ends the load after one request', async () => {
  const { fetchFrame, state } = tracker(() => [1, 2, 3]);
  const result = await loadNeighborhoodRates({
    simId: 1,
    timesteps: grid(1, 24 * 10),
    homes: HOMES,
    fetchFrame
  });
  assert.deepEqual(result, { ok: false, reason: 'bad-frames' });
  assert.equal(state.asked.length, 1);
});

test('a frame without h, or with more infected than present, cannot be used', async () => {
  for (const bad of [undefined, null, 'x', [2, 3, 3, 0, 1, 1, 4, 2]]) {
    const { fetchFrame } = tracker(() => bad);
    assert.deepEqual(
      await loadNeighborhoodRates({
        simId: 1,
        timesteps: grid(1, 48),
        homes: HOMES,
        fetchFrame
      }),
      { ok: false, reason: 'bad-frames' }
    );
  }
});

test('one unusable frame among good ones refuses the whole table and cancels the rest', async () => {
  const { fetchFrame, state } = tracker((minutes) =>
    minutes === 48 * 60 ? [9, 9, 9] : framesH(minutes)
  );
  const result = await loadNeighborhoodRates({
    simId: 1,
    timesteps: grid(1, 24 * 8),
    homes: HOMES,
    fetchFrame,
    concurrency: 1
  });
  assert.deepEqual(result, { ok: false, reason: 'bad-frames' });
  // With one worker nothing after the bad frame is asked for: last, the end of day 1, the end of day 2.
  assert.deepEqual(state.asked, [
    `1:${192 * 60}`,
    `1:${24 * 60}`,
    `1:${48 * 60}`
  ]);
});

test('more people at home than the homes list as members is accepted', async () => {
  const { fetchFrame } = tracker(() => [3, 0, 3, 0, 1, 1, 4, 2]);
  const result = await loadNeighborhoodRates({
    simId: 1,
    timesteps: grid(1, 48),
    homes: HOMES,
    fetchFrame
  });
  assert.equal(result.ok, true);
});

test('the first real error is the one reported, and the others are cancelled', async () => {
  const signals = [];
  const fetchFrame = async (_simId, minutes, signal) => {
    signals.push(signal);
    await new Promise((resolve) => setTimeout(resolve, 1));
    if (minutes === 72 * 60) throw new Error('boom');
    return framesH(minutes);
  };
  await assert.rejects(
    loadNeighborhoodRates({
      simId: 1,
      timesteps: grid(1, 24 * 10),
      homes: HOMES,
      fetchFrame
    }),
    /boom/
  );
  assert.ok(signals.some((signal) => signal.aborted));
});

test('an error on the very first request is reported', async () => {
  const fetchFrame = async () => {
    throw new Error('server down');
  };
  await assert.rejects(
    loadNeighborhoodRates({
      simId: 1,
      timesteps: grid(1, 48),
      homes: HOMES,
      fetchFrame
    }),
    /server down/
  );
});

test('a caller that has given up gets a rejection and nothing is asked', async () => {
  const controller = new AbortController();
  controller.abort();
  const { fetchFrame, state } = tracker();
  await assert.rejects(
    loadNeighborhoodRates({
      simId: 1,
      timesteps: grid(1, 48),
      homes: HOMES,
      fetchFrame,
      signal: controller.signal
    }),
    { name: 'AbortError' }
  );
  assert.equal(state.asked.length, 0);
});

test('giving up while the frames arrive rejects, even if every answer comes in', async () => {
  const controller = new AbortController();
  const { fetchFrame } = tracker();
  const pending = loadNeighborhoodRates({
    simId: 1,
    timesteps: grid(1, 24 * 6),
    homes: HOMES,
    fetchFrame,
    signal: controller.signal,
    onProgress: (done, total) => {
      if (done === total) controller.abort();
    }
  });
  await assert.rejects(pending, { name: 'AbortError' });
});

test('a fetcher that ignores the signal cannot hold up a cancelled load', async () => {
  const controller = new AbortController();
  let release;
  const lateAnswer = new Promise((resolve) => {
    release = () => resolve(framesH(24 * 60));
  });
  const fetchFrame = () => lateAnswer;
  const pending = loadNeighborhoodRates({
    simId: 1,
    timesteps: grid(1, 48),
    homes: HOMES,
    fetchFrame,
    signal: controller.signal
  });
  setTimeout(() => controller.abort(), 5);
  // The late answer has not been released: the load must reject without it.
  await assert.rejects(pending, { name: 'AbortError' });
  // Now let the answer arrive: it must not surface as an unhandled rejection.
  release();
  await new Promise((resolve) => setTimeout(resolve, 20));
});

test('a load that takes longer than the deadline fails with a message', async () => {
  const fetchFrame = (_simId, _minutes, signal) =>
    new Promise((_resolve, reject) => {
      signal?.addEventListener('abort', () =>
        reject(new DOMException('Aborted', 'AbortError'))
      );
    });
  await assert.rejects(
    loadNeighborhoodRates({
      simId: 1,
      timesteps: grid(1, 48),
      homes: HOMES,
      fetchFrame,
      deadlineMs: 10
    }),
    /took too long/
  );
});

test('a caller that gives up before the deadline is not told it took too long', async () => {
  const controller = new AbortController();
  const fetchFrame = (_simId, _minutes, signal) =>
    new Promise((_resolve, reject) => {
      signal?.addEventListener('abort', () =>
        reject(new DOMException('Aborted', 'AbortError'))
      );
    });
  const pending = loadNeighborhoodRates({
    simId: 1,
    timesteps: grid(1, 48),
    homes: HOMES,
    fetchFrame,
    signal: controller.signal,
    deadlineMs: 1000
  });
  setTimeout(() => controller.abort(), 5);
  await assert.rejects(pending, { name: 'AbortError' });
});

test('the load does not change the homes or the timesteps it was given', async () => {
  const timesteps = grid(1, 75);
  const before = JSON.stringify([HOMES, timesteps]);
  const { fetchFrame } = tracker();
  await loadNeighborhoodRates({
    simId: 1,
    timesteps,
    homes: HOMES,
    fetchFrame
  });
  assert.equal(JSON.stringify([HOMES, timesteps]), before);
});

test('a fetcher that cancels the load itself, then never answers, does not hang the load', async () => {
  const controller = new AbortController();
  const fetchFrame = () => {
    controller.abort();
    return new Promise(() => {});
  };
  await assert.rejects(
    loadNeighborhoodRates({
      simId: 1,
      timesteps: grid(1, 48),
      homes: HOMES,
      fetchFrame,
      signal: controller.signal
    }),
    { name: 'AbortError' }
  );
});
