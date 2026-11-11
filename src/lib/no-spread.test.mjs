import assert from 'node:assert/strict';
import { test } from 'node:test';

const {
  FEW_INFECTIONS_PERCENT,
  hasFewNewInfections,
  hasNoNewInfections,
  totalResidents
} = await import('./no-spread.ts');

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

// --------------------------------------------------- "only a few" new infections

test('a run is told apart as "only a few" below 1% of the residents', () => {
  assert.equal(FEW_INFECTIONS_PERCENT, 1);
  // 1,000 residents: fewer than 10 new infections is under 1%.
  assert.equal(hasFewNewInfections({ home: 1, places: {} }, 1000), true);
  assert.equal(hasFewNewInfections({ home: 4, places: { 7: 5 } }, 1000), true);
  assert.equal(hasFewNewInfections({ home: 0, places: { 7: 9 } }, 1000), true);
  // Exactly 1% is not "fewer than".
  assert.equal(
    hasFewNewInfections({ home: 0, places: { 7: 10 } }, 1000),
    false
  );
  assert.equal(hasFewNewInfections({ home: 5, places: { 7: 6 } }, 1000), false);
  assert.equal(hasFewNewInfections({ home: 500, places: {} }, 1000), false);
});

test('"only a few" scales with the zone', () => {
  // The default run of the form on our synthetic zone: 1,928 residents.
  assert.equal(hasFewNewInfections({ home: 1, places: {} }, 1928), true);
  assert.equal(hasFewNewInfections({ home: 19, places: {} }, 1928), true);
  assert.equal(hasFewNewInfections({ home: 20, places: {} }, 1928), false);
  // An outbreak of 1,643 people is nowhere near it.
  assert.equal(
    hasFewNewInfections({ home: 975, places: { 1: 668 } }, 1928),
    false
  );
  assert.equal(hasFewNewInfections({ home: 1, places: {} }, 50), false);
  assert.equal(hasFewNewInfections({ home: 1, places: {} }, 101), true);
  assert.equal(hasFewNewInfections({ home: 1, places: {} }, 100), false);
});

test('no new infections at all has its own note, not this one', () => {
  assert.equal(hasFewNewInfections({ home: 0, places: {} }, 1000), false);
  assert.equal(
    hasFewNewInfections({ home: 0, places: { 1: 0, 2: 0 } }, 1000),
    false
  );
});

test('"only a few" needs usable counts and a known number of residents', () => {
  assert.equal(hasFewNewInfections(null, 1000), false);
  assert.equal(hasFewNewInfections(undefined, 1000), false);
  assert.equal(
    hasFewNewInfections({ home: Number.NaN, places: {} }, 1000),
    false
  );
  assert.equal(hasFewNewInfections({ home: 1.5, places: {} }, 1000), false);
  assert.equal(hasFewNewInfections({ home: -1, places: {} }, 1000), false);
  assert.equal(hasFewNewInfections({ home: 1, places: [] }, 1000), false);
  assert.equal(hasFewNewInfections({ home: 1, places: null }, 1000), false);
  assert.equal(
    hasFewNewInfections({ home: 1, places: { 1: '2' } }, 1000),
    false
  );
  for (const residents of [
    null,
    undefined,
    0,
    -5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    '1000'
  ]) {
    assert.equal(
      hasFewNewInfections({ home: 1, places: {} }, residents),
      false
    );
  }
});

test('the residents are the members of all homes, or unknown', () => {
  assert.equal(
    totalResidents([
      { cbg: 'A', members: 2 },
      { cbg: 'B', members: 3 },
      { cbg: 'A', members: 4 }
    ]),
    9
  );
  assert.equal(totalResidents(null), null);
  assert.equal(totalResidents(undefined), null);
  assert.equal(totalResidents([]), null);
  // One home without a usable count makes the total unknown, never smaller.
  assert.equal(totalResidents([{ cbg: 'A', members: 2 }, { cbg: 'B' }]), null);
  assert.equal(
    totalResidents([{ cbg: 'A', members: 2 }, { members: 3 }]),
    null
  );
});
