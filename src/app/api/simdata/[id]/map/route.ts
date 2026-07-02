import type { NextRequest } from 'next/server';
import { DB_FOLDER } from '@/lib/db-files';
import { loadMapCacheFrame, loadMapCacheManifest } from '@/lib/map-cache';
import { prisma } from '@/lib/prisma';
import { getProcessingStatus, processingStatus } from '@/lib/sim-processor';
import { jsonMessage } from '@/server/api/responses';
import { parseNonNegativeRouteNumber } from '@/server/api/route-params';

function getPublicZone<T extends { guest_claim_token_hash?: unknown }>(
  zone: T
) {
  const { guest_claim_token_hash: _claimHash, ...publicZone } = zone;
  return publicZone;
}

function getRunMetadata(globalStats: unknown) {
  if (!globalStats || typeof globalStats !== 'object') {
    return null;
  }
  const metadata = (globalStats as Record<string, unknown>).metadata;
  return metadata === undefined ? null : metadata;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: idRaw } = await params;
  const id = parseNonNegativeRouteNumber(idRaw, 'id');

  if (!id.ok) {
    return jsonMessage(id.message, id.status);
  }

  const simdata = await prisma.simData.findUnique({
    where: { id: id.value },
    include: { czone: true }
  });

  if (!simdata) {
    return Response.json(
      { message: `Could not find simdata #${id.value}` },
      { status: 404 }
    );
  }

  const mapCachePath = `${DB_FOLDER}${simdata.file_id}.map.json`;
  const activeStatus = processingStatus.get(id.value);
  if (activeStatus) {
    return Response.json(
      {
        processing: true,
        progress: activeStatus.progress,
        message: activeStatus.message
      },
      { status: 202 }
    );
  }

  try {
    const requestedTime = request.nextUrl.searchParams.get('time');
    if (requestedTime !== null) {
      const time = Number(requestedTime);
      if (!Number.isFinite(time) || time < 0) {
        return Response.json({ message: 'Invalid time' }, { status: 400 });
      }

      const frame = await loadMapCacheFrame(mapCachePath, Math.round(time));
      return Response.json(
        {
          data: {
            time: frame.time,
            requested_time: frame.requested_time,
            simdata: { [frame.time.toString()]: frame.frame }
          }
        },
        { headers: { 'Cache-Control': 'private, max-age=30' } }
      );
    }

    const manifest = await loadMapCacheManifest(mapCachePath);
    return Response.json(
      {
        data: {
          name: simdata.name,
          length: simdata.length,
          saved: simdata.saved,
          zone: getPublicZone(simdata.czone),
          metadata: getRunMetadata(simdata.global_stats),
          papdata: manifest.papdata,
          hotspots: manifest.hotspots,
          timesteps: manifest.timesteps,
          poiPeaks: manifest.poiPeaks,
          incidence: manifest.incidence
        }
      },
      { headers: { 'Cache-Control': 'private, max-age=30' } }
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') {
      console.error('Map cache read error:', error);
    }

    const status = getProcessingStatus(id.value);
    return Response.json(
      {
        processing: true,
        progress: status.progress,
        message: status.message
      },
      { status: 202 }
    );
  }
}
