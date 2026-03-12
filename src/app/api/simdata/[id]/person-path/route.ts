import { constants, createReadStream } from 'node:fs';
import { access, readFile } from 'node:fs/promises';
import { createGunzip } from 'node:zlib';
import type { NextRequest } from 'next/server';
import chain from 'stream-chain';
import parser from 'stream-json';
import StreamObject from 'stream-json/streamers/StreamObject.js';
import { prisma } from '@/lib/prisma';

const DB_FOLDER = process.env.DB_FOLDER || './db/';
const DAY_MINUTES = 24 * 60;

type KnownLocation = {
  type: 'homes' | 'places';
  id: string;
};

type TimelinePoint = {
  minute: number;
  location_type: 'homes' | 'places' | 'unknown';
  location_id: string;
};

type PathSegment = {
  location_type: 'homes' | 'places' | 'unknown';
  location_id: string;
  location_label: string;
  start_minute: number;
  end_minute: number;
};

function includesPersonId(values: unknown, personId: string) {
  return (
    Array.isArray(values) &&
    values.some((value) => String(value) === personId)
  );
}

function inferStepMinutes(minutes: number[]) {
  if (minutes.length < 2) {
    return 60;
  }

  const diffs: number[] = [];
  for (let index = 1; index < minutes.length; index += 1) {
    const diff = minutes[index] - minutes[index - 1];
    if (Number.isFinite(diff) && diff > 0) {
      diffs.push(diff);
    }
  }

  if (!diffs.length) {
    return 60;
  }

  diffs.sort((left, right) => left - right);
  return diffs[Math.floor(diffs.length / 2)] || 60;
}

function getLocationLabel(
  locationType: 'homes' | 'places' | 'unknown',
  locationId: string,
  papdata: any
) {
  if (locationType === 'homes') {
    return `Home #${locationId}`;
  }
  if (locationType === 'places') {
    return papdata?.places?.[locationId]?.label ?? `Place #${locationId}`;
  }
  return 'Unknown';
}

function findPersonLocation(
  movementAtTime: any,
  personId: string,
  previousLocation: KnownLocation | null
) {
  if (previousLocation) {
    const previousPeople =
      movementAtTime?.[previousLocation.type]?.[previousLocation.id];
    if (includesPersonId(previousPeople, personId)) {
      return previousLocation;
    }
  }

  for (const [homeId, people] of Object.entries(movementAtTime?.homes ?? {})) {
    if (includesPersonId(people, personId)) {
      return { type: 'homes' as const, id: homeId };
    }
  }

  for (const [placeId, people] of Object.entries(movementAtTime?.places ?? {})) {
    if (includesPersonId(people, personId)) {
      return { type: 'places' as const, id: placeId };
    }
  }

  return { type: 'unknown' as const, id: 'unknown' };
}

function toIsoTime(startDateMs: number, minute: number) {
  return new Date(startDateMs + minute * 60_000).toISOString();
}

async function loadPapData(papDataId: string) {
  const papPath = `${DB_FOLDER}${papDataId}.gz`;
  await access(papPath, constants.F_OK);
  const raw = await readFile(papPath);

  const buffer = await new Promise<Buffer>((resolve, reject) => {
    const unzip = createGunzip();
    const chunks: Buffer[] = [];
    unzip.on('data', (chunk: Buffer) => chunks.push(chunk));
    unzip.on('end', () => resolve(Buffer.concat(chunks)));
    unzip.on('error', reject);
    unzip.end(raw);
  });

  return JSON.parse(buffer.toString());
}

async function resolvePatternsPath(fileId: string) {
  const candidates = [`${DB_FOLDER}${fileId}.pat.gz`, `${DB_FOLDER}${fileId}.pat`];

  for (const path of candidates) {
    try {
      await access(path, constants.F_OK);
      return path;
    } catch {}
  }

  throw new Error('Patterns file not found for this simulation run.');
}

