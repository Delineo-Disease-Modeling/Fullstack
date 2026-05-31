'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type LegendPayload
} from 'recharts';
import { fetchChartData } from '@/lib/chartdata-client';
import type { ChartData, DataPoint } from '@/lib/simulation-data';
import { CustomTooltip } from './customtooltip';

import '@/styles/outputgraphs.css';
import Button from './ui/button';

const COLORS = [
  '#8884d8',
  '#82ca9d',
  '#d54df7',
  '#ffdc4f',
  '#ff954f',
  '#4fd0ff'
];

// Baseline series share their metric's color but get this suffix + a dashed,
// muted stroke so a paired (intervention vs. baseline) read stays legible.
const BASELINE_SUFFIX = ' (baseline)';

const CHART_TYPE_OPTIONS = [
  { value: 'iot', label: 'Infectiousness Over Time' },
  { value: 'ages', label: 'Age Of Infected' },
  { value: 'sexes', label: 'Infection Gender' },
  { value: 'states', label: 'Diseases Info' }
] as const;

type ChartType = (typeof CHART_TYPE_OPTIONS)[number]['value'];

type SeriesDef = { key: string; color: string; dashed: boolean };

interface OutputGraphsProps {
  simId: number | null;
  baselineSimId?: number | null;
  selected_loc: { id: string; label: string; type: string } | null;
  onReset: () => void;
}

export default function OutputGraphs({
  simId,
  baselineSimId,
  selected_loc,
  onReset
}: OutputGraphsProps) {
  const [chartType, setChartType] = useState<ChartType>('iot');
  const [chartData, setChartData] = useState<ChartData | null>(null);
  const [baselineData, setBaselineData] = useState<ChartData | null>(null);
  const [chartError, setChartError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [hiddenLines, setHiddenLines] = useState<Set<string>>(new Set());

  const handleLegendClick = useCallback((entry: LegendPayload) => {
    const key = String(entry.dataKey ?? entry.value ?? '');
    if (!key) {
      return;
    }
    setHiddenLines((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  useEffect(() => {
    setChartData(null);
    setBaselineData(null);
    setChartError(null);
    setProcessing(false);

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

    (async () => {
      try {
        const primary = await fetchChartData(simId, loc, signal, () =>
          setProcessing(true)
        );
        if (signal.aborted) return;
        setProcessing(false);
        setHiddenLines(new Set());
        setChartData(primary);
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        console.error(err);
        setProcessing(false);
        setChartError((err as Error).message || 'Failed to load chart data');
        return;
      }

      const baseline = await baselinePromise;
      if (!signal.aborted && baseline) {
        setBaselineData(baseline);
      }
    })();

    return () => controller.abort();
  }, [simId, baselineSimId, selected_loc]);

  const hasBaseline = baselineSimId != null && baselineData != null;

  const { mergedData, seriesDefs } = useMemo<{
    mergedData: DataPoint[];
    seriesDefs: SeriesDef[];
  }>(() => {
    const primarySeries = chartData?.[chartType] ?? [];
    const baseKeys = Object.keys(primarySeries[0] ?? {}).filter(
      (key) => key !== 'time'
    );
    const colorOf = (index: number) => COLORS[index % COLORS.length];

    if (!hasBaseline) {
      return {
        mergedData: primarySeries,
        seriesDefs: baseKeys.map((key, index) => ({
          key,
          color: colorOf(index),
          dashed: false
        }))
      };
    }

    const baselineSeries = baselineData?.[chartType] ?? [];
    const byTime = new Map<number, DataPoint>();
    for (const point of primarySeries) {
      byTime.set(point.time, { ...point });
    }
    for (const point of baselineSeries) {
      const merged = byTime.get(point.time) ?? { time: point.time };
      for (const [key, value] of Object.entries(point)) {
        if (key !== 'time') merged[`${key}${BASELINE_SUFFIX}`] = value;
      }
      byTime.set(point.time, merged);
    }
    const mergedData = [...byTime.values()].sort((a, b) => a.time - b.time);

    const seriesDefs: SeriesDef[] = [
      ...baseKeys.map((key, index) => ({
        key,
        color: colorOf(index),
        dashed: false
      })),
      ...baseKeys.map((key, index) => ({
        key: `${key}${BASELINE_SUFFIX}`,
        color: colorOf(index),
        dashed: true
      }))
    ];
    return { mergedData, seriesDefs };
  }, [chartType, chartData, baselineData, hasBaseline]);

  return (
    <div className="outputgraphs_container">
      <div className="p-2.5">
        <label htmlFor="chart-type-select">Select Chart Type: </label>
        <select
          id="chart-type-select"
          className="px-1 outline-2 outline-solid bg-(--color-bg-ivory) outline-(--color-primary-blue)"
          value={chartType}
          onChange={(e) => {
            setChartType(e.target.value as ChartType);
            setHiddenLines(new Set());
          }}
        >
          {CHART_TYPE_OPTIONS.map((option) => (
            <option value={option.value} key={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <div className="relative outputgraph_chart">
        <h6 className="text-center font-bold pb-1">
          Infection Distribution Over Time
          {selected_loc && <span> for {selected_loc.label}</span>}
        </h6>
        {hasBaseline && (
          <p className="text-center text-xs text-(--color-text-muted) pb-3">
            Solid = with interventions · Dashed = baseline (no interventions)
          </p>
        )}
        {chartError ? (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center p-4 text-center">
            <p className="text-lg text-red-500">{chartError}</p>
          </div>
        ) : !chartData ? (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center p-4 text-center gap-2">
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
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={mergedData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                label={{ value: 'Time (h)', position: 'bottom' }}
                type="number"
                dataKey="time"
                tickCount={20}
                domain={['dataMin', 'dataMax']}
              />
              <YAxis
                label={{ value: 'Total', angle: -90, position: 'insideLeft' }}
              />
              <Tooltip content={CustomTooltip} />
              <Legend
                wrapperStyle={{ paddingTop: '30px', paddingBottom: '20px' }}
                onClick={handleLegendClick}
                formatter={(value: string) => (
                  <span
                    style={{
                      color: hiddenLines.has(value) ? '#ccc' : undefined,
                      cursor: 'pointer'
                    }}
                  >
                    {value}
                  </span>
                )}
              />
              {seriesDefs.map(({ key, color, dashed }) => (
                <Line
                  type="monotone"
                  key={key}
                  dataKey={key}
                  stroke={color}
                  strokeDasharray={dashed ? '4 3' : undefined}
                  strokeOpacity={dashed ? 0.55 : 1}
                  dot={false}
                  hide={hiddenLines.has(key)}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
      {selected_loc && (
        <div style={{ textAlign: 'center', marginBottom: '10px' }}>
          <Button
            variant="destructive"
            className="px-4! py-2! mt-4"
            onClick={onReset}
          >
            Reset Selection
          </Button>
        </div>
      )}
    </div>
  );
}
