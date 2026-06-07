import type { NextRequest } from 'next/server';
import { resolveDbDataPath } from '@/lib/db-files';
import { streamJsonObjectEntries } from '@/lib/json-stream';
import {
  getPatternMeta,
  isNumericTimestep,
  type PatternMeta,
  placesFromNumeric
} from '@/lib/numeric-movement';
import { getCachedPapdata } from '@/lib/papdata-cache';
import { prisma } from '@/lib/prisma';
import type {
  DiseaseStateTimestep,
  PatternTimestep
} from '@/lib/simulation-data';
import { jsonMessage } from '@/server/api/responses';
import { parseNonNegativeRouteNumber } from '@/server/api/route-params';

const ACTIVE_INFECTION_MASK = 1 | 2 | 4 | 8;
const RECOVERED_MASK = 16;
const MAX_PEOPLE_DOTS = 12_000;
const CACHE_LIMIT = 160;

type PeopleMapPerson = {
  id: string;
  infected: boolean;
  newly_infected: boolean;
  recovered: boolean;
};

type PeopleMapLocation = {
  type: 'places';
  id: string;
  people: PeopleMapPerson[];
};

type PeopleMapPayload = {
  time: number;
  requested_time: number;
  total_people: number;
  returned_people: number;
  sample_rate: number;
  source: 'person' | 'aggregate';
  locations: PeopleMapLocation[];
};

type SelectedTimestep<T> = {
  time: number;
  key: string;
  value: T;
};

const responseCache = new Map<string, PeopleMapPayload>();

function cachePayload(key: string, payload: PeopleMapPayload) {
  responseCache.set(key, payload);
  if (responseCache.size <= CACHE_LIMIT) {
    return;
  }

  const oldestKey = responseCache.keys().next().value;
  if (oldestKey) {
    responseCache.delete(oldestKey);
  }
}

function hashString(input: string) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function buildActiveInfectedSet(timestep: DiseaseStateTimestep | null) {
  const infected = new Set<string>();
  if (!timestep) {
    return infected;
  }

  for (const people of Object.values(timestep)) {
    for (const [personId, stateBitmask] of Object.entries(people)) {
      if ((Number(stateBitmask) & ACTIVE_INFECTION_MASK) !== 0) {
        infected.add(personId);
      }
    }
  }

  return infected;
}

function buildRecoveredSet(timestep: DiseaseStateTimestep | null) {
  const recovered = new Set<string>();
  if (!timestep) {
    return recovered;
  }

  for (const people of Object.values(timestep)) {
    for (const [personId, stateBitmask] of Object.entries(people)) {
      if ((Number(stateBitmask) & RECOVERED_MASK) !== 0) {
        recovered.add(personId);
      }
    }
  }

  return recovered;
}

function shouldIncludePerson(
  personId: string,
  infected: boolean,
  newlyInfected: boolean,
  recovered: boolean,
  sampleRate: number
) {
  if (sampleRate <= 1 || infected || newlyInfected || recovered) {
    return true;
  }

  return hashString(personId) % sampleRate === 0;
}

function toNonNegativeCount(value: unknown) {
  const count = Number(value);
  if (!Number.isFinite(count) || count <= 0) {
    return 0;
  }
  return Math.trunc(count);
}

function hasAggregatePlacesOnly(
  patternValue: PatternTimestep
): patternValue is PatternTimestep & { p: number[] } {
  return (
    Array.isArray(patternValue.p) &&
    !Array.isArray(patternValue.loc) &&
    Object.keys(patternValue.places ?? {}).length === 0
  );
}

async function loadSortedPlaceIds(papdataId: string) {
  const papdata = await getCachedPapdata(papdataId);
  return Object.keys(papdata.places).sort((a, b) => Number(a) - Number(b));
}

function addAggregatePeople(
  people: PeopleMapPerson[],
  placeId: string,
  status: 'i' | 'u',
  count: number
) {
  const infected = status === 'i';
  for (let index = 0; index < count; index += 1) {
    people.push({
      id: `agg:${placeId}:${status}:${index}`,
      infected,
      newly_infected: false,
      recovered: false
    });
  }
}

