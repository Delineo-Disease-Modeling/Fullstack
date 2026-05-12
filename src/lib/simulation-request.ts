import type { DmpMode, Interventions, SimSettings } from '@/stores/simsettings';
import {
  getInclusiveEndDateIso,
  getStateFromCBG,
  getZoneLocationName,
  toSimulationDateParam
} from './simulation-zone';

export const DEFAULT_DISEASE_NAME = 'COVID-19';
export const DEFAULT_VARIANTS = ['Delta', 'Omicron'];

export type SimulationRequestBody = SimSettings & {
  czone_id: number;
  length: number;
  start_date: string;
  end_date: string;
  state: string;
  location: string;
  initial_infected_count: number;
  disease_name: string;
  variants: string[];
  dmp_mode: DmpMode;
  model_path_by_variant: Record<string, string | null>;
  interventions: Interventions[];
  randseed: boolean;
};

type BuildSimulationRequestResult =
  | { body: SimulationRequestBody; error: null }
  | { body: null; error: string };

export function buildSimulationRequest(
  settings: SimSettings
): BuildSimulationRequestResult {
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

  return {
    body: {
      ...settings,
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
      interventions: settings.interventions,
      randseed: settings.randseed
    },
    error: null
  };
}
