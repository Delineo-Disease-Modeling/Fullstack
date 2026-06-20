#!/usr/bin/env node
/**
 * Prune duplicate convenience zones, keeping ONE per distinct population size.
 *
 * Matches zones by name (default "Barnsdall, OK"), groups them by `size`, keeps
 * the newest zone in each size group, and deletes the rest. Deleting a zone
 * cascade-deletes its runs (DB-level ON DELETE CASCADE), so this also removes
 * the on-disk files for those runs and the zone's papdata/patterns files.
 *
 * Usage (run on the host that has the prod DB + db/ files):
 *   node scripts/prune-duplicate-zones.mjs                          # DRY RUN
 *   node scripts/prune-duplicate-zones.mjs --apply                  # delete
 *   node scripts/prune-duplicate-zones.mjs --name="Barnsdall, OK"   # other name
 *   node scripts/prune-duplicate-zones.mjs --name-like="Barnsdall%" # prefix match
 *
 * Env: PRISMA_DB_URL (required), DB_FOLDER (default ./db/).
 */
import { readFileSync } from 'node:fs';
import { unlink } from 'node:fs/promises';
import pg from 'pg';

function loadEnvVar(name) {
  if (process.env[name]) return process.env[name];
  try {
    for (const line of readFileSync('.env', 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && m[1] === name) return m[2].replace(/^["']|["']$/g, '');
    }
  } catch {
    /* no .env */
  }
  return undefined;
}

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const nameArg = args.find((a) => a.startsWith('--name='));
const nameLikeArg = args.find((a) => a.startsWith('--name-like='));
const DB_FOLDER = loadEnvVar('DB_FOLDER') || './db/';
const DB_URL = loadEnvVar('PRISMA_DB_URL');

const NAME = nameArg ? nameArg.split('=').slice(1).join('=') : null;
const NAME_LIKE = nameLikeArg ? nameLikeArg.split('=').slice(1).join('=') : null;
// Default target if neither flag given.
const matchClause = NAME_LIKE
  ? { sql: `name LIKE $1`, val: NAME_LIKE }
  : { sql: `name = $1`, val: NAME ?? 'Barnsdall, OK' };

if (!DB_URL) {
  console.error('PRISMA_DB_URL is not set (env or .env).');
  process.exit(1);
}

const RUN_SUFFIXES = ['.sim', '.sim.gz', '.pat', '.pat.gz', '.map.json', '.dots.json'];

async function unlinkMany(paths) {
  const results = await Promise.allSettled(paths.map((p) => unlink(p)));
  return results.filter((r) => r.status === 'fulfilled').length;
}

async function main() {
  const pool = new pg.Pool({ connectionString: DB_URL, ssl: false });
  try {
    const { rows: zones } = await pool.query(
      `SELECT id, name, size, papdata_id, patterns_id, created_at
       FROM "ConvenienceZone"
       WHERE ${matchClause.sql}
       ORDER BY size ASC, id DESC`,
      [matchClause.val]
    );

    console.log(
      `${APPLY ? 'APPLY' : 'DRY RUN'} — matched ${zones.length} zone(s) for ${matchClause.sql.replace('$1', `'${matchClause.val}'`)}`
    );
    if (!zones.length) {
      console.log('Nothing matched. Nothing to do.');
      return;
    }

    // Group by population size; keep the newest (highest id) per group.
    const bySize = new Map();
    for (const z of zones) {
      if (!bySize.has(z.size)) bySize.set(z.size, []);
      bySize.get(z.size).push(z);
    }

    const toDelete = [];
    for (const [size, group] of bySize) {
      const sorted = [...group].sort((a, b) => b.id - a.id); // newest first
      const keep = sorted[0];
      const drop = sorted.slice(1);
      console.log(
        `\n  size ${size}: ${group.length} zone(s) → keep #${keep.id} (created ${keep.created_at.toISOString?.() ?? keep.created_at}), delete ${drop.length}`
      );
      for (const z of drop) {
        const { rows: runs } = await pool.query(
          `SELECT id, file_id FROM "SimData" WHERE czone_id = $1`,
          [z.id]
        );
        console.log(`    delete zone #${z.id} (${runs.length} run(s) will cascade)`);
        toDelete.push({ zone: z, runs });
      }
    }

    if (!toDelete.length) {
      console.log('\nNo duplicates to remove.');
      return;
    }
    if (!APPLY) {
      console.log('\nDRY RUN — no changes made. Re-run with --apply to delete.');
      return;
    }

    let zonesDeleted = 0;
    let filesDeleted = 0;
    for (const { zone, runs } of toDelete) {
      // Collect files BEFORE the cascade removes the run rows.
      const runFiles = runs.flatMap((r) =>
        RUN_SUFFIXES.map((s) => `${DB_FOLDER}${r.file_id}${s}`)
      );
      const zoneFiles = [];
      if (zone.papdata_id) zoneFiles.push(`${DB_FOLDER}${zone.papdata_id}.gz`);
      if (zone.patterns_id) {
        zoneFiles.push(`${DB_FOLDER}${zone.patterns_id}.gz`);
        zoneFiles.push(`${DB_FOLDER}${zone.patterns_id}.bin`);
      }

      const res = await pool.query(`DELETE FROM "ConvenienceZone" WHERE id = $1`, [zone.id]);
      zonesDeleted += res.rowCount ?? 0;
      filesDeleted += await unlinkMany([...runFiles, ...zoneFiles]);
    }
    console.log(`\nDeleted ${zonesDeleted} zone(s) and ${filesDeleted} file(s).`);
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