async function buildAggregatePeopleMapPayload(
  patternTime: SelectedTimestep<PatternTimestep & { p: number[] }>,
  requestedTime: number,
  papdataId: string
): Promise<PeopleMapPayload> {
  const placeIds = await loadSortedPlaceIds(papdataId);
  const countsByPlace: {
    placeId: string;
    population: number;
    infected: number;
  }[] = [];

  let totalPeople = 0;
  const placeCount = Math.min(
    placeIds.length,
    Math.floor(patternTime.value.p.length / 2)
  );
  for (let index = 0; index < placeCount; index += 1) {
    const population = toNonNegativeCount(patternTime.value.p[index * 2]);
    if (population === 0) {
      continue;
    }

    const infected = Math.min(
      population,
      toNonNegativeCount(patternTime.value.p[index * 2 + 1])
    );
    totalPeople += population;
    countsByPlace.push({
      placeId: placeIds[index],
      population,
      infected
    });
  }

  const sampleRate = Math.max(1, Math.ceil(totalPeople / MAX_PEOPLE_DOTS));
  let returnedPeople = 0;
  const locations: PeopleMapLocation[] = [];

  for (const { placeId, population, infected } of countsByPlace) {
    const uninfected = population - infected;
    const infectedSamples =
      infected > 0
        ? Math.min(infected, Math.max(1, Math.ceil(infected / sampleRate)))
        : 0;
    const uninfectedSamples =
      uninfected > 0
        ? Math.min(
            uninfected,
            Math.max(1, Math.ceil(uninfected / sampleRate))
          )
        : 0;
    const sampledPeople: PeopleMapPerson[] = [];

    addAggregatePeople(sampledPeople, placeId, 'i', infectedSamples);
    addAggregatePeople(sampledPeople, placeId, 'u', uninfectedSamples);

    if (sampledPeople.length > 0) {
      returnedPeople += sampledPeople.length;
      locations.push({
        type: 'places',
        id: placeId,
        people: sampledPeople
      });
    }
  }

  return {
    time: patternTime.time,
    requested_time: requestedTime,
    total_people: totalPeople,
    returned_people: returnedPeople,
    sample_rate: sampleRate,
    source: 'aggregate',
    locations
  } satisfies PeopleMapPayload;
}

async function loadSelectedSimTimestep(fileId: string, requestedTime: number) {
  const { path, gzipped } = await resolveDbDataPath(fileId, '.sim');
  const entries = streamJsonObjectEntries<DiseaseStateTimestep>(path, gzipped);
  let current: SelectedTimestep<DiseaseStateTimestep> | null = null;
  let previous: SelectedTimestep<DiseaseStateTimestep> | null = null;

  for await (const { key, value } of entries) {
    const time = Number(key);
    if (!Number.isFinite(time)) {
      continue;
    }

    if (time > requestedTime && current) {
      break;
    }

    if (time <= requestedTime) {
      previous = current;
      current = { key, time, value };
    }
  }

  if (!current) {
    throw new Error('No simulation timestep found.');
  }

  return { current, previous };
}

async function loadSelectedPatternTimestep(fileId: string, targetTime: number) {
  const { path, gzipped } = await resolveDbDataPath(fileId, '.pat');
  const entries = streamJsonObjectEntries<PatternTimestep | PatternMeta>(
    path,
    gzipped
  );
  let current: SelectedTimestep<PatternTimestep> | null = null;
  let meta: PatternMeta | null = null;

  for await (const { key, value } of entries) {
    if (key === 'meta') {
      meta = getPatternMeta({ meta: value });
      continue;
    }

    const time = Number(key);
    if (!Number.isFinite(time)) {
      continue;
    }

    if (time > targetTime && current) {
      break;
    }

    if (time <= targetTime) {
      current = { key, time, value: value as PatternTimestep };
    }
  }

  if (!current) {
    throw new Error('No movement timestep found.');
  }

  return { current, meta };
}

