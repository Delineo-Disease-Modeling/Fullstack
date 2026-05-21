'use client';

import {
  GUIDED_HARD_EXPLICIT_POPULATION,
  GUIDED_SOFT_EXPLICIT_POPULATION,
  type ClusterAlgorithm
} from '@/features/cz-generation/constants';
import type {
  ClusterAlgorithmMetadata,
  GuidedSelectionSummary,
  TracePayload,
  ZoneMetrics
} from '@/features/cz-generation/types';

type GeneratedActionBarProps = {
  guidedSelectionMode: boolean;
  selectedGuidedDestinationCount: number;
  selectedCbgCount: number;
  guidedSelectedDestinationSummary: string;
  guidedSelectionSummary: GuidedSelectionSummary;
  mobilityPruneMetadata: ClusterAlgorithmMetadata | null;
  totalPopulation: number;
  showTraceControls: boolean;
  growthTrace: TracePayload | null;
  traceStepCount: number;
  traceEnabled: boolean;
  traceStepIndex: number;
  maxTraceStep: number;
  onTraceEnabledChange: (enabled: boolean) => void;
  onJumpTraceStep: (index: number) => void;
  zoneMetricsLoading: boolean;
  zoneMetricsError: string;
  zoneMetrics: ZoneMetrics | null;
  clusterAlgorithm: ClusterAlgorithm;
  manualEditPanelsActive: boolean;
  seedGuardDistanceKm: number;
  onSeedGuardDistanceChange: (value: number) => void;
  loading: boolean;
  isFinalizing: boolean;
  algorithmMetadata: ClusterAlgorithmMetadata | null;
  zoneEditMode: boolean;
  onEnterZoneEditMode: () => void;
  onEnterTraceView: () => void;
  onSaveHtmlMap: () => void;
  savingHtmlMap: boolean;
  onFinalize: () => void;
};

