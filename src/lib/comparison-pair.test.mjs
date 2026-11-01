import assert from 'node:assert/strict';
import { test } from 'node:test';

const {
  checkComparable,
  normalizeManifest,
  parseComparisonTargets,
  parseRunId,
  seedNote,
  seedPairing
} = await import('./comparison-pair.ts');

const PLACES = [
  { id: '10', placekey: 'pk-10', label: 'Harbor Pub', category: 'Bars' },
  { id: '20', placekey: 'pk-20', label: 'Valley School', category: 'Schools' },
  { id: '30', placekey: null, label: 'Corner Shop', category: 'Shops' }
];

function run(overrides = {}) {
  return {
    simId: 1,
    label: 'Baseline',
    zoneId: 6,
    lengthMinutes: 180,
    places: PLACES.map((place) => ({ ...place })),
    timesteps: [60, 120, 180],
    hasIncidence: true,
    metadata: null,
    ...overrides
  };
}

function pair(primary = {}, reference = {}) {
  return {
    primary: run({ simId: 2, label: 'With interventions', ...primary }),
    reference: run({ simId: 1, ...reference })
  };
}

test('parseRunId accepts plain positive integers only', () => {
  assert.equal(parseRunId('1'), 1);
  assert.equal(parseRunId('10'), 10);
  assert.equal(parseRunId('007'), 7);
  assert.equal(parseRunId('999999999999999'), 999999999999999);
  for (const bad of [
    '',
    '0',
    '00',
    '-1',
    '1.5',
    '1e3',
    ' 5',
    '5 ',
    '+5',
    'abc',
    '1234567890123456',
    null,
    undefined,
    5,
    ['5'],
    {}
  ]) {
    assert.equal(parseRunId(bad), null, String(bad));
  }
});

test('parseComparisonTargets takes the route run as primary and the baseline as reference', () => {
  assert.deepEqual(parseComparisonTargets('11', '10'), {
    primaryId: 11,
    referenceId: 10
  });
  assert.equal(parseComparisonTargets('11', '11'), null);
  assert.equal(parseComparisonTargets('11', '011'), null); // same run
  assert.equal(parseComparisonTargets('11', null), null);
  assert.equal(parseComparisonTargets(undefined, '10'), null);
  assert.equal(parseComparisonTargets('11', 'x'), null);
  assert.equal(parseComparisonTargets(['11'], '10'), null);
});

function manifest(overrides = {}) {
  return {
    name: 'Run',
    length: 180,
    zone: { id: 6, name: 'Zone' },
    metadata: { randseed: true },
    papdata: {
      homes: [],
      places: [
        {
          id: '10',
          placekey: 'pk-10',
          label: 'Harbor Pub',
          top_category: 'Bars'
        },
        { id: 20, label: 'Valley School', top_category: 'Schools' },
        { id: '30' }
      ]
    },
    timesteps: [60, 120, 180],
    incidence: { home: 1, places: {} },
    ...overrides
  };
}

test('normalizeManifest keeps what the comparison needs and fills gaps like the ranking does', () => {
  const result = normalizeManifest(7, 'Baseline', manifest());
  assert.equal(result.simId, 7);
  assert.equal(result.label, 'Baseline');
  assert.equal(result.zoneId, 6);
  assert.equal(result.lengthMinutes, 180);
  assert.deepEqual(result.timesteps, [60, 120, 180]);
  assert.equal(result.hasIncidence, true);
  assert.deepEqual(result.metadata, { randseed: true });
  assert.deepEqual(result.places, [
    { id: '10', placekey: 'pk-10', label: 'Harbor Pub', category: 'Bars' },
    { id: '20', placekey: null, label: 'Valley School', category: 'Schools' },
    { id: '30', placekey: null, label: 'Place #30', category: 'Uncategorized' }
  ]);
});

test('normalizeManifest treats an empty label like a missing one', () => {
  const result = normalizeManifest(
    1,
    'x',
    manifest({
      papdata: {
        places: [
          { id: '5', label: '', top_category: '' },
          { id: '6', label: 7, top_category: 8 }
        ]
      }
    })
  );
  assert.deepEqual(
    result.places.map((place) => [place.label, place.category]),
    [
      ['Place #5', 'Uncategorized'],
      ['Place #6', 'Uncategorized']
    ]
  );
});

test('normalizeManifest reports what is missing instead of inventing it', () => {
  const none = normalizeManifest(
    1,
    'x',
    manifest({ zone: null, length: 0, incidence: null, metadata: [1] })
  );
  assert.equal(none.zoneId, null);
  assert.equal(none.lengthMinutes, null);
  assert.equal(none.hasIncidence, false);
  assert.equal(none.metadata, null);
  assert.equal(
    normalizeManifest(1, 'x', manifest({ zone: { id: 1.5 } })).zoneId,
    null
  );
  assert.equal(
    normalizeManifest(1, 'x', manifest({ length: Number.NaN })).lengthMinutes,
    null
  );
  assert.equal(
    normalizeManifest(1, 'x', manifest({ length: -60 })).lengthMinutes,
    null
  );
  assert.equal(
    normalizeManifest(1, 'x', manifest({ incidence: 'yes' })).hasIncidence,
    false
  );
});

