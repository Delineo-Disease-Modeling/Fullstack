import assert from 'node:assert/strict';
import { test } from 'node:test';

const {
  MAX_NEIGHBORHOOD_ROWS,
  READING_HOUR,
  buildLayout,
  buildNeighborhoodTable,
  LOW_AT_HOME_PERCENT,
  MAX_COUNT,
  describeBlockGroup,
  describeCoverage,
  describeNeighborhoodCell,
  formatRate,
  formatRateInText,
  formatShare,
  isMostlyAway,
  lastDaySpread,
  limitRows,
  mostlyAwayCount,
  planNeighborhoodDays,
  ratePer1000,
  summarizeFrame
} = await import('./neighborhood-rates.ts');

function grid(first, last) {
  const out = [];
  for (let hour = first; hour <= last; hour += 1) out.push(hour * 60);
  return out;
}

// ---------------------------------------------------------------- the plan

test('the reading is taken at the last hour of every whole day of the run', () => {
  assert.equal(READING_HOUR, 24);
  const result = planNeighborhoodDays(grid(1, 84));
  assert.equal(result.ok, true);
  assert.deepEqual(result.plan.hours, [24, 48, 72]);
  assert.deepEqual(result.plan.days, [1, 2, 3]);
  assert.equal(result.plan.runHours, 84);
});

test('a grid that starts at hour 0 works the same', () => {
  const result = planNeighborhoodDays(grid(0, 48));
  assert.equal(result.ok, true);
  assert.deepEqual(result.plan.hours, [24, 48]);
  assert.deepEqual(result.plan.days, [1, 2]);
  assert.equal(result.plan.runHours, 48);
});

test('a run of exactly one day has one reading, the last frame of the run', () => {
  const result = planNeighborhoodDays(grid(1, 24));
  assert.equal(result.ok, true);
  assert.deepEqual(result.plan.hours, [24]);
  assert.deepEqual(result.plan.days, [1]);
  assert.equal(result.plan.runHours, 24);
});

test('a run shorter than a whole day has no reading', () => {
  assert.deepEqual(planNeighborhoodDays(grid(1, 23)), {
    ok: false,
    reason: 'no-days'
  });
  assert.deepEqual(planNeighborhoodDays(grid(1, 2)), {
    ok: false,
    reason: 'no-days'
  });
  assert.deepEqual(planNeighborhoodDays(grid(0, 0)), {
    ok: false,
    reason: 'no-days'
  });
});

test('a last day that is cut short gets no column, and the run length is kept for the note', () => {
  // Day 3 holds only hours 49 to 60: its last hour (72) is not in the run.
  const result = planNeighborhoodDays(grid(1, 60));
  assert.equal(result.ok, true);
  assert.deepEqual(result.plan.hours, [24, 48]);
  assert.deepEqual(result.plan.days, [1, 2]);
  assert.equal(result.plan.runHours, 60);
});

test('a grid that starts after the first reading skips that day but keeps the day numbers', () => {
  const result = planNeighborhoodDays(grid(25, 100));
  assert.equal(result.ok, true);
  assert.deepEqual(result.plan.hours, [48, 72, 96]);
  assert.deepEqual(result.plan.days, [2, 3, 4]);
});

test('a grid with a gap, no grid and junk are refused', () => {
  const gap = grid(1, 100).filter((minutes) => minutes !== 50 * 60);
  assert.deepEqual(planNeighborhoodDays(gap), { ok: false, reason: 'no-grid' });
  assert.deepEqual(planNeighborhoodDays(null), {
    ok: false,
    reason: 'no-grid'
  });
  assert.deepEqual(planNeighborhoodDays(undefined), {
    ok: false,
    reason: 'no-grid'
  });
  assert.deepEqual(planNeighborhoodDays([]), { ok: false, reason: 'no-grid' });
  assert.deepEqual(planNeighborhoodDays('abc'), {
    ok: false,
    reason: 'no-grid'
  });
});

test('the longest run shown is 100 days; one hour more is refused', () => {
  const longest = planNeighborhoodDays(grid(1, 2400));
  assert.equal(longest.ok, true);
  assert.equal(longest.plan.hours.length, 100);
  assert.equal(longest.plan.hours[99], 100 * 24);
  assert.deepEqual(planNeighborhoodDays(grid(1, 2401)), {
    ok: false,
    reason: 'too-long'
  });
});

