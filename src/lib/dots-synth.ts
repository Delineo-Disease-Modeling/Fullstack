// Pure (no Node deps) synthesis of the Cases-map "dot" payload from a compact
// per-place [population, infected, recovered] frame. Shared by the server
// (people-map-cache.ts / the /dots + /people-map routes) and the client
// (modelmap.tsx), so a frame synthesized in the browser is byte-for-byte the
// same as one synthesized on the server. Person dots are a sampled,
// non-interactive visualization, so synthetic ids are fine.

const MAX_PEOPLE_DOTS = 12_000;

export type SynthPerson = {
  id: string;
  infected: boolean;
  newly_infected: boolean;
  recovered: boolean;
};

export type SynthLocation = {
  type: 'places';
  id: string;
  people: SynthPerson[];
};

export type SynthPeopleMap = {
  time: number;
  requested_time: number;
  total_people: number;
  returned_people: number;
  sample_rate: number;
  source: 'person';
  locations: SynthLocation[];
};

/** A whole-run compact dots bundle (the parsed `{fileId}.dots.json`). */
export type DotsBundle = {
  placeIds: string[];
  frames: Record<string, number[]>;
  sortedTimes: number[];
};

export function findNearestTime(sortedTimes: number[], requestedTime: number) {
  if (sortedTimes.length === 0) return null;
  let nearest = sortedTimes[0];
  for (const time of sortedTimes) {
    if (Math.abs(time - requestedTime) < Math.abs(nearest - requestedTime)) {
      nearest = time;
    }
    if (time > requestedTime) break;
  }
  return nearest;
}

/** Build the sampled dot payload from a place-count frame (synthetic people). */
export function synthesizeDotsFrame(
  placeIds: string[],
  frame: number[],
  time: number,
  requestedTime: number
): SynthPeopleMap {
  let totalPeople = 0;
  for (let index = 0; index < placeIds.length; index += 1) {
    totalPeople += frame[index * 3] || 0;
  }
  const sampleRate = Math.max(1, Math.ceil(totalPeople / MAX_PEOPLE_DOTS));

  let returnedPeople = 0;
  const locations: SynthLocation[] = [];

  for (let index = 0; index < placeIds.length; index += 1) {
    const base = index * 3;
    const population = frame[base] || 0;
    if (population === 0) {
      continue;
    }
    const infected = Math.min(population, frame[base + 1] || 0);
    const recovered = Math.min(population - infected, frame[base + 2] || 0);
    const uninfected = Math.max(0, population - infected - recovered);
    const placeId = placeIds[index];

    // Match the live route's semantics: every infected/recovered person is
    // shown; only susceptibles are downsampled.
    const uninfectedSamples =
      uninfected > 0 ? Math.max(1, Math.ceil(uninfected / sampleRate)) : 0;
    const people: SynthPerson[] = [];
    for (let k = 0; k < infected; k += 1) {
      people.push({
        id: `i:${placeId}:${k}`,
        infected: true,
        newly_infected: false,
        recovered: false
      });
    }
    for (let k = 0; k < recovered; k += 1) {
      people.push({
        id: `r:${placeId}:${k}`,
        infected: false,
        newly_infected: false,
        recovered: true
      });
    }
    for (let k = 0; k < uninfectedSamples; k += 1) {
      people.push({
        id: `u:${placeId}:${k}`,
        infected: false,
        newly_infected: false,
        recovered: false
      });
    }

    if (people.length > 0) {
      returnedPeople += people.length;
      locations.push({ type: 'places', id: placeId, people });
    }
  }

  return {
    time,
    requested_time: requestedTime,
    total_people: totalPeople,
    returned_people: returnedPeople,
    sample_rate: sampleRate,
    source: 'person',
    locations
  };
}

/** Synthesize the frame nearest `requestedTime` from a whole-run bundle. */
export function synthesizeFromBundle(
  bundle: DotsBundle,
  requestedTime: number
): SynthPeopleMap | null {
  const nearest = findNearestTime(bundle.sortedTimes, requestedTime);
  if (nearest === null) {
    return null;
  }
  const frame = bundle.frames[String(nearest)];
  if (!frame) {
    return null;
  }
  return synthesizeDotsFrame(bundle.placeIds, frame, nearest, requestedTime);
}
