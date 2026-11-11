import assert from 'node:assert/strict';
import test from 'node:test';

import {
  canOfferBreakdownChart,
  computeOutcomeStats,
  currentInfectionsAtPoint,
  hasMeaningfulSeries
} from './chartdata-client.ts';

test('computeOutcomeStats subtracts explicit seed ids from new infections', () => {
  const stats = computeOutcomeStats({
    iot: [
      { time: 0, Delta: 10 },
      { time: 24, Delta: 16 }
    ],
    states: [
      { time: 0, Susceptible: 90 },
      { time: 24, Susceptible: 84 }
    ],
    ages: [],
    sexes: [],
    metadata: {
      initial_infected_ids: [' a ', 'b', '', 'c']
    }
  });

  assert.equal(stats.totalInfected, 16);
  assert.equal(stats.seededInfected, 3);
  assert.equal(stats.newInfections, 13);
});

test('computeOutcomeStats falls back to initial infected count for older runs', () => {
  const stats = computeOutcomeStats({
    iot: [
      { time: 0, Delta: 5 },
      { time: 24, Delta: 8 }
    ],
    states: [
      { time: 0, Susceptible: 95 },
      { time: 24, Susceptible: 92 }
    ],
    ages: [],
    sexes: [],
    metadata: {
      initial_infected_count: 5
    }
  });

  assert.equal(stats.totalInfected, 8);
  assert.equal(stats.seededInfected, 5);
  assert.equal(stats.newInfections, 3);
});

test('computeOutcomeStats subtracts terminal states from peak active infections', () => {
  const stats = computeOutcomeStats({
    iot: [
      { time: 0, Delta: 10 },
      { time: 24, Delta: 16 }
    ],
    states: [
      { time: 0, Susceptible: 90, Recovered: 0, Removed: 0 },
      { time: 24, Susceptible: 84, Recovered: 12, Removed: 1 }
    ],
    ages: [],
    sexes: []
  });

  assert.equal(stats.peakInfected, 10);
  assert.equal(stats.peakTimeHours, 0);
  assert.equal(stats.totalInfected, 16);
});

test('hasMeaningfulSeries is true for a series with a numeric value', () => {
  const data = {
    iot: [],
    states: [],
    sexes: [],
    ages: [
      { time: 1, '0-20': 0, '21-40': 2 },
      { time: 2, '0-20': 1, '21-40': 3 }
    ]
  };

  assert.equal(hasMeaningfulSeries(data, 'ages'), true);
});

test('hasMeaningfulSeries counts a zero as data', () => {
  const data = {
    iot: [],
    states: [],
    sexes: [],
    ages: [{ time: 1, '0-20': 0 }]
  };

  assert.equal(hasMeaningfulSeries(data, 'ages'), true);
});

test('hasMeaningfulSeries is false for missing, empty, non-array and null data', () => {
  const data = { iot: [], states: [], ages: [], sexes: [], note: 'text' };

  assert.equal(hasMeaningfulSeries(data, 'ages'), false);
  assert.equal(hasMeaningfulSeries(data, 'missing'), false);
  assert.equal(hasMeaningfulSeries(data, 'note'), false);
  assert.equal(hasMeaningfulSeries(null, 'ages'), false);
  assert.equal(hasMeaningfulSeries(undefined, 'ages'), false);
});

test('hasMeaningfulSeries ignores points that only carry a time value', () => {
  const data = {
    iot: [],
    states: [],
    sexes: [{ time: 0 }, { time: 1 }],
    ages: []
  };

  assert.equal(hasMeaningfulSeries(data, 'sexes'), false);
});

// One kind of bad value per test, and no malformed (null) point anywhere: a
// malformed point makes the whole series false on its own and would hide a
// regression in the number check.
test('hasMeaningfulSeries ignores NaN', () => {
  const data = { sexes: [{ time: 1, Male: Number.NaN }] };
  assert.equal(hasMeaningfulSeries(data, 'sexes'), false);
});

test('hasMeaningfulSeries ignores infinity', () => {
  const data = {
    sexes: [
      { time: 1, Female: Number.POSITIVE_INFINITY },
      { time: 2, Male: Number.NEGATIVE_INFINITY }
    ]
  };
  assert.equal(hasMeaningfulSeries(data, 'sexes'), false);
});

test('hasMeaningfulSeries ignores numbers written as text', () => {
  const data = {
    sexes: [
      { time: 1, Male: '3' },
      { time: 2, Female: '0' }
    ]
  };
  assert.equal(hasMeaningfulSeries(data, 'sexes'), false);
});