// -------------------------------------------------------------- the layout

const HOMES = [
  { id: '1', cbg: 'A', members: 2 },
  { id: '2', cbg: 'B', members: 3 },
  { id: '3', cbg: 'A', members: 1 },
  { id: '4', cbg: 'B', members: 4 }
];

test('homes are grouped by neighborhood and their members added up', () => {
  const result = buildLayout(HOMES);
  assert.equal(result.ok, true);
  assert.deepEqual(result.layout, {
    ids: ['A', 'B'],
    residents: [3, 7],
    groupOfHome: [0, 1, 0, 1]
  });
});

test('a home with no members is fine while the neighborhood has people', () => {
  const result = buildLayout([
    { cbg: 'A', members: 0 },
    { cbg: 'A', members: 2 }
  ]);
  assert.equal(result.ok, true);
  assert.deepEqual(result.layout.residents, [2]);
});

test('homes that cannot be placed are refused, never left out', () => {
  const bad = { ok: false, reason: 'bad-homes' };
  assert.deepEqual(buildLayout(null), bad);
  assert.deepEqual(buildLayout(undefined), bad);
  assert.deepEqual(buildLayout([]), bad);
  assert.deepEqual(buildLayout('homes'), bad);
  assert.deepEqual(buildLayout({ 0: { cbg: 'A', members: 1 } }), bad);
  assert.deepEqual(buildLayout([...HOMES, null]), bad);
  assert.deepEqual(buildLayout([...HOMES, 'x']), bad);
  assert.deepEqual(buildLayout([...HOMES, [1, 2]]), bad);
  // No neighborhood, an empty one, or a number instead of a text.
  assert.deepEqual(buildLayout([...HOMES, { members: 1 }]), bad);
  assert.deepEqual(buildLayout([...HOMES, { cbg: '', members: 1 }]), bad);
  assert.deepEqual(
    buildLayout([...HOMES, { cbg: 240010001002, members: 1 }]),
    bad
  );
  // No usable count of members.
  assert.deepEqual(buildLayout([...HOMES, { cbg: 'A' }]), bad);
  assert.deepEqual(buildLayout([...HOMES, { cbg: 'A', members: '2' }]), bad);
  assert.deepEqual(buildLayout([...HOMES, { cbg: 'A', members: 1.5 }]), bad);
  assert.deepEqual(buildLayout([...HOMES, { cbg: 'A', members: -1 }]), bad);
  assert.deepEqual(
    buildLayout([...HOMES, { cbg: 'A', members: Number.NaN }]),
    bad
  );
  assert.deepEqual(
    buildLayout([...HOMES, { cbg: 'A', members: Number.POSITIVE_INFINITY }]),
    bad
  );
});

test('a neighborhood where nobody lives is refused', () => {
  assert.deepEqual(
    buildLayout([
      { cbg: 'A', members: 2 },
      { cbg: 'B', members: 0 }
    ]),
    { ok: false, reason: 'bad-homes' }
  );
});

// ------------------------------------------------------------ one frame

const LAYOUT = buildLayout(HOMES).layout;

test('a frame is summed per neighborhood: people at home and the infected among them', () => {
  // home order: A, B, A, B; two numbers per home.
  const h = [2, 1, 3, 0, 1, 1, 4, 2];
  assert.deepEqual(summarizeFrame(h, LAYOUT), {
    present: [3, 7],
    infected: [2, 2]
  });
});

