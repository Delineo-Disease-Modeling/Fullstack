import assert from 'node:assert/strict';
import { test } from 'node:test';

const {
  buildHourlyPresence,
  buildPlaceTable,
  busiestHourOfDay,
  describeHour,
  hourNumber,
  presenceColor,
  HOURS_PER_DAY
} = await import('./hourly-presence.ts');
const { HEAT_PALETTE } = await import('./daily-incidence.ts');

function grid(hours) {
  return Array.from({ length: hours }, (_, index) => (index + 1) * 60);
}

// People present, only for the hours given (like the server: empty hours are
// simply missing).
function presence(byHour) {
  return Object.entries(byHour).map(([time, people]) => ({
    time: Number(time),
    'All People': people,
    Delta: 0
  }));
}

function incidence(hours, byHour = {}) {
  return Array.from({ length: hours }, (_, index) => ({
    time: index + 1,
    'New infections': byHour[index + 1] ?? 0
  }));
}

function build(args) {
  const result = buildHourlyPresence(args);
  assert.equal(result.ok, true, `expected ok, got ${JSON.stringify(result)}`);
  return result.value;
}

function failure(args) {
  const result = buildHourlyPresence(args);
  assert.equal(result.ok, false);
  return result.reason;
}

test('hour n of the series is cell (day, hour) n - 1, a day being 24 hours', () => {
  const value = build({
    timesteps: grid(48),
    presence: presence({ 1: 3, 24: 4, 25: 5, 48: 6 }),
    incidence: null
  });
  assert.equal(HOURS_PER_DAY, 24);
  assert.equal(value.days, 2);
  assert.equal(value.hours, 48);
  assert.equal(value.cells.length, 2);
  assert.equal(value.cells[0].length, 24);
  assert.equal(value.cells[0][0].people, 3);
  assert.equal(value.cells[0][23].people, 4);
  assert.equal(value.cells[1][0].people, 5);
  assert.equal(value.cells[1][23].people, 6);
  // Every other hour is empty, not missing.
  assert.equal(value.cells[0][1].people, 0);
  assert.equal(value.cells[1][12].people, 0);
});

test('maximum, peak (first one wins), hours with people and mean by hour of the day', () => {
  const value = build({
    timesteps: grid(48),
    presence: presence({ 10: 7, 11: 9, 34: 9, 35: 1 }),
    incidence: null
  });
  assert.equal(value.maxPeople, 9);
  assert.deepEqual(value.peak, { people: 9, day: 0, hour: 10 });
  assert.equal(value.occupiedHours, 4);
  // Series hours 10 and 34 are both hour index 9 of their day (7 and 9);
  // series hours 11 and 35 are both hour index 10 (9 and 1).
  assert.equal(value.meanByHour.length, 24);
  assert.equal(value.meanByHour[9], 8);
  assert.equal(value.meanByHour[10], 5);
  assert.equal(value.meanByHour[0], 0);
  assert.deepEqual(
    value.perDay.map((day) => day.peakPeople),
    [9, 9]
  );
});

test('a last day shorter than 24 hours has no cells after the end and is not counted in the means', () => {
  const value = build({
    timesteps: grid(30),
    presence: presence({ 3: 10, 7: 12, 27: 20, 30: 5 }),
    incidence: null
  });
  assert.equal(value.days, 2);
  assert.equal(value.cells[1].length, 24);
  assert.equal(value.cells[1][5].people, 5);
  assert.equal(value.cells[1][6], null);
  assert.equal(value.cells[1][23], null);
  // Hour index 2: days 1 and 2 -> (10 + 20) / 2; hour index 5: both days;
  // hour index 6 exists on day 1 only, so its mean is 12, not 12 / 2 days.
  assert.equal(value.meanByHour[2], 15);
  assert.equal(value.meanByHour[5], 2.5);
  assert.equal(value.meanByHour[6], 12);
  assert.equal(value.meanByHour[7], 0);
});

test('a run shorter than a day has one short day and finite means', () => {
  const value = build({
    timesteps: grid(6),
    presence: presence({ 2: 5, 6: 1 }),
    incidence: incidence(6, { 2: 1 })
  });
  assert.equal(value.days, 1);
  assert.equal(value.cells[0][5].people, 1);
  assert.equal(value.cells[0][6], null);
  assert.equal(value.meanByHour.length, 24);
  assert.equal(value.meanByHour.every((mean) => Number.isFinite(mean)), true);
  assert.equal(value.meanByHour[1], 5);
  assert.equal(value.meanByHour[6], 0);
  assert.equal(value.totalNewInfections, 1);
});

