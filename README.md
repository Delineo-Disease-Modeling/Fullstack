# Delineo Fullstack

Next.js App Router app for the Delineo UI, auth, database-backed API routes, and file-backed simulation data storage.

Production is deployed from `main`, so do normal feature and fix work on a short-lived branch or worktree.

## Prerequisites

- Node.js and pnpm. The project pins `pnpm@10.29.1` in `package.json`.
- PostgreSQL for Prisma and Better Auth data.
- The sibling Delineo Algorithms service on `http://localhost:1880`.
- The sibling Delineo Simulation service on `http://localhost:1870`.

## Setup

From this directory:

```bash
pnpm install
cp .env.example .env
pnpm db:generate
pnpm db:migrate
pnpm dev
```

`pnpm install` runs `prisma generate` through `postinstall`. Run `pnpm db:generate` again after Prisma schema changes.

The dev app runs at `http://localhost:3000`.

## Environment

Create `.env` from `.env.example`. Prisma CLI commands load `.env` directly.

```text
PRISMA_DB_URL=postgresql://<user>:<password>@localhost:5432/<database>
BETTER_AUTH_URL=http://localhost:3000
BETTER_AUTH_SECRET=<generated-secret>
DB_FOLDER=./db/
NEXT_PUBLIC_ALG_URL=http://localhost:1880/
NEXT_PUBLIC_SIM_URL=http://localhost:1870/
ALG_URL=http://localhost:1880/
```

- `PRISMA_DB_URL` is used by Prisma and the Postgres client.
- `BETTER_AUTH_URL` and `BETTER_AUTH_SECRET` configure Better Auth. Generate a local secret with `openssl rand -base64 32`.
- `DB_FOLDER` must point to a writable directory for generated PAP, movement pattern, simulation, and map-cache files.
- `NEXT_PUBLIC_ALG_URL` is used by client-side Algorithms calls.
- `NEXT_PUBLIC_SIM_URL` is used by client-side Simulation calls.
- `ALG_URL` is an optional server-only override used by the lookup-location API route; it falls back to `NEXT_PUBLIC_ALG_URL`.

## Algorithms And Simulation

The Fullstack app expects both sibling services to be running for the full create-zone and simulation workflows.

Algorithms:

```bash
cd ../Algorithms
python -m pip install -r requirements.txt
cd server
python server.py
```

Defaults to `http://localhost:1880`. The Algorithms service uses `FULLSTACK_URL=http://localhost:3000` by default when it needs to call back into Fullstack.

Simulation:

```bash
cd ../Simulation
python -m pip install -r requirements.txt
python app.py
```

Defaults to `http://localhost:1870`. The Simulation service uses `DELINEO_DB_URL=http://localhost:3000/api/` by default for Fullstack API access.

## Common Commands

```bash
pnpm dev          # Next.js dev server
pnpm build        # Production build
pnpm start        # Serve a production build
pnpm lint         # Biome lint over src
pnpm typecheck    # TypeScript no-emit check
pnpm test         # Node test runner for src/**/*.test.mjs
pnpm db:generate  # Generate Prisma client into src/generated/prisma
pnpm db:migrate   # Run local Prisma migrations
```

Use `pnpm db:reset` or `pnpm db:push` only for disposable local databases; both can replace local database state.

## Data Storage

Postgres stores users, auth records, convenience-zone metadata, and simulation run metadata. Larger generated payloads live under `DB_FOLDER`, with IDs referenced from Postgres records. These include PAP data, movement patterns, simulation output, pattern output, and map caches.

## Validation Gates

Before handing off a refactor change, run:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

If the change touches Prisma schema or database behavior, also run the relevant Prisma command, usually `pnpm db:generate` and `pnpm db:migrate` against a local database.
