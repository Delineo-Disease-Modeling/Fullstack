import { open, readFile, stat } from 'node:fs/promises';

const PAPDATA_MARKER = ',"papdata":';
const SIMDATA_MARKER = ',"simdata":';
const HOTSPOTS_MARKER = ',"hotspots":';
const CACHE_LIMIT = 4;

export type MapCacheFrame = {
  h: number[];
  p: number[];
};

export type PoiPeak = {
  infected: number;
  population: number;
};

export type PoiPeaks = Record<string, PoiPeak>;

type FrameIndex = {
  key: string;
  time: number;
  byteStart: number;
  byteLength: number;
};

export type MapCacheManifest = {
  papdata: unknown;
  hotspots: Record<string, number[]>;
  timesteps: number[];
  poiPeaks: PoiPeaks;
};

type CachedManifest = MapCacheManifest & {
  frames: FrameIndex[];
  mtimeMs: number;
  size: number;
  lastAccess: number;
};

const manifestCache = new Map<string, CachedManifest>();

function cacheManifest(filePath: string, manifest: CachedManifest) {
  manifestCache.set(filePath, manifest);
  if (manifestCache.size <= CACHE_LIMIT) {
    return;
  }

  let oldestKey = '';
  let oldestAccess = Infinity;
  for (const [key, cached] of manifestCache) {
    if (cached.lastAccess < oldestAccess) {
      oldestKey = key;
      oldestAccess = cached.lastAccess;
    }
  }

  if (oldestKey) {
    manifestCache.delete(oldestKey);
  }
}

function findJsonValueEnd(input: string, start: number) {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < input.length; index += 1) {
    const char = input[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '{' || char === '[') {
      depth += 1;
      continue;
    }

    if (char === '}' || char === ']') {
      depth -= 1;
      if (depth === 0) {
        return index + 1;
      }
    }
  }

  throw new Error('Could not find JSON value end in map cache.');
}

function toNonNegativeCount(value: unknown) {
  const count = Number(value);
  if (!Number.isFinite(count) || count <= 0) {
    return 0;
  }
  return Math.trunc(count);
}

function getPapdataPlaces(papdata: unknown) {
  if (!papdata || typeof papdata !== 'object') {
    return [];
  }

  const places = (papdata as { places?: unknown }).places;
  return Array.isArray(places) ? places : [];
}

function getPlaceId(place: unknown, index: number) {
  if (place && typeof place === 'object' && 'id' in place) {
    const id = (place as { id?: unknown }).id;
    if (id !== undefined && id !== null) {
      return String(id);
    }
  }
  return String(index);
}

function updatePoiPeaks(
  poiPeaks: PoiPeaks,
  places: unknown[],
  frame: MapCacheFrame
) {
  for (let index = 0; index < places.length; index += 1) {
    const infected = toNonNegativeCount(frame.p?.[index * 2 + 1]);
    if (infected === 0) {
      continue;
    }

    const placeId = getPlaceId(places[index], index);
    const current = poiPeaks[placeId];
    if (current && current.infected >= infected) {
      continue;
    }

    poiPeaks[placeId] = {
      infected,
      population: toNonNegativeCount(frame.p?.[index * 2])
    };
  }
}

