import assert from 'node:assert/strict';
import { test } from 'node:test';

const {
  RERUN_COUNT,
  IDLE,
  RERUN_DEFAULTS,
  buildRerunSettings,
  placeLabels,
  describeSeedCheck,
  rowFromRunInfo,
  runHours,
  seedCheckReducer,
  summarizeSeedCheck,
  topPlaceId,
  totalNewInfections
} = await import('./seed-check.ts');

const row = (simId, total, topPlaceId = null) => ({ simId, total, topPlaceId });
const grid = (hours) => Array.from({ length: hours }, (_, i) => (i + 1) * 60);

test('total new infections is home plus every place', () => {
  assert.equal(totalNewInfections({ home: 0, places: {} }), 0);
  assert.equal(totalNewInfections({ home: 10, places: { 1: 5, 2: 7 } }), 22);
});

test('counts that are missing or not whole numbers give no total', () => {
  for (const bad of [
    null,
    undefined,
    'x',
    { home: -1, places: {} },
    { home: 1.5, places: {} },
    { home: Number.NaN, places: {} },
    { home: '3', places: {} },
    { home: 1 },
    { home: 1, places: null },
    { home: 1, places: [] },
    { home: 1, places: { 1: -2 } },
    { home: 1, places: { 1: 0.5 } },
    { home: 1, places: { 1: '4' } },
    { home: Number.MAX_SAFE_INTEGER, places: { 1: 1 } },
    // two halves would add up to a whole number
    { home: 0.5, places: { 1: 0.5 } }
  ]) {
    assert.equal(totalNewInfections(bad), null, JSON.stringify(bad));
  }
});

test('the top place is the one with strictly the most infections', () => {
  assert.equal(topPlaceId({ home: 0, places: { 1: 3, 2: 9, 3: 4 } }), '2');
  // home does not compete with places
  assert.equal(topPlaceId({ home: 500, places: { 1: 3, 2: 2 } }), '1');
});

test('no top place when nobody was infected at a place, or when the lead is shared', () => {
  assert.equal(topPlaceId({ home: 5, places: {} }), null);
  assert.equal(topPlaceId({ home: 5, places: { 1: 0, 2: 0 } }), null);
  assert.equal(topPlaceId({ home: 0, places: { 1: 4, 2: 4, 3: 1 } }), null);
  // a tie that is beaten later does not matter
  assert.equal(topPlaceId({ home: 0, places: { 1: 4, 2: 4, 3: 9 } }), '3');
  // counts that make the whole run unusable give no place, even if one place leads
  assert.equal(topPlaceId({ home: -1, places: { 1: 5 } }), null);
  assert.equal(topPlaceId({ home: 0, places: { 1: 5, 2: -3 } }), null);
  // a tie below the top does not matter
  assert.equal(topPlaceId({ home: 0, places: { 1: 9, 2: 4, 3: 4 } }), '1');
  assert.equal(topPlaceId({ home: 0, places: { 1: 'x' } }), null);
  assert.equal(topPlaceId(null), null);
});

test('ignored places are not candidates but stay in the total', () => {
  const incidence = { home: 0, places: { 1033: 252, 7: 22, 8: 17 } };
  const ignore = new Set(['1033']);
  assert.equal(topPlaceId(incidence), '1033');
  assert.equal(topPlaceId(incidence, ignore), '7');
  assert.equal(totalNewInfections(incidence), 291);
  // only an ignored place had infections: no top place
  assert.equal(topPlaceId({ home: 0, places: { 1033: 5 } }, ignore), null);
  // the tie rule applies to what is left
  assert.equal(
    topPlaceId({ home: 0, places: { 1033: 9, 7: 2, 8: 2 } }, ignore),
    null
  );
});

test('a row is built only from usable counts', () => {
  const info = {
    metadata: null,
    zone: null,
    timesteps: [],
    incidence: { home: 2, places: { 4: 3 } }
  };
  assert.deepEqual(rowFromRunInfo(12, info), {
    simId: 12,
    total: 5,
    topPlaceId: '4'
  });
  assert.equal(rowFromRunInfo(12, { ...info, incidence: null }), null);
  assert.equal(
    rowFromRunInfo(12, { ...info, incidence: { home: -1, places: {} } }),
    null
  );
  assert.equal(rowFromRunInfo(12, info, new Set(['4'])).topPlaceId, null);
});

