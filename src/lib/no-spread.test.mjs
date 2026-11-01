import assert from 'node:assert/strict';
import { test } from 'node:test';

const { hasNoNewInfections } = await import('./no-spread.ts');

test('a run whose home total and places are all zero has no new infections', () => {
  assert.equal(hasNoNewInfections({ home: 0, places: {} }), true);
  assert.equal(hasNoNewInfections({ home: 0, places: { 1: 0, 2: 0 } }), true);
});

test('any infection anywhere means there was spread', () => {
  assert.equal(hasNoNewInfections({ home: 1, places: {} }), false);
  assert.equal(hasNoNewInfections({ home: 0, places: { 7: 1 } }), false);
  assert.equal(hasNoNewInfections({ home: 0, places: { 1: 0, 2: 3 } }), false);
  assert.equal(hasNoNewInfections({ home: 5, places: { 1: 2 } }), false);
});

test('a run that never reported incidence says nothing about spread', () => {
  assert.equal(hasNoNewInfections(null), false);
  assert.equal(hasNoNewInfections(undefined), false);
});

test('unusable numbers are not evidence of no spread', () => {
  assert.equal(hasNoNewInfections({ home: Number.NaN, places: {} }), false);
  assert.equal(hasNoNewInfections({ home: '0', places: {} }), false);
  assert.equal(hasNoNewInfections({ home: undefined, places: {} }), false);
  assert.equal(
    hasNoNewInfections({ home: 0, places: { 1: Number.NaN } }),
    false
  );
  assert.equal(hasNoNewInfections({ home: 0, places: { 1: '0' } }), false);
  assert.equal(hasNoNewInfections({ home: 0, places: { 1: -1 } }), false);
  assert.equal(hasNoNewInfections({ home: -1, places: {} }), false);
});

test('missing or malformed places are not evidence of no spread', () => {
  assert.equal(hasNoNewInfections({ home: 0 }), false);
  assert.equal(hasNoNewInfections({ home: 0, places: null }), false);
  assert.equal(hasNoNewInfections({ home: 0, places: [] }), false);
  assert.equal(hasNoNewInfections({ home: 0, places: 'none' }), false);
  assert.equal(hasNoNewInfections({ home: 0, places: '' }), false);
  assert.equal(hasNoNewInfections({ home: 0, places: 0 }), false);
  assert.equal(hasNoNewInfections({ home: 0, places: false }), false);
  assert.equal(hasNoNewInfections('empty'), false);
});
