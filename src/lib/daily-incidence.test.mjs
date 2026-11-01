import assert from 'node:assert/strict';
import { test } from 'node:test';

const {
  buildDaily,
  buildHeatmap,
  describeColumn,
  finalFrameMatches,
  HEAT_PALETTE,
  heatLevel,
  MAX_DAY_COLUMNS,
  MAX_EXACT_TOTAL,
  planDays,
  toHeatPlaces
} = await import('./daily-incidence.ts');

function makeRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

// timesteps (minutes) of an hourly grid from `first` to `last` hour
function grid(first, last) {
  const out = [];
  for (let hour = first; hour <= last; hour += 1) out.push(hour * 60);
  return out;
}

// ---------------------------------------------------------------- planDays

test('planDays: day ends are 24, 48, ... and the last frame; a short last day is marked', () => {
  const plan = (first, last) => {
    const result = planDays(grid(first, last));
    assert.equal(result.ok, true, `${first}..${last}`);
    return result.plan;
  };
  const shape = (p) => p.columns.map((c) => [c.fromHour, c.toHour, c.partial]);

  assert.deepEqual(plan(1, 1).hours, [1]);
  assert.deepEqual(shape(plan(1, 1)), [[0, 1, true]]);
  assert.deepEqual(shape(plan(1, 23)), [[0, 23, true]]);
  assert.deepEqual(plan(1, 24).hours, [24]); // exactly one day, not two columns
  assert.deepEqual(shape(plan(1, 24)), [[0, 24, false]]);
  assert.deepEqual(plan(1, 25).hours, [24, 25]);
  assert.deepEqual(shape(plan(1, 25)), [
    [0, 24, false],
    [24, 25, true]
  ]);
  assert.deepEqual(plan(1, 48).hours, [24, 48]);
  assert.deepEqual(plan(2, 168).hours, [24, 48, 72, 96, 120, 144, 168]);
  assert.equal(plan(24, 48).startHour, null); // a first frame at hour 24 is enough
  assert.deepEqual(plan(1, 672).columns.length, 28);
  // every column starts where the previous one ended
  for (const p of [plan(1, 100), plan(1, 24), plan(5, 49)]) {
    p.columns.forEach((c, i) => {
      assert.equal(c.index, i);
      assert.equal(c.fromHour, i === 0 ? 0 : p.columns[i - 1].toHour);
      assert.equal(c.hours, c.toHour - c.fromHour);
    });
  }
});

test('planDays: a frame at hour 0 becomes the start of day 1', () => {
  const result = planDays(grid(0, 48));
  assert.equal(result.ok, true);
  assert.equal(result.plan.startHour, 0);
  assert.deepEqual(result.plan.hours, [0, 24, 48]);
  assert.equal(result.plan.columns.length, 2);
  const short = planDays(grid(0, 12));
  assert.deepEqual(short.plan.hours, [0, 12]);
  assert.deepEqual(
    short.plan.columns.map((c) => c.toHour),
    [12]
  );
});

test('planDays refuses what is not a by-day grid', () => {
  const reason = (timesteps) => {
    const result = planDays(timesteps);
    assert.equal(result.ok, false);
    return result.reason;
  };
  assert.equal(reason(null), 'no-grid');
  assert.equal(reason(undefined), 'no-grid');
  assert.equal(reason([]), 'no-grid');
  assert.equal(reason([60, 120, 240]), 'no-grid'); // a gap
  assert.equal(reason([30, 90, 150]), 'no-grid'); // not whole hours
  assert.equal(reason([0]), 'no-days'); // only the hour-0 frame
  assert.equal(reason(grid(25, 80)), 'starts-late');
  assert.equal(reason(grid(30, 80)), 'starts-late');
  const longest = planDays(grid(1, MAX_DAY_COLUMNS * 24));
  assert.equal(longest.ok, true);
  assert.equal(longest.plan.columns.length, MAX_DAY_COLUMNS);
  assert.equal(reason(grid(1, MAX_DAY_COLUMNS * 24 + 1)), 'too-long');
});

