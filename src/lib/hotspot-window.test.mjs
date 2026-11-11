import assert from 'node:assert/strict';
import { test } from 'node:test';

const {
  computeWindowIncidence,
  hasValidCounts,
  hourlyGridRange,
  incidenceFor,
  pickWindowKeys
} = await import('./hotspot-window.ts');

const HOURLY = [60, 120, 180, 240, 300, 360];

// Small deterministic generator so the randomized tests are reproducible.
function makeRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

test('pickWindowKeys bounds a window with the frame W hours before the end', () => {
  const keys = pickWindowKeys(HOURLY, 360, 3);
  assert.deepEqual(keys, { endKey: 360, startKey: 180, coveredMinutes: 180 });
});

test('pickWindowKeys snaps the end to the nearest frame, ties go to the earlier', () => {
  assert.equal(pickWindowKeys(HOURLY, 200, 1)?.endKey, 180);
  assert.equal(pickWindowKeys(HOURLY, 210, 1)?.endKey, 180); // exact tie
  assert.equal(pickWindowKeys(HOURLY, 211, 1)?.endKey, 240);
});

test('pickWindowKeys clamps an end outside the run to the first or last frame', () => {
  assert.equal(pickWindowKeys(HOURLY, 99999, 1)?.endKey, 360);
  assert.equal(pickWindowKeys(HOURLY, -50, 1)?.endKey, 60);
});

test('pickWindowKeys uses a zero baseline when the window reaches before the first frame', () => {
  // Real runs start at 60 minutes, not 0, and there is no frame to request.
  assert.deepEqual(pickWindowKeys(HOURLY, 120, 24), {
    endKey: 120,
    startKey: null,
    coveredMinutes: 120
  });
  // Target lands exactly on 0, still before the first real frame.
  assert.equal(pickWindowKeys(HOURLY, 120, 2)?.startKey, null);
  // Target lands exactly on the first frame: that frame is the start.
  assert.equal(pickWindowKeys(HOURLY, 180, 2)?.startKey, 60);
});

test('pickWindowKeys picks the latest frame at or before the target when frames are irregular', () => {
  const keys = pickWindowKeys([60, 120, 300, 360], 360, 1.5);
  // target = 360 - 90 = 270 -> latest frame <= 270 is 120
  assert.deepEqual(keys, { endKey: 360, startKey: 120, coveredMinutes: 240 });
});

test('pickWindowKeys rounds a window up to the frame grid and reports the real span', () => {
  // target = 360 - 90 = 270 -> latest frame <= 270 is 240, so 2 h are covered
  assert.deepEqual(pickWindowKeys(HOURLY, 360, 1.5), {
    endKey: 360,
    startKey: 240,
    coveredMinutes: 120
  });
  assert.deepEqual(pickWindowKeys(HOURLY, 360, 0.1), {
    endKey: 360,
    startKey: 300,
    coveredMinutes: 60
  });
});

test('pickWindowKeys never trusts the order or cleanliness of the manifest', () => {
  const messy = [180, 60, Number.NaN, 120, 60, Number.POSITIVE_INFINITY, 240];
  assert.deepEqual(pickWindowKeys(messy, 240, 2), {
    endKey: 240,
    startKey: 120,
    coveredMinutes: 120
  });
});

test('pickWindowKeys with a single frame has only the zero baseline', () => {
  assert.deepEqual(pickWindowKeys([60], 60, 6), {
    endKey: 60,
    startKey: null,
    coveredMinutes: 60
  });
});

test('pickWindowKeys rejects inputs that cannot describe a window', () => {
  assert.equal(pickWindowKeys(null, 60, 1), null);
  assert.equal(pickWindowKeys(undefined, 60, 1), null);
  assert.equal(pickWindowKeys([], 60, 1), null);
  assert.equal(pickWindowKeys([Number.NaN], 60, 1), null);
  assert.equal(pickWindowKeys(HOURLY, Number.NaN, 1), null);
  assert.equal(pickWindowKeys(HOURLY, 60, 0), null);
  assert.equal(pickWindowKeys(HOURLY, 60, -3), null);
  assert.equal(pickWindowKeys(HOURLY, 60, Number.NaN), null);
  assert.equal(pickWindowKeys(HOURLY, 60, Number.POSITIVE_INFINITY), null);
});

