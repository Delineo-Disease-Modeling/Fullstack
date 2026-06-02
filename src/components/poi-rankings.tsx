'use client';

import { useMemo } from 'react';
import useMapData from '@/stores/mapdata';

const TOP_N = 10;
const LABEL_MAX = 34;
const EMPTY_SET: ReadonlySet<string> = new Set();

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
      className={`relative h-6 w-11 shrink-0 overflow-hidden rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        checked
          ? 'border-gray-950 bg-gray-950'
          : 'border-(--color-border-light) bg-white'
      }`}
      onClick={onToggle}
    >
      <span
        className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

function RankingList({
  title,
  rows,
  isDisabled,
  onToggle,
  onSelectRow,
  getDetail
}: {
  title: string;
  rows: RankRow[];
  isDisabled: (row: RankRow) => boolean;
  onToggle?: (row: RankRow) => void;
  onSelectRow?: (row: RankRow) => void;
  getDetail: (row: RankRow) => string;
}) {
  const maxValue = Math.max(0, ...rows.map((row) => row.value));

  return (
    <div className="flex min-h-72 flex-col rounded-md border-2 border-(--color-primary-blue) bg-(--color-bg-ivory) p-4">
      <h6 className="mb-3 text-center text-sm font-bold">{title}</h6>
      {rows.length === 0 ? (
        <div className="flex h-40 items-center justify-center text-sm text-(--color-text-muted)">
          No infections recorded.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((row) => {
            const disabled = isDisabled(row);
            const width =
              maxValue > 0
                ? `${Math.max(4, (row.value / maxValue) * 100)}%`
                : '0%';

            return (
              <div
                key={row.id}
                className={`rounded-md border p-2.5 transition-colors ${
                  disabled
                    ? 'border-gray-950 bg-white'
                    : 'border-(--color-border-light) bg-white/70'
                }`}
              >
                <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2">
                  <HotspotSwitch
                    checked={disabled}
                    label={row.fullLabel}
                    onToggle={onToggle ? () => onToggle(row) : undefined}
                  />
                  {onSelectRow ? (
                    <button
                      type="button"
                      className="min-w-0 cursor-pointer text-left hover:underline"
                      title={row.fullLabel}
                      onClick={() => onSelectRow(row)}
                    >
                      <span className="block truncate text-sm font-semibold">
                        {row.label}
                      </span>
                      <span className="block truncate text-[11px] text-(--color-text-muted)">
                        {getDetail(row)}
                      </span>
                    </button>
                  ) : (
                    <div className="min-w-0" title={row.fullLabel}>
                      <span className="block truncate text-sm font-semibold">
                        {row.label}
                      </span>
                      <span className="block truncate text-[11px] text-(--color-text-muted)">
                        {getDetail(row)}
                      </span>
                    </div>
                  )}
                  <span className="text-xs font-semibold tabular-nums">
                    {row.value.toLocaleString()}
                  </span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-200">
                  <div
                    className={`h-full rounded-full ${
                      disabled ? 'bg-gray-950' : 'bg-(--color-primary-blue)'
                    }`}
                    style={{ width }}
                  />
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

  return (
    <div className="flex w-[900px] max-w-full flex-col gap-3">
      <div className="text-center">
        <h5 className="font-bold">Infection Hotspots</h5>
        <p className="-mt-1 text-xs text-(--color-text-muted)">
          Ranked over the whole run by peak simultaneous infections.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <RankingList
          title="Most infectious POIs"
          rows={poiRows}
          isDisabled={(row) => disabledPoiIds.has(row.id)}
          onToggle={onTogglePoi ? (row) => onTogglePoi(row.id) : undefined}
          onSelectRow={
            onSelectPoi
              ? (row) =>
                  onSelectPoi({
                    id: row.id,
                    label: row.fullLabel,
                    type: 'places'
                  })
              : undefined
          }
          getDetail={(row) =>
            `${row.infected.toLocaleString()} infected peak, ${row.population.toLocaleString()} present`
          }
        />
        <RankingList
          title="Most infectious POI types"
          rows={typeRows}
          isDisabled={(row) => disabledCategories.has(row.id)}
          onToggle={
            onToggleCategory ? (row) => onToggleCategory(row.id) : undefined
          }
          getDetail={(row) =>
            `${row.poiCount?.toLocaleString() ?? 0} POIs, ${row.population.toLocaleString()} present at peaks`
          }
        />
      </div>
      {onRunDisabledComparison && (
        <div className="flex flex-col gap-2 border-t border-(--color-border-light) pt-3">
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