test('planDays ignores the order and duplicates of the manifest list', () => {
  const shuffled = [...grid(1, 48)].reverse().concat([60, 120]);
  const result = planDays(shuffled);
  assert.equal(result.ok, true);
  assert.deepEqual(result.plan.hours, [24, 48]);
});

// ------------------------------------------------------------- buildDaily

const IDS = ['a', 'b', 'c'];

function frame(pinc, hinc) {
  return hinc === undefined ? { pinc } : { pinc, hinc };
}

function okPlan(first, last) {
  return planDays(grid(first, last)).plan;
}

test('buildDaily: the first day starts from zero, the next ones from the previous frame', () => {
  const plan = okPlan(1, 72);
  const frames = [
    frame([5, 0, 1], 10), // hour 24
    frame([8, 2, 1], 14), // hour 48
    frame([8, 9, 4], 20) // hour 72
  ];
  const wholeRun = { home: 20, places: { a: 8, b: 9, c: 4 } };
  const result = buildDaily(plan, frames, IDS, wholeRun);
  assert.equal(result.ok, true);
  const { days } = result.daily;
  assert.deepEqual(
    days.map((d) => d.home),
    [10, 4, 6]
  );
  assert.deepEqual(days[0].places, { a: 5, c: 1 });
  assert.deepEqual(days[1].places, { a: 3, b: 2 });
  assert.deepEqual(days[2].places, { b: 7, c: 3 });
  assert.equal(result.daily.hasHome, true);
});

test('buildDaily agrees with a brute-force sum over random runs', () => {
  const random = makeRandom(2024);
  const int = (low, high) => low + Math.floor(random() * (high - low + 1));
  const names = ['a', 'b', 'constructor', '__proto__', 'toString', '7', 'x y'];
  for (let round = 0; round < 600; round += 1) {
    const first = [0, 1, 1, 1, 2, 24][int(0, 5)];
    const last = int(Math.max(first, 1), 130);
    const placeCount = int(1, names.length);
    const ids = names.slice(0, placeCount);
    // new infections per hour (index = hour); none recorded at hour 0
    const inc = [];
    for (let hour = 0; hour <= last; hour += 1) {
      inc.push({
        home: hour === 0 ? 0 : int(0, 3),
        places: ids.map(() => (hour === 0 || random() < 0.6 ? 0 : int(0, 9)))
      });
    }
    const cumulative = (hour) => ({
      home: inc.slice(0, hour + 1).reduce((s, x) => s + x.home, 0),
      places: ids.map((_, i) =>
        inc.slice(0, hour + 1).reduce((s, x) => s + x.places[i], 0)
      )
    });
    const planned = planDays(grid(first, last));
    assert.equal(planned.ok, true);
    const { plan } = planned;
    const frames = plan.hours.map((hour) => {
      const c = cumulative(hour);
      return frame(c.places, c.home);
    });
    const end = cumulative(last);
    const wholeRun = {
      home: end.home,
      places: Object.fromEntries(
        ids.flatMap((id, i) => (end.places[i] > 0 ? [[id, end.places[i]]] : []))
      )
    };
    const result = buildDaily(plan, frames, ids, wholeRun);
    assert.equal(result.ok, true, `round ${round}`);
    const { daily } = result;
    assert.equal(daily.days.length, plan.columns.length);
    plan.columns.forEach((column, d) => {
      let home = 0;
      const places = ids.map(() => 0);
      for (let hour = column.fromHour + 1; hour <= column.toHour; hour += 1) {
        home += inc[hour].home;
        inc[hour].places.forEach((v, i) => {
          places[i] += v;
        });
      }
      assert.equal(daily.days[d].home, home, `round ${round} day ${d} home`);
      ids.forEach((id, i) => {
        const got = Object.hasOwn(daily.days[d].places, id)
          ? daily.days[d].places[id]
          : 0;
        assert.equal(got, places[i], `round ${round} day ${d} ${id}`);
      });
    });
  }
});