test('a frame that cannot be used is refused', () => {
  assert.equal(summarizeFrame(null, LAYOUT), null);
  assert.equal(summarizeFrame(undefined, LAYOUT), null);
  assert.equal(summarizeFrame('2,1,3,0,1,1,4,2', LAYOUT), null);
  assert.equal(summarizeFrame({ length: 8 }, LAYOUT), null);
  // Not two counts per home.
  assert.equal(summarizeFrame([2, 1, 3, 0, 1, 1, 4], LAYOUT), null);
  assert.equal(summarizeFrame([2, 1, 3, 0, 1, 1, 4, 2, 0], LAYOUT), null);
  assert.equal(summarizeFrame([], LAYOUT), null);
  // Counts that are not counts.
  assert.equal(summarizeFrame([2, 1, 3, 0, 1, 1, 4, Number.NaN], LAYOUT), null);
  assert.equal(summarizeFrame([2, 1, 3, 0, 1, 1, 4, 1.5], LAYOUT), null);
  assert.equal(summarizeFrame([2, 1, 3, 0, 1, 1, 4, -1], LAYOUT), null);
  assert.equal(summarizeFrame([2, 1, 3, 0, 1, 1, 4, '2'], LAYOUT), null);
  assert.equal(summarizeFrame([2, 1, 3, 0, 1, 1, 4, null], LAYOUT), null);
  assert.equal(
    summarizeFrame([2, 1, 3, 0, 1, 1, 4, Number.POSITIVE_INFINITY], LAYOUT),
    null
  );
  // More infected than there are people at home.
  assert.equal(summarizeFrame([2, 3, 3, 0, 1, 1, 4, 2], LAYOUT), null);
});

test('summarizing a frame does not change it', () => {
  const h = [2, 1, 3, 0, 1, 1, 4, 2];
  const before = [...h];
  summarizeFrame(h, LAYOUT);
  assert.deepEqual(h, before);
});

// ---------------------------------------------------------------- the table

const PLAN = {
  hours: [24, 48, 72],
  days: [1, 2, 3],
  // The run goes on after the last reading.
  runHours: 80
};

function summary(present, infected) {
  return { present, infected };
}

test('the table has one column per reading and one row per neighborhood', () => {
  const result = buildNeighborhoodTable(
    PLAN,
    [summary([3, 7], [0, 1]), summary([3, 7], [1, 2]), summary([3, 6], [2, 2])],
    LAYOUT
  );
  assert.equal(result.ok, true);
  const { table } = result;
  assert.deepEqual(table.columns, [
    { day: 1, hour: 24 },
    { day: 2, hour: 48 },
    { day: 3, hour: 72 }
  ]);
  assert.equal(table.residents, 10);
  assert.equal(table.runHours, 80);
  // Day 3: A is 2 of 3, B is 2 of 6: A first.
  assert.deepEqual(
    table.rows.map((row) => row.id),
    ['A', 'B']
  );
  assert.deepEqual(table.rows[0], {
    id: 'A',
    residents: 3,
    cells: [
      { present: 3, infected: 0 },
      { present: 3, infected: 1 },
      { present: 3, infected: 2 }
    ]
  });
  assert.deepEqual(table.rows[1].cells[2], { present: 6, infected: 2 });
  assert.deepEqual(table.totals, [
    { present: 10, infected: 1 },
    { present: 10, infected: 3 },
    { present: 9, infected: 4 }
  ]);
});

test('rows are ordered by the rate on the last day, not by the count', () => {
  // B has more infected people (3) but a lower rate (3 of 7) than A (2 of 3).
  const result = buildNeighborhoodTable(
    { hours: [24], days: [1], runHours: 24 },
    [summary([3, 7], [2, 3])],
    LAYOUT
  );
  assert.deepEqual(
    result.table.rows.map((row) => row.id),
    ['A', 'B']
  );
  // Flip it: B 5 of 7 beats A 2 of 3.
  const flipped = buildNeighborhoodTable(
    { hours: [24], days: [1], runHours: 24 },
    [summary([3, 7], [2, 5])],
    LAYOUT
  );
  assert.deepEqual(
    flipped.table.rows.map((row) => row.id),
    ['B', 'A']
  );
});

test('equal rates are compared exactly; ties go to more infected people, then to the lower id', () => {
  const layout = buildLayout([
    { cbg: 'C', members: 6 },
    { cbg: 'A', members: 3 },
    { cbg: 'B', members: 3 },
    { cbg: 'D', members: 10 }
  ]).layout;
  // C: 2 of 6, A: 1 of 3, B: 1 of 3 (all one third), D: 4 of 10 (higher).
  const result = buildNeighborhoodTable(
    { hours: [24], days: [1], runHours: 24 },
    [summary([6, 3, 3, 10], [2, 1, 1, 4])],
    layout
  );
  assert.deepEqual(
    result.table.rows.map((row) => row.id),
    ['D', 'C', 'A', 'B']
  );
});

