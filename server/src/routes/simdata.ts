import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { PrismaClient } from "@prisma/client";
import { saveFileStream } from "../lib/filestream.js";
import { DB_FOLDER } from "../env.js";
import StreamObject from "stream-json/streamers/StreamObject.js";
import parser from 'stream-json';
import { createReadStream } from "fs";
import chain from "stream-chain";

const simdata_route = new Hono();
const prisma = new PrismaClient();

const postSimDataSchema = z.object({
  czone_id: z.coerce.number().nonnegative(),
  simdata: z.instanceof(File),
  patterns: z.instanceof(File)
});

const getSimDataSchema = z.object({
  id: z.coerce.number().nonnegative()
});

const getChartParamSchema = z.object({
  id: z.coerce.number().nonnegative()
});

const getChartQuerySchema = z.object({
  type: z.enum([ 'iot', 'ages', 'sexes', 'states' ]),
  loc_type: z.enum([ 'homes', 'places' ]).optional(),
  loc_id: z.string().nonempty().optional()
});

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
      return c.json(
        {
          message: 'Could not find associated simdata'
        },
        404
      );
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

    return c.json({ data });
  }
);

// const age_ranges = [
//   [0, 20],
//   [21, 40],
//   [41, 60],
//   [61, 80],
//   [81, 99]
// ];

// const infection_states = {
//   'Susceptible': 0,
//   'Infected': 1,
//   'Infectious': 2,
//   'Symptomatic': 4,
//   'Hospitalized': 8,
//   'Recovered': 16,
//   'Removed': 32
// };

// This returns just enough data for each chart type
simdata_route.get(
  '/simdata/:id/chartdata',
  zValidator('param', getChartParamSchema),
  zValidator('query', getChartQuerySchema),
  async (c) => {
    const { id } = c.req.valid('param');
    const { type, loc_type, loc_id } = c.req.valid('query');

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

    type ChartData = {
      time: number,
      [key: string]: number;
    };

    const data: ChartData[] = [];

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

      const data_point: ChartData = {
        time: +skey / 60
      };

      if (loc_id) {
        data_point['Total'] = 0;

        if (loc_type === 'homes') {
          data_point['Total'] += pvalue['homes'][loc_id]?.length ?? 0;

          for (const [disease, people] of Object.entries(svalue) as [string, object][]) {
            data_point[disease] = Object.keys(people).filter(element => pvalue['homes'][loc_id]?.includes(element)).length;
          }
        } else if (loc_type === 'places') {
          data_point['Total'] += pvalue['places'][loc_id]?.length ?? 0;

          for (const [disease, people] of Object.entries(svalue) as [string, object][]) {
            data_point[disease] = Object.keys(people).filter(element => pvalue['places'][loc_id]?.includes(element)).length;
          }
        }
      } else {
        // IoT
        for (const [disease, people] of Object.entries(svalue) as [string, object][]) {
          data_point[disease] = Object.keys(people).length;
        }
      }

      data.push(data_point);

      spl = await simdatapl.next();
      ppl = await patternspl.next();
    }

    return c.json({ data });
  }
)

export default simdata_route;
