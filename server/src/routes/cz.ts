import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { prisma } from '../lib/prisma.js';

const cz_route = new Hono();

const getConvZonesSchema = z.object({
  user_id: z.string().optional()
});

const postConvZonesSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  latitude: z.number(),
  longitude: z.number(),
  cbg_list: z.array(z.string()),
  start_date: z.string().datetime(),
  length: z.number().nonnegative(),
  size: z.number().nonnegative(),
  user_id: z.string().min(1)
});

const deleteConvZonesSchema = z.object({
  czone_id: z.coerce.number().nonnegative()
});

cz_route.get(
  '/convenience-zones',
  zValidator('query', getConvZonesSchema),
  async (c) => {
    const { user_id } = c.req.valid('query');

    const zones = await prisma.convenienceZone.findMany({
      include: {
        papdata: {
          select: {
            id: true
          }
        }
      },
      where: {
        user_id
      }
    });

    return c.json({
      data: zones.map((zone: any) => ({
        ...zone,
        papdata: undefined,
        ready: !!zone.papdata
      }))
    });
  }
);

cz_route.post(
  '/convenience-zones',
  zValidator('json', postConvZonesSchema),
  async (c) => {
    const {
      name,
      description,
      latitude,
      longitude,
      cbg_list,
      start_date,
      length,
      size,
      user_id
    } = c.req.valid('json');

    const zone = await prisma.convenienceZone.create({
      data: {
        name,
        description,
        latitude,
        longitude,
        cbg_list,
        start_date,
        length,
        size,
        user_id
      }
    });

    return c.json({
      data: zone
    });
  }
);

cz_route.delete(
  '/convenience-zones/:czone_id',
  zValidator('param', deleteConvZonesSchema),
  async (c) => {
    try {
      const { czone_id } = c.req.valid('param');
      const zone = await prisma.convenienceZone.delete({
        where: {
          id: czone_id
        }
      });

      return c.json({
        data: zone
      });
    } catch (error) {
      return c.json(
        {
          message: error
        },
        400
      );
    }
  }
);

export default cz_route;
