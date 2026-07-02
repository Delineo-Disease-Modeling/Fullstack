'use client';

import {
  type CSSProperties,
  useCallback,
  useEffect,
  useMemo,
  useState
} from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import { ArrowLeft } from 'lucide-react';
import {
  currentInfectionsAtPoint,
  fetchChartData
} from '@/lib/chartdata-client';
import type { ChartData, DataPoint } from '@/lib/simulation-data';
import { CustomTooltip } from './customtooltip';

import '@/styles/outputgraphs.css';
import Button from './ui/button';

const COLORS = [
  '#e8485a',
  '#3d88ad',
  '#2f9e44',
  '#8b5cf6',
  '#d97706',
  '#0891b2',
  '#be185d',
  '#475569'
];

const BASELINE_SUFFIX = ' (baseline)';
const DISABLED_POI_SUFFIX = ' (disabled POIs)';
const ACTIVE_INFECTIONS_KEY = 'Active infections';
const POI_INCIDENCE_SERIES_KEY = 'New infections';
const DEFAULT_HIDDEN_STATE_METRICS = new Set([
  'Infected',
  'Infectious',
  'Susceptible',
  'Symptomatic'
]);

const SERIES_COLORS: Record<string, string> = {
  [POI_INCIDENCE_SERIES_KEY]: '#e8485a',
  [ACTIVE_INFECTIONS_KEY]: '#3d88ad',
  Removed: '#e8485a',
  Infected: '#64748b',
  Recovered: '#2f9e44',
  Infectious: '#8b5cf6',
  Susceptible: '#c58f55',
  Symptomatic: '#0891b2',
  Hospitalized: '#111827'
};

const CHART_TYPE_OPTIONS = [
  {
    value: 'iot',
    label: 'Infectiousness',
    heading: 'Infectiousness over time'
  },
  { value: 'states', label: 'States', heading: 'Disease states' }
] as const;

const POI_CHART_TYPE_OPTIONS = [
  {
    value: 'iot',
    label: 'Incidence',
    heading: 'Infection incidence over time'
  },
  { value: 'states', label: 'States', heading: 'Disease states' }
] as const;

const STATE_SERIES_ORDER = [
  ACTIVE_INFECTIONS_KEY,
  'Recovered',
  'Hospitalized',
  'Removed',
  'Infected',
  'Infectious',
  'Symptomatic',
  'Susceptible'
];

const STATE_SERIES_LABELS: Record<string, string> = {
  [ACTIVE_INFECTIONS_KEY]: 'Active infections',
  Infected: 'Infected stage',
  Infectious: 'Infectious stage'
};

type ChartType = (typeof CHART_TYPE_OPTIONS)[number]['value'];
type ScenarioKey = 'selected' | 'baseline' | 'disabledPoi';

type SeriesDef = {
  key: string;
  metricKey: string;
  label: string;
  scenario: ScenarioKey;
  color: string;
  strokeDasharray?: string;
  strokeOpacity?: number;
  strokeWidth: number;
  halo?: boolean;
};

type SplitChart = {
  key: ScenarioKey;
  title: string;
  data: DataPoint[];
};

const SCENARIOS: Record<
  ScenarioKey,
  {
    label: string;
    suffix: string;
    strokeDasharray?: string;
    strokeOpacity: number;
    strokeWidth: number;
    halo: boolean;
  }
> = {
  selected: {
    label: 'Selected run',
    suffix: '',
    strokeOpacity: 1,
    strokeWidth: 2.75,
    halo: false
  },
  baseline: {
    label: 'Baseline',
    suffix: BASELINE_SUFFIX,
    strokeDasharray: '9 5',
    strokeOpacity: 0.98,
    strokeWidth: 3,
    halo: true
  },
  disabledPoi: {
    label: 'Disabled POIs',
    suffix: DISABLED_POI_SUFFIX,
    strokeDasharray: '2 5',
    strokeOpacity: 0.95,
    strokeWidth: 2.8,
    halo: true
  }
};