export function GeneratedActionBar({
  guidedSelectionMode,
  selectedGuidedDestinationCount,
  selectedCbgCount,
  guidedSelectedDestinationSummary,
  guidedSelectionSummary,
  mobilityPruneMetadata,
  totalPopulation,
  showTraceControls,
  growthTrace,
  traceStepCount,
  traceEnabled,
  traceStepIndex,
  maxTraceStep,
  onTraceEnabledChange,
  onJumpTraceStep,
  zoneMetricsLoading,
  zoneMetricsError,
  zoneMetrics,
  clusterAlgorithm,
  manualEditPanelsActive,
  seedGuardDistanceKm,
  onSeedGuardDistanceChange,
  loading,
  isFinalizing,
  algorithmMetadata,
  zoneEditMode,
  onEnterZoneEditMode,
  onEnterTraceView,
  onSaveHtmlMap,
  savingHtmlMap,
  onFinalize
}: GeneratedActionBarProps) {
  return (
    <div
      className={`czgen_actionbar ${
        guidedSelectionMode
          ? 'flex-col xl:flex-row xl:items-start xl:justify-between'
          : 'items-start justify-between'
      }`}
    >
      {guidedSelectionMode ? (
        <GuidedActionSummary
          selectedGuidedDestinationCount={selectedGuidedDestinationCount}
          selectedCbgCount={selectedCbgCount}
          guidedSelectedDestinationSummary={guidedSelectedDestinationSummary}
          guidedSelectionSummary={guidedSelectionSummary}
        />
      ) : (
        <>
          <div>
            {mobilityPruneMetadata ? (
              <MobilityPruneSummary
                metadata={mobilityPruneMetadata}
                selectedCbgCount={selectedCbgCount}
                totalPopulation={totalPopulation}
                showTraceControls={showTraceControls}
                growthTrace={growthTrace}
                traceStepCount={traceStepCount}
                traceEnabled={traceEnabled}
                traceStepIndex={traceStepIndex}
                maxTraceStep={maxTraceStep}
                onTraceEnabledChange={onTraceEnabledChange}
                onJumpTraceStep={onJumpTraceStep}
              />
            ) : showTraceControls ? (
              <TraceControls
                title="Trace Controls"
                checkboxLabel="Show frontier heat map"
                growthTrace={growthTrace}
                traceStepCount={traceStepCount}
                traceEnabled={traceEnabled}
                traceStepIndex={traceStepIndex}
                maxTraceStep={maxTraceStep}
                requireTraceEnabledForStepButtons={true}
                onTraceEnabledChange={onTraceEnabledChange}
                onJumpTraceStep={onJumpTraceStep}
              />
            ) : (
              <ZoneMetricsSummary
                loading={zoneMetricsLoading}
                error={zoneMetricsError}
                metrics={zoneMetrics}
                selectedCbgCount={selectedCbgCount}
              />
            )}
          </div>

          {clusterAlgorithm === 'greedy_weight_seed_guard' &&
            manualEditPanelsActive && (
              <div className="min-w-[15rem] max-w-[18rem] flex flex-col gap-1">
                <label
                  htmlFor="seed_guard_distance_live"
                  className="text-sm font-semibold"
                >
                  Seed Guard Radius (km)
                </label>
                <input
                  id="seed_guard_distance_live"
                  className="formfield"
                  type="number"
                  min={0}
                  max={500}
                  value={seedGuardDistanceKm}
                  onChange={(event) =>
                    onSeedGuardDistanceChange(Number(event.target.value))
                  }
                  disabled={loading || isFinalizing}
                />
                <div className="text-xs text-gray-600">
                  Blue ring shows the seed guard radius and updates live as you
                  change it.
                </div>
              </div>
            )}

          {algorithmMetadata && !algorithmMetadata.bounded_envelope && (
            <HierarchySummary metadata={algorithmMetadata} />
          )}
        </>
      )}

      <div
        className={`flex flex-wrap items-center gap-2 ${
          guidedSelectionMode ? 'xl:justify-end' : ''
        }`}
      >
        {growthTrace && !zoneEditMode && (
          <button
            type="button"
            onClick={onEnterZoneEditMode}
            disabled={loading || isFinalizing}
            className="czgen_btn"
          >
            Edit Zone
          </button>
        )}
        {growthTrace && zoneEditMode && (
          <button
            type="button"
            onClick={onEnterTraceView}
            disabled={loading || isFinalizing}
            className="czgen_btn"
          >
            Trace View
          </button>
        )}
        <button
          type="button"
          onClick={onSaveHtmlMap}
          disabled={loading || isFinalizing || savingHtmlMap}
          className="czgen_btn"
        >
          {savingHtmlMap ? 'Saving HTML Map...' : 'Save HTML Map'}
        </button>
        <button
          type="button"
          onClick={onFinalize}
          disabled={
            loading ||
            isFinalizing ||
            (guidedSelectionMode &&
              guidedSelectionSummary.selectedPopulation >
                GUIDED_HARD_EXPLICIT_POPULATION)
          }
          className="czgen_btn czgen_btn--primary"
        >
          {isFinalizing ? 'Generating Patterns...' : 'Finalize & Generate'}
        </button>
      </div>
    </div>
  );
}

type GuidedActionSummaryProps = {
  selectedGuidedDestinationCount: number;
  selectedCbgCount: number;
  guidedSelectedDestinationSummary: string;
  guidedSelectionSummary: GuidedSelectionSummary;
};

function GuidedActionSummary({
  selectedGuidedDestinationCount,
  selectedCbgCount,
  guidedSelectedDestinationSummary,
  guidedSelectionSummary
}: GuidedActionSummaryProps) {
  return (
    <div className="min-w-0 flex-1">
      <div className="text-sm font-semibold text-[#1f2937]">
        Ready to Generate
      </div>
      <div className="mt-1 text-sm text-gray-700">
        {selectedGuidedDestinationCount
          ? `Selected ${selectedGuidedDestinationCount} cities and ${selectedCbgCount} linked CBGs: ${guidedSelectedDestinationSummary}.`
          : `Seed only is selected right now. The explicit layer contains ${selectedCbgCount} seed CBGs.`}
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-xs text-gray-700">
        <div className="rounded-full border border-[#dbeafe] bg-white px-3 py-1">
          <span className="font-semibold text-[#1f2937]">
            Trips Leaving Seed Captured (linked CBGs):
          </span>{' '}
          {(
            guidedSelectionSummary.selectedLinkedOutboundShare * 100
          ).toFixed(1)}
          %
        </div>
        <div className="rounded-full border border-[#dbeafe] bg-white px-3 py-1">
          <span className="font-semibold text-[#1f2937]">Explicit Pop:</span>{' '}
          {Number(
            guidedSelectionSummary.selectedPopulation ?? 0
          ).toLocaleString()}
        </div>
      </div>
      {guidedSelectionSummary.selectedPopulation >
      GUIDED_HARD_EXPLICIT_POPULATION ? (
        <div className="mt-3 text-xs text-red-700">
          Finalize is disabled above{' '}
          {GUIDED_HARD_EXPLICIT_POPULATION.toLocaleString()} explicit residents.
        </div>
      ) : guidedSelectionSummary.selectedPopulation >
        GUIDED_SOFT_EXPLICIT_POPULATION ? (
        <div className="mt-3 text-xs text-amber-700">
          This selection is above the preferred explicit-population band of{' '}
          {GUIDED_SOFT_EXPLICIT_POPULATION.toLocaleString()}.
        </div>
      ) : (
        <div className="mt-3 text-xs text-gray-600">
          Choose connected cities on the right. The map updates as you change
          the explicit linked CBG layer.
        </div>
      )}
    </div>
  );
}

