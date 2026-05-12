export const SIM_CHART_SCHEMA_VERSION = 2;

export const EXCLUSIVE_STATE_NAMES = [
  'Susceptible',
  'Infected',
  'Infectious',
  'Symptomatic',
  'Hospitalized',
  'Recovered',
  'Removed'
] as const;

type StatePoint = { time: number; [key: string]: number };

const STATE_PRIORITY: Array<{
  label: (typeof EXCLUSIVE_STATE_NAMES)[number];
  bit: number;
}> = [
  { label: 'Removed', bit: 32 },
  { label: 'Hospitalized', bit: 8 },
  { label: 'Symptomatic', bit: 4 },
  { label: 'Infectious', bit: 2 },
  { label: 'Infected', bit: 1 },
  // Recovered stays below active infection states so reinfections still
  // count as active cases when multiple disease variants are present.
  { label: 'Recovered', bit: 16 }
];

export function createExclusiveStatePoint(time: number): StatePoint {
  const point: StatePoint = { time };
  for (const stateName of EXCLUSIVE_STATE_NAMES) {
    point[stateName] = 0;
  }
  return point;
}

export function addCombinedStateBit(
  combinedStates: Map<string, number>,
  personId: string,
  stateBitmask: number
) {
  combinedStates.set(personId, (combinedStates.get(personId) ?? 0) | stateBitmask);
}

export function populateExclusiveStateCounts(
  point: StatePoint,
  populationIds: Iterable<string>,
  combinedStates: ReadonlyMap<string, number>
) {
  for (const personId of populationIds) {
    const bitmask = combinedStates.get(personId) ?? 0;
    let label: (typeof EXCLUSIVE_STATE_NAMES)[number] = 'Susceptible';

    for (const state of STATE_PRIORITY) {
      if (bitmask & state.bit) {
        label = state.label;
        break;
      }
    }

    point[label] = (point[label] ?? 0) + 1;
  }
}
