import assert from 'node:assert/strict';
import { test } from 'node:test';

const {
  categoryRows,
  compareCounts,
  formatChange,
  formatPercent,
  hasExactTotal,
  percentChange,
  rankByChange,
  sameWindowKeys
} = await import('./compare-incidence.ts');

function makeRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

const PLACES = [
  { id: 'a', placekey: null, label: 'Alpha Pub', category: 'Bars' },
  { id: 'b', placekey: null, label: 'Beta Pub', category: 'Bars' },
  { id: 'c', placekey: null, label: 'Cedar School', category: 'Schools' },
  { id: 'd', placekey: null, label: 'Delta Shop', category: 'Shops' }
];

test('percentChange has no value when the reference is zero', () => {
  assert.equal(percentChange(0, 5), null);
  assert.equal(percentChange(0, 0), null);
  assert.equal(percentChange(10, 5), -0.5);
  assert.equal(percentChange(10, 10), 0);
  assert.equal(percentChange(4, 6), 0.5);
  assert.equal(percentChange(10, 0), -1);
});

test('compareCounts subtracts the reference from the primary, place by place and at home', () => {
  const result = compareCounts(
    { home: 4, places: { a: 10, b: 5 } },
    { home: 2, places: { b: 7, c: 3 } },
    PLACES
  );
  assert.deepEqual(result.home, {
    reference: 4,
    primary: 2,
    change: -2,
    percent: -0.5
  });
  assert.deepEqual(result.places, {
    reference: 15,
    primary: 10,
    change: -5,
    percent: -5 / 15
  });
  assert.deepEqual(result.all, {
    reference: 19,
    primary: 12,
    change: -7,
    percent: -7 / 19
  });
  assert.deepEqual(
    result.placeRows.map((row) => [
      row.id,
      row.reference,
      row.primary,
      row.change,
      row.percent
    ]),
    [
      ['a', 10, 0, -10, -1], // a reduction to nothing is not lost
      ['b', 5, 7, 2, 0.4],
      ['c', 0, 3, 3, null] // new in the primary run: no percentage
    ]
  );
  assert.deepEqual(result.placeRows[0], {
    id: 'a',
    label: 'Alpha Pub',
    category: 'Bars',
    reference: 10,
    primary: 0,
    change: -10,
    percent: -1
  });
});

test('compareCounts shows zero totals as zeros and hides places with nothing in either run', () => {
  const result = compareCounts(
    { home: 0, places: {} },
    { home: 0, places: {} },
    PLACES
  );
  assert.deepEqual(result.placeRows, []);
  assert.deepEqual(result.home, {
    reference: 0,
    primary: 0,
    change: 0,
    percent: null
  });
  assert.deepEqual(result.places, {
    reference: 0,
    primary: 0,
    change: 0,
    percent: null
  });
  assert.deepEqual(result.all, {
    reference: 0,
    primary: 0,
    change: 0,
    percent: null
  });
});

test('compareCounts reads own keys only and ignores ids that are not in the catalog', () => {
  const places = [
    { id: 'toString', placekey: null, label: 'T', category: 'X' },
    { id: 'constructor', placekey: null, label: 'C', category: 'X' },
    { id: '__proto__', placekey: null, label: 'P', category: 'X' }
  ];
  const withNames = Object.defineProperty({ constructor: 5 }, '__proto__', {
    value: 2,
    enumerable: true,
    configurable: true,
    writable: true
  });
  const result = compareCounts(
    { home: 0, places: {} },
    { home: 0, places: withNames },
    places
  );
  assert.deepEqual(
    result.placeRows.map((row) => [row.id, row.reference, row.primary]),
    [
      ['constructor', 0, 5],
      ['__proto__', 0, 2]
    ]
  );
  assert.equal(result.places.primary, 7);
  // 'toString' has no count of its own: the inherited function is not a count
  const outside = compareCounts(
    { home: 0, places: { zzz: 99 } },
    { home: 0, places: {} },
    PLACES
  );
  assert.equal(outside.places.reference, 0);
  assert.deepEqual(outside.placeRows, []);
});

