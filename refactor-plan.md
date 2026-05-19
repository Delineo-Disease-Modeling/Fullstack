# Fullstack Refactor Plan

Baseline: `origin/main` at `7d8ddf3` (`Made website page layouts more
consistent Added smoother AOS/loading animations`), refreshed on 2026-05-19.

This supersedes the old Vite-to-Next migration note. `main` is already a
Next.js App Router application with Prisma, Better Auth, Zustand, MapLibre, and
server-side API routes. The refactor should preserve behavior and visual design
while making the app safer to change.

## Current State

- `src/app/cz-generation/page.tsx` is the main refactor target at 4,074 lines.
  It mixes algorithm selection, seed lookup, editable CBG state, trace playback,
  API calls, map state, finalization, and a large JSX surface.
- `src/components/modelmap.tsx` is 782 lines after an initial model-map data
  extraction. `src/features/model-map/map-data.ts` is now 1,047 lines and still
  holds substantial pure map transformation logic.
- `src/features/cz-generation` already contains constants, helpers, types, and
  an API client. The next CZ-generation work should extract workflow hooks and
  presentational panels.
- API routes under `src/app/api` total about 2,202 lines. They repeat request
  parsing, id validation, auth checks, response shape handling, and file/db
  resolution logic.
- Shared simulator data types are informal. Papdata, patterns, simulation
  timestep data, chart data, and map cache payloads are represented with many
  `any` casts.
- Styling is split across many global CSS files imported by pages/components.
  There is no clear ownership model for page styles versus reusable component
  styles.
- `package.json` now has `lint`, `typecheck`, and `test` scripts. Tests use the
  Node test runner and currently cover selected pure helpers and route/service
  utilities.

## Baseline Checks

Run from a clean checkout:

```bash
pnpm lint
pnpm typecheck
pnpm test
```

Observed baseline:

- `pnpm lint`, `pnpm typecheck`, and `pnpm test` pass on
  `ryad/fullstack-refactor` before the next extraction.
- `pnpm test` currently runs 18 Node tests.
- Keep this validation gate green after each small extraction.

## Goals

1. Preserve existing UX, URLs, API contracts, database schema, and integration
   expectations with Algorithms and Simulation.
2. Split large route/page/component files into cohesive modules with stable
   interfaces.
3. Replace broad `any` usage around simulation artifacts with shared domain
   types and narrow runtime validation at API boundaries.
4. Make API handlers thin: parse input, call service functions, return a
   standard response.
5. Add enough tests and fixtures to make future behavior changes observable.
6. Update docs so setup and architecture match the actual Next.js repo.

## Non-Goals

- Do not redesign the site or change the public workflows.
- Do not change Prisma schema or database storage unless a later bug fix
  explicitly requires it.
- Do not rewrite Algorithms or Simulation.
- Do not move to a new state manager, component library, map library, or CSS
  framework during this refactor.
- Do not work directly on `main`.

## Branching Strategy

Use short-lived branches from the latest `main`.

Recommended umbrella branch name:

```bash
ryad/fullstack-refactor
```

For safer review, split implementation into smaller PR branches:

- `ryad/fullstack-refactor-foundation`
- `ryad/fullstack-refactor-api-services`
- `ryad/fullstack-refactor-cz-generation`
- `ryad/fullstack-refactor-modelmap`
- `ryad/fullstack-refactor-docs`

Each PR should be rebased on the latest `main` before review.

## Phase 0: Stabilize The Baseline

Purpose: make the current app measurable before moving code.

Tasks:

- Keep the existing `typecheck` script: `tsc --noEmit`.
- Keep the existing Node test runner unless a later need justifies Vitest.
- Add focused fixtures for papdata, patterns, simdata, chart data, and map cache
  payloads under `src/test/fixtures` or an equivalent test-only folder.
- Add tests for existing pure helpers before extracting them:
  - date/month helpers currently in `src/app/cz-generation/page.tsx`
  - CBG list normalization/deduping/filtering
  - simulation request building
  - intervention validation once the pending intervention work lands
- Decide whether Biome warnings are allowed temporarily. If yes, document a
  warning budget and reduce it per PR.

Exit criteria:

- `pnpm lint` still passes with the known warnings.
- `pnpm typecheck` passes.
- Initial helper tests pass.
- No behavior changes.

## Phase 1: Create Shared Domain Types

Purpose: give API routes, stores, and components a shared vocabulary.

Proposed structure:

```text
src/domain/
  cz.ts
  simulation.ts
  papdata.ts
  patterns.ts
  map-cache.ts
  chart-data.ts
  interventions.ts
src/server/
  http.ts
  auth.ts
  files.ts
  validation.ts
```

Tasks:

- Move `ConvenienceZone`, `SimSettings`, `Interventions`, and related request
  payload types out of stores into domain files. Stores should import domain
  types, not define them.
