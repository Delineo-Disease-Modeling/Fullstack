// sessionStorage persistence + cache-key helpers for the model map. Imports a
// runtime value (HEATMAP_MODES) from map-constants, so this module is consumed
// only through the bundler (not the Node test runner).
import { HEATMAP_MODES, type HeatmapMode } from './map-constants';

export function getMapStorageKey(simId: number | null | undefined, field: string) {
  return `delineo:model-map:${simId ?? 'unknown'}:${field}`;
}

export function getStoredHeatmapMode(
  simId: number | null | undefined,
  fallback: HeatmapMode
) {
  if (typeof window === 'undefined' || !window.sessionStorage) {
    return fallback;
  }

  const stored = window.sessionStorage.getItem(
    getMapStorageKey(simId, 'heatmap-mode')
  );
  return HEATMAP_MODES.includes(stored as HeatmapMode)
    ? (stored as HeatmapMode)
    : fallback;
}

export function getStoredCurrentTime(
  simId: number | null | undefined,
  fallback: number
) {
  if (typeof window === 'undefined' || !window.sessionStorage) {
    return fallback;
  }

  const stored = Number.parseFloat(
    window.sessionStorage.getItem(getMapStorageKey(simId, 'current-time')) ?? ''
  );
  return Number.isFinite(stored) && stored >= 1 ? stored : fallback;
}

export function getPeopleMapCacheKey(simId: number, timestep: number) {
  return `${simId}:${timestep}`;
}
