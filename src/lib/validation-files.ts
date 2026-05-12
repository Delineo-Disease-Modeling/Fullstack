import { constants } from 'node:fs';
import { access, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

export const VALIDATION_REPORTS_DIR =
  process.env.VALIDATION_REPORTS_DIR ||
  path.resolve(process.cwd(), '../reports');
export const VALIDATION_MANIFEST_PATHS = (
  process.env.VALIDATION_MANIFEST_PATHS ||
  path.resolve(process.cwd(), '../validation/manifest.json')
)
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);

type ExperimentSummary = {
  name: string;
  validation_manifest: string;
  datasets: Record<
    string,
    {
      result_paths: string[];
      start_date?: string;
      targets: Record<
        string,
        {
          mae: number;
          rmse: number;
          wis: number;
          coverage_95: number;
          baseline_mae_skill?: number | null;
          baseline_rmse_skill?: number | null;
        }
      >;
    }
  >;
};

type ValidationDataset = {
  id: string;
  label: string;
  disease: string;
  split: string;
  population: number;
  start_date: string;
  end_date: string;
  series_csv: string;
  baseline_csv?: string;
  date_column?: string;
  targets: Record<string, string>;
  cadence?: string;
  simulation_aggregation?: string;
  aggregation_anchor_date?: string;
  geography?: Record<string, unknown>;
  notes?: string[];
  metadata?: Record<string, unknown>;
};

type ValidationManifest = {
  version: number;
  datasets: ValidationDataset[];
};

type PredictionSummary = {
  target_name: string;
  dates: string[];
  median: number[];
  p25: number[];
  p75: number[];
  p025: number[];
  p975: number[];
};

type ValidationMetrics = Record<string, unknown>;

type LoadedValidationManifest = {
  id: string;
  path: string;
  manifest: ValidationManifest;
};

