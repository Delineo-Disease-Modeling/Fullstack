import { create } from 'zustand';

type ConvenienceZone = {
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

type Interventions = {
  time: number;
  mask: number;
  vaccine: number;
  capacity: number;
  lockdown: number;
  selfiso: number;
};

type SimSettings = {
  sim_id: number | null;
  zone: ConvenienceZone | null;
  hours: number;
  randseed: boolean;
  usecache: boolean;
  // matrices: string[];
  interventions: Interventions[];
};

interface SimSettingsStore {
  settings: SimSettings;

  setSettings: (new_settings: Partial<SimSettings>) => void;
  addInterventions: (time: number) => void;
  setInterventions: (time: number, new_interventions: Partial<Interventions>) => void;
  deleteInterventions: (time: number) => void;
}

const default_interventions: Interventions = {
  time: 0,
  mask: 0.4,
  vaccine: 0.2,
  capacity: 1.0,
  lockdown: 0.0,
  selfiso: 0.5
};

const default_settings: SimSettings = {
  sim_id: null,
  zone: null,
  hours: 84,
  randseed: true,
  usecache: true,
  interventions: [ { ...default_interventions } ]
};

const useSimSettings = create<SimSettingsStore>(
  (set) => ({
    settings: structuredClone(default_settings),

    setSettings: (new_settings) => {
      set((state) => ({ settings: { ...state.settings, ...new_settings } }));
    },

    addInterventions: (time) => {
      set((state) => ({
        settings: {
          ...state.settings,
          interventions: state.settings.interventions
            .concat({ ...default_interventions, time })
        }
      }));
    },

    setInterventions: (time, new_interventions) => {
      set((state) => ({
        settings: {
          ...state.settings,
          interventions: state.settings.interventions
            .map((i) => i.time !== time ? i : { ...i, ...new_interventions })
        }
      }));
    },

    deleteInterventions: (time) => {
      set((state) => ({
        settings: {
          ...state.settings,
          interventions: state.settings.interventions
            .filter((i) => i.time !== time)
        }
      }))
    }
  }),
);

export default useSimSettings;
