# Fullstack Refactor Plan

Baseline: `origin/main` at `a5e9617` (`Merge pull request #19 ... atomic
mapcache write`), refreshed on 2026-05-31. Supersedes the 2026-05-19 plan, which
was written against a 4,074-line CZ-generation page and assumed broad `any`
debt — both have since been largely addressed.

This is a **finish-the-refactor** plan, not a start-from-scratch one. The big
extraction campaign of the last two weeks worked. The app is healthy. What
remains is a bounded backlog of structural cleanup plus convergence of the drift
that the partial migration introduced. **Do not do a big-bang rewrite.**

## Health Snapshot (measured on `a5e9617`)

| Check | Result |
| --- | --- |
| `pnpm typecheck` (`tsc --noEmit`) | passes |
| `pnpm test` (Node test runner) | 19/19 pass, 5 test files |
| `pnpm lint` (Biome) | 2 errors (see Quick Wins) |
| Explicit `any` | 2 occurrences total |
| `unknown` / `as X` (boundary narrowing) | 65 / 64 — the intended pattern |
| `TODO`/`FIXME`, `ts-ignore`, `ts-nocheck` | 0 / 0 / 0 |

The type-safety debt the old plan worried about has effectively been paid down.
The original "Phase 1: shared domain types" is therefore **dropped** as a
standalone effort — see Non-Goals.

## What Already Landed (do not redo)

Since the 2026-05-19 baseline:

- `src/app/cz-generation/page.tsx`: **4,074 → 998 lines**. API calls, helpers,
  panels, and several workflow hooks moved into `src/features/cz-generation/`.
- `src/features/cz-generation/` now has `api.ts`, `constants.ts`, `helpers.ts`,
  `types.ts`, 8 `hooks/`, and 11 presentational `components/`.
- `src/server/` exists with `api/` (responses, route-params, session) and
  `services/` (convenience-zones, papdata, simdata-cache, zone-access,
  guest-zone-claims), several with co-located `*.test.mjs`.
- The convenience-zone API routes are already thin (18–83 lines) over services.
- Model-map **data** logic was extracted to `src/features/model-map/map-data.ts`
  (with `map-data.test.mjs`) and `map-types.ts`.

## Current State — Remaining Hotspots

Largest / most-tangled files still on `main`:

| File | Lines | Note |
| --- | --- | --- |
| `src/components/modelmap.tsx` | 1,150 | **Grew** past the old 782-line baseline; render layer never split |
| `src/features/model-map/map-data.ts` | 1,096 | Pure-ish, has a test; large but lower risk |
| `src/app/cz-generation/page.tsx` | 998 | 38 `useState` + 9 `useEffect` still in the page; 0 direct fetches |
| `src/components/dmp-selector.tsx` | 577 | Legacy flat component |
| `src/components/cbg-map.tsx` | 523 | Third MapLibre wrapper (generated-zone workspace) |
| `src/components/interactive-map.tsx` | 478 | Second MapLibre wrapper (CZ seed editing) |
| `src/app/api/simdata/[id]/person-path/route.ts` | 397 | Fat route; logic never moved to a service |
| `src/app/api/simdata/[id]/people-map/route.ts` | 333 | Fat route |
| `src/app/api/simdata/[id]/route.ts` | 273 | Map-cache assembly still inline |
| `src/app/api/simdata/[id]/chartdata/route.ts` | 235 | Fat route |

Structural observations:

- **Three homes for logic, no documented rule.** Server/shared code is split
  across `src/lib/` (16-file grab-bag), `src/server/services/`, and
  `src/features/*`. There is no stated boundary for what goes where.
- **`guest-zone-claims` name collision.** A server half lives in
  `src/server/services/guest-zone-claims.ts` (38 lines, hashing + header parse +
  Zod) and a client half in `src/lib/guest-zone-claims.ts` (134 lines, session
  claim flow). Not dead code, but the shared name and split ownership are
  confusing — API routes import the server one, `auth-provider` /
  `settings-components` / `use-zone-finalization` import the lib one.