function ChartLines({
  data,
  seriesDefs,
  hiddenLines,
  yAxisLabel = 'People'
}: {
  data: DataPoint[];
  seriesDefs: SeriesDef[];
  hiddenLines: Set<string>;
  yAxisLabel?: string;
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart
        data={data}
        margin={{ top: 16, right: 18, bottom: 22, left: 14 }}
      >
        <CartesianGrid
          stroke="rgba(47, 53, 64, 0.14)"
          strokeDasharray="2 6"
          vertical={false}
        />
        <XAxis
          label={{ value: 'Time (h)', position: 'bottom', offset: 4 }}
          type="number"
          dataKey="time"
          tickCount={10}
          domain={['dataMin', 'dataMax']}
          tickLine={false}
          axisLine={{ stroke: 'rgba(47, 53, 64, 0.28)' }}
        />
        <YAxis
          label={{
            value: yAxisLabel,
            angle: -90,
            position: 'insideLeft'
          }}
          tickFormatter={formatCount}
          allowDecimals={false}
          tickLine={false}
          axisLine={{ stroke: 'rgba(47, 53, 64, 0.28)' }}
        />
        <Tooltip content={CustomTooltip} />
        {seriesDefs
          .filter((series) => series.halo)
          .map((series) => (
            <Line
              type="monotone"
              key={`${series.key}-halo`}
              dataKey={series.key}
              stroke="var(--color-bg-ivory)"
              strokeDasharray={series.strokeDasharray}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeOpacity={0.96}
              strokeWidth={series.strokeWidth + 3.5}
              dot={false}
              activeDot={false}
              isAnimationActive={false}
              legendType="none"
              hide={hiddenLines.has(series.key)}
            />
          ))}
        {seriesDefs.map((series) => (
          <Line
            type="monotone"
            key={series.key}
            name={series.label}
            dataKey={series.key}
            stroke={series.color}
            strokeDasharray={series.strokeDasharray}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeOpacity={series.strokeOpacity ?? 1}
            strokeWidth={series.strokeWidth}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2 }}
            isAnimationActive={false}
            hide={hiddenLines.has(series.key)}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

interface OutputGraphsProps {
  simId: number | null;
  baselineSimId?: number | null;
  disabledPoiSimId?: number | null;
  selected_loc: { id: string; label: string; type: string } | null;
  onReset: () => void;
}

function formatCount(value: unknown) {
  return typeof value === 'number'
    ? Math.round(value).toLocaleString()
    : String(value ?? '');
}

function getSeriesKeys(series: DataPoint[]) {
  const keys = new Set<string>();
  for (const point of series) {
    for (const key of Object.keys(point)) {
      if (key !== 'time') {
        keys.add(key);
      }
    }
  }
  return [...keys];
}

function getOrderedSeriesKeys(series: DataPoint[], chartType: ChartType) {
  const keys = getSeriesKeys(series);
  if (chartType !== 'states') {
    return keys;
  }

  return keys.sort((a, b) => {
    const ai = STATE_SERIES_ORDER.indexOf(a);
    const bi = STATE_SERIES_ORDER.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
}

function getMetricLabel(chartType: ChartType, key: string) {
  if (chartType === 'states') {
    return STATE_SERIES_LABELS[key] ?? key;
  }
  return key;
}

function withActiveInfectionsSeries(
  states: DataPoint[],
  iot: DataPoint[]
): DataPoint[] {
  const iotByTime = new Map(
    iot
      .filter((point) => typeof point.time === 'number')
      .map((point) => [point.time, point])
  );

  return states.map((point, index) => {
    const iotPoint = iotByTime.get(point.time) ?? iot[index];
    return {
      ...point,
      [ACTIVE_INFECTIONS_KEY]: currentInfectionsAtPoint(iotPoint, point)
    };
  });
}

function getDataSeries(data: ChartData, key: string): DataPoint[] {
  const series = data[key];
  return Array.isArray(series) ? (series as DataPoint[]) : [];
}

function getChartSeries(
  data: ChartData | null,
  chartType: ChartType,
  preferIncidence = false
) {
  if (!data) {
    return [];
  }
  if (preferIncidence && chartType === 'iot') {
    const incidence = getDataSeries(data, 'incidence');
    if (incidence.length > 0) {
      return incidence;
    }
  }
  if (chartType !== 'states') {
    return getDataSeries(data, chartType);
  }
  return withActiveInfectionsSeries(
    getDataSeries(data, 'states'),
    getDataSeries(data, 'iot')
  );
}

function hasSeriesData(data: DataPoint[], key: string) {
  return data.some((point) => {
    const value = point[key];
    return typeof value === 'number' && Number.isFinite(value);
  });
}

function getPlottedSeriesDefs(data: DataPoint[], seriesDefs: SeriesDef[]) {
  return seriesDefs.filter((series) => hasSeriesData(data, series.key));
}

function isDefaultHiddenSeries(chartType: ChartType, series: SeriesDef) {
  return (
    chartType === 'states' &&
    DEFAULT_HIDDEN_STATE_METRICS.has(series.metricKey)
  );
}

function lineSampleStyle(color: string): CSSProperties {
  return { '--series-color': color } as CSSProperties;
}

function RunChip({
  label,
  color,
  dashed
}: {
  label: string;
  color: string;
  dashed?: boolean;
}) {
  return (
    <span className="outputgraph_run_chip">
      <span
        className={`outputgraph_line_sample ${dashed ? 'is-dashed' : ''}`}
        style={lineSampleStyle(color)}
      />
      {label}
    </span>
  );
}

function SeriesLegend({
  seriesDefs,
  hiddenLines,
  onToggle
}: {
  seriesDefs: SeriesDef[];
  hiddenLines: Set<string>;
  onToggle: (key: string) => void;
}) {
  if (seriesDefs.length === 0) {
    return null;
  }

  return (
    <fieldset className="outputgraph_legend">
      <legend className="sr-only">Chart series</legend>
      {seriesDefs.map((series) => {
        const hidden = hiddenLines.has(series.key);
        return (
          <button
            type="button"
            key={series.key}
            aria-pressed={!hidden}
            className={`outputgraph_legend_item ${hidden ? 'is-hidden' : ''}`}
            onClick={() => onToggle(series.key)}
          >
            <span
              className={`outputgraph_line_sample ${
                series.strokeDasharray ? 'is-dashed' : ''
              }`}
              style={lineSampleStyle(series.color)}
            />
            <span className="truncate">{series.label}</span>
          </button>
        );
      })}
    </fieldset>
  );
}

export default function OutputGraphs({
  simId,
  baselineSimId,
  disabledPoiSimId,
  selected_loc,
  onReset
}: OutputGraphsProps) {
  const [chartType, setChartType] = useState<ChartType>('iot');
  const [chartData, setChartData] = useState<ChartData | null>(null);
  const [baselineData, setBaselineData] = useState<ChartData | null>(null);
  const [disabledPoiData, setDisabledPoiData] = useState<ChartData | null>(
    null
  );
  const [chartError, setChartError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [lineVisibilityOverrides, setLineVisibilityOverrides] = useState<
    Map<string, boolean>
  >(new Map());

  useEffect(() => {
    setChartData(null);
    setBaselineData(null);
    setDisabledPoiData(null);
    setChartError(null);
    setProcessing(false);
    setLineVisibilityOverrides(new Map());

    if (simId == null) {
      return;
    }

    const controller = new AbortController();
    const { signal } = controller;
    const loc = selected_loc
      ? { id: selected_loc.id, type: selected_loc.type }
      : null;

    // Baseline overlay is best-effort: if it fails, the primary chart still
    // renders. Kick it off in parallel with the primary fetch.
    const baselinePromise =
      baselineSimId != null
        ? fetchChartData(baselineSimId, loc, signal).catch((err) => {
            if ((err as Error).name !== 'AbortError') {
              console.error('Baseline chart overlay failed:', err);
            }
            return null;
          })
        : Promise.resolve(null);
    const disabledPoiPromise =
      disabledPoiSimId != null
        ? fetchChartData(disabledPoiSimId, loc, signal).catch((err) => {
            if ((err as Error).name !== 'AbortError') {
              console.error('Disabled-POI chart overlay failed:', err);
            }
            return null;
          })
        : Promise.resolve(null);

    (async () => {
      try {
        const primary = await fetchChartData(simId, loc, signal, () =>
          setProcessing(true)
        );
        if (signal.aborted) return;
        setProcessing(false);
        setChartData(primary);
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        console.error(err);
        setProcessing(false);
        setChartError((err as Error).message || 'Failed to load chart data');
        return;
      }

      const [baseline, disabledPoi] = await Promise.all([
        baselinePromise,
        disabledPoiPromise
      ]);
      if (signal.aborted) return;
      if (baseline) {
        setBaselineData(baseline);
      }
      if (disabledPoi) {
        setDisabledPoiData(disabledPoi);
      }
    })();

    return () => controller.abort();
  }, [simId, baselineSimId, disabledPoiSimId, selected_loc]);

  const hasBaseline = baselineSimId != null && baselineData != null;
  const hasDisabledPoi = disabledPoiSimId != null && disabledPoiData != null;
  const hasComparisons = hasBaseline || hasDisabledPoi;
  const selectedPoi = selected_loc?.type === 'places';
  const chartTypeOptions = selectedPoi
    ? POI_CHART_TYPE_OPTIONS
    : CHART_TYPE_OPTIONS;
  const prefersIncidenceSeries = selectedPoi && chartType === 'iot';
  const yAxisLabel = prefersIncidenceSeries ? 'New infections' : 'People';
  const activeChart = chartTypeOptions.find(
    (option) => option.value === chartType
  );

  const { mergedData, seriesDefs, splitCharts } = useMemo<{
    mergedData: DataPoint[];
    seriesDefs: SeriesDef[];
    splitCharts: SplitChart[];
  }>(() => {
    const primarySeries = getChartSeries(
      chartData,
      chartType,
      prefersIncidenceSeries
    );
    const baselineSeries = hasBaseline
      ? getChartSeries(baselineData, chartType, prefersIncidenceSeries)
      : [];
    const disabledPoiSeries = hasDisabledPoi
      ? getChartSeries(disabledPoiData, chartType, prefersIncidenceSeries)
      : [];
    const baseKeys = getOrderedSeriesKeys(
      [...primarySeries, ...baselineSeries, ...disabledPoiSeries],
      chartType
    );
    const colorByKey = new Map(
      baseKeys.map((key, index) => [
        key,
        SERIES_COLORS[key] ?? COLORS[index % COLORS.length]
      ])
    );
    const colorOf = (key: string) => colorByKey.get(key) ?? COLORS[0];
    const selectedSeriesDefs = baseKeys.map((key) => ({
      key,
      metricKey: key,
      label: getMetricLabel(chartType, key),
      scenario: 'selected' as const,
      color: colorOf(key),
      strokeWidth: SCENARIOS.selected.strokeWidth
    }));

    if (chartType === 'states' && hasComparisons) {
      const splitCharts: SplitChart[] = [];

      if (hasBaseline) {
        splitCharts.push({
          key: 'baseline',
          title: SCENARIOS.baseline.label,
          data: baselineSeries
        });
      }

      splitCharts.push({
        key: 'selected',
        title: 'Interventions',
        data: primarySeries
      });

      if (hasDisabledPoi) {
        splitCharts.push({
          key: 'disabledPoi',
          title: SCENARIOS.disabledPoi.label,
          data: disabledPoiSeries
        });
      }

      return {
        mergedData: [],
        seriesDefs: selectedSeriesDefs,
        splitCharts
      };
    }

    if (!hasComparisons) {
      return {
        mergedData: primarySeries,
        seriesDefs: selectedSeriesDefs,
        splitCharts: []
      };
    }

    const byTime = new Map<number, DataPoint>();
    for (const point of primarySeries) {
      byTime.set(point.time, { ...point });
    }

    const comparisons = [
      {
        data: hasBaseline ? baselineData : null,
        scenario: 'baseline' as const
      },
      {
        data: hasDisabledPoi ? disabledPoiData : null,
        scenario: 'disabledPoi' as const
      }
    ];

    for (const comparison of comparisons) {
      const comparisonSeries = comparison.data
        ? getChartSeries(comparison.data, chartType, prefersIncidenceSeries)
        : [];
      const scenario = SCENARIOS[comparison.scenario];
      for (const point of comparisonSeries) {
        const merged = byTime.get(point.time) ?? { time: point.time };
        for (const [key, value] of Object.entries(point)) {
          if (key !== 'time') merged[`${key}${scenario.suffix}`] = value;
        }
        byTime.set(point.time, merged);
      }
    }
    const mergedData = [...byTime.values()].sort((a, b) => a.time - b.time);

    const seriesDefs: SeriesDef[] = [
      ...baseKeys.map((key) => ({
        key,
        metricKey: key,
        label: getMetricLabel(chartType, key),
        scenario: 'selected' as const,
        color: colorOf(key),
        strokeWidth: SCENARIOS.selected.strokeWidth
      })),
      ...comparisons.flatMap((comparison) =>
        comparison.data
          ? baseKeys.map((key) => {
              const scenario = SCENARIOS[comparison.scenario];
              return {
                key: `${key}${scenario.suffix}`,
                metricKey: key,
                label: `${getMetricLabel(chartType, key)} · ${
                  scenario.label
                }`,
                scenario: comparison.scenario,
                color: colorOf(key),
                strokeDasharray: scenario.strokeDasharray,
                strokeOpacity: scenario.strokeOpacity,
                strokeWidth: scenario.strokeWidth,
                halo: scenario.halo
              };
            })
          : []
      )
    ];
    return { mergedData, seriesDefs, splitCharts: [] };
  }, [
    chartType,
    chartData,
    baselineData,
    disabledPoiData,
    hasBaseline,
    hasComparisons,
    hasDisabledPoi,
    prefersIncidenceSeries
  ]);

  const legendSeriesDefs = useMemo(() => {
    if (splitCharts.length > 0) {
      return seriesDefs.filter((series) =>
        splitCharts.some((chart) => hasSeriesData(chart.data, series.key))
      );
    }

    return getPlottedSeriesDefs(mergedData, seriesDefs);
  }, [mergedData, seriesDefs, splitCharts]);

  const hiddenLines = useMemo(() => {
    const next = new Set<string>();
    for (const series of legendSeriesDefs) {
      const override = lineVisibilityOverrides.get(series.key);
      const visible = override ?? !isDefaultHiddenSeries(chartType, series);
      if (!visible) {
        next.add(series.key);
      }
    }
    return next;
  }, [chartType, legendSeriesDefs, lineVisibilityOverrides]);

  const handleLegendToggle = useCallback(
    (key: string) => {
      setLineVisibilityOverrides((prev) => {
        const next = new Map(prev);
        next.set(key, hiddenLines.has(key));
        return next;
      });
    },
    [hiddenLines]
  );

  return (
    <div className="outputgraphs_container">
      <section className="outputgraph_chart">
        <div className="outputgraph_header">
          <div className="min-w-0">
            <span className="sim_run_section_kicker">Outcomes</span>
            <h6 className="outputgraph_title">
              {activeChart?.heading ?? 'Infection chart'}
              {selected_loc && <span> for {selected_loc.label}</span>}
            </h6>
            <div className="outputgraph_run_chips">
              <RunChip
                label={hasComparisons ? 'Interventions' : 'Selected run'}
                color={COLORS[0]}
              />
              {hasBaseline && (
                <RunChip label="Baseline" color={COLORS[0]} dashed />
              )}
              {hasDisabledPoi && (
                <RunChip label="Disabled POIs" color={COLORS[0]} dashed />
              )}
            </div>
          </div>
          <div className="outputgraph_header_actions">
            {selected_loc && (
              <Button
                variant="secondary"
                className="outputgraph_back_button"
                onClick={onReset}
              >
                <ArrowLeft size={16} aria-hidden="true" />
                <span>All infection graphs</span>
              </Button>
            )}
            <div
              className="outputgraph_segmented"
              role="tablist"
              aria-label="Chart type"
            >
              {chartTypeOptions.map((option) => (
                <button
                  type="button"
                  role="tab"
                  aria-selected={chartType === option.value}
                  className={
                    chartType === option.value
                      ? 'outputgraph_segment is-active'
                      : 'outputgraph_segment'
                  }
                  key={option.value}
                  onClick={() => {
                    setChartType(option.value);
                    setLineVisibilityOverrides(new Map());
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        {chartError ? (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center p-4 text-center">
            <p className="text-lg text-red-500">{chartError}</p>
          </div>
        ) : !chartData ? (
          <div className="outputgraph_loading">
            <p className="text-md">
              {processing ? 'Processing simulation chart data' : 'Loading...'}
            </p>
            {processing && (
              <p className="text-sm italic">
                this may take a few minutes for large simulations...
              </p>
            )}
          </div>
        ) : (
          <>
            {splitCharts.length > 0 ? (
              <div className="outputgraph_split_grid">
                {splitCharts.map((chart) => {
                  const chartSeriesDefs = getPlottedSeriesDefs(
                    chart.data,
                    seriesDefs
                  );

                  return (
                    <section
                      className="outputgraph_split_panel"
                      key={chart.key}
                    >
                      <h3 className="outputgraph_split_title">
                        {chart.title}
                      </h3>
                      <div className="outputgraph_split_plot">
                        <ChartLines
                          data={chart.data}
                          seriesDefs={chartSeriesDefs}
                          hiddenLines={hiddenLines}
                          yAxisLabel={yAxisLabel}
                        />
                      </div>
                    </section>
                  );
                })}
              </div>
            ) : (
              <div className="outputgraph_plot">
                <ChartLines
                  data={mergedData}
                  seriesDefs={legendSeriesDefs}
                  hiddenLines={hiddenLines}
                  yAxisLabel={yAxisLabel}
                />
              </div>
            )}
            <SeriesLegend
              seriesDefs={legendSeriesDefs}
              hiddenLines={hiddenLines}
              onToggle={handleLegendToggle}
            />
          </>
        )}
      </section>
    </div>
  );
}