test('pickWindowKeys always starts strictly before it ends, even for tiny windows', () => {
  const windows = [
    Number.MIN_VALUE,
    1e-300,
    1e-12,
    0.001,
    0.25,
    1,
    6,
    24,
    72,
    1e308
  ];
  for (const windowHours of windows) {
    for (const end of HOURLY) {
      const keys = pickWindowKeys(HOURLY, end, windowHours);
      assert.ok(keys, `window ${windowHours} ending ${end}`);
      assert.ok(
        keys.startKey === null || keys.startKey < keys.endKey,
        `window ${windowHours} ending ${end}: ${JSON.stringify(keys)}`
      );
      assert.ok(keys.coveredMinutes > 0, `covered for ${windowHours}`);
    }
  }
  // The original failing case: end - W rounds back to end in floating point.
  assert.deepEqual(pickWindowKeys([60, 120], 120, Number.MIN_VALUE), {
    endKey: 120,
    startKey: 60,
    coveredMinutes: 60
  });
});

test('pickWindowKeys matches a brute-force definition on random inputs', () => {
  const random = makeRandom(12345);
  const int = (low, high) => low + Math.floor(random() * (high - low + 1));
  const windows = [0.25, 0.5, 1, 1.5, 2, 6, 24, 72, 1000];

  for (let round = 0; round < 3000; round += 1) {
    const count = int(1, 40);
    const step = [30, 60, 60, 60, 90][int(0, 4)];
    const first = [0, 30, 60, 60][int(0, 3)];
    let steps = Array.from({ length: count }, (_, k) => first + k * step);
    if (random() < 0.3) steps = steps.sort(() => random() - 0.5);
    if (random() < 0.2) steps.push(Number.NaN, steps[0]);
    const end =
      int(-100, first + count * step + 200) + (random() < 0.3 ? 0.5 : 0);
    const windowHours = windows[int(0, windows.length - 1)];

    const clean = [...new Set(steps.filter(Number.isFinite))].sort(
      (a, b) => a - b
    );
    let endKey = clean[0];
    for (const t of clean) {
      if (Math.abs(t - end) < Math.abs(endKey - end)) endKey = t;
    }
    const earlier = clean.filter(
      (t) => t <= endKey - windowHours * 60 && t < endKey
    );
    const startKey = earlier.length ? earlier[earlier.length - 1] : null;

    assert.deepEqual(pickWindowKeys(steps, end, windowHours), {
      endKey,
      startKey,
      coveredMinutes: endKey - (startKey ?? 0)
    });
  }
});

const PLACES = ['10', '20', '30'];

test('computeWindowIncidence subtracts the start frame from the end frame', () => {
  const result = computeWindowIncidence(
    { hinc: 5, pinc: [1, 4, 0] },
    { hinc: 9, pinc: [3, 4, 2] },
    PLACES
  );
  assert.equal(result.home, 4);
  assert.deepEqual(Object.entries(result.places), [
    ['10', 2],
    ['30', 2]
  ]);
});

test('computeWindowIncidence with a null or undefined start counts from the beginning of the run', () => {
  const end = { hinc: 7, pinc: [0, 5, 1] };
  for (const start of [null, undefined]) {
    const result = computeWindowIncidence(start, end, PLACES);
    assert.equal(result.home, 7);
    assert.deepEqual(Object.entries(result.places), [
      ['20', 5],
      ['30', 1]
    ]);
  }
});

test('computeWindowIncidence omits places with no new infections', () => {
  const result = computeWindowIncidence(
    { hinc: 1, pinc: [2, 2, 2] },
    { hinc: 1, pinc: [2, 2, 2] },
    PLACES
  );
  assert.equal(result.home, 0);
  assert.deepEqual(Object.entries(result.places), []);
});