test('normalizeManifest rejects manifests it cannot trust', () => {
  const bad = [
    null,
    undefined,
    'text',
    [],
    {},
    manifest({ papdata: null }),
    manifest({ papdata: {} }),
    manifest({ papdata: { places: 'none' } }),
    manifest({ papdata: { places: [null] } }),
    manifest({ papdata: { places: [{ label: 'no id' }] } }),
    manifest({ papdata: { places: [{ id: {} }] } }),
    manifest({ papdata: { places: [{ id: '1' }, { id: 1 }] } }), // duplicate
    manifest({ timesteps: null }),
    manifest({ timesteps: '60' }),
    manifest({ timesteps: [60, Number.NaN] }),
    manifest({ timesteps: [60, '120'] }),
    manifest({ timesteps: [60, null] })
  ];
  for (const data of bad) {
    assert.equal(normalizeManifest(1, 'x', data), null, JSON.stringify(data));
  }
});

test('two runs of one zone with the same places and frames can be compared', () => {
  const result = checkComparable(pair());
  assert.equal(result.ok, true);
  assert.deepEqual(result.range, { minHour: 1, maxHour: 3 });
  assert.deepEqual(result.notes, []);
});

test('checkComparable blocks every structural mismatch, with its own reason', () => {
  const cases = [
    ['same-run', pair({ simId: 1 })],
    ['no-incidence', pair({ hasIncidence: false })],
    ['no-incidence', pair({}, { hasIncidence: false })],
    ['no-places', pair({ places: [] }, { places: [] })],
    ['different-zone', pair({ zoneId: 7 })],
    ['different-length', pair({ lengthMinutes: 240 })],
    [
      'different-places',
      pair({ places: [PLACES[0], PLACES[1]] }) // one place fewer
    ],
    [
      'different-places',
      pair({ places: [PLACES[1], PLACES[0], PLACES[2]] }) // order
    ],
    [
      'different-places',
      pair({ places: [{ ...PLACES[0], id: '11' }, PLACES[1], PLACES[2]] })
    ],
    [
      'different-places',
      pair({
        places: [{ ...PLACES[0], placekey: 'other' }, PLACES[1], PLACES[2]]
      })
    ],
    [
      'different-places',
      pair({
        places: [{ ...PLACES[0], label: 'Harbor Bar' }, PLACES[1], PLACES[2]]
      })
    ],
    [
      'different-places',
      pair({
        places: [{ ...PLACES[0], category: 'Food' }, PLACES[1], PLACES[2]]
      })
    ],
    ['different-frames', pair({ timesteps: [60, 120] })],
    ['different-frames', pair({ timesteps: [120, 180] })],
    ['different-frames', pair({ timesteps: [60, 120, 240] })],
    ['different-frames', pair({ timesteps: [90, 150, 210] })], // not hourly
    ['different-frames', pair({ timesteps: [] })]
  ];
  for (const [reason, runs] of cases) {
    const result = checkComparable(runs);
    assert.equal(result.ok, false, reason);
    assert.equal(result.reason, reason);
    assert.match(result.message, /\w/);
  }
});

test('checkComparable does not block on a place that only differs in position of a null placekey', () => {
  // an absent placekey on both sides is the same absence
  assert.equal(checkComparable(pair()).ok, true);
});

test('a missing zone id or length is reported as unverified, not as a mismatch', () => {
  for (const runs of [
    pair({ zoneId: null }),
    pair({}, { zoneId: null }),
    pair({ lengthMinutes: null }),
    pair({}, { lengthMinutes: null })
  ]) {
    const result = checkComparable(runs);
    assert.equal(result.ok, true);
    assert.deepEqual(result.notes, [
      'Could not verify that both runs use the same zone and length.'
    ]);
  }
});

test('settings that differ between the runs are named in a note', () => {
  const settings = {
    disease_name: 'COVID-19',
    variants: ['Delta'],
    dmp_mode: 'required',
    initial_infected_count: 10
  };
  const same = checkComparable(
    pair({ metadata: settings }, { metadata: { ...settings } })
  );
  assert.deepEqual(same.notes, []);

  const different = checkComparable(
    pair(
      { metadata: settings },
      {
        metadata: {
          ...settings,
          variants: ['Alpha'],
          initial_infected_count: 3
        }
      }
    )
  );
  assert.deepEqual(different.notes, [
    'The runs also differ in: variants, initial infected count.'
  ]);

  // a setting missing on one side is unknown, not different
  const partial = checkComparable(
    pair({ metadata: settings }, { metadata: { disease_name: 'COVID-19' } })
  );
  assert.deepEqual(partial.notes, []);
});

