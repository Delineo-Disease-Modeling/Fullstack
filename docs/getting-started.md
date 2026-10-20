# Getting started

This guide installs the public Delineo application locally and runs a small
synthetic scenario. It assumes a POSIX shell on macOS or Linux; Windows users can
use WSL with the same directory layout. See the [verification record](verification.md)
for the platform and exact revisions exercised.

The example creates a new zone and run in your local database. Use a disposable
development database and a fresh checkout for this walkthrough.

## 1. Install prerequisites and clone the repositories

Have these tools available before starting:

- Git.
- Node.js 24 and pnpm **10.29.1**, matching Fullstack's `packageManager` field.
  If you use Corepack, `corepack pnpm` runs the version selected by that field.
- Python **3.12** with `venv` and `pip`. The pinned scientific packages do not
  install on older system Python versions such as 3.9 or 3.10.
- PostgreSQL 15 or newer, running locally, with `createdb` and `psql` on your PATH.
  On Homebrew installations these tools may be under the installed PostgreSQL
  formula's `bin` directory.
- An internet connection for the first dependency installation.

```bash
mkdir delineo
cd delineo
git clone https://github.com/Delineo-Disease-Modeling/Fullstack.git
git clone https://github.com/Delineo-Disease-Modeling/Algorithms.git
git clone https://github.com/Delineo-Disease-Modeling/Simulation.git
```

Keep the clones beside each other:

```text
delineo/
  Fullstack/
  Algorithms/
  Simulation/
```

The private Deploy repository and personal workspace scripts are not needed.
Commands marked **workspace directory** run from the enclosing `delineo/` folder.

## 2. Create an empty database and configure Fullstack

From the workspace directory, create a database using your local PostgreSQL role:

```bash
createdb delineo_dev
cp Fullstack/.env.example Fullstack/.env
```

Edit `Fullstack/.env`:

```dotenv
PRISMA_DB_URL=postgresql://YOUR_POSTGRES_USER:YOUR_PASSWORD@localhost:5432/delineo_dev
DB_FOLDER=./db/
BETTER_AUTH_SECRET=REPLACE_WITH_A_GENERATED_SECRET
BETTER_AUTH_URL=http://localhost:3000
NEXT_PUBLIC_SIM_URL=http://localhost:1870/
NEXT_PUBLIC_ALG_URL=http://localhost:1880/
DELINEO_ADMIN_EMAILS=
```

If your local role uses passwordless authentication, omit `:YOUR_PASSWORD` from
the URL. Use URL-encoded credentials where necessary. Generate the auth secret
with `openssl rand -base64 32` and paste the result into `.env`.

Keep the trailing slash on `DB_FOLDER` and both service URLs. `./db/` is relative
to the Fullstack process's working directory. This is where generated data is
written. Leave `DELINEO_ADMIN_EMAILS` empty for this example.

## 3. Install dependencies and initialize the schema

From the workspace directory:

```bash
cd Fullstack
pnpm --version
pnpm install --frozen-lockfile
pnpm db:generate
pnpm exec prisma db push
cd ..

python3.12 -m venv Algorithms/.venv
Algorithms/.venv/bin/python -m pip install -r Algorithms/requirements.txt
Algorithms/.venv/bin/python -m pip check

python3.12 -m venv Simulation/.venv
Simulation/.venv/bin/python -m pip install -r Simulation/requirements.txt
Simulation/.venv/bin/python -m pip check
```

Expect pnpm version `10.29.1`, successful Prisma client generation, a message that
the database is in sync with the Prisma schema, and no broken Python requirements.
`pnpm install` already generates the Prisma client; the explicit command is also
useful after schema changes.

Use the exact `pnpm exec prisma db push` command above for this empty development
database. The existing `pnpm db:push` script includes `--force-reset` and would
erase data. `pnpm db:reset` also resets a database. The checked revision has no
committed Prisma migration history; `db:migrate` is for authoring migrations,
not a prerequisite for this walkthrough.

Simulation's root requirements include the DMP runtime and editor dependencies;
there is no need to install `dmp/requirements.txt` a second time.

## 4. Start the three services

Use one terminal per service. Each command below starts from the workspace
directory and stays in the foreground; stop it with Ctrl-C.

**Terminal A — Fullstack:**

```bash
cd Fullstack
pnpm dev
```

**Terminal B — Algorithms:**

```bash
cd Algorithms/server
FULLSTACK_URL=http://localhost:3000 ../.venv/bin/python server.py
```

**Terminal C — Simulation:**

```bash
cd Simulation
DELINEO_DB_URL=http://localhost:3000/api/ .venv/bin/python server.py
```

Algorithms must start in `Algorithms/server/` because some data paths are relative
to that directory. Simulation's entry point is **`server.py`**. For a WSGI server,
the module target is `server:app`; a top-level `app.py` would conflict with DMP
imports.

| Service | Local URL | Role |
| --- | --- | --- |
| Fullstack | http://localhost:3000 | UI, application API, storage |
| Algorithms | http://localhost:1880 | Zone and movement services |
| Simulation | http://localhost:1870 | Simulation and SSE progress |

Wait until Next.js reports it is ready and both Python services report they are
running. The first Python startup can take a minute or two while native libraries
initialize. Then check readiness from a fourth terminal:

```bash
curl --fail 'http://localhost:3000/api/convenience-zones?all=true'
curl --fail 'http://localhost:1880/pattern-availability?state=OK&start_date=2021-04-05&end_date=2021-04-05'
curl --fail http://localhost:1870/
```

On an empty installation, Fullstack returns `{"data":[]}`. Algorithms returns
an availability response with an empty `available_months` list if mobility data
has not been installed. Simulation returns a JSON object with `status: "ok"`
and `service: "delineo-simulation"`. Algorithms has no `/` health route; a 404 at
that root URL is not a startup failure.