test('a neighborhood with nobody at home on the last day goes last', () => {
  const result = buildNeighborhoodTable(
    { hours: [24], days: [1], runHours: 24 },
    [summary([0, 7], [0, 0])],
    LAYOUT
  );
  assert.deepEqual(
    result.table.rows.map((row) => row.id),
    ['B', 'A']
  );
});

test('frames that do not fit the run are refused', () => {
  const frames = [
    summary([3, 7], [0, 1]),
    summary([3, 7], [1, 2]),
    summary([3, 7], [2, 2])
  ];
  const ok = buildNeighborhoodTable(PLAN, frames, LAYOUT);
  assert.equal(ok.ok, true);
  const bad = (summaries) => buildNeighborhoodTable(PLAN, summaries, LAYOUT);
  // Wrong number of frames, a missing frame, a frame for other neighborhoods.
  assert.deepEqual(bad(frames.slice(0, 2)), {
    ok: false,
    reason: 'bad-frames'
  });
  assert.deepEqual(bad([...frames, frames[0]]), {
    ok: false,
    reason: 'bad-frames'
  });
  assert.deepEqual(bad([frames[0], null, frames[2]]), {
    ok: false,
    reason: 'bad-frames'
  });
  assert.deepEqual(bad([frames[0], undefined, frames[2]]), {
    ok: false,
    reason: 'bad-frames'
  });
  assert.deepEqual(bad([frames[0], summary([3], [1]), frames[2]]), {
    ok: false,
    reason: 'bad-frames'
  });
  assert.deepEqual(bad([frames[0], summary([3, 7], [1]), frames[2]]), {
    ok: false,
    reason: 'bad-frames'
  });
  // More infected than present, or a count that is not a count.
  assert.deepEqual(bad([frames[0], summary([3, 7], [4, 2]), frames[2]]), {
    ok: false,
    reason: 'bad-frames'
  });
  assert.deepEqual(bad([frames[0], summary([3, 7], [1, 2.5]), frames[2]]), {
    ok: false,
    reason: 'bad-frames'
  });
  assert.deepEqual(bad([frames[0], summary([3, -7], [1, 2]), frames[2]]), {
    ok: false,
    reason: 'bad-frames'
  });
});

test('more people at home than the homes list as members is not an error: the rate divides by the people at home', () => {
  // members is only roughly the number of residents: an archived zone has homes
  // with one person more at home than members.
  const result = buildNeighborhoodTable(
    { hours: [24], days: [1], runHours: 24 },
    [summary([4, 7], [2, 0])],
    LAYOUT
  );
  assert.equal(result.ok, true);
  const a = result.table.rows.find((row) => row.id === 'A');
  assert.deepEqual(a.cells[0], { present: 4, infected: 2 });
  assert.equal(ratePer1000(a.cells[0].infected, a.cells[0].present), 500);
  assert.equal(formatShare(4, 3), '>100%');
});

test('building the table does not change what it was given', () => {
  const frames = [
    summary([3, 7], [0, 1]),
    summary([3, 7], [1, 2]),
    summary([3, 7], [2, 2])
  ];
  const before = JSON.stringify([frames, PLAN, LAYOUT]);
  buildNeighborhoodTable(PLAN, frames, LAYOUT);
  assert.equal(JSON.stringify([frames, PLAN, LAYOUT]), before);
});

// ------------------------------------------------------------- the helpers

function manyRows(count) {
  const homes = [];
  for (let i = 0; i < count; i += 1) {
    homes.push({ cbg: `N${String(i).padStart(3, '0')}`, members: 10 });
  }
  const layout = buildLayout(homes).layout;
  // Neighborhood i has i infected out of 10 at home on the single day (max 9).
  const present = homes.map(() => 10);
  const infected = homes.map((_, i) => Math.min(i, 10));
  return buildNeighborhoodTable(
    { hours: [24], days: [1], runHours: 24 },
    [summary(present, infected)],
    layout
  ).table;
}

