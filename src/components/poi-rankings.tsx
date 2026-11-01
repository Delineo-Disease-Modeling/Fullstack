'use client';

import { useParams, useSearchParams } from 'next/navigation';
import { useId, useMemo, useState } from 'react';
import {
  type ComparisonRuns,
  checkComparable,
  parseComparisonTargets
} from '@/lib/comparison-pair';
import {
  hourlyGridRange,
  incidenceFor,
  type WindowFrameKeys
} from '@/lib/hotspot-window';
import { useComparisonRuns } from '@/lib/use-comparison-runs';
import { useComparisonWindow } from '@/lib/use-comparison-window';
import { useWindowIncidence } from '@/lib/use-window-incidence';
import useMapData, { type RunIncidence } from '@/stores/mapdata';
import FacilityHours from './facility-hours';
import { ComparisonBody } from './hotspot-comparison';
import HotspotHeatmap from './hotspot-heatmap';
import NoSpreadNotice from './no-spread-notice';
import SeedCheck from './seed-check';

const TOP_N = 10;
// Time windows offered besides "Whole run", in hours.
const WINDOW_HOURS = [6, 24, 72] as const;
const NO_INCIDENCE: RunIncidence = { home: 0, places: {} };
const LABEL_MAX = 44;
const EMPTY_SET: ReadonlySet<string> = new Set();

type RankingView = 'pois' | 'types';

