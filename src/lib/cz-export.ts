import { access, constants } from 'node:fs/promises';
import { DB_FOLDER } from '@/lib/db-files';
import { type TarEntry, createTarStream } from '@/lib/tar';

async function exists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

type CzRow = {
  id: number;
  papdata_id: string | null;
  patterns_id: string | null;
  [key: string]: unknown;
};

type SimRunRow = {
  id: number;
  file_id: string;
  name: string;
  length: number;
  created_at: Date;
  [key: string]: unknown;
};

export interface BuildExportOpts {
  czone: CzRow;
  simRuns: SimRunRow[];
  exportedBy: string;
}

/**
 * Builds a tar stream for a CZ diagnostic export. Includes the CZ row,
 * stored papdata/patterns, and per-run sim artifacts (simdata, patterns,
 * map cache, run row). Missing on-disk files are recorded in manifest.json
 * but skipped in the archive.
 */
export async function buildCzExportTar(
  opts: BuildExportOpts
): Promise<ReadableStream<Uint8Array>> {
  const { czone, simRuns, exportedBy } = opts;

  const fileList: { name: string; source: string; exists: boolean }[] = [];
  const manifest = {
    exported_at: new Date().toISOString(),
    exported_by: exportedBy,
    czone_id: czone.id,
    db_folder: DB_FOLDER,
    papdata_id: czone.papdata_id,
    patterns_id: czone.patterns_id,
    files: fileList,
    sim_runs: simRuns.map((r) => ({
      id: r.id,
      file_id: r.file_id,
      name: r.name,
      length: r.length,
      created_at: r.created_at
    }))
  };

  const entries: TarEntry[] = [
    { name: 'cz.json', content: JSON.stringify(czone, null, 2) }
  ];

  if (czone.papdata_id) {
    const src = `${DB_FOLDER}${czone.papdata_id}.gz`;
    fileList.push({
      name: 'papdata.gz',
      source: src,
      exists: await exists(src)
    });
    entries.push({ name: 'papdata.gz', path: src });
  }
  if (czone.patterns_id) {
    const src = `${DB_FOLDER}${czone.patterns_id}.gz`;
    fileList.push({
      name: 'patterns.gz',
      source: src,
      exists: await exists(src)
    });
    entries.push({ name: 'patterns.gz', path: src });
  }

  for (const run of simRuns) {
    const base = `${DB_FOLDER}${run.file_id}`;
    const variants: { tarName: string; candidates: string[] }[] = [
      {
        tarName: `simdata/${run.id}/simdata.json.gz`,
        candidates: [`${base}.sim.gz`, `${base}.sim`]
      },
      {
        tarName: `simdata/${run.id}/patterns.json.gz`,
        candidates: [`${base}.pat.gz`, `${base}.pat`]
      },
      {
        tarName: `simdata/${run.id}/map.json`,
        candidates: [`${base}.map.json`]
      }
    ];

    for (const v of variants) {
      let resolved: string | null = null;
      for (const c of v.candidates) {
        if (await exists(c)) {
          resolved = c;
          break;
        }
      }
      fileList.push({
        name: v.tarName,
        source: resolved ?? v.candidates[0],
        exists: !!resolved
      });
      if (resolved) {
        entries.push({ name: v.tarName, path: resolved });
      }
    }

    entries.push({
      name: `simdata/${run.id}/run.json`,
      content: JSON.stringify(run, null, 2)
    });
  }

  entries.unshift({
    name: 'manifest.json',
    content: JSON.stringify(manifest, null, 2)
  });

  return createTarStream(entries);
}
