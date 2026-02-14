import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { PrismaClient } from "@prisma/client";
import { streamText } from "hono/streaming";
import { createReadStream } from "fs";
import { access, readFile } from "fs/promises";
import { DB_FOLDER } from "../env.js";
import chain from "stream-chain";
import parser from 'stream-json';
import StreamObject from "stream-json/streamers/StreamObject.js";
import { saveFileStream } from "../lib/filestream.js";

const patterns_route = new Hono();
const prisma = new PrismaClient();

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
})

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

    // Write patterns/papdata info to file
    await Promise.all([
      saveFileStream(patterns, DB_FOLDER + patterns_obj.id),
      saveFileStream(papdata, DB_FOLDER + papdata_obj.id),
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

    const papdataPath = DB_FOLDER + papdata_obj.id;
    const patternsPath = DB_FOLDER + patterns_obj.id;

    try {
      await Promise.all([access(papdataPath), access(patternsPath)]);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return c.json(
          {
            message: 'Could not find patterns or papdata files. Please regenerate this convenience zone.'
          },
          404
        );
      }
      throw error;
    }

    return streamText(c, async (stream) => {
      const papdata = createReadStream(papdataPath);

      for await (const chunk of papdata) {
        await stream.write(chunk);
      }

      await stream.write('\n');

      const pipeline = chain([
        createReadStream(patternsPath),
        parser(),
        StreamObject.streamObject()
      ]);

      for await (const { key, value } of pipeline) {
        if (length && +key > length) {
          continue;
        }

        await stream.write(`${JSON.stringify({ patterns: { [key]: value }})}\n`);
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

    try {
      const data = await readFile(DB_FOLDER + papdata_obj.id, 'utf8');
      return c.json({
        data: JSON.parse(data)
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return c.json(
          {
            message: 'Could not find papdata file. Please regenerate this convenience zone.'
          },
          404
        );
      }
      throw error;
    }
  }
);

export default patterns_route;
