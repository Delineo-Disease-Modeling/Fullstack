import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAgeIndex,
  getChartError,
  getPersonSexLabel
} from './simulation-data.ts';

test('buildAgeIndex maps people into configured age ranges', () => {
  const ageIndex = buildAgeIndex({
    a: { age: 20 },
    b: { age: 21 },
    c: { age: 99 },
    ignored: { age: 120 }
  });

  assert.equal(ageIndex.get('a'), 0);
  assert.equal(ageIndex.get('b'), 1);
  assert.equal(ageIndex.get('c'), 4);
  assert.equal(ageIndex.has('ignored'), false);
});

test('getPersonSexLabel preserves known simulator labels', () => {
  assert.equal(getPersonSexLabel(0), 'Male');
  assert.equal(getPersonSexLabel(1), 'Female');
  assert.equal(getPersonSexLabel(null), 'Unknown');
});

test('getChartError extracts non-empty error messages from unknown stats', () => {
  assert.equal(getChartError({ error: 'failed' }), 'failed');
  assert.equal(getChartError({ error: '' }), null);
  assert.equal(getChartError(null), null);
});
