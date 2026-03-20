import { constants } from 'node:fs';
import { access, readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';

const DB_FOLDER = process.env.DB_FOLDER || './db/';
const MAX_CACHE_SIZE = 5;

interface CacheEntry {
  data: any;
  lastAccess: number;
}

const cache = new Map<string, CacheEntry>();

/**
 * Load and cache parsed papdata by its ID.
 *
 * The same papdata .gz file is decompressed and parsed in 4+ route handlers.
 * This LRU cache ensures it's only read from disk and gunzipped once,
 * then served from memory for subsequent accesses.
 */
export async function getCachedPapdata(papdataId: string): Promise<any> {
  const cached = cache.get(papdataId);
  if (cached) {
    cached.lastAccess = Date.now();
    return cached.data;
  }

  const papPath = `${DB_FOLDER}${papdataId}.gz`;
  await access(papPath, constants.F_OK);
  const raw = await readFile(papPath);
  const data = JSON.parse(gunzipSync(raw).toString());

  // Evict least-recently-used entry if at capacity
  if (cache.size >= MAX_CACHE_SIZE) {
    let oldestKey = '';
    let oldestTime = Infinity;
    for (const [key, entry] of cache) {
      if (entry.lastAccess < oldestTime) {
        oldestTime = entry.lastAccess;
        oldestKey = key;
      }
    }
    if (oldestKey) {
      cache.delete(oldestKey);
    }
  }

  cache.set(papdataId, { data, lastAccess: Date.now() });
  return data;
}

/** Remove a cached entry (e.g. when a CZ is deleted). */
export function invalidatePapdata(papdataId: string): void {
  cache.delete(papdataId);
}
