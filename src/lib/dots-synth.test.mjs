import assert from 'node:assert/strict';
import { test } from 'node:test';

const { findNearestTime, synthesizeDotsFrame, synthesizeFromBundle } =
  await import('./dots-synth.ts');

test('synthesizeDotsFrame shows every infected/recovered, samples susceptibles', () => {
  // place "10": pop 5, 2 infected, 1 recovered -> 2 susceptible
  // place "20": pop 0 -> skipped
  const placeIds = ['10', '20'];
  const frame = [5, 2, 1, 0, 0, 0];
  const payload = synthesizeDotsFrame(placeIds, frame, 60, 75);

  assert.equal(payload.time, 60);
  assert.equal(payload.requested_time, 75);
  assert.equal(payload.total_people, 5);
  assert.equal(payload.source, 'person');
  assert.equal(payload.sample_rate, 1); // tiny pop -> no downsampling
  assert.equal(payload.locations.length, 1);

  const loc = payload.locations[0];
  assert.equal(loc.id, '10');
  assert.equal(loc.type, 'places');
  const infected = loc.people.filter((p) => p.infected).length;
  const recovered = loc.people.filter((p) => p.recovered).length;
  const susceptible = loc.people.filter(
    (p) => !p.infected && !p.recovered
  ).length;
  assert.equal(infected, 2);
  assert.equal(recovered, 1);
  assert.equal(susceptible, 2);
  // synthetic, stable ids the client sorts/positions by
  assert.ok(loc.people.every((p) => /^[iru]:10:\d+$/.test(p.id)));
});

test('synthesizeDotsFrame caps infected/recovered to population', () => {
  // garbage counts (inf+rec > pop) must not exceed pop
  const payload = synthesizeDotsFrame(['1'], [3, 10, 10], 0, 0);
  const loc = payload.locations[0];
  assert.equal(loc.people.length, 3);
  assert.equal(loc.people.filter((p) => p.infected).length, 3);
  assert.equal(loc.people.filter((p) => p.recovered).length, 0);
});

test('findNearestTime returns the closest available frame time', () => {
  assert.equal(findNearestTime([0, 60, 120], 50), 60);
  assert.equal(findNearestTime([0, 60, 120], 0), 0);
  assert.equal(findNearestTime([0, 60, 120], 1000), 120);
  assert.equal(findNearestTime([], 10), null);
});

test('synthesizeFromBundle resolves the nearest frame, null when empty', () => {
  const bundle = {
    placeIds: ['7'],
    frames: { 0: [4, 1, 0], 60: [4, 4, 0] },
    sortedTimes: [0, 60]
  };
  const near = synthesizeFromBundle(bundle, 55);
  assert.equal(near.time, 60);
  assert.equal(near.locations[0].people.filter((p) => p.infected).length, 4);

  assert.equal(
    synthesizeFromBundle(
      { placeIds: [], frames: {}, sortedTimes: [] },
      10
    ),
    null
  );
});