test('summary: min, max, median and the run on screen', () => {
  const s = summarizeSeedCheck([
    row(1, 900),
    row(2, 100),
    row(3, 500),
    row(4, 300),
    row(5, 700)
  ]);
  assert.equal(s.runs, 5);
  assert.equal(s.thisTotal, 900);
  assert.equal(s.min, 100);
  assert.equal(s.max, 900);
  assert.equal(s.median, 500);
});

test('summary: the median of an even number of runs is the mean of the middle two, not rounded', () => {
  assert.equal(summarizeSeedCheck([row(1, 1), row(2, 2)]).median, 1.5);
  assert.equal(
    summarizeSeedCheck([
      row(1, 0),
      row(2, 0),
      row(3, 0),
      row(4, 1),
      row(5, 1),
      row(6, 1)
    ]).median,
    0.5
  );
  assert.equal(
    summarizeSeedCheck([row(1, 10), row(2, 20), row(3, 30), row(4, 41)]).median,
    25
  );
  assert.equal(summarizeSeedCheck([row(1, 4), row(2, 6)]).median, 5);
});

test('summary: which places led, most runs first, and runs without one', () => {
  const s = summarizeSeedCheck([
    row(1, 10, '7'),
    row(2, 10, '8'),
    row(3, 10, '7'),
    row(4, 10, null),
    row(5, 10, '9'),
    row(6, 10, '9')
  ]);
  assert.deepEqual(s.topPlaces, [
    { placeId: '7', runs: 2 },
    { placeId: '9', runs: 2 },
    { placeId: '8', runs: 1 }
  ]);
  assert.equal(s.noTopRuns, 1);
  assert.equal(summarizeSeedCheck([]), null);
});

test('sentences: nobody infected anywhere', () => {
  const s = summarizeSeedCheck([row(1, 0), row(2, 0), row(3, 0)]);
  assert.deepEqual(describeSeedCheck(s, String), [
    'Nobody was newly infected in any of the 3 runs.'
  ]);
});

test('sentences: a range, the median and the leading places', () => {
  const s = summarizeSeedCheck([
    row(1, 1315, '7'),
    row(2, 919, '7'),
    row(3, 595, '8'),
    row(4, 714, null)
  ]);
  const names = { 7: 'Harbor Pub', 8: 'Corner Tavern' };
  assert.deepEqual(
    describeSeedCheck(s, (id) => names[id]),
    [
      'Total new infections: 1,315 in this run; 595 to 1,315 across all 4 runs (median 816.5).',
      'Top hotspot: Harbor Pub in 2 of 4 runs; Corner Tavern in 1 of 4 runs; no single top place in 1 run.'
    ]
  );
});

test('sentences: only a run with nobody infected anywhere is called empty', () => {
  const s = summarizeSeedCheck([row(1, 0), row(2, 5, '7')]);
  assert.match(
    describeSeedCheck(s, () => 'A')[0],
    /^Total new infections: 0 in this run; 0 to 5 across all 2 runs/
  );
});

test('sentences: the same total everywhere, and one run alone says nothing', () => {
  const same = summarizeSeedCheck([row(1, 40, '7'), row(2, 40, '7')]);
  assert.equal(
    describeSeedCheck(same, () => 'A')[0],
    'Total new infections: 40 in this run and in the other 1 run.'
  );
  assert.deepEqual(
    describeSeedCheck(summarizeSeedCheck([row(1, 5)]), String),
    []
  );
});

test('hours come from an hourly frame grid only', () => {
  assert.equal(runHours(grid(84)), 84);
  assert.equal(runHours(grid(1)), 1);
  for (const bad of [
    null,
    undefined,
    [],
    [120, 180],
    [60, 180],
    [60, 60],
    [0, 60],
    [60, 120.5],
    [30, 60]
  ]) {
    assert.equal(runHours(bad), null, JSON.stringify(bad));
  }
});

