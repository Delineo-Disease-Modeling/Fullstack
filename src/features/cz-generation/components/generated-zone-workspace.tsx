'use client';

import dynamic from 'next/dynamic';
import { CandidateAnalysisPanel } from '@/features/cz-generation/components/candidate-analysis-panel';
import { ConnectedCitiesPanel } from '@/features/cz-generation/components/connected-cities-panel';
import { FrontierCandidatesPanel } from '@/features/cz-generation/components/frontier-candidates-panel';
import { GeneratedActionBar } from '@/features/cz-generation/components/generated-action-bar';
import type { ClusterAlgorithm } from '@/features/cz-generation/constants';
import type {
  ClusterAlgorithmMetadata,
  GuidedDestinationCandidate,
  GuidedSecondOrderMetadata,
  GuidedSelectionStyle,
  GuidedSelectionSummary,
  PoiAnalysis,
  TraceCandidate,
  TraceLayerData,
  TracePayload,
  ZoneMetrics
} from '@/features/cz-generation/types';
import type { GeoJSONData, LatLng } from '@/lib/cz-geo';

const CBGMap = dynamic(() => import('@/components/cbg-map'), { ssr: false });

type GeneratedZoneWorkspaceProps = {
  cbgGeoJSON: GeoJSONData | null;
  selectedCBGs: string[];
  seedCBG: string;
  mapSeedCbgIds: string[];
  seedGuardDistanceKm: number;
  clusterAlgorithm: ClusterAlgorithm;
  activeMapTraceLayer: TraceLayerData | null;
  guidedSelectionStyleByCbg: Map<string, GuidedSelectionStyle> | null;
  manualEditPanelsActive: boolean;
  guidedSelectionMode: boolean;
  focusedTraceCbg: string;
  focusedTraceNonce: number;
  onCBGClick: (cbgId: string, properties: Record<string, unknown>) => void;
  onMapBackgroundClick: (latlng: LatLng) => void;
  onTraceCbgInspect: (cbgId: string) => void;
  guidedSeedLabel: string;
  guidedDestinations: GuidedDestinationCandidate[];
  selectedGuidedDestinationIds: string[];
  guidedSelectedDestinations: GuidedDestinationCandidate[];
  guidedMetadata: GuidedSecondOrderMetadata | null;
  guidedSelectionSummary: GuidedSelectionSummary;
  guidedStyleByUnitId: Map<string, GuidedSelectionStyle>;
  guidedDestinationLoading: boolean;
  guidedDestinationError: string;
  isFinalizing: boolean;
  showGuidedSummaryPanel: boolean;
  onShowGuidedSummary: () => void;
  onHideGuidedSummary: () => void;
  onShowGuidedTermsHelp: () => void;
  onUseRecommendedGuidedDestinations: () => void;
  onSeedOnlyGuidedDestinations: () => void;
  onToggleGuidedDestination: (destination: GuidedDestinationCandidate) => void;
  showCandidatePanels: boolean;
  displayCandidates: TraceCandidate[];
  traceLayer: TraceLayerData | null;
  manualFrontierLoading: boolean;
  manualFrontierError: string;
  selectedTraceCandidateCbg: string;
  onTraceCandidateSelect: (cbgId: string) => void;
  selectedTracePopulation: unknown;
  selectedAnalysisStatus: string;
  selectedAnalysisCandidate: TraceCandidate | null;
  candidatePois: PoiAnalysis[];
  candidatePoiLoading: boolean;
  candidatePoiError: string;
  guidedSelectedDestinationSummary: string;
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
  loading: boolean;
  algorithmMetadata: ClusterAlgorithmMetadata | null;
  zoneEditMode: boolean;
  onEnterZoneEditMode: () => void;
  onEnterTraceView: () => void;
  onSaveHtmlMap: () => void;
  savingHtmlMap: boolean;
  onFinalize: () => void;
  onSeedGuardDistanceChange: (value: number) => void;
};