test('nobody ever at the place gives an all-zero table, no peak', () => {
  for (const empty of [[], null, undefined]) {
    const value = build({ timesteps: grid(24), presence: empty, incidence: null });
    assert.equal(value.maxPeople, 0);
    assert.equal(value.peak, null);
    assert.equal(value.occupiedHours, 0);
    assert.equal(value.cells[0].every((cell) => cell.people === 0), true);
  }
});

test('new infections: per cell, per day and in total, and they must add up to the page', () => {
  const args = {
    timesteps: grid(48),
    presence: presence({ 5: 2 }),
    incidence: incidence(48, { 5: 2, 30: 3, 31: 1 })
  };
  const value = build({ ...args, expectedNewInfections: 6 });
  assert.equal(value.hasIncidence, true);
  assert.equal(value.totalNewInfections, 6);
  assert.equal(value.cells[0][4].newInfections, 2);
  assert.equal(value.cells[1][5].newInfections, 3);
  assert.deepEqual(
    value.perDay.map((day) => day.newInfections),
    [2, 4]
  );
  assert.equal(failure({ ...args, expectedNewInfections: 7 }), 'mismatch');
  assert.equal(failure({ ...args, expectedNewInfections: 5 }), 'mismatch');
  // Not given, or not a number: nothing to compare.
  assert.equal(build({ ...args }).totalNewInfections, 6);
  assert.equal(build({ ...args, expectedNewInfections: null }).totalNewInfections, 6);
});

test('without incidence there is no infection column and nothing to add up', () => {
  for (const none of [null, undefined, []]) {
    const value = build({
      timesteps: grid(24),
      presence: presence({ 1: 1 }),
      incidence: none,
      expectedNewInfections: 99
    });
    assert.equal(value.hasIncidence, false);
    assert.equal(value.totalNewInfections, null);
    assert.equal(value.cells[0][0].newInfections, null);
    assert.equal(value.perDay[0].newInfections, null);
  }
});

test('only a complete hourly grid starting at 60 minutes is accepted', () => {
  const base = { presence: [], incidence: null };
  assert.equal(failure({ ...base, timesteps: null }), 'not-hourly');
  assert.equal(failure({ ...base, timesteps: undefined }), 'not-hourly');
  assert.equal(failure({ ...base, timesteps: [] }), 'not-hourly');
  assert.equal(failure({ ...base, timesteps: [120, 180] }), 'not-hourly');
  assert.equal(failure({ ...base, timesteps: [60, 180] }), 'not-hourly');
  assert.equal(failure({ ...base, timesteps: [60, 120, 120] }), 'not-hourly');
  assert.equal(failure({ ...base, timesteps: [0, 60, 120] }), 'not-hourly');
  assert.equal(failure({ ...base, timesteps: [60, 120.5] }), 'not-hourly');
});

test('runs of more than 100 days are not shown', () => {
  assert.equal(
    failure({ timesteps: grid(24 * 100 + 1), presence: [], incidence: null }),
    'too-long'
  );
  assert.equal(
    build({ timesteps: grid(24 * 100), presence: [], incidence: null }).days,
    100
  );
});

test('points that are not on the grid, repeat an hour or carry no count are refused', () => {
  const timesteps = grid(24);
  const bad = (point) =>
    failure({ timesteps, presence: [point], incidence: null });
  assert.equal(bad({ time: 0, 'All People': 1 }), 'misaligned');
  assert.equal(bad({ time: 25, 'All People': 1 }), 'misaligned');
  assert.equal(bad({ time: 1.5, 'All People': 1 }), 'misaligned');
  assert.equal(bad({ time: Number.NaN, 'All People': 1 }), 'misaligned');
  assert.equal(bad({ time: 3 }), 'misaligned');
  assert.equal(bad({ time: 3, 'All People': -1 }), 'misaligned');
  assert.equal(bad({ time: 3, 'All People': 1.5 }), 'misaligned');
  assert.equal(bad({ time: 3, 'All People': Number.NaN }), 'misaligned');
  assert.equal(bad({ time: 3, 'All People': '4' }), 'misaligned');
  assert.equal(bad(null), 'misaligned');
  assert.equal(
    failure({
      timesteps,
      presence: presence({ 3: 1 }).concat(presence({ 3: 2 })),
      incidence: null
    }),
    'misaligned'
  );
  assert.equal(
    failure({ timesteps, presence: 'nope', incidence: null }),
    'bad-data'
  );
});