const ZONE = { id: 6, length: 672 };
const META = {
  dmp_mode: 'required',
  initial_infected_count: 2,
  initial_infected_ids: ['276', ' 1166 ', ''],
  randseed: false,
  disease_name: 'Flu',
  variants: ['H1'],
  model_path_by_variant: { H1: 'variant.H1.general' },
  disabled_poi_ids: [' 7 ', '8', ''],
  interventions: [
    { time: 0, mask: 0, vaccine: 0, capacity: 1, lockdown: 0, selfiso: 0 },
    { time: 48, mask: 0, vaccine: 0, capacity: 1, lockdown: 0.5, selfiso: 0.6 }
  ]
};
// What the page's settings store might hold from some other run or form.
const OTHER = {
  ...RERUN_DEFAULTS,
  sim_id: 55,
  zone: { id: 99 },
  hours: 5,
  randseed: false,
  initial_infected_count: 77,
  initial_infected_ids: ['999'],
  disease_name: 'Other',
  variants: ['Z'],
  dmp_mode: 'off',
  model_path_by_variant: { Z: 'variant.Z.general' },
  matrix_by_variant: { Z: 9 },
  disabled_poi_ids: ['stale'],
  interventions: [
    {
      time: 0,
      mask: 0.9,
      vaccine: 0.9,
      capacity: 0.1,
      lockdown: 0.9,
      selfiso: 0.9
    }
  ],
  compareBaseline: true
};

test('rerun settings: exactly the settings the run recorded, over its own length, with a fresh seed', () => {
  const out = buildRerunSettings(
    { metadata: META, zone: ZONE, timesteps: grid(84) },
    OTHER
  );
  assert.equal(out.ok, true);
  const s = out.settings;
  assert.equal(s.randseed, true);
  assert.equal(s.sim_id, null);
  assert.equal(s.hours, 84);
  assert.equal(s.zone, ZONE);
  assert.equal(s.dmp_mode, 'required');
  assert.equal(s.initial_infected_count, 2);
  assert.deepEqual(s.initial_infected_ids, ['276', '1166']);
  assert.equal(s.disease_name, 'Flu');
  assert.deepEqual(s.variants, ['H1']);
  assert.deepEqual(s.model_path_by_variant, { H1: 'variant.H1.general' });
  assert.deepEqual(s.disabled_poi_ids, ['7', '8']);
  assert.equal(s.interventions.length, 2);
  assert.equal(s.interventions[1].lockdown, 0.5);
  assert.equal(s.interventions[1].selfiso, 0.6);
  assert.deepEqual(s.matrix_by_variant, {});
  assert.equal(s.compareBaseline, false);
});

test('rerun settings: nothing from the other settings leaks in, empty lists included', () => {
  // nobody was infected at the start: an empty list is the real answer
  const meta = {
    ...META,
    initial_infected_count: 0,
    initial_infected_ids: [],
    disabled_poi_ids: []
  };
  const out = buildRerunSettings(
    { metadata: meta, zone: ZONE, timesteps: grid(3) },
    OTHER
  );
  assert.equal(out.ok, true);
  assert.equal(out.settings.initial_infected_count, 0);
  assert.deepEqual(out.settings.initial_infected_ids, []);
  assert.deepEqual(out.settings.disabled_poi_ids, []);
  assert.equal(out.settings.hours, 3);
  // a run that never named a disabled place records none at all
  const { disabled_poi_ids: _ignored, ...withoutDisabled } = META;
  const again = buildRerunSettings(
    { metadata: withoutDisabled, zone: ZONE, timesteps: grid(3) },
    OTHER
  );
  assert.equal(again.ok, true);
  assert.deepEqual(again.settings.disabled_poi_ids, []);
});

test('rerun settings: the people infected at the start must be recorded, as many as the count says', () => {
  for (const [count, ids] of [
    [10, []],
    [3, ['1', '2']],
    [1, ['1', '2']],
    [0, ['1']]
  ]) {
    const out = buildRerunSettings(
      {
        metadata: {
          ...META,
          initial_infected_count: count,
          initial_infected_ids: ids
        },
        zone: ZONE,
        timesteps: grid(4)
      },
      OTHER
    );
    assert.equal(out.ok, false, `${count} / ${ids}`);
    assert.match(out.reason, /initial infected people/);
  }
  // numbers are fine as ids, blanks are not people
  const out = buildRerunSettings(
    {
      metadata: {
        ...META,
        initial_infected_count: 2,
        initial_infected_ids: [276, ' ', '1166']
      },
      zone: ZONE,
      timesteps: grid(4)
    },
    OTHER
  );
  assert.deepEqual(out.settings.initial_infected_ids, ['276', '1166']);
});

