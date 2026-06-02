'use client';

import { useMemo, useState } from 'react';
import useMapData from '@/stores/mapdata';

const TOP_N = 10;
const LABEL_MAX = 44;
const EMPTY_SET: ReadonlySet<string> = new Set();

type RankingView = 'pois' | 'types';

type PoiStat = {
  id: string;
  label: string;
  category: string;
  peakInfected: number;
  popAtPeak: number;
};

type RankRow = {
  id: string;
  label: string;
  fullLabel: string;
  value: number;
  infected: number;
  population: number;
  poiCount?: number;
  poiIds?: string[];
};

interface PoiRankingsProps {
  onSelectPoi?: (loc: { id: string; label: string; type: string }) => void;
  disabledPoiIds?: ReadonlySet<string>;
  disabledCategories?: ReadonlySet<string>;
  onTogglePoi?: (id: string) => void;
  onToggleCategory?: (category: string) => void;
  effectiveDisabledPoiCount?: number;
  onRunDisabledComparison?: () => void;
  disabledComparisonRunning?: boolean;
  disabledComparisonProgress?: number;
  disabledComparisonMessage?: string | null;
  disabledComparisonError?: string | null;
}

function truncate(label: string) {
  return label.length > LABEL_MAX
    ? `${label.slice(0, LABEL_MAX - 1)}...`
    : label;
}

function formatPoiCount(count: number) {
  return `${count.toLocaleString()} POI${count === 1 ? '' : 's'}`;
}

