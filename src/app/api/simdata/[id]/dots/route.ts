import { gzipSync } from 'node:zlib';
import type { NextRequest } from 'next/server';
import { getCachedPapdata } from '@/lib/papdata-cache';
import {
  ensureDotsFile,
  getRecentBakeFailure,
  isFileUnbakeable,
  loadDotsBundle
} from '@/lib/people-map-cache';
import { prisma } from '@/lib/prisma';
import { gzipPreserialized } from '@/server/api/gzip-json';
import { jsonMessage } from '@/server/api/responses';
import { parseNonNegativeRouteNumber } from '@/server/api/route-params';

// Cache the gzipped whole-run bundle so repeat opens (different users/tabs)
// don't re-gzip the multi-MB payload. Keyed by `${fileId}:${mtimeMs}` so a
// re-baked dots file invalidates automatically.
const bundleGzCache = new Map<string, Buffer>();
const BUNDLE_GZ_CACHE_LIMIT = 4;

function cacheBundleGz(key: string, gz: Buffer) {
  bundleGzCache.set(key, gz);
  if (bundleGzCache.size <= BUNDLE_GZ_CACHE_LIMIT) {
    return;
  }
  const oldest = bundleGzCache.keys().next().value;
  if (oldest) {
    bundleGzCache.delete(oldest);
  }
}

/**
 * Whole-run compact dots bundle: `{ version, place_ids, frames }`, the parsed
 * `{fileId}.dots.json`. The Cases map fetches this ONCE and synthesizes every
 * playback frame client-side, instead of re-fetching a large per-dot JSON each
 * tick (which blanks the dots over the WAN on prod). Returns 409 with an
 * `X-Dots-Status` header when the run has no readable baked file; the client
 * then falls back to the per-frame `/people-map` route.
 */
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
    select: { file_id: true, czone: { select: { papdata_id: true } } }
  });
  if (!simdata) {
    return Response.json(
      { message: `Could not find simdata #${id.value}` },
      { status: 404 }
    );
  }

  const fileId = simdata.file_id;
  const papdataId = simdata.czone.papdata_id;

  try {
    let dotsStatus = 'fallback:no-papdata';
    let ensured = false;
    let bakeThrew = false;
    if (papdataId) {
      dotsStatus = 'fallback';
      try {
        const papdata = (await getCachedPapdata(papdataId)) as {
          places?: Record<string, unknown>;
        };
        const placeIds = Object.keys(papdata.places ?? {});
        if (placeIds.length > 0) {
          ensured = await ensureDotsFile(fileId, placeIds);
        } else {
          dotsStatus = 'fallback:no-places';
        }
      } catch (bakeError) {
        bakeThrew = true;
        const err = bakeError as NodeJS.ErrnoException;
        console.error('dots: bundle generation failed:', {
          fileId,
          code: err?.code,
          message: err?.message
        });
      }

      const bundle = await loadDotsBundle(fileId);
      if (bundle) {
        const cacheKey = `${fileId}:${bundle.mtimeMs}`;
        let gz = bundleGzCache.get(cacheKey);
        if (!gz) {
          gz = gzipSync(
            Buffer.from(
              JSON.stringify({
                data: {
                  version: bundle.version,
                  place_ids: bundle.place_ids,
                  frames: bundle.frames
                }
              }),
              'utf8'
            )
          );
          cacheBundleGz(cacheKey, gz);
        }
        return gzipPreserialized(request, gz, {
          'Cache-Control': 'private, max-age=300',
          'X-Dots-Status': 'baked'
        });
      }

      if (dotsStatus === 'fallback') {
        if (bakeThrew || getRecentBakeFailure(fileId)) {
          dotsStatus = 'fallback:bake-error';
        } else if (isFileUnbakeable(fileId)) {
          dotsStatus = 'fallback:unbakeable';
        } else if (ensured) {
          dotsStatus = 'fallback:baked-unreadable';
        } else {
          dotsStatus = 'fallback:skipped';
        }
      }
    }

    // No bundle available: tell the client to use the per-frame fallback.
    const headers: Record<string, string> = { 'X-Dots-Status': dotsStatus };
    const bakeFailure = getRecentBakeFailure(fileId);
    if (bakeFailure) {
      headers['X-Dots-Bake-Error'] = `${bakeFailure.code}: ${bakeFailure.message}`
        .replace(/[^\x20-\x7E]/g, ' ')
        .slice(0, 180);
    }
    return Response.json(
      { message: 'No baked dots bundle for this run.' },
      { status: 409, headers }
    );
  } catch (error) {
    console.error('Dots bundle error:', error);
    return Response.json(
      { message: 'Failed to load dots bundle.' },
      { status: 500 }
    );
  }
}
