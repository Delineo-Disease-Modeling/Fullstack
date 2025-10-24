import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { PrismaClient } from "@prisma/client";

const simdata_route = new Hono();
const prisma = new PrismaClient();

const postSimDataSchema = z.object({
  czone_id: z.coerce.number().nonnegative(),
  simdata: z.string().nonempty()
});

const getSimDataSchema = z.object({
  czone_id: z.coerce.number().nonnegative()
});

simdata_route.post(
  '/simdata',
  zValidator('json', postSimDataSchema),
  async (c) => {
    const { simdata, czone_id } = c.req.valid('json');

    await prisma.simData.upsert({
      where: {
        czone_id: czone_id
      },
      update: {
        simdata: simdata
      },
      create: {
        czone_id: czone_id,
        simdata: simdata
      }
    });

    return c.json({
      message: `Successfully added simulator cache data to zone #${czone_id}`
    });
  }
);

simdata_route.get(
  '/simdata/:czone_id',
  zValidator('param', getSimDataSchema),
  async (c) => {
    const { czone_id } = c.req.valid('param');

    const simdata = await prisma.simData.findUnique({
      where: { czone_id: czone_id }
    });

    if (!simdata) {
      return c.json(
        {
          message: 'Could not find associated simdata'
        },
        404
      );
    }

    return c.json({
      data: simdata.simdata
    });
  }
);

export default simdata_route;
