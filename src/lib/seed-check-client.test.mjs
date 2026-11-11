import assert from 'node:assert/strict';
import { test } from 'node:test';

const { fetchDefaultMatrixId, fetchRunInfo } = await import(
  './seed-check-client.ts'
);

function respond(status, body, { jsonFails = false } = {}) {
  return async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      if (jsonFails) throw new Error('not json');
      return body;
    }
  });
}

const GOOD = {
  data: {
    metadata: { dmp_mode: 'auto' },
    zone: { id: 6, length: 672 },
    timesteps: [60, 120],
    incidence: { home: 2, places: { 4: 3 } }
  }
};

test('asks for the run map without caching, under the given origin', async () => {
  const seen = [];
  const out = await fetchRunInfo(
    12,
    undefined,
    async (url, init) => {
      seen.push([url, init.cache]);
      return respond(200, GOOD)();
    },
    'http://x'
  );
  assert.deepEqual(seen, [['http://x/api/simdata/12/map', 'no-store']]);
  assert.deepEqual(out, {
    metadata: { dmp_mode: 'auto' },
    zone: { id: 6, length: 672 },
    timesteps: [60, 120],
    incidence: { home: 2, places: { 4: 3 } }
  });
});

test('passes the abort signal on', async () => {
  const controller = new AbortController();
  let got = null;
  await fetchRunInfo(1, controller.signal, async (_url, init) => {
    got = init.signal;
    return respond(200, GOOD)();
  });
  assert.equal(got, controller.signal);
});

test('a run without incidence, metadata or zone is still read', async () => {
  const out = await fetchRunInfo(
    1,
    undefined,
    respond(200, { data: { timesteps: [60] } })
  );
  assert.deepEqual(out, {
    metadata: null,
    zone: null,
    timesteps: [60],
    incidence: null
  });
  const nulled = await fetchRunInfo(
    1,
    undefined,
    respond(200, { data: { timesteps: [60], incidence: null, zone: null } })
  );
  assert.equal(nulled.incidence, null);
});

test('202 means the run is still being processed', async () => {
  await assert.rejects(
    fetchRunInfo(1, undefined, respond(202, { progress: 10 })),
    /still being processed/
  );
});

test('an error body gives its message, otherwise the status', async () => {
  await assert.rejects(
    fetchRunInfo(1, undefined, respond(404, { message: 'Run not found' })),
    /Run not found/
  );
  await assert.rejects(
    fetchRunInfo(7, undefined, respond(500, null, { jsonFails: true })),
    /Could not load run 7 \(status 500\)/
  );
});

test('a body that is not a run map is refused', async () => {
  for (const body of [null, 'x', [], {}, { data: null }, { data: [] }]) {
    await assert.rejects(
      fetchRunInfo(1, undefined, respond(200, body)),
      /unexpected form/,
      JSON.stringify(body)
    );
  }
  for (const body of [
    { data: {} },
    { data: { timesteps: 'x' } },
    { data: { timesteps: [60, '120'] } }
  ]) {
    await assert.rejects(
      fetchRunInfo(1, undefined, respond(200, body)),
      /without its frame times/,
      JSON.stringify(body)
    );
  }
});

test('unusable infection counts are refused', async () => {
  for (const incidence of [
    { home: '2', places: {} },
    { home: 2 },
    { home: 2, places: [] },
    { places: {} },
    'x',
    5
  ]) {
    await assert.rejects(
      fetchRunInfo(
        1,
        undefined,
        respond(200, { data: { timesteps: [60], incidence } })
      ),
      /unusable infection counts/,
      JSON.stringify(incidence)
    );
  }
});

test('the default matrix id is the one marked default, read from the matrices list', async () => {
  const seen = [];
  const id = await fetchDefaultMatrixId(
    undefined,
    async (url, init) => {
      seen.push([url, init.cache]);
      return respond(200, {
        data: [
          { id: 2, is_default: false },
          { id: 5, is_default: true },
          { id: 9, is_default: true }
        ]
      })();
    },
    'http://x'
  );
  assert.equal(id, 5);
  assert.deepEqual(seen, [['http://x/api/dmp/matrices', 'no-store']]);
});

test('no usable default matrix gives null, never an error', async () => {
  const cases = [
    respond(200, { data: [{ id: 2, is_default: false }] }),
    respond(200, { data: [] }),
    respond(200, { data: 'x' }),
    respond(200, {}),
    respond(200, null),
    respond(200, { data: [{ id: 0, is_default: true }] }),
    respond(200, { data: [{ id: '3', is_default: true }] }),
    respond(200, { data: [{ id: 1.5, is_default: true }] }),
    respond(200, { data: [{ id: 3, is_default: 'true' }] }),
    respond(500, { message: 'down' }),
    respond(500, { data: [{ id: 5, is_default: true }] }),
    respond(200, null, { jsonFails: true }),
    async () => {
      throw new TypeError('Failed to fetch');
    }
  ];
  for (const [index, fetchImpl] of cases.entries()) {
    assert.equal(
      await fetchDefaultMatrixId(undefined, fetchImpl),
      null,
      `case ${index}`
    );
  }
});
