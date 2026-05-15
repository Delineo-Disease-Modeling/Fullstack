import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseNonNegativeRouteNumber,
  parsePositiveFiniteRouteNumber
} from './route-params.ts';

test('parseNonNegativeRouteNumber preserves non-negative numeric params', () => {
  assert.deepEqual(parseNonNegativeRouteNumber('0', 'id'), {
    ok: true,
    value: 0
  });
  assert.deepEqual(parseNonNegativeRouteNumber('12.5', 'id'), {
    ok: true,
    value: 12.5
  });
});

test('parseNonNegativeRouteNumber rejects NaN and negatives with route message', () => {
  assert.deepEqual(parseNonNegativeRouteNumber('abc', 'czone_id'), {
    ok: false,
    message: 'Invalid czone_id',
    status: 400
  });
  assert.deepEqual(parseNonNegativeRouteNumber('-1', 'czone_id'), {
    ok: false,
    message: 'Invalid czone_id',
    status: 400
  });
});

test('parsePositiveFiniteRouteNumber matches export route validation', () => {
  assert.deepEqual(parsePositiveFiniteRouteNumber('1', 'sim_id'), {
    ok: true,
    value: 1
  });
  assert.deepEqual(parsePositiveFiniteRouteNumber('0', 'sim_id'), {
    ok: false,
    message: 'Invalid sim_id',
    status: 400
  });
  assert.deepEqual(parsePositiveFiniteRouteNumber('Infinity', 'sim_id'), {
    ok: false,
    message: 'Invalid sim_id',
    status: 400
  });
});
