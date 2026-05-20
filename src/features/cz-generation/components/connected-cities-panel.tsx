'use client';

import {
  GUIDED_HARD_EXPLICIT_POPULATION,
  GUIDED_SEED_STYLE,
  GUIDED_SOFT_EXPLICIT_POPULATION
} from '@/features/cz-generation/constants';
import type {
  GuidedDestinationCandidate,
  GuidedSecondOrderMetadata,
  GuidedSelectionSummary,
  GuidedSelectionStyle
} from '@/features/cz-generation/types';

type ConnectedCitiesPanelProps = {
  seedLabel: string;
  destinations: GuidedDestinationCandidate[];
  selectedDestinationIds: string[];
  selectedDestinations: GuidedDestinationCandidate[];
  selectedCbgCount: number;
  metadata: GuidedSecondOrderMetadata | null;
  selectionSummary: GuidedSelectionSummary;
  styleByUnitId: Map<string, GuidedSelectionStyle>;
  loading: boolean;
  error: string;
  isFinalizing: boolean;
  showSummary: boolean;
  onShowSummary: () => void;
  onHideSummary: () => void;
  onShowTermsHelp: () => void;
  onUseRecommended: () => void;
  onSeedOnly: () => void;
  onToggleDestination: (destination: GuidedDestinationCandidate) => void;
};

