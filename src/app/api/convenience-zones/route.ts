import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { broadcast } from '@/lib/sse-broadcast';

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
  const session = await auth.api.getSession({ headers: request.headers });
  const user_id = session?.user?.id;

  if (!user_id) {
    return Response.json({ message: 'Authentication required' }, { status: 401 });
  }

  const zones = await prisma.convenienceZone.findMany({
    where: { user_id }
  });

  return Response.json({
    data: zones.map((zone) => ({
      ...zone,
      ready: !!zone.papdata_id
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
    const sessionUserId = session?.user?.id;

    if (sessionUserId && bodyUserId && bodyUserId !== sessionUserId) {
      return Response.json(
        { message: 'Authenticated user does not match request user_id.' },
        { status: 403 }
      );
    }

    const user_id = sessionUserId ?? bodyUserId;

    if (!user_id) {
      return Response.json(
        { message: 'Authentication required' },
        { status: 401 }
      );
    }

    if (!sessionUserId) {
      const existingUser = await prisma.user.findUnique({
        where: { id: user_id },
        select: { id: true }
      });

      if (!existingUser) {
        return Response.json(
          {
            message:
              'Authentication required. Please log in again before creating a convenience zone.'
          },
          { status: 401 }
        );
      }
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

    broadcast({ type: 'zone-created', zone_id: zone.id });

    return Response.json({ data: zone });
  } catch {
    return Response.json({ message: 'Internal server error' }, { status: 500 });
  }
}