test('computeWindowIncidence clamps counts that went down instead of going negative', () => {
  const result = computeWindowIncidence(
    { hinc: 10, pinc: [5, 0, 0] },
    { hinc: 3, pinc: [2, 1, 0] },
    PLACES
  );
  assert.equal(result.home, 0);
  assert.deepEqual(Object.entries(result.places), [['20', 1]]);
});

test('computeWindowIncidence truncates fractional counts', () => {
  const result = computeWindowIncidence(
    null,
    { hinc: 2.9, pinc: [0, 0, 2.9] },
    PLACES
  );
  assert.equal(result.home, 2);
  assert.deepEqual(Object.entries(result.places), [['30', 2]]);
});

test('computeWindowIncidence reports corrupt counts as unavailable instead of as zero', () => {
  const clean = { hinc: 1, pinc: [1, 1, 1] };
  const corrupt = [
    Number.NaN,
    null, // what a serialized NaN becomes
    undefined,
    '5',
    -1,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    {},
    [3]
  ];
  for (const bad of corrupt) {
    const label = JSON.stringify(bad) ?? String(bad);
    assert.equal(
      computeWindowIncidence(null, { pinc: [1, bad, 1] }, PLACES),
      null,
      `end pinc ${label}`
    );
    assert.equal(
      computeWindowIncidence({ pinc: [bad, 1, 1] }, clean, PLACES),
      null,
      `start pinc ${label}`
    );
  }
  // hinc: absent is fine (zero), present-but-invalid is corrupt.
  assert.equal(
    computeWindowIncidence(null, { pinc: [1, 1, 1] }, PLACES).home,
    0
  );
  for (const bad of [null, '3', Number.NaN, -2, Number.POSITIVE_INFINITY]) {
    assert.equal(
      computeWindowIncidence(null, { hinc: bad, pinc: [1, 1, 1] }, PLACES),
      null
    );
    assert.equal(
      computeWindowIncidence({ hinc: bad, pinc: [1, 1, 1] }, clean, PLACES),
      null
    );
  }
});

test('computeWindowIncidence refuses frames it cannot align with the places', () => {
  const good = { hinc: 0, pinc: [0, 0, 0] };
  // wrong length on either frame: guessing would blame the wrong place
  assert.equal(computeWindowIncidence(null, { pinc: [1, 2] }, PLACES), null);
  assert.equal(
    computeWindowIncidence(null, { pinc: [1, 2, 3, 4] }, PLACES),
    null
  );
  assert.equal(
    computeWindowIncidence({ pinc: [1, 2] }, { pinc: [1, 2, 3] }, PLACES),
    null
  );
  // the older-run shape the processor writes when only hinc exists
  assert.equal(
    computeWindowIncidence(null, { hinc: 4, pinc: [] }, PLACES),
    null
  );
  // missing, wrong type
  assert.equal(computeWindowIncidence(null, {}, PLACES), null);
  assert.equal(computeWindowIncidence(null, { pinc: '123' }, PLACES), null);
  assert.equal(computeWindowIncidence(null, { pinc: { 0: 1 } }, PLACES), null);
  assert.equal(computeWindowIncidence(good, null, PLACES), null);
  assert.equal(computeWindowIncidence(undefined, null, PLACES), null);
  assert.equal(computeWindowIncidence([], good, PLACES), null);
});

test('computeWindowIncidence refuses empty or duplicated place ids', () => {
  assert.equal(computeWindowIncidence(null, { pinc: [] }, []), null);
  assert.equal(
    computeWindowIncidence(null, { pinc: [1, 2] }, ['1', '1']),
    null
  );
  assert.equal(computeWindowIncidence(null, { pinc: [1] }, null), null);
});

