import assert from 'node:assert/strict';
import { test } from 'node:test';

const { fetchPlaceSeries } = await import('./hourly-presence-client.ts');

const ORIGIN = 'http://localhost:3000';

function reply(status, body) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => {
      if (body === undefined) throw new Error('not json');
      return body;
    }
  };
}

function fakeFetch(response) {
  const calls = [];
  const impl = async (input, init) => {
    calls.push({ url: String(input), init });
    return response;
  };
  return { impl, calls };
}

test('asks for the places scope of one place and returns both series', async () => {
  const iot = [{ time: 9, 'All People': 14, Delta: 0 }];
  const incidence = [{ time: 1, 'New infections': 0 }];
  const { impl, calls } = fakeFetch(
    reply(200, { data: { iot, incidence, ages: [], sexes: [], states: [] } })
  );
  const controller = new AbortController();
  const series = await fetchPlaceSeries(
    82,
    '10 16',
    controller.signal,
    impl,
    ORIGIN
  );
  assert.deepEqual(series, { presence: iot, incidence });
  assert.equal(calls.length, 1);
  const url = new URL(calls[0].url);
  assert.equal(url.pathname, '/api/simdata/82/chartdata');
  assert.equal(url.searchParams.get('loc_type'), 'places');
  // The id travels as a query value, whatever it contains.
  assert.equal(url.searchParams.get('loc_id'), '10 16');
  assert.equal(calls[0].init.cache, 'no-store');
  assert.equal(calls[0].init.signal, controller.signal);
});

test('a run without incidence gives null for it, and no presence is an empty list', async () => {
  const { impl } = fakeFetch(reply(200, { data: { iot: [], states: [] } }));
  assert.deepEqual(await fetchPlaceSeries(1, 'a', undefined, impl, ORIGIN), {
    presence: [],
    incidence: null
  });
});

test('a 202 means the run is still being processed', async () => {
  const { impl } = fakeFetch(reply(202, { message: 'Global stats are processing' }));
  await assert.rejects(
    fetchPlaceSeries(1, 'a', undefined, impl, ORIGIN),
    /still being processed/
  );
});

test('an error answer is reported with the server message, or a generic one', async () => {
  await assert.rejects(
    fetchPlaceSeries(
      1,
      'a',
      undefined,
      fakeFetch(reply(404, { message: 'Could not find associated simdata' })).impl,
      ORIGIN
    ),
    /Could not find associated simdata/
  );
  await assert.rejects(
    fetchPlaceSeries(
      1,
      'a',
      undefined,
      fakeFetch(reply(500, undefined)).impl,
      ORIGIN
    ),
    /Failed to load this place \(500\)/
  );
});

test('a body that is not a chart is refused', async () => {
  for (const body of [null, 'x', [], {}, { data: null }, { data: {} }, { data: { iot: 'no' } }]) {
    await assert.rejects(
      fetchPlaceSeries(1, 'a', undefined, fakeFetch(reply(200, body)).impl, ORIGIN),
      /unexpected chart/
    );
  }
  await assert.rejects(
    fetchPlaceSeries(1, 'a', undefined, fakeFetch(reply(200, undefined)).impl, ORIGIN),
    /unexpected chart/
  );
});

test('a chart that carries an error is refused with that error', async () => {
  const { impl } = fakeFetch(
    reply(200, { data: { iot: [], error: 'Chart generation failed' } })
  );
  await assert.rejects(
    fetchPlaceSeries(1, 'a', undefined, impl, ORIGIN),
    /Chart generation failed/
  );
});

test('an aborted signal rejects without asking the server', async () => {
  const { impl, calls } = fakeFetch(reply(200, { data: { iot: [] } }));
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    fetchPlaceSeries(1, 'a', controller.signal, impl, ORIGIN),
    (error) => error.name === 'AbortError'
  );
  assert.equal(calls.length, 0);
});