test('hasMeaningfulSeries ignores null and undefined values', () => {
  const data = { sexes: [{ time: 1, Male: null, Female: undefined }] };
  assert.equal(hasMeaningfulSeries(data, 'sexes'), false);
});

test('hasMeaningfulSeries counts a finite number even next to bad values', () => {
  const data = {
    sexes: [{ time: 1, Male: '3', Female: 2, Other: Number.NaN }]
  };
  assert.equal(hasMeaningfulSeries(data, 'sexes'), true);
});

test('hasMeaningfulSeries does not count the time field as data', () => {
  assert.equal(
    hasMeaningfulSeries({ sexes: [{ time: 5 }, { time: 6 }] }, 'sexes'),
    false
  );
});

test('hasMeaningfulSeries rejects a series that mixes malformed and valid points', () => {
  const data = {
    iot: [],
    states: [],
    sexes: [],
    ages: [null, { time: 1, '0-20': 2 }]
  };

  assert.equal(hasMeaningfulSeries(data, 'ages'), false);
});

test('hasMeaningfulSeries rejects a series with a hole in it', () => {
  const ages = [
    { time: 1, '0-20': 2 },
    { time: 2, '0-20': 3 }
  ];
  delete ages[1]; // JSON never produces a hole, but the chart would read it
  assert.equal(hasMeaningfulSeries({ ages }, 'ages'), false);
});

const GOOD = { ages: [{ time: 1, '0-20': 2 }], sexes: [{ time: 1, Male: 1 }] };

test('canOfferBreakdownChart without comparison runs follows the selected run', () => {
  assert.equal(canOfferBreakdownChart(GOOD, [], 'ages'), true);
  assert.equal(canOfferBreakdownChart(GOOD, [], 'sexes'), true);
  assert.equal(canOfferBreakdownChart({ ages: [] }, [], 'ages'), false);
  assert.equal(canOfferBreakdownChart(null, [], 'ages'), false);
  assert.equal(canOfferBreakdownChart(undefined, [], 'ages'), false);
});

test('canOfferBreakdownChart accepts comparison runs that are fine, empty or still loading', () => {
  assert.equal(canOfferBreakdownChart(GOOD, [GOOD, GOOD], 'ages'), true);
  // nothing to draw for those runs, but nothing that breaks the chart either
  for (const comparison of [
    null,
    undefined,
    {},
    { ages: [] },
    { ages: 'none' },
    { ages: { 0: null } },
    { ages: [{ time: 1 }] }
  ]) {
    assert.equal(
      canOfferBreakdownChart(GOOD, [comparison], 'ages'),
      true,
      JSON.stringify(comparison) ?? String(comparison)
    );
  }
});

test('canOfferBreakdownChart refuses a malformed series in any comparison run', () => {
  const sparse = [
    { time: 1, '0-20': 2 },
    { time: 2, '0-20': 3 }
  ];
  delete sparse[0];
  for (const bad of [
    [null],
    [undefined],
    [5],
    ['x'],
    [{ time: 1, '0-20': 1 }, null], // one good point does not save it
    sparse
  ]) {
    const comparison = { ages: bad };
    assert.equal(
      canOfferBreakdownChart(GOOD, [comparison], 'ages'),
      false,
      'baseline only'
    );
    assert.equal(
      canOfferBreakdownChart(GOOD, [GOOD, comparison], 'ages'),
      false,
      'second comparison'
    );
    assert.equal(
      canOfferBreakdownChart(GOOD, [comparison, null], 'ages'),
      false,
      'first comparison'
    );
  }
});

test('canOfferBreakdownChart judges only the series it is asked about', () => {
  const comparison = { ages: [null], sexes: [{ time: 1, Male: 1 }] };
  assert.equal(canOfferBreakdownChart(GOOD, [comparison], 'ages'), false);
  assert.equal(canOfferBreakdownChart(GOOD, [comparison], 'sexes'), true);
  // a bad series of another chart is not this function's business
  assert.equal(
    canOfferBreakdownChart(GOOD, [{ ages: GOOD.ages, iot: [null] }], 'ages'),
    true
  );
});

test('canOfferBreakdownChart still needs the selected run to have the series', () => {
  assert.equal(canOfferBreakdownChart({ ages: [null] }, [GOOD], 'ages'), false);
  assert.equal(
    canOfferBreakdownChart({ sexes: GOOD.sexes }, [GOOD], 'ages'),
    false
  );
});

test('currentInfectionsAtPoint preserves per-place active dot counts', () => {
  const active = currentInfectionsAtPoint(
    { time: 1, 'All People': 100, Delta: 7 },
    { time: 1, Susceptible: 83, Infected: 7, Recovered: 10 }
  );

  assert.equal(active, 7);
});
