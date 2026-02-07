import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { prisma } from '../lib/prisma.js';
import { saveFileStream } from '../lib/filestream.js';
import { DB_FOLDER } from '../env.js';
import StreamObject from 'stream-json/streamers/StreamObject.js';
import parser from 'stream-json';
import { createReadStream } from 'fs';
import { unlink, readFile, access } from 'fs/promises';
import { constants } from 'fs';
import { createGunzip } from 'zlib';
import chain from 'stream-chain';
import { HTTPException } from 'hono/http-exception';
import { stream } from 'hono/streaming';
import { generateGlobalStats } from '../lib/sim-stats.js';
import { processSimData, getStats } from '../lib/postgres-store.js';
import type { SimData } from '@prisma/client/index-browser';

const simdata_route = new Hono();

const postSimDataSchema = z.object({
  czone_id: z.coerce.number().nonnegative(),
  simdata: z.instanceof(File),
  patterns: z.instanceof(File),
  length: z.coerce.number().nonnegative()
});

const getSimDataSchema = z.object({
  id: z.coerce.number().nonnegative()
});

const getChartParamSchema = z.object({
  id: z.coerce.number().nonnegative()
});

const getChartQuerySchema = z.object({
  loc_type: z.enum(['homes', 'places']).optional(),
  loc_id: z.string().min(1).optional()
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

type DataPoint = {
  time: number;
  [key: string]: number;
};

type ChartData = {
  [type: string]: DataPoint[];
};

simdata_route.post(
  '/simdata',
  zValidator('form', postSimDataSchema),
  async (c) => {
    const { simdata, patterns, czone_id, length } = c.req.valid('form');

    const simdata_obj = await prisma.simData.create({
      data: {
        czone_id: czone_id,
        length: length
      }
    });

    const simIsGz = simdata.name.endsWith('.gz');
    const patIsGz = patterns.name.endsWith('.gz');

    await Promise.all([
      saveFileStream(
        simdata,
        DB_FOLDER + simdata_obj.simdata + (simIsGz ? '.gz' : '')
      ),
      saveFileStream(
        patterns,
        DB_FOLDER + simdata_obj.patterns + (patIsGz ? '.gz' : '')
      )
    ]);

    // Background: Get PapData Path and Trigger pre-computation
    // We need to find the papdata associated with the czone
    // Assuming simple relation or passing check.
    const papdata_obj = await prisma.paPData.findUnique({
      where: { czone_id: Number(czone_id) }
    });
    if (papdata_obj) {
      // Check for papdata compression
      let papPath = DB_FOLDER + papdata_obj.id;
      try {
        await access(papPath + '.gz', constants.F_OK);
        papPath += '.gz';
      } catch {
        // assume plain
      }

      generateGlobalStats(
        DB_FOLDER + simdata_obj.simdata + (simIsGz ? '.gz' : ''),
        DB_FOLDER + simdata_obj.patterns + (patIsGz ? '.gz' : ''),
        papPath,
        DB_FOLDER + simdata_obj.simdata + '.stats.json'
      ).catch((e) => console.error('Stats generation failed:', e));

      // Background: Trigger Postgres Ingestion
      processSimData(
        simdata_obj.id,
        DB_FOLDER + simdata_obj.simdata + (simIsGz ? '.gz' : ''),
        DB_FOLDER + simdata_obj.patterns + (patIsGz ? '.gz' : '')
      ).catch((e) => console.error('Postgres ingestion failed:', e));
    }

    return c.json({
      data: {
        id: simdata_obj.id
      }
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
      where: { id },
      include: {
        czone: true
      }
    });

    if (!simdata) {
      throw new HTTPException(404, {
        message: `Could not find simdata #${id}`
      });
    }

    // Check if files exist on disk
    let simPath = DB_FOLDER + simdata.simdata;
    let patPath = DB_FOLDER + simdata.patterns;
    let simIsGz = false;
    let patIsGz = false;

    try {
      // Check simdata
      try {
        await access(simPath + '.gz', constants.F_OK);
        simPath += '.gz';
        simIsGz = true;
      } catch {
        await access(simPath, constants.F_OK);
      }

      // Check patterns
      try {
        await access(patPath + '.gz', constants.F_OK);
        patPath += '.gz';
        patIsGz = true;
      } catch {
        await access(patPath, constants.F_OK);
      }
    } catch (e) {
      // Integrity Error: Delete the metadata from DB to prevent ghosts
      await prisma.simData.delete({ where: { id: simdata.id } });
      throw new HTTPException(404, {
        message:
          'Simulation resource files not found on server. The run has been removed from the database.'
      });
    }

    return stream(c, async (stream) => {
      // Stream the response to avoid memory overload
      await stream.write(
        `{"data":{"name":${JSON.stringify(simdata.name)},"length":${simdata.length},"zone":${JSON.stringify(simdata.czone)},"simdata":{`
      );

      let first = true;

      const simChain: any[] = [createReadStream(simPath)];
      if (simIsGz) simChain.push(createGunzip());
      simChain.push(parser(), StreamObject.streamObject());

      const patChain: any[] = [createReadStream(patPath)];
      if (patIsGz) patChain.push(createGunzip());
      patChain.push(parser(), StreamObject.streamObject());

      const simdatapl = chain(simChain);
      const patternspl = chain(patChain);

      simdatapl.on('error', (err) => {
        console.error('SimData Stream Error:', err);
        stream.close();
      });
      patternspl.on('error', (err) => {
        console.error('Patterns Stream Error:', err);
        stream.close();
      });

      const simIter = simdatapl[Symbol.asyncIterator]();
      const patIter = patternspl[Symbol.asyncIterator]();

      let spl = await simIter.next();
      let ppl = await patIter.next();

      while (!spl.done && !ppl.done) {
        const skey = spl.value.key;
        const pkey = ppl.value.key;

        if (skey !== pkey) {
          if (+skey < +pkey) {
            spl = await simIter.next();
            continue;
          } else {
            ppl = await patIter.next();
            continue;
          }
        }

        if (!first) {
          await stream.write(',');
        }
        first = false;

        const svalue = spl.value.value;
        const pvalue = ppl.value.value;

        // Transformation Logic (Inline to save memory)
        // this should be a utility but fine here for streaming context
        const frameData: any = { homes: {}, places: {} };

        const curinfected = new Set(
          Object.values(svalue)
            .map((people) => Object.keys(people as any))
            .flat()
        );

        // Client expects: { homes: {id: {population, infected}}, places: ... }

        for (const [id, pop] of Object.entries(pvalue['homes']) as [
          string,
          string[]
        ][]) {
          const infCount = pop.filter((v) => curinfected.has(v)).length;
          if (infCount > 0) {
            // optimization: only send if interesting? Client might need pop always.
            frameData['homes'][id] = {
              population: pop.length,
              infected: infCount
            };
          } else {
            frameData['homes'][id] = {
              population: pop.length,
              infected: 0
            };
          }
        }
        for (const [id, pop] of Object.entries(pvalue['places']) as [
          string,
          string[]
        ][]) {
          const infCount = pop.filter((v) => curinfected.has(v)).length;
          frameData['places'][id] = {
            population: pop.length,
            infected: infCount
          };
        }

        await stream.write(`"${skey}":${JSON.stringify(frameData)}`);

        spl = await simIter.next();
        ppl = await patIter.next();
      }

      await stream.write('}}}');
    });
  }
);

simdata_route.get(
  '/simdata/cache/:czone_id',
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
      data: czone.simdata.map((simdata: SimData) => ({
        name: simdata.name,
        created_at: simdata.created_at,
        sim_id: simdata.id
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
  Susceptible: 0,
  Infected: 1,
  Infectious: 2,
  Symptomatic: 4,
  Hospitalized: 8,
  Recovered: 16,
  Removed: 32
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

  // Optimize: Use readFile instead of stream+concat
  try {
    const data = await readFile(DB_FOLDER + papdata_obj.id, 'utf8');
    return JSON.parse(data);
  } catch (e) {
    // File missing, remove from DB
    await prisma.convenienceZone.delete({ where: { id: czone_id } });

    throw new HTTPException(404, {
      message:
        'Convenience Zone data file missing. The Zone has been removed from the database.'
    });
  }
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

    // Check if we have pre-computed stats for global query
    if (!loc_id || !loc_type) {
      try {
        const stats = await readFile(
          DB_FOLDER + simdata.simdata + '.stats.json',
          'utf8'
        );
        return c.json({ data: JSON.parse(stats) });
      } catch (e) {
        // Stats file missing, generate it on the fly (and save it)
        // This is the fallback if upload happened before this update
        const papdata_obj = await prisma.paPData.findUnique({
          where: { czone_id: simdata.czone_id }
        });

        if (papdata_obj) {
          // Check if source files exist before trying to generate
          try {
            await Promise.all([
              access(DB_FOLDER + simdata.simdata, constants.F_OK),
              access(DB_FOLDER + simdata.patterns, constants.F_OK)
            ]);

            const stats = await generateGlobalStats(
              DB_FOLDER + simdata.simdata,
              DB_FOLDER + simdata.patterns,
              DB_FOLDER + papdata_obj.id,
              DB_FOLDER + simdata.simdata + '.stats.json'
            );
            return c.json({ data: stats });
          } catch (e) {
            throw new HTTPException(404, {
              message: 'Simulation source files missing, cannot generate stats'
            });
          }
        }
      }
    }

    // If specific location, query Postgres
    if (loc_id) {
      try {
        const rows = await getStats(simdata.id, loc_id);

        // Transform rows to ChartData format
        const chartData: ChartData = {
          iot: [],
          ages: [],
          sexes: [],
          states: []
        };

        // We need `papdata` for the demography mapping.
        const papdata = await getPapData(simdata.czone_id);

        for (const row of rows) {
          const iot_data: DataPoint = { time: row.time };
          const ages_data: DataPoint = { time: row.time };
          const sexes_data: DataPoint = { time: row.time };
          const states_data: DataPoint = { time: row.time };

          // Init
          sexes_data['Male'] = 0;
          sexes_data['Female'] = 0;
          for (const range of age_ranges) ages_data[range.join('-')] = 0;
          for (const state of Object.keys(infection_states))
            states_data[state] = 0;

          // IOT Data
          iot_data['All People'] = row.population;
          const infectedMap = row.infected_list; // { disease: { pid: state } }

          for (const [disease, people] of Object.entries(infectedMap) as [
            string,
            any
          ][]) {
            iot_data[disease] = Object.keys(people).length;

            // States
            for (const [state, value] of Object.entries(infection_states)) {
              states_data[state] += Object.values(people).filter(
                (s: any) => s & (value as number)
              ).length;
            }

            // Demographics
            Object.keys(people).forEach((pid) => {
              const p = papdata['people'][pid];
              if (p) {
                sexes_data[p['sex'] == 0 ? 'Male' : 'Female'] += 1;
                for (const range of age_ranges) {
                  if (p['age'] >= range[0] && p['age'] <= range[1]) {
                    ages_data[range.join('-')] += 1;
                  }
                }
              }
            });
          }

          chartData.iot.push(iot_data);
          chartData.ages.push(ages_data);
          chartData.sexes.push(sexes_data);
          chartData.states.push(states_data);
        }

        return c.json({ data: chartData });
      } catch (e) {
        console.error('Stats retrieval error:', e);
        throw new HTTPException(500, {
          message: 'Failed to retrieve simulation statistics.'
        });
      }
    }

    throw new HTTPException(400, { message: 'Invalid request parameters' });
  }
);

export default simdata_route;
