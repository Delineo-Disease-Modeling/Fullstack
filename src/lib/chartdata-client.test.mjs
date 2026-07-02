import assert from 'node:assert/strict';
import test from 'node:test';

import {
  computeOutcomeStats,
  currentInfectionsAtPoint
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

test('currentInfectionsAtPoint preserves per-place active dot counts', () => {
  const active = currentInfectionsAtPoint(
    { time: 1, 'All People': 100, Delta: 7 },
    { time: 1, Susceptible: 83, Infected: 7, Recovered: 10 }
  );

  assert.equal(active, 7);
});