async function buildPersonPath(
  fileId: string,
  personId: number,
  startDate: Date,
  papdata: any
) {
  const patternsPath = await resolvePatternsPath(fileId);
  const startDateMs = startDate.getTime();
  const personKey = String(personId);

  const patChain: any[] = [createReadStream(patternsPath)];
  if (patternsPath.endsWith('.gz')) {
    patChain.push(createGunzip());
  }
  patChain.push(parser(), StreamObject.streamObject());
  const patternsIterator = (chain(patChain) as any)[Symbol.asyncIterator]();

  const points: TimelinePoint[] = [];
  let previousLocation: KnownLocation | null = null;
  let nextItem = await patternsIterator.next();

  while (!nextItem.done) {
    const minute = Number(nextItem.value.key);
    if (Number.isFinite(minute)) {
      const location = findPersonLocation(
        nextItem.value.value ?? {},
        personKey,
        previousLocation
      );
      points.push({
        minute,
        location_type: location.type,
        location_id: location.id
      });
      previousLocation =
        location.type === 'homes' || location.type === 'places'
          ? { type: location.type, id: location.id }
          : null;
    }

    nextItem = await patternsIterator.next();
  }

  if (!points.length) {
    return {
      person_id: personId,
      person: null,
      step_minutes: 60,
      total_minutes: 0,
      total_hours: 0,
      days: []
    };
  }

  points.sort((left, right) => left.minute - right.minute);
  const inferredStepMinutes = inferStepMinutes(
    points.map((point) => point.minute)
  );

  const segments: PathSegment[] = [];
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const nextMinute =
      index < points.length - 1
        ? points[index + 1].minute
        : current.minute + inferredStepMinutes;

    if (!Number.isFinite(nextMinute) || nextMinute <= current.minute) {
      continue;
    }

    const previousSegment = segments[segments.length - 1];
    const locationLabel = getLocationLabel(
      current.location_type,
      current.location_id,
      papdata
    );

    if (
      previousSegment &&
      previousSegment.location_type === current.location_type &&
      previousSegment.location_id === current.location_id &&
      previousSegment.end_minute === current.minute
    ) {
      previousSegment.end_minute = nextMinute;
    } else {
      segments.push({
        location_type: current.location_type,
        location_id: current.location_id,
        location_label: locationLabel,
        start_minute: current.minute,
        end_minute: nextMinute
      });
    }
  }

  const daysMap = new Map<
    number,
    {
      day_index: number;
      day_date_iso: string;
      start_minute: number;
      end_minute: number;
      total_minutes: number;
      stops: Array<{
        location_type: string;
        location_id: string;
        location_label: string;
        start_minute: number;
        end_minute: number;
        duration_minutes: number;
        start_time_iso: string;
        end_time_iso: string;
      }>;
    }
  >();
  let totalMinutes = 0;

  for (const segment of segments) {
    let cursor = segment.start_minute;
    while (cursor < segment.end_minute) {
      const dayIndex = Math.floor(cursor / DAY_MINUTES) + 1;
      const dayStartMinute = (dayIndex - 1) * DAY_MINUTES;
      const dayEndMinute = dayStartMinute + DAY_MINUTES;
      const pieceEndMinute = Math.min(segment.end_minute, dayEndMinute);
      const durationMinutes = pieceEndMinute - cursor;

      if (durationMinutes <= 0) {
        break;
      }

      if (!daysMap.has(dayIndex)) {
        daysMap.set(dayIndex, {
          day_index: dayIndex,
          day_date_iso: toIsoTime(startDateMs, dayStartMinute).slice(0, 10),
          start_minute: dayStartMinute,
          end_minute: dayEndMinute,
          total_minutes: 0,
          stops: []
        });
      }

      const day = daysMap.get(dayIndex);
      if (!day) {
        break;
      }

      day.stops.push({
        location_type: segment.location_type,
        location_id: segment.location_id,
        location_label: segment.location_label,
        start_minute: cursor,
        end_minute: pieceEndMinute,
        duration_minutes: durationMinutes,
        start_time_iso: toIsoTime(startDateMs, cursor),
        end_time_iso: toIsoTime(startDateMs, pieceEndMinute)
      });
      day.total_minutes += durationMinutes;
      totalMinutes += durationMinutes;
      cursor = pieceEndMinute;
    }
  }

  const days = Array.from(daysMap.values())
    .sort((left, right) => left.day_index - right.day_index)
    .map((day) => {
      const totalsByLocation = new Map<
        string,
        {
          location_type: string;
          location_id: string;
          location_label: string;
          duration_minutes: number;
          duration_hours: number;
          visits: number;
        }
      >();

      for (const stop of day.stops) {
        const key = `${stop.location_type}:${stop.location_id}`;
        const existing = totalsByLocation.get(key);
        if (existing) {
          existing.duration_minutes += stop.duration_minutes;
          existing.duration_hours = Number(
            (existing.duration_minutes / 60).toFixed(2)
          );
          existing.visits += 1;
        } else {
          totalsByLocation.set(key, {
            location_type: stop.location_type,
            location_id: stop.location_id,
            location_label: stop.location_label,
            duration_minutes: stop.duration_minutes,
            duration_hours: Number((stop.duration_minutes / 60).toFixed(2)),
            visits: 1
          });
        }
      }

      return {
        ...day,
        total_hours: Number((day.total_minutes / 60).toFixed(2)),
        totals: Array.from(totalsByLocation.values()).sort(
          (left, right) => right.duration_minutes - left.duration_minutes
        )
      };
    });

  const personData = papdata?.people?.[personKey];
  const person = personData
    ? {
        id: personId,
        age:
          typeof personData.age === 'number' ? personData.age : null,
        sex:
          personData.sex === 0
            ? 'Male'
            : personData.sex === 1
              ? 'Female'
              : 'Unknown',
        home:
          personData.home != null
            ? String(personData.home)
            : personData.household_id != null
              ? String(personData.household_id)
              : null
      }
    : null;

  return {
    person_id: personId,
    person,
    step_minutes: inferredStepMinutes,
    total_minutes: totalMinutes,
    total_hours: Number((totalMinutes / 60).toFixed(2)),
    days
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: id_raw } = await params;
  const id = Number(id_raw);
  const personId = Number(request.nextUrl.searchParams.get('person_id'));

  if (Number.isNaN(id) || id < 0) {
    return Response.json({ message: 'Invalid id' }, { status: 400 });
  }

  if (!Number.isInteger(personId) || personId < 0) {
    return Response.json({ message: 'Invalid person_id' }, { status: 400 });
  }

  const simdata = await prisma.simData.findUnique({
    where: { id },
    include: { czone: true }
  });
  if (!simdata) {
    return Response.json(
      { message: 'Could not find associated simdata' },
      { status: 404 }
    );
  }

  if (!simdata.czone.papdata_id) {
    return Response.json(
      { message: 'PapData not available for this zone' },
      { status: 404 }
    );
  }

  try {
    const papdata = await loadPapData(simdata.czone.papdata_id);
    const data = await buildPersonPath(
      simdata.file_id,
      personId,
      simdata.czone.start_date,
      papdata
    );
    return Response.json({ data });
  } catch (e) {
    console.error('Person path computation error:', e);
    return Response.json(
      { message: 'Failed to compute person movement path.' },
      { status: 500 }
    );
  }
}
