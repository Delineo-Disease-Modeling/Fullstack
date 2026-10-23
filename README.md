# Delineo Fullstack

The Delineo website. It's a Next.js (App Router) app that serves the UI and
handles accounts. It's also the **only service that stores data**: zones, runs,
and users go in PostgreSQL, and the large files go on disk. It runs on port
**3000**.

> **New to Delineo?** Read
> [Start Here](https://github.com/Delineo-Disease-Modeling/Deploy/blob/main/docs/START_HERE.md)
> first, and keep the
> [Glossary](https://github.com/Delineo-Disease-Modeling/Deploy/blob/main/docs/GLOSSARY.md)
> handy.

**`main` is production and deploys automatically.** Do all work on a short-lived
branch. See
[How We Work](https://github.com/Delineo-Disease-Modeling/Deploy/blob/main/docs/HOW_WE_WORK.md).

## Pages

| Route | Page |
| --- | --- |
| `/` | Home |
| `/cz-generation` | CZ Generator: build a convenience zone with the Algorithms service |
| `/simulator` | Simulator: pick a zone, set the disease and interventions, start a run |
| `/simulator/<run_id>` | Results of one run: maps, charts, per-person paths, and comparison with a baseline (`?baseline=<id>`) |
| `/about`, `/team` | About the project and the team |

## Running it

The easiest way to run Fullstack together with the other services is
[Setup](https://github.com/Delineo-Disease-Modeling/Deploy/blob/main/docs/SETUP.md),
which starts everything with `Deploy/run_servers.sh`. To run Fullstack on its
own, from this folder:

```bash
pnpm install
```

```bash
cp .env.example .env
```

```bash
pnpm exec prisma migrate deploy
```

```bash
pnpm dev
```

The app runs at <http://localhost:3000>. `pnpm install` also generates the
Prisma client (through `postinstall`). Run `pnpm db:generate` again after
changing the Prisma schema.

Without Algorithms (port 1880) and Simulation (port 1870) running, the pages
load, but you can't create zones or run simulations.

### Environment

Copy `.env.example` to `.env`. Prisma CLI commands read `.env` directly. When
the stack runs through `Deploy/run_servers.sh`, the values it exports from
`Deploy/.env.local` take precedence, so keep the two files in sync.

```text
PRISMA_DB_URL=postgresql://<user>:<password>@localhost:5432/<database>
BETTER_AUTH_URL=http://localhost:3000
BETTER_AUTH_SECRET=<generated-secret>
DB_FOLDER=./db/
NEXT_PUBLIC_ALG_URL=http://localhost:1880/
NEXT_PUBLIC_SIM_URL=http://localhost:1870/
DELINEO_ADMIN_EMAILS=
```

- `PRISMA_DB_URL`: the Postgres connection, used by Prisma and the pg client.
- `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`: Better Auth configuration. Generate
  a secret with `openssl rand -base64 32`.
- `DB_FOLDER`: a writable folder for papdata, movement patterns, simulation
  output, and map caches.
- `NEXT_PUBLIC_ALG_URL`, `NEXT_PUBLIC_SIM_URL`: where the **browser** reaches
  Algorithms and Simulation. `NEXT_PUBLIC_*` values are inlined at build time,
  so production builds bake them in.
- `ALG_URL` (optional): a server-only Algorithms URL for API routes, such as
  `/api/lookup-location` and `/api/cbg-geojson`. Falls back to
  `NEXT_PUBLIC_ALG_URL`.
- `DELINEO_ADMIN_EMAILS`: comma-separated emails allowed to delete any zone or
  run. Leave it empty locally.

## Common commands

```bash
pnpm dev          # Next.js dev server
pnpm build        # production build
pnpm start        # serve a production build
pnpm lint         # Biome lint over src/
pnpm typecheck    # TypeScript check, no output files
pnpm test         # Node test runner over src/**/*.test.mjs
pnpm db:generate  # regenerate the Prisma client into src/generated/prisma
pnpm db:migrate   # create and apply a migration after editing the schema
```

> **`pnpm db:push` and `pnpm db:reset` delete all data in the database.**
> `db:push` is `prisma db push --force-reset`. Only use them on a local database
> you're happy to wipe.

## Before you open a PR

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

If you changed `prisma/schema.prisma`, also run `pnpm db:migrate`, and commit
the new folder in `prisma/migrations/` along with the schema change.
Production applies migrations with `prisma migrate deploy` when it deploys.

## Data storage

Postgres holds users, sessions, zone metadata (`ConvenienceZone`), run metadata
(`SimData`), and uploaded DMP matrices (`DmpMatrix`). The schema is in
`prisma/schema.prisma`.

The large files live under `DB_FOLDER`, and Postgres rows only point to them by
ID:

- a zone's `papdata_id` and `patterns_id` point to the population and movement
  files uploaded by Algorithms,
- a run's `file_id` points to the simulation output (`.sim.gz`) and movement
  output (`.pat.gz`) uploaded by Simulation,
- map caches are derived files, so they can be rebuilt.

## API routes

Everything is under `src/app/api/`. Some routes serve the browser, and some are
called by the other services. The exact data the service-to-service routes
send and receive is in
[Data formats](https://github.com/Delineo-Disease-Modeling/Deploy/blob/main/docs/DATA_FORMATS.md).

| Route | Methods | Used by | What it does |
| --- | --- | --- | --- |
| `/api/auth/*` | all | browser | Better Auth (sign up, log in, sessions) |
| `/api/convenience-zones` | GET, POST | browser, **Algorithms** | List zones, or create one (Algorithms creates zones when they're finalized) |
| `/api/convenience-zones/[czone_id]` | GET, PATCH, DELETE | browser | Read a zone, edit its name and description, or delete it |
| `/api/convenience-zones/claim` | POST | browser | Move guest-created zones to the signed-in account |
| `/api/convenience-zones/events` | GET | browser | Live stream of zone changes |
| `/api/patterns` | POST | **Algorithms** | Upload a zone's papdata and movement patterns |
| `/api/patterns/[czone_id]` | GET | **Simulation** | Download papdata and patterns in one stream |
| `/api/papdata/[czone_id]` | GET | nothing in the code right now | A zone's population as JSON |
| `/api/simdata` | POST | **Simulation** | Upload the results of a run |
| `/api/simdata/[id]` | GET, PATCH, DELETE | browser | Read, rename, or delete a run |
| `/api/simdata/[id]/save` | POST | browser | Mark a run as saved, so cleanup keeps it |
| `/api/simdata/[id]/chartdata`, `/map`, `/dots`, `/people-map`, `/person-path` | GET | browser | Data for each results visualization |
| `/api/simdata/cache/[czone_id]` | GET | browser | Cached runs for a zone |
| `/api/simdata-json` | POST | nothing in the code right now | Upload a run as plain JSON |
| `/api/cz-export/[czone_id]`, `/api/sim-export/[sim_id]` | GET | browser | Download a zone or run |
| `/api/dmp/matrices`, `/api/dmp/matrices/[id]` | all | browser | Manage custom DMP transition matrices |
| `/api/lookup-location` | POST | browser | Turn an address, ZIP code, or coordinates into a seed CBG |
| `/api/cbg-geojson` | GET | browser | CBG shapes, proxied from Algorithms |
| `/api/admin/me` | GET | browser | Whether the current user is an admin |

## Code map

```text
src/
├── app/                  # pages and API routes (Next.js App Router)
├── features/
│   ├── cz-generation/    # the CZ Generator page: components, hooks, Algorithms API client
│   └── model-map/        # the simulation results map
├── components/           # shared React components (ui/ holds the primitives)
├── lib/                  # shared logic: auth, Prisma client, file storage, simulation client
├── server/               # server-only helpers for API routes (responses, sessions, services)
├── stores/               # Zustand state stores
├── styles/               # CSS
└── generated/prisma/     # generated Prisma client; don't edit
prisma/                   # schema.prisma and migrations/
scripts/                  # maintenance scripts (see below)
```

## Maintenance scripts

`scripts/cleanup-unsaved-runs.mjs` deletes old unsaved runs, and
`scripts/prune-duplicate-zones.mjs` removes duplicate zones. Both **delete
data**. `cleanup-unsaved-runs.mjs` only prints what it would delete unless you
pass `--apply`. Read the comment at the top of each script before you run it.

## Things that trip people up

- **Use `localhost:3000`, not `127.0.0.1:3000`.** Algorithms and Simulation
  only accept browser requests from origins on their CORS lists.
- **A changed `NEXT_PUBLIC_*` value isn't picked up.** These are inlined at
  build time. Restart `pnpm dev`, or rebuild for production.
- **Prisma types are out of date after a schema change.** Run `pnpm db:generate`.