test('buildDaily refuses a cumulative count that goes down', () => {
  const plan = okPlan(1, 72);
  const wholeRun = { home: 0, places: { a: 10 } };
  // [10, 4, 9]: clamping would make 10, 0, 5 (sum 15), which never happened
  const frames = [
    frame([10, 0, 0], 0),
    frame([4, 0, 0], 0),
    frame([9, 0, 0], 0)
  ];
  assert.deepEqual(buildDaily(plan, frames, IDS, wholeRun), {
    ok: false,
    reason: 'decreasing'
  });
  const homeDown = [
    frame([1, 0, 0], 5),
    frame([1, 0, 0], 3),
    frame([1, 0, 0], 6)
  ];
  assert.equal(
    buildDaily(plan, homeDown, IDS, { home: 6, places: { a: 1 } }).reason,
    'decreasing'
  );
  // a fraction that truncates to the same count is not a decrease
  const fine = [
    frame([1.9, 0, 0], 0),
    frame([1, 0, 0], 0),
    frame([1, 0, 0], 0)
  ];
  assert.equal(
    buildDaily(plan, fine, IDS, { home: 0, places: { a: 1 } }).ok,
    true
  );
});

test('buildDaily refuses missing, wrong-length or invalid frames, and never invents a zero start', () => {
  const plan = okPlan(1, 72);
  const wholeRun = { home: 0, places: {} };
  const good = frame([0, 0, 0], 0);
  const reason = (frames, ids = IDS) =>
    buildDaily(plan, frames, ids, wholeRun).reason;
  assert.equal(reason([good, good]), 'bad-frames'); // too few
  assert.equal(reason([good, good, good, good]), 'bad-frames'); // too many
  assert.equal(reason([good, undefined, good]), 'bad-frames'); // a hole
  assert.equal(reason([good, null, good]), 'bad-frames');
  assert.equal(reason([good, frame([0, 0], 0), good]), 'bad-frames'); // wrong length
  assert.equal(reason([good, frame([0, -1, 0], 0), good]), 'bad-frames');
  assert.equal(reason([good, frame([0, 'x', 0], 0), good]), 'bad-frames');
  assert.equal(
    reason([good, { pinc: [0, 0, 0], hinc: 'x' }, good]),
    'bad-frames'
  );
  assert.equal(reason([good, {}, good]), 'bad-frames');
  // a hole at day 1 must not give day 2 the whole cumulative count
  const withHole = [undefined, frame([9, 9, 9], 9), frame([9, 9, 9], 9)];
  assert.equal(
    buildDaily(plan, withHole, IDS, { home: 9, places: { a: 9, b: 9, c: 9 } })
      .ok,
    false
  );
});

test('buildDaily refuses days that do not add up to the whole-run numbers', () => {
  const plan = okPlan(1, 48);
  const frames = [frame([1, 2, 3], 4), frame([2, 4, 6], 8)];
  const ok = { home: 8, places: { a: 2, b: 4, c: 6 } };
  assert.equal(buildDaily(plan, frames, IDS, ok).ok, true);
  assert.equal(
    buildDaily(plan, frames, IDS, { ...ok, home: 9 }).reason,
    'mismatch'
  );
  assert.equal(
    buildDaily(plan, frames, IDS, { ...ok, places: { ...ok.places, b: 5 } })
      .reason,
    'mismatch'
  );
  // a place the page knows nothing about, or one it lists with no infections
  assert.equal(
    buildDaily(plan, frames, IDS, { ...ok, places: { a: 2, b: 4 } }).reason,
    'mismatch'
  );
  assert.equal(
    buildDaily(plan, [frame([0, 0, 0], 0), frame([0, 0, 0], 0)], IDS, {
      home: 0,
      places: { a: 0 }
    }).ok,
    true
  );
});

test('buildDaily leaves home out when a frame has no home counter', () => {
  const plan = okPlan(1, 48);
  const frames = [frame([1, 0, 0], 3), frame([2, 0, 0])];
  const result = buildDaily(plan, frames, IDS, { home: 99, places: { a: 2 } });
  assert.equal(result.ok, true); // the home total is not compared, it is not recorded
  assert.equal(result.daily.hasHome, false);
  assert.deepEqual(
    result.daily.days.map((d) => d.home),
    [null, null]
  );
});

