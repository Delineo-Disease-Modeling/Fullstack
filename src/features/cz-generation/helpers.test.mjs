import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getMapSeedCbgIds,
  isClusterAlgorithm,
  isSeedCapturePruneAlgorithm
} from './helpers.ts';

test('getMapSeedCbgIds uses resolved seed region before single core seed', () => {
  assert.deepEqual(
    getMapSeedCbgIds({
      resolvedSeedCbgs: ['401139400081', '401139400082', '401139400083'],
      seedCbg: '401139400081'
    }),
    ['401139400081', '401139400082', '401139400083']
  );
});

test('getMapSeedCbgIds uses edited setup seed region before resolved lookup', () => {
  assert.deepEqual(
    getMapSeedCbgIds({
      resolvedSeedCbgs: ['401139400081', '401139400082', '401139400083'],
      setupSeedCbgs: ['401139400082', '401139400084'],
      seedCbg: '401139400081'
    }),
    ['401139400082', '401139400084']
  );
});

test('getMapSeedCbgIds uses guided seed region before setup seed region', () => {
  assert.deepEqual(
    getMapSeedCbgIds({
      guidedSeedCbgs: ['401139400085', '401139400086'],
      setupSeedCbgs: ['401139400081', '401139400082'],
      seedCbg: '401139400081'
    }),
    ['401139400085', '401139400086']
  );
});

test('seed_prune is a selectable algorithm that takes the seed-capture floor', () => {
  assert.equal(isClusterAlgorithm('seed_prune'), true);
  assert.equal(isSeedCapturePruneAlgorithm('seed_prune'), true);
  assert.equal(isSeedCapturePruneAlgorithm('mobility_prune'), true);
  assert.equal(isSeedCapturePruneAlgorithm('greedy_fast'), false);
  assert.equal(isSeedCapturePruneAlgorithm(undefined), false);
});
