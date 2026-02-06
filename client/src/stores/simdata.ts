import { create } from 'zustand';

export type SimData = {
  [time: number]: {
    [variant: string]: {
      [person_id: number]: number;
    };
  };
};

export type MovePatterns = {
  [time: number]: {
    homes: { [id: number]: string[] };
    places: { [id: number]: string[] };
  };
};

export type PapData = {
  people: {
    [id: number]: {
      sex: number;
      age: number;
      home: string;
    };
  };
  homes: {
    [id: number]: {
      cbg: string;
      members: number;
    };
  };
  places: {
    [id: number]: {
      placekey: string;
      label: string;
      latitude: number;
      longitude: number;
      top_category: string;
      postal_code: number;
    };
  };
};

interface SimDataStore {
  name: string;
  simdata: SimData | null;
  patterns: MovePatterns | null;
  papdata: PapData | null;

  setName: (name: string) => void;
  setSimData: (simdata: SimData) => void;
  setPatterns: (patterns: MovePatterns) => void;
  setPapData: (papdata: PapData) => void;
}

const useSimData = create<SimDataStore>((set) => ({
  name: '',
  simdata: null,
  patterns: null,
  papdata: null,

  setName: (name) => {
    set({ name });
  },

  setSimData: (newSimData) => {
    if (newSimData === null) {
      set({ simdata: null });
      return;
    }
    set((state) => ({
      simdata: state.simdata
        ? { ...state.simdata, ...newSimData }
        : (newSimData as SimData)
    }));
  },

  setPatterns: (patterns) => {
    set({ patterns });
  },

  setPapData: (papdata) => {
    set({ papdata });
  }
}));

export default useSimData;