export function GeneratedZoneWorkspace({
  cbgGeoJSON,
  selectedCBGs,
  seedCBG,
  mapSeedCbgIds,
  seedGuardDistanceKm,
  clusterAlgorithm,
  activeMapTraceLayer,
  guidedSelectionStyleByCbg,
  manualEditPanelsActive,
  guidedSelectionMode,
  focusedTraceCbg,
  focusedTraceNonce,
  onCBGClick,
  onMapBackgroundClick,
  onTraceCbgInspect,
  guidedSeedLabel,
  guidedDestinations,
  selectedGuidedDestinationIds,
  guidedSelectedDestinations,
  guidedMetadata,
  guidedSelectionSummary,
  guidedStyleByUnitId,
  guidedDestinationLoading,
  guidedDestinationError,
  isFinalizing,
  showGuidedSummaryPanel,
  onShowGuidedSummary,
  onHideGuidedSummary,
  onShowGuidedTermsHelp,
  onUseRecommendedGuidedDestinations,
  onSeedOnlyGuidedDestinations,
  onToggleGuidedDestination,
  showCandidatePanels,
  displayCandidates,
  traceLayer,
  manualFrontierLoading,
  manualFrontierError,
  selectedTraceCandidateCbg,
  onTraceCandidateSelect,
  selectedTracePopulation,
  selectedAnalysisStatus,
  selectedAnalysisCandidate,
  candidatePois,
  candidatePoiLoading,
  candidatePoiError,
  guidedSelectedDestinationSummary,
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
  loading,
  algorithmMetadata,
  zoneEditMode,
  onEnterZoneEditMode,
  onEnterTraceView,
  onSaveHtmlMap,
  savingHtmlMap,
  onFinalize,
  onSeedGuardDistanceChange
}: GeneratedZoneWorkspaceProps) {
  return (
    <div className="w-full flex flex-col gap-4">
      <div className="flex gap-4 w-full flex-wrap 2xl:flex-nowrap">
        <div className="czgen_map h-[50vh] min-h-80 max-h-140 lg:h-[calc(100vh-13rem)] lg:min-h-136 lg:max-h-192 relative flex-1 min-w-0 w-full lg:min-w-176">
          {cbgGeoJSON ? (
            <CBGMap
              cbgData={cbgGeoJSON}
              center={null}
              onCBGClick={onCBGClick}
              onMapBackgroundClick={onMapBackgroundClick}
              onTraceCbgInspect={
                manualEditPanelsActive ? null : onTraceCbgInspect
              }
              selectedCBGs={selectedCBGs}
              seedCbgId={seedCBG}
              seedCbgIds={mapSeedCbgIds}
              seedGuardRadiusKm={seedGuardDistanceKm}
              showSeedGuardCircle={
                clusterAlgorithm === 'greedy_weight_seed_guard'
              }
              traceLayer={activeMapTraceLayer}
              selectionStyleByCbg={guidedSelectionStyleByCbg}
              editingEnabled={
                !guidedSelectionMode &&
                (manualEditPanelsActive || !activeMapTraceLayer)
              }
              focusedCbgId={focusedTraceCbg}
              focusNonce={focusedTraceNonce}
            />
          ) : (
            <div className="h-full w-full flex items-center justify-center bg-gray-100 text-gray-500">
              <div className="text-center">
                <p>CBG map not available</p>
                <p className="text-sm">
                  GeoJSON endpoint needed on Algorithms server
                </p>
              </div>
            </div>
          )}
        </div>

        {guidedSelectionMode && (
          <ConnectedCitiesPanel
            seedLabel={guidedSeedLabel}
            destinations={guidedDestinations}
            selectedDestinationIds={selectedGuidedDestinationIds}
            selectedDestinations={guidedSelectedDestinations}
            selectedCbgCount={selectedCBGs.length}
            metadata={guidedMetadata}
            selectionSummary={guidedSelectionSummary}
            styleByUnitId={guidedStyleByUnitId}
            loading={guidedDestinationLoading}
            error={guidedDestinationError}
            isFinalizing={isFinalizing}
            showSummary={showGuidedSummaryPanel}
            onShowSummary={onShowGuidedSummary}
            onHideSummary={onHideGuidedSummary}
            onShowTermsHelp={onShowGuidedTermsHelp}
            onUseRecommended={onUseRecommendedGuidedDestinations}
            onSeedOnly={onSeedOnlyGuidedDestinations}
            onToggleDestination={onToggleGuidedDestination}
          />
        )}

        {showCandidatePanels && (
          <FrontierCandidatesPanel
            candidates={displayCandidates}
            hasTraceLayer={Boolean(traceLayer)}
            loading={manualFrontierLoading}
            error={manualFrontierError}
            selectedCbg={selectedTraceCandidateCbg}
            onSelectCbg={onTraceCandidateSelect}
          />
        )}

        {showCandidatePanels && (
          <CandidateAnalysisPanel
            selectedCbg={selectedTraceCandidateCbg}
            population={selectedTracePopulation}
            status={selectedAnalysisStatus}
            candidate={selectedAnalysisCandidate}
            pois={candidatePois}
            poisLoading={candidatePoiLoading}
            poisError={candidatePoiError}
          />
        )}
      </div>

      <GeneratedActionBar
        guidedSelectionMode={guidedSelectionMode}
        selectedGuidedDestinationCount={selectedGuidedDestinationIds.length}
        selectedCbgCount={selectedCBGs.length}
        guidedSelectedDestinationSummary={guidedSelectedDestinationSummary}
        guidedSelectionSummary={guidedSelectionSummary}
        mobilityPruneMetadata={mobilityPruneMetadata}
        totalPopulation={totalPopulation}
        showTraceControls={showTraceControls}
        growthTrace={growthTrace}
        traceStepCount={traceStepCount}
        traceEnabled={traceEnabled}
        traceStepIndex={traceStepIndex}
        maxTraceStep={maxTraceStep}
        onTraceEnabledChange={onTraceEnabledChange}
        onJumpTraceStep={onJumpTraceStep}
        zoneMetricsLoading={zoneMetricsLoading}
        zoneMetricsError={zoneMetricsError}
        zoneMetrics={zoneMetrics}
        clusterAlgorithm={clusterAlgorithm}
        manualEditPanelsActive={manualEditPanelsActive}
        seedGuardDistanceKm={seedGuardDistanceKm}
        onSeedGuardDistanceChange={onSeedGuardDistanceChange}
        loading={loading}
        isFinalizing={isFinalizing}
        algorithmMetadata={algorithmMetadata}
        zoneEditMode={zoneEditMode}
        onEnterZoneEditMode={onEnterZoneEditMode}
        onEnterTraceView={onEnterTraceView}
        onSaveHtmlMap={onSaveHtmlMap}
        savingHtmlMap={savingHtmlMap}
        onFinalize={onFinalize}
      />
    </div>
  );
}
