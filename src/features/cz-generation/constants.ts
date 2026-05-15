import type { GuidedSelectionStyle, TraceCandidate } from './types';

export const CLUSTER_ALGORITHM_OPTIONS = [
  { value: 'mobility_prune', label: 'Mobility Prune (Recommended)' },
  {
    value: 'guided_second_order_regions',
    label: 'Guided Connected Cities'
  },
  { value: 'greedy_fast', label: 'Greedy Weight' },
  { value: 'greedy_weight_seed_guard', label: 'Greedy Weight + Seed Guard' }
] as const;

export type ClusterAlgorithm =
  (typeof CLUSTER_ALGORITHM_OPTIONS)[number]['value'];

export const CLUSTER_ALGORITHM_MANUAL: Record<
  ClusterAlgorithm,
  {
    summary: string;
    recommended?: boolean;
  }
> = {
  mobility_prune: {
    summary:
      'Recommended default. Builds a broad mobility zone from the seed, then prunes lower-value CBGs while keeping seed movement capture.',
    recommended: true
  },
  guided_second_order_regions: {
    summary:
      'Useful for smaller cities or towns surrounded by other cities. It ranks connected cities and lets you choose which linked CBGs stay explicit.'
  },
  greedy_fast: {
    summary:
      'Greedy Weight is a quick automatic baseline with trace view. It adds high-scoring CBGs until the population target is met.'
  },
  greedy_weight_seed_guard: {
    summary:
      'Advanced diagnostic mode. Uses a seed-distance guard and trace view to inspect how individual CBGs are chosen.'
  }
};

export const EMPTY_LIST: TraceCandidate[] = [];

export const CBG_GEOJSON_REQUEST_CHUNK_SIZE = 75;
export const INITIAL_SEED_EDIT_NEIGHBOR_RINGS = 2;

export const GUIDED_REGION_PALETTE: GuidedSelectionStyle[] = [
  { fillColor: '#f59e0b', lineColor: '#b45309' },
  { fillColor: '#10b981', lineColor: '#047857' },
  { fillColor: '#ef4444', lineColor: '#b91c1c' },
  { fillColor: '#06b6d4', lineColor: '#0e7490' },
  { fillColor: '#eab308', lineColor: '#a16207' },
  { fillColor: '#f97316', lineColor: '#c2410c' }
];

export const GUIDED_SEED_STYLE: GuidedSelectionStyle = {
  fillColor: '#2563eb',
  lineColor: '#1d4ed8'
};

export const GUIDED_SOFT_EXPLICIT_POPULATION = 25000;
export const GUIDED_HARD_EXPLICIT_POPULATION = 50000;
