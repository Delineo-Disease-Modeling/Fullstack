import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { PrismaClient } from "@prisma/client";
import { saveFileStream } from "../lib/filestream.js";
import { DB_FOLDER } from "../env.js";
import StreamObject from "stream-json/streamers/StreamObject.js";
import parser from 'stream-json';
import { createReadStream } from "fs";
import { unlink } from "fs/promises";
import chain from "stream-chain";
import { HTTPException } from "hono/http-exception";

const simdata_route = new Hono();
const prisma = new PrismaClient();

const postSimDataSchema = z.object({
  czone_id: z.coerce.number().nonnegative(),
  simdata: z.instanceof(File),
  patterns: z.instanceof(File)
});

// New schema for JSON-based simulation data storage
const postSimDataJsonSchema = z.object({
  czone_id: z.coerce.number().nonnegative(),
  name: z.string().optional(),
  simdata: z.any(), // The simulation result data
  movement: z.any(), // Movement patterns
  papdata: z.any().optional(), // People, homes, places metadata
  // Simulation parameters
  hours: z.coerce.number().optional(),
  mask_rate: z.coerce.number().optional(),
  vaccine_rate: z.coerce.number().optional(),
  capacity: z.coerce.number().optional(),
  lockdown: z.coerce.number().optional()
});

const getSimDataSchema = z.object({
  id: z.coerce.number().nonnegative()
});

const getChartParamSchema = z.object({
  id: z.coerce.number().nonnegative()
});

const getChartQuerySchema = z.object({
  loc_type: z.enum([ 'homes', 'places' ]).optional(),
  loc_id: z.string().nonempty().optional()
});

const getPersonPathQuerySchema = z.object({
  person_id: z.coerce.number().int().nonnegative()
});

const getSimDataCacheSchema = z.object({
  czone_id: z.coerce.number().nonnegative()
});

const getSimDataRunCacheSchema = z.object({
  czone_id: z.coerce.number().nonnegative(),
  sim_id: z.coerce.number().nonnegative()
});

const updateSimDataSchema = z.object({
  name: z.string().min(2).optional()
});

const DAY_MINUTES = 24 * 60;

type LocationType = 'homes' | 'places' | 'unknown';
type KnownLocation = { type: 'homes' | 'places'; id: string };

type TimelinePoint = {
  minute: number;
  location_type: LocationType;
  location_id: string;
};

type PathSegment = {
  location_type: LocationType;
  location_id: string;
  location_label: string;
  start_minute: number;
  end_minute: number;
};

type DayStop = {
  location_type: LocationType;
  location_id: string;
  location_label: string;
  start_minute: number;
  end_minute: number;
  duration_minutes: number;
  start_time_iso: string;
  end_time_iso: string;
};

function includesPersonId(values: unknown, personId: string): boolean {
  if (!Array.isArray(values)) return false;
  return values.some((value) => String(value) === personId);
}

function inferStepMinutes(minutes: number[]): number {
  if (minutes.length < 2) return 60;

  const diffs: number[] = [];
  for (let i = 1; i < minutes.length; i++) {
    const diff = minutes[i] - minutes[i - 1];
    if (Number.isFinite(diff) && diff > 0) {
      diffs.push(diff);
    }
  }

  if (diffs.length === 0) return 60;
  diffs.sort((a, b) => a - b);
  return diffs[Math.floor(diffs.length / 2)] || 60;
}

function toIsoTime(startDate: Date, minute: number): string {
  return new Date(startDate.getTime() + minute * 60_000).toISOString();
}

function getLocationLabel(locationType: LocationType, locationId: string, papdata: any): string {
  if (locationType === 'homes') return `Home #${locationId}`;
  if (locationType === 'places') return papdata?.places?.[locationId]?.label ?? `Place #${locationId}`;
  return 'Unknown';
}

function findPersonLocation(movement: any, personId: string, previous: KnownLocation | null): { type: LocationType; id: string } {
  if (previous) {
    const previousPeople = movement?.[previous.type]?.[previous.id];
    if (includesPersonId(previousPeople, personId)) {
      return previous;
    }
  }

  for (const [id, people] of Object.entries(movement?.homes ?? {})) {
    if (includesPersonId(people, personId)) {
      return { type: 'homes', id };
    }
  }

  for (const [id, people] of Object.entries(movement?.places ?? {})) {
    if (includesPersonId(people, personId)) {
      return { type: 'places', id };
    }
  }

  return { type: 'unknown', id: 'unknown' };
}