const NAMES = {
  initial_infected_count: 'initial infected count',
  initial_infected_ids: 'initial infected people',
  dmp_mode: 'DMP mode',
  disease_name: 'disease',
  variants: 'variants',
  model_path_by_variant: 'disease model',
  interventions: 'interventions'
};

test('rerun settings: a run that does not record a setting is refused, not filled up', () => {
  for (const key of [
    'initial_infected_count',
    'initial_infected_ids',
    'dmp_mode',
    'disease_name',
    'variants',
    'model_path_by_variant',
    'interventions'
  ]) {
    const { [key]: _removed, ...meta } = META;
    const out = buildRerunSettings(
      { metadata: meta, zone: ZONE, timesteps: grid(4) },
      OTHER
    );
    assert.equal(out.ok, false, key);
    assert.match(out.reason, /does not record all of its settings/, key);
    assert.ok(out.reason.includes(NAMES[key]), `${key}: ${out.reason}`);
  }
  for (const metadata of [null, undefined, 'x', [], {}]) {
    const out = buildRerunSettings(
      { metadata, zone: ZONE, timesteps: grid(4) },
      OTHER
    );
    assert.equal(out.ok, false, JSON.stringify(metadata));
  }
  // recorded, but unusable
  for (const bad of [
    { dmp_mode: 'maybe' },
    { initial_infected_count: -1 },
    { initial_infected_count: 1.5 },
    { initial_infected_ids: 'x' },
    { disease_name: '  ' },
    { variants: [] },
    { interventions: [] },
    { interventions: [{ time: 0 }] },
    // one bad row is not dropped quietly
    {
      interventions: [
        META.interventions[0],
        { time: 48, mask: 0, vaccine: 0, capacity: 1, lockdown: 0.5 }
      ]
    },
    {
      interventions: [
        META.interventions[0],
        { ...META.interventions[1], lockdown: '0.5' }
      ]
    },
    {
      interventions: [
        META.interventions[0],
        { ...META.interventions[1], mask: Number.NaN }
      ]
    },
    { model_path_by_variant: { H1: 17 } },
    { model_path_by_variant: [] },
    { model_path_by_variant: 'x' },
    { variants: [null] },
    { variants: [7] },
    { variants: ['H1', {}] },
    { initial_infected_ids: [null, {}], initial_infected_count: 2 },
    { initial_infected_ids: ['276', true], initial_infected_count: 2 },
    { disabled_poi_ids: '7' },
    { disabled_poi_ids: [null] },
    { disabled_poi_ids: {} }
  ]) {
    const out = buildRerunSettings(
      { metadata: { ...META, ...bad }, zone: ZONE, timesteps: grid(4) },
      OTHER
    );
    assert.equal(out.ok, false, JSON.stringify(bad));
  }
});

test('rerun settings: a count that is not a whole number is named as such', () => {
  for (const count of [-1, 1.5, '2', null, Number.NaN]) {
    const out = buildRerunSettings(
      {
        metadata: { ...META, initial_infected_count: count },
        zone: ZONE,
        timesteps: grid(4)
      },
      OTHER
    );
    assert.equal(out.ok, false, String(count));
    assert.match(out.reason, /initial infected count/, String(count));
  }
});

test('rerun settings: a disabled-places list that is present but not a list is named', () => {
  for (const bad of ['7', {}, [null], [{}], 5]) {
    const out = buildRerunSettings(
      {
        metadata: { ...META, disabled_poi_ids: bad },
        zone: ZONE,
        timesteps: grid(4)
      },
      OTHER
    );
    assert.equal(out.ok, false, JSON.stringify(bad));
    assert.match(out.reason, /disabled places/, JSON.stringify(bad));
  }
});

test('rerun settings: an id that is not a finite number is refused', () => {
  for (const id of [Number.POSITIVE_INFINITY, Number.NaN]) {
    const out = buildRerunSettings(
      {
        metadata: {
          ...META,
          initial_infected_count: 1,
          initial_infected_ids: [id]
        },
        zone: ZONE,
        timesteps: grid(4)
      },
      OTHER
    );
    assert.equal(out.ok, false, String(id));
  }
});