test('computeWindowIncidence does not mutate its inputs', () => {
  const start = Object.freeze({ hinc: 1, pinc: Object.freeze([1, 1, 1]) });
  const end = Object.freeze({ hinc: 2, pinc: Object.freeze([2, 3, 1]) });
  const ids = Object.freeze(['a', 'b', 'c']);
  const result = computeWindowIncidence(start, end, ids);
  assert.equal(result.home, 1);
  assert.deepEqual(Object.entries(result.places), [
    ['a', 1],
    ['b', 2]
  ]);
});

test('computeWindowIncidence returns an ordinary object and keeps ids that collide with Object.prototype', () => {
  const ids = ['__proto__', 'constructor', 'toString'];
  const result = computeWindowIncidence(null, { pinc: [4, 5, 6] }, ids);
  // Ordinary prototype, so the usual idioms keep working.
  assert.equal(Object.getPrototypeOf(result.places), Object.prototype);
  assert.equal(typeof result.places.hasOwnProperty, 'function');
  assert.equal(
    String(Object.keys(result.places)),
    '__proto__,constructor,toString'
  );
  assert.equal(
    Object.getOwnPropertyDescriptor(result.places, '__proto__').value,
    4
  );
  assert.equal(Object.hasOwn(result.places, '__proto__'), true);
  assert.equal(result.places.constructor, 5);
  assert.equal(result.places.toString, 6);
  // "__proto__" must not have changed the prototype chain of the result.
  assert.equal(Object.getPrototypeOf(result.places), Object.prototype);
  // and it survives copying, which is how a store would handle it
  const copy = { ...result.places };
  assert.equal(Object.getOwnPropertyDescriptor(copy, '__proto__').value, 4);
  assert.equal(`${Object.keys(result.places).length}`, '3');
});

test('computeWindowIncidence windows add up: two consecutive windows equal one long window', () => {
  const random = makeRandom(987);
  const int = (low, high) => low + Math.floor(random() * (high - low + 1));

  for (let round = 0; round < 500; round += 1) {
    const count = int(1, 30);
    const ids = Array.from({ length: count }, (_, k) => String(k + 1));
    const grow = (previous) =>
      previous.map((value) => value + (random() < 0.4 ? int(1, 4) : 0));
    const first = {
      hinc: int(0, 5),
      pinc: Array.from({ length: count }, () => int(0, 5))
    };
    const second = { hinc: first.hinc + int(0, 3), pinc: grow(first.pinc) };
    const third = { hinc: second.hinc + int(0, 3), pinc: grow(second.pinc) };

    const early = computeWindowIncidence(first, second, ids);
    const late = computeWindowIncidence(second, third, ids);
    const whole = computeWindowIncidence(first, third, ids);

    assert.equal(early.home + late.home, whole.home);
    for (const id of ids) {
      assert.equal(
        (early.places[id] ?? 0) + (late.places[id] ?? 0),
        whole.places[id] ?? 0
      );
    }
    // From the beginning of the run equals an all-zero start frame.
    const zero = { hinc: 0, pinc: new Array(count).fill(0) };
    assert.deepEqual(
      computeWindowIncidence(zero, third, ids),
      computeWindowIncidence(null, third, ids)
    );
  }
});

test('computeWindowIncidence stays correct for a large place count', () => {
  const count = 200_000;
  const ids = Array.from({ length: count }, (_, index) => String(index));
  const start = { hinc: 0, pinc: new Array(count).fill(1) };
  const end = {
    hinc: 10,
    pinc: Array.from({ length: count }, (_, index) => 1 + (index % 3))
  };
  const result = computeWindowIncidence(start, end, ids);
  assert.equal(result.home, 10);
  // index % 3 === 0 -> no change; 1 -> +1; 2 -> +2
  const expected = Math.floor(count / 3) * 3 + (count % 3 === 2 ? 1 : 0);
  let total = 0;
  for (const value of Object.values(result.places)) total += value;
  assert.equal(total, expected);
});

