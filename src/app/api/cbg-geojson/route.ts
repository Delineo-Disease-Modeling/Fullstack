import type { NextRequest } from 'next/server';
import { badRequest, jsonMessage } from '@/server/api/responses';

function getAlgorithmsBaseUrl() {
  return (
    process.env.ALG_URL ||
    process.env.NEXT_PUBLIC_ALG_URL ||
    'http://localhost:1880'
  ).replace(/\/+$/, '');
}

function normalizeCbgs(rawValue: string | null) {
  const cbgs = (rawValue ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  if (!cbgs.length) {
    return null;
  }

  return cbgs;
}

export async function GET(request: NextRequest) {
  const cbgs = normalizeCbgs(request.nextUrl.searchParams.get('cbgs'));
  if (!cbgs) {
    return badRequest('Missing cbgs');
  }

  const includeNeighbors =
    request.nextUrl.searchParams.get('include_neighbors')?.toLowerCase() ===
    'true';
  const upstreamUrl = new URL('cbg-geojson', `${getAlgorithmsBaseUrl()}/`);
  upstreamUrl.searchParams.set('cbgs', cbgs.join(','));
  upstreamUrl.searchParams.set(
    'include_neighbors',
    includeNeighbors ? 'true' : 'false'
  );

  try {
    const upstreamResponse = await fetch(upstreamUrl, { cache: 'no-store' });
    const payload = await upstreamResponse.text();

    if (!upstreamResponse.ok) {
      return new Response(payload, {
        status: upstreamResponse.status,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(payload, {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'private, max-age=300'
      }
    });
  } catch (error) {
    console.warn('CBG GeoJSON proxy failed:', error);
    return jsonMessage('Failed to load CBG geometry.', 502);
  }
}
