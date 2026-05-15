export const AGE_RANGES: [number, number][] = [
  [0, 20],
  [21, 40],
  [41, 60],
  [61, 80],
  [81, 99]
];

export const AGE_RANGE_LABELS = AGE_RANGES.map(([lo, hi]) => `${lo}-${hi}`);

export const BITMASK_STATES: [string, number][] = [
  ['Infected', 1],
  ['Infectious', 2],
  ['Symptomatic', 4],
  ['Hospitalized', 8],
  ['Recovered', 16],
  ['Removed', 32]
];

export const ALL_STATE_NAMES = [
  'Susceptible',
  ...BITMASK_STATES.map(([name]) => name)
];

export type DataPoint = { time: number; [key: string]: number };

export type ChartData = {
  iot: DataPoint[];
  ages: DataPoint[];
  sexes: DataPoint[];
  states: DataPoint[];
  metadata?: unknown;
  error?: string;
  [type: string]: DataPoint[] | string | unknown;
};

export type PapPerson = {
  age?: number;
  sex?: number;
  home?: string | number | null;
  household_id?: string | number | null;
};

export type PapHome = {
  cbg?: string;
  members?: unknown;
  latitude?: number | string | null;
  longitude?: number | string | null;
};

export type PapPlace = {
  placekey?: string;
  latitude?: number | string | null;
  longitude?: number | string | null;
  label?: string;
  top_category?: string;
  footprint?: unknown;
};

export type PapData = {
  people?: Record<string, PapPerson>;
  homes: Record<string, PapHome>;
  places: Record<string, PapPlace>;
};

export type LocationOccupancy = Record<string, string[]>;

export type PatternTimestep = {
  homes?: LocationOccupancy;
  places?: LocationOccupancy;
};

export type DiseaseStateTimestep = Record<string, Record<string, number>>;

export type JsonObjectEntry<T> = {
  key: string;
  value: T;
};

export type FilteredPapData = {
  homes: Record<string, Record<string, never>>;
  places: Record<
    string,
    {
      id: string;
      latitude?: number | string | null;
      longitude?: number | string | null;
      label?: string;
      top_category?: string;
    }
  >;
};

export function buildAgeIndex(
  people: Record<string, PapPerson> = {}
): Map<string, number> {
  const ageIndex = new Map<string, number>();

  for (const [id, person] of Object.entries(people)) {
    if (typeof person.age !== 'number') {
      continue;
    }

    for (let index = 0; index < AGE_RANGES.length; index += 1) {
      const [minimumAge, maximumAge] = AGE_RANGES[index];
      if (person.age >= minimumAge && person.age <= maximumAge) {
        ageIndex.set(id, index);
        break;
      }
    }
  }

  return ageIndex;
}

export function getPersonSexLabel(sex: unknown) {
  if (sex === 0) {
    return 'Male';
  }
  if (sex === 1) {
    return 'Female';
  }
  return 'Unknown';
}

export function getChartError(stats: unknown): string | null {
  if (!stats || typeof stats !== 'object') {
    return null;
  }

  const error = (stats as { error?: unknown }).error;
  return typeof error === 'string' && error.trim() ? error : null;
}