test('rows past the limit are counted, and the colour scale only looks at shown rows', () => {
  const table = manyRows(60);
  assert.equal(MAX_NEIGHBORHOOD_ROWS, 50);
  const all = limitRows(table);
  assert.equal(all.rows.length, 50);
  assert.equal(all.hiddenRows, 10);
  // The shown rows are the highest ones.
  assert.equal(all.rows[0].cells[0].infected, 10);
  const few = limitRows(table, 3);
  assert.equal(few.rows.length, 3);
  assert.equal(few.hiddenRows, 57);
  assert.equal(few.maxRate, 1000);
  assert.equal(limitRows(table, 0).rows.length, 0);
  assert.equal(limitRows(table, 0).maxRate, 0);
  assert.equal(limitRows(table, -5).rows.length, 0);
  const small = manyRows(3);
  assert.equal(limitRows(small).hiddenRows, 0);
  assert.equal(limitRows(small).maxRate, 200);
});

test('the spread on the last day needs two neighborhoods with people at home', () => {
  const table = buildNeighborhoodTable(
    PLAN,
    [summary([3, 7], [0, 1]), summary([3, 7], [1, 2]), summary([3, 6], [2, 2])],
    LAYOUT
  ).table;
  const spread = lastDaySpread(table);
  assert.equal(spread.day, 3);
  assert.equal(spread.count, 2);
  assert.ok(Math.abs(spread.highest - (1000 * 2) / 3) < 1e-9);
  assert.ok(Math.abs(spread.lowest - (1000 * 2) / 6) < 1e-9);

  const empty = buildNeighborhoodTable(
    { hours: [24], days: [1], runHours: 24 },
    [summary([0, 7], [0, 1])],
    LAYOUT
  ).table;
  assert.equal(lastDaySpread(empty), null);

  const single = buildNeighborhoodTable(
    { hours: [24], days: [1], runHours: 24 },
    [summary([3], [1])],
    buildLayout([{ cbg: 'A', members: 3 }]).layout
  ).table;
  assert.equal(lastDaySpread(single), null);
});

test('rates are per 1,000 people at home', () => {
  assert.equal(ratePer1000(1, 4), 250);
  assert.equal(ratePer1000(0, 4), 0);
  assert.equal(ratePer1000(0, 0), null);
  assert.equal(ratePer1000(5, 0), null);
});

test('a rate is shown with one decimal below 10 and whole from 10 up', () => {
  assert.equal(formatRate(null), '–');
  assert.equal(formatRate(0), '·');
  assert.equal(formatRate(3.12), '3.1');
  assert.equal(formatRate(9.94), '9.9');
  assert.equal(formatRate(9.96), '10');
  assert.equal(formatRate(10.4), '10');
  assert.equal(formatRate(533.2), '533');
  assert.equal(formatRate(999.6), '1000');
  assert.equal(formatRate(1000), '1000');
});

test('a rate above zero is never shown as 0.0', () => {
  assert.equal(formatRate(0.04), '<0.1');
  assert.equal(formatRate(0.001), '<0.1');
  assert.equal(formatRate(0.05), '0.1');
  assert.equal(formatRate(0.1), '0.1');
});

test('the share at home is rounded down, so it never shows 100% when somebody is away, and more than listed is not capped', () => {
  assert.equal(formatShare(95, 100), '95%');
  assert.equal(formatShare(999, 1000), '99%');
  assert.equal(formatShare(100, 100), '100%');
  assert.equal(formatShare(120, 100), '>100%');
  assert.equal(formatShare(0, 100), '0%');
  assert.equal(formatShare(5, 0), '–');
});

test('a cell is described in words', () => {
  assert.equal(
    describeNeighborhoodCell('240010001002', 3, { present: 650, infected: 12 }),
    'Day 3, 240010001002: 12 of 650 people at home had been infected (18 per 1,000)'
  );
  assert.equal(
    describeNeighborhoodCell('A', 1, { present: 1, infected: 0 }),
    'Day 1, A: 0 of 1 person at home had been infected (0 per 1,000)'
  );
  assert.equal(
    describeNeighborhoodCell('A', 2, { present: 0, infected: 0 }),
    'Day 2, A: nobody was at home at the end of the day'
  );
  assert.equal(
    describeNeighborhoodCell('A', 2, { present: 1500, infected: 1234 }),
    'Day 2, A: 1,234 of 1,500 people at home had been infected (823 per 1,000)'
  );
});

