import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getDisabledPoiIdsFromMetadata,
  getInterventions,
  getModelPaths,
  getSeedCbgIdsForRun,
  getSeedRegionLookupQueryForRun,
  getRunSettingsFromMetadata,
  getStringArray
} from './run-metadata.ts';

test('getDisabledPoiIdsFromMetadata pulls trimmed, non-empty ids', () => {
  assert.deepEqual(
    getDisabledPoiIdsFromMetadata({ disabled_poi_ids: [' a ', 'b', '', 3] }),
    ['a', 'b', '3']
  );
});

test('getDisabledPoiIdsFromMetadata is empty for non-objects / missing / non-array', () => {
  assert.deepEqual(getDisabledPoiIdsFromMetadata(null), []);
  assert.deepEqual(getDisabledPoiIdsFromMetadata('x'), []);
  assert.deepEqual(getDisabledPoiIdsFromMetadata({}), []);
  assert.deepEqual(
    getDisabledPoiIdsFromMetadata({ disabled_poi_ids: 'a' }),
    []
  );
});

test('getSeedCbgIdsForRun reads explicit seed CBG metadata', () => {
  assert.deepEqual(
    getSeedCbgIdsForRun(null, {
      algorithm_metadata: {
        seed_cbgs: ['401139400081', '401139400082', '401139400083']
      }
    }),
    ['401139400081', '401139400082', '401139400083']
  );
});

test('getSeedCbgIdsForRun reads saved explicit seed CBG description line', () => {
  assert.deepEqual(
    getSeedCbgIdsForRun(
      {
        description:
          'Auto-generated\nSeed CBGs: 401139400081, 401139400082, 401139400083',
        cbg_list: ['401139400084']
      },
      null
    ),
    ['401139400081', '401139400082', '401139400083']
  );
});

test('getSeedCbgIdsForRun falls back to old guided seed count descriptions', () => {
  assert.deepEqual(
    getSeedCbgIdsForRun(
      {
        description: 'Seed CBG: 401139400081\nSeed region: 3 seed CBGs',
        cbg_list: [
          '401139400081',
          '401139400082',
          '401139400083',
          '401139400084'
        ]
      },
      null
    ),
    ['401139400081', '401139400082', '401139400083']
  );
});

test('getSeedRegionLookupQueryForRun reads old guided seed labels', () => {
  assert.equal(
    getSeedRegionLookupQueryForRun(
      {
        description: 'Seed CBG: 401139400081\nSeed region: Pawhuska, OK'
      },
      null
    ),
    'Pawhuska, OK'
  );
  assert.equal(
    getSeedRegionLookupQueryForRun(
      {
        description: 'Seed region: 3 seed CBGs'
      },
      null
    ),
    ''
  );
});

test('getSeedRegionLookupQueryForRun falls back to generated location labels', () => {
  assert.equal(
    getSeedRegionLookupQueryForRun(
      {
        description: 'Location: Pawhuska, OK\nSeed CBG: 401139400081'
      },
      null
    ),
    'Pawhuska, OK'
  );
});

test('getStringArray trims/filters and nulls on empty or non-array', () => {
  assert.deepEqual(getStringArray([' x ', '', 'y']), ['x', 'y']);
  assert.equal(getStringArray(['', '   ']), null);
  assert.equal(getStringArray('nope'), null);
});

test('getModelPaths keeps string/null entries and drops others', () => {
  assert.deepEqual(
    getModelPaths({ a: 'p', b: null, c: 5, d: { nested: true } }),
    { a: 'p', b: null }
  );
  assert.equal(getModelPaths(42), null);
});

test('getInterventions keeps only fully-numeric rows', () => {
  const good = {
    time: 1,
    mask: 0,
    vaccine: 0,
    capacity: 100,
    lockdown: 0,
    selfiso: 0
  };
  const bad = { ...good, mask: 'x' };
  assert.deepEqual(getInterventions([good, bad]), [good]);
  assert.equal(getInterventions([bad]), null);
  assert.equal(getInterventions('nope'), null);
});

const FALLBACK = {
  disease_name: 'fallback-disease',
  variants: ['fv'],
  dmp_mode: 'off',
  model_path_by_variant: { fv: 'fallback/path' },
  initial_infected_count: 1,
  initial_infected_ids: [],
  randseed: false,
  interventions: []
};

test('getRunSettingsFromMetadata returns {} for non-records', () => {
  assert.deepEqual(getRunSettingsFromMetadata(null, FALLBACK), {});
  assert.deepEqual(getRunSettingsFromMetadata('x', FALLBACK), {});
});

test('getRunSettingsFromMetadata reads valid fields and falls back on invalid ones', () => {
  const intervention = {
    time: 5,
    mask: 0.5,
    vaccine: 0,
    capacity: 80,
    lockdown: 0,
    selfiso: 0
  };
  const out = getRunSettingsFromMetadata(
    {
      disease_name: 'covid',
      variants: ['a', 'b'],
      dmp_mode: 'auto',
      model_path_by_variant: { a: 'pa' },
      initial_infected_count: 7,
      initial_infected_ids: [' 10 ', '11', ''],
      randseed: true,
      interventions: [intervention]
    },
    FALLBACK
  );
  assert.equal(out.disease_name, 'covid');
  assert.deepEqual(out.variants, ['a', 'b']);
  assert.equal(out.dmp_mode, 'auto');
  assert.deepEqual(out.model_path_by_variant, { a: 'pa' });
  assert.equal(out.initial_infected_count, 7);
  assert.deepEqual(out.initial_infected_ids, ['10', '11']);
  assert.equal(out.randseed, true);
  assert.deepEqual(out.interventions, [intervention]);
});

test('getRunSettingsFromMetadata uses fallback for bad/missing values', () => {
  const out = getRunSettingsFromMetadata(
    {
      disease_name: 42, // not a string -> fallback
      dmp_mode: 'bogus', // not a valid mode -> fallback
      initial_infected_count: 'nope', // not a number -> fallback
      randseed: 'yes' // not a boolean -> fallback
    },
    FALLBACK
  );
  assert.equal(out.disease_name, FALLBACK.disease_name);
  assert.equal(out.dmp_mode, FALLBACK.dmp_mode);
  assert.equal(out.initial_infected_count, FALLBACK.initial_infected_count);
  assert.equal(out.randseed, FALLBACK.randseed);
  assert.deepEqual(out.variants, FALLBACK.variants);
  assert.deepEqual(out.interventions, FALLBACK.interventions);
});