type PoiStat = {
  id: string;
  label: string;
  category: string;
  peakInfected: number;
  popAtPeak: number;
  // Cumulative infections that actually happened at this POI (true incidence).
  // 0 when the run predates incidence tracking; ranking then falls back to peak.
  incidence: number;
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
  // The run being shown. Needed to load the frames behind a time window.
  simId?: number | null;
  // The intervention run and its baseline, for "Change vs baseline". Optional:
  // when absent, the two runs are taken from the page URL (`/simulator/<run>`
  // with `?baseline=<id>`) and loaded when the comparison is switched on. A
  // parent that already holds both runs can pass them instead; they are checked
  // the same way. Keep the object stable between renders.
  comparison?: ComparisonRuns | null;
  // The place or home the page has selected (for the chart and the map). Only
  // used by "Busy hours at a place", which follows a selected place.
  selectedLoc?: { id: string; label: string; type: string } | null;
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

function formatHour(minutes: number) {
  return String(Math.round((minutes / 60) * 10) / 10);
}

function describeWindow(keys: WindowFrameKeys) {
  const end = formatHour(keys.endKey);
  return keys.startKey === null
    ? `From the start of the run to hour ${end}`
    : `Between hour ${formatHour(keys.startKey)} and hour ${end}`;
}

function WindowControls({
  windowHours,
  onWindowChange,
  endHour,
  minHour,
  maxHour,
  onEndHourChange,
  description,
  announcement
}: {
  windowHours: number | null;
  onWindowChange: (hours: number | null) => void;
  endHour: number;
  minHour: number;
  maxHour: number;
  onEndHourChange: (hour: number) => void;
  description: string | null;
  // Spoken by screen readers when the window changes. It lives in an element
  // that is always rendered, because a live region that appears together with
  // its text is often not announced.
  announcement: string;
}) {
  const sliderId = useId();
  const options: Array<{ hours: number | null; label: string }> = [
    { hours: null, label: 'Whole run' },
    ...WINDOW_HOURS.map((hours) => ({ hours, label: `${hours} h` }))
  ];

  return (
    <div className="hotspot_window_controls">
      <fieldset className="hotspot_window_row hotspot_window_fieldset">
        <legend className="sr-only">Time window</legend>
        <span className="hotspot_window_label" aria-hidden="true">
          Time window
        </span>
        <div className="hotspot_view_toggle">
          {options.map((option) => (
            <button
              key={option.label}
              type="button"
              aria-pressed={windowHours === option.hours}
              className={`hotspot_view_toggle_button ${
                windowHours === option.hours ? 'is-active' : ''
              }`}
              onClick={() => onWindowChange(option.hours)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </fieldset>
      {windowHours != null && maxHour > minHour && (
        <div className="hotspot_window_row">
          <label className="hotspot_window_label" htmlFor={sliderId}>
            Window ends at hour {endHour}
          </label>
          <input
            id={sliderId}
            type="range"
            className="hotspot_window_slider"
            min={minHour}
            max={maxHour}
            step={1}
            value={endHour}
            onChange={(event) => onEndHourChange(Number(event.target.value))}
          />
        </div>
      )}
      {description && <p className="hotspot_window_status">{description}</p>}
      <output className="sr-only">{announcement}</output>
    </div>
  );
}

function CompareToggle({
  active,
  onChange
}: {
  active: boolean;
  onChange: (active: boolean) => void;
}) {
  const options: Array<{ on: boolean; label: string }> = [
    { on: false, label: 'This run' },
    { on: true, label: 'Change vs baseline' }
  ];
  return (
    <fieldset className="hotspot_window_row hotspot_window_fieldset">
      <legend className="sr-only">Show</legend>
      <span className="hotspot_window_label" aria-hidden="true">
        Show
      </span>
      <div className="hotspot_view_toggle">
        {options.map((option) => (
          <button
            key={option.label}
            type="button"
            aria-pressed={active === option.on}
            className={`hotspot_view_toggle_button ${
              active === option.on ? 'is-active' : ''
            }`}
            onClick={() => onChange(option.on)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

// Home vs POI split of where transmission actually occurred (true incidence).
// In reality most transmission happens at home; this surfaces that split, which
// the peak infected-present ranking cannot show (everyone is home at night).
function HomeVsPoiSummary({ home, poi }: { home: number; poi: number }) {
  const total = home + poi;
  if (total <= 0) return null;

  const rows = [
    { key: 'home', label: 'At home', value: home, color: 'var(--color-primary-blue)' },
    { key: 'poi', label: 'At POIs', value: poi, color: 'var(--color-text-muted)' }
  ];

  return (
    <div className="incidence_summary">
      <p className="incidence_summary_caption">
        Of {total.toLocaleString()} infection{total === 1 ? '' : 's'}, where
        transmission actually happened:
      </p>
      {rows.map((row) => {
        const pct = Math.round((row.value / total) * 100);
        return (
          <div key={row.key} className="incidence_summary_row">
            <span className="incidence_summary_label">{row.label}</span>
            <div
              className="incidence_summary_track"
              role="img"
              aria-label={`${row.label}: ${pct} percent`}
            >
              <div
                className="incidence_summary_fill"
                style={{ width: `${pct}%`, backgroundColor: row.color }}
              />
            </div>
            <span className="incidence_summary_value">
              {pct}%{' '}
              <span className="incidence_summary_count">
                ({row.value.toLocaleString()})
              </span>
            </span>
          </div>
        );
      })}
    </div>
  );
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
      className={`hotspot_switch ${checked ? 'is-checked' : ''}`}
      onClick={onToggle}
    >
      <span />
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
  // null hides the counts (nothing trustworthy to count while a window loads).
  poiCount: number | null;
  typeCount: number | null;
  onChange: (view: RankingView) => void;
}) {
  const options: Array<{
    id: RankingView;
    label: string;
    count: number | null;
  }> = [
    { id: 'pois', label: 'POIs', count: poiCount },
    { id: 'types', label: 'Types', count: typeCount }
  ];

  return (
    <div
      role="tablist"
      aria-label="Hotspot ranking type"
      className="hotspot_view_toggle"
    >
      {options.map((option) => {
        const selected = activeView === option.id;

        return (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-label={
              option.count == null
                ? option.label
                : `${option.label} (${option.count})`
            }
            className={`hotspot_view_toggle_button ${
              selected ? 'is-active' : ''
            }`}
            onClick={() => onChange(option.id)}
          >
            {option.label}
            {option.count != null && <span>{option.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

function RankingTable({
  rows,
  valueLabel,
  isDisabled,
  onToggle,
  onSelectRow,
  getDetail,
  emptyMessage = 'No infections recorded.'
}: {
  rows: RankRow[];
  valueLabel: string;
  isDisabled: (row: RankRow) => boolean;
  onToggle?: (row: RankRow) => void;
  onSelectRow?: (row: RankRow) => void;
  getDetail: (row: RankRow) => string;
  emptyMessage?: string;
}) {
  const maxValue = Math.max(0, ...rows.map((row) => row.value));

  return (
    <div className="hotspot_table">
      <div className="hotspot_table_header">
        <span>#</span>
        <span className="sr-only">Disable</span>
        <span>Hotspot</span>
        <span className="hotspot_table_header_peak">{valueLabel}</span>
      </div>
      {rows.length === 0 ? (
        <div className="hotspot_empty">{emptyMessage}</div>
      ) : (
        <div className="hotspot_table_body">
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
                className={`hotspot_row ${disabled ? 'is-disabled' : ''}`}
              >
                <span className="hotspot_rank">{index + 1}</span>
                <div className="hotspot_switch_cell">
                  <HotspotSwitch
                    checked={disabled}
                    label={row.fullLabel}
                    onToggle={onToggle ? () => onToggle(row) : undefined}
                  />
                </div>
                {onSelectRow ? (
                  <button
                    type="button"
                    className="hotspot_name_button"
                    title={row.fullLabel}
                    onClick={() => onSelectRow(row)}
                  >
                    {content}
                  </button>
                ) : (
                  <div className="hotspot_name" title={row.fullLabel}>
                    {content}
                  </div>
                )}
                <div className="hotspot_peak">{row.value.toLocaleString()}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function PoiRankings({
  simId,
  comparison: comparisonProp = null,
  selectedLoc = null,
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
  const poiPeaks = useMapData((s) => s.poiPeaks);
  const incidence = useMapData((s) => s.incidence);
  const timesteps = useMapData((s) => s.timesteps);
  // A selected home has no busy hours; only places do.
  const facilityPlace = useMemo(
    () =>
      selectedLoc?.type === 'places'
        ? { id: selectedLoc.id, label: selectedLoc.label }
        : null,
    [selectedLoc]
  );
  // null = the whole run (the original ranking); otherwise the last N hours
  // before `endHour`, which defaults to the end of the run.
  const [windowHours, setWindowHours] = useState<number | null>(null);
  const [endHour, setEndHour] = useState<number | null>(null);
  // "Change vs baseline": the same window for the intervention run and its
  // baseline, side by side. Off, the panel is exactly the single-run ranking.
  const [compareOn, setCompareOn] = useState(false);

  const routeParams = useParams<{ run_id?: string | string[] }>();
  const searchParams = useSearchParams();
  const runIdParam = routeParams?.run_id;
  const baselineParam = searchParams?.get('baseline') ?? null;
  const targets = useMemo(
    () => parseComparisonTargets(runIdParam, baselineParam),
    [runIdParam, baselineParam]
  );
  const comparisonAvailable = comparisonProp != null || targets != null;
  const compareActive = compareOn && comparisonAvailable;
  const { state: runsState, retry: retryRuns } = useComparisonRuns({
    enabled: compareActive && comparisonProp == null,
    primaryId: targets?.primaryId ?? null,
    referenceId: targets?.referenceId ?? null
  });
  const comparisonRuns =
    comparisonProp ?? (runsState.status === 'ready' ? runsState.runs : null);
  const comparability = useMemo(
    () => (comparisonRuns ? checkComparable(comparisonRuns) : null),
    [comparisonRuns]
  );
  // While comparing, the controls follow the two runs, never the run that
  // happens to be on the map.
  const compareRange =
    compareActive && comparability?.ok ? comparability.range : null;

  const placeIds = useMemo(
    () => papdata?.places?.map((place) => String(place.id)) ?? null,
    [papdata]
  );
  const hourRange = useMemo(() => hourlyGridRange(timesteps), [timesteps]);

  // Windows need per-place incidence from the engine, the run id to load frames
  // with, and one frame for every hour of the run (the slider offers whole
  // hours); runs without them keep the whole-run ranking only.
  const windowSupported =
    incidence != null && simId != null && hourRange != null && placeIds != null;
  const windowActive = windowSupported && windowHours != null && !compareActive;
  const minHour = compareRange?.minHour ?? hourRange?.minHour ?? 0;
  const maxHour = compareRange?.maxHour ?? hourRange?.maxHour ?? 0;
  const shownEndHour =
    endHour == null ? maxHour : Math.min(Math.max(endHour, minHour), maxHour);

  const {
    state: windowState,
    staleResult,
    retry: retryWindow
  } = useWindowIncidence({
    simId,
    timesteps,
    placeIds,
    endMinutes: windowActive ? shownEndHour * 60 : null,
    windowHours: windowActive ? windowHours : null
  });
  // The comparison asks for the same window for both runs. The whole run is a
  // window long enough to start before the first frame (a zero baseline).
  const {
    state: compareWindowState,
    staleResult: compareStale,
    retry: retryCompareWindow
  } = useComparisonWindow({
    runs: compareRange ? comparisonRuns : null,
    endMinutes: compareRange
      ? (windowHours == null ? maxHour : shownEndHour) * 60
      : null,
    windowHours: compareRange ? (windowHours ?? maxHour + 1) : null
  });
  // While the next window of the same run loads, the last one stays on screen,
  // dimmed. It describes its own span, so it is not mistaken for the new one.
  const windowRefreshing =
    windowActive && windowState.status === 'loading' && staleResult != null;
  const shownWindow = !windowActive
    ? null
    : windowState.status === 'ready'
      ? windowState.result
      : windowRefreshing
        ? staleResult
        : null;
  // Nothing to rank yet (first load, error, unavailable): show a message.
  const windowMessage = windowActive && shownWindow == null;

  // What the ranking is built from: the whole-run numbers, a window's, or
  // nothing (never the whole-run numbers under a window label).
  const rankedIncidence = useMemo<RunIncidence | null>(() => {
    if (shownWindow) {
      return {
        home: shownWindow.incidence.home,
        places: shownWindow.incidence.places
      };
    }
    return windowMessage ? NO_INCIDENCE : incidence;
  }, [incidence, shownWindow, windowMessage]);

  // Incidence = where infection actually happened (the honest hotspot metric).
  // When present we rank by it; older runs without it fall back to peak
  // infected-present.
  const useIncidence = incidence != null;

  const poiStats = useMemo<PoiStat[]>(() => {
    if (!papdata?.places?.length || (!poiPeaks && !simdata && !incidence)) {
      return [];
    }
    const places = papdata.places;
    const placeIncidence = rankedIncidence?.places ?? {};

    // Peak infected-present per place, from the precomputed peaks if available,
    // else scanned from the frames the store currently holds.
    const count = places.length;
    const peak = new Array<number>(count).fill(0);
    const popAtPeak = new Array<number>(count).fill(0);

    if (poiPeaks) {
      places.forEach((place, index) => {
        const p = poiPeaks[String(place.id)];
        peak[index] = p?.infected ?? 0;
        popAtPeak[index] = p?.population ?? 0;
      });
    } else if (simdata) {
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
    }

    return places.map((place, index) => {
      const id = String(place.id);
      return {
        id,
        label: place.label || `Place #${place.id}`,
        category: place.top_category || 'Uncategorized',
        peakInfected: peak[index],
        popAtPeak: popAtPeak[index],
        incidence: incidenceFor(placeIncidence, id)
      };
    });
  }, [simdata, papdata, poiPeaks, incidence, rankedIncidence]);

  const rankValue = useMemo(
    () => (stat: PoiStat) => (useIncidence ? stat.incidence : stat.peakInfected),
    [useIncidence]
  );

  const poiRows = useMemo<RankRow[]>(() => {
    return poiStats
      .filter((stat) => rankValue(stat) > 0)
      .sort((left, right) => rankValue(right) - rankValue(left))
      .slice(0, TOP_N)
      .map((stat) => ({
        id: stat.id,
        fullLabel: stat.label,
        label: truncate(stat.label),
        value: rankValue(stat),
        infected: rankValue(stat),
        population: stat.popAtPeak
      }));
  }, [poiStats, rankValue]);

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
      aggregate.infected += rankValue(stat);
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
  }, [poiStats, rankValue]);

  const poiIncidenceTotal = useMemo(() => {
    if (!rankedIncidence) return 0;
    let sum = 0;
    for (const value of Object.values(rankedIncidence.places)) {
      sum += value;
    }
    return sum;
  }, [rankedIncidence]);

  if (poiStats.length === 0) return null;

  // What the window controls describe: the comparison's pair while comparing.
  const compareShown =
    compareWindowState.status === 'ready'
      ? compareWindowState.result
      : compareWindowState.status === 'loading'
        ? compareStale
        : null;
  const controlsRefreshing = compareActive
    ? compareWindowState.status === 'loading' && compareStale != null
    : windowRefreshing;
  const shownKeys = compareActive
    ? (compareShown?.keys ?? null)
    : (shownWindow?.keys ?? null);

  const activeRows = activeView === 'pois' ? poiRows : typeRows;
  const activeTitle = windowActive
    ? activeView === 'pois'
      ? 'Where infections happened in this window (POIs)'
      : 'Where infections happened in this window (POI types)'
    : useIncidence
      ? activeView === 'pois'
        ? 'Where infections happened (POIs)'
        : 'Where infections happened (POI types)'
      : activeView === 'pois'
        ? 'Most infectious POIs'
        : 'Most infectious POI types';
  const valueLabel = useIncidence ? 'Caught' : 'Peak';
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
  const activeDetail = windowActive
    ? activeView === 'pois'
      ? (row: RankRow) => `${row.value.toLocaleString()} new`
      : (row: RankRow) =>
          `${formatPoiCount(row.poiCount ?? 0)} · ${row.value.toLocaleString()} new`
    : useIncidence
      ? activeView === 'pois'
        ? (row: RankRow) =>
            `${row.value.toLocaleString()} infected here · ${row.population.toLocaleString()} present at peak`
        : (row: RankRow) =>
            `${formatPoiCount(row.poiCount ?? 0)} · ${row.value.toLocaleString()} infected`
      : activeView === 'pois'
        ? (row: RankRow) => `${row.population.toLocaleString()} present at peak`
        : (row: RankRow) =>
            `${formatPoiCount(row.poiCount ?? 0)}, ${row.population.toLocaleString()} present at peaks`;

  return (
    <section className="poi_rankings_panel">
      <div className="poi_rankings_header">
        <div>
          <span className="sim_run_section_kicker">Hotspots</span>
          <h2 className="sim_run_section_title">Infection hotspots</h2>
        </div>
        <RankingViewToggle
          activeView={activeView}
          poiCount={windowMessage || compareActive ? null : poiRows.length}
          typeCount={windowMessage || compareActive ? null : typeRows.length}
          onChange={setActiveView}
        />
      </div>
      <div className="poi_rankings_body">
        {!compareActive && <NoSpreadNotice incidence={incidence} />}
        {comparisonAvailable && (
          <CompareToggle active={compareOn} onChange={setCompareOn} />
        )}
        {(compareActive ? compareRange != null : windowSupported) && (
          <WindowControls
            windowHours={windowHours}
            onWindowChange={setWindowHours}
            endHour={shownEndHour}
            minHour={minHour}
            maxHour={maxHour}
            onEndHourChange={setEndHour}
            description={
              shownKeys
                ? `${describeWindow(shownKeys)}${
                    controlsRefreshing ? ' · updating…' : ''
                  }`
                : null
            }
            announcement={
              controlsRefreshing
                ? 'Updating the time window'
                : shownKeys
                  ? describeWindow(shownKeys)
                  : ''
            }
          />
        )}
        {compareActive ? (
          <ComparisonBody
            runs={comparisonRuns}
            runsFailure={
              comparisonProp == null && runsState.status === 'error'
                ? runsState.message
                : null
            }
            onRetryRuns={retryRuns}
            comparability={comparability}
            windowState={compareWindowState}
            staleResult={compareStale}
            onRetryWindow={retryCompareWindow}
            view={activeView}
            windowed={windowHours != null}
          />
        ) : windowMessage ? (
          <div className="hotspot_table">
            <output className="hotspot_empty">
              {windowState.status === 'error' ? (
                <span className="hotspot_window_error">
                  {windowState.message}{' '}
                  <button
                    type="button"
                    className="hotspot_window_retry"
                    onClick={retryWindow}
                  >
                    Retry
                  </button>
                </span>
              ) : windowState.status === 'unavailable' ? (
                'Window rankings are not available for this run.'
              ) : (
                'Loading this window…'
              )}
            </output>
          </div>
        ) : (
          <div
            className={`hotspot_results ${windowRefreshing ? 'is-refreshing' : ''}`}
            aria-busy={windowRefreshing}
          >
            {useIncidence && (
              <HomeVsPoiSummary
                home={rankedIncidence?.home ?? 0}
                poi={poiIncidenceTotal}
              />
            )}
            <h3 className="poi_rankings_subtitle">{activeTitle}</h3>
            <RankingTable
              rows={activeRows}
              valueLabel={valueLabel}
              isDisabled={activeIsDisabled}
              onToggle={activeToggle}
              onSelectRow={activeSelect}
              getDetail={activeDetail}
              emptyMessage={
                windowActive ? 'No new infections in this window.' : undefined
              }
            />
          </div>
        )}
        {windowSupported && !compareActive && (
          <>
            <HotspotHeatmap
              simId={simId ?? null}
              timesteps={timesteps}
              places={papdata?.places ?? null}
              wholeRun={incidence}
              view={activeView}
            />
            <FacilityHours
              simId={simId ?? null}
              timesteps={timesteps}
              place={facilityPlace}
              wholeRun={incidence}
            />
            <SeedCheck simId={simId ?? null} places={papdata?.places ?? null} />
          </>
        )}
      </div>
      {onRunDisabledComparison && (
        <div className="poi_comparison_action">
          <div className="poi_comparison_action_top">
            <span>
              {effectiveDisabledPoiCount === 0
                ? 'No POIs disabled for a comparison run.'
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
              className="poi_comparison_button"
            >
              {disabledComparisonRunning
                ? 'Running…'
                : 'Run with these disabled'}
            </button>
          </div>
          {disabledComparisonRunning && (
            <div className="poi_comparison_progress">
              <div className="poi_comparison_progress_track">
                <div
                  className="poi_comparison_progress_fill"
                  style={{
                    width: `${Math.min(
                      100,
                      Math.max(0, disabledComparisonProgress)
                    )}%`
                  }}
                />
              </div>
              {disabledComparisonMessage && (
                <span>{disabledComparisonMessage}</span>
              )}
            </div>
          )}
          {disabledComparisonError && (
            <span className="poi_comparison_error">
              {disabledComparisonError}
            </span>
          )}
        </div>
      )}
    </section>
  );
}