test('a neighborhood is marked when fewer than half of its residents are at home', () => {
  assert.equal(LOW_AT_HOME_PERCENT, 50);
  assert.equal(isMostlyAway(49, 100), true);
  assert.equal(isMostlyAway(50, 100), false);
  assert.equal(isMostlyAway(70, 100), false);
  assert.equal(isMostlyAway(100, 100), false);
  assert.equal(isMostlyAway(120, 100), false);
  assert.equal(isMostlyAway(0, 100), true);
  assert.equal(isMostlyAway(29, 187), true);
  assert.equal(isMostlyAway(3, 0), false);
});

test('the marked neighborhoods are counted on the last day, over all rows', () => {
  const table = buildNeighborhoodTable(
    PLAN,
    [summary([3, 7], [0, 1]), summary([1, 7], [0, 1]), summary([3, 3], [1, 2])],
    LAYOUT
  ).table;
  // Last day: A 3 of 3 at home, B 3 of 7 (43%): one marked. Day 2 does not count.
  assert.equal(mostlyAwayCount(table), 1);
  const none = buildNeighborhoodTable(
    PLAN,
    [summary([3, 7], [0, 1]), summary([3, 7], [0, 1]), summary([3, 7], [1, 2])],
    LAYOUT
  ).table;
  assert.equal(mostlyAwayCount(none), 0);
});

test('inside a sentence a zero rate is a plain 0, not the table dot', () => {
  assert.equal(formatRateInText(0), '0');
  assert.equal(formatRateInText(null), '–');
  assert.equal(formatRateInText(3.12), '3.1');
  assert.equal(formatRateInText(533.2), '533');
  assert.equal(formatRateInText(0.04), '<0.1');
});

test('a 12-digit id is described as a census block group, anything else is left alone', () => {
  assert.equal(
    describeBlockGroup('401139400082'),
    'Census block group 401139400082: state 40, county 113, tract 940008, block group 2'
  );
  assert.equal(
    describeBlockGroup('240010001002'),
    'Census block group 240010001002: state 24, county 001, tract 000100, block group 2'
  );
  for (const id of [
    'A',
    '',
    '24001000100',
    '2400100010021',
    '24001000100a',
    ' 240010001002',
    '240010001002 '
  ]) {
    assert.equal(describeBlockGroup(id), null);
  }
});

// ---- boundaries and orderings the first tests did not pin down

test('a grid that starts exactly at the first reading hour, or ends exactly at one, keeps those days', () => {
  const both = planNeighborhoodDays(grid(24, 48));
  assert.equal(both.ok, true);
  assert.deepEqual(both.plan.hours, [24, 48]);
  assert.deepEqual(both.plan.days, [1, 2]);
  const late = planNeighborhoodDays(grid(25, 48));
  assert.deepEqual(late.plan.hours, [48]);
  assert.deepEqual(late.plan.days, [2]);
  const early = planNeighborhoodDays(grid(1, 47));
  assert.deepEqual(early.plan.hours, [24]);
});

test('a neighborhood with a single resident is fine', () => {
  const result = buildLayout([
    { cbg: 'A', members: 1 },
    { cbg: 'B', members: 5 }
  ]);
  assert.equal(result.ok, true);
  assert.deepEqual(result.layout.residents, [1, 5]);
});

// The order of the rows must not depend on the order the homes came in, so
// every permutation of the neighborhoods is tried against the same expectation.
function permutations(items) {
  if (items.length <= 1) return [items];
  const out = [];
  items.forEach((item, index) => {
    const rest = [...items.slice(0, index), ...items.slice(index + 1)];
    for (const tail of permutations(rest)) out.push([item, ...tail]);
  });
  return out;
}

function orderFor(spec, order) {
  // spec: id -> { members, present, infected }; order: ids in the order of the homes.
  const homes = order.map((id) => ({ cbg: id, members: spec[id].members }));
  const layout = buildLayout(homes).layout;
  const present = order.map((id) => spec[id].present);
  const infected = order.map((id) => spec[id].infected);
  const result = buildNeighborhoodTable(
    { hours: [24], days: [1], runHours: 24 },
    [{ present, infected }],
    layout
  );
  assert.equal(result.ok, true);
  return result.table.rows.map((row) => row.id);
}