- Define narrow types for:
  - papdata people, homes, places
  - pattern timesteps
  - simulation disease state timesteps
  - map cache payloads
  - chart data series
  - person path response payloads
- Add small parsing helpers for unknown JSON from disk and external services.
  Use Zod only at boundaries where runtime validation is worth the cost.
- Update `src/lib/papdata-cache.ts`, `src/lib/sim-processor.ts`,
  `src/app/api/simdata/[id]/chartdata/route.ts`,
  `src/app/api/simdata/[id]/person-path/route.ts`, and
  `src/app/api/papdata/[czone_id]/route.ts` to consume those types.

Exit criteria:

- The first batch of `noExplicitAny` warnings is removed from server/data code.
- Pure domain helpers have unit tests.
- No route contract changes.

## Phase 2: Thin API Routes Into Services

Purpose: make API behavior reusable and testable without Next route wrappers.

Proposed structure:

```text
src/server/services/
  convenience-zones.ts
  simulation-runs.ts
  simulation-processing.ts
  exports.ts
  lookup-location.ts
src/server/repositories/
  convenience-zone-repository.ts
  simulation-run-repository.ts
```

Tasks:

- Add shared utilities for:
  - numeric route param parsing
  - session loading and required-auth responses
  - ownership checks for zones and simulation runs
  - consistent `{ data }` and `{ message }` JSON responses
  - handling `ENOENT` for DB files
- Extract route bodies into service functions while keeping each route file as
  a thin adapter.
- Consolidate duplicated simulation upload paths:
  - `src/app/api/simdata/route.ts`
  - `src/app/api/simdata-json/route.ts`
- Move map cache response assembly and optional gzip handling out of
  `src/app/api/simdata/[id]/route.ts`.
- Move person-path calculation out of its route into a tested service/helper.
- Preserve current auth behavior exactly, including anonymous CZ creation if it
  is still intended product behavior. If not intended, capture that as a
  separate product/security change rather than mixing it into this refactor.

Exit criteria:

- Route handlers are short and mostly read as parse, authorize, call service,
  return response.
- Service functions have unit tests around success and expected error cases.
- Existing API endpoints keep the same status codes and response shapes.

## Phase 3: Split CZ Generation

Purpose: reduce the 4,554-line page into a feature folder without changing the
workflow.

Proposed structure:

```text
src/features/cz-generation/
  page-client.tsx
  types.ts
  constants.ts
  date-utils.ts
  geojson-utils.ts
  api.ts
  hooks/
    use-pattern-availability.ts
    use-seed-resolution.ts
    use-seed-editing.ts
    use-clustering-preview.ts
    use-guided-destinations.ts
    use-trace-playback.ts
    use-zone-metrics.ts
    use-finalize-zone.ts
  components/
    setup-panel.tsx
    algorithm-guide.tsx
    seed-preview-panel.tsx
    seed-edit-toolbar.tsx
    guided-destinations-panel.tsx
    trace-panel.tsx
    manual-candidates-panel.tsx
    zone-summary-panel.tsx
    finalization-panel.tsx
```

Tasks:

- Keep `src/app/cz-generation/page.tsx` as a small route entry that renders the
  feature client component.
- Move constants and local types first. This should be a mechanical PR with no
  behavioral changes.
- Extract pure helpers next:
  - month/date conversion
  - CBG list dedupe/equality
  - GeoJSON filtering and ID extraction
  - trace layer derivation
  - guided selection summaries
- Extract API client functions into `api.ts`:
  - `pattern-availability`
  - `cbg-geojson`
  - `cz-metrics`
  - `candidate-pois`
  - `frontier-candidates`
  - `second-order-destinations`
  - `cluster-cbgs`
  - `finalize-cz`
  - `export-cz-map-html`
- Extract hooks by workflow state, not by technical mechanism. Each hook should
  own one API interaction or one state machine.
- Extract presentational panels after state ownership is clear.
- Keep the current CSS class names initially to avoid visual churn. Only
  reorganize CSS after screenshots confirm parity.

Exit criteria:

- `src/app/cz-generation/page.tsx` is below 100 lines.
- Feature modules have named responsibilities and limited cross imports.
- Existing seed lookup, seed editing, clustering, guided selection, trace view,
  finalization, and map export workflows still work.

## Phase 4: Split Model Map

Purpose: isolate map data transformation from MapLibre rendering.

Proposed structure:

```text
src/features/model-map/
  model-map.tsx
  clustered-map.tsx
  playback-controls.tsx
  emoji-overlay.tsx
  geometry.ts
  household-layout.ts
  poi-icons.ts
  people-dots.ts
  layers.ts
  types.ts
```

Tasks:

- Move geometry helpers into `geometry.ts` and test them with simple polygon and
  multipolygon fixtures.
- Move household layout generation into `household-layout.ts`.
- Move icon and people-dot GeoJSON generation into pure modules.
- Replace module-level mutable caches where practical with memoized values owned
  by the component or by explicit cache helpers.