Open [the local application](http://localhost:3000). Keep these default ports for
the walkthrough. If changing ports, update the frontend environment and Python
callback URLs together, and account for the services' configured CORS origins.

## 5. Run the synthetic example

From the workspace directory:

```bash
Algorithms/.venv/bin/python Fullstack/docs/examples/smoke.py
```

The script checks all three services, creates 12 synthetic people in three homes
with two synthetic POIs, uses the actual Algorithms movement generator to create
24 hours of patterns, uploads the inputs through Fullstack, and requests a
1,440-minute simulation. It waits for SSE completion and verifies the stored
chart and map data, then saves the run and prints its local URL.

Expect output ending in `PASS`, a zone ID, a run ID, and a URL like
`http://localhost:3000/simulator/1`. IDs depend on the contents of your database.
Open that URL to inspect the run. Infection counts are not an acceptance target
for this artificial example.

This exercises movement generation, input transfer, simulation, output storage,
and result processing. It intentionally constructs the population and zone
directly, so it **does not test Census-based population generation or geographic
clustering**. It uses `dmp_mode=off` to check the default timeline path without an
HTTP DMP dependency. All people and POI statistics in the script are artificial;
it requires no licensed mobility files.

To exercise the bundled progression models through the in-process DMP path:

```bash
Algorithms/.venv/bin/python Fullstack/docs/examples/smoke.py --dmp-mode required
```

Each invocation creates a new, named demo zone and saved run. The script only
accepts loopback service URLs and is intended for your disposable local database.

## 6. Optional: expose the DMP API or editor

Simulation normally loads DMP in-process. To inspect the separate API, start it
from the workspace directory in another terminal:

```bash
cd Simulation
.venv/bin/python -m uvicorn dmp.api.dmp_api_v2:app --host 127.0.0.1 --port 8000
```

Visit [the API explorer](http://localhost:8000/docs), or query:

```bash
curl --fail http://localhost:8000/diseases
```

To edit progression models instead, from `Simulation/` run:

```bash
.venv/bin/python -m streamlit run dmp/app/graph_visualization.py
```

The editor writes to `dmp/app/state_machine/state_machines.db`. Preserve deliberate
model edits separately from source changes. The API's startup and model lookup
checks are recorded in [Verification](verification.md); visual editor workflows
are outside this milestone.

## 7. Prepare data for a real convenience zone

A fresh clone cannot generate a real region until the needed data is installed.
Obtain the project's compatible mobility and population inputs from their provider
or the project maintainers under the applicable access terms. No public download
bundle for those project inputs is assumed by this guide.

Algorithms expects this layout under `Algorithms/server/`:

```text
data/
  cbg_b01.csv
  patterns/
    OK/
      2021-04-OK.parquet
  shapefiles_2016/
    tl_2016_40_bg/
      tl_2016_40_bg.shp
      tl_2016_40_bg.dbf
      tl_2016_40_bg.shx
      tl_2016_40_bg.prj
```

The state and month above are an example, not bundled data. Patterns resolution
also accepts `.csv.gz`, `.converted.csv`, and `.csv`, preferring `.parquet`.
Select a date with matching monthly data; missing months should produce an error,
not a silent substitution. See
[`server/patterns_loader.py`](https://github.com/Delineo-Disease-Modeling/Algorithms/blob/main/server/patterns_loader.py)
for the consumed columns. `cbg_b01.csv` must include 2016-compatible CBG GEOIDs and
the population/demographic columns used by the generators.

The tracked downloader can obtain public 2016 TIGER/Line block-group geometry:

```bash
Algorithms/.venv/bin/python Algorithms/server/scripts/download_tiger_2016_bg.py --states OK
```

Install geometry for the states needed by your region, including neighboring
states when relevant. Keep the `.shp`, `.dbf`, `.shx`, and `.prj` files together.
These 2016 boundaries match the CBG identifiers expected by the current pipeline.
Population generation also calls the Census API; configure your own
`CENSUS_API_KEY` in the Algorithms process environment where needed.

Check `/pattern-availability?state=OK&start_date=2021-04-05&end_date=2021-04-05` again, then use the browser's convenience-zone
generation workflow with a covered state and month. This real-data path needs
separate validation with your actual inputs; the synthetic smoke result does not
certify it.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| `No matching distribution` during Python installation | Confirm the venv uses Python 3.12, then reinstall the matching root requirements. Avoid installing missing imports one by one. |
| Prisma cannot connect or tables are missing | Check the role, password, port, and database in `PRISMA_DB_URL`; run the schema command against the new database. |
| `python app.py` fails in Simulation | Use `python server.py` from `Simulation/`. |
| Address already in use | Stop the process you previously started in that terminal or choose coordinated alternative ports. |
| Algorithms starts but zone generation fails | Verify monthly mobility data, `cbg_b01.csv`, 2016 geometry, and Census API connectivity. |
| Simulation cannot load zone inputs | Confirm Fullstack is running, `DELINEO_DB_URL` ends in `/api/`, and the zone has uploaded population and patterns. |
| UI starts but Algorithms or Simulation requests fail | Check both `NEXT_PUBLIC_*` URLs and the allowed browser origin. Restart Next.js after environment changes. |
| Run finishes but charts remain unavailable | Check Fullstack logs and that `DB_FOLDER` is writable; SSE completion precedes some result processing. |

For later frontend changes, its existing checks are `pnpm lint`,
`pnpm typecheck`, `pnpm test`, and `pnpm build`. For model or algorithm changes,
run the relevant repository's tests as well. See the [verification record](verification.md)
for the checks performed for this documentation milestone.