test('computeWindowIncidence rejects frames that are not objects', () => {
  const frame = { hinc: 0, pinc: [1, 1, 1] };
  // an end frame must exist; undefined here once slipped past the guard
  for (const bad of [undefined, 0, 5, 'x', true, []]) {
    assert.equal(
      computeWindowIncidence(null, bad, PLACES),
      null,
      `end ${JSON.stringify(bad)}`
    );
  }
  // a start frame that is present must be usable (undefined means "none")
  for (const bad of [0, 5, 'x', true, []]) {
    assert.equal(
      computeWindowIncidence(bad, frame, PLACES),
      null,
      `start ${JSON.stringify(bad)}`
    );
  }
});

test('incidenceFor reads only own keys, so built-in names with no infections count as zero', () => {
  // The case that once produced "0function toString() { [native code] }5":
  // a place named like a built-in, no infections, so its key is omitted.
  const result = computeWindowIncidence(null, { pinc: [0, 0, 0, 0, 5] }, [
    'toString',
    'constructor',
    'hasOwnProperty',
    '__proto__',
    'normal'
  ]);
  for (const id of ['toString', 'constructor', 'hasOwnProperty', '__proto__']) {
    assert.equal(incidenceFor(result.places, id), 0, id);
  }
  assert.equal(incidenceFor(result.places, 'normal'), 5);
  // summing the way the type ranking does stays numeric
  let total = 0;
  for (const id of ['toString', 'normal'])
    total += incidenceFor(result.places, id);
  assert.equal(total, 5);
});

test('incidenceFor returns the count of a place whose id is a built-in name', () => {
  const result = computeWindowIncidence(null, { pinc: [4, 5, 6] }, [
    '__proto__',
    'constructor',
    'toString'
  ]);
  assert.equal(incidenceFor(result.places, '__proto__'), 4);
  assert.equal(incidenceFor(result.places, 'constructor'), 5);
  assert.equal(incidenceFor(result.places, 'toString'), 6);
});

test('incidenceFor ignores inherited keys, missing objects and non-numeric values', () => {
  assert.equal(incidenceFor(Object.create({ inherited: 7 }), 'inherited'), 0);
  assert.equal(incidenceFor(null, 'a'), 0);
  assert.equal(incidenceFor(undefined, 'a'), 0);
  assert.equal(incidenceFor({ a: 3 }, 'a'), 3);
  assert.equal(incidenceFor({ a: 'x' }, 'a'), 0);
  assert.equal(incidenceFor({ a: Number.NaN }, 'a'), 0);
  assert.equal(incidenceFor({ a: Number.POSITIVE_INFINITY }, 'a'), 0);
});

test('computeWindowIncidence treats counts beyond 2^53 as corrupt instead of losing the difference', () => {
  // 2^53 and 2^53 + 1 parse to the same number, so their difference would be
  // a silent 0. Parse them the way the data really arrives, from JSON text.
  const [low, high] = JSON.parse('[9007199254740992, 9007199254740993]');
  assert.equal(low, high);
  assert.equal(
    computeWindowIncidence({ pinc: [low] }, { pinc: [high] }, ['a']),
    null
  );
  assert.equal(computeWindowIncidence(null, { pinc: [1e300] }, ['a']), null);
  assert.equal(
    computeWindowIncidence(null, { hinc: 2 ** 60, pinc: [1] }, ['a']),
    null
  );
  // the largest exactly representable count still works
  const edge = computeWindowIncidence(
    { pinc: [Number.MAX_SAFE_INTEGER - 5] },
    { pinc: [Number.MAX_SAFE_INTEGER] },
    ['a']
  );
  assert.equal(edge.places.a, 5);
});

test('pickWindowKeys discards frame times before the run starts', () => {
  assert.equal(pickWindowKeys([-60], 0, 6), null);
  assert.equal(pickWindowKeys([-120, -60], 0, 6), null);
  assert.deepEqual(pickWindowKeys([-60, 60, 120], 120, 1), {
    endKey: 120,
    startKey: 60,
    coveredMinutes: 60
  });
  assert.deepEqual(pickWindowKeys([-60, 60], -500, 1), {
    endKey: 60,
    startKey: null,
    coveredMinutes: 60
  });
});