test('buildDaily uses the frame at hour 0 as the start of day 1', () => {
  const plan = okPlan(0, 24);
  assert.deepEqual(plan.hours, [0, 24]);
  const frames = [frame([3, 0, 0], 1), frame([8, 0, 0], 4)];
  const result = buildDaily(plan, frames, IDS, { home: 3, places: { a: 5 } });
  // day 1 is the difference of the two frames, not the whole 8
  assert.equal(result.ok, true);
  assert.deepEqual(result.daily.days[0].places, { a: 5 });
  assert.equal(result.daily.days[0].home, 3);
});

test('buildDaily refuses totals that cannot be added exactly', () => {
  const plan = okPlan(1, 24);
  const big = MAX_EXACT_TOTAL;
  const wholeRun = { home: 0, places: { a: big, b: 1 } };
  assert.equal(
    buildDaily(plan, [frame([big, 1, 0], 0)], IDS, wholeRun).reason,
    'inexact'
  );
  const atLimit = { home: 0, places: { a: big } };
  assert.equal(
    buildDaily(plan, [frame([big, 0, 0], 0)], IDS, atLimit).ok,
    true
  );
  // beyond the safe-integer range a single count is already refused as invalid
  assert.equal(
    buildDaily(plan, [frame([2 ** 60, 0, 0], 0)], IDS, { home: 0, places: {} })
      .reason,
    'bad-frames'
  );
});

test('buildDaily refuses a place list the window arithmetic cannot use', () => {
  const plan = okPlan(1, 24);
  const frames = [frame([1, 2, 3], 0)];
  const wholeRun = { home: 0, places: { a: 1, b: 2, c: 3 } };
  // duplicate ids cannot be told apart
  assert.equal(
    buildDaily(plan, frames, ['a', 'a', 'c'], wholeRun).reason,
    'bad-frames'
  );
});

test('buildDaily counts the home total when it checks for sums that are too large', () => {
  const plan = okPlan(1, 24);
  const big = MAX_EXACT_TOTAL + 1;
  assert.equal(
    buildDaily(plan, [frame([0, 0, 0], big)], IDS, { home: big, places: {} })
      .reason,
    'inexact'
  );
});

test('finalFrameMatches compares the last frame with the whole-run numbers when the run starts from zero', () => {
  const plan = okPlan(1, 48);
  const whole = { home: 0, places: { a: 2, b: 4 } };
  assert.equal(finalFrameMatches(plan, frame([2, 4, 0], 9), IDS, whole), true);
  assert.equal(finalFrameMatches(plan, frame([3, 4, 0], 9), IDS, whole), false);
  assert.equal(finalFrameMatches(plan, frame([2, 4, 1], 9), IDS, whole), false); // c: 1 vs none
  assert.equal(
    finalFrameMatches(plan, frame([2.9, 4, 0], 9), IDS, whole),
    true
  ); // truncated
  assert.equal(finalFrameMatches(plan, frame([2, 3, 0], 9), IDS, whole), false);
});

test('finalFrameMatches cannot tell when a frame at hour 0 is the start, and says yes', () => {
  const plan = okPlan(0, 48);
  assert.equal(plan.startHour, 0);
  assert.equal(
    finalFrameMatches(plan, frame([8, 0, 0], 0), IDS, {
      home: 0,
      places: { a: 5 }
    }),
    true
  );
});

// ------------------------------------------------------------ buildHeatmap

function dailyOf(dayPlaces, homes = null) {
  const columns = dayPlaces.map((_, index) => ({
    index,
    fromHour: index * 24,
    toHour: index * 24 + 24,
    hours: 24,
    partial: false
  }));
  return {
    columns,
    hasHome: homes !== null,
    days: dayPlaces.map((places, index) => ({
      home: homes === null ? null : homes[index],
      places
    }))
  };
}