test('the order of the rows is the same whatever order the homes come in', () => {
  const spec = {
    // 1/3 (tie, 2 infected), 1/3 (tie, 1 infected), 1/3 (tie, 1 infected, later id),
    // a higher rate with fewer people, a lower rate with more infected, and an
    // empty one (nobody at home).
    C: { members: 6, present: 6, infected: 2 },
    A: { members: 3, present: 3, infected: 1 },
    B: { members: 3, present: 3, infected: 1 },
    D: { members: 2, present: 2, infected: 2 },
    E: { members: 30, present: 30, infected: 5 },
    F: { members: 4, present: 0, infected: 0 },
    G: { members: 4, present: 0, infected: 0 }
  };
  const expected = ['D', 'C', 'A', 'B', 'E', 'F', 'G'];
  const ids = Object.keys(spec);
  // 7! = 5040 orders is more than needed; rotate and reverse instead of all.
  const orders = [];
  for (let shift = 0; shift < ids.length; shift += 1) {
    const rotated = [...ids.slice(shift), ...ids.slice(0, shift)];
    orders.push(rotated, [...rotated].reverse());
  }
  for (const order of orders) {
    assert.deepEqual(orderFor(spec, order), expected, order.join(''));
  }
});

test('every order of four neighborhoods gives the same rows, with ties and an empty one', () => {
  const spec = {
    A: { members: 4, present: 4, infected: 2 },
    B: { members: 2, present: 2, infected: 1 },
    C: { members: 5, present: 5, infected: 1 },
    D: { members: 3, present: 0, infected: 0 }
  };
  // A and B tie at 1/2 (A has more infected), C is lower, D has nobody at home.
  for (const order of permutations(Object.keys(spec))) {
    assert.deepEqual(
      orderFor(spec, order),
      ['A', 'B', 'C', 'D'],
      order.join('')
    );
  }
});

test('the marker for neighborhoods that were mostly away has exact boundaries', () => {
  assert.equal(isMostlyAway(0, 1), true);
  assert.equal(isMostlyAway(1, 1), false);
  assert.equal(isMostlyAway(499, 1000), true);
  assert.equal(isMostlyAway(500, 1000), false);
  assert.equal(isMostlyAway(496, 1000), true);
});

test('the marked neighborhoods are counted on the LAST day, not on another one', () => {
  // Day 2: nobody away. Day 3 (last): B has 3 of 7 at home.
  const lastOnly = buildNeighborhoodTable(
    PLAN,
    [summary([3, 7], [0, 1]), summary([3, 7], [0, 1]), summary([3, 3], [1, 2])],
    LAYOUT
  ).table;
  assert.equal(mostlyAwayCount(lastOnly), 1);
  // Day 2 has a neighborhood away, the last day has none.
  const earlierOnly = buildNeighborhoodTable(
    PLAN,
    [summary([3, 7], [0, 1]), summary([3, 3], [0, 1]), summary([3, 7], [1, 2])],
    LAYOUT
  ).table;
  assert.equal(mostlyAwayCount(earlierOnly), 0);
  // A table with a single column.
  const single = buildNeighborhoodTable(
    { hours: [24], days: [1], runHours: 24 },
    [summary([3, 3], [1, 2])],
    LAYOUT
  ).table;
  assert.equal(mostlyAwayCount(single), 1);
});

test('the spread of a table with a single column is read from that column', () => {
  const single = buildNeighborhoodTable(
    { hours: [24], days: [1], runHours: 24 },
    [summary([3, 7], [1, 7])],
    LAYOUT
  ).table;
  const spread = lastDaySpread(single);
  assert.equal(spread.day, 1);
  assert.equal(spread.count, 2);
  assert.ok(Math.abs(spread.highest - 1000) < 1e-9);
  assert.ok(Math.abs(spread.lowest - 1000 / 3) < 1e-9);
});

test('the share at home for one resident', () => {
  assert.equal(formatShare(1, 1), '100%');
  assert.equal(formatShare(0, 1), '0%');
});

test('nobody at home sorts after a neighborhood with no infections, whatever the ids are', () => {
  const spec = {
    A: { members: 3, present: 0, infected: 0 },
    B: { members: 5, present: 5, infected: 0 },
    C: { members: 4, present: 0, infected: 0 }
  };
  for (const order of permutations(Object.keys(spec))) {
    assert.deepEqual(orderFor(spec, order), ['B', 'A', 'C'], order.join(''));
  }
});

