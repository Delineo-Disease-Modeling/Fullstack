import type { NextRequest } from 'next/server';
import { buildCzExportTar } from '@/lib/cz-export';
import { prisma } from '@/lib/prisma';
import { jsonMessage } from '@/server/api/responses';
import { parsePositiveFiniteRouteNumber } from '@/server/api/route-params';
import { requireSessionUserId } from '@/server/api/session';

/**
 * Diagnostic export keyed by SimData id. Resolves the parent CZ, then
 * streams the same tarball layout as /api/cz-export/[czone_id] scoped to
 * this single run. Useful when the user only has the sim URL
 * (e.g. /simulator/<sim_id>) and not the czone_id.
 *
 * Auth: any logged-in session.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sim_id: string }> }
) {
  const session = await requireSessionUserId(request.headers);
  if (!session.ok) {
    return session.response;
  }

  const { sim_id: rawId } = await params;
  const simId = parsePositiveFiniteRouteNumber(rawId, 'sim_id');
  if (!simId.ok) {
    return jsonMessage(simId.message, simId.status);
  }
  const sim_id = simId.value;

  const run = await prisma.simData.findUnique({ where: { id: sim_id } });
  if (!run) {
    return Response.json({ message: 'SimData not found' }, { status: 404 });
  }

  const czone = await prisma.convenienceZone.findUnique({
    where: { id: run.czone_id }
  });
  if (!czone) {
    return Response.json(
      { message: 'Parent CZ not found for this SimData' },
      { status: 404 }
    );
  }

  const stream = await buildCzExportTar({
    czone,
    simRuns: [run],
    exportedBy: session.userId
  });
  return new Response(stream as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/x-tar',
      'Content-Disposition': `attachment; filename="sim-${sim_id}-export.tar"`,
      'Cache-Control': 'no-store'
    }
  });
}