async function getSimData(id: number) {
  const simdata = await prisma.simData.findUnique({
    where: { id }
  });

  if (!simdata) {
    throw new HTTPException(404, {
      message: 'Could not find associated simdata'
    });
  }

  /**
   * Each key is a facility ID
   * Values look like:
   * {
   *    population: 0,
   *    infected: 0
   * }
   */
  type SimData = {
    [time: string]: {
      homes: {
        [id: string]: {
          population: number,
          infected: number
        }
      },
      places: {
        [id: string]: {
          population: number,
          infected: number
        }
      }
    }
  }

  const data: SimData = {};

  const simdatapl = chain([
    createReadStream(DB_FOLDER + simdata.simdata),
    parser(),
    StreamObject.streamObject()
  ])[Symbol.asyncIterator]();

  const patternspl = chain([
    createReadStream(DB_FOLDER + simdata.patterns),
    parser(),
    StreamObject.streamObject()
  ])[Symbol.asyncIterator]();

  let spl = await simdatapl.next();
  let ppl = await patternspl.next();

  while (!spl.done && !ppl.done) {
    const skey = spl.value.key;
    const pkey = ppl.value.key;

    if (skey !== pkey) {
      continue;
    }

    const svalue = spl.value.value;
    const pvalue = ppl.value.value;

    data[skey] = {'homes': {}, 'places': {}};

    const curinfected = [...new Set(Object.values(svalue).map((people) => Object.keys(people as any)).flat())];

    for (const [id, pop] of Object.entries(pvalue['homes']) as [string, string[]][]) {
      data[skey]['homes'][id] = {
        population: pop.length,
        infected: pop.filter(v => curinfected.includes(v)).length
      };
    }

    for (const [id, pop] of Object.entries(pvalue['places']) as [string, string[]][]) {
      data[skey]['places'][id] = {
        population: pop.length,
        infected: pop.filter(v => curinfected.includes(v)).length
      };
    }

    spl = await simdatapl.next();
    ppl = await patternspl.next();
  }

  return data;
}

simdata_route.post(
  '/simdata',
  zValidator('form', postSimDataSchema),
  async (c) => {
    const { simdata, patterns, czone_id } = c.req.valid('form');

    const simdata_obj = await prisma.simData.create({
      data: {
        czone_id: czone_id
      }
    });

    await Promise.all([
      saveFileStream(simdata, DB_FOLDER + simdata_obj.simdata),
      saveFileStream(patterns, DB_FOLDER + simdata_obj.patterns),
    ]);

    return c.json({
      data: {
        id: simdata_obj.id
      }
    });
  }
);

// New endpoint for saving simulation data as JSON
simdata_route.post(
  '/simdata-json',
  zValidator('json', postSimDataJsonSchema),
  async (c) => {
    const { czone_id, name, simdata, movement, papdata, hours, mask_rate, vaccine_rate, capacity, lockdown } = c.req.valid('json');
    const { writeFile } = await import('fs/promises');

    // Check if papdata exists for this czone, if not create it
    let papdata_obj = await prisma.paPData.findUnique({
      where: { czone_id }
    });
    
    if (!papdata_obj && papdata) {
      papdata_obj = await prisma.paPData.create({
        data: { czone_id }
      });
      await writeFile(DB_FOLDER + papdata_obj.id, JSON.stringify(papdata));
    }

    const simdata_obj = await prisma.simData.create({
      data: {
        czone_id: czone_id,
        name: name || `Simulation ${new Date().toLocaleString()}`,
        hours: hours,
        mask_rate: mask_rate,
        vaccine_rate: vaccine_rate,
        capacity: capacity,
        lockdown: lockdown
      }
    });

    // Save simdata and patterns as JSON files
    await Promise.all([
      writeFile(DB_FOLDER + simdata_obj.simdata, JSON.stringify(simdata)),
      writeFile(DB_FOLDER + simdata_obj.patterns, JSON.stringify(movement))
    ]);

    return c.json({
      data: {
        id: simdata_obj.id
      }
    });
  }
);

// Get list of simulation runs for a convenience zone
simdata_route.get(
  '/simdata-list/:czone_id',
  zValidator('param', getSimDataCacheSchema),
  async (c) => {
    const { czone_id } = c.req.valid('param');

    const runs = await prisma.simData.findMany({
      where: { czone_id },
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        name: true,
        created_at: true,
        hours: true,
        mask_rate: true,
        vaccine_rate: true,
        capacity: true,
        lockdown: true
      }
    });

    return c.json({
      data: runs
    });
  }
);

