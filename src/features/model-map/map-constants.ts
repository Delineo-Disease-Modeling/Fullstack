// Pure constants, MapLibre paint/layout expressions, and color helpers for the
// model map. Kept dependency-free so they can be imported by the rendering
// components and unit-tested in isolation.

export const RECOVERED_DOT_COLOR = '#16a34a';

export type PersonStatusDotRadiusExpression = [
  'interpolate',
  ['linear'],
  ['zoom'],
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number
];

export const PERSON_STATUS_DOT_RADIUS: PersonStatusDotRadiusExpression = [
  'interpolate',
  ['linear'],
  ['zoom'],
  10,
  1.8,
  13,
  2.8,
  16,
  4.3,
  18,
  6.2
];

export const POINTS_CLUSTER_PROPERTIES = {
  population: ['+', ['to-number', ['get', 'population']]],
  infected: ['+', ['to-number', ['get', 'infected']]]
} as const;

export const CLUSTER_COLOR_EXPRESSION = [
  'case',
  ['==', ['get', 'population'], 0],
  '#4CAF50',
  [
    'interpolate',
    ['linear'],
    ['sqrt', ['/', ['get', 'infected'], ['get', 'population']]],
    0,
    '#4CAF50',
    0.15,
    '#FFEB3B',
    0.35,
    '#FF9800',
    0.5,
    '#F44336'
  ]
] as unknown as string;

export type HeatmapMode = 'markers' | 'people' | 'population' | 'infection';

// Only modes still surfaced in the toggle UI are restored from sessionStorage.
// 'population' and 'infection' modes are intentionally hidden but kept as
// HeatmapMode values so the rendering paths remain available if reintroduced.
export const HEATMAP_MODES: HeatmapMode[] = ['markers', 'people'];
export const PLAYBACK_INTERVAL_MS = 750;
export const PEOPLE_MAP_PREFETCH_STEPS = 4;
export const CASE_DETAIL_MIN_ZOOM = 12.8;
// Cases view hands off from clustered infection bubbles (zoomed out) to
// individual person dots at this zoom; POI footprints/labels appear later, at
// CASE_DETAIL_MIN_ZOOM.
export const CASE_CLUSTER_MAX_ZOOM = 12.0;

export function applyAlpha(hex: string, alpha: number) {
  const bigint = parseInt(hex.replace('#', ''), 16);
  return `rgba(${(bigint >> 16) & 255},${(bigint >> 8) & 255},${bigint & 255},${alpha})`;
}