function HotspotSwitch({
  checked,
  label,
  onToggle
}: {
  checked: boolean;
  label: string;
  onToggle?: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={checked ? `Enable ${label}` : `Disable ${label}`}
      disabled={!onToggle}
      className={`relative h-5 w-9 shrink-0 overflow-hidden rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        checked
          ? 'border-gray-950 bg-gray-950'
          : 'border-(--color-border-light) bg-white'
      }`}
      onClick={onToggle}
    >
      <span
        className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
          checked ? 'translate-x-4' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

function RankingViewToggle({
  activeView,
  poiCount,
  typeCount,
  onChange
}: {
  activeView: RankingView;
  poiCount: number;
  typeCount: number;
  onChange: (view: RankingView) => void;
}) {
  const options: Array<{ id: RankingView; label: string; count: number }> = [
    { id: 'pois', label: 'POIs', count: poiCount },
    { id: 'types', label: 'Types', count: typeCount }
  ];

  return (
    <div
      role="tablist"
      aria-label="Hotspot ranking type"
      className="inline-flex overflow-hidden rounded-md border border-(--color-border-light) bg-white text-xs font-semibold"
    >
      {options.map((option) => {
        const selected = activeView === option.id;

        return (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-label={`${option.label} (${option.count})`}
            className={`px-3 py-1.5 transition-colors ${
              selected
                ? 'bg-(--color-primary-blue) text-(--color-text-light)'
                : 'text-(--color-text-main) hover:bg-gray-50'
            }`}
            onClick={() => onChange(option.id)}
          >
            {option.label}
            <span className="ml-1 tabular-nums opacity-75">
              {option.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function RankingTable({
  rows,
  isDisabled,
  onToggle,
  onSelectRow,
  getDetail
}: {
  rows: RankRow[];
  isDisabled: (row: RankRow) => boolean;
  onToggle?: (row: RankRow) => void;
  onSelectRow?: (row: RankRow) => void;
  getDetail: (row: RankRow) => string;
}) {
  const maxValue = Math.max(0, ...rows.map((row) => row.value));

  return (
    <div className="overflow-hidden rounded-md border border-(--color-border-light) bg-white">
      <div className="grid grid-cols-[2rem_2.25rem_minmax(0,1fr)_4.75rem] items-center gap-2 bg-white/80 px-3 py-2 text-[10px] font-bold uppercase text-(--color-text-muted) sm:grid-cols-[2.5rem_2.75rem_minmax(0,1fr)_5.5rem]">
        <span className="text-center">#</span>
        <span className="sr-only">Disable</span>
        <span>Hotspot</span>
        <span className="text-right">Peak</span>
      </div>
      {rows.length === 0 ? (
        <div className="flex h-40 items-center justify-center border-t border-(--color-border-light) text-sm text-(--color-text-muted)">
          No infections recorded.
        </div>
      ) : (
        <div className="divide-y divide-(--color-border-light)">
          {rows.map((row, index) => {
            const disabled = isDisabled(row);
            const width =
              maxValue > 0
                ? `${Math.max(4, (row.value / maxValue) * 100)}%`
                : '0%';
            const content = (
              <>
                <span className="block truncate text-sm font-semibold leading-tight">
                  {row.label}
                </span>
                <span className="block truncate text-[11px] leading-tight text-(--color-text-muted)">
                  {getDetail(row)}
                </span>
                <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-gray-200">
                  <div
                    className={`h-full rounded-full ${
                      disabled ? 'bg-gray-950' : 'bg-(--color-primary-blue)'
                    }`}
                    style={{ width }}
                  />
                </div>
              </>
            );

            return (
              <div
                key={row.id}
                className={`grid grid-cols-[2rem_2.25rem_minmax(0,1fr)_4.75rem] items-center gap-2 px-3 py-2.5 transition-colors sm:grid-cols-[2.5rem_2.75rem_minmax(0,1fr)_5.5rem] ${
                  disabled ? 'bg-white' : 'bg-white/70 hover:bg-white'
                }`}
              >
                <span
                  className={`text-center text-xs font-semibold tabular-nums ${
                    disabled
                      ? 'text-gray-950'
                      : 'text-(--color-text-muted)'
                  }`}
                >
                  {index + 1}
                </span>
                <div className="flex justify-center">
                  <HotspotSwitch
                    checked={disabled}
                    label={row.fullLabel}
                    onToggle={onToggle ? () => onToggle(row) : undefined}
                  />
                </div>
                {onSelectRow ? (
                  <button
                    type="button"
                    className="min-w-0 cursor-pointer text-left hover:underline"
                    title={row.fullLabel}
                    onClick={() => onSelectRow(row)}
                  >
                    {content}
                  </button>
                ) : (
                  <div className="min-w-0" title={row.fullLabel}>
                    {content}
                  </div>
                )}
                <div className="text-right">
                  <span className="block text-sm font-bold tabular-nums leading-none">
                    {row.value.toLocaleString()}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function PoiRankings({
  onSelectPoi,
  disabledPoiIds = EMPTY_SET,
  disabledCategories = EMPTY_SET,
  onTogglePoi,
  onToggleCategory,
  effectiveDisabledPoiCount = 0,
  onRunDisabledComparison,
  disabledComparisonRunning = false,
  disabledComparisonProgress = 0,
  disabledComparisonMessage = null,
  disabledComparisonError = null
}: PoiRankingsProps) {
  const [activeView, setActiveView] = useState<RankingView>('pois');
  const simdata = useMapData((s) => s.simdata);
  const papdata = useMapData((s) => s.papdata);

  const poiStats = useMemo<PoiStat[]>(() => {
    if (!simdata || !papdata?.places?.length) return [];
    const places = papdata.places;
    const count = places.length;
    const peak = new Array<number>(count).fill(0);
    const popAtPeak = new Array<number>(count).fill(0);

    for (const frame of Object.values(simdata)) {
      const placeStats = frame?.p;
      if (!placeStats) continue;
      for (let index = 0; index < count; index += 1) {
        const infected = placeStats[index * 2 + 1] ?? 0;
        if (infected > peak[index]) {
          peak[index] = infected;
          popAtPeak[index] = placeStats[index * 2] ?? 0;
        }
      }
    }

    return places.map((place, index) => ({
      id: String(place.id),
      label: place.label || `Place #${place.id}`,
      category: place.top_category || 'Uncategorized',
      peakInfected: peak[index],
      popAtPeak: popAtPeak[index]
    }));
  }, [simdata, papdata]);

  const poiRows = useMemo<RankRow[]>(() => {
    return poiStats
      .filter((stat) => stat.peakInfected > 0)
      .sort((left, right) => right.peakInfected - left.peakInfected)
      .slice(0, TOP_N)
      .map((stat) => ({
        id: stat.id,
        fullLabel: stat.label,
        label: truncate(stat.label),
        value: stat.peakInfected,
        infected: stat.peakInfected,
        population: stat.popAtPeak
      }));
  }, [poiStats]);

  const typeRows = useMemo<RankRow[]>(() => {
    const byCategory = new Map<
      string,
      {
        infected: number;
        population: number;
        poiCount: number;
        poiIds: string[];
      }
    >();

    for (const stat of poiStats) {
      const aggregate = byCategory.get(stat.category) ?? {
        infected: 0,
        population: 0,
        poiCount: 0,
        poiIds: []
      };
      aggregate.infected += stat.peakInfected;
      aggregate.population += stat.popAtPeak;
      aggregate.poiCount += 1;
      aggregate.poiIds.push(stat.id);
      byCategory.set(stat.category, aggregate);
    }

    return [...byCategory.entries()]
      .map(([category, aggregate]) => ({
        id: category,
        fullLabel: category,
        label: truncate(category),
        value: aggregate.infected,
        infected: aggregate.infected,
        population: aggregate.population,
        poiCount: aggregate.poiCount,
        poiIds: aggregate.poiIds
      }))
      .filter((row) => row.infected > 0)
      .sort((left, right) => right.value - left.value)
      .slice(0, TOP_N);
  }, [poiStats]);

  if (poiStats.length === 0) return null;

  const activeRows = activeView === 'pois' ? poiRows : typeRows;
  const activeTitle =
    activeView === 'pois' ? 'Most infectious POIs' : 'Most infectious POI types';
  const activeIsDisabled =
    activeView === 'pois'
      ? (row: RankRow) => disabledPoiIds.has(row.id)
      : (row: RankRow) => disabledCategories.has(row.id);
  const activeToggle =
    activeView === 'pois'
      ? onTogglePoi
        ? (row: RankRow) => onTogglePoi(row.id)
        : undefined
      : onToggleCategory
        ? (row: RankRow) => onToggleCategory(row.id)
        : undefined;
  const activeSelect =
    activeView === 'pois' && onSelectPoi
      ? (row: RankRow) =>
          onSelectPoi({
            id: row.id,
            label: row.fullLabel,
            type: 'places'
          })
      : undefined;
  const activeDetail =
    activeView === 'pois'
      ? (row: RankRow) =>
          `${row.population.toLocaleString()} present at peak`
      : (row: RankRow) =>
          `${formatPoiCount(row.poiCount ?? 0)}, ${row.population.toLocaleString()} present at peaks`;

  return (
    <div className="flex w-[760px] max-w-full flex-col gap-3">
      <div className="text-center">
        <h5 className="font-bold">Infection Hotspots</h5>
        <p className="-mt-1 text-xs text-(--color-text-muted)">
          Ranked over the whole run by peak simultaneous infections.
        </p>
      </div>
      <div className="rounded-md border-2 border-(--color-primary-blue) bg-(--color-bg-ivory) p-3">
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h6 className="text-sm font-bold">{activeTitle}</h6>
          <RankingViewToggle
            activeView={activeView}
            poiCount={poiRows.length}
            typeCount={typeRows.length}
            onChange={setActiveView}
          />
        </div>
        <RankingTable
          rows={activeRows}
          isDisabled={activeIsDisabled}
          onToggle={activeToggle}
          onSelectRow={activeSelect}
          getDetail={activeDetail}
        />
      </div>
      {onRunDisabledComparison && (
        <div className="flex flex-col gap-2 rounded-md border border-(--color-border-light) bg-white/60 p-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-(--color-text-muted)">
              {effectiveDisabledPoiCount === 0
                ? 'Toggle POIs or types above to disable them, then re-run.'
                : `${effectiveDisabledPoiCount.toLocaleString()} POI${
                    effectiveDisabledPoiCount === 1 ? '' : 's'
                  } disabled — rerouted to their homes.`}
            </span>
            <button
              type="button"
              onClick={onRunDisabledComparison}
              disabled={
                effectiveDisabledPoiCount === 0 || disabledComparisonRunning
              }
              className="shrink-0 rounded-md bg-(--color-primary-blue) px-3 py-1.5 text-sm font-semibold text-(--color-text-light) transition-colors hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {disabledComparisonRunning
                ? 'Running…'
                : 'Run with these disabled'}
            </button>
          </div>
          {disabledComparisonRunning && (
            <div className="flex flex-col gap-1">
              <div className="h-1.5 overflow-hidden rounded-full bg-gray-200">
                <div
                  className="h-full rounded-full bg-(--color-primary-blue) transition-[width]"
                  style={{
                    width: `${Math.min(
                      100,
                      Math.max(0, disabledComparisonProgress)
                    )}%`
                  }}
                />
              </div>
              {disabledComparisonMessage && (
                <span className="text-[11px] text-(--color-text-muted)">
                  {disabledComparisonMessage}
                </span>
              )}
            </div>
          )}
          {disabledComparisonError && (
            <span className="text-[11px] text-red-600">
              {disabledComparisonError}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