async function buildManifest(filePath: string, mtimeMs: number, size: number) {
  const raw = await readFile(filePath, 'utf8');
  const papdataIndex = raw.indexOf(PAPDATA_MARKER);
  const simdataIndex = raw.indexOf(SIMDATA_MARKER);
  const hotspotsIndex = raw.lastIndexOf(HOTSPOTS_MARKER);

  if (papdataIndex < 0 || simdataIndex < 0 || hotspotsIndex < 0) {
    throw new Error('Map cache does not contain expected sections.');
  }

  const papdataStart = papdataIndex + PAPDATA_MARKER.length;
  const simdataStart = simdataIndex + SIMDATA_MARKER.length;
  const simdataContentStart = simdataStart + 1;
  const simdataContentEnd = hotspotsIndex - 1;
  const hotspotsStart = hotspotsIndex + HOTSPOTS_MARKER.length;

  if (raw[simdataStart] !== '{' || raw[simdataContentEnd] !== '}') {
    throw new Error('Map cache simdata section is malformed.');
  }

  const papdata = JSON.parse(raw.slice(papdataStart, simdataIndex)) as unknown;
  const hotspots = JSON.parse(raw.slice(hotspotsStart)) as Record<
    string,
    number[]
  >;
  const places = getPapdataPlaces(papdata);
  const frames: FrameIndex[] = [];
  const timesteps: number[] = [];
  const poiPeaks: PoiPeaks = {};
  const simdataContentByteStart = Buffer.byteLength(
    raw.slice(0, simdataContentStart),
    'utf8'
  );

  let position = simdataContentStart;
  while (position < simdataContentEnd) {
    while (raw[position] === ',' || /\s/.test(raw[position] ?? '')) {
      position += 1;
    }
    if (position >= simdataContentEnd) {
      break;
    }

    if (raw[position] !== '"') {
      throw new Error('Map cache frame key is malformed.');
    }

    const keyStart = position + 1;
    const keyEnd = raw.indexOf('"', keyStart);
    const key = raw.slice(keyStart, keyEnd);
    const colon = raw.indexOf(':', keyEnd + 1);
    const valueStart = colon + 1;
    const valueEnd = findJsonValueEnd(raw, valueStart);
    const time = Number(key);

    if (Number.isFinite(time)) {
      const byteStart =
        simdataContentByteStart + (valueStart - simdataContentStart);
      const byteLength = valueEnd - valueStart;
      frames.push({ key, time, byteStart, byteLength });
      timesteps.push(time);
      updatePoiPeaks(
        poiPeaks,
        places,
        JSON.parse(raw.slice(valueStart, valueEnd)) as MapCacheFrame
      );
    }

    position = valueEnd;
  }

  const manifest = {
    papdata,
    hotspots,
    timesteps,
    poiPeaks,
    frames,
    mtimeMs,
    size,
    lastAccess: Date.now()
  } satisfies CachedManifest;

  cacheManifest(filePath, manifest);
  return manifest;
}

async function getCachedManifest(filePath: string) {
  const cacheStat = await stat(filePath);
  const cached = manifestCache.get(filePath);
  if (
    cached &&
    cached.mtimeMs === cacheStat.mtimeMs &&
    cached.size === cacheStat.size
  ) {
    cached.lastAccess = Date.now();
    return cached;
  }

  return buildManifest(filePath, cacheStat.mtimeMs, cacheStat.size);
}

function findNearestFrame(frames: FrameIndex[], requestedTime: number) {
  if (frames.length === 0) {
    return null;
  }

  let nearest = frames[0];
  for (const frame of frames) {
    if (
      Math.abs(frame.time - requestedTime) <
      Math.abs(nearest.time - requestedTime)
    ) {
      nearest = frame;
    }
    if (frame.time > requestedTime) {
      break;
    }
  }

  return nearest;
}

export async function loadMapCacheManifest(
  filePath: string
): Promise<MapCacheManifest> {
  const { papdata, hotspots, timesteps, poiPeaks } =
    await getCachedManifest(filePath);
  return { papdata, hotspots, timesteps, poiPeaks };
}

export async function loadMapCacheFrame(
  filePath: string,
  requestedTime: number
) {
  const manifest = await getCachedManifest(filePath);
  const frameIndex = findNearestFrame(manifest.frames, requestedTime);
  if (!frameIndex) {
    throw new Error('No map timestep found.');
  }

  const file = await open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(frameIndex.byteLength);
    let bytesRead = 0;
    while (bytesRead < frameIndex.byteLength) {
      const result = await file.read(
        buffer,
        bytesRead,
        frameIndex.byteLength - bytesRead,
        frameIndex.byteStart + bytesRead
      );
      if (result.bytesRead === 0) {
        throw new Error('Unexpected end of map cache frame.');
      }
      bytesRead += result.bytesRead;
    }
    return {
      time: frameIndex.time,
      requested_time: requestedTime,
      frame: JSON.parse(buffer.toString('utf8')) as MapCacheFrame
    };
  } finally {
    await file.close();
  }
}