async function buildPeopleMapPayload(
  fileId: string,
  requestedTime: number,
  papdataId: string | null
): Promise<PeopleMapPayload> {
  const cacheKey = `${fileId}:${requestedTime}`;
  const cached = responseCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  let { current: patternTime, meta: patternMeta } =
    await loadSelectedPatternTimestep(fileId, requestedTime);

  if (hasAggregatePlacesOnly(patternTime.value)) {
    if (!papdataId) {
      throw new Error('No papdata file is available for aggregate places.');
    }
    const payload = await buildAggregatePeopleMapPayload(
      patternTime as SelectedTimestep<PatternTimestep & { p: number[] }>,
      requestedTime,
      papdataId
    );
    cachePayload(cacheKey, payload);
    return payload;
  }

  const { current: simTime, previous } = await loadSelectedSimTimestep(
    fileId,
    patternTime.time
  );

  if (simTime.time !== patternTime.time) {
    const alignedPattern = await loadSelectedPatternTimestep(
      fileId,
      simTime.time
    );
    patternTime = alignedPattern.current;
    patternMeta = alignedPattern.meta ?? patternMeta;
  }

  const simValue = simTime.value;
  const previousSimValue = previous?.value ?? null;
  const patternValue = patternTime.value;

  const infectedNow = buildActiveInfectedSet(simValue);
  const infectedBefore = buildActiveInfectedSet(previousSimValue);
  const recoveredNow = buildRecoveredSet(simValue);
  // SoA-engine runs ship per-location occupancy as the compact numeric `loc`
  // stream; reconstruct the {placeId: [pids]} shape this view expects. Legacy
  // runs already carry `places` directly.
  let places = patternValue.places ?? {};
  if (Object.keys(places).length === 0 && isNumericTimestep(patternValue)) {
    if (patternMeta) {
      places = placesFromNumeric(patternValue.loc, patternMeta);
    }
  }
  let totalPeople = 0;
  for (const people of Object.values(places)) {
    totalPeople += Array.isArray(people) ? people.length : 0;
  }

  const sampleRate = Math.max(1, Math.ceil(totalPeople / MAX_PEOPLE_DOTS));
  let returnedPeople = 0;
  const locations: PeopleMapLocation[] = [];

  for (const [placeId, people] of Object.entries(places)) {
    if (!Array.isArray(people) || people.length === 0) {
      continue;
    }

    const sampledPeople: PeopleMapPerson[] = [];
    for (const rawPersonId of people) {
      const personId = String(rawPersonId);
      const recovered = recoveredNow.has(personId);
      const infected = !recovered && infectedNow.has(personId);
      const newlyInfected = infected && !infectedBefore.has(personId);
      if (
        !shouldIncludePerson(
          personId,
          infected,
          newlyInfected,
          recovered,
          sampleRate
        )
      ) {
        continue;
      }

      sampledPeople.push({
        id: personId,
        infected,
        newly_infected: newlyInfected,
        recovered
      });
    }

    if (sampledPeople.length > 0) {
      returnedPeople += sampledPeople.length;
      locations.push({
        type: 'places',
        id: placeId,
        people: sampledPeople
      });
    }
  }

  const payload = {
    time: patternTime.time,
    requested_time: requestedTime,
    total_people: totalPeople,
    returned_people: returnedPeople,
    sample_rate: sampleRate,
    source: 'person',
    locations
  } satisfies PeopleMapPayload;

  cachePayload(cacheKey, payload);
  return payload;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: idRaw } = await params;
  const id = parseNonNegativeRouteNumber(idRaw, 'id');
  if (!id.ok) {
    return jsonMessage(id.message, id.status);
  }

  const requestedTime = Number(request.nextUrl.searchParams.get('time') ?? 0);
  if (!Number.isFinite(requestedTime) || requestedTime < 0) {
    return Response.json({ message: 'Invalid time' }, { status: 400 });
  }

  const simdata = await prisma.simData.findUnique({
    where: { id: id.value },
    select: { file_id: true, czone: { select: { papdata_id: true } } }
  });
  if (!simdata) {
    return Response.json(
      { message: `Could not find simdata #${id.value}` },
      { status: 404 }
    );
  }

  try {
    const data = await buildPeopleMapPayload(
      simdata.file_id,
      Math.round(requestedTime),
      simdata.czone.papdata_id
    );
    return Response.json(
      { data },
      { headers: { 'Cache-Control': 'private, max-age=30' } }
    );
  } catch (error) {
    console.error('People map computation error:', error);
    return Response.json(
      { message: 'Failed to compute person-level map data.' },
      { status: 500 }
    );
  }
}