test('rerun settings: the reason names what is missing', () => {
  const { dmp_mode: _a, interventions: _b, ...meta } = META;
  const out = buildRerunSettings({
    metadata: meta,
    zone: ZONE,
    timesteps: grid(4)
  });
  assert.match(out.reason, /DMP mode, interventions/);
});

test('rerun settings: the defaults are not changed and the result shares nothing with them', () => {
  const copy = JSON.parse(JSON.stringify(OTHER));
  const out = buildRerunSettings(
    { metadata: META, zone: ZONE, timesteps: grid(3) },
    OTHER
  );
  assert.deepEqual(OTHER, copy);
  out.settings.variants.push('changed');
  out.settings.interventions.push({});
  out.settings.initial_infected_ids.push('changed');
  assert.deepEqual(OTHER, copy);
  const fresh = buildRerunSettings({
    metadata: META,
    zone: ZONE,
    timesteps: grid(3)
  });
  assert.deepEqual(fresh.settings.variants, ['H1']);
});

test('rerun settings: refused without a zone or an hourly grid', () => {
  const noZone = buildRerunSettings({
    metadata: META,
    zone: null,
    timesteps: grid(4)
  });
  assert.equal(noZone.ok, false);
  const noGrid = buildRerunSettings({
    metadata: META,
    zone: ZONE,
    timesteps: [60, 180]
  });
  assert.equal(noGrid.ok, false);
  assert.match(noGrid.reason, /hourly/);
});

test('rerun settings: the default matrix is assigned to every variant, as the form does', () => {
  const two = { ...META, variants: ['H1', 'H2'] };
  const out = buildRerunSettings(
    { metadata: two, zone: ZONE, timesteps: grid(4) },
    OTHER,
    { defaultMatrixId: 3 }
  );
  assert.deepEqual(out.settings.matrix_by_variant, { H1: 3, H2: 3 });
  for (const options of [
    undefined,
    {},
    { defaultMatrixId: null },
    { defaultMatrixId: 0 },
    { defaultMatrixId: -1 },
    { defaultMatrixId: 1.5 },
    { defaultMatrixId: '3' }
  ]) {
    const none = buildRerunSettings(
      { metadata: META, zone: ZONE, timesteps: grid(4) },
      OTHER,
      options
    );
    assert.deepEqual(
      none.settings.matrix_by_variant,
      {},
      JSON.stringify(options)
    );
  }
});