test('an incidence series with a gap, a point off the grid or a bad count is refused', () => {
  const timesteps = grid(24);
  const full = incidence(24);
  assert.equal(
    failure({ timesteps, presence: [], incidence: full.slice(1) }),
    'misaligned'
  );
  assert.equal(
    failure({
      timesteps,
      presence: [],
      incidence: [...full.slice(0, 23), { time: 99, 'New infections': 0 }]
    }),
    'misaligned'
  );
  assert.equal(
    failure({
      timesteps,
      presence: [],
      incidence: [...full.slice(0, 23), { time: 24, 'New infections': -1 }]
    }),
    'misaligned'
  );
});

test('totals that cannot be added up exactly are refused', () => {
  const huge = 2 ** 45;
  assert.equal(
    failure({
      timesteps: grid(24),
      presence: [],
      incidence: incidence(24, { 1: huge, 2: huge })
    }),
    'inexact'
  );
});

test('the screen table keeps the people when only the infections do not line up', () => {
  const timesteps = grid(48);
  const good = {
    timesteps,
    presence: presence({ 5: 2 }),
    incidence: incidence(48, { 5: 2 }),
    expectedNewInfections: 2
  };
  const ok = buildPlaceTable(good);
  assert.equal(ok.result.ok, true);
  assert.equal(ok.infectionsLeftOut, false);
  assert.equal(ok.result.value.hasIncidence, true);

  // They do not add up to the page: people stay, infections are left out.
  const off = buildPlaceTable({ ...good, expectedNewInfections: 9 });
  assert.equal(off.result.ok, true);
  assert.equal(off.infectionsLeftOut, true);
  assert.equal(off.result.value.hasIncidence, false);
  assert.equal(off.result.value.cells[0][4].people, 2);

  // Incomplete infections: same.
  const gap = buildPlaceTable({ ...good, incidence: incidence(48).slice(3) });
  assert.equal(gap.result.ok, true);
  assert.equal(gap.infectionsLeftOut, true);

  // Bad people or a bad grid still fail the whole table.
  const badPeople = buildPlaceTable({
    ...good,
    presence: [{ time: 99, 'All People': 1 }]
  });
  assert.equal(badPeople.result.ok, false);
  assert.equal(badPeople.infectionsLeftOut, false);
  const badGrid = buildPlaceTable({ ...good, timesteps: [60, 180] });
  assert.equal(badGrid.result.ok, false);
  assert.equal(badGrid.result.reason, 'not-hourly');

  // The page knows the place had infections but the answer carried none (no
  // series, an empty one or something that is not a list): the column is
  // missing and that is reported, not silent.
  for (const missing of [null, undefined, [], 'nope']) {
    const gone = buildPlaceTable({ ...good, incidence: missing });
    assert.equal(gone.result.ok, true);
    assert.equal(gone.result.value.hasIncidence, false);
    assert.equal(gone.infectionsLeftOut, true);
  }

  // Nothing expected (no infections at the place, or nothing known to compare
  // with): no column and nothing "left out".
  for (const expected of [0, null, undefined]) {
    const none = buildPlaceTable({
      ...good,
      incidence: null,
      expectedNewInfections: expected
    });
    assert.equal(none.result.ok, true);
    assert.equal(none.infectionsLeftOut, false);
  }
});

test('the busiest hour of the day is the highest mean, the first on a tie, none when empty', () => {
  const mean = new Array(24).fill(0);
  assert.equal(busiestHourOfDay(mean), null);
  mean[6] = 2;
  mean[14] = 5;
  mean[20] = 5;
  assert.deepEqual(busiestHourOfDay(mean), { hour: 14, mean: 5 });
});

test('cell wording and colours', () => {
  // Hours are numbered 1 to 24 on the screen; the table is indexed from 0.
  assert.equal(hourNumber(0), 1);
  assert.equal(hourNumber(23), 24);
  assert.equal(
    describeHour(0, 14, { people: 1, newInfections: 1 }),
    'Day 1, hour 15: 1 person, 1 new infection'
  );
  assert.equal(
    describeHour(2, 0, { people: 1200, newInfections: 0 }),
    'Day 3, hour 1: 1,200 people, 0 new infections'
  );
  assert.equal(
    describeHour(0, 23, { people: 4, newInfections: null }),
    'Day 1, hour 24: 4 people'
  );
  assert.equal(presenceColor(0, 10), HEAT_PALETTE[0]);
  assert.equal(presenceColor(10, 10), HEAT_PALETTE[HEAT_PALETTE.length - 1]);
  assert.equal(presenceColor(5, 0), HEAT_PALETTE[0]);
  // A quarter of the maximum is level 4 of 8 on the square-root scale.
  assert.equal(presenceColor(2, 8), HEAT_PALETTE[4]);
});
