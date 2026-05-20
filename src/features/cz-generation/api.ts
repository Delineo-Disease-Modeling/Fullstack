import type { GeoJSONData, LatLng } from '@/lib/cz-geo';
import { getResponseErrorMessage, readJsonObject } from './helpers';
import type {
  ClusteringPreviewResponse,
  GuidedSecondOrderMetadata,
  LookupLocationResult,
  PoiAnalysis,
  TraceCandidate,
  ZoneMetrics
} from './types';

const DEFAULT_ALGORITHMS_URL = 'http://localhost:1880/';

type QueryValue = string | number | boolean | null | undefined;

type JsonObject = Record<string, unknown>;

export type PatternAvailabilityResponse = {
  data?: {
    available_months?: unknown[];
    required_months?: unknown[];
    missing_months?: unknown[];
    has_any_data?: boolean;
    has_coverage?: boolean;
  };
};

export type CbgAtPointResponse = {
  cbg?: string;
  population?: number;
};

export type CandidatePoisResponse = {
  pois?: PoiAnalysis[];
};

export type FrontierCandidatesResponse = {
  candidates?: TraceCandidate[];
};

export type FinalizeConvenienceZoneResponse = {
  id?: number;
  message?: string;
};

export type ExportedMapHtml = {
  blob: Blob;
  filename: string;
};

function algorithmsUrl(path: string, query?: Record<string, QueryValue>) {
  const url = new URL(
    path,
    process.env.NEXT_PUBLIC_ALG_URL || DEFAULT_ALGORITHMS_URL
  );
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== null && value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

async function requestAlgorithmsJson<T>(
  path: string,
  options: {
    method?: 'GET' | 'POST';
    query?: Record<string, QueryValue>;
    body?: JsonObject;
    signal?: AbortSignal;
    errorMessage: string;
  }
): Promise<T> {
  const response = await fetch(algorithmsUrl(path, options.query), {
    method: options.method ?? 'GET',
    signal: options.signal,
    headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await readJsonObject(response);

  if (!response.ok) {
    throw new Error(
      getResponseErrorMessage(response, data, options.errorMessage)
    );
  }

  return data as T;
}

export function getClusteringProgressUrl(clusteringId: number) {
  return algorithmsUrl(`clustering-progress/${clusteringId}`);
}

export async function fetchPatternAvailability(
  request: {
    state: string;
    startDate: string;
    endDate: string;
  },
  signal?: AbortSignal
) {
  return requestAlgorithmsJson<PatternAvailabilityResponse>(
    'pattern-availability',
    {
      query: {
        state: request.state,
        start_date: request.startDate,
        end_date: request.endDate
      },
      signal,
      errorMessage: 'Failed to load pattern availability.'
    }
  );
}

export async function fetchCbgGeoJson(
  cbgs: string[],
  includeNeighbors: boolean,
  signal?: AbortSignal
) {
  return requestAlgorithmsJson<GeoJSONData & { message?: string }>(
    'cbg-geojson',
    {
      query: {
        cbgs: cbgs.join(','),
        include_neighbors: includeNeighbors
      },
      signal,
      errorMessage: 'Failed to load CBG geometry.'
    }
  );
}

export async function fetchCbgAtPoint(latlng: LatLng, stateFips: string) {
  return requestAlgorithmsJson<CbgAtPointResponse>('cbg-at-point', {
    query: {
      latitude: latlng.lat,
      longitude: latlng.lng,
      state_fips: stateFips
    },
    errorMessage: 'Failed to resolve clicked map location to CBG.'
  });
}

export async function lookupLocation(
  query: string
): Promise<LookupLocationResult | null> {
  const location = String(query ?? '').trim();
  if (!location) {
    return null;
  }

  const response = await fetch('/api/lookup-location', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ location })
  });
  if (response.status === 404) {
    return null;
  }

  const data = await readJsonObject(response);
  if (!response.ok) {
    throw new Error(
      getResponseErrorMessage(
        response,
        data,
        `Location lookup failed with status ${response.status}`
      )
    );
  }

  return data as LookupLocationResult;
}

export async function fetchCzMetrics(body: {
  seed_cbg: string;
  cbg_list: string[];
  start_date: string;
  use_test_data: boolean;
}) {
  return requestAlgorithmsJson<ZoneMetrics>('cz-metrics', {
    method: 'POST',
    body,
    errorMessage: 'Failed to compute zone metrics.'
  });
}

export async function fetchCandidatePois(body: {
  seed_cbg: string;
  candidate_cbg: string;
  cluster_cbgs: string[];
  start_date: string;
  use_test_data: boolean;
  limit: number;
}) {
  return requestAlgorithmsJson<CandidatePoisResponse>('candidate-pois', {
    method: 'POST',
    body,
    errorMessage: 'Failed to load POI analysis.'
  });
}

export async function fetchFrontierCandidates(body: JsonObject) {
  return requestAlgorithmsJson<FrontierCandidatesResponse>(
    'frontier-candidates',
    {
      method: 'POST',
      body,
      errorMessage: 'Failed to load frontier candidates.'
    }
  );
}

export async function fetchSecondOrderDestinations(body: JsonObject) {
  return requestAlgorithmsJson<
    GuidedSecondOrderMetadata & {
      use_test_data?: boolean;
      recommended_unit_ids?: unknown[];
    }
  >('second-order-destinations', {
    method: 'POST',
    body,
    errorMessage: 'Failed to load connected city destinations.'
  });
}

export async function startClusteringPreview(body: JsonObject) {
  return requestAlgorithmsJson<ClusteringPreviewResponse>('cluster-cbgs', {
    method: 'POST',
    body,
    errorMessage: 'Failed to cluster CBGs. Please try again.'
  });
}

export async function finalizeConvenienceZone(body: JsonObject) {
  return requestAlgorithmsJson<FinalizeConvenienceZoneResponse>('finalize-cz', {
    method: 'POST',
    body,
    errorMessage: 'Failed to create convenience zone. Please try again.'
  });
}

export async function exportCzMapHtml(body: {
  cbg_list: string[];
  name: string;
}) {
  const response = await fetch(algorithmsUrl('export-cz-map-html'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errorData = await readJsonObject(response);
    throw new Error(
      getResponseErrorMessage(
        response,
        errorData,
        'Failed to export the CZ HTML map.'
      )
    );
  }

  const blob = await response.blob();
  const disposition = response.headers.get('content-disposition') || '';
  const filenameMatch = disposition.match(/filename="?([^"]+)"?/);
  const safeName =
    body.name.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') ||
    'cz-map';

  return {
    blob,
    filename: filenameMatch?.[1] || `${safeName}.html`
  };
}