test('the helpers cope with a table that has no columns', () => {
  const empty = {
    columns: [],
    rows: [],
    totals: [],
    residents: 0,
    runHours: 0
  };
  assert.equal(mostlyAwayCount(empty), 0);
  assert.equal(lastDaySpread(empty), null);
  assert.deepEqual(limitRows(empty), { rows: [], hiddenRows: 0, maxRate: 0 });
});

test('the last day says how many infected people it counts against the run total', () => {
  const table = buildNeighborhoodTable(
    PLAN,
    [summary([3, 7], [0, 1]), summary([3, 7], [1, 2]), summary([3, 6], [2, 2])],
    LAYOUT
  ).table;
  assert.equal(
    describeCoverage(table, 1643),
    "On day 3, 4 people at home had been infected, counting those infected at the start. The whole run recorded 1,643 new infections, not counting the people infected at the start. Infected people who were away from home at that hour, or who were infected later, are not in that day's count."
  );
  assert.match(describeCoverage(table, 1), /recorded 1 new infection,/);
  assert.match(describeCoverage(table, 0), /recorded 0 new infections,/);
  const one = buildNeighborhoodTable(
    { hours: [24], days: [1], runHours: 24 },
    [summary([3, 7], [1, 0])],
    LAYOUT
  ).table;
  assert.match(
    describeCoverage(one, 10),
    /^On day 1, 1 person at home had been infected, counting those/
  );
  // More infected people than the run recorded is possible (the people infected at the start).
  assert.match(
    describeCoverage(one, 0),
    /^On day 1, 1 person at home had been infected/
  );
  assert.equal(describeCoverage(table, null), null);
  assert.equal(
    describeCoverage(
      { columns: [], rows: [], totals: [], residents: 0, runHours: 0 },
      5
    ),
    null
  );
});

test('counts that are not believable are refused, so no rate can overflow or compare wrongly', () => {
  assert.equal(MAX_COUNT, 2 ** 26);
  // members
  assert.equal(buildLayout([{ cbg: 'A', members: MAX_COUNT }]).ok, true);
  assert.equal(buildLayout([{ cbg: 'A', members: MAX_COUNT + 1 }]).ok, false);
  assert.equal(buildLayout([{ cbg: 'A', members: 1e308 }]).ok, false);
  // many homes whose members add up to too many
  assert.equal(
    buildLayout([
      { cbg: 'A', members: MAX_COUNT },
      { cbg: 'A', members: 1 }
    ]).ok,
    false
  );
  // one home
  const one = buildLayout([{ cbg: 'A', members: 2 }]).layout;
  assert.notEqual(summarizeFrame([MAX_COUNT, MAX_COUNT], one), null);
  assert.equal(summarizeFrame([MAX_COUNT + 1, 0], one), null);
  assert.equal(summarizeFrame([1e308, 1e308], one), null);
  assert.equal(summarizeFrame([Number.MAX_SAFE_INTEGER, 0], one), null);
  // many homes whose people at home add up to too many
  const two = buildLayout([
    { cbg: 'A', members: 1 },
    { cbg: 'A', members: 1 }
  ]).layout;
  assert.equal(summarizeFrame([MAX_COUNT, 0, 1, 0], two), null);
  assert.notEqual(summarizeFrame([MAX_COUNT - 1, 0, 1, 0], two), null);
  // the biggest accepted counts give a finite, exact rate
  assert.equal(ratePer1000(MAX_COUNT, MAX_COUNT), 1000);
});

test('the coverage sentence only speaks of later infections when the run goes on after the last reading', () => {
  const ends = buildNeighborhoodTable(
    { hours: [24], days: [1], runHours: 24 },
    [summary([3, 7], [1, 2])],
    LAYOUT
  ).table;
  const goesOn = buildNeighborhoodTable(
    { hours: [24], days: [1], runHours: 30 },
    [summary([3, 7], [1, 2])],
    LAYOUT
  ).table;
  assert.match(
    describeCoverage(ends, 9),
    /Infected people who were away from home at that hour are not in that day's count\.$/
  );
  assert.doesNotMatch(describeCoverage(ends, 9), /infected later/);
  assert.match(
    describeCoverage(goesOn, 9),
    /away from home at that hour, or who were infected later, are not in that day's count\.$/
  );
});