test('place labels: a made-up label that equals another real name is told apart too', () => {
  const labels = placeLabels([
    { id: '7', label: 'Starbucks' },
    { id: '8', label: 'Starbucks' },
    { id: '9', label: 'Starbucks (#7)' }
  ]);
  assert.equal(new Set(labels.values()).size, 3);
  assert.equal(labels.get('8'), 'Starbucks (#8)');
  assert.match(labels.get('7'), /#7.*\b7\b/);
  assert.match(labels.get('9'), /\b9\b/);
});

test('the rerun defaults are the settings store defaults', async () => {
  const { default: useSimSettings } = await import('../stores/simsettings.ts');
  const {
    setSettings: _s,
    addInterventions: _a,
    deleteInterventions: _d,
    ...state
  } = useSimSettings.getState();
  assert.deepEqual(RERUN_DEFAULTS, state);
});

test('place labels: equal names are told apart by id, others stay as they are', () => {
  const labels = placeLabels([
    { id: '7', label: 'Starbucks' },
    { id: 8, label: 'Starbucks' },
    { id: '9', label: 'Corner Tavern' },
    { id: '10', label: 'Starbucks' }
  ]);
  assert.equal(labels.get('7'), 'Starbucks (#7)');
  assert.equal(labels.get('8'), 'Starbucks (#8)');
  assert.equal(labels.get('10'), 'Starbucks (#10)');
  assert.equal(labels.get('9'), 'Corner Tavern');
  assert.equal(placeLabels(null).size, 0);
  assert.equal(placeLabels([]).size, 0);
});

const ROWS = Array.from({ length: RERUN_COUNT + 1 }, (_, i) =>
  row(100 + i, 10 * i)
);

test('state machine: a check runs from begin to done', () => {
  let s = seedCheckReducer(IDLE, { type: 'begin', simId: 7 });
  assert.deepEqual(s, {
    status: 'running',
    simId: 7,
    rows: [],
    progress: null,
    message: null
  });
  s = seedCheckReducer(s, { type: 'first-row', simId: 7, row: ROWS[0] });
  assert.equal(s.rows.length, 1);
  for (let i = 1; i <= RERUN_COUNT; i += 1) {
    assert.equal(s.status, 'running', `before run ${i}`);
    s = seedCheckReducer(s, { type: 'run-done', simId: 7, row: ROWS[i] });
  }
  assert.equal(s.status, 'done');
  assert.equal(s.rows.length, RERUN_COUNT + 1);
  assert.equal(s.simId, 7);
});

test('state machine: progress is kept within 0 to 100 and cleared by a finished run', () => {
  let s = seedCheckReducer(IDLE, { type: 'begin', simId: 7 });
  s = seedCheckReducer(s, { type: 'first-row', simId: 7, row: ROWS[0] });
  s = seedCheckReducer(s, {
    type: 'progress',
    simId: 7,
    value: 140,
    message: 'Simulating'
  });
  assert.equal(s.progress, 100);
  assert.equal(s.message, 'Simulating');
  s = seedCheckReducer(s, { type: 'progress', simId: 7, value: -5 });
  assert.equal(s.progress, 0);
  s = seedCheckReducer(s, { type: 'progress', simId: 7, value: Number.NaN });
  assert.equal(s.progress, 0);
  s = seedCheckReducer(s, { type: 'run-done', simId: 7, row: ROWS[1] });
  assert.equal(s.progress, null);
  assert.equal(s.message, null);
});

test('state machine: a failure keeps the runs finished so far, stop keeps them too', () => {
  let s = seedCheckReducer(IDLE, { type: 'begin', simId: 7 });
  s = seedCheckReducer(s, { type: 'first-row', simId: 7, row: ROWS[0] });
  s = seedCheckReducer(s, { type: 'run-done', simId: 7, row: ROWS[1] });
  const failed = seedCheckReducer(s, {
    type: 'fail',
    simId: 7,
    message: 'boom'
  });
  assert.deepEqual(failed, {
    status: 'error',
    simId: 7,
    rows: [ROWS[0], ROWS[1]],
    message: 'boom'
  });
  const stopped = seedCheckReducer(s, { type: 'stop', simId: 7 });
  assert.deepEqual(stopped, {
    status: 'stopped',
    simId: 7,
    rows: [ROWS[0], ROWS[1]]
  });
});

test('state machine: answers for another run, or after the end, change nothing', () => {
  let s = seedCheckReducer(IDLE, { type: 'begin', simId: 7 });
  s = seedCheckReducer(s, { type: 'first-row', simId: 7, row: ROWS[0] });
  for (const action of [
    { type: 'run-done', simId: 8, row: ROWS[1] },
    { type: 'progress', simId: 8, value: 50 },
    { type: 'fail', simId: 8, message: 'x' },
    { type: 'stop', simId: 8 },
    { type: 'first-row', simId: 7, row: ROWS[2] }
  ]) {
    assert.equal(seedCheckReducer(s, action), s, action.type);
  }
  const stopped = seedCheckReducer(s, { type: 'stop', simId: 7 });
  for (const action of [
    { type: 'run-done', simId: 7, row: ROWS[1] },
    { type: 'progress', simId: 7, value: 50 },
    { type: 'fail', simId: 7, message: 'late' }
  ]) {
    assert.equal(seedCheckReducer(stopped, action), stopped, action.type);
  }
  assert.equal(
    seedCheckReducer(IDLE, { type: 'run-done', simId: 7, row: ROWS[1] }),
    IDLE
  );
  // a run result before the first row cannot make a one-row table
  const fresh = seedCheckReducer(IDLE, { type: 'begin', simId: 7 });
  assert.equal(
    seedCheckReducer(fresh, { type: 'run-done', simId: 7, row: ROWS[1] }),
    fresh
  );
});

test('state machine: begin starts over and reset clears', () => {
  let s = seedCheckReducer(IDLE, { type: 'begin', simId: 7 });
  s = seedCheckReducer(s, { type: 'first-row', simId: 7, row: ROWS[0] });
  s = seedCheckReducer(s, { type: 'begin', simId: 9 });
  assert.deepEqual(s, {
    status: 'running',
    simId: 9,
    rows: [],
    progress: null,
    message: null
  });
  assert.equal(seedCheckReducer(s, { type: 'reset' }), IDLE);
});
