# Delineo Fullstack (UI + API)

Next.js App Router app that serves both the Delineo UI and the JSON/file-storage API (`/api/*`). Runs on port 3000.

Try it out: <https://delineo.me>

## Setup

Install [node](https://nodejs.org/) and [pnpm](https://pnpm.io/), then:

```bash
cp .env.example .env
# edit .env: PRISMA_DB_URL, DB_FOLDER, BETTER_AUTH_SECRET,
#           NEXT_PUBLIC_SIM_URL, NEXT_PUBLIC_ALG_URL
pnpm install
pnpm db:generate
pnpm db:push
pnpm dev
```

The Delineo Python services (Algorithms on :1880, Simulation on :1870, optional DMP on :8000) must be running separately — see the root [STARTUP.md](../STARTUP.md).

The old `client/` + `server/` split (Vite + Hono, ports 5173 + 1890) is obsolete.

## Data Structures
Delineo utilizes multiple JSON files to store and manage simulation data. The core files are `patterns.json` and `papdata.json` (pre-simulation inputs) and the `.sim[.gz]` files produced by a simulation run.

### patterns.json ###
This file captures the movement patterns within the simulation at specific timesteps. Each entry represents a timestep key mapped to homes and places pattern values, detailing which individuals are present at various locations. 

Structure:
```json
{
    "60": {             // Timestep in minutes or simulation time unit
        "homes": {      // Home patterns
            "1": [      // Home ID
                "4", 
                "5"     // List of person IDs present at this home
            ]
        },
        "places": {
            "3": [      // Place ID
                "24", 
                "25"    // List of person IDs present at this place
            ]
        },
    }
}
```
- Each timestep (e.g., 60, 120, 180) is represented as a key.
- The homes key maps home IDs to lists of person IDs residing there.
- The places key maps place IDs to lists of person IDs visiting these locations.

### papdata.json ###
The papdata.json file contains demographic details for individuals in the simulation, including age, sex, and home location.

Structure:
```json
{
    "people": {
        "0": {
            "sex": 0,       // 0: Male, 1: Female
            "age": 21,      // Age of person
            "home": "0"     // Home ID where the person resides
        },
        "1": {
            "sex": 1,
            "age": 21,
            "home": "0"
        }
    }
}
```
- The people key maps person IDs to their demographic information.
- Each person entry contains sex, age, and home details.
- This file is used to reference individuals in patterns.json.

### Simulation output (`.sim[.gz]`)
Per-timestep simulation state is written incrementally by the simulator and uploaded via `POST /api/simdata`. Files are stored as `{file_id}.sim[.gz]` (timestep state) and `{file_id}.pat[.gz]` (patterns snapshot) under `DB_FOLDER`. Each timestep's entry maps variant names to per-person infection states, e.g.:

```json
{
    "60": {             // Timestep (minutes)
        "delta": {
            "22": 3     // Person ID → bitwise infection state
        },
        "omicron": {
            "27": 3
        }
    }
}
```

Aggregate stats (final case counts, peak timing, etc.) are written to the `SimData.global_stats` JSON column in Postgres by the `processSimulation` pipeline in `src/lib/sim-processor.ts`. The `infectivity.json` schema referenced in older docs was a historical artifact.