export function ConnectedCitiesPanel({
  seedLabel,
  destinations,
  selectedDestinationIds,
  selectedDestinations,
  selectedCbgCount,
  metadata,
  selectionSummary,
  styleByUnitId,
  loading,
  error,
  isFinalizing,
  showSummary,
  onShowSummary,
  onHideSummary,
  onShowTermsHelp,
  onUseRecommended,
  onSeedOnly,
  onToggleDestination
}: ConnectedCitiesPanelProps) {
  return (
    <div className="czgen_subpanel relative h-[calc(100vh-13rem)] min-h-[34rem] max-h-[48rem] w-[25rem] max-w-[25rem]">
      <div className="czgen_subpanel_header">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="czgen_subpanel_title">Connected Cities</p>
            <p className="czgen_subpanel_subtitle">
              Choose the connected cities whose linked CBGs should stay explicit
              in the simulation.
            </p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onShowSummary}
            className="czgen_btn czgen_btn--sm"
          >
            Selection Summary
          </button>
          <button
            type="button"
            onClick={onShowTermsHelp}
            className="czgen_btn czgen_btn--sm shrink-0"
          >
            How Ranking Works
          </button>
        </div>
        <div
          className="mt-3 text-xs"
          style={{ color: 'var(--color-text-muted)' }}
        >
          <span
            className="font-semibold"
            style={{ color: 'var(--color-text-main)' }}
          >
            Seed:
          </span>{' '}
          {seedLabel}
        </div>
      </div>
      <div className="czgen_subpanel_divider">
        <button
          type="button"
          onClick={onUseRecommended}
          disabled={loading || isFinalizing}
          className="czgen_btn czgen_btn--sm czgen_btn--primary"
        >
          Use Recommended
        </button>
        <button
          type="button"
          onClick={onSeedOnly}
          disabled={loading || isFinalizing}
          className="czgen_btn czgen_btn--sm"
        >
          Seed Only
        </button>
        <div
          className="w-full text-xs"
          style={{ color: 'var(--color-text-muted)' }}
        >
          {destinations.length} ranked cities. Click a city to include or
          remove its linked CBGs.
        </div>
      </div>
      <div className="czgen_subpanel_body">
        {loading ? (
          <div className="text-sm text-gray-500 px-2 py-2">
            Loading connected cities and linked CBGs...
          </div>
        ) : error ? (
          <div className="text-sm text-red-700 px-2 py-2">{error}</div>
        ) : destinations.length === 0 ? (
          <div className="text-sm text-gray-500 px-2 py-2">
            No significant outbound cities were found for this seed.
          </div>
        ) : (
          destinations.map((destination, index) => {
            const isSelected = selectedDestinationIds.includes(
              destination.unit_id
            );
            const style =
              styleByUnitId.get(destination.unit_id) || GUIDED_SEED_STYLE;

            return (
              <button
                type="button"
                key={destination.unit_id}
                className={`text-left px-3.5 py-3 rounded border transition-colors ${
                  isSelected
                    ? 'bg-[#e0f2fe] border-[#0284c7]'
                    : 'bg-white border-[#d1d5db] hover:border-[#70B4D4]'
                }`}
                onClick={() => onToggleDestination(destination)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2 text-base font-semibold leading-tight">
                    <span
                      className="inline-block h-3 w-3 rounded-full border"
                      style={{
                        backgroundColor: style.fillColor,
                        borderColor: style.lineColor
                      }}
                    />
                    <span>
                      #{index + 1} {destination.label}
                    </span>
                  </div>
                  {destination.recommended && (
                    <span className="rounded-full bg-[#dbeafe] px-2 py-0.5 text-[11px] font-semibold text-[#1d4ed8]">
                      Recommended
                    </span>
                  )}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs text-gray-600">
                  <div>
                    <div className="font-semibold text-[#1f2937]">
                      Connection
                    </div>
                    <div>{Number(destination.coupling ?? 0).toFixed(3)}</div>
                  </div>
                  <div>
                    <div className="font-semibold text-[#1f2937]">
                      Trips Leaving Seed
                    </div>
                    <div>
                      {Number(
                        (destination.share_of_seed_external_outbound ?? 0) *
                          100
                      ).toFixed(1)}
                      %
                    </div>
                  </div>
                  <div>
                    <div className="font-semibold text-[#1f2937]">
                      Linked CBGs
                    </div>
                    <div>
                      {Number(
                        destination.cbg_count ?? destination.cbgs.length
                      ).toLocaleString()}
                    </div>
                  </div>
                  <div>
                    <div className="font-semibold text-[#1f2937]">
                      Added Population
                    </div>
                    <div>
                      {Number(destination.population ?? 0).toLocaleString()}
                    </div>
                  </div>
                </div>
                <div className="mt-3 text-xs text-gray-500">
                  Linked CBG layer captures{' '}
                  {Number(
                    (destination.captured_bidirectional_flow_share ?? 0) * 100
                  ).toFixed(1)}
                  % of this city&apos;s two-way seed connection.
                </div>
              </button>
            );
          })
        )}
      </div>
      <div
        className={`absolute inset-0 z-20 transition-transform duration-200 ease-out ${
          showSummary ? 'translate-x-0' : 'translate-x-full pointer-events-none'
        }`}
        style={{ background: 'var(--color-bg-ivory)' }}
        aria-hidden={!showSummary}
      >
        <div className="flex h-full flex-col">
          <div className="czgen_subpanel_header flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="czgen_subpanel_title">Selection Summary</p>
              <p className="czgen_subpanel_subtitle">
                Guided metrics and the current explicit-zone summary.
              </p>
            </div>
            <button
              type="button"
              onClick={onHideSummary}
              className="czgen_btn czgen_btn--sm shrink-0"
            >
              Close
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-4">
            <div className="rounded-lg border border-[#dbeafe] bg-[#f8fbff] px-3 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#2563eb]">
                Seed Region
              </div>
              <div className="mt-1 text-sm font-semibold text-[#1f2937]">
                {seedLabel}
              </div>
              {metadata?.approximation_note && (
                <div className="mt-1 text-xs text-gray-600">
                  {metadata.approximation_note}
                </div>
              )}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-[#dbeafe] bg-white px-3 py-2">
                <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#2563eb]">
                  Selected
                </div>
                <div className="mt-1 text-lg font-semibold text-[#1f2937]">
                  {selectedDestinationIds.length}
                </div>
                <div className="text-xs text-gray-500">cities</div>
              </div>
              <div className="rounded-lg border border-[#dbeafe] bg-white px-3 py-2">
                <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#2563eb]">
                  Linked CBGs
                </div>
                <div className="mt-1 text-lg font-semibold text-[#1f2937]">
                  {selectedCbgCount}
                </div>
                <div className="text-xs text-gray-500">explicit units</div>
              </div>
              <div className="rounded-lg border border-[#dbeafe] bg-white px-3 py-2">
                <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#2563eb]">
                  Explicit Pop
                </div>
                <div className="mt-1 text-lg font-semibold text-[#1f2937]">
                  {Number(
                    selectionSummary.selectedPopulation || 0
                  ).toLocaleString()}
                </div>
                <div className="text-xs text-gray-500">residents</div>
              </div>
              <div className="rounded-lg border border-[#dbeafe] bg-white px-3 py-2">
                <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#2563eb]">
                  Trips Leaving Seed Captured
                </div>
                <div className="mt-1 text-lg font-semibold text-[#1f2937]">
                  {(
                    selectionSummary.selectedLinkedOutboundShare * 100
                  ).toFixed(1)}
                  %
                </div>
                <div className="text-xs text-gray-500">linked subset</div>
              </div>
              <div className="rounded-lg border border-[#dbeafe] bg-white px-3 py-2">
                <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#2563eb]">
                  Seed Movement
                </div>
                <div className="mt-1 text-lg font-semibold text-[#1f2937]">
                  {(selectionSummary.selectedSeedMovementShare * 100).toFixed(
                    1
                  )}
                  %
                </div>
                <div className="text-xs text-gray-500">represented</div>
              </div>
            </div>
            <div className="mt-4 rounded-lg border border-[#e5e7eb] bg-white px-3 py-3 text-xs text-gray-700">
              <div className="font-semibold text-[#1f2937]">
                Selected Cities
              </div>
              <div className="mt-1">
                {selectedDestinations.length
                  ? selectedDestinations
                      .map((destination) => destination.label)
                      .join(', ')
                  : 'Seed only'}
              </div>
            </div>
            <div className="mt-3 rounded-lg border border-[#e5e7eb] bg-white px-3 py-3 text-xs text-gray-700">
              <span className="font-semibold text-[#1f2937]">
                Outside connections not modeled explicitly:
              </span>{' '}
              {(selectionSummary.externalRemainderShare * 100).toFixed(1)}%
            </div>
            {selectionSummary.selectedPopulation >
              GUIDED_SOFT_EXPLICIT_POPULATION && (
              <div className="mt-3 text-xs text-amber-700">
                This selection is above the preferred explicit-population band
                of {GUIDED_SOFT_EXPLICIT_POPULATION.toLocaleString()}.
              </div>
            )}
            {selectionSummary.selectedPopulation >
              GUIDED_HARD_EXPLICIT_POPULATION && (
              <div className="mt-1 text-xs text-red-700">
                Finalize is disabled above{' '}
                {GUIDED_HARD_EXPLICIT_POPULATION.toLocaleString()} explicit
                residents.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
