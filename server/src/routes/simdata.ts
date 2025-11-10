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
import { HTTPException } from "hono/http-exception";

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
        iot_data['All People'] = 0;

        for (const disease of Object.keys(svalue) as string[]) {
          iot_data[disease] = 0;
        }
        
        if (loc_type === 'homes') {
          iot_data['All People'] += pvalue['homes'][loc_id]?.length ?? 0;

          for (const [disease, people] of Object.entries(svalue) as [string, object][]) {
            infected_list[disease] = Object.fromEntries(Object.entries(people)
              .filter(([k, v]) => pvalue['homes'][loc_id]?.includes(k)));
          }
        } else if (loc_type === 'places') {
          iot_data['All People'] += pvalue['places'][loc_id]?.length ?? 0;

          for (const [disease, people] of Object.entries(svalue) as [string, object][]) {
            infected_list[disease] = Object.fromEntries(Object.entries(people)
              .filter(([k, v]) => pvalue['places'][loc_id]?.includes(k)));
          }
        }
      }

      for (const [disease, people] of Object.entries(infected_list) as [string, object][]) {
        iot_data[disease] = Object.keys(people).length;

        for (const [state, value] of Object.entries(infection_states)) {
          states_data[state] += Object.values(people).filter((s) => s & value).length;
        }

        Object.keys(people).forEach((id) => {
          const person_data = papdata['people'][id];

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
)

export default simdata_route;
