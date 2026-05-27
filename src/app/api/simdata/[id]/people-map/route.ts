import type { NextRequest } from 'next/server';
import { readDbJson } from '@/lib/db-files';
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
const RAW_RUN_CACHE_LIMIT = 1;

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
  locations: PeopleMapLocation[];
};

type TimeKey = {
  time: number;
  key: string;
};

type RawRunData = {
  simData: Record<string, DiseaseStateTimestep>;
  patternData: Record<string, PatternTimestep>;
  simTimes: TimeKey[];
  patternTimes: TimeKey[];
};

const responseCache = new Map<string, PeopleMapPayload>();
const rawRunCache = new Map<string, RawRunData>();

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

function cacheRawRunData(fileId: string, data: RawRunData) {
  rawRunCache.set(fileId, data);
  if (rawRunCache.size <= RAW_RUN_CACHE_LIMIT) {
    return;
  }

  const oldestKey = rawRunCache.keys().next().value;
  if (oldestKey) {
    rawRunCache.delete(oldestKey);
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

function getSortedTimeKeys(data: Record<string, unknown>) {
  return Object.keys(data)
    .map((key) => ({ key, time: Number(key) }))
    .filter((entry) => Number.isFinite(entry.time))
    .sort((left, right) => left.time - right.time);
}

async function loadRawRunData(fileId: string) {
  const cached = rawRunCache.get(fileId);
  if (cached) {
    rawRunCache.delete(fileId);
    rawRunCache.set(fileId, cached);
    return cached;
  }

  const [simData, patternData] = await Promise.all([
    readDbJson<Record<string, DiseaseStateTimestep>>(fileId, '.sim'),
    readDbJson<Record<string, PatternTimestep>>(fileId, '.pat')
  ]);

  const data = {
    simData,
    patternData,
    simTimes: getSortedTimeKeys(simData),
    patternTimes: getSortedTimeKeys(patternData)
  } satisfies RawRunData;

  cacheRawRunData(fileId, data);
  return data;
}

function findTimeIndexAtOrBefore(times: TimeKey[], targetTime: number) {
  let low = 0;
  let high = times.length - 1;
  let best = -1;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (times[middle].time <= targetTime) {
      best = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  return best;
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

async function buildPeopleMapPayload(
  fileId: string,
  requestedTime: number
): Promise<PeopleMapPayload> {
  const cacheKey = `${fileId}:${requestedTime}`;
  const cached = responseCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const rawRunData = await loadRawRunData(fileId);
  const simTimeIndex = findTimeIndexAtOrBefore(
    rawRunData.simTimes,
    requestedTime
  );
  if (simTimeIndex < 0) {
    throw new Error('No simulation timestep found.');
  }

  const simTime = rawRunData.simTimes[simTimeIndex];
  const patternTimeIndex = findTimeIndexAtOrBefore(
    rawRunData.patternTimes,
    simTime.time
  );
  if (patternTimeIndex < 0) {
    throw new Error('No movement timestep found.');
  }

  const previousSimTime =
    simTimeIndex > 0 ? rawRunData.simTimes[simTimeIndex - 1] : null;
  const patternTime = rawRunData.patternTimes[patternTimeIndex];
  const simValue = rawRunData.simData[simTime.key];
  const previousSimValue = previousSimTime
    ? rawRunData.simData[previousSimTime.key]
    : null;
  const patternValue = rawRunData.patternData[patternTime.key];
  if (!simValue || !patternValue) {
    throw new Error('Missing timestep data.');
  }

  const infectedNow = buildActiveInfectedSet(simValue);
  const infectedBefore = buildActiveInfectedSet(previousSimValue);
  const recoveredNow = buildRecoveredSet(simValue);
  const places = patternValue.places ?? {};
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
    select: { file_id: true }
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
      Math.round(requestedTime)
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
