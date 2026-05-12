'use client';

import { useEffect, useState } from 'react';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';

type ExperimentListItem = {
  id: string;
  name: string;
  dataset_count: number;
};

type ValidationDatasetListItem = {
  id: string;
  label: string;
  disease: string;
  split: string;
  population: number;
  start_date: string;
  end_date: string;
  cadence: string;
  geography: Record<string, unknown>;
  notes: string[];
  metadata: Record<string, unknown>;
  targets: string[];
  manifest: {
    id: string;
    path: string;
  };
};

type TargetMetrics = {
  mae: number;
  rmse: number;
  wis: number;
  coverage_95: number;
  coverage_50?: number;
  cumulative_error?: number;
  peak_day_offset_days?: number;
  baseline_mae_skill?: number | null;
  baseline_rmse_skill?: number | null;
};

type DatasetDetail = {
  id: string;
  label: string;
  disease: string;
  split: string;
  cadence: string;
  start_date: string;
  end_date: string;
  geography: Record<string, unknown>;
  notes: string[];
  targets: Array<{
    name: string;
    metrics: TargetMetrics;
  }>;
};

type ExperimentDetail = {
  id: string;
  name: string;
  validation_manifest: string;
  datasets: DatasetDetail[];
};

type ComparisonPoint = {
  date: string;
  observed: number | null;
  baseline: number | null;
  median: number | null;
  p25: number | null;
  p75: number | null;
  p025: number | null;
  p975: number | null;
};

type ComparisonResponse = {
  experiment: {
    id: string;
    name: string;
  };
  dataset: {
    id: string;
    label: string;
    disease: string;
    split: string;
    cadence: string;
    geography: Record<string, unknown>;
    notes: string[];
    start_date: string;
    end_date: string;
  };
  target: string;
  metrics: TargetMetrics;
  chartData: ComparisonPoint[];
};

type ObservedPoint = {
  date: string;
  observed: number;
  baseline: number | null;
  observed_per_100k: number | null;
  baseline_per_100k: number | null;
};

type ObservedSummary = {
  row_count: number;
  cumulative_observed: number;
  cumulative_observed_per_100k: number | null;
  cumulative_baseline: number;
  cumulative_baseline_per_100k: number | null;
  peak_date: string | null;
  peak_value: number | null;
  peak_per_100k: number | null;
};

type ObservedResponse = {
  manifest: {
    id: string;
    path: string;
  };
  dataset: ValidationDatasetListItem;
  target: string;
  summary: ObservedSummary;
  chartData: ObservedPoint[];
};

type ValidationTooltipProps = {
  active?: boolean;
  label?: string;
  payload?: Array<{
    payload: ComparisonPoint;
  }>;
};

type ObservedTooltipProps = {
  active?: boolean;
  label?: string;
  payload?: Array<{
    payload: ObservedPoint;
  }>;
};

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC'
});

const compactNumberFormatter = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1
});

async function fetchJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { cache: 'no-store', signal });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      payload &&
      typeof payload === 'object' &&
      'message' in payload &&
      typeof payload.message === 'string'
        ? payload.message
        : `Request failed with status ${response.status}`;
    throw new Error(message);
  }

  if (!payload || typeof payload !== 'object' || !('data' in payload)) {
    throw new Error('Response payload did not include data');
  }

  return payload.data as T;
}

function formatDateLabel(value: string) {
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? value : dateFormatter.format(date);
}

function formatMetric(value: number | null | undefined, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'N/A';
  }
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: digits
  }).format(value);
}

function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'N/A';
  }
  return `${(value * 100).toFixed(1)}%`;
}

function formatGeography(geography: Record<string, unknown>) {
  if (typeof geography.label === 'string') {
    return geography.label;
  }

  const preferredKeys = ['county', 'state', 'country', 'fips'];
  const values = preferredKeys
    .map((key) => geography[key])
    .filter(
      (value): value is string | number =>
        typeof value === 'string' || typeof value === 'number'
    );

  if (values.length > 0) {
    return values.join(', ');
  }

  const genericValues = Object.values(geography).filter(
    (value): value is string | number =>
      typeof value === 'string' || typeof value === 'number'
  );
  return genericValues.join(', ');
}

