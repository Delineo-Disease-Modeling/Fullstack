import { create } from 'zustand';

export type PapData = {
  homes: {
    id: string;
    cbg?: string;
    members?: number;
    latitude?: number | null;
    longitude?: number | null;
  }[];
  places: {
    id: string;
    placekey?: string;
    label: string;
    latitude: number | null;
    longitude: number | null;
    top_category: string;
    postal_code?: number;
    footprint?: {
      type: string;
      coordinates: unknown;
    } | null;
  }[];
};

export type SimData = {
  [time: string]: {
    h: number[];
    p: number[];
  };
};

interface MapDataStore {
  name: string;
  simdata: SimData | null;
  papdata: PapData | null;
  hotspots: { [key: string]: number[] } | null;

  setName: (name: string) => void;
  setSimData: (simdata: SimData | null) => void;
  setPapData: (papdata: PapData | null) => void;
  setHotspots: (hotspots: { [key: string]: number[] }) => void;
}

const useMapData = create<MapDataStore>((set) => ({
  name: '',
  simdata: null,
  papdata: null,
  hotspots: null,

  setName: (name) => {
    set({ name });
  },

  setSimData: (newSimData) => {
    if (newSimData === null) {
      set({ simdata: null, hotspots: null });
      return;
    }
    set((state) => ({
      simdata: state.simdata
        ? { ...state.simdata, ...newSimData }
        : (newSimData as SimData)
    }));
  },

  setPapData: (papdata) => {
    set({ papdata });
  },

  setHotspots: (hotspots) => {
    set({ hotspots });
  }
}));

export default useMapData;