const CATALOG = [
  { id: 'a', label: 'Alpha Pub', category: 'Bars' },
  { id: 'b', label: 'Beta Pub', category: 'Bars' },
  { id: 'c', label: 'Cedar School', category: 'Schools' },
  { id: 'd', label: 'Delta Shop', category: 'Shops' },
  { id: 'e', label: 'Echo Shop', category: 'Shops' }
];

test('buildHeatmap ranks places by total, ties by catalogue order, and leaves out silent places', () => {
  const daily = dailyOf([
    { a: 1, c: 3, d: 1 },
    { a: 1, b: 2, c: 1, e: 1 }
  ]);
  const map = buildHeatmap(daily, CATALOG, 'pois', 10);
  assert.deepEqual(
    map.rows.map((r) => [r.id, r.total, r.counts]),
    [
      ['c', 4, [3, 1]],
      ['a', 2, [1, 1]], // a, b, d and e all total 2 or less: a, b before d, e
      ['b', 2, [0, 2]],
      ['d', 1, [1, 0]],
      ['e', 1, [0, 1]]
    ]
  );
  assert.equal(map.maxCell, 3);
  assert.equal(map.hiddenRows, 0);
  // no home counter in the run: the footer says so instead of showing zeros
  assert.equal(map.footer.home, null);
});

test('buildHeatmap: the row limit hides rows but the footer still covers every place', () => {
  const daily = dailyOf(
    [
      { a: 5, b: 3, c: 1, d: 1, e: 1 },
      { a: 1, b: 1, c: 2, e: 4 }
    ],
    [7, 8]
  );
  const all = buildHeatmap(daily, CATALOG, 'pois', 10);
  const two = buildHeatmap(daily, CATALOG, 'pois', 2);
  assert.deepEqual(
    two.rows.map((r) => r.id),
    all.rows.slice(0, 2).map((r) => r.id)
  );
  assert.equal(two.hiddenRows, all.rows.length - 2);
  assert.equal(
    two.hiddenTotal,
    all.rows.slice(2).reduce((sum, r) => sum + r.total, 0)
  );
  assert.deepEqual(two.footer, all.footer);
  assert.deepEqual(all.footer.places, [11, 8]);
  assert.deepEqual(all.footer.home, [7, 8]);
  // the colour scale follows the displayed rows only
  assert.equal(two.maxCell, 5);
  assert.equal(buildHeatmap(daily, CATALOG, 'pois', 0).rows.length, 0);
  assert.equal(buildHeatmap(daily, CATALOG, 'pois', 0).maxCell, 0);
  // a negative limit is no limit that shows rows
  assert.equal(buildHeatmap(daily, CATALOG, 'pois', -3).rows.length, 0);
  assert.equal(
    buildHeatmap(daily, CATALOG, 'pois', -3).hiddenRows,
    all.rows.length
  );
  assert.deepEqual(buildHeatmap(daily, CATALOG, 'types', 1).footer, all.footer);
});

test('buildHeatmap: types add the places up first, so many small places can outrank one large one', () => {
  const catalog = [
    { id: 'p1', label: 'P1', category: 'Quiet' }, // never infected, first in the catalogue
    { id: 'p2', label: 'P2', category: 'Many' },
    { id: 'p3', label: 'P3', category: 'Many' },
    { id: 'p4', label: 'P4', category: 'Many' },
    { id: 'p5', label: 'P5', category: 'One' }
  ];
  const daily = dailyOf([{ p2: 3, p3: 3, p4: 3, p5: 8 }]);
  const places = buildHeatmap(daily, catalog, 'pois', 10);
  assert.equal(places.rows[0].id, 'p5'); // the single biggest place
  const types = buildHeatmap(daily, catalog, 'types', 10);
  assert.deepEqual(
    types.rows.map((r) => [r.id, r.total]),
    [
      ['Many', 9],
      ['One', 8]
    ]
  );
  assert.deepEqual(types.rows[0].counts, [9]);
  assert.equal(types.maxCell, 9);
});

