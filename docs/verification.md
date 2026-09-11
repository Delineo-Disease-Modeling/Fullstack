# Onboarding verification record

Checked on **2026-09-11**. This record covers the overview and local setup
milestone, including the executable [synthetic example](examples/smoke.py).

## Source baseline

The work began from freshly fetched GitHub `main` revisions in separate, clean
worktrees. Existing local feature branches and uncommitted work were preserved.
The following commits identify the application code used for verification; the
documentation changes are added on top of them.

| Repository | Source revision |
| --- | --- |
| Fullstack | [`507042d1ad9c041b48025bfd5a79747583b2f4cf`](https://github.com/Delineo-Disease-Modeling/Fullstack/commit/507042d1ad9c041b48025bfd5a79747583b2f4cf) |
| Algorithms | [`f89337b4a7a88e5df2de105ac9ba6e4716a952ac`](https://github.com/Delineo-Disease-Modeling/Algorithms/commit/f89337b4a7a88e5df2de105ac9ba6e4716a952ac) |
| Simulation | [`c045287f00a8c60e6049040db9ca289a5e174911`](https://github.com/Delineo-Disease-Modeling/Simulation/commit/c045287f00a8c60e6049040db9ca289a5e174911) |

The workspace directory itself is not a Git repository. Local reports and startup
scripts outside these clones were not used as installation dependencies.

## Environment

| Component | Tested value |
| --- | --- |
| Platform | macOS 26.6.2, Apple Silicon |
| Node.js | 24.3.0 |
| pnpm | 10.29.1, selected through Corepack |
| Python | 3.12.14; a separate new venv for each Python repository |
| PostgreSQL | 15.15; a new temporary cluster and empty database |
| Frontend dependency resolution | Committed `pnpm-lock.yaml`, `--frozen-lockfile`, new `node_modules` |
| Python dependency resolution | Each repository's root `requirements.txt`; normal package download caches were permitted |
| OSMnx | 2.1.1, resolved from Algorithms' existing `osmnx>=1.9.0` requirement |

No existing application database, generated zone payloads, or licensed mobility
datasets were copied into the test installation. The temporary PostgreSQL service
used port 55432 to avoid the host's existing database; the `.env` URL was adjusted
accordingly. The application services used the guide's ports 3000, 1880, 1870,
and optionally 8000. Installing system tools and Linux/WSL setups were not tested.

The Python requirement files are not complete dependency lockfiles: OSMnx uses
a range, and some transitive dependencies may change. The resolved version above
records the relevant range for this run; do not infer universal compatibility
from a successful installation on this platform.

## Checks performed

| Check | Result |
| --- | --- |
| Fresh frontend dependency install | Passed; Prisma postinstall generation completed |
| `pnpm db:generate` | Passed |
| `pnpm exec prisma db push` against the empty database | Passed; schema synchronized without the reset script |
| Fresh Algorithms requirements install and `pip check` | Passed; no broken requirements |
| Fresh Simulation/DMP requirements install and `pip check` | Passed; no broken requirements |
| Native startup of all three services | Passed using the documented working directories and entry points |
| Algorithms availability request with state and date range | Passed without installed mobility files; reported missing coverage |
| Synthetic example, `dmp_mode=off` | Passed; 12 people, 24 movement frames, 24 chart frames, 24 map frames, saved run |
| Synthetic example, `dmp_mode=required` | Passed with the bundled in-process DMP; no HTTP DMP server running during this run |
| Optional DMP API startup | Passed; `/`, `/diseases`, `/state-machines`, and `/openapi.json` returned HTTP 200 |
| DMP disease discovery | Reported COVID-19 and Measles from the bundled database |
| Browser inspection of the required-DMP run | Run title, saved state, timeline, map, and chart rendered; no captured browser console errors |
| `pnpm lint` | Passed, with one existing informational lint finding |
| `pnpm typecheck` | Passed |
| `pnpm test` | Passed: 59 tests, zero failures |
| `pnpm build` | Passed; production compilation and route generation completed |
| Documentation checks | Relative/companion links, code fences, shell-block syntax, and Git whitespace checks passed |

Successful example output (database IDs vary):

```text
Generated 12 people and 24 hourly movement frames
Created demo zone 2
PASS: zone=2, run=2, dmp_mode=off, chart_frames=24, map_frames=24
Open http://localhost:3000/simulator/2

Generated 12 people and 24 hourly movement frames
Created demo zone 3
PASS: zone=3, run=3, dmp_mode=required, chart_frames=24, map_frames=24
Open http://localhost:3000/simulator/3
```

The script checks population conservation and the presence of POI visits before
uploading movement. It then checks simulation SSE completion, waits for populated
chart/map responses, and checks full 24-hour output coverage. A successful HTTP
response alone is not its acceptance criterion. The movement generator's
uncalibrated-scale warning is expected for the artificial input statistics.

## Scope limits

- The example directly constructs a synthetic population and zone. It does not
  verify geographic clustering, Census population generation, acquisition of
  mobility data, or a complete real-region run.
- Model availability and software integration do not establish epidemiological
  calibration, validation, or fitness for a particular policy decision.
- Docker, the private deployment launchers, native Windows, Streamlit editing,
  authenticated account workflows, and a production deployment were not exercised.
- No production code branch was merged or deployed as part of this verification.

When changing the walkthrough, rerun the affected commands in clean environments,
update the result table, and record new compatible source revisions. Keep failures
and untested paths visible instead of presenting them as successful checks.
