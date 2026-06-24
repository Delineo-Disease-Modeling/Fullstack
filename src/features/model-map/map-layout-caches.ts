import type { Coordinate } from './map-types';

// Module-level layout caches shared across the map's data builders (household
// layout, place-dot layouts, person-dot layouts). Held as a single object —
// not separate `let` bindings — so sibling modules can both MUTATE and RESET
// its fields: an ES module's exported binding can't be reassigned by an
// importer, but the fields of an exported `const` object can.
export const layoutCaches: {
  householdLocs: Record<string, Coordinate>;
  placeLocs: Record<string, Coordinate>;
  placeDotLayouts: Record<string, Coordinate[]>;
  personLayoutCache: Record<string, Coordinate[]>;
  householdLayoutKey: string;
} = {
  householdLocs: {},
  placeLocs: {},
  placeDotLayouts: {},
  personLayoutCache: {},
  householdLayoutKey: ''
};

export function resetModelMapLayoutCaches() {
  layoutCaches.householdLocs = {};
  layoutCaches.placeLocs = {};
  layoutCaches.placeDotLayouts = {};
  layoutCaches.personLayoutCache = {};
  layoutCaches.householdLayoutKey = '';
}
