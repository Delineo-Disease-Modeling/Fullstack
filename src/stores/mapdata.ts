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

export type PoiPeaks = Record<
  string,
  {
    infected: number;
    population: number;
  }
>;

interface MapDataStore {
  name: string;
  simdata: SimData | null;
  papdata: PapData | null;
  hotspots: { [key: string]: number[] } | null;
  timesteps: number[] | null;
  poiPeaks: PoiPeaks | null;

  setName: (name: string) => void;
  setSimData: (simdata: SimData | null) => void;
  setPapData: (papdata: PapData | null) => void;
  setHotspots: (hotspots: { [key: string]: number[] }) => void;
  setTimesteps: (timesteps: number[] | null) => void;
  setPoiPeaks: (poiPeaks: PoiPeaks | null) => void;
}

// Cap how many on-demand map frames the store retains. Frames stream in during
// playback (one per timestep), so without a bound the store grows to the whole
// run (~100MB+ at 50k). Evicted frames are transparently re-fetched on demand,
// and the timeline is driven by the independent `timesteps` list, so pruning
// never shrinks the slider.
const MAX_SIM_FRAMES = 64;

const useMapData = create<MapDataStore>((set) => ({
  name: '',
  simdata: null,
  papdata: null,
  hotspots: null,
  timesteps: null,
  poiPeaks: null,

  setName: (name) => {
    set({ name });
  },

  setSimData: (newSimData) => {
    if (newSimData === null) {
      set({ simdata: null, hotspots: null, timesteps: null, poiPeaks: null });
      return;
    }
    set((state) => {
      const merged: SimData = state.simdata
        ? { ...state.simdata, ...newSimData }
        : { ...(newSimData as SimData) };

      const keys = Object.keys(merged);
      if (keys.length <= MAX_SIM_FRAMES) {
        return { simdata: merged };
      }

      // Keep the window of frames nearest the most recently written frame (the
      // playhead/prefetch region). The current frame's value reference is
      // preserved across prunes, so memoized consumers don't recompute.
      const anchor = Object.keys(newSimData).reduce(
        (max, key) => Math.max(max, Number(key)),
        Number.NEGATIVE_INFINITY
      );
      const keep = new Set(
        keys
          .slice()
          .sort(
            (a, b) =>
              Math.abs(Number(a) - anchor) - Math.abs(Number(b) - anchor)
          )
          .slice(0, MAX_SIM_FRAMES)
      );

      const pruned: SimData = {};
      for (const key of keys) {
        if (keep.has(key)) {
          pruned[key] = merged[key];
        }
      }
      return { simdata: pruned };
    });
  },

  setPapData: (papdata) => {
    set({ papdata });
  },

  setHotspots: (hotspots) => {
    set({ hotspots });
  },

  setTimesteps: (timesteps) => {
    set({ timesteps });
  },

  setPoiPeaks: (poiPeaks) => {
    set({ poiPeaks });
  }
}));

export default useMapData;
