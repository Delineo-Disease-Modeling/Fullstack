import { create } from 'zustand';

type ConvenienceZone = {
  id: number;
  name: string;
  description: string;
  latitude: number;
  longitude: number;
  cbg_list: string[];
  size: number;
  start_date: string;
  created_at: string;
  user_id: string;
  ready?: boolean;
};

type SimSettings = {
  zone: ConvenienceZone | null;
  hours: number;
  mask: number;
  vaccine: number;
  capacity: number;
  lockdown: number;
  selfiso: number;
  randseed: boolean;
  usecache: boolean;
  // matrices: string[];
};

interface SimSettingsStore {
  settings: SimSettings;

  setSettings: (new_settings: Partial<ConvenienceZone>) => void;
}

const default_settings: SimSettings = {
  zone: null,
  hours: 84,
  mask: 0.4,
  vaccine: 0.2,
  capacity: 1.0,
  lockdown: 0.0,
  selfiso: 0.5,
  randseed: true,
  usecache: true
};

const useSimSettings = create<SimSettingsStore>(
  (set) => ({
    settings: default_settings,
    setSettings: (new_settings: Partial<ConvenienceZone>) => {
      set((state) => ({ settings: { ...state.settings, ...new_settings } }));
    }
  })
);

export default useSimSettings;
