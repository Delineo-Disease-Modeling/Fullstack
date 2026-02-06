import { useEffect, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';
import { CustomTooltip } from './customtooltip';
import useSimSettings from '../stores/simsettings';

import '../styles/outputgraphs.css';

const COLORS = [
  '#8884d8',
  '#82ca9d',
  '#d54df7',
  '#ffdc4f',
  '#ff954f',
  '#4fd0ff'
];

export default function OutputGraphs({ selected_loc, onReset }) {
  const sim_id = useSimSettings((state) => state.sim_id);

  const [chartType, setChartType] = useState('iot');
  const [chartData, setChartData] = useState();

  useEffect(() => {
    setChartData(null);

    const url = new URL(
      `${import.meta.env.VITE_DB_URL}simdata/${sim_id}/chartdata`
    );

    if (selected_loc) {
      url.searchParams.append('loc_type', selected_loc.type);
      url.searchParams.append('loc_id', selected_loc.id);
    }

    const abortController = new AbortController();
    const signal = abortController.signal;

    fetch(url, { signal })
      .then((res) => {
        if (!res.ok) {
          throw new Error();
        }

        return res.json();
      })
      .then((json) => {
        setChartData(json['data']);
      })
      .catch(console.error);

    return () => {
      abortController.abort();
    };
  }, [sim_id, selected_loc]);

  return (
    <div className="outputgraphs_container">
      <div className="p-2.5">
        <label>Select Chart Type: </label>
        <select
          className="px-1 outline-2 outline-solid bg-[var(--color-bg-ivory)] outline-[var(--color-primary-blue)]"
          value={chartType}
          onChange={(e) => setChartType(e.target.value)}
        >
          <option value="iot">Infectiousness Over Time</option>
          <option value="ages">Age Of Infected</option>
          <option value="sexes">Infection Gender</option>
          <option value="states">Diseases Info</option>
        </select>
      </div>

      {/* Chart Areas */}
      <div className="relative outputgraph_chart">
        <h6 className="text-center font-bold pb-4">
          Infection Distribution Over Time
          {selected_loc && <span> for {selected_loc.label}</span>}
        </h6>
        {!chartData ? (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center p-4 text-center">
            <p className="text-lg">Loading...</p>
            {/* <p className="mt-2 text-sm">Try selecting another location or generating a new simulation.</p> */}
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
              <Tooltip content={CustomTooltip} />
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
          <button
            onClick={onReset}
            className="px-4 py-2 mt-4 text-white bg-red-500 rounded-sm hover:bg-red-600"
          >
            Reset Selection
          </button>
        </div>
      )}
    </div>
  );
}