test('notes say when the baseline has interventions or the intervention run has none', () => {
  const none = [
    { time: 0, mask: 0, vaccine: 0, capacity: 1, lockdown: 0, selfiso: 0 }
  ];
  const lockdown = [
    ...none,
    { time: 48, mask: 0, vaccine: 0, capacity: 1, lockdown: 0.5, selfiso: 0.6 }
  ];
  const capacity = [
    { time: 0, mask: 0, vaccine: 0, capacity: 0.5, lockdown: 0, selfiso: 0 }
  ];

  assert.deepEqual(
    checkComparable(
      pair(
        { metadata: { interventions: lockdown } },
        { metadata: { interventions: none } }
      )
    ).notes,
    []
  );
  assert.deepEqual(
    checkComparable(
      pair(
        { metadata: { interventions: lockdown } },
        { metadata: { interventions: lockdown } }
      )
    ).notes,
    ['The baseline run has interventions of its own.']
  );
  assert.deepEqual(
    checkComparable(
      pair(
        { metadata: { interventions: none } },
        { metadata: { interventions: none } }
      )
    ).notes,
    ['The run with interventions has no interventions set.']
  );
  // a capacity limit alone is an intervention; a multiplier of 1 is not
  assert.deepEqual(
    checkComparable(
      pair(
        { metadata: { interventions: capacity } },
        { metadata: { interventions: none } }
      )
    ).notes,
    []
  );
  for (const mask of [
    { mask: 0.5 },
    { vaccine: 0.2 },
    { lockdown: 0.5 },
    { selfiso: 0.1 }
  ]) {
    assert.deepEqual(
      checkComparable(
        pair(
          { metadata: { interventions: [{ ...none[0], ...mask }] } },
          { metadata: { interventions: none } }
        )
      ).notes,
      []
    );
  }
  // missing or malformed interventions say nothing either way
  for (const interventions of [undefined, 'none', null, [null, 5]]) {
    assert.deepEqual(
      checkComparable(
        pair({ metadata: { interventions } }, { metadata: { interventions } })
      ).notes,
      []
    );
  }
});

const RANDOM = { randseed: true, random_seed_behavior: 'random' };
const FIXED0 = { randseed: false, random_seed_behavior: 'deterministic:0' };
const FIXED7 = { randseed: false, random_seed_behavior: 'deterministic:7' };

test('seedPairing recognises random runs, matching fixed seeds and the rest as unknown', () => {
  assert.equal(seedPairing(RANDOM, RANDOM), 'different');
  assert.equal(seedPairing(RANDOM, FIXED0), 'different');
  assert.equal(seedPairing(FIXED0, RANDOM), 'different');
  assert.equal(seedPairing(FIXED0, FIXED0), 'same-fixed');
  assert.equal(seedPairing(FIXED0, { ...FIXED0 }), 'same-fixed');
  assert.equal(seedPairing(FIXED0, FIXED7), 'different');
  // a random run is random whatever the other record says
  assert.equal(seedPairing(RANDOM, null), 'different');
  assert.equal(seedPairing(null, RANDOM), 'different');
  assert.equal(seedPairing(RANDOM, {}), 'different');
});

test('seedPairing does not guess from missing or contradictory records', () => {
  assert.equal(seedPairing(null, null), 'unknown');
  assert.equal(seedPairing(FIXED0, null), 'unknown');
  assert.equal(seedPairing(null, FIXED0), 'unknown');
  assert.equal(seedPairing({}, {}), 'unknown');
  assert.equal(seedPairing(FIXED0, {}), 'unknown');
  // randseed and the behaviour text disagree
  const contradictory = [
    { randseed: true, random_seed_behavior: 'deterministic:0' },
    { randseed: false, random_seed_behavior: 'random' },
    { randseed: true },
    { randseed: false },
    { random_seed_behavior: 'random' },
    { randseed: false, random_seed_behavior: 'deterministic:' },
    { randseed: false, random_seed_behavior: 5 },
    { randseed: 'false', random_seed_behavior: 'deterministic:0' }
  ];
  for (const record of contradictory) {
    assert.equal(
      seedPairing(FIXED0, record),
      'unknown',
      JSON.stringify(record)
    );
    assert.equal(
      seedPairing(record, record),
      'unknown',
      JSON.stringify(record)
    );
  }
});

test('the seed note never claims more than the record supports', () => {
  const notes = ['same-fixed', 'different', 'unknown'].map(seedNote);
  assert.equal(new Set(notes).size, 3);
  assert.match(seedNote('same-fixed'), /does not remove it/);
  assert.doesNotMatch(seedNote('same-fixed'), /same (random )?seed/i);
  assert.match(seedNote('different'), /different random draws/);
  assert.match(seedNote('unknown'), /not recorded/);
  for (const note of notes) assert.match(note, /\.$/);
});