- **Three separate map components** (`modelmap` 1,150, `interactive-map` 478,
  `cbg-map` 523), each used in exactly one place. Different purposes, but ~2,150
  lines of MapLibre wrapper with overlapping concerns (layer setup, popups,
  GeoJSON sources).
- **CZ generation got the feature-folder treatment; the simulator/map surface
  did not.** `src/components/` is still a flat bucket of ~30 components.
- **Styling untouched.** 17 global CSS files, ~3,711 lines, imported ad hoc by
  pages/components. No ownership model.
- **Test coverage is thin where risk is highest.** Only server utilities,
  `map-data`, and a chart-error helper are tested. The CZ hooks, `sim-processor`,
  and all three maps are untested.
- **Dead code:** `src/components/matrixselector.tsx` and
  `src/styles/matrixselector.css` are unreferenced (superseded by
  `dmp-selector.tsx`; untouched since 2026-02-23).
- 40 `console.*` calls remain in `src/`.

## Goals

1. Preserve existing UX, URLs, API contracts, DB schema, and integration
   expectations with Algorithms and Simulation.
2. Finish splitting the remaining large files into cohesive modules with stable
   public interfaces — model map first.
3. Converge the lib / server / features drift behind one documented rule.
4. Keep API handlers thin: parse, authorize, call service, return standard
   response — extend this to the `simdata` route family.
5. Add tests around the logic being moved so behavior stays observable.
6. Keep `refactor.md` and `README.md` matching the actual architecture.

## Non-Goals

- No site redesign, no change to public workflows, no new state manager / map
  library / CSS framework.
- No Prisma schema or storage changes unless a separate bug fix requires it.
- No `src/domain/` types layer for its own sake. With 2 `any` remaining, keep
  types co-located in their feature / `map-types` / `server` modules and only
  promote a shared type when two consumers actually need it.
- No rewrite of Algorithms or Simulation; treat their payloads as fixed
  contracts.
- **Do not work directly on `main`** (it is autodeployed).

## Workstreams (priority order)

Each workstream is an independent, short-lived PR branch off the latest `main`,
rebased before review. The old Phase 0 baseline is already satisfied (typecheck +
tests are green), so it is folded in rather than repeated.

### WS1 — Split the model map  *(highest value)*

`src/components/modelmap.tsx` (1,150 lines) is the single biggest target and is
trending the wrong way: the Cases / per-person-infection work stacked onto it
without the split the old Phase 4 anticipated.

- Keep `ModelMap` as the public component (imported by
  `src/app/simulator/[run_id]/page.tsx`) — internal split only.
- Extract: playback controls, layer/source definitions, popup/overlay state, and
  the person-status / people-dot rendering into sibling modules under
  `src/features/model-map/`.
- Move remaining pure geometry/layout helpers out of `map-data.ts` into tested
  units (`geometry.ts`, `household-layout.ts`) using small polygon/multipolygon
  fixtures.
- Replace module-level mutable caches (`resetModelMapLayoutCaches`) with
  memoized values owned by the component or an explicit cache helper.
- Exit: `modelmap.tsx` becomes a thin composition (or a compat re-export under
  `src/features/model-map/`); playback, heatmap/marker/cases modes, popups, and
  person-path selection still work; new pure functions have tests.

### WS2 — Finish CZ-generation state extraction

`page.tsx` is down to 998 lines but still owns 38 `useState` + 9 `useEffect`.
The hooks and panels are out; the central state machine is not.

- Group the remaining top-level state into workflow hooks (by workflow stage,
  not by mechanism), consistent with the existing `use-*` hooks.
- Reduce the page to an orchestrator that composes hooks + panels.
- Exit: `src/app/cz-generation/page.tsx` under ~150 lines; seed lookup, seed
  editing, clustering, guided selection, trace view, finalization, and map
  export still work (verify by screenshot parity).

### WS3 — Converge the lib / server / features drift

- Write down the rule (in `refactor.md`): e.g. `src/lib` = framework-agnostic
  shared utilities; `src/server/*` = server-only services/repositories/http;
  `src/features/*` = client feature modules. Then move files to match.