test('hasValidCounts accepts a frame with one usable count per place', () => {
  assert.equal(hasValidCounts({ hinc: 4, pinc: [0, 1, 2] }, 3), true);
  assert.equal(hasValidCounts({ pinc: [0, 1] }, 2), true); // a missing hinc is zero
  assert.equal(hasValidCounts({ pinc: [Number.MAX_SAFE_INTEGER] }, 1), true);
});

test('hasValidCounts rejects every kind of bad count and every kind of bad frame', () => {
  const sparse = [1, 2, 3];
  delete sparse[1]; // a hole, as a lossy conversion could leave
  const bad = [
    undefined,
    null,
    0,
    'x',
    [],
    {},
    { pinc: 'abc' },
    { pinc: { 0: 1 } },
    { pinc: ['5'] },
    { pinc: [null] },
    { pinc: [undefined] },
    { pinc: [-1] },
    { pinc: [Number.NaN] },
    { pinc: [Number.POSITIVE_INFINITY] },
    { pinc: [2 ** 60] },
    { pinc: [1, 'bad', 3] },
    { pinc: sparse },
    { hinc: null, pinc: [1] },
    { hinc: '3', pinc: [1] },
    { hinc: -2, pinc: [1] },
    { hinc: Number.POSITIVE_INFINITY, pinc: [1] }
  ];
  for (const frame of bad) {
    // Every one of these is bad whatever length the caller expects.
    for (const placeCount of [0, 1, 3]) {
      assert.equal(
        hasValidCounts(frame, placeCount),
        false,
        `${JSON.stringify(frame) ?? String(frame)} / ${placeCount}`
      );
    }
  }
});

test('hasValidCounts rejects a frame whose length does not match the places', () => {
  for (const pinc of [[], [1, 2], [1, 2, 3, 4]]) {
    assert.equal(hasValidCounts({ hinc: 0, pinc }, 3), false, `${pinc}`);
  }
  assert.equal(hasValidCounts({ hinc: 0, pinc: [1, 2, 3] }, 3), true);
  assert.equal(hasValidCounts({ hinc: 0, pinc: [] }, 0), true);
  // a count that is not a whole number of places can never match
  assert.equal(hasValidCounts({ pinc: [1, 2, 3] }, 2.5), false);
  assert.equal(hasValidCounts({ pinc: [1, 2, 3] }, Number.NaN), false);
});

test('hasValidCounts agrees with computeWindowIncidence about which frames are usable', () => {
  const next = makeRandom(11);
  const pickBad = () => {
    const bad = [-1, Number.NaN, '3', null, undefined, 2 ** 60, 1.5];
    return bad[Math.floor(next() * bad.length)];
  };
  for (let round = 0; round < 500; round += 1) {
    const placeCount = 1 + Math.floor(next() * 4);
    const ids = Array.from({ length: placeCount }, (_, index) => `p${index}`);
    const length = Math.max(0, placeCount + Math.floor(next() * 3) - 1);
    const pinc = Array.from({ length }, () => Math.floor(next() * 10));
    if (next() < 0.4 && length > 0) {
      pinc[Math.floor(next() * length)] = pickBad();
    }
    const frame = { hinc: next() < 0.2 ? pickBad() : 0, pinc };
    // 1.5 is a fraction, which readCount truncates: usable in both
    assert.equal(
      hasValidCounts(frame, placeCount),
      computeWindowIncidence(null, frame, ids) !== null,
      JSON.stringify(frame)
    );
  }
});

test('hourlyGridRange accepts frames on every hour between the first and the last', () => {
  assert.deepEqual(hourlyGridRange([60, 120, 180]), {
    minHour: 1,
    maxHour: 3
  });
  assert.deepEqual(hourlyGridRange(HOURLY), { minHour: 1, maxHour: 6 });
  assert.deepEqual(hourlyGridRange([180, 240, 300]), {
    minHour: 3,
    maxHour: 5
  }); // frames need not start at hour 1
  assert.deepEqual(hourlyGridRange([60]), { minHour: 1, maxHour: 1 });
  assert.deepEqual(hourlyGridRange([0, 60]), { minHour: 0, maxHour: 1 });
});

