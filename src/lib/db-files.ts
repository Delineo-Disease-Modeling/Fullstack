import { constants } from 'node:fs';
import { access, readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';

export const DB_FOLDER = process.env.DB_FOLDER || './db/';

type ResolvedDbFile = {
  path: string;
  gzipped: boolean;
};

export async function resolveDbDataPath(
  fileId: string,
  suffix = ''
): Promise<ResolvedDbFile> {
  const basePath = `${DB_FOLDER}${fileId}${suffix}`;
  const gzPath = `${basePath}.gz`;

  try {
    await access(gzPath, constants.F_OK);
    return { path: gzPath, gzipped: true };
  } catch {}

  // Binary patterns (DLNOPAT) are stored raw under `.bin` — already
  // zstd-compressed, so served as-is (not gunzipped).
  const binPath = `${basePath}.bin`;
  try {
    await access(binPath, constants.F_OK);
    return { path: binPath, gzipped: false };
  } catch {}

  await access(basePath, constants.F_OK);
  return { path: basePath, gzipped: false };
}

export async function readDbJson<T = unknown>(
  fileId: string,
  suffix = ''
): Promise<T> {
  const { path, gzipped } = await resolveDbDataPath(fileId, suffix);
  const raw = await readFile(path);
  return JSON.parse((gzipped ? gunzipSync(raw) : raw).toString()) as T;
}
