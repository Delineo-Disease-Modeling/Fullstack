'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
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
  '#70b4d4',
  '#88d2d8',
  '#f05464',
  '#f47a87',
  '#5d576b',
  '#909090'
];

const POI_BAR_COLOR = '#70b4d4';

type ChartType = 'iot' | 'ages' | 'sexes' | 'states' | 'pois';

type TimeSeriesPoint = { time: number; [key: string]: number };
type PoiPoint = {
  id: string;
  name: string;
  infections: number;
  category: string | null;
};
type ChartPayload = {
  iot?: TimeSeriesPoint[];
  ages?: TimeSeriesPoint[];
  sexes?: TimeSeriesPoint[];
  states?: TimeSeriesPoint[];
  pois?: PoiPoint[];
};
type ChartResponse = {
  data?: ChartPayload;
  start_date?: string | null;
  message?: string;
};
type LegendEntry = {
  dataKey?: string | number | ((obj: unknown) => unknown);
  value?: string | number;
};

const DATE_TIME_ZONE = 'UTC';
const HOURS_PER_DAY = 24;
const MAX_DATE_TICKS = 7;
const HOUR_MS = 60 * 60 * 1000;

const weekdayShortFormatter = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  timeZone: DATE_TIME_ZONE
});
const weekdayLongFormatter = new Intl.DateTimeFormat('en-US', {
  weekday: 'long',
  timeZone: DATE_TIME_ZONE
});
const monthLongFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  timeZone: DATE_TIME_ZONE
});
const dayFormatter = new Intl.DateTimeFormat('en-US', {
  day: 'numeric',
  timeZone: DATE_TIME_ZONE
});
const timeFormatter = new Intl.DateTimeFormat('en-US', {
  hour: 'numeric',
  minute: '2-digit',
  timeZone: DATE_TIME_ZONE
});

const CHART_OPTIONS: Record<
  ChartType,
  {
    label: string;
    title: string;
    description: string;
    yAxisLabel: string;
    chartMode: 'line' | 'bar';
  }
> = {
  iot: {
    label: 'Infections Over Time',
    title: 'Infections Over Time',
    description: 'Track how infections change across the simulation timeline.',
    yAxisLabel: 'People',
    chartMode: 'line'
  },
  ages: {
    label: 'Infections by Age',
    title: 'Infections by Age Group',
    description: 'Compare infected counts across age bands at each timestep.',
    yAxisLabel: 'People',
    chartMode: 'line'
  },
  sexes: {
    label: 'Infections by Gender',
    title: 'Infections by Gender',
    description: 'Compare infected counts across the available sex categories.',
    yAxisLabel: 'People',
    chartMode: 'line'
  },
  states: {
    label: 'Disease States',
    title: 'Disease State Breakdown',
    description:
      'Each person is counted once in their highest-priority current state.',
    yAxisLabel: 'People',
    chartMode: 'line'
  },
  pois: {
    label: 'Top Infecting POIs',
    title: 'POIs With The Most Inferred Infections',
    description:
      'Counts are inferred from first-time infections matched to the previous timestep’s POI occupancy.',
    yAxisLabel: 'Inferred infections',
    chartMode: 'bar'
  }
};

interface OutputGraphsProps {
  selected_loc: { id: string; label: string; type: string } | null;
  onReset: () => void;
}

function truncateLabel(label: string, maxLength = 28) {
  if (label.length <= maxLength) {
    return label;
  }

  return `${label.slice(0, maxLength - 1)}…`;
}

