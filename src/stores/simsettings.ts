import { create } from 'zustand';

export type ConvenienceZone = {
  id: number;
  name: string;
  description: string;
  latitude: number;
  longitude: number;
  cbg_list: string[];
  size: number;
  length: number;
  start_date: string;
  created_at: string;
  user_id: string;
  ready?: boolean;
};

// Intervention values are 0.0-1.0 thresholds/proportions. The simulator
// applies them by comparing each person's stable intervention threshold.
export type Interventions = {
  time: number;
  mask: number;
  vaccine: number;
  capacity: number;
  lockdown: number;
  selfiso: number;
};

export type InterventionValues = Omit<Interventions, 'time'>;

export type DmpMode = 'auto' | 'required' | 'off';

export type SimSettings = {
  sim_id: number | null;
  zone: ConvenienceZone | null;
  hours: number;
  randseed: boolean;
  usecache: boolean;
  initial_infected_count: number;
  disease_name: string;
  variants: string[];
  dmp_mode: DmpMode;
  model_path_by_variant: Record<string, string | null>;
  matrix_by_variant: Record<string, number | null>;
  interventions: Interventions[];
};

interface SimSettingsActions {
  setSettings: (new_settings: Partial<SimSettings>) => void;
  addInterventions: (
    time: number,
    values?: InterventionValues
  ) => void;
  deleteInterventions: (time: number) => void;
}

type SimSettingsStore = SimSettings & SimSettingsActions;

export const DEFAULT_INTERVENTION_VALUES: InterventionValues = {
  mask: 0.0,
  vaccine: 0.0,
  capacity: 1.0,
  lockdown: 0.0,
  selfiso: 0.0
};

export const DEFAULT_INTERVENTIONS: Interventions = {
  time: 0,
  ...DEFAULT_INTERVENTION_VALUES
};

const default_settings: SimSettings = {
  sim_id: null,
  zone: null,
  hours: 84,
  randseed: true,
  usecache: true,
  initial_infected_count: 1,
  disease_name: 'COVID-19',
  variants: ['Delta'],
  dmp_mode: 'auto',
  model_path_by_variant: {
    Delta: 'variant.Delta.general'
  },
  matrix_by_variant: {},
  interventions: [{ ...DEFAULT_INTERVENTIONS }]
};

const useSimSettings = create<SimSettingsStore>((set) => ({
  ...default_settings,

  setSettings: (new_settings) => {
    set((state) => ({ ...state, ...new_settings }));
  },

  addInterventions: (time, values = DEFAULT_INTERVENTION_VALUES) => {
    set((state) => ({
      interventions: state.interventions.concat({
        ...values,
        time
      })
    }));
  },

  deleteInterventions: (time) => {
    set((state) => ({
      interventions: state.interventions.filter((i) => i.time !== time)
    }));
  }
}));

export default useSimSettings;