simdata_route.patch(
  '/simdata/:id',
  zValidator('param', getSimDataSchema),
  zValidator('json', updateSimDataSchema),
  async (c) => {
    const { id } = c.req.valid('param');
    const { name } = c.req.valid('json');

    if (!name) {
      return c.json({ message: 'Nothing to update' }, 400);
    }

    try {
      const simdata = await prisma.simData.update({
        where: { id },
        data: { name }
      });

      return c.json({ data: simdata });
    } catch (e) {
      throw new HTTPException(404, {
        message: `Could not find simdata #${id}`
      });
    }
  }
);

simdata_route.delete(
  '/simdata/:id',
  zValidator('param', getSimDataSchema),
  async (c) => {
    const { id } = c.req.valid('param');

    const simdata = await prisma.simData.findUnique({
      where: { id }
    });

    if (!simdata) {
      throw new HTTPException(404, {
        message: `Could not find simdata #${id}`
      });
    }

    try {
      await Promise.all([
        unlink(DB_FOLDER + simdata.simdata).catch(console.error),
        unlink(DB_FOLDER + simdata.patterns).catch(console.error)
      ]);

      await prisma.simData.delete({
        where: { id }
      });

      return c.json({ message: 'Deleted successfully' });
    } catch (e) {
      console.error(e);
      throw new HTTPException(500, {
        message: 'Failed to delete simdata'
      });
    }
  }
);

// This returns just enough data for the model map to work
simdata_route.get(
  '/simdata/:id',
  zValidator('param', getSimDataSchema),
  async (c) => {
    const { id } = c.req.valid('param');

    const simdata = await prisma.simData.findUnique({
      where: { id }
    });

    if (!simdata) {
      throw new HTTPException(404, {
        message: `Could not find simdata #${id}`
      });
    }

    const data = await getSimData(id);

    return c.json({
      'data': {
        'simdata': data,
        name: simdata.name,
        hours: simdata.hours,
        mask_rate: simdata.mask_rate,
        vaccine_rate: simdata.vaccine_rate,
        capacity: simdata.capacity,
        lockdown: simdata.lockdown,
        created_at: simdata.created_at
      }
    });
  }
);