function formatMetadataValue(value: unknown): string {
  if (value === null || value === undefined) {
    return 'N/A';
  }
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map(formatMetadataValue).join(', ');
  }
  return JSON.stringify(value);
}

function ValidationTooltip({ active, label, payload }: ValidationTooltipProps) {
  if (!active || !payload?.length) {
    return null;
  }

  const point = payload[0].payload;

  return (
    <div className="validation_tooltip">
      <p className="validation_tooltip_title">
        {label ? formatDateLabel(label) : 'Observation'}
      </p>
      <p>Observed: {formatMetric(point.observed)}</p>
      <p>Baseline: {formatMetric(point.baseline)}</p>
      <p>Predicted median: {formatMetric(point.median)}</p>
      <p>
        50% interval: {formatMetric(point.p25)} to {formatMetric(point.p75)}
      </p>
      <p>
        95% interval: {formatMetric(point.p025)} to {formatMetric(point.p975)}
      </p>
    </div>
  );
}

function ObservedTooltip({ active, label, payload }: ObservedTooltipProps) {
  if (!active || !payload?.length) {
    return null;
  }

  const point = payload[0].payload;

  return (
    <div className="validation_tooltip">
      <p className="validation_tooltip_title">
        {label ? formatDateLabel(label) : 'Observation'}
      </p>
      <p>Observed: {formatMetric(point.observed)}</p>
      <p>Baseline: {formatMetric(point.baseline)}</p>
      <p>Observed per 100k: {formatMetric(point.observed_per_100k)}</p>
    </div>
  );
}

