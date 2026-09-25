import assert from 'node:assert/strict';
import test from 'node:test';
import {
  expandTracePayload,
  getMapSeedCbgIds,
  getTraceStepCount,
  isDeferredTrace
} from './helpers.ts';

test('getMapSeedCbgIds uses resolved seed region before single core seed', () => {
  assert.deepEqual(
    getMapSeedCbgIds({
      resolvedSeedCbgs: ['401139400081', '401139400082', '401139400083'],
      seedCbg: '401139400081'
    }),
    ['401139400081', '401139400082', '401139400083']
  );
});

test('getMapSeedCbgIds uses edited setup seed region before resolved lookup', () => {
  assert.deepEqual(
    getMapSeedCbgIds({
      resolvedSeedCbgs: ['401139400081', '401139400082', '401139400083'],
      setupSeedCbgs: ['401139400082', '401139400084'],
      seedCbg: '401139400081'
    }),
    ['401139400082', '401139400084']
  );
});

test('getMapSeedCbgIds uses guided seed region before setup seed region', () => {
  assert.deepEqual(
    getMapSeedCbgIds({
      guidedSeedCbgs: ['401139400085', '401139400086'],
      setupSeedCbgs: ['401139400081', '401139400082'],
      seedCbg: '401139400081'
    }),
    ['401139400085', '401139400086']
  );
});

test('expandTracePayload rebuilds delta-encoded cluster lists', () => {
  // Encoded by Algorithms trace_encoding.encode_trace_payload(..., 'delta').
  const encoded = {
    algorithm: 'mobility_prune',
    step_encoding: 'delta',
    note: 'n',
    steps: [
      {
        iteration: 0,
        selected_cbg: 'b',
        candidates: [{ cbg: 'b', score: 0.9 }],
        cluster_before_delta: { added: ['a', 'b', 'c', 'd'], removed: [] },
        cluster_after_delta: { added: [], removed: ['b'] }
      },
      {
        iteration: 1,
        selected_cbg: 'd',
        cluster_before_delta: { added: [], removed: [] },
        cluster_after_delta: { added: [], removed: ['d'] }
      },
      {
        // A list the encoder could not express as a delta is sent in full.
        iteration: 2,
        selected_cbg: 'x',
        cluster_before_delta: { added: [], removed: [] },
        cluster_after: ['c', 'a']
      },
      {
        iteration: 3,
        selected_cbg: 'a',
        cluster_before_delta: { added: [], removed: [] },
        cluster_after_delta: { added: [], removed: ['a'] }
      }
    ]
  };

  const trace = expandTracePayload(encoded);

  assert.equal(trace.step_encoding, undefined);
  assert.equal(trace.note, 'n');
  assert.deepEqual(
    trace.steps.map((step) => [step.cluster_before, step.cluster_after]),
    [
      [
        ['a', 'b', 'c', 'd'],
        ['a', 'c', 'd']
      ],
      [
        ['a', 'c', 'd'],
        ['a', 'c']
      ],
      [
        ['a', 'c'],
        ['c', 'a']
      ],
      [['c', 'a'], ['c']]
    ]
  );
  assert.deepEqual(trace.steps[0].candidates, [{ cbg: 'b', score: 0.9 }]);
  assert.equal('cluster_before_delta' in trace.steps[0], false);
});

test('expandTracePayload leaves full-list traces untouched', () => {
  const full = {
    steps: [{ cluster_before: ['a', 'b'], cluster_after: ['a'] }]
  };

  assert.equal(expandTracePayload(full), full);
  assert.equal(expandTracePayload(null), null);
  assert.equal(expandTracePayload(undefined), null);
});

test('deferred trace summaries report their announced step count', () => {
  const summary = {
    algorithm: 'mobility_prune',
    supports_stepwise: true,
    deferred: true,
    step_count: 94,
    clustering_id: 3
  };
  const loaded = { deferred: true, steps: [{}, {}] };

  assert.equal(isDeferredTrace(summary), true);
  assert.equal(getTraceStepCount(summary), 94);
  assert.equal(isDeferredTrace(loaded), false);
  assert.equal(getTraceStepCount(loaded), 2);
  assert.equal(isDeferredTrace({ steps: [] }), false);
  assert.equal(getTraceStepCount({ steps: [] }), 0);
  assert.equal(getTraceStepCount(null), 0);
  assert.equal(expandTracePayload(summary), summary);
});