type MobilityPruneSummaryProps = {
  metadata: ClusterAlgorithmMetadata;
  selectedCbgCount: number;
  totalPopulation: number;
  showTraceControls: boolean;
  growthTrace: TracePayload | null;
  traceStepCount: number;
  traceEnabled: boolean;
  traceStepIndex: number;
  maxTraceStep: number;
  onTraceEnabledChange: (enabled: boolean) => void;
  onJumpTraceStep: (index: number) => void;
};

function MobilityPruneSummary({
  metadata,
  selectedCbgCount,
  totalPopulation,
  showTraceControls,
  growthTrace,
  traceStepCount,
  traceEnabled,
  traceStepIndex,
  maxTraceStep,
  onTraceEnabledChange,
  onJumpTraceStep
}: MobilityPruneSummaryProps) {
  return (
    <>
      <div className="text-sm font-semibold mb-2">Mobility Prune Summary</div>
      <div className="flex flex-wrap gap-2 text-xs text-gray-700">
        <div className="rounded-full border border-[#dbeafe] bg-white px-3 py-1">
          <span className="font-semibold text-[#1f2937]">Final Zone:</span>{' '}
          {selectedCbgCount} CBGs, pop{' '}
          {Number(totalPopulation || 0).toLocaleString()}
        </div>
        <div className="rounded-full border border-[#dbeafe] bg-white px-3 py-1">
          <span className="font-semibold text-[#1f2937]">Seed Pop:</span>{' '}
          {Number(metadata.seed_population ?? 0).toLocaleString()}
        </div>
        <div className="rounded-full border border-[#dbeafe] bg-white px-3 py-1">
          <span className="font-semibold text-[#1f2937]">Envelope:</span>{' '}
          {Number(metadata.initial_cbg_count ?? 0).toLocaleString()} CBGs, pop{' '}
          {Number(metadata.initial_population ?? 0).toLocaleString()}
        </div>
        <div className="rounded-full border border-[#dbeafe] bg-white px-3 py-1">
          <span className="font-semibold text-[#1f2937]">
            Envelope Target:
          </span>{' '}
          {Number(metadata.envelope_population_target ?? 0).toLocaleString()}
        </div>
        <div className="rounded-full border border-[#dbeafe] bg-white px-3 py-1">
          <span className="font-semibold text-[#1f2937]">Pruned:</span>{' '}
          {Number(metadata.removed_cbg_count ?? 0).toLocaleString()} CBGs, pop{' '}
          {Number(metadata.population_reduced ?? 0).toLocaleString()}
        </div>
        <div className="rounded-full border border-[#dbeafe] bg-white px-3 py-1">
          <span className="font-semibold text-[#1f2937]">
            Minimum Seed Capture:
          </span>{' '}
          {Number((metadata.min_seed_capture ?? 0) * 100).toFixed(0)}%
        </div>
        <div className="rounded-full border border-[#dbeafe] bg-white px-3 py-1">
          <span className="font-semibold text-[#1f2937]">Seed Capture:</span>{' '}
          {Number((metadata.final_seed_capture_share ?? 0) * 100).toFixed(1)}%
        </div>
      </div>
      {showTraceControls &&
        growthTrace?.supports_stepwise &&
        traceStepCount > 0 && (
          <div className="mt-3 border-t border-[#dbeafe] pt-3">
            <TraceControls
              checkboxLabel="Show pruning trace heat map"
              growthTrace={growthTrace}
              traceStepCount={traceStepCount}
              traceEnabled={traceEnabled}
              traceStepIndex={traceStepIndex}
              maxTraceStep={maxTraceStep}
              onTraceEnabledChange={onTraceEnabledChange}
              onJumpTraceStep={onJumpTraceStep}
            />
          </div>
        )}
    </>
  );
}