test('buildHeatmap: tied types keep the order the whole catalogue first mentions them', () => {
  const catalog = [
    { id: 'a', label: 'A', category: 'First' }, // silent
    { id: 'b', label: 'B', category: 'Second' },
    { id: 'c', label: 'C', category: 'First' }
  ];
  for (const day of [
    { b: 1, c: 1 },
    { c: 1, b: 1 }
  ]) {
    const types = buildHeatmap(dailyOf([day]), catalog, 'types', 10);
    assert.deepEqual(
      types.rows.map((r) => r.id),
      ['First', 'Second']
    );
  }
});

test('buildHeatmap tells places with the same name apart, whatever the row limit', () => {
  const catalog = [
    { id: '1', label: 'School', category: 'X' },
    { id: '2', label: 'Pub', category: 'X' },
    { id: '3', label: 'School', category: 'X' }
  ];
  const daily = dailyOf([{ 1: 3, 2: 2, 3: 1 }]);
  for (const limit of [1, 2, 3, 10]) {
    const rows = buildHeatmap(daily, catalog, 'pois', limit).rows;
    assert.equal(rows[0].label, 'School (#1)', `limit ${limit}`);
    if (limit >= 2) assert.equal(rows[1].label, 'Pub');
    if (limit >= 3) assert.equal(rows[2].label, 'School (#3)');
  }
});

test('buildHeatmap with nothing to show keeps the footer', () => {
  const daily = dailyOf([{}, {}], [150, 3]);
  const map = buildHeatmap(daily, CATALOG, 'pois', 10);
  assert.deepEqual(map.rows, []);
  assert.equal(map.maxCell, 0);
  assert.deepEqual(map.footer, { places: [0, 0], home: [150, 3] });
  assert.deepEqual(buildHeatmap(daily, CATALOG, 'types', 10).rows, []);
  assert.deepEqual(buildHeatmap(dailyOf([{}]), [], 'pois', 10).rows, []);
});

test('buildHeatmap reads places by own key (ids that are also built-in names)', () => {
  const catalog = [
    { id: 'constructor', label: 'C', category: 'X' },
    { id: 'toString', label: 'T', category: 'X' },
    { id: '__proto__', label: 'P', category: 'X' }
  ];
  const noInfections = buildHeatmap(dailyOf([{}]), catalog, 'pois', 10);
  assert.deepEqual(noInfections.rows, []);
  const places = Object.defineProperty({ constructor: 4 }, '__proto__', {
    value: 2,
    enumerable: true,
    configurable: true,
    writable: true
  });
  const map = buildHeatmap(dailyOf([places]), catalog, 'pois', 10);
  assert.deepEqual(
    map.rows.map((r) => [r.id, r.total]),
    [
      ['constructor', 4],
      ['__proto__', 2]
    ]
  );
});

test('buildHeatmap agrees with a brute-force ranking on random data', () => {
  const random = makeRandom(77);
  const int = (low, high) => low + Math.floor(random() * (high - low + 1));
  for (let round = 0; round < 400; round += 1) {
    const placeCount = int(0, 9);
    const catalog = Array.from({ length: placeCount }, (_, i) => ({
      id: `p${i}`,
      label: `Place ${int(0, 4)}`,
      category: `cat${int(0, 3)}`
    }));
    const dayCount = int(1, 6);
    const days = Array.from({ length: dayCount }, () =>
      Object.fromEntries(
        catalog.flatMap((p) => (random() < 0.5 ? [[p.id, int(1, 12)]] : []))
      )
    );
    const limit = int(0, 6);
    const map = buildHeatmap(dailyOf(days), catalog, 'pois', limit);
    const totals = catalog.map((p, order) => ({
      id: p.id,
      order,
      counts: days.map((d) => d[p.id] ?? 0)
    }));
    const expected = totals
      .map((t) => ({ ...t, total: t.counts.reduce((a, b) => a + b, 0) }))
      .filter((t) => t.total > 0)
      .sort((x, y) => y.total - x.total || x.order - y.order);
    assert.deepEqual(
      map.rows.map((r) => [r.id, r.total, r.counts]),
      expected.slice(0, limit).map((t) => [t.id, t.total, t.counts]),
      `round ${round}`
    );
    assert.equal(map.hiddenRows, Math.max(0, expected.length - limit));
    assert.deepEqual(
      map.footer.places,
      days.map((d) => Object.values(d).reduce((a, b) => a + b, 0))
    );
    const types = buildHeatmap(dailyOf(days), catalog, 'types', 50);
    assert.equal(
      types.rows.reduce((sum, r) => sum + r.total, 0),
      expected.reduce((sum, t) => sum + t.total, 0)
    );
  }
});