export async function listValidationExperiments() {
  try {
    const entries = await readdir(VALIDATION_REPORTS_DIR, {
      withFileTypes: true
    });
    const experiments = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map(async (entry) => {
          try {
            const summary = await loadExperimentSummary(entry.name);
            return {
              id: entry.name,
              name: summary.name,
              dataset_count: Object.keys(summary.datasets ?? {}).length
            };
          } catch {
            return null;
          }
        })
    );

    return experiments
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .sort(
        (left, right) =>
          left.name.localeCompare(right.name) || left.id.localeCompare(right.id)
      );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

export async function listValidationDatasets() {
  const manifests = await loadConfiguredValidationManifests();

  return manifests
    .flatMap((loadedManifest) =>
      loadedManifest.manifest.datasets.map((dataset) => ({
        id: dataset.id,
        label: dataset.label,
        disease: dataset.disease,
        split: dataset.split,
        population: dataset.population,
        start_date: dataset.start_date,
        end_date: dataset.end_date,
        cadence: dataset.cadence ?? 'daily',
        geography: dataset.geography ?? {},
        notes: dataset.notes ?? [],
        metadata: dataset.metadata ?? {},
        targets: Object.keys(dataset.targets ?? {}),
        manifest: {
          id: loadedManifest.id,
          path: loadedManifest.path
        }
      }))
    )
    .sort(
      (left, right) =>
        left.label.localeCompare(right.label) ||
        left.split.localeCompare(right.split) ||
        left.id.localeCompare(right.id)
    );
}

export async function loadValidationDatasetObserved(
  datasetId: string,
  target: string
) {
  if (!/^[A-Za-z0-9._-]+$/.test(datasetId)) {
    throw new Error('Invalid dataset id');
  }

  const manifests = await loadConfiguredValidationManifests();
  const matches = manifests
    .map((loadedManifest) => ({
      loadedManifest,
      dataset: loadedManifest.manifest.datasets.find(
        (item) => item.id === datasetId
      )
    }))
    .filter(
      (
        match
      ): match is {
        loadedManifest: LoadedValidationManifest;
        dataset: ValidationDataset;
      } => Boolean(match.dataset)
    );

  if (matches.length === 0) {
    throw new Error(`Dataset '${datasetId}' was not found`);
  }
  if (matches.length > 1) {
    throw new Error(
      `Dataset '${datasetId}' exists in multiple validation manifests`
    );
  }

  const { loadedManifest, dataset } = matches[0];

  if (!(target in dataset.targets)) {
    throw new Error(
      `Target '${target}' was not found in dataset '${datasetId}'`
    );
  }

  const [observed, baseline] = await Promise.all([
    loadCsvRows(
      resolveManifestPath(loadedManifest.path, dataset.series_csv),
      dataset.date_column ?? 'date',
      dataset.targets[target]
    ),
    dataset.baseline_csv
      ? loadCsvRows(
          resolveManifestPath(loadedManifest.path, dataset.baseline_csv),
          dataset.date_column ?? 'date',
          dataset.targets[target]
        )
      : Promise.resolve(null)
  ]);

  const baselineByDate =
    baseline?.reduce<Record<string, number>>((accumulator, row) => {
      accumulator[row.date] = row.value;
      return accumulator;
    }, {}) ?? {};

  const chartData = observed.map((row) => ({
    date: row.date,
    observed: row.value,
    baseline: baselineByDate[row.date] ?? null,
    observed_per_100k: normalizePer100k(row.value, dataset.population),
    baseline_per_100k:
      baselineByDate[row.date] === undefined
        ? null
        : normalizePer100k(baselineByDate[row.date], dataset.population)
  }));

  return {
    manifest: {
      id: loadedManifest.id,
      path: loadedManifest.path
    },
    dataset: {
      id: dataset.id,
      label: dataset.label,
      disease: dataset.disease,
      split: dataset.split,
      population: dataset.population,
      cadence: dataset.cadence ?? 'daily',
      geography: dataset.geography ?? {},
      notes: dataset.notes ?? [],
      metadata: dataset.metadata ?? {},
      start_date: dataset.start_date,
      end_date: dataset.end_date,
      targets: Object.keys(dataset.targets ?? {}),
      manifest: {
        id: loadedManifest.id,
        path: loadedManifest.path
      }
    },
    target,
    summary: summarizeObservedRows(chartData, dataset.population),
    chartData
  };
}

export async function loadExperimentSummary(
  experimentId: string
): Promise<ExperimentSummary> {
  const summaryPath = path.join(
    resolveExperimentDir(experimentId),
    'experiment_summary.json'
  );
  return JSON.parse(await readFile(summaryPath, 'utf8')) as ExperimentSummary;
}

export async function loadExperimentManifest(
  summary: ExperimentSummary
): Promise<ValidationManifest> {
  return JSON.parse(
    await readFile(summary.validation_manifest, 'utf8')
  ) as ValidationManifest;
}

export async function loadExperimentComparison(
  experimentId: string,
  datasetId: string,
  target: string
) {
  const summary = await loadExperimentSummary(experimentId);
  const manifest = await loadExperimentManifest(summary);
  const dataset = manifest.datasets.find((item) => item.id === datasetId);
  const datasetRun = summary.datasets?.[datasetId];

  if (!dataset || !datasetRun) {
    throw new Error(
      `Dataset '${datasetId}' was not found in experiment '${experimentId}'`
    );
  }

  if (!(target in dataset.targets)) {
    throw new Error(
      `Target '${target}' was not found in dataset '${datasetId}'`
    );
  }

  const reportDir = path.join(
    resolveExperimentDir(experimentId),
    datasetId,
    'reports'
  );
  const [predictionSummary, metrics, observed, baseline] = await Promise.all([
    loadPredictionSummary(reportDir, target),
    loadMetrics(reportDir, target),
    loadCsvSeries(
      resolveManifestPath(summary.validation_manifest, dataset.series_csv),
      dataset.date_column ?? 'date',
      dataset.targets[target]
    ),
    dataset.baseline_csv
      ? loadCsvSeries(
          resolveManifestPath(
            summary.validation_manifest,
            dataset.baseline_csv
          ),
          dataset.date_column ?? 'date',
          dataset.targets[target]
        )
      : Promise.resolve(null)
  ]);

  const chartData = predictionSummary.dates.map((date, index) => ({
    date,
    observed: observed.valuesByDate[date] ?? null,
    baseline: baseline?.valuesByDate[date] ?? null,
    median: predictionSummary.median[index] ?? null,
    p25: predictionSummary.p25[index] ?? null,
    p75: predictionSummary.p75[index] ?? null,
    p025: predictionSummary.p025[index] ?? null,
    p975: predictionSummary.p975[index] ?? null
  }));

  return {
    experiment: {
      id: experimentId,
      name: summary.name
    },
    dataset: {
      id: dataset.id,
      label: dataset.label,
      disease: dataset.disease,
      split: dataset.split,
      cadence: dataset.cadence ?? 'daily',
      geography: dataset.geography ?? {},
      notes: dataset.notes ?? [],
      start_date: dataset.start_date,
      end_date: dataset.end_date
    },
    target,
    metrics,
    chartData
  };
}

export async function loadExperimentDetail(experimentId: string) {
  const summary = await loadExperimentSummary(experimentId);
  const manifest = await loadExperimentManifest(summary);

  return {
    id: experimentId,
    name: summary.name,
    validation_manifest: summary.validation_manifest,
    datasets: manifest.datasets
      .filter((dataset) => summary.datasets[dataset.id])
      .map((dataset) => ({
        id: dataset.id,
        label: dataset.label,
        disease: dataset.disease,
        split: dataset.split,
        cadence: dataset.cadence ?? 'daily',
        start_date: dataset.start_date,
        end_date: dataset.end_date,
        geography: dataset.geography ?? {},
        notes: dataset.notes ?? [],
        targets: Object.entries(summary.datasets[dataset.id].targets ?? {}).map(
          ([targetName, metrics]) => ({
            name: targetName,
            metrics
          })
        )
      }))
  };
}

function resolveExperimentDir(experimentId: string) {
  if (!/^[A-Za-z0-9._-]+$/.test(experimentId)) {
    throw new Error('Invalid experiment id');
  }
  return path.join(VALIDATION_REPORTS_DIR, experimentId);
}

async function loadPredictionSummary(reportDir: string, target: string) {
  const summaryPath = path.join(reportDir, `${target}_prediction_summary.json`);
  return JSON.parse(await readFile(summaryPath, 'utf8')) as PredictionSummary;
}

async function loadMetrics(reportDir: string, target: string) {
  const metricsPath = path.join(reportDir, `${target}_metrics.json`);
  return JSON.parse(await readFile(metricsPath, 'utf8')) as ValidationMetrics;
}

async function loadCsvSeries(
  csvPath: string,
  dateColumn: string,
  valueColumn: string
) {
  const rows = await loadCsvRows(csvPath, dateColumn, valueColumn);
  return {
    valuesByDate: rows.reduce<Record<string, number>>((accumulator, row) => {
      accumulator[row.date] = row.value;
      return accumulator;
    }, {})
  };
}

async function loadCsvRows(
  csvPath: string,
  dateColumn: string,
  valueColumn: string
) {
  await access(csvPath, constants.F_OK);
  const raw = await readFile(csvPath, 'utf8');
  const lines = raw.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) {
    throw new Error(`CSV '${csvPath}' does not contain any data rows`);
  }

  const headers = parseCsvLine(lines[0]);
  const dateIndex = headers.indexOf(dateColumn);
  const valueIndex = headers.indexOf(valueColumn);
  if (dateIndex === -1 || valueIndex === -1) {
    throw new Error(`CSV '${csvPath}' is missing required columns`);
  }

  const rows: Array<{ date: string; value: number }> = [];
  for (const line of lines.slice(1)) {
    const fields = parseCsvLine(line);
    const date = fields[dateIndex];
    const rawValue = fields[valueIndex];
    if (!date || rawValue === undefined || rawValue === '') {
      continue;
    }
    const value = Number(rawValue);
    if (!Number.isFinite(value)) {
      continue;
    }
    rows.push({ date, value });
  }

  return rows;
}