type TraceControlsProps = {
  title?: string;
  checkboxLabel: string;
  growthTrace: TracePayload | null;
  traceStepCount: number;
  traceEnabled: boolean;
  traceStepIndex: number;
  maxTraceStep: number;
  requireTraceEnabledForStepButtons?: boolean;
  onTraceEnabledChange: (enabled: boolean) => void;
  onJumpTraceStep: (index: number) => void;
};

function TraceControls({
  title,
  checkboxLabel,
  growthTrace,
  traceStepCount,
  traceEnabled,
  traceStepIndex,
  maxTraceStep,
  requireTraceEnabledForStepButtons = false,
  onTraceEnabledChange,
  onJumpTraceStep
}: TraceControlsProps) {
  if (!growthTrace?.supports_stepwise || traceStepCount === 0) {
    return (
      <>
        {title && <div className="text-sm font-semibold mb-2">{title}</div>}
        <div className="text-xs text-gray-600">
          {growthTrace?.note ||
            'This algorithm does not expose a step-by-step greedy expansion trace.'}
        </div>
      </>
    );
  }

  return (
    <>
      {title && <div className="text-sm font-semibold mb-2">{title}</div>}
      <label
        className={`flex items-center gap-2 text-xs ${
          title ? 'mb-2' : ''
        }`}
      >
        <input
          type="checkbox"
          checked={traceEnabled}
          onChange={(event) => onTraceEnabledChange(event.target.checked)}
        />
        {checkboxLabel}
      </label>
      {traceEnabled && !requireTraceEnabledForStepButtons && (
        <>
          <TraceStepIndicator
            traceStepIndex={traceStepIndex}
            maxTraceStep={maxTraceStep}
            traceStepCount={traceStepCount}
          />
          <TraceStepButtons
            traceEnabled={traceEnabled}
            traceStepIndex={traceStepIndex}
            maxTraceStep={maxTraceStep}
            requireTraceEnabled={requireTraceEnabledForStepButtons}
            onJumpTraceStep={onJumpTraceStep}
          />
        </>
      )}
      {requireTraceEnabledForStepButtons && (
        <>
          <TraceStepIndicator
            traceStepIndex={traceStepIndex}
            maxTraceStep={maxTraceStep}
            traceStepCount={traceStepCount}
          />
          <TraceStepButtons
            traceEnabled={traceEnabled}
            traceStepIndex={traceStepIndex}
            maxTraceStep={maxTraceStep}
            requireTraceEnabled={requireTraceEnabledForStepButtons}
            onJumpTraceStep={onJumpTraceStep}
          />
        </>
      )}
    </>
  );
}

type TraceStepIndicatorProps = {
  traceStepIndex: number;
  maxTraceStep: number;
  traceStepCount: number;
};

function TraceStepIndicator({
  traceStepIndex,
  maxTraceStep,
  traceStepCount
}: TraceStepIndicatorProps) {
  return (
    <div className="mt-2 text-xs text-gray-600">
      Step {Math.min(traceStepIndex, maxTraceStep) + 1} of {traceStepCount}
    </div>
  );
}

type TraceStepButtonsProps = {
  traceEnabled: boolean;
  traceStepIndex: number;
  maxTraceStep: number;
  requireTraceEnabled: boolean;
  onJumpTraceStep: (index: number) => void;
};

