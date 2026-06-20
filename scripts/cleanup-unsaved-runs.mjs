#!/usr/bin/env node
/**
 * Delete unsaved runs older than a TTL, plus their on-disk files.
 *
 * Unsaved runs (SimData.saved = false) are the default after a simulation; they
 * stay reachable by URL but are pruned here once they age out. Saved runs are
 * never touched.
 *
 * Usage (run on the host that has the prod DB + db/ files):
 *   node scripts/cleanup-unsaved-runs.mjs                 # DRY RUN (prints plan)
 *   node scripts/cleanup-unsaved-runs.mjs --apply         # actually delete
 *   node scripts/cleanup-unsaved-runs.mjs --ttl-hours=24  # override TTL
 *
 * Env: PRISMA_DB_URL (required), DB_FOLDER (default ./db/),
 *      DELINEO_UNSAVED_RUN_TTL_HOURS (default 72).
 *
 * Schedule via cron, e.g. hourly:
 *   0 * * * * cd /path/to/Fullstack && node scripts/cleanup-unsaved-runs.mjs --apply >> /var/log/delineo-cleanup.log 2>&1
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
const ttlArg = args.find((a) => a.startsWith('--ttl-hours='));
const TTL_HOURS = Number(
  ttlArg?.split('=')[1] ??
    loadEnvVar('DELINEO_UNSAVED_RUN_TTL_HOURS') ??
    72
);
const DB_FOLDER = loadEnvVar('DB_FOLDER') || './db/';
const DB_URL = loadEnvVar('PRISMA_DB_URL');

if (!DB_URL) {
  console.error('PRISMA_DB_URL is not set (env or .env).');
  process.exit(1);
}
if (!Number.isFinite(TTL_HOURS) || TTL_HOURS <= 0) {
  console.error(`Invalid TTL hours: ${TTL_HOURS}`);
  process.exit(1);
}

// Every per-run file variant we may have written.
const FILE_SUFFIXES = ['.sim', '.sim.gz', '.pat', '.pat.gz', '.map.json', '.dots.json'];

async function main() {
  const pool = new pg.Pool({ connectionString: DB_URL, ssl: false });
  try {
    const cutoffSql = `NOW() - INTERVAL '${TTL_HOURS} hours'`;
    const { rows } = await pool.query(
      `SELECT id, file_id, created_at FROM "SimData"
       WHERE saved = false AND created_at < ${cutoffSql}
       ORDER BY id ASC`
    );

    console.log(
      `${APPLY ? 'APPLY' : 'DRY RUN'} — unsaved runs older than ${TTL_HOURS}h: ${rows.length} to delete`
    );
    for (const r of rows) {
      console.log(`  run #${r.id}  file_id=${r.file_id}  created=${r.created_at.toISOString?.() ?? r.created_at}`);
    }
    if (!rows.length) {
      console.log('Nothing to do.');
      return;
    }
    if (!APPLY) {
      console.log('\nDRY RUN — no changes made. Re-run with --apply to delete.');
      return;
    }

    let deletedRows = 0;
    let deletedFiles = 0;
    for (const r of rows) {
      const res = await pool.query(`DELETE FROM "SimData" WHERE id = $1`, [r.id]);
      deletedRows += res.rowCount ?? 0;
      const results = await Promise.allSettled(
        FILE_SUFFIXES.map((s) => unlink(`${DB_FOLDER}${r.file_id}${s}`))
      );
      deletedFiles += results.filter((x) => x.status === 'fulfilled').length;
    }
    console.log(`\nDeleted ${deletedRows} run rows and ${deletedFiles} files.`);
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