function getChartDate(startDate: string | null, timeHours: number) {
  if (!startDate || !Number.isFinite(timeHours)) {
    return null;
  }

  const startMs = new Date(startDate).getTime();
  if (!Number.isFinite(startMs)) {
    return null;
  }

  const date = new Date(startMs + timeHours * HOUR_MS);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getNumericTime(label: number | string) {
  const time = typeof label === 'number' ? label : Number(label);
  return Number.isFinite(time) ? time : null;
}

function formatAxisDateLabel(startDate: string | null, label: number | string) {
  const time = getNumericTime(label);
  const date = time === null ? null : getChartDate(startDate, time);
  if (!date) {
    return String(label);
  }

  return `${weekdayShortFormatter.format(date)} ${monthLongFormatter.format(
    date
  )} ${dayFormatter.format(date)}`;
}

function formatTooltipDateLabel(
  startDate: string | null,
  label: number | string
) {
  const time = getNumericTime(label);
  const date = time === null ? null : getChartDate(startDate, time);
  if (!date) {
    return typeof label === 'number' ? `Time: ${label}h` : String(label);
  }

  return `${weekdayLongFormatter.format(date)}, ${monthLongFormatter.format(
    date
  )} ${dayFormatter.format(date)}, ${timeFormatter.format(date)}`;
}

function getDateTicks(data: TimeSeriesPoint[], startDate: string | null) {
  if (!startDate || !getChartDate(startDate, 0)) {
    return undefined;
  }

  const times = data
    .map((point) => point.time)
    .filter((time) => Number.isFinite(time))
    .sort((left, right) => left - right);
  if (!times.length) {
    return undefined;
  }

  const minTime = times[0];
  const maxTime = times[times.length - 1];
  const firstDay = Math.floor(minTime / HOURS_PER_DAY);
  const lastDay = Math.floor(maxTime / HOURS_PER_DAY);
  const dayCount = lastDay - firstDay + 1;
  const stepDays = Math.max(1, Math.ceil(dayCount / MAX_DATE_TICKS));
  const ticks: number[] = [];

  for (let day = firstDay; day <= lastDay; day += stepDays) {
    const tick = day * HOURS_PER_DAY;
    if (tick >= minTime && tick <= maxTime) {
      ticks.push(tick);
    }
  }

  if (!ticks.length || ticks[0] !== minTime) {
    ticks.unshift(minTime);
  }

  const finalDayTick = lastDay * HOURS_PER_DAY;
  if (
    finalDayTick > minTime &&
    finalDayTick <= maxTime &&
    !ticks.includes(finalDayTick)
  ) {
    ticks.push(finalDayTick);
  }

  return ticks;
}

function isChartAvailable(
  type: ChartType,
  data: ChartPayload | null,
  hasLocationSelection: boolean
) {
  if (hasLocationSelection && type === 'pois') {
    return false;
  }

  if (type === 'pois') {
    return Array.isArray(data?.pois) && data.pois.length > 0;
  }

  return true;
}

export default function OutputGraphs({
  selected_loc,
  onReset
}: OutputGraphsProps) {
  const sim_id = useSimSettings((state) => state.sim_id);
  const settingsStartDate = useSimSettings(
    (state) => state.zone?.start_date ?? null
  );
  const [chartType, setChartType] = useState<ChartType>('iot');
  const [chartData, setChartData] = useState<ChartPayload | null>(null);
  const [chartStartDate, setChartStartDate] = useState<string | null>(null);
  const [chartError, setChartError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [hiddenLines, setHiddenLines] = useState<Set<string>>(new Set());

  const handleLegendClick = useCallback((entry: LegendEntry) => {
    const key =
      typeof entry.dataKey === 'string' || typeof entry.dataKey === 'number'
        ? String(entry.dataKey)
        : typeof entry.value === 'string' || typeof entry.value === 'number'
          ? String(entry.value)
          : null;

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
    if (!isChartAvailable(chartType, chartData, Boolean(selected_loc))) {
      setChartType('iot');
      setHiddenLines(new Set());
    }
  }, [chartData, chartType, selected_loc]);

  useEffect(() => {
    setChartData(null);
    setChartStartDate(null);
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
          const json = (await res.json()) as ChartResponse;
          if (!res.ok) {
            throw new Error(
              json.message || `Failed to fetch chart data (${res.status})`
            );
          }
          return json;
        })
        .then((json) => {
          if (json) {
            setProcessing(false);
            setHiddenLines(new Set());
            setChartStartDate(json.start_date ?? null);
            setChartData(json.data ?? null);
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

  const chartOptions = (Object.entries(CHART_OPTIONS) as Array<
    [ChartType, (typeof CHART_OPTIONS)[ChartType]]
  >).filter(([type]) =>
    isChartAvailable(type, chartData, Boolean(selected_loc))
  );

  const activeConfig = CHART_OPTIONS[chartType];
  const activeData = chartData?.[chartType] ?? [];
  const hasActiveData = Array.isArray(activeData) && activeData.length > 0;
  const activeStartDate = chartStartDate ?? settingsStartDate;

  const renderChart = () => {
    if (!hasActiveData) {
      return (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center p-4 text-center gap-2">
          <p className="text-md font-medium text-(--color-bg-dark)">
            No data is available for this chart yet.
          </p>
          {selected_loc && (
            <p className="text-sm italic">
              Try another location or reset the marker selection.
            </p>
          )}
        </div>
      );
    }

    if (activeConfig.chartMode === 'bar') {
      return (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={activeData as PoiPoint[]}
            layout="vertical"
            margin={{ top: 8, right: 24, left: 12, bottom: 8 }}
            barCategoryGap={12}
          >
            <CartesianGrid
              stroke="rgba(112, 180, 212, 0.22)"
              horizontal={false}
            />
            <XAxis
              type="number"
              allowDecimals={false}
              label={{
                value: activeConfig.yAxisLabel,
                position: 'insideBottom',
                offset: -4
              }}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={220}
              tickFormatter={(value: string) => truncateLabel(value)}
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar
              dataKey="infections"
              name="Inferred infections"
              fill={POI_BAR_COLOR}
              radius={[0, 4, 4, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      );
    }

    const timeSeriesData = activeData as TimeSeriesPoint[];
    const dateTicks = getDateTicks(timeSeriesData, activeStartDate);
    const seriesKeys = Object.keys(timeSeriesData[0] ?? {}).filter(
      (key) => key !== 'time'
    );

    return (
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={timeSeriesData}
          margin={{ top: 12, right: 24, left: 12, bottom: 16 }}
        >
          <CartesianGrid stroke="rgba(112, 180, 212, 0.22)" />
          <XAxis
            label={{
              value: activeStartDate ? 'Date' : 'Time (h)',
              position: 'bottom'
            }}
            type="number"
            dataKey="time"
            tickCount={
              activeStartDate ? undefined : Math.min(20, timeSeriesData.length)
            }
            ticks={dateTicks}
            tickFormatter={
              activeStartDate
                ? (value: number | string) =>
                    formatAxisDateLabel(activeStartDate, value)
                : undefined
            }
            domain={['dataMin', 'dataMax']}
            minTickGap={12}
          />
          <YAxis
            label={{
              value: activeConfig.yAxisLabel,
              angle: -90,
              position: 'insideLeft'
            }}
            allowDecimals={false}
          />
          <Tooltip
            content={
              <CustomTooltip
                labelFormatter={(label) =>
                  formatTooltipDateLabel(activeStartDate, label)
                }
              />
            }
          />
          <Legend
            wrapperStyle={{ paddingTop: '24px', paddingBottom: '12px' }}
            onClick={handleLegendClick}
            formatter={(value: string) => (
              <span
                style={{
                  color: hiddenLines.has(value) ? '#b0b0b0' : undefined,
                  cursor: 'pointer'
                }}
              >
                {value}
              </span>
            )}
          />
          {seriesKeys.map((key, index) => (
            <Line
              type="monotone"
              key={key}
              dataKey={key}
              stroke={COLORS[index % COLORS.length]}
              strokeWidth={2.25}
              dot={false}
              activeDot={{ r: 3 }}
              hide={hiddenLines.has(key)}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    );
  };

  return (
    <div className="outputgraphs_container">
      <div className="outputgraph_controls">
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
          {chartOptions.map(([type, option]) => (
            <option key={type} value={type}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <div className="relative outputgraph_chart">
        <div className="outputgraph_header">
          <h6 className="text-center font-bold">
            {activeConfig.title}
            {selected_loc && <span> for {selected_loc.label}</span>}
          </h6>
          <p className="outputgraph_subtitle">{activeConfig.description}</p>
        </div>
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
          renderChart()
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