function TraceStepButtons({
  traceEnabled,
  traceStepIndex,
  maxTraceStep,
  requireTraceEnabled,
  onJumpTraceStep
}: TraceStepButtonsProps) {
  return (
    <div className="mt-2 flex gap-2">
      <button
        type="button"
        className="czgen_btn czgen_btn--sm"
        disabled={
          (requireTraceEnabled && !traceEnabled) || traceStepIndex <= 0
        }
        onClick={() => onJumpTraceStep(traceStepIndex - 1)}
      >
        Previous Step
      </button>
      <button
        type="button"
        className="czgen_btn czgen_btn--sm"
        disabled={
          (requireTraceEnabled && !traceEnabled) ||
          traceStepIndex >= maxTraceStep
        }
        onClick={() => onJumpTraceStep(traceStepIndex + 1)}
      >
        Next Step
      </button>
    </div>
  );
}

type ZoneMetricsSummaryProps = {
  loading: boolean;
  error: string;
  metrics: ZoneMetrics | null;
  selectedCbgCount: number;
};

function ZoneMetricsSummary({
  loading,
  error,
  metrics,
  selectedCbgCount
}: ZoneMetricsSummaryProps) {
  if (loading) {
    return (
      <>
        <div className="text-sm font-semibold mb-2">Zone Metrics (Live)</div>
        <div className="text-xs text-gray-600">Computing CZI...</div>
      </>
    );
  }

  if (error) {
    return (
      <>
        <div className="text-sm font-semibold mb-2">Zone Metrics (Live)</div>
        <div className="text-xs text-red-700">{error}</div>
      </>
    );
  }

  if (!metrics) {
    return (
      <>
        <div className="text-sm font-semibold mb-2">Zone Metrics (Live)</div>
        <div className="text-xs text-gray-600">No metrics available.</div>
      </>
    );
  }

  return (
    <>
      <div className="text-sm font-semibold mb-2">Zone Metrics (Live)</div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-700">
        <div>
          <span className="font-semibold">CBGs:</span>{' '}
          {metrics.cbg_count ?? selectedCbgCount}
        </div>
        <div>
          <span className="font-semibold">CZI:</span>{' '}
          {Number(metrics.czi ?? 0).toFixed(4)}
        </div>
        <div>
          <span className="font-semibold">Inside:</span>{' '}
          {Number(metrics.movement_inside ?? 0).toLocaleString(undefined, {
            maximumFractionDigits: 1
          })}
        </div>
        <div>
          <span className="font-semibold">Boundary:</span>{' '}
          {Number(metrics.movement_boundary ?? 0).toLocaleString(undefined, {
            maximumFractionDigits: 1
          })}
        </div>
      </div>
      <div className="mt-1 text-xs text-gray-600">
        Click CBGs on the map to add or remove them. Frontier candidates update
        automatically.
      </div>
    </>
  );
}

type HierarchySummaryProps = {
  metadata: ClusterAlgorithmMetadata;
};

function HierarchySummary({ metadata }: HierarchySummaryProps) {
  return (
    <div className="min-w-[16rem] max-w-[22rem] flex flex-col gap-1 text-xs text-gray-700">
      <div className="text-sm font-semibold text-[#1f2937]">
        Hierarchy Summary
      </div>
      <div>
        <span className="font-semibold">Seed:</span>{' '}
        {metadata.seed_zip_codes?.length
          ? metadata.seed_zip_codes.join(', ')
          : `${metadata.seed_cbgs?.length ?? 0} seed CBGs`}
      </div>
      <div>
        <span className="font-semibold">Core:</span>{' '}
        {metadata.core_cluster?.length ?? 0} CBGs
        {metadata.core_population !== undefined
          ? `, pop ${Number(metadata.core_population).toLocaleString()}`
          : ''}
      </div>
      <div>
        <span className="font-semibold">Satellites:</span>{' '}
        {metadata.selected_satellites?.length ?? 0}
      </div>
      {metadata.selected_satellites &&
        metadata.selected_satellites.length > 0 && (
          <div>
            <span className="font-semibold">Selected:</span>{' '}
            {metadata.selected_satellites
              .map((item) => item.label || item.unit_id || 'Unknown')
              .join(', ')}
          </div>
        )}
      {metadata.external_pressure_share !== undefined && (
        <div>
          <span className="font-semibold">External Pressure:</span>{' '}
          {Number((metadata.external_pressure_share ?? 0) * 100).toFixed(1)}%
        </div>
      )}
      {metadata.population_target_met !== undefined && (
        <div>
          <span className="font-semibold">Population Target:</span>{' '}
          {metadata.population_target_met ? 'Met' : 'Not met'}
        </div>
      )}
    </div>
  );
}