test('compareCounts matches a brute-force definition on random inputs', () => {
  const random = makeRandom(4242);
  const int = (low, high) => low + Math.floor(random() * (high - low + 1));
  for (let round = 0; round < 1000; round += 1) {
    const count = int(0, 12);
    const places = Array.from({ length: count }, (_, index) => ({
      id: `p${index}`,
      placekey: null,
      label: `Place ${index}`,
      category: `cat${int(0, 3)}`
    }));
    const counts = () => {
      const object = {};
      for (const place of places)
        if (random() < 0.5) object[place.id] = int(1, 30);
      return object;
    };
    const reference = { home: int(0, 40), places: counts() };
    const primary = { home: int(0, 40), places: counts() };
    const result = compareCounts(reference, primary, places);

    const expectedRows = [];
    let sumReference = 0;
    let sumPrimary = 0;
    for (const place of places) {
      const before = reference.places[place.id] ?? 0;
      const after = primary.places[place.id] ?? 0;
      sumReference += before;
      sumPrimary += after;
      if (before || after)
        expectedRows.push([place.id, before, after, after - before]);
    }
    assert.deepEqual(
      result.placeRows.map((row) => [
        row.id,
        row.reference,
        row.primary,
        row.change
      ]),
      expectedRows
    );
    assert.equal(result.places.reference, sumReference);
    assert.equal(result.places.primary, sumPrimary);
    assert.equal(result.all.reference, sumReference + reference.home);
    assert.equal(result.all.primary, sumPrimary + primary.home);
    assert.equal(result.all.change, result.home.change + result.places.change);

    // categories: net change equals the sum of the place changes, and the order
    // is the order the whole catalog first mentions them, not the order of the
    // places that happen to have infections
    const categories = categoryRows(result.placeRows, places);
    const byCategory = new Map();
    for (const place of places) {
      if (!byCategory.has(place.category))
        byCategory.set(place.category, [0, 0]);
    }
    for (const row of expectedRows) {
      const category = places.find((place) => place.id === row[0]).category;
      const sum = byCategory.get(category);
      sum[0] += row[1];
      sum[1] += row[2];
    }
    assert.deepEqual(
      categories.map((row) => [row.id, row.reference, row.primary, row.change]),
      [...byCategory.entries()]
        .filter(([, [before, after]]) => before || after)
        .map(([id, [before, after]]) => [id, before, after, after - before])
    );
  }
});

test('categoryRows adds both runs up per category first, so opposite changes cancel', () => {
  const result = compareCounts(
    { home: 0, places: { a: 10, b: 0, c: 4 } },
    { home: 0, places: { a: 0, b: 10, c: 1 } },
    PLACES
  );
  const categories = categoryRows(result.placeRows, PLACES);
  const bars = categories.find((row) => row.id === 'Bars');
  assert.deepEqual(bars, {
    id: 'Bars',
    label: 'Bars',
    category: 'Bars',
    reference: 10,
    primary: 10,
    change: 0,
    percent: 0
  });
  // the two pubs moved by +-10 each, but the category as a whole did not change,
  // so the school (-3) ranks above it
  assert.deepEqual(
    rankByChange(categories, 10).map((row) => row.id),
    ['Schools', 'Bars']
  );
});

test('categoryRows keeps catalog order and is empty without rows', () => {
  assert.deepEqual(categoryRows([], PLACES), []);
  assert.deepEqual(categoryRows([], []), []);
  const rows = compareCounts(
    { home: 0, places: { d: 1, c: 1, a: 1 } },
    { home: 0, places: {} },
    PLACES
  ).placeRows;
  assert.deepEqual(
    categoryRows(rows, PLACES).map((row) => row.id),
    ['Bars', 'Schools', 'Shops']
  );
});

test('categoryRows orders ties by the whole catalog, so they do not move with the window', () => {
  // Bars first appears at place a, which has no infections in the first window
  const catalog = [
    { id: 'a', placekey: null, label: 'A', category: 'Bars' },
    { id: 'b', placekey: null, label: 'B', category: 'Shops' },
    { id: 'c', placekey: null, label: 'C', category: 'Bars' }
  ];
  const order = (reference) =>
    rankByChange(
      categoryRows(
        compareCounts(
          { home: 0, places: reference },
          { home: 0, places: {} },
          catalog
        ).placeRows,
        catalog
      ),
      10
    ).map((row) => row.id);
  // both categories drop by 1 from a count of 1: a tie, and Bars comes first in the catalog
  assert.deepEqual(order({ b: 1, c: 1 }), ['Bars', 'Shops']);
  assert.deepEqual(order({ a: 1, b: 1 }), ['Bars', 'Shops']);
  assert.deepEqual(order({ a: 1, b: 1, c: 0 }), ['Bars', 'Shops']);
});

test('categoryRows still counts a row whose category the catalog does not list', () => {
  const rows = [
    {
      id: 'x',
      label: 'X',
      category: 'Unlisted',
      reference: 2,
      primary: 1,
      change: -1,
      percent: -50
    }
  ];
  assert.deepEqual(
    categoryRows(rows, PLACES).map((row) => [row.id, row.change]),
    [['Unlisted', -1]]
  );
});

function row(id, reference, primary) {
  return {
    id,
    label: id,
    category: 'X',
    reference,
    primary,
    change: primary - reference,
    percent: percentChange(reference, primary)
  };
}

test('rankByChange puts the largest absolute change first, increases and reductions alike', () => {
  const rows = [
    row('small', 5, 4),
    row('drop', 20, 5),
    row('rise', 2, 14),
    row('flat', 3, 3)
  ];
  assert.deepEqual(
    rankByChange(rows, 10).map((entry) => entry.id),
    ['drop', 'rise', 'small', 'flat']
  );
});

