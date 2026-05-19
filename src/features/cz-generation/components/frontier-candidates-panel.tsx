'use client';

import type { TraceCandidate } from '@/features/cz-generation/types';
import { normalizeCbgId } from '@/lib/cz-geo';

type FrontierCandidatesPanelProps = {
  candidates: TraceCandidate[];
  hasTraceLayer: boolean;
  loading: boolean;
  error: string;
  selectedCbg: string;
  onSelectCbg: (cbgId: string) => void;
};

export function FrontierCandidatesPanel({
  candidates,
  hasTraceLayer,
  loading,
  error,
  selectedCbg,
  onSelectCbg
}: FrontierCandidatesPanelProps) {
  return (
    <div className="czgen_subpanel h-[calc(100vh-13rem)] min-h-136 max-h-192 w-88 max-w-88">
      <div className="czgen_subpanel_header">
        <p className="czgen_subpanel_title">
          Frontier Candidates ({candidates.length})
        </p>
      </div>
      <div className="czgen_subpanel_body">
        {!hasTraceLayer && loading ? (
          <div className="text-sm text-gray-500 px-2 py-2">
            Loading frontier candidates...
          </div>
        ) : !hasTraceLayer && error ? (
          <div className="text-sm text-red-700 px-2 py-2">{error}</div>
        ) : candidates.length === 0 ? (
          <div className="text-sm text-gray-500 px-2 py-2">
            {hasTraceLayer
              ? 'No candidates at this step.'
              : 'No frontier candidates for the current zone.'}
          </div>
        ) : (
          candidates.map((candidate) => {
            const cbgId = normalizeCbgId(candidate?.cbg);
            const isActive = cbgId === normalizeCbgId(selectedCbg);

            return (
              <button
                type="button"
                key={cbgId}
                className={`text-left px-4 py-4 rounded border transition-colors ${
                  isActive
                    ? 'bg-[#e0f2fe] border-[#0284c7]'
                    : 'bg-white border-[#d1d5db] hover:border-[#70B4D4]'
                }`}
                onClick={() => onSelectCbg(cbgId)}
              >
                <div className="text-base font-semibold leading-tight">
                  #{candidate.rank ?? '?'} {cbgId}
                </div>
                <div className="text-base text-gray-700 mt-1">
                  Score: {Number(candidate.score ?? 0).toFixed(4)}
                </div>
                <div className="text-base text-gray-600">
                  To cluster:{' '}
                  {Number(candidate.movement_to_cluster ?? 0).toLocaleString(
                    undefined,
                    {
                      maximumFractionDigits: 1
                    }
                  )}
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
