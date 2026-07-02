import type { DmpMode, Interventions, SimSettings } from '@/stores/simsettings';
import {
  getInclusiveEndDateIso,
  getStateFromCBG,
  getZoneLocationName,
  toSimulationDateParam
} from './simulation-zone';

export const DEFAULT_DISEASE_NAME = 'COVID-19';
export const DEFAULT_VARIANTS = ['Delta'];

export type SimulationRequestBody = Omit<SimSettings, 'compareBaseline'> & {
  czone_id: number;
  length: number;
  start_date: string;
  end_date: string;
  state: string;
  location: string;
  initial_infected_count: number;
  initial_infected_ids: string[];
  disease_name: string;
  variants: string[];
  dmp_mode: DmpMode;
  model_path_by_variant: Record<string, string | null>;
  matrix_csv_by_variant: Record<string, string>;
  interventions: Interventions[];
  randseed: boolean;
};

type BuildSimulationRequestResult =
  | { body: SimulationRequestBody; error: null }
  | { body: null; error: string };

async function fetchMatrixCsvByVariant(
  matrixByVariant: Record<string, number | null>
): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  await Promise.all(
    Object.entries(matrixByVariant).map(async ([variant, matrixId]) => {
      if (matrixId == null) return;
      try {
        const res = await fetch(`/api/dmp/matrices/${matrixId}`);
        if (!res.ok) return;
        const json = await res.json();
        if (typeof json.data?.content === 'string') {
          result[variant] = json.data.content;
        }
      } catch {
        // silently skip — simulation will fall back to DMP API or config defaults
      }
    })
  );
  return result;
}

export async function buildSimulationRequest(
  settings: SimSettings
): Promise<BuildSimulationRequestResult> {
  const zone = settings.zone;
  if (!zone) {
    return { body: null, error: 'Please pick a convenience zone first.' };
  }

  const startDate = toSimulationDateParam(zone.start_date);
  const endDate = toSimulationDateParam(
    getInclusiveEndDateIso(zone.start_date, settings.hours)
  );
  const state = getStateFromCBG(zone.cbg_list);

  if (!startDate || !endDate || !state) {
    return {
      body: null,
      error: 'Selected convenience zone is missing required simulation data.'
    };
  }

  const variants = settings.variants
    .map((variant) => variant.trim())
    .filter(Boolean);

  const matrixCsvByVariant = await fetchMatrixCsvByVariant(
    settings.matrix_by_variant
  );

  // compareBaseline is a client-only UI flag; keep it out of the sim payload.
  const { compareBaseline: _compareBaseline, ...settingsForBody } = settings;

  return {
    body: {
      ...settingsForBody,
      czone_id: zone.id,
      length: settings.hours * 60,
      start_date: startDate,
      end_date: endDate,
      state,
      location: getZoneLocationName(zone),
      initial_infected_count: settings.initial_infected_count,
      disease_name: settings.disease_name.trim() || DEFAULT_DISEASE_NAME,
      variants: variants.length ? variants : [...DEFAULT_VARIANTS],
      dmp_mode: settings.dmp_mode,
      model_path_by_variant: settings.model_path_by_variant,
      matrix_csv_by_variant: matrixCsvByVariant,
      interventions: settings.interventions,
      randseed: settings.randseed
    },
    error: null
  };
}
