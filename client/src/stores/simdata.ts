import { create } from 'zustand';

type SimData = {
  [ time: number ]: {
    [ variant: string ] : {
      [ person_id: number ]: number;
    }
  }
};

type MovePatterns = {
  [ time: number ]: {
    homes: { [ id: number ]: string[]; }
    places: { [ id: number ]: string[]; }
  } 
};

type PapData = {
  people: {
    [ id: number ]: {
      sex: number;
      age: number;
      home: string;
    };
  };
  homes: {
    [ id: number ]: {
      cbg: string;
      members: number;
    };
  };
  places: {
    [ id: number ]: {
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
  simdata: SimData | null;
  patterns: MovePatterns | null;
  papdata: PapData | null;

  setSimData: (simdata: SimData) => void;
  setPatterns: (patterns: MovePatterns) => void;
  setPapData: (papdata: PapData) => void;
}

const useSimData = create<SimDataStore>(
  (set) => ({
    simdata: null,
    patterns: null,
    papdata: null,

    setSimData: (simdata) => {
      set({ simdata });
    },

    setPatterns: (patterns) => {
      set({ patterns });
    },

    setPapData: (papdata) => {
      set({ papdata });
    }
  })
);

export default useSimData;
