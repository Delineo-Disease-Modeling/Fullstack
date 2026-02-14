import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { PrismaClient } from "@prisma/client";
import { DB_FOLDER } from "../env.js";
import { access, unlink } from "fs/promises";

const cz_route = new Hono();

const prisma = new PrismaClient();

const getConvZonesSchema = z.object({
  user_id: z.string().optional()
})

const postConvZonesSchema = z.object({
  name: z.string().nonempty(),
  description: z.string().nonempty(),
  latitude: z.number(),
  longitude: z.number(),
  cbg_list: z.array(z.string()),
  start_date: z.string().datetime(),
  length: z.number().nonnegative(),
  size: z.number().nonnegative(),
  user_id: z.string().nonempty()
});

const deleteConvZonesSchema = z.object({
  czone_id: z.coerce.number().nonnegative()
});

const patchConvZonesSchema = z.object({
  cbg_list: z.array(z.string()).optional(),
  size: z.number().nonnegative().optional(),
});

cz_route.get('/convenience-zones', zValidator('query', getConvZonesSchema), async (c) => {
  const { user_id } = c.req.valid('query');

  const zones = await prisma.convenienceZone.findMany({
    include: {
      papdata: {
        select: {
          id: true
        }
      },
      patterns: {
        select: {
          id: true
        }
      }
    },
    where: {
      user_id
    }
  });

  const data = await Promise.all(zones.map(async (zone: any) => {
    const papdataId = zone.papdata?.id;
    const patternsId = zone.patterns?.id;
    let ready = false;

    if (papdataId && patternsId) {
      try {
        await Promise.all([
          access(DB_FOLDER + papdataId),
          access(DB_FOLDER + patternsId)
        ]);
        ready = true;
      } catch {
        ready = false;
      }
    }

    return {
      ...zone,
      papdata: undefined,
      patterns: undefined,
      ready
    };
  }));

  return c.json({
    data
  });
});

cz_route.post(
  '/convenience-zones',
  zValidator('json', postConvZonesSchema),
  async (c) => {
    const { name, description, latitude, longitude, cbg_list, start_date, length, size, user_id } =
      c.req.valid('json');

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

cz_route.patch(
  '/convenience-zones/:czone_id',
  zValidator('param', deleteConvZonesSchema),
  zValidator('json', patchConvZonesSchema),
  async (c) => {
    const { czone_id } = c.req.valid('param');
    const updates = c.req.valid('json');

    const zone = await prisma.convenienceZone.findUnique({
      where: { id: czone_id }
    });

    if (!zone) {
      return c.json({ message: `Could not find convenience zone #${czone_id}` }, 404);
    }

    const updated = await prisma.convenienceZone.update({
      where: { id: czone_id },
      data: updates
    });

    return c.json({ data: updated });
  }
);

cz_route.delete(
  '/convenience-zones/:czone_id',
  zValidator('param', deleteConvZonesSchema),
  async (c) => {
    const { czone_id } = c.req.valid('param');

    const zone = await prisma.convenienceZone.findUnique({
      where: { id: czone_id },
      include: {
        papdata: { select: { id: true } },
        patterns: { select: { id: true } },
        simdata: { select: { id: true, simdata: true, patterns: true } }
      }
    });

    if (!zone) {
      return c.json({ message: `Could not find convenience zone #${czone_id}` }, 404);
    }

    // Best-effort file cleanup (ignore missing files).
    const fileDeletes: Promise<unknown>[] = [];

    if (zone.papdata?.id) {
      fileDeletes.push(unlink(DB_FOLDER + zone.papdata.id).catch(() => undefined));
    }

    if (zone.patterns?.id) {
      fileDeletes.push(unlink(DB_FOLDER + zone.patterns.id).catch(() => undefined));
    }

    for (const run of zone.simdata) {
      if (run.simdata) {
        fileDeletes.push(unlink(DB_FOLDER + run.simdata).catch(() => undefined));
      }
      if (run.patterns) {
        fileDeletes.push(unlink(DB_FOLDER + run.patterns).catch(() => undefined));
      }
    }

    await Promise.all(fileDeletes);

    const deleted = await prisma.convenienceZone.delete({
      where: { id: czone_id }
    });

    return c.json({ data: deleted });
  }
);

export default cz_route;