test('rankByChange breaks ties by the larger count, then by input order', () => {
  const rows = [row('x', 4, 2), row('y', 9, 7), row('z', 3, 5), row('w', 6, 4)];
  // all four change by 2; larger count: y 9, w 6, x 4, z 5 -> y, w, z, x
  assert.deepEqual(
    rankByChange(rows, 10).map((entry) => entry.id),
    ['y', 'w', 'z', 'x']
  );
  const same = [row('first', 5, 3), row('second', 5, 3), row('third', 3, 5)];
  assert.deepEqual(
    rankByChange(same, 10).map((entry) => entry.id),
    ['first', 'second', 'third']
  );
});

test('rankByChange limits the list, never mutates its input, and copes with odd limits', () => {
  const rows = [row('a', 1, 2), row('b', 1, 9), row('c', 1, 5)];
  const snapshot = JSON.stringify(rows);
  assert.deepEqual(
    rankByChange(rows, 2).map((entry) => entry.id),
    ['b', 'c']
  );
  assert.equal(JSON.stringify(rows), snapshot);
  assert.equal(rankByChange(rows, 0).length, 0);
  assert.equal(rankByChange(rows, -1).length, 0);
  assert.equal(rankByChange(rows, -3).length, 0);
  assert.equal(rankByChange(rows, 99).length, 3);
  assert.deepEqual(rankByChange([], 10), []);
});

test('sameWindowKeys needs both ends to match, a missing start included', () => {
  assert.equal(
    sameWindowKeys(
      { endKey: 360, startKey: 180, coveredMinutes: 180 },
      { endKey: 360, startKey: 180, coveredMinutes: 180 }
    ),
    true
  );
  assert.equal(
    sameWindowKeys(
      { endKey: 360, startKey: null, coveredMinutes: 360 },
      { endKey: 360, startKey: null, coveredMinutes: 360 }
    ),
    true
  );
  assert.equal(
    sameWindowKeys(
      { endKey: 360, startKey: 180, coveredMinutes: 180 },
      { endKey: 300, startKey: 180, coveredMinutes: 120 }
    ),
    false
  );
  assert.equal(
    sameWindowKeys(
      { endKey: 360, startKey: 180, coveredMinutes: 180 },
      { endKey: 360, startKey: 120, coveredMinutes: 240 }
    ),
    false
  );
  assert.equal(
    sameWindowKeys(
      { endKey: 360, startKey: null, coveredMinutes: 360 },
      { endKey: 360, startKey: 0, coveredMinutes: 360 }
    ),
    false
  );
});

test('formatChange always shows the sign and uses a real minus', () => {
  assert.equal(formatChange(12), '+12');
  assert.equal(formatChange(-93), '\u221293');
  assert.equal(formatChange(0), '0');
  assert.equal(formatChange(1234), '+1,234');
  assert.equal(formatChange(-1234567), '\u22121,234,567');
  assert.doesNotMatch(formatChange(-5), /-/);
});

test('formatPercent is empty without a reference and never rounds a change down to 0%', () => {
  assert.equal(formatPercent(null), '');
  assert.equal(formatPercent(-0.866), '\u221287%');
  assert.equal(formatPercent(0.5), '+50%');
  assert.equal(formatPercent(0), '0%');
  assert.equal(formatPercent(-1), '\u2212100%');
  assert.equal(formatPercent(0.004), '+<1%');
  assert.equal(formatPercent(-0.004), '\u2212<1%');
  assert.equal(formatPercent(0.005), '+1%');
  assert.equal(formatPercent(12.5), '+1,250%');
});

const MAX = Number.MAX_SAFE_INTEGER;

test('hasExactTotal accepts counts that add up exactly, up to the safe-integer limit', () => {
  assert.equal(hasExactTotal({ home: 0, places: {} }, PLACES), true);
  assert.equal(
    hasExactTotal({ home: 3, places: { a: 4, c: 5 } }, PLACES),
    true
  );
  // exactly at the limit is still exact
  assert.equal(hasExactTotal({ home: 0, places: { a: MAX } }, PLACES), true);
  assert.equal(
    hasExactTotal({ home: 1, places: { a: MAX - 1 } }, PLACES),
    true
  );
});

test('hasExactTotal refuses totals beyond the safe-integer range', () => {
  // each count is a safe integer on its own, the sum is not
  assert.equal(
    hasExactTotal({ home: 0, places: { a: MAX, b: 1 } }, PLACES),
    false
  );
  assert.equal(hasExactTotal({ home: MAX, places: { a: 1 } }, PLACES), false);
  assert.equal(hasExactTotal({ home: 1, places: { a: MAX } }, PLACES), false);
  assert.equal(hasExactTotal({ home: 0.5, places: {} }, PLACES), false);
  assert.equal(hasExactTotal({ home: Number.NaN, places: {} }, PLACES), false);
});

test('hasExactTotal reads only own keys and only the places of the catalog', () => {
  const places = [
    { id: 'constructor', placekey: null, label: 'C', category: 'X' }
  ];
  assert.equal(hasExactTotal({ home: 0, places: {} }, places), true);
  // a count for an id that is not in the catalog does not take part
  assert.equal(
    hasExactTotal({ home: 0, places: { zzz: MAX, a: MAX } }, PLACES),
    true
  );
});