function resolveManifestPath(
  manifestPath: string,
  relativeOrAbsolutePath: string
) {
  if (path.isAbsolute(relativeOrAbsolutePath)) {
    return relativeOrAbsolutePath;
  }
  return path.resolve(path.dirname(manifestPath), relativeOrAbsolutePath);
}

async function loadConfiguredValidationManifests(): Promise<
  LoadedValidationManifest[]
> {
  const manifests = await Promise.all(
    VALIDATION_MANIFEST_PATHS.map(async (manifestPath) => {
      const absolutePath = path.resolve(manifestPath);
      const manifest = JSON.parse(
        await readFile(absolutePath, 'utf8')
      ) as ValidationManifest;
      return {
        id: manifestIdFromPath(absolutePath),
        path: absolutePath,
        manifest
      };
    })
  );

  return manifests.filter(
    (loadedManifest) => loadedManifest.manifest.datasets?.length
  );
}

function manifestIdFromPath(manifestPath: string) {
  const basename = path.basename(manifestPath, path.extname(manifestPath));
  return basename === 'manifest' ? 'external-validation' : basename;
}

function parseCsvLine(line: string) {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const nextChar = line[index + 1];

    if (char === '"' && inQuotes && nextChar === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      fields.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  fields.push(current);
  return fields;
}

function normalizePer100k(value: number, population: number) {
  if (!population || population <= 0) {
    return null;
  }
  return (value / population) * 100000;
}

function summarizeObservedRows(
  chartData: Array<{ date: string; observed: number; baseline: number | null }>,
  population: number
) {
  const cumulativeObserved = chartData.reduce(
    (total, point) => total + point.observed,
    0
  );
  const cumulativeBaseline = chartData.reduce(
    (total, point) => total + (point.baseline ?? 0),
    0
  );
  const peak = chartData.reduce<{ date: string | null; value: number | null }>(
    (currentPeak, point) => {
      if (currentPeak.value === null || point.observed > currentPeak.value) {
        return { date: point.date, value: point.observed };
      }
      return currentPeak;
    },
    { date: null, value: null }
  );

  return {
    row_count: chartData.length,
    cumulative_observed: cumulativeObserved,
    cumulative_observed_per_100k: normalizePer100k(
      cumulativeObserved,
      population
    ),
    cumulative_baseline: cumulativeBaseline,
    cumulative_baseline_per_100k: normalizePer100k(
      cumulativeBaseline,
      population
    ),
    peak_date: peak.date,
    peak_value: peak.value,
    peak_per_100k:
      peak.value === null ? null : normalizePer100k(peak.value, population)
  };
}
