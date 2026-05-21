'use client';

import { Info } from 'lucide-react';
import type { ChangeEvent, ChangeEventHandler } from 'react';
import {
  CLUSTER_ALGORITHM_OPTIONS,
  type ClusterAlgorithm
} from '@/features/cz-generation/constants';
import {
  endDateFromMonth,
  formatMonthLabel,
  monthFromDate,
  monthFromEndDate,
  startDateFromMonth
} from '@/features/cz-generation/helpers';
import type { SeedEditAction } from '@/features/cz-generation/types';

type FormFieldProps = {
  label: string;
  name: string;
  type: 'text' | 'number' | 'date' | 'textarea' | 'select';
  placeholder?: string;
  disabled?: boolean;
  value?: string | number;
  onChange?: (
    event: ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >
  ) => void;
  min?: number | string;
  max?: number | string;
  options?: Array<{ value: string; label: string }>;
  required?: boolean;
};

type SeedAdjustmentSummary = {
  addedCount: number;
  removedCount: number;
  hasChanges: boolean;
};

type SetupSeedPanelProps = {
  location: string;
  onLocationChange: (value: string) => void;
  loading: boolean;
  resolvingSeed: boolean;
  seedEditLoading: boolean;
  onResolveSeedPreview: () => void;
  isTestLocationInput: boolean;
  clusterAlgorithm: ClusterAlgorithm;
  onClusterAlgorithmChange: (algorithm: ClusterAlgorithm) => void;
  onShowAlgorithmGuide: () => void;
  mobilityPruneMinSeedCapturePct: number;
  onMobilityPruneMinSeedCapturePctChange: (value: number) => void;
  isGuidedSecondOrderAlgorithm: boolean;
  minPop: number;
  onMinPopChange: (value: number) => void;
  monthOptions: string[];
  availableMonthsLoading: boolean;
  detectedStateAbbr: string | null;
  startDate: string;
  endDate: string;
  onStartDateChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
  description: string;
  onDescriptionChange: (value: string) => void;
  setupSeedCbg: string;
  setupSeedLabel: string;
  setupSeedCount: number;
  setupResolvedCityName: string;
  seedGuardDistanceKm: number;
  seedAdjustmentSummary: SeedAdjustmentSummary;
  seedEditMode: boolean;
  seedEditAction: SeedEditAction;
  onSeedEditActionChange: (action: SeedEditAction) => void;
  onFinishSeedEdit: () => void;
  onCancelSeedEdit: () => void;
  onShowMoreSeedEditNeighbors: () => void;
  onBeginSeedEdit: () => void;
  onResetAdjustedSeed: () => void;
  seedEditError: string;
  seedResolveError: string;
  showAdvancedClustering: boolean;
  onToggleAdvancedClustering: () => void;
  onSeedGuardDistanceChange: (value: number) => void;
  seedGuardNeedsResolvedSeed: boolean;
};

