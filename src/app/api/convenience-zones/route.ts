import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';

const getSchema = z.object({
  user_id: z.string().optional()
});

const postSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  latitude: z.number(),
  longitude: z.number(),
  cbg_list: z.array(z.string()),
  start_date: z.string().datetime(),
  length: z.number().nonnegative(),
  size: z.number().nonnegative(),
  user_id: z.string().min(1).optional()
});

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const parsed = getSchema.safeParse({
    user_id: searchParams.get('user_id') || undefined
  });

  if (!parsed.success) {
    return Response.json({ message: 'Invalid query' }, { status: 400 });
  }

  const { user_id } = parsed.data;

  const zones = await prisma.convenienceZone.findMany({
    include: {
      papdata: { select: { id: true } }
    },
    where: { user_id }
  });

  return Response.json({
    data: zones.map((zone: any) => ({
      ...zone,
      papdata: undefined,
      ready: !!zone.papdata
    }))
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = postSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json({ message: parsed.error.message }, { status: 400 });
    }

    const {
      name,
      description,
      latitude,
      longitude,
      cbg_list,
      start_date,
      length,
      size,
      user_id: bodyUserId
    } = parsed.data;

    const session = await auth.api.getSession({ headers: request.headers });
    const user_id = session?.user?.id ?? bodyUserId;

    if (!user_id) {
      return Response.json(
        { message: 'Authentication required' },
        { status: 401 }
      );
    }

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

    return Response.json({ data: zone });
  } catch {
    return Response.json({ message: 'Internal server error' }, { status: 500 });
  }
}