test('hourlyGridRange cleans the list like the window calculation', () => {
  assert.deepEqual(hourlyGridRange([180, 60, Number.NaN, 120, 60]), {
    minHour: 1,
    maxHour: 3
  });
  assert.deepEqual(hourlyGridRange([-60, 60, 120]), {
    minHour: 1,
    maxHour: 2
  });
  const input = Object.freeze([180, 60, 120]);
  assert.deepEqual(hourlyGridRange(input), { minHour: 1, maxHour: 3 }); // does not mutate
});

test('hourlyGridRange refuses frames that are not a complete hourly grid', () => {
  for (const steps of [
    [90, 150, 210], // every frame at half past
    [90], // a single frame between two hours
    [60, 180], // hour 2 has no frame
    [60, 120, 240], // gap in the middle
    [60, 90, 120], // a half-hour frame inside
    [30, 60, 90],
    [60.5, 120.5],
    [60, 120, 181] // last frame off the hour
  ]) {
    assert.equal(hourlyGridRange(steps), null, steps.join(','));
  }
});

test('hourlyGridRange has nothing to offer without usable frames', () => {
  assert.equal(hourlyGridRange([-60, -120]), null);
  assert.equal(hourlyGridRange([]), null);
  assert.equal(hourlyGridRange(null), null);
  assert.equal(hourlyGridRange(undefined), null);
  assert.equal(hourlyGridRange([Number.NaN]), null);
});

test('hourlyGridRange takes plain arrays only, like pickWindowKeys', () => {
  for (const notAnArray of [
    new Float64Array([60, 120]),
    new Set([60, 120]),
    '60',
    { 0: 60, length: 1 }
  ]) {
    assert.equal(hourlyGridRange(notAnArray), null);
    assert.equal(pickWindowKeys(notAnArray, 60, 1), null);
  }
});

test('on an hourly grid no hour of the slider is moved and a window of whole hours starts exactly W hours earlier', () => {
  for (const steps of [
    [60, 120, 180, 240, 300, 360, 420, 480],
    [180, 240, 300, 360],
    [60],
    [120, 180]
  ]) {
    const range = hourlyGridRange(steps);
    assert.ok(range, steps.join(','));
    for (let hour = range.minHour; hour <= range.maxHour; hour += 1) {
      for (const windowHours of [1, 2, 3, 6, 24, 72]) {
        const keys = pickWindowKeys(steps, hour * 60, windowHours);
        assert.equal(keys.endKey, hour * 60, `${steps} hour ${hour}`);
        const wanted = hour - windowHours;
        const startHour = wanted >= range.minHour ? wanted : null;
        assert.equal(
          keys.startKey,
          startHour === null ? null : startHour * 60,
          `${steps} hour ${hour} window ${windowHours}`
        );
        assert.equal(
          keys.coveredMinutes,
          startHour === null ? hour * 60 : windowHours * 60
        );
      }
    }
  }
});

test('hourlyGridRange matches a brute-force check on random frame lists', () => {
  const next = makeRandom(2024);
  for (let round = 0; round < 1000; round += 1) {
    // frames on a half-hour lattice, so both hour and half-hour times appear
    const steps = [];
    const count = Math.floor(next() * 6);
    const first = Math.floor(next() * 4) * 30;
    for (let index = 0; index < count; index += 1) {
      if (next() < 0.8) steps.push(first + index * (next() < 0.8 ? 60 : 30));
    }
    const clean = [...new Set(steps)].sort((a, b) => a - b);
    const expected =
      clean.length > 0 &&
      clean[0] % 60 === 0 &&
      clean.every((time, index) => time === clean[0] + index * 60);
    const range = hourlyGridRange(steps);
    assert.equal(range !== null, expected, steps.join(','));
    if (range) {
      assert.equal(range.minHour, clean[0] / 60);
      assert.equal(range.maxHour, clean[clean.length - 1] / 60);
    }
  }
});
