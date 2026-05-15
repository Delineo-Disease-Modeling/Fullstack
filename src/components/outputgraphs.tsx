'use client';

import { useCallback, useEffect, useState } from 'react';
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
import type { ChartData } from '@/lib/simulation-data';
import useSimSettings from '@/stores/simsettings';
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

const CHART_TYPE_OPTIONS = [
  { value: 'iot', label: 'Infectiousness Over Time' },
  { value: 'ages', label: 'Age Of Infected' },
  { value: 'sexes', label: 'Infection Gender' },
  { value: 'states', label: 'Diseases Info' }
] as const;

type ChartType = (typeof CHART_TYPE_OPTIONS)[number]['value'];

interface OutputGraphsProps {
  selected_loc: { id: string; label: string; type: string } | null;
  onReset: () => void;
}

export default function OutputGraphs({
  selected_loc,
  onReset
}: OutputGraphsProps) {
  const sim_id = useSimSettings((state) => state.sim_id);
  const [chartType, setChartType] = useState<ChartType>('iot');
  const [chartData, setChartData] = useState<ChartData | null>(null);
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
    setChartError(null);
    setProcessing(false);
    const url = new URL(
      `/api/simdata/${sim_id}/chartdata`,
      window.location.origin
    );
    if (selected_loc) {
      url.searchParams.append('loc_type', selected_loc.type);
      url.searchParams.append('loc_id', selected_loc.id);
    }
    const abortController = new AbortController();

    const fetchData = () => {
      fetch(url, { signal: abortController.signal })
        .then(async (res) => {
          if (res.status === 202) {
            setProcessing(true);
            setTimeout(fetchData, 15000);
            return null;
          }
          const json = await res.json();
          if (!res.ok)
            throw new Error(
              json.message || `Failed to fetch chart data (${res.status})`
            );
          return json;
        })
        .then((json) => {
          if (json) {
            setProcessing(false);
            setHiddenLines(new Set());
            setChartData(json.data);
          }
        })
        .catch((err) => {
          if (err.name === 'AbortError') return;
          console.error(err);
          setProcessing(false);
          setChartError(err.message || 'Failed to load chart data');
        });
    };
    fetchData();

    return () => abortController.abort();
  }, [sim_id, selected_loc]);

  const selectedChartData = chartData?.[chartType] ?? [];
  const chartKeys = Object.keys(selectedChartData[0] ?? {}).filter(
    (key) => key !== 'time'
  );

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
        <h6 className="text-center font-bold pb-4">
          Infection Distribution Over Time
          {selected_loc && <span> for {selected_loc.label}</span>}
        </h6>
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
            <LineChart data={selectedChartData}>
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
              {chartKeys.map((key, index) => (
                <Line
                  type="monotone"
                  key={key}
                  dataKey={key}
                  stroke={COLORS[index % COLORS.length]}
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
