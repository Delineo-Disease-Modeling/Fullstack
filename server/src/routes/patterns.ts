import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { prisma } from '../lib/prisma.js';
import { streamText } from 'hono/streaming';
import { createReadStream } from 'fs';
import { access } from 'fs/promises';
import { constants } from 'fs';
import { createGunzip } from 'zlib';
import { DB_FOLDER } from '../env.js';
import chain from 'stream-chain';
import parser from 'stream-json';
import StreamObject from 'stream-json/streamers/StreamObject.js';
import { saveFileStream } from '../lib/filestream.js';

const patterns_route = new Hono();

const postPatternsSchema = z.object({
  czone_id: z.coerce.number().nonnegative(),
  papdata: z.instanceof(File),
  patterns: z.instanceof(File)
});

const getPatternsParamSchema = z.object({
  czone_id: z.coerce.number().nonnegative()
});

const getPatternsQuerySchema = z.object({
  length: z.coerce.number().positive().optional()
});

patterns_route.post(
  '/patterns',
  zValidator('form', postPatternsSchema),
  async (c) => {
    const { czone_id, patterns, papdata } = c.req.valid('form');

    const papdata_obj = await prisma.paPData.create({
      data: {
        czone_id: czone_id
      }
    });

    const patterns_obj = await prisma.movementPattern.create({
      data: {
        czone_id: czone_id
      }
    });

    // Write patterns/papdata info to file (Compressed!)
    await Promise.all([
      saveFileStream(patterns, DB_FOLDER + patterns_obj.id + '.gz', true),
      saveFileStream(papdata, DB_FOLDER + papdata_obj.id + '.gz', true)
    ]);

    return c.json({
      data: {
        papdata: {
          id: papdata_obj.id
        },
        patterns: {
          id: patterns_obj.id
        }
      }
    });
  }
);

patterns_route.get(
  '/patterns/:czone_id',
  zValidator('param', getPatternsParamSchema),
  zValidator('query', getPatternsQuerySchema),
  async (c) => {
    const { czone_id } = c.req.valid('param');
    const { length } = c.req.valid('query');

    const papdata_obj = await prisma.paPData.findUnique({
      where: {
        czone_id: czone_id
      }
    });

    const patterns_obj = await prisma.movementPattern.findUnique({
      where: {
        czone_id: czone_id
      }
    });

    if (!papdata_obj || !patterns_obj) {
      return c.json(
        {
          message: 'Could not find patterns or papdata'
        },
        404
      );
    }

    return streamText(c, async (stream) => {
      // READ PAPDATA
      let papPath = DB_FOLDER + papdata_obj.id;
      let papIsGz = false;
      try {
        await access(papPath + '.gz', constants.F_OK);
        papPath += '.gz';
        papIsGz = true;
      } catch {
        // assume plain
      }

      const papChain: any[] = [createReadStream(papPath)];
      if (papIsGz) papChain.push(createGunzip());

      const papdataStream = chain(papChain);

      for await (const chunk of papdataStream) {
        await stream.write(chunk);
      }

      await stream.write('\n');

      // READ PATTERNS
      let patPath = DB_FOLDER + patterns_obj.id;
      let patIsGz = false;
      try {
        await access(patPath + '.gz', constants.F_OK);
        patPath += '.gz';
        patIsGz = true;
      } catch {
        // assume plain
      }

      const patChain: any[] = [createReadStream(patPath)];
      if (patIsGz) patChain.push(createGunzip());
      patChain.push(parser(), StreamObject.streamObject());

      const pipeline = chain(patChain);

      for await (const { key, value } of pipeline) {
        if (length && +key > length) {
          continue;
        }

        await stream.write(
          `${JSON.stringify({ patterns: { [key]: value } })}\n`
        );
      }

      await stream.close();
    });
  }
);

patterns_route.get(
  '/papdata/:czone_id',
  zValidator('param', getPatternsParamSchema),
  async (c) => {
    const { czone_id } = c.req.valid('param');

    const papdata_obj = await prisma.paPData.findUnique({
      where: {
        czone_id: czone_id
      }
    });

    if (!papdata_obj) {
      return c.json(
        {
          message: 'Could not find papdata'
        },
        404
      );
    }

    let data = '';

    let papPath = DB_FOLDER + papdata_obj.id;
    let papIsGz = false;
    try {
      await access(papPath + '.gz', constants.F_OK);
      papPath += '.gz';
      papIsGz = true;
    } catch {
      // assume plain
    }

    const papChain: any[] = [createReadStream(papPath)];
    if (papIsGz) papChain.push(createGunzip());

    const papdata = chain(papChain);

    for await (const chunk of papdata) {
      data += chunk;
    }

    return c.json({
      data: JSON.parse(data)
    });
  }
);

export default patterns_route;
