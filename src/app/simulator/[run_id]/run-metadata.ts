// Pure helpers + types for the simulator run page: parsing the (untrusted) run
// metadata blob, run-view labels, and date formatting. No React and no runtime
// imports (types only), so this stays unit-testable in isolation via node:test.
import type { PapData, PoiPeaks, SimData } from '@/stores/mapdata';
import type { SimSettings as SimSettingsState } from '@/stores/simsettings';

export interface SelectedLoc {
  id: string;
  label: string;
  type: string;
}

// The map-store fields that differ between the intervention and baseline runs.
// Held in local state so the toggle can swap them without re-fetching.
export interface SimRunData {
  simdata: SimData | null;
  papdata: PapData | null;
  hotspots: { [key: string]: number[] } | null;
  timesteps: number[] | null;
  poiPeaks: PoiPeaks | null;
  metadata?: unknown;
}

export type RunView = 'intervention' | 'baseline' | 'disabled';

export const RUN_VIEW_LABELS: Record<RunView, string> = {
  intervention: 'With interventions',
  baseline: 'Baseline',
  disabled: 'Disabled POIs'
};

// Stable identity so gating the map overlay off doesn't churn ModelMap's memo.
export const EMPTY_DISABLED_POI_IDS: ReadonlySet<string> = new Set();

export function formatRunDate(value?: string | null) {
  if (!value) {
    return 'Unknown date';
  }
  return new Date(value).toLocaleDateString();
}

export function getDisabledPoiIdsFromMetadata(metadata: unknown) {
  if (!metadata || typeof metadata !== 'object') {
    return [];
  }

  const ids = (metadata as Record<string, unknown>).disabled_poi_ids;
  if (!Array.isArray(ids)) {
    return [];
  }

  return ids.map((id) => String(id).trim()).filter(Boolean);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : null;
}

export function getStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return null;
  }
  const strings = value.map((item) => String(item).trim()).filter(Boolean);
  return strings.length > 0 ? strings : null;
}

export function getModelPaths(value: unknown) {
  const record = asRecord(value);
  if (!record) {
    return null;
  }
  const paths: Record<string, string | null> = {};
  for (const [variant, path] of Object.entries(record)) {
    if (path === null || typeof path === 'string') {
      paths[variant] = path;
    }
  }
  return paths;
}

export function getInterventions(
  value: unknown
): SimSettingsState['interventions'] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const interventions = value.filter((item) => {
    const record = asRecord(item);
    return (
      record &&
      ['time', 'mask', 'vaccine', 'capacity', 'lockdown', 'selfiso'].every(
        (key) => typeof record[key] === 'number'
      )
    );
  }) as SimSettingsState['interventions'];
  return interventions.length > 0 ? interventions : null;
}

export function getRunSettingsFromMetadata(
  metadata: unknown,
  fallback: SimSettingsState
): Partial<SimSettingsState> {
  const record = asRecord(metadata);
  if (!record) {
    return {};
  }

  const dmpMode =
    record.dmp_mode === 'required' || record.dmp_mode === 'off'
      ? record.dmp_mode
      : record.dmp_mode === 'auto'
        ? 'auto'
        : null;

  return {
    disease_name:
      typeof record.disease_name === 'string'
        ? record.disease_name
        : fallback.disease_name,
    variants: getStringArray(record.variants) ?? fallback.variants,
    dmp_mode: dmpMode ?? fallback.dmp_mode,
    model_path_by_variant:
      getModelPaths(record.model_path_by_variant) ??
      fallback.model_path_by_variant,
    initial_infected_count:
      typeof record.initial_infected_count === 'number'
        ? record.initial_infected_count
        : fallback.initial_infected_count,
    randseed:
      typeof record.randseed === 'boolean'
        ? record.randseed
        : fallback.randseed,
    interventions:
      getInterventions(record.interventions) ?? fallback.interventions
  };
}