export function SetupSeedPanel({
  location,
  onLocationChange,
  loading,
  resolvingSeed,
  seedEditLoading,
  onResolveSeedPreview,
  isTestLocationInput,
  clusterAlgorithm,
  onClusterAlgorithmChange,
  onShowAlgorithmGuide,
  mobilityPruneMinSeedCapturePct,
  onMobilityPruneMinSeedCapturePctChange,
  isGuidedSecondOrderAlgorithm,
  minPop,
  onMinPopChange,
  monthOptions,
  availableMonthsLoading,
  detectedStateAbbr,
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  description,
  onDescriptionChange,
  setupSeedCbg,
  setupSeedLabel,
  setupSeedCount,
  setupResolvedCityName,
  seedGuardDistanceKm,
  seedAdjustmentSummary,
  seedEditMode,
  seedEditAction,
  onSeedEditActionChange,
  onFinishSeedEdit,
  onCancelSeedEdit,
  onShowMoreSeedEditNeighbors,
  onBeginSeedEdit,
  onResetAdjustedSeed,
  seedEditError,
  seedResolveError,
  showAdvancedClustering,
  onToggleAdvancedClustering,
  onSeedGuardDistanceChange,
  seedGuardNeedsResolvedSeed
}: SetupSeedPanelProps) {
  const monthsReady = monthOptions.length > 0;
  const placeholderLabel = availableMonthsLoading
    ? 'Loading available months...'
    : detectedStateAbbr
      ? 'No months available for this state'
      : 'Resolve seed to see available months';
  const placeholderOption = [{ value: '', label: placeholderLabel }];
  const startValue = monthsReady ? monthFromDate(startDate) : '';
  const endValue = monthsReady ? monthFromEndDate(endDate) : '';
  const startOptions = monthsReady
    ? monthOptions.map((month) => ({
        value: month,
        label: formatMonthLabel(month)
      }))
    : placeholderOption;
  const endOptions = monthsReady
    ? monthOptions
        .filter((month) => month >= monthFromDate(startDate))
        .map((month) => ({
          value: month,
          label: formatMonthLabel(month)
        }))
    : placeholderOption;

  return (
    <div className="czgen_panel lg:w-[30rem] xl:w-[32rem] lg:flex-none lg:h-[calc(100vh-6rem)] lg:overflow-y-auto">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end lg:flex-col xl:flex-row xl:items-end">
          <div className="flex-1 min-w-0">
            <FormField
              label="City, Address, or Location"
              name="location"
              type="text"
              placeholder="e.g. 55902 or TEST"
              value={location}
              onChange={(event) => onLocationChange(event.target.value)}
              disabled={loading || resolvingSeed}
            />
          </div>
          <div className="w-full sm:w-[12rem] lg:w-full xl:w-[12rem]">
            <button
              type="button"
              onClick={onResolveSeedPreview}
              disabled={
                loading ||
                resolvingSeed ||
                !location.trim() ||
                isTestLocationInput
              }
              className="czgen_btn czgen_btn--full"
            >
              {resolvingSeed ? 'Resolving Seed...' : 'Resolve Seed'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="w-full sm:col-span-2 flex flex-col gap-0.5">
            <div className="flex items-center justify-between">
              <label htmlFor="algorithm">Clustering Algorithm</label>
              <button
                type="button"
                onClick={onShowAlgorithmGuide}
                className="czgen_btn czgen_btn--sm"
              >
                <Info size={12} />
                <span style={{ marginLeft: '5px' }}>Algorithm Guide</span>
              </button>
            </div>
            <select
              className="formfield w-full"
              name="algorithm"
              id="algorithm"
              disabled={loading}
              value={clusterAlgorithm}
              onChange={(event) =>
                onClusterAlgorithmChange(event.target.value as ClusterAlgorithm)
              }
              required={true}
            >
              {CLUSTER_ALGORITHM_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          {clusterAlgorithm === 'mobility_prune' ? (
            <div className="w-full sm:col-span-2">
              <FormField
                label="Minimum Seed Movement Captured (%)"
                name="mobility_prune_min_seed_capture"
                type="number"
                value={mobilityPruneMinSeedCapturePct}
                min={0}
                max={100}
                onChange={(event) =>
                  onMobilityPruneMinSeedCapturePctChange(
                    Number(event.target.value)
                  )
                }
                disabled={loading}
              />
              <div className="mt-1 text-xs text-gray-600">
                Pruning stops before a removal would drop captured seed movement
                below this threshold.
              </div>
            </div>
          ) : !isGuidedSecondOrderAlgorithm ? (
            <div className="w-full sm:col-span-2">
              <FormField
                label="Minimum Population"
                name="min_pop"
                type="number"
                value={minPop}
                min={100}
                max={100_000}
                onChange={(event) => onMinPopChange(Number(event.target.value))}
                disabled={loading}
              />
            </div>
          ) : null}
          <div className="czgen_warning text-xs sm:col-span-2">
            Keep zones under 50,000 people for faster generation and review.
          </div>
          <div className="w-full">
            <FormField
              label="Start Month"
              name="start_month"
              type="select"
              value={startValue}
              options={startOptions}
              onChange={(event) => {
                const nextMonth = event.target.value;
                if (!nextMonth) {
                  return;
                }
                const nextStart = startDateFromMonth(nextMonth);
                onStartDateChange(nextStart);
                if (monthFromEndDate(endDate) < nextMonth) {
                  onEndDateChange(endDateFromMonth(nextMonth));
                }
              }}
              disabled={loading || !monthsReady}
            />
          </div>
          <div className="w-full">
            <FormField
              label="End Month"
              name="end_month"
              type="select"
              value={endValue}
              options={endOptions}
              onChange={(event) => {
                const nextMonth = event.target.value;
                if (!nextMonth) {
                  return;
                }
                onEndDateChange(endDateFromMonth(nextMonth));
              }}
              disabled={loading || !monthsReady}
            />
          </div>
          <div className="w-full sm:col-span-2">
            <FormField
              label="Description"
              name="description"
              type="textarea"
              placeholder="a short description for this convenience zone..."
              value={description}
              onChange={(event) => onDescriptionChange(event.target.value)}
              disabled={loading}
              required={false}
            />
          </div>
        </div>

        {(setupSeedCbg || seedResolveError || isTestLocationInput) && (
          <SeedPreviewStatus
            setupSeedCbg={setupSeedCbg}
            setupSeedLabel={setupSeedLabel}
            setupSeedCount={setupSeedCount}
            setupResolvedCityName={setupResolvedCityName}
            clusterAlgorithm={clusterAlgorithm}
            seedGuardDistanceKm={seedGuardDistanceKm}
            seedAdjustmentSummary={seedAdjustmentSummary}
            seedEditMode={seedEditMode}
            seedEditAction={seedEditAction}
            onSeedEditActionChange={onSeedEditActionChange}
            loading={loading}
            seedEditLoading={seedEditLoading}
            onFinishSeedEdit={onFinishSeedEdit}
            onCancelSeedEdit={onCancelSeedEdit}
            onShowMoreSeedEditNeighbors={onShowMoreSeedEditNeighbors}
            onBeginSeedEdit={onBeginSeedEdit}
            onResetAdjustedSeed={onResetAdjustedSeed}
            seedEditError={seedEditError}
            isTestLocationInput={isTestLocationInput}
            seedResolveError={seedResolveError}
          />
        )}

        {clusterAlgorithm === 'greedy_weight_seed_guard' && (
          <div className="text-xs text-gray-600">
            Resolve the seed, adjust the blue radius, then preview the cluster.
          </div>
        )}

        {isGuidedSecondOrderAlgorithm && (
          <div className="czgen_info text-xs">
            This mode starts with the full seed region, ranks nearby connected
            cities by how much travel they share with it, and asks you which
            connected cities should contribute linked CBGs to the explicit
            simulation.
          </div>
        )}

        {clusterAlgorithm === 'mobility_prune' && (
          <div className="czgen_info text-xs">
            This mode grows a large mobility envelope, then prunes low
            seed-capture CBGs while preserving the seed CBGs' movement field.
          </div>
        )}

        {clusterAlgorithm === 'greedy_weight_seed_guard' && (
          <div className="czgen_panel w-full" style={{ padding: '12px 14px' }}>
            <button
              type="button"
              className="text-sm font-semibold text-left w-full"
              onClick={onToggleAdvancedClustering}
              disabled={loading}
            >
              Advanced Clustering {showAdvancedClustering ? 'v' : '>'}
            </button>
            {showAdvancedClustering && (
              <div className="mt-3 flex flex-col gap-3">
                <FormField
                  label="Seed Guard Distance (km)"
                  name="seed_guard_distance_km"
                  type="number"
                  value={seedGuardDistanceKm}
                  min={0}
                  max={500}
                  onChange={(event) =>
                    onSeedGuardDistanceChange(Number(event.target.value))
                  }
                  disabled={loading}
                />
                <div className="text-xs text-gray-600">
                  Distant CBGs can still be added, but they will stop
                  influencing later picks.
                </div>
              </div>
            )}
          </div>
        )}

        <div className="pt-1">
          <button
            type="submit"
            disabled={
              loading ||
              resolvingSeed ||
              seedEditLoading ||
              (seedGuardNeedsResolvedSeed && !setupSeedCbg)
            }
            className="czgen_btn czgen_btn--primary czgen_btn--full"
          >
            {loading
              ? isGuidedSecondOrderAlgorithm
                ? 'Loading Cities...'
                : 'Clustering...'
              : isGuidedSecondOrderAlgorithm
                ? 'Choose Connected Cities'
                : 'Preview CBGs'}
          </button>
        </div>
      </div>
    </div>
  );
}

function FormField({
  label,
  name,
  type,
  placeholder,
  disabled,
  value,
  onChange,
  min,
  max,
  options,
  required = true
}: FormFieldProps) {
  return (
    <div className="flex flex-col gap-1">
      <label className="czgen_field_label" htmlFor={name}>
        {label}
      </label>
      {type === 'textarea' ? (
        <textarea
          className="formfield"
          name={name}
          id={name}
          placeholder={placeholder}
          disabled={disabled}
          value={value as string}
          onChange={
            onChange as
              | ChangeEventHandler<HTMLTextAreaElement>
              | undefined
          }
          required={required}
        />
      ) : type === 'select' ? (
        <select
          className="formfield"
          name={name}
          id={name}
          disabled={disabled}
          value={value as string}
          onChange={
            onChange as ChangeEventHandler<HTMLSelectElement> | undefined
          }
          required={required}
        >
          {options?.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          className="formfield"
          type={type}
          name={name}
          id={name}
          placeholder={placeholder}
          disabled={disabled}
          value={value}
          onChange={
            onChange as ChangeEventHandler<HTMLInputElement> | undefined
          }
          min={min}
          max={max}
          required={required}
        />
      )}
    </div>
  );
}

type SeedPreviewStatusProps = {
  setupSeedCbg: string;
  setupSeedLabel: string;
  setupSeedCount: number;
  setupResolvedCityName: string;
  clusterAlgorithm: ClusterAlgorithm;
  seedGuardDistanceKm: number;
  seedAdjustmentSummary: SeedAdjustmentSummary;
  seedEditMode: boolean;
  seedEditAction: SeedEditAction;
  onSeedEditActionChange: (action: SeedEditAction) => void;
  loading: boolean;
  seedEditLoading: boolean;
  onFinishSeedEdit: () => void;
  onCancelSeedEdit: () => void;
  onShowMoreSeedEditNeighbors: () => void;
  onBeginSeedEdit: () => void;
  onResetAdjustedSeed: () => void;
  seedEditError: string;
  isTestLocationInput: boolean;
  seedResolveError: string;
};

function SeedPreviewStatus({
  setupSeedCbg,
  setupSeedLabel,
  setupSeedCount,
  setupResolvedCityName,
  clusterAlgorithm,
  seedGuardDistanceKm,
  seedAdjustmentSummary,
  seedEditMode,
  seedEditAction,
  onSeedEditActionChange,
  loading,
  seedEditLoading,
  onFinishSeedEdit,
  onCancelSeedEdit,
  onShowMoreSeedEditNeighbors,
  onBeginSeedEdit,
  onResetAdjustedSeed,
  seedEditError,
  isTestLocationInput,
  seedResolveError
}: SeedPreviewStatusProps) {
  return (
    <div className="flex flex-col gap-2 text-sm">
      {setupSeedCbg && (
        <div className="czgen_info text-sm">
          <div>
            <span className="font-semibold">Resolved Seed:</span>{' '}
            {setupSeedLabel || setupSeedCbg}
            {setupSeedCount > 0 ? ` (${setupSeedCount} CBGs)` : ''}
            {setupResolvedCityName ? ` for ${setupResolvedCityName}` : ''}
            {clusterAlgorithm === 'greedy_weight_seed_guard'
              ? ` | Blue ring radius: ${seedGuardDistanceKm} km`
              : ''}
          </div>
          {seedAdjustmentSummary.hasChanges && (
            <div className="mt-1 text-xs">
              {seedAdjustmentSummary.addedCount > 0
                ? `+${seedAdjustmentSummary.addedCount} added`
                : ''}
              {seedAdjustmentSummary.addedCount > 0 &&
              seedAdjustmentSummary.removedCount > 0
                ? ' | '
                : ''}
              {seedAdjustmentSummary.removedCount > 0
                ? `-${seedAdjustmentSummary.removedCount} removed`
                : ''}
            </div>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            {seedEditMode ? (
              <>
                <div
                  className="flex overflow-hidden rounded-lg"
                  style={{ border: '1px solid rgba(61,136,173,0.3)' }}
                >
                  <button
                    type="button"
                    onClick={() => onSeedEditActionChange('add')}
                    disabled={loading || seedEditLoading}
                    className={`px-3 py-1.5 text-xs font-semibold font-[inherit] cursor-pointer disabled:opacity-40 ${
                      seedEditAction === 'add'
                        ? 'bg-[#dcfce7] text-[#166534]'
                        : ''
                    }`}
                    style={
                      seedEditAction !== 'add'
                        ? {
                            color: 'var(--color-text-main)',
                            background: 'var(--color-bg-surface)'
                          }
                        : undefined
                    }
                  >
                    Add
                  </button>
                  <button
                    type="button"
                    onClick={() => onSeedEditActionChange('remove')}
                    disabled={loading || seedEditLoading}
                    className={`px-3 py-1.5 text-xs font-semibold font-[inherit] cursor-pointer disabled:opacity-40 ${
                      seedEditAction === 'remove'
                        ? 'bg-[#fee2e2] text-[#991b1b]'
                        : ''
                    }`}
                    style={{
                      borderLeft: '1px solid rgba(61,136,173,0.3)',
                      ...(seedEditAction !== 'remove'
                        ? {
                            color: 'var(--color-text-main)',
                            background: 'var(--color-bg-surface)'
                          }
                        : {})
                    }}
                  >
                    Remove
                  </button>
                </div>
                <button
                  type="button"
                  onClick={onFinishSeedEdit}
                  disabled={loading || seedEditLoading}
                  className="czgen_btn czgen_btn--sm"
                >
                  Done
                </button>
                <button
                  type="button"
                  onClick={onCancelSeedEdit}
                  disabled={loading || seedEditLoading}
                  className="czgen_btn czgen_btn--sm"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={onShowMoreSeedEditNeighbors}
                  disabled={loading || seedEditLoading}
                  className="czgen_btn czgen_btn--sm"
                >
                  Show More Nearby
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={onBeginSeedEdit}
                disabled={loading || seedEditLoading}
                className="czgen_btn czgen_btn--sm"
              >
                {seedEditLoading ? 'Loading Area...' : 'Adjust Seed Area'}
              </button>
            )}
            <button
              type="button"
              onClick={onResetAdjustedSeed}
              disabled={
                loading || seedEditLoading || !seedAdjustmentSummary.hasChanges
              }
              className="czgen_btn czgen_btn--sm"
            >
              Reset
            </button>
          </div>
          {seedEditMode && (
            <div
              className="mt-2 text-xs czgen_info"
              style={{ padding: '4px 8px' }}
            >
              {seedEditAction === 'add' ? 'Add mode active' : 'Remove mode active'}
              {seedEditLoading ? ' | Updating map...' : ''}
            </div>
          )}
          {seedEditError && (
            <div
              className="mt-2 czgen_error text-xs"
              style={{ textAlign: 'left', maxWidth: '100%', padding: '6px 10px' }}
            >
              {seedEditError}
            </div>
          )}
        </div>
      )}
      {!setupSeedCbg && isTestLocationInput && (
        <div className="czgen_warning text-sm">
          Seed preview is unavailable in TEST mode.
        </div>
      )}
      {seedResolveError && (
        <div
          className="czgen_error text-sm"
          style={{ textAlign: 'left', maxWidth: '100%' }}
        >
          {seedResolveError}
        </div>
      )}
    </div>
  );
}