- Resolve the `guest-zone-claims` split: rename to make halves obvious
  (e.g. `server/services/guest-zone-claims.ts` vs
  `lib/guest-zone-claims-client.ts`) or co-locate behind one module with clear
  server/client entry points.
- Exit: every `src/lib` file clearly belongs by the documented rule; no two
  modules share a name across `lib` and `server`.

### WS4 — Thin the `simdata` API route family

The convenience-zone routes are already thin; the simulator data routes are not.

- Move `person-path` calculation (397 lines) into a tested service/helper.
- Extract map-cache assembly + optional gzip out of `simdata/[id]/route.ts`.
- Extract `people-map` and `chartdata` bodies into services.
- Consolidate the two upload paths (`simdata/route.ts`, `simdata-json/route.ts`).
- Reuse the existing `src/server/api` helpers (responses, route-params, session)
  rather than re-deriving them per route.
- Exit: each route reads as parse → authorize → call service → return; services
  have success + error-case tests; status codes and response shapes unchanged.

### WS5 — Quick wins (can land first, independently)

- Delete `src/components/matrixselector.tsx` + `src/styles/matrixselector.css`.
- Fix the 2 Biome lint errors:
  - `src/components/intervention-timeline.tsx:104` — a11y `role="group"` →
    semantic element.
  - `src/components/czdict.tsx:44` — `useExhaustiveDependencies`: drop the
    unnecessary `userId` hook dependency.
- Replace stray `console.*` (40) with intentional logging or remove.

### WS6 — Styling ownership and docs  *(optional, last)*

- Group the 17 global CSS files by feature/component; keep current visual design
  (use screenshot diffs for home, about, team, simulator setup/run, CZ
  input/edit/finalizing).
- Refresh `README.md` for the Next.js app (env vars, Algorithms :1880 /
  Simulation :1870 dependencies, generated Prisma path) and update
  `refactor.md`'s "Current App Shape" to mention `src/server` and
  `src/features`.

## Validation Gates (every PR)

Required:

```bash
pnpm lint
pnpm typecheck
pnpm test
```

When relevant:

```bash
pnpm build
```

Manual checks (when the area is touched): log in and load saved zones; generate a
zone from a ZIP/location; edit seed CBGs; run each clustering algorithm; finalize
a zone; run a simulation; open a saved run; verify charts, map playback,
heatmap/marker/cases modes, and person path; export CZ and simulation artifacts.

## Branching Strategy

- Umbrella: `ryad/fullstack-refactor-v2` (this branch). The previous
  `ryad/fullstack-refactor*` branches are merged/stale.
- Per-PR branches off latest `main`, rebased before review:
  - `ryad/fullstack-refactor-modelmap` (WS1)
  - `ryad/fullstack-refactor-cz-state` (WS2)
  - `ryad/fullstack-refactor-layering` (WS3)
  - `ryad/fullstack-refactor-simdata-routes` (WS4)
  - `ryad/fullstack-cleanup` (WS5)
  - `ryad/fullstack-refactor-styling-docs` (WS6)

## Risks

- The three maps and CZ generation hold interdependent state. Extract in
  workflow order and keep screenshot/manual parity checks per PR.
- Simulation data files can be large. Do not introduce full-file parsing where
  streaming currently protects memory (`sim-processor`, `filestream`,
  `json-stream`).
- API routes encode product decisions, especially anonymous CZ creation and
  guest-zone claims. Preserve behavior; route any product change separately.
- Generated Prisma client is required for typecheck — run `prisma generate`
  (postinstall) before `tsc` in CI.
- Several active worktrees and branches exist for this repo. Coordinate WS3
  file moves to avoid colliding with in-flight work.

## Definition of Done

- `modelmap.tsx` and `cz-generation/page.tsx` are focused modules; no single
  client file over ~400 lines without a clear reason.
- `simdata` routes are thin wrappers over tested services.
- `src/lib` vs `src/server` vs `src/features` boundaries are documented and the
  tree matches; no cross-home name collisions.
- Dead code removed; lint clean.
- `README.md` and `refactor.md` match the actual Next.js architecture.
- The full validation gate passes from a clean branch based on latest `main`.
