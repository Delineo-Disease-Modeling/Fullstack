'use client';

import { useEffect, useState } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
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

interface OutputGraphsProps {
  selected_loc: { id: string; label: string; type: string } | null;
  onReset: () => void;
}

export default function OutputGraphs({
  selected_loc,
  onReset
}: OutputGraphsProps) {
  const sim_id = useSimSettings((state) => state.sim_id);
  const [chartType, setChartType] = useState('iot');
  const [chartData, setChartData] = useState<any>(null);
  const [chartError, setChartError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

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
          if (!res.ok) throw new Error(json.message || `Failed to fetch chart data (${res.status})`);
          return json;
        })
        .then((json) => {
          if (json) {
            setProcessing(false);
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

  return (
    <div className="outputgraphs_container">
      <div className="p-2.5">
        <label htmlFor="chart-type-select">Select Chart Type: </label>
        <select
          id="chart-type-select"
          className="px-1 outline-2 outline-solid bg-(--color-bg-ivory) outline-(--color-primary-blue)"
          value={chartType}
          onChange={(e) => setChartType(e.target.value)}
        >
          <option value="iot">Infectiousness Over Time</option>
          <option value="ages">Age Of Infected</option>
          <option value="sexes">Infection Gender</option>
          <option value="states">Diseases Info</option>
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
            <p className="text-md">{processing ? 'Processing simulation chart data' : 'Loading...'}</p>
            {processing && <p className="text-sm italic">this may take a few minutes for large simulations...</p>}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData[chartType]}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                label={{ value: 'Time (h)', position: 'bottom' }}
                type="number"
                dataKey="time"
                tickCount={20}
              />
              <YAxis
                label={{ value: 'Total', angle: -90, position: 'insideLeft' }}
              />
              <Tooltip content={CustomTooltip as any} />
              <Legend
                wrapperStyle={{ paddingTop: '30px', paddingBottom: '20px' }}
              />
              {Object.keys(chartData[chartType][0])
                .filter((key) => key !== 'time')
                .map((key, index) => (
                  <Line
                    type="monotone"
                    key={key}
                    dataKey={key}
                    stroke={COLORS[index % COLORS.length]}
                    dot={false}
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
