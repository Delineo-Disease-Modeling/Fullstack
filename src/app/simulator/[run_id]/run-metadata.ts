// Pure helpers + types for the simulator run page: parsing the (untrusted) run
// metadata blob, run-view labels, and date formatting. No React and no runtime
// imports (types only), so this stays unit-testable in isolation via node:test.
import type {
  PapData,
  PoiPeaks,
  RunIncidence,
  SimData
} from '@/stores/mapdata';
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
  incidence: RunIncidence | null;
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

function normalizeCbgId(value: unknown) {
  if (value === null || value === undefined) {
    return '';
  }

  const raw = String(value).trim();
  if (!/^\d+$/.test(raw)) {
    return '';
  }

  return raw.length === 11 ? raw.padStart(12, '0') : raw;
}

function addSeedCbgIds(target: Set<string>, value: unknown) {
  if (Array.isArray(value)) {
    for (const item of value) {
      addSeedCbgIds(target, item);
    }
    return;
  }

  const cbgId = normalizeCbgId(value);
  if (cbgId) {
    target.add(cbgId);
  }
}

function addSeedCbgIdsFromDescription(target: Set<string>, value: unknown) {
  if (typeof value !== 'string') {
    return;
  }

  const match = value.match(/^Seed CBGs?:\s*([0-9][0-9,\s]*)\s*$/im);
  if (match) {
    for (const cbgId of match[1].split(/[,\s]+/)) {
      addSeedCbgIds(target, cbgId);
    }
  }
}

function getSeedCbgCountFromDescription(value: unknown) {
  if (typeof value !== 'string') {
    return 0;
  }

  const match = value.match(/^Seed region:\s*(\d+)\s+seed CBGs?\b/im);
  const count = Number(match?.[1]);
  return Number.isInteger(count) && count > 0 ? count : 0;
}

function getSeedRegionLabelFromDescription(value: unknown) {
  if (typeof value !== 'string') {
    return '';
  }

  const match = value.match(/^Seed region:\s*(.+?)\s*$/im);
  const label = String(match?.[1] ?? '').trim();
  if (!label || /^\d+\s+seed CBGs?$/i.test(label)) {
    return '';
  }
  return label;
}

function getLocationLabelFromDescription(value: unknown) {
  if (typeof value !== 'string') {
    return '';
  }

  const match = value.match(/^Location:\s*(.+?)\s*$/im);
  const label = String(match?.[1] ?? '').trim();
  return label && label !== 'N/A' && label.toUpperCase() !== 'TEST'
    ? label
    : '';
}

function addSeedCbgIdsFromRecord(
  target: Set<string>,
  record: Record<string, unknown> | null
) {
  if (!record) {
    return;
  }

  addSeedCbgIds(target, record.seed_cbg);
  addSeedCbgIds(target, record.seed_cbgs);
  addSeedCbgIds(target, record.seed_cbg_id);
  addSeedCbgIds(target, record.seed_cbg_ids);
  addSeedCbgIdsFromDescription(target, record.description);

  for (const key of [
    'algorithm_metadata',
    'guided_metadata',
    'zone',
    'czone',
    'convenience_zone'
  ]) {
    addSeedCbgIdsFromRecord(target, asRecord(record[key]));
  }
}

export function getSeedCbgIdsForRun(
  zone:
    | {
        description?: string | null;
        cbg_list?: unknown[] | null;
      }
    | null
    | undefined,
  metadata: unknown
) {
  const seedCbgIds = new Set<string>();
  const seedCbgCount = getSeedCbgCountFromDescription(zone?.description);
  const addCountedZoneSeedCbgs = () => {
    if (seedCbgCount <= 0 || seedCbgIds.size >= seedCbgCount) {
      return;
    }
    for (const cbgId of zone?.cbg_list?.slice(0, seedCbgCount) ?? []) {
      addSeedCbgIds(seedCbgIds, cbgId);
    }
  };

  addSeedCbgIdsFromRecord(seedCbgIds, asRecord(metadata));
  addCountedZoneSeedCbgs();
  if (seedCbgIds.size > 0) {
    return [...seedCbgIds];
  }

  addSeedCbgIdsFromDescription(seedCbgIds, zone?.description);
  addCountedZoneSeedCbgs();
  if (seedCbgIds.size > 0) {
    return [...seedCbgIds];
  }

  addSeedCbgIds(seedCbgIds, zone?.cbg_list?.[0]);
  return [...seedCbgIds];
}

export function getSeedRegionLookupQueryForRun(
  zone:
    | {
        description?: string | null;
      }
    | null
    | undefined,
  metadata: unknown
) {
  const zoneLabel = getSeedRegionLabelFromDescription(zone?.description);
  if (zoneLabel) {
    return zoneLabel;
  }

  const zoneLocation = getLocationLabelFromDescription(zone?.description);
  if (zoneLocation) {
    return zoneLocation;
  }

  const metadataRecord = asRecord(metadata);
  for (const key of ['zone', 'czone', 'convenience_zone']) {
    const description = asRecord(metadataRecord?.[key])?.description;
    const label =
      getSeedRegionLabelFromDescription(description) ||
      getLocationLabelFromDescription(description);
    if (label) {
      return label;
    }
  }

  return '';
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
    initial_infected_ids:
      getStringArray(record.initial_infected_ids) ??
      fallback.initial_infected_ids,
    randseed:
      typeof record.randseed === 'boolean'
        ? record.randseed
        : fallback.randseed,
    interventions:
      getInterventions(record.interventions) ?? fallback.interventions
  };
}