simdata_route.get(
  '/simdata/:id/person-path',
  zValidator('param', getSimDataSchema),
  zValidator('query', getPersonPathQuerySchema),
  async (c) => {
    const { id } = c.req.valid('param');
    const { person_id } = c.req.valid('query');

    const simdata = await prisma.simData.findUnique({
      where: { id },
      include: {
        czone: {
          select: {
            start_date: true
          }
        }
      }
    });

    if (!simdata) {
      throw new HTTPException(404, {
        message: `Could not find simdata #${id}`
      });
    }

    const papdata = await getPapData(simdata.czone_id);
    const personKey = String(person_id);
    const startDate = simdata.czone.start_date;

    const points: TimelinePoint[] = [];
    let previousLocation: KnownLocation | null = null;

    const patternspl = chain([
      createReadStream(DB_FOLDER + simdata.patterns),
      parser(),
      StreamObject.streamObject()
    ])[Symbol.asyncIterator]();

    let ppl = await patternspl.next();
    while (!ppl.done) {
      const minute = Number(ppl.value.key);
      if (Number.isFinite(minute)) {
        const movement = ppl.value.value ?? {};
        const location = findPersonLocation(movement, personKey, previousLocation);
        points.push({
          minute,
          location_type: location.type,
          location_id: location.id
        });

        previousLocation = location.type === 'homes' || location.type === 'places'
          ? { type: location.type, id: location.id }
          : null;
      }

      ppl = await patternspl.next();
    }

    if (points.length === 0) {
      return c.json({
        data: {
          person_id,
          person: null,
          step_minutes: 60,
          total_minutes: 0,
          total_hours: 0,
          days: []
        }
      });
    }

    points.sort((a, b) => a.minute - b.minute);
    const inferredStepMinutes = inferStepMinutes(points.map((point) => point.minute));

    const segments: PathSegment[] = [];
    for (let i = 0; i < points.length; i++) {
      const current = points[i];
      const nextMinute = i < points.length - 1
        ? points[i + 1].minute
        : current.minute + inferredStepMinutes;

      if (!Number.isFinite(nextMinute) || nextMinute <= current.minute) {
        continue;
      }

      const currentLabel = getLocationLabel(current.location_type, current.location_id, papdata);
      const previousSegment = segments[segments.length - 1];
      if (
        previousSegment
        && previousSegment.location_type === current.location_type
        && previousSegment.location_id === current.location_id
        && previousSegment.end_minute === current.minute
      ) {
        previousSegment.end_minute = nextMinute;
      } else {
        segments.push({
          location_type: current.location_type,
          location_id: current.location_id,
          location_label: currentLabel,
          start_minute: current.minute,
          end_minute: nextMinute
        });
      }
    }

    const daysMap = new Map<number, {
      day_index: number;
      day_date_iso: string;
      start_minute: number;
      end_minute: number;
      total_minutes: number;
      stops: DayStop[];
    }>();

    let totalMinutes = 0;

    for (const segment of segments) {
      let cursor = segment.start_minute;
      while (cursor < segment.end_minute) {
        const dayIndex = Math.floor(cursor / DAY_MINUTES) + 1;
        const dayStartMinute = (dayIndex - 1) * DAY_MINUTES;
        const dayEndMinute = dayStartMinute + DAY_MINUTES;
        const pieceEndMinute = Math.min(segment.end_minute, dayEndMinute);
        const durationMinutes = pieceEndMinute - cursor;

        if (durationMinutes <= 0) break;

        if (!daysMap.has(dayIndex)) {
          daysMap.set(dayIndex, {
            day_index: dayIndex,
            day_date_iso: toIsoTime(startDate, dayStartMinute).slice(0, 10),
            start_minute: dayStartMinute,
            end_minute: dayEndMinute,
            total_minutes: 0,
            stops: []
          });
        }

        const day = daysMap.get(dayIndex)!;
        day.stops.push({
          location_type: segment.location_type,
          location_id: segment.location_id,
          location_label: segment.location_label,
          start_minute: cursor,
          end_minute: pieceEndMinute,
          duration_minutes: durationMinutes,
          start_time_iso: toIsoTime(startDate, cursor),
          end_time_iso: toIsoTime(startDate, pieceEndMinute)
        });
        day.total_minutes += durationMinutes;
        totalMinutes += durationMinutes;
        cursor = pieceEndMinute;
      }
    }

    const days = Array.from(daysMap.values())
      .sort((a, b) => a.day_index - b.day_index)
      .map((day) => {
        const totalsByLocation = new Map<string, {
          location_type: LocationType;
          location_id: string;
          location_label: string;
          duration_minutes: number;
          duration_hours: number;
          visits: number;
        }>();

        for (const stop of day.stops) {
          const key = `${stop.location_type}:${stop.location_id}`;
          const existing = totalsByLocation.get(key);

          if (existing) {
            existing.duration_minutes += stop.duration_minutes;
            existing.duration_hours = Number((existing.duration_minutes / 60).toFixed(2));
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
          totals: Array.from(totalsByLocation.values())
            .sort((a, b) => b.duration_minutes - a.duration_minutes)
        };
      });

    const personData = papdata?.people?.[personKey];
    const person = personData
      ? {
        id: person_id,
        age: personData?.age ?? null,
        sex: personData?.sex === 0 ? 'Male' : (personData?.sex === 1 ? 'Female' : 'Unknown'),
        home: personData?.home ?? null
      }
      : null;

    return c.json({
      data: {
        person_id,
        person,
        step_minutes: inferredStepMinutes,
        total_minutes: totalMinutes,
        total_hours: Number((totalMinutes / 60).toFixed(2)),
        days
      }
    });
  }
);

simdata_route.get('/simdata/cache/:czone_id',
  zValidator('param', getSimDataCacheSchema),
  async (c) => {
    const { czone_id } = c.req.valid('param');

    const czone = await prisma.convenienceZone.findUnique({
      where: {
        id: czone_id
      },
      include: {
        simdata: {
          orderBy: {
            id: 'desc'
          }
        }
      }
    });

    if (!czone) {
      throw new HTTPException(404, {
        message: `Could not find convenience zone #${czone_id}`
      });
    }

    return c.json({
      data: czone.simdata.map((simdata) => ({
        'name': simdata.name,
        'created_at': simdata.created_at,
        'sim_id': simdata.id
      }))
    });
  }
);

const age_ranges = [
  [0, 20],
  [21, 40],
  [41, 60],
  [61, 80],
  [81, 99]
];

const infection_states = {
  'Susceptible': 0,
  'Infected': 1,
  'Infectious': 2,
  'Symptomatic': 4,
  'Hospitalized': 8,
  'Recovered': 16,
  'Removed': 32
};

async function getPapData(czone_id: number) {
  const papdata_obj = await prisma.paPData.findUnique({
    where: {
      czone_id: czone_id
    }
  });

  if (!papdata_obj) {
    throw new HTTPException(404, {
      message: 'Could not find papdata'
    });
  }

  let data = '';
  const papdata = createReadStream(DB_FOLDER + papdata_obj.id);
  for await (const chunk of papdata) {
    data += chunk;
  }

  return JSON.parse(data);
}

// This returns just enough data for each chart type
simdata_route.get(
  '/simdata/:id/chartdata',
  zValidator('param', getChartParamSchema),
  zValidator('query', getChartQuerySchema),
  async (c) => {
    const { id } = c.req.valid('param');
    const { loc_type, loc_id } = c.req.valid('query');

    const simdata = await prisma.simData.findUnique({
      where: { id }
    });

    if (!simdata) {
      return c.json(
        {
          message: 'Could not find associated simdata'
        },
        404
      );
    }

    const papdata = await getPapData(simdata.czone_id);

    type DataPoint = {
      time: number,
      [key: string]: number;
    };

    type ChartData = {
      [type: string]: DataPoint[];
    };

    const data: ChartData = {
      'iot': [],
      'ages': [],
      'sexes': [],
      'states': []
    };

    const simdatapl = chain([
      createReadStream(DB_FOLDER + simdata.simdata),
      parser(),
      StreamObject.streamObject()
    ])[Symbol.asyncIterator]();

    const patternspl = chain([
      createReadStream(DB_FOLDER + simdata.patterns),
      parser(),
      StreamObject.streamObject()
    ])[Symbol.asyncIterator]();

    let spl = await simdatapl.next();
    let ppl = await patternspl.next();

    while (!spl.done && !ppl.done) {
      const skey = spl.value.key;
      const pkey = ppl.value.key;

      if (skey !== pkey) {
        continue;
      }

      const svalue = spl.value.value;
      const pvalue = ppl.value.value;

      const iot_data: DataPoint = {
        time: +skey / 60
      };

      const ages_data: DataPoint = {
        time: +skey / 60
      };

      const sexes_data: DataPoint = {
        time: +skey / 60
      };

      const states_data: DataPoint = {
        time: +skey / 60
      };

      // Initialize data
      sexes_data['Male'] = 0;
      sexes_data['Female'] = 0;

      for (const range of age_ranges) {
        ages_data[range.join('-')] = 0;
      }

      for (const state of Object.keys(infection_states)) {
        states_data[state] = 0;
      }

      let infected_list = svalue;

      if (loc_id && loc_type) {
        iot_data['All People'] = pvalue[loc_type][loc_id]?.length ?? 0;

        for (const disease of Object.keys(svalue) as string[]) {
          iot_data[disease] = 0;
        }
        
        for (const [disease, people] of Object.entries(svalue) as [string, object][]) {
          infected_list[disease] = Object.fromEntries(Object.entries(people)
            .filter(([k, v]) => pvalue[loc_type][loc_id]?.includes(k)));
        }
      }

      for (const [disease, people] of Object.entries(infected_list) as [string, object][]) {
        iot_data[disease] = Object.keys(people).length;

        for (const [state, value] of Object.entries(infection_states)) {
          states_data[state] += Object.values(people).filter((s) => s & value).length;
        }

        Object.keys(people).forEach((id) => {
          const person_data = papdata['people'][id];

          // Skip if person not found in papdata (ID mismatch between simulation and papdata)
          if (!person_data) return;

          sexes_data[person_data['sex'] == 0 ? 'Male' : 'Female'] += 1;

          for (const range of age_ranges) {
            if (person_data['age'] >= range[0] && person_data['age'] <= range[1]) {
              ages_data[range.join('-')] += 1;
            }
          }
        });
      }

      data['iot'].push(iot_data);
      data['ages'].push(ages_data);
      data['sexes'].push(sexes_data);
      data['states'].push(states_data);

      spl = await simdatapl.next();
      ppl = await patternspl.next();
    }

    return c.json({ data });
  }
);

export default simdata_route;
