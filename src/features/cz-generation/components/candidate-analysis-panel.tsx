'use client';

import type {
  PoiAnalysis,
  TraceCandidate
} from '@/features/cz-generation/types';

type CandidateAnalysisPanelProps = {
  selectedCbg: string;
  population: unknown;
  status: string;
  candidate: TraceCandidate | null;
  pois: PoiAnalysis[];
  poisLoading: boolean;
  poisError: string;
};

export function CandidateAnalysisPanel({
  selectedCbg,
  population,
  status,
  candidate,
  pois,
  poisLoading,
  poisError
}: CandidateAnalysisPanelProps) {
  return (
    <div className="czgen_subpanel h-[calc(100vh-13rem)] min-h-136 max-h-192 w-88 max-w-88">
      <div className="czgen_subpanel_header">
        <p className="czgen_subpanel_title">CBG Analysis</p>
      </div>
      <div
        className="px-4 py-3 border-b text-sm space-y-1"
        style={{ borderColor: 'var(--color-border-subtle)' }}
      >
        <div>
          <span className="font-semibold">CBG:</span> {selectedCbg || 'N/A'}
        </div>
        <div>
          <span className="font-semibold">Population:</span>{' '}
          {String(population ?? 'N/A')}
        </div>
        <div>
          <span className="font-semibold">Status:</span> {status}
        </div>
        {candidate && (
          <>
            <div>
              <span className="font-semibold">Rank:</span> #
              {candidate.rank ?? '?'}
            </div>
            <div>
              <span className="font-semibold">Score:</span>{' '}
              {Number(candidate.score ?? 0).toFixed(4)}
            </div>
            <div>
              <span className="font-semibold">To Cluster:</span>{' '}
              {Number(candidate.movement_to_cluster ?? 0).toLocaleString(
                undefined,
                {
                  maximumFractionDigits: 1
                }
              )}
            </div>
            {candidate.movement_to_full_cluster !== undefined && (
              <div>
                <span className="font-semibold">To Full Cluster:</span>{' '}
                {Number(
                  candidate.movement_to_full_cluster ?? 0
                ).toLocaleString(undefined, {
                  maximumFractionDigits: 1
                })}
              </div>
            )}
            <div>
              <span className="font-semibold">To Outside:</span>{' '}
              {Number(candidate.movement_to_outside ?? 0).toLocaleString(
                undefined,
                {
                  maximumFractionDigits: 1
                }
              )}
            </div>
            {candidate.seed_distance_km !== undefined && (
              <div>
                <span className="font-semibold">Seed Distance:</span>{' '}
                {Number(candidate.seed_distance_km ?? 0).toFixed(2)} km
              </div>
            )}
            {candidate.movement_contributes_after_selection !== undefined && (
              <div>
                <span className="font-semibold">Contributes After Add:</span>{' '}
                {candidate.movement_contributes_after_selection ? 'Yes' : 'No'}
              </div>
            )}
            {candidate.seed_movement_loss !== undefined && (
              <div>
                <span className="font-semibold">Seed Movement Lost:</span>{' '}
                {Number(candidate.seed_movement_loss ?? 0).toLocaleString(
                  undefined,
                  {
                    maximumFractionDigits: 1
                  }
                )}
              </div>
            )}
            {candidate.seed_capture_after !== undefined && (
              <div>
                <span className="font-semibold">
                  Seed Capture After Selection:
                </span>{' '}
                {(Number(candidate.seed_capture_after ?? 0) * 100).toFixed(1)}%
              </div>
            )}
            {candidate.czi_after !== undefined && (
              <div>
                <span className="font-semibold">
                  Zone CZI After Selection:
                </span>{' '}
                {Number(candidate.czi_after ?? 0).toFixed(4)}
              </div>
            )}
          </>
        )}
      </div>
      <div className="czgen_subpanel_header">
        <p className="czgen_subpanel_title" style={{ fontSize: '13px' }}>
          Top POIs From Current Cluster
        </p>
      </div>
      <div className="czgen_subpanel_body" style={{ padding: '12px 16px' }}>
        {poisLoading ? (
          <div className="text-sm text-gray-500">Loading POI analysis...</div>
        ) : poisError ? (
          <div className="text-sm text-red-700">{poisError}</div>
        ) : pois.length === 0 ? (
          <div className="text-sm text-gray-500">
            No cluster-to-POI flow found for this CBG.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {pois.map((poi) => (
              <div
                key={`${poi.placekey || poi.location_name}-${poi.rank}`}
                className="text-sm leading-snug"
              >
                <div className="font-medium">
                  {poi.rank}. {poi.location_name || 'Unknown POI'}
                </div>
                <div className="text-gray-600">
                  Flow:{' '}
                  {Number(poi.cluster_flow ?? 0).toLocaleString(undefined, {
                    maximumFractionDigits: 1
                  })}{' '}
                  ({Number((poi.flow_share ?? 0) * 100).toFixed(1)}%)
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
