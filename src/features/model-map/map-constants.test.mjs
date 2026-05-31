import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyAlpha,
  HEATMAP_MODES,
  PEOPLE_MAP_PREFETCH_STEPS,
  PERSON_STATUS_DOT_RADIUS,
  PLAYBACK_INTERVAL_MS
} from './map-constants.ts';

test('applyAlpha converts a hex color to an rgba string', () => {
  assert.equal(applyAlpha('#4CAF50', 0.5), 'rgba(76,175,80,0.5)');
  assert.equal(applyAlpha('#000000', 1), 'rgba(0,0,0,1)');
  // Works without the leading '#' as well.
  assert.equal(applyAlpha('ffffff', 0.2), 'rgba(255,255,255,0.2)');
});

test('HEATMAP_MODES only exposes the modes surfaced in the toggle UI', () => {
  assert.deepEqual(HEATMAP_MODES, ['markers', 'people']);
});

test('playback/prefetch tuning constants keep their expected values', () => {
  assert.equal(PLAYBACK_INTERVAL_MS, 750);
  assert.equal(PEOPLE_MAP_PREFETCH_STEPS, 4);
});

test('PERSON_STATUS_DOT_RADIUS is a zoom interpolation expression', () => {
  assert.equal(PERSON_STATUS_DOT_RADIUS[0], 'interpolate');
  assert.deepEqual(PERSON_STATUS_DOT_RADIUS[1], ['linear']);
  assert.deepEqual(PERSON_STATUS_DOT_RADIUS[2], ['zoom']);
});
