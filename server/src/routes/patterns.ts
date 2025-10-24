import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { PrismaClient } from "@prisma/client";
import { streamText } from "hono/streaming";

const patterns_route = new Hono();
const prisma = new PrismaClient();

const postPatternsSchema = z.object({
  czone_id: z.number().nonnegative(),
  papdata: z.object({}).passthrough(),
  patterns: z.object({}).passthrough()
});

const getPatternsSchema = z.object({
  czone_id: z.coerce.number().nonnegative()
});

const getPatternsQuerySchema = z.object({
  stream: z.coerce.boolean().optional()
});

patterns_route.post(
  '/patterns', 
  zValidator('json', postPatternsSchema),
    async (c) => {
    const { czone_id, patterns, papdata } = c.req.valid('json');

    const papdata_obj = await prisma.paPData.create({
      data: {
        papdata: JSON.stringify(papdata),
        czone_id: czone_id
      }
    });

    const patterns_obj = await prisma.movementPattern.create({
      data: {
        patterns: JSON.stringify(patterns),
        czone_id: czone_id
      }
    });

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
  zValidator('param', getPatternsSchema),
  zValidator('query', getPatternsQuerySchema),
  async (c) => {
    const { czone_id } = c.req.valid('param');
    const { stream } = c.req.valid('query');

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

    if (stream) {
      return streamText(c, async (stream) => {
        await stream.write(`${papdata_obj.papdata}\n`);

        const patterns = JSON.parse(patterns_obj.patterns);
        const timestamps = Object.keys(patterns).sort((a, b) => +a - +b);

        for (const curtime of timestamps) {
          await stream.write(`${JSON.stringify({ patterns: { [curtime]: patterns[curtime] } })}\n`);
        }
      });
    }

    // Not streaming? return data as normal
    return c.json({
      data: {
        papdata: JSON.parse(papdata_obj.papdata),
        patterns: JSON.parse(patterns_obj.patterns)
      }
    });
  }
);

export default patterns_route;
