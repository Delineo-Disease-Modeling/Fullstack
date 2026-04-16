import type { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { buildCzExportTar } from '@/lib/cz-export';
import { prisma } from '@/lib/prisma';

const DEFAULT_SIM_LIMIT = 3;
const MAX_SIM_LIMIT = 20;

/**
 * Diagnostic export: streams a tarball of the CZ's stored papdata+patterns plus
 * recent SimData artifacts, for offline comparison with local runs.
 *
 * Auth: any logged-in session.
 *
 * Query params:
 *   sim_id=<id>   only include this SimData run
 *   limit=<n>     include up to n most-recent runs (default 3, max 20)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ czone_id: string }> }
) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user?.id) {
    return Response.json(
      { message: 'Authentication required' },
      { status: 401 }
    );
  }

  const { czone_id: rawId } = await params;
  const czone_id = Number(rawId);
  if (!Number.isFinite(czone_id) || czone_id <= 0) {
    return Response.json({ message: 'Invalid czone_id' }, { status: 400 });
  }

  const url = new URL(request.url);
  const simIdParam = url.searchParams.get('sim_id');
  const limitParam = url.searchParams.get('limit');

  const czone = await prisma.convenienceZone.findUnique({
    where: { id: czone_id }
  });
  if (!czone) {
    return Response.json({ message: 'CZ not found' }, { status: 404 });
  }

  let simRuns: Awaited<ReturnType<typeof prisma.simData.findMany>>;
  if (simIdParam) {
    const simId = Number(simIdParam);
    if (!Number.isFinite(simId) || simId <= 0) {
      return Response.json({ message: 'Invalid sim_id' }, { status: 400 });
    }
    const single = await prisma.simData.findFirst({
      where: { id: simId, czone_id }
    });
    simRuns = single ? [single] : [];
  } else {
    const limit = limitParam
      ? Math.max(0, Math.min(MAX_SIM_LIMIT, Number(limitParam) || 0))
      : DEFAULT_SIM_LIMIT;
    simRuns = limit
      ? await prisma.simData.findMany({
          where: { czone_id },
          orderBy: { created_at: 'desc' },
          take: limit
        })
      : [];
  }

  const stream = await buildCzExportTar({
    czone,
    simRuns,
    exportedBy: session.user.id
  });
  return new Response(stream as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/x-tar',
      'Content-Disposition': `attachment; filename="cz-${czone_id}-export.tar"`,
      'Cache-Control': 'no-store'
    }
  });
}
