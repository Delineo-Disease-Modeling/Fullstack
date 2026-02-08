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
  name: string;
  simdata: SimData | null;
  patterns: MovePatterns | null;
  papdata: PapData | null;

  setName: (name: string) => void;
  setSimData: (simdata: SimData) => void;
  setPatterns: (patterns: MovePatterns) => void;
  setPapData: (papdata: PapData) => void;
}

const useSimData = create<SimDataStore>(
  (set) => ({
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
      console.log('[STORE] setSimData called with keys:', Object.keys(newSimData || {}).slice(0, 5));
      // Check structure
      const firstKey = Object.keys(newSimData || {})[0];
      if (firstKey) {
        console.log('[STORE] First timestamp data structure:', Object.keys(newSimData[firstKey]));
        if (newSimData[firstKey].homes) {
          const homeKeys = Object.keys(newSimData[firstKey].homes);
          const firstHome = homeKeys[0];
          if (firstHome) {
            console.log('[STORE] Sample home data:', newSimData[firstKey].homes[firstHome]);
          }
        }
      }
      set((state) => ({
        simdata: state.simdata ? { ...state.simdata, ...newSimData } : (newSimData as SimData)
      }));
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