// -------------------------------------------------------------- colours etc.

test('heatLevel: 0 for nothing, 1 to 8 on a square-root scale, boundaries exact', () => {
  assert.equal(heatLevel(0, 10), 0);
  assert.equal(heatLevel(-3, 10), 0);
  assert.equal(heatLevel(Number.NaN, 10), 0);
  assert.equal(heatLevel(5, 0), 0);
  assert.equal(heatLevel(5, Number.NaN), 0);
  assert.equal(heatLevel(1, 1), 8); // a single infection is the darkest cell
  assert.equal(heatLevel(10, 10), 8);
  assert.equal(heatLevel(1, 1_000_000), 1);
  // level k covers counts up to max * (k / 8)^2: with max = 64 that is k^2
  for (let k = 1; k <= 8; k += 1) {
    assert.equal(heatLevel(k * k, 64), k, `count ${k * k}`);
    if (k < 8)
      assert.equal(heatLevel(k * k + 1, 64), k + 1, `count ${k * k + 1}`);
  }
  // never goes down as the count goes up
  let previous = 0;
  for (let count = 0; count <= 200; count += 1) {
    const level = heatLevel(count, 200);
    assert.ok(level >= previous);
    assert.ok(level >= 0 && level <= 8);
    previous = level;
  }
});

test('heatLevel matches a square-root formula away from the level boundaries', () => {
  const random = makeRandom(5150);
  for (let round = 0; round < 3000; round += 1) {
    const max = 1 + Math.floor(random() * 5000);
    const count = 1 + Math.floor(random() * max);
    const exact = Math.sqrt(count / max) * 8;
    if (Math.abs(exact - Math.round(exact)) < 1e-6) continue; // on a boundary
    assert.equal(heatLevel(count, max), Math.ceil(exact), `${count} of ${max}`);
  }
});

function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

test('every colour pair of the palette has a contrast ratio of at least 4.5', () => {
  assert.equal(HEAT_PALETTE.length, 9);
  for (const [level, { background, color }] of HEAT_PALETTE.entries()) {
    const [hi, lo] = [luminance(background), luminance(color)].sort(
      (x, y) => y - x
    );
    const ratio = (hi + 0.05) / (lo + 0.05);
    assert.ok(ratio >= 4.5, `level ${level}: ${ratio.toFixed(2)}`);
  }
  // the levels really get darker
  const lums = HEAT_PALETTE.map((c) => luminance(c.background));
  for (let i = 1; i < lums.length; i += 1) assert.ok(lums[i] < lums[i - 1]);
});

test('describeColumn marks a short day and is plain about what a day is', () => {
  assert.deepEqual(
    describeColumn({
      index: 2,
      fromHour: 48,
      toHour: 72,
      hours: 24,
      partial: false
    }),
    { label: '3', note: null, full: 'Day 3, hours 48 to 72' }
  );
  const short = describeColumn({
    index: 7,
    fromHour: 168,
    toHour: 171,
    hours: 3,
    partial: true
  });
  assert.equal(short.label, '8');
  assert.equal(short.note, '3 h');
  assert.match(short.full, /only the first 3 hours/);
  assert.match(short.full, /not a full day/);
});

test('toHeatPlaces uses the same fallbacks as the ranking table', () => {
  assert.deepEqual(
    toHeatPlaces([
      { id: 7, label: '', top_category: '' },
      { id: '8', label: 'Bar', top_category: 'Bars' },
      { id: 9 }
    ]),
    [
      { id: '7', label: 'Place #7', category: 'Uncategorized' },
      { id: '8', label: 'Bar', category: 'Bars' },
      { id: '9', label: 'Place #9', category: 'Uncategorized' }
    ]
  );
});