- Type MapLibre event and feature objects narrowly enough to remove broad `any`
  from click handlers, popup state, and data props.
- Keep `ModelMap` as the public component API while introducing smaller internal
  components.

Exit criteria:

- `src/components/modelmap.tsx` is either removed or becomes a compatibility
  re-export.
- Pure map data functions have tests.
- Simulation playback, heatmap/marker modes, popups, and person path selection
  still work.

## Phase 5: Normalize UI State And Stores

Purpose: make global state intentional.

Tasks:

- Keep only cross-route or cross-component state in Zustand stores.
- Move page-local state from stores into feature hooks where it is not shared.
- Replace ad hoc fetch/loading/error state with a small local pattern used
  consistently by CZ generation and simulator pages.
- Audit `src/stores/simsettings.ts` and `src/stores/mapdata.ts` for values that
  are actually server data, derived data, or route params.
- Keep persisted auth state isolated in `useAuthStore` unless Better Auth now
  makes parts redundant.

Exit criteria:

- Store modules are small and domain-typed.
- Feature hooks expose explicit command functions and derived state.
- Simulator and CZ generation code no longer read arbitrary store snapshots
  except at clear submission points.

## Phase 6: Styling And Component Ownership

Purpose: reduce accidental global CSS coupling.

Tasks:

- Keep current visual design, but group styles by feature or reusable component.
- Fix the baseline `navbar.css` specificity warning.
- Introduce simple reusable primitives only where repeated UI exists already:
  buttons, sliders, form rows, error banners, loading/progress blocks, tabs, and
  panel shells.
- Avoid a broad redesign or Tailwind conversion. The risk is not worth mixing
  into the structural refactor.
- Use visual regression checks for:
  - home page
  - about page
  - team page
  - simulator setup page
  - simulator run page
  - CZ generation input/edit/finalizing states

Exit criteria:

- CSS ownership is clear.
- No page-level visual drift except intentional bug fixes.
- Reusable UI components are used where they reduce duplication.

## Phase 7: Docs And Developer Workflow

Purpose: make the repo easier to run and maintain.

Tasks:

- Rewrite `README.md` for the current Next.js app. Remove references to running
  from `client`.
- Document required environment variables:
  - `PRISMA_DB_URL`
  - `BETTER_AUTH_URL`
  - `BETTER_AUTH_SECRET`
  - `DB_FOLDER`
  - `NEXT_PUBLIC_ALG_URL`
  - `NEXT_PUBLIC_SIM_URL`
  - any server-only `ALG_URL` usage
- Document generated Prisma output under `src/generated/prisma`.
- Document local dependencies on Algorithms and Simulation, including expected
  ports and health checks.
- Add a short architecture section that points to `src/domain`,
  `src/server`, and `src/features`.

Exit criteria:

- A new contributor can install, configure, run, lint, typecheck, and build the
  app from the README.
- The old Vite/client/server instructions are gone.

## Validation Gates For Every PR

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

Manual checks:

- Log in and load saved convenience zones.
- Generate a convenience zone from a ZIP/location.
- Edit seed CBGs on the map.
- Run each clustering algorithm currently exposed in the UI.
- Finalize a zone and confirm papdata/patterns are attached.
- Run a simulation using a finalized zone.
- Open a saved simulation run.
- Verify output charts, map playback, heatmap/marker modes, and person path.
- Export CZ and simulation artifacts.

## Suggested PR Sequence

1. Foundation: add `typecheck`, test runner, fixtures, and README note about the
   ongoing refactor.
2. Domain types: add shared simulation/CZ/papdata/map-cache types and migrate
   server data helpers.
3. API services: extract common route utilities and service modules.
4. CZ generation extraction, part 1: constants, types, pure helpers, API client.
5. CZ generation extraction, part 2: hooks and panel components.
6. Model map extraction: geometry/layout/dot/icon helpers, then rendering split.
7. Store cleanup and UI state normalization.
8. Styling ownership and docs.

## Risks

- CZ generation has many interdependent states. Extract hooks in workflow order
  and keep screenshots/manual checks after each PR.
- Simulation data files can be large. Avoid adding full-file parsing where
  streaming currently protects memory usage.
- API routes currently encode product decisions, especially around auth and
  anonymous zone creation. Preserve behavior unless a separate product decision
  says otherwise.
- Generated Prisma files are required for typechecking. CI should run
  `prisma generate` before `tsc`.
- External services on Algorithms and Simulation must remain compatible. Treat
  request/response payload changes as separate integration work.

## Definition Of Done

- Large files are reduced to focused modules without losing current behavior.
- Core simulation artifact types are shared across server and client code.
- Server routes are thin wrappers over tested services.
- Biome `noExplicitAny` warnings are either resolved or isolated to documented
  third-party boundary adapters.
- README matches the actual Next.js workflow.
- The full validation gate passes from a clean branch based on latest `main`.
