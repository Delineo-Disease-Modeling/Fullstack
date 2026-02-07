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

export type Interventions = {
  time: number;
  mask: number;
  vaccine: number;
  capacity: number;
  lockdown: number;
  selfiso: number;
};

export type SimSettings = {
  sim_id: number | null;
  zone: ConvenienceZone | null;
  hours: number;
  randseed: boolean;
  usecache: boolean;
  // matrices: string[];
  interventions: Interventions[];
};

interface SimSettingsActions {
  setSettings: (new_settings: Partial<SimSettings>) => void;
  addInterventions: (time: number) => void;
  setInterventions: (
    time: number,
    new_interventions: Partial<Interventions>
  ) => void;
  deleteInterventions: (time: number) => void;
}

type SimSettingsStore = SimSettings & SimSettingsActions;

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
  interventions: [{ ...default_interventions }]
};

const useSimSettings = create<SimSettingsStore>((set) => ({
  ...default_settings,

  setSettings: (new_settings) => {
    set((state) => ({ ...state, ...new_settings }));
  },

  addInterventions: (time) => {
    set((state) => ({
      interventions: state.interventions.concat({
        ...default_interventions,
        time
      })
    }));
  },

  setInterventions: (time, new_interventions) => {
    set((state) => ({
      interventions: state.interventions.map((i) =>
        i.time !== time ? i : { ...i, ...new_interventions }
      )
    }));
  },

  deleteInterventions: (time) => {
    set((state) => ({
      interventions: state.interventions.filter((i) => i.time !== time)
    }));
  }
}));

export default useSimSettings;