export default function ValidationDashboard() {
  const [validationDatasets, setValidationDatasets] = useState<
    ValidationDatasetListItem[]
  >([]);
  const [selectedValidationDataset, setSelectedValidationDataset] =
    useState('');
  const [selectedObservedTarget, setSelectedObservedTarget] = useState('');
  const [observedData, setObservedData] = useState<ObservedResponse | null>(
    null
  );
  const [experiments, setExperiments] = useState<ExperimentListItem[]>([]);
  const [selectedExperiment, setSelectedExperiment] = useState('');
  const [experimentDetail, setExperimentDetail] =
    useState<ExperimentDetail | null>(null);
  const [selectedDataset, setSelectedDataset] = useState('');
  const [selectedTarget, setSelectedTarget] = useState('');
  const [comparison, setComparison] = useState<ComparisonResponse | null>(null);
  const [loadingValidationDatasets, setLoadingValidationDatasets] =
    useState(true);
  const [loadingObserved, setLoadingObserved] = useState(false);
  const [loadingExperiments, setLoadingExperiments] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [loadingComparison, setLoadingComparison] = useState(false);
  const [validationDatasetError, setValidationDatasetError] = useState<
    string | null
  >(null);
  const [observedError, setObservedError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [comparisonError, setComparisonError] = useState<string | null>(null);

  useEffect(() => {
    const abortController = new AbortController();
    setLoadingValidationDatasets(true);
    setValidationDatasetError(null);

    fetchJson<ValidationDatasetListItem[]>(
      '/api/validation/datasets',
      abortController.signal
    )
      .then((items) => {
        setValidationDatasets(items);
        setSelectedValidationDataset((current) => {
          if (current && items.some((item) => item.id === current)) {
            return current;
          }
          return items[0]?.id ?? '';
        });
      })
      .catch((error) => {
        if (abortController.signal.aborted) {
          return;
        }
        console.error(error);
        setValidationDatasetError(
          error.message || 'Failed to load validation datasets'
        );
      })
      .finally(() => {
        if (!abortController.signal.aborted) {
          setLoadingValidationDatasets(false);
        }
      });

    return () => abortController.abort();
  }, []);

  useEffect(() => {
    const abortController = new AbortController();
    setLoadingExperiments(true);
    setLoadError(null);

    fetchJson<ExperimentListItem[]>(
      '/api/validation/experiments',
      abortController.signal
    )
      .then((items) => {
        setExperiments(items);
        setSelectedExperiment((current) => {
          if (current && items.some((item) => item.id === current)) {
            return current;
          }
          return items[0]?.id ?? '';
        });
      })
      .catch((error) => {
        if (abortController.signal.aborted) {
          return;
        }
        console.error(error);
        setLoadError(error.message || 'Failed to load validation experiments');
      })
      .finally(() => {
        if (!abortController.signal.aborted) {
          setLoadingExperiments(false);
        }
      });

    return () => abortController.abort();
  }, []);

  useEffect(() => {
    const dataset = validationDatasets.find(
      (item) => item.id === selectedValidationDataset
    );
    if (!dataset) {
      setSelectedObservedTarget('');
      return;
    }

    setSelectedObservedTarget((current) => {
      if (current && dataset.targets.includes(current)) {
        return current;
      }
      return dataset.targets[0] ?? '';
    });
  }, [selectedValidationDataset, validationDatasets]);

  useEffect(() => {
    if (!selectedValidationDataset || !selectedObservedTarget) {
      setObservedData(null);
      return;
    }

    const abortController = new AbortController();
    const searchParams = new URLSearchParams({
      target: selectedObservedTarget
    });

    setLoadingObserved(true);
    setObservedError(null);

    fetchJson<ObservedResponse>(
      `/api/validation/datasets/${encodeURIComponent(selectedValidationDataset)}/observed?${searchParams.toString()}`,
      abortController.signal
    )
      .then((response) => {
        setObservedData(response);
      })
      .catch((error) => {
        if (abortController.signal.aborted) {
          return;
        }
        console.error(error);
        setObservedData(null);
        setObservedError(
          error.message || 'Failed to load observed validation data'
        );
      })
      .finally(() => {
        if (!abortController.signal.aborted) {
          setLoadingObserved(false);
        }
      });

    return () => abortController.abort();
  }, [selectedObservedTarget, selectedValidationDataset]);

  useEffect(() => {
    if (!selectedExperiment) {
      setExperimentDetail(null);
      setSelectedDataset('');
      return;
    }

    const abortController = new AbortController();
    setLoadingDetail(true);
    setLoadError(null);

    fetchJson<ExperimentDetail>(
      `/api/validation/experiments/${encodeURIComponent(selectedExperiment)}`,
      abortController.signal
    )
      .then((detail) => {
        setExperimentDetail(detail);
        setSelectedDataset((current) => {
          if (
            current &&
            detail.datasets.some((dataset) => dataset.id === current)
          ) {
            return current;
          }
          return detail.datasets[0]?.id ?? '';
        });
      })
      .catch((error) => {
        if (abortController.signal.aborted) {
          return;
        }
        console.error(error);
        setExperimentDetail(null);
        setSelectedDataset('');
        setLoadError(error.message || 'Failed to load validation experiment');
      })
      .finally(() => {
        if (!abortController.signal.aborted) {
          setLoadingDetail(false);
        }
      });

    return () => abortController.abort();
  }, [selectedExperiment]);

  useEffect(() => {
    const dataset = experimentDetail?.datasets.find(
      (item) => item.id === selectedDataset
    );
    if (!dataset) {
      setSelectedTarget('');
      return;
    }

    setSelectedTarget((current) => {
      if (
        current &&
        dataset.targets.some((target) => target.name === current)
      ) {
        return current;
      }
      return dataset.targets[0]?.name ?? '';
    });
  }, [experimentDetail, selectedDataset]);

  useEffect(() => {
    if (!selectedExperiment || !selectedDataset || !selectedTarget) {
      setComparison(null);
      return;
    }

    const abortController = new AbortController();
    const searchParams = new URLSearchParams({
      dataset_id: selectedDataset,
      target: selectedTarget
    });

    setLoadingComparison(true);
    setComparisonError(null);

    fetchJson<ComparisonResponse>(
      `/api/validation/experiments/${encodeURIComponent(selectedExperiment)}/comparison?${searchParams.toString()}`,
      abortController.signal
    )
      .then((response) => {
        setComparison(response);
      })
      .catch((error) => {
        if (abortController.signal.aborted) {
          return;
        }
        console.error(error);
        setComparison(null);
        setComparisonError(
          error.message || 'Failed to load validation comparison'
        );
      })
      .finally(() => {
        if (!abortController.signal.aborted) {
          setLoadingComparison(false);
        }
      });

    return () => abortController.abort();
  }, [selectedDataset, selectedExperiment, selectedTarget]);

  const datasetDetail =
    experimentDetail?.datasets.find(
      (dataset) => dataset.id === selectedDataset
    ) ?? null;
  const validationDatasetDetail =
    validationDatasets.find(
      (dataset) => dataset.id === selectedValidationDataset
    ) ?? null;
  const observedSummary = observedData?.summary ?? null;
  const observedChartData = observedData?.chartData ?? [];
  const observedMetadataEntries = Object.entries(
    observedData?.dataset.metadata ?? {}
  ).filter(
    ([, value]) => value !== null && value !== undefined && value !== ''
  );
  const summaryMetrics =
    comparison?.metrics ??
    datasetDetail?.targets.find((target) => target.name === selectedTarget)
      ?.metrics ??
    null;
  const geographyLabel = datasetDetail
    ? formatGeography(datasetDetail.geography)
    : '';
  const chartData =
    comparison?.chartData.map((point) => ({
      ...point,
      band95Base: point.p025,
      band95Size:
        point.p025 !== null && point.p975 !== null
          ? Math.max(point.p975 - point.p025, 0)
          : null,
      band50Base: point.p25,
      band50Size:
        point.p25 !== null && point.p75 !== null
          ? Math.max(point.p75 - point.p25, 0)
          : null
    })) ?? [];

  return (
    <main className="validation_page">
      <section
        className="validation_header"
        data-aos="fade-up"
        data-aos-once="true"
      >
        <p className="validation_eyebrow">External Validation</p>
        <h1>Observed outcome data review</h1>
        <p className="validation_intro">
          Inspect the real held-out datasets, geography, source metadata, and
          baseline values before attaching simulation outputs to an
          external-validation claim.
        </p>
      </section>

      <section
        className="validation_panel"
        data-aos="fade-up"
        data-aos-delay="80"
        data-aos-once="true"
      >
        <div className="validation_section_heading">
          <div>
            <h2>External Dataset</h2>
            <p>Manifest-backed observed data, before simulation comparisons.</p>
          </div>
          <span className="validation_status_badge">Read-only</span>
        </div>

        <div className="validation_controls">
          <label className="validation_control">
            <span>Dataset</span>
            <select
              value={selectedValidationDataset}
              onChange={(event) =>
                setSelectedValidationDataset(event.target.value)
              }
              disabled={
                loadingValidationDatasets || validationDatasets.length === 0
              }
            >
              {validationDatasets.length === 0 ? (
                <option value="">No datasets found</option>
              ) : (
                validationDatasets.map((dataset) => (
                  <option key={dataset.id} value={dataset.id}>
                    {dataset.label}
                  </option>
                ))
              )}
            </select>
          </label>

          <label className="validation_control">
            <span>Target</span>
            <select
              value={selectedObservedTarget}
              onChange={(event) =>
                setSelectedObservedTarget(event.target.value)
              }
              disabled={!validationDatasetDetail?.targets.length}
            >
              {validationDatasetDetail?.targets.length ? (
                validationDatasetDetail.targets.map((target) => (
                  <option key={target} value={target}>
                    {target}
                  </option>
                ))
              ) : (
                <option value="">No targets available</option>
              )}
            </select>
          </label>

          <div className="validation_control validation_readonly_field">
            <span>Manifest</span>
            <strong>{validationDatasetDetail?.manifest.id ?? 'N/A'}</strong>
          </div>
        </div>

        {validationDatasetError ? (
          <div className="validation_error">{validationDatasetError}</div>
        ) : loadingValidationDatasets ? (
          <div className="validation_empty">Loading validation datasets...</div>
        ) : validationDatasets.length === 0 ? (
          <div className="validation_empty">
            No external validation manifest datasets were found. Set
            `VALIDATION_MANIFEST_PATHS` or add datasets to
            `validation/manifest.json`.
          </div>
        ) : (
          <>
            <div className="validation_summary_grid">
              <div className="validation_summary_card">
                <span className="validation_summary_label">Dataset</span>
                <strong>
                  {validationDatasetDetail?.label ?? 'Select a dataset'}
                </strong>
                <small>
                  {validationDatasetDetail
                    ? `${validationDatasetDetail.disease} • ${validationDatasetDetail.split} • ${validationDatasetDetail.cadence}`
                    : ' '}
                </small>
              </div>
              <div className="validation_summary_card">
                <span className="validation_summary_label">Window</span>
                <strong>
                  {validationDatasetDetail
                    ? `${formatDateLabel(validationDatasetDetail.start_date)} to ${formatDateLabel(validationDatasetDetail.end_date)}`
                    : 'Select a dataset'}
                </strong>
                <small>
                  {validationDatasetDetail
                    ? formatGeography(validationDatasetDetail.geography)
                    : ' '}
                </small>
              </div>
              <div className="validation_summary_card">
                <span className="validation_summary_label">Population</span>
                <strong>
                  {formatMetric(validationDatasetDetail?.population, 0)}
                </strong>
                <small>{selectedObservedTarget || 'Select a target'}</small>
              </div>
            </div>

            {validationDatasetDetail?.notes.length ? (
              <div className="validation_notes">
                {validationDatasetDetail.notes.map((note) => (
                  <p key={note}>{note}</p>
                ))}
              </div>
            ) : null}

            <div className="validation_metrics">
              <article className="validation_metric_card">
                <span>Observed total</span>
                <strong>
                  {formatMetric(observedSummary?.cumulative_observed, 0)}
                </strong>
              </article>
              <article className="validation_metric_card">
                <span>Observed per 100k</span>
                <strong>
                  {formatMetric(observedSummary?.cumulative_observed_per_100k)}
                </strong>
              </article>
              <article className="validation_metric_card">
                <span>Peak observed</span>
                <strong>{formatMetric(observedSummary?.peak_value, 0)}</strong>
                <small>
                  {observedSummary?.peak_date
                    ? formatDateLabel(observedSummary.peak_date)
                    : 'N/A'}
                </small>
              </article>
            </div>

            <div className="validation_chart_shell validation_observed_chart">
              {observedError ? (
                <div className="validation_error">{observedError}</div>
              ) : loadingObserved ? (
                <div className="validation_empty">Loading observed data...</div>
              ) : observedChartData.length === 0 ? (
                <div className="validation_empty">
                  No observed rows were available for the selected dataset and
                  target.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={observedChartData}
                    margin={{ top: 16, right: 24, left: 8, bottom: 8 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#d8d7cf" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={formatDateLabel}
                      minTickGap={32}
                      stroke="#5d576b"
                    />
                    <YAxis
                      tickFormatter={(value: number) =>
                        compactNumberFormatter.format(value)
                      }
                      stroke="#5d576b"
                    />
                    <Tooltip content={<ObservedTooltip />} />
                    <Legend />
                    <Line
                      type="monotone"
                      name="Observed"
                      dataKey="observed"
                      stroke="#222629"
                      strokeWidth={3}
                      dot
                      connectNulls
                      isAnimationActive={false}
                    />
                    <Line
                      type="monotone"
                      name="Persistence baseline"
                      dataKey="baseline"
                      stroke="#f05464"
                      strokeWidth={2}
                      strokeDasharray="6 4"
                      dot
                      connectNulls
                      isAnimationActive={false}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              )}
            </div>

            {observedChartData.length > 0 ? (
              <div className="validation_table_shell">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Observed</th>
                      <th>Baseline</th>
                      <th>Observed per 100k</th>
                    </tr>
                  </thead>
                  <tbody>
                    {observedChartData.map((point) => (
                      <tr key={point.date}>
                        <td>{formatDateLabel(point.date)}</td>
                        <td>{formatMetric(point.observed, 0)}</td>
                        <td>{formatMetric(point.baseline, 0)}</td>
                        <td>{formatMetric(point.observed_per_100k)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}

            {observedMetadataEntries.length > 0 ? (
              <div className="validation_provenance">
                {observedMetadataEntries.map(([key, value]) => (
                  <p key={key}>
                    <span>{key.replaceAll('_', ' ')}</span>
                    <strong>{formatMetadataValue(value)}</strong>
                  </p>
                ))}
              </div>
            ) : null}
          </>
        )}
      </section>

      <section
        className="validation_panel"
        data-aos="fade-up"
        data-aos-delay="80"
        data-aos-once="true"
      >
        <div className="validation_section_heading">
          <div>
            <h2>Simulation Reports</h2>
            <p>
              Finished runs can be compared after a frozen experiment writes
              report files.
            </p>
          </div>
          <span className="validation_status_badge validation_status_badge_secondary">
            Optional
          </span>
        </div>

        <div className="validation_controls">
          <label className="validation_control">
            <span>Experiment</span>
            <select
              value={selectedExperiment}
              onChange={(event) => setSelectedExperiment(event.target.value)}
              disabled={loadingExperiments || experiments.length === 0}
            >
              {experiments.length === 0 ? (
                <option value="">No experiments found</option>
              ) : (
                experiments.map((experiment) => (
                  <option key={experiment.id} value={experiment.id}>
                    {experiment.name} ({experiment.dataset_count} datasets)
                  </option>
                ))
              )}
            </select>
          </label>

          <label className="validation_control">
            <span>Dataset</span>
            <select
              value={selectedDataset}
              onChange={(event) => setSelectedDataset(event.target.value)}
              disabled={loadingDetail || !experimentDetail?.datasets.length}
            >
              {experimentDetail?.datasets.length ? (
                experimentDetail.datasets.map((dataset) => (
                  <option key={dataset.id} value={dataset.id}>
                    {dataset.label}
                  </option>
                ))
              ) : (
                <option value="">No datasets available</option>
              )}
            </select>
          </label>

          <label className="validation_control">
            <span>Target</span>
            <select
              value={selectedTarget}
              onChange={(event) => setSelectedTarget(event.target.value)}
              disabled={!datasetDetail?.targets.length}
            >
              {datasetDetail?.targets.length ? (
                datasetDetail.targets.map((target) => (
                  <option key={target.name} value={target.name}>
                    {target.name}
                  </option>
                ))
              ) : (
                <option value="">No targets available</option>
              )}
            </select>
          </label>
        </div>

        {loadError ? (
          <div className="validation_error">{loadError}</div>
        ) : loadingExperiments ? (
          <div className="validation_empty">
            Loading validation experiments...
          </div>
        ) : experiments.length === 0 ? (
          <div className="validation_empty">
            No simulation experiment output was found in the configured reports
            directory. Run `scripts/run_validation_experiment.py` first, or
            point `VALIDATION_REPORTS_DIR` at the folder that contains your
            experiment result directories.
          </div>
        ) : (
          <>
            <div className="validation_summary_grid">
              <div className="validation_summary_card">
                <span className="validation_summary_label">Dataset</span>
                <strong>{datasetDetail?.label ?? 'Select a dataset'}</strong>
                <small>
                  {datasetDetail
                    ? `${datasetDetail.disease} • ${datasetDetail.split} • ${datasetDetail.cadence}`
                    : ' '}
                </small>
              </div>
              <div className="validation_summary_card">
                <span className="validation_summary_label">Window</span>
                <strong>
                  {datasetDetail
                    ? `${formatDateLabel(datasetDetail.start_date)} to ${formatDateLabel(datasetDetail.end_date)}`
                    : 'Select a dataset'}
                </strong>
                <small>{geographyLabel || ' '}</small>
              </div>
              <div className="validation_summary_card">
                <span className="validation_summary_label">Target</span>
                <strong>{selectedTarget || 'Select a target'}</strong>
                <small>
                  {selectedExperiment ? experimentDetail?.name : ' '}
                </small>
              </div>
            </div>

            {datasetDetail?.notes.length ? (
              <div className="validation_notes">
                {datasetDetail.notes.map((note) => (
                  <p key={note}>{note}</p>
                ))}
              </div>
            ) : null}

            <div className="validation_metrics">
              <article className="validation_metric_card">
                <span>MAE</span>
                <strong>{formatMetric(summaryMetrics?.mae)}</strong>
              </article>
              <article className="validation_metric_card">
                <span>RMSE</span>
                <strong>{formatMetric(summaryMetrics?.rmse)}</strong>
              </article>
              <article className="validation_metric_card">
                <span>Weighted Interval Score</span>
                <strong>{formatMetric(summaryMetrics?.wis)}</strong>
              </article>
              <article className="validation_metric_card">
                <span>95% coverage</span>
                <strong>{formatPercent(summaryMetrics?.coverage_95)}</strong>
              </article>
              <article className="validation_metric_card">
                <span>MAE skill vs baseline</span>
                <strong>
                  {formatPercent(summaryMetrics?.baseline_mae_skill)}
                </strong>
              </article>
              <article className="validation_metric_card">
                <span>RMSE skill vs baseline</span>
                <strong>
                  {formatPercent(summaryMetrics?.baseline_rmse_skill)}
                </strong>
              </article>
            </div>

            <div className="validation_chart_shell">
              {comparisonError ? (
                <div className="validation_error">{comparisonError}</div>
              ) : loadingComparison ? (
                <div className="validation_empty">
                  Loading comparison chart...
                </div>
              ) : chartData.length === 0 ? (
                <div className="validation_empty">
                  No comparison points were available for the selected dataset
                  and target.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={chartData}
                    margin={{ top: 16, right: 24, left: 8, bottom: 8 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#d8d7cf" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={formatDateLabel}
                      minTickGap={32}
                      stroke="#5d576b"
                    />
                    <YAxis
                      tickFormatter={(value: number) =>
                        compactNumberFormatter.format(value)
                      }
                      stroke="#5d576b"
                    />
                    <Tooltip content={<ValidationTooltip />} />
                    <Legend />
                    <Area
                      dataKey="band95Base"
                      stackId="band95"
                      stroke="none"
                      fill="transparent"
                      legendType="none"
                      isAnimationActive={false}
                    />
                    <Area
                      dataKey="band95Size"
                      name="95% interval"
                      stackId="band95"
                      stroke="none"
                      fill="#70b4d4"
                      fillOpacity={0.12}
                      isAnimationActive={false}
                    />
                    <Area
                      dataKey="band50Base"
                      stackId="band50"
                      stroke="none"
                      fill="transparent"
                      legendType="none"
                      isAnimationActive={false}
                    />
                    <Area
                      dataKey="band50Size"
                      name="50% interval"
                      stackId="band50"
                      stroke="none"
                      fill="#88d2d8"
                      fillOpacity={0.26}
                      isAnimationActive={false}
                    />
                    <Line
                      type="monotone"
                      name="Observed"
                      dataKey="observed"
                      stroke="#222629"
                      strokeWidth={3}
                      dot={false}
                      connectNulls
                      isAnimationActive={false}
                    />
                    <Line
                      type="monotone"
                      name="Baseline"
                      dataKey="baseline"
                      stroke="#f05464"
                      strokeWidth={2}
                      strokeDasharray="6 4"
                      dot={false}
                      connectNulls
                      isAnimationActive={false}
                    />
                    <Line
                      type="monotone"
                      name="Predicted median"
                      dataKey="median"
                      stroke="#2d7da8"
                      strokeWidth={2.5}
                      dot={false}
                      connectNulls
                      isAnimationActive={false}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="validation_metric_footer">
              <p>
                Peak-day offset:{' '}
                {formatMetric(summaryMetrics?.peak_day_offset_days, 0)} days
              </p>
              <p>
                Cumulative error:{' '}
                {formatMetric(summaryMetrics?.cumulative_error)}
              </p>
              <p>50% coverage: {formatPercent(summaryMetrics?.coverage_50)}</p>
              <p>
                Chart values are aligned to observed{' '}
                {datasetDetail?.cadence ?? 'daily'} endpoints.
              </p>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
