import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { PrismaClient } from "@prisma/client";

const cz_route = new Hono();

const prisma = new PrismaClient();

const postConvZonesSchema = z.object({
  name: z.string().nonempty(),
  latitude: z.number(),
  longitude: z.number(),
  cbg_list: z.array(z.string()),
  start_date: z.string().datetime(),
  size: z.number().nonnegative(),
  user_id: z.string().nonempty()
});

const deleteConvZonesSchema = z.object({
  czone_id: z.coerce.number().nonnegative()
});

cz_route.get('/convenience-zones', async (c) => {
  const zones = await prisma.convenienceZone.findMany({
    include: {
      papdata: {
        select: {
          id: true
        }
      }
    }
  });

  return c.json({
    data: zones.map((zone: any) => ({
      ...zone,
      papdata: undefined,
      ready: !!zone.papdata
    }))
  });
});

cz_route.post(
  '/convenience-zones',
  zValidator('json', postConvZonesSchema),
  async (c) => {
    const { name, latitude, longitude, cbg_list, start_date, size, user_id } =
      c.req.valid('json');

    const zone = await prisma.convenienceZone.create({
      data: {
        name,
        latitude,
        longitude,
        cbg_list,
        start_date,
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
