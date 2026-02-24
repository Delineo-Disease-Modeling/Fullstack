import { createReadStream } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import chain from 'stream-chain';
import parser from 'stream-json';
import StreamObject from 'stream-json/streamers/StreamObject.js';
import { createGunzip, gunzipSync } from 'node:zlib';

/**
 * Pre-generates the map data cache file for a simulation run.
 *
 * The output file contains the JSON fragment:
 *   ,"papdata":{...},"simdata":{...},"hotspots":{...}
 * which is spliced into the full response by the GET handler.
 *
 * Embedding papdata in the cache allows the GET handler to skip
 * the expensive papdata gunzip+parse on every cache-hit request.
 *
 * This runs once in the background after upload so every subsequent
 * load becomes a raw file stream rather than a full recomputation.
 */
export async function generateMapData(
  simdataPath: string,
  patternsPath: string,
  papDataPath: string,
  outputPath: string
): Promise<void> {
  const raw = await readFile(papDataPath);
  const papdata = JSON.parse(
    (papDataPath.endsWith('.gz') ? gunzipSync(raw) : raw).toString()
  );

  const homeIds = Object.keys(papdata.homes).sort(
    (a, b) => Number(a) - Number(b)
  );
  const placeIds = Object.keys(papdata.places).sort(
    (a, b) => Number(a) - Number(b)
  );

  // Pre-process papdata into the compact array format the client expects
  const papDataArrays = {
    homes: homeIds.map((id) => ({ id })),
    places: placeIds.map((id) => ({
      id,
      latitude: papdata.places[id].latitude,
      longitude: papdata.places[id].longitude,
      label: papdata.places[id].label,
      top_category: papdata.places[id].top_category
    }))
  };

  const simChain: any[] = [createReadStream(simdataPath)];
  if (simdataPath.endsWith('.gz')) simChain.push(createGunzip());
  simChain.push(parser(), StreamObject.streamObject());
  const simIter = chain(simChain)[Symbol.asyncIterator]();

  const patChain: any[] = [createReadStream(patternsPath)];
  if (patternsPath.endsWith('.gz')) patChain.push(createGunzip());
  patChain.push(parser(), StreamObject.streamObject());
  const patIter = chain(patChain)[Symbol.asyncIterator]();

  let spl = await simIter.next();
  let ppl = await patIter.next();

  const hotspots: { [key: string]: number[] } = {};
  const prevInfected: { [key: string]: number } = {};

  // Accumulate as array of strings and join once at the end to avoid
  // repeated large-string concatenation in the hot loop.
  const parts: string[] = [
    `,"papdata":${JSON.stringify(papDataArrays)}`,
    ',"simdata":{'
  ];

  let first = true;

  while (!spl.done && !ppl.done) {
    const skey = spl.value.key;
    const pkey = ppl.value.key;

    if (skey !== pkey) {
      if (+skey < +pkey) {
        spl = await simIter.next();
        continue;
      } else {
        ppl = await patIter.next();
        continue;
      }
    }

    if (!first) parts.push(',');
    first = false;

    const svalue = spl.value.value;
    const pvalue = ppl.value.value;

    // Build infected Set incrementally
    const curinfected = new Set<string>();
    for (const people of Object.values(svalue)) {
      for (const key of Object.keys(people as Record<string, unknown>)) {
        curinfected.add(key);
      }
    }

    const homesArray: number[] = [];
    const placesArray: number[] = [];

    for (const id of homeIds) {
      const pop: string[] | undefined = pvalue.homes[id];
      if (pop) {
        let inf = 0;
        for (const v of pop) { if (curinfected.has(v)) inf++; }
        homesArray.push(pop.length, inf);
      } else {
        homesArray.push(0, 0);
      }
    }

    for (const id of placeIds) {
      const pop: string[] | undefined = pvalue.places[id];
      if (pop) {
        let inf = 0;
        for (const v of pop) { if (curinfected.has(v)) inf++; }
        placesArray.push(pop.length, inf);
        const prevInf = prevInfected[id] || 0;
        if (inf > 0 && prevInf > 0 && inf >= prevInf * 5) {
          if (!hotspots[id]) hotspots[id] = [];
          hotspots[id].push(Number(skey));
        }
        prevInfected[id] = inf;
      } else {
        placesArray.push(0, 0);
        prevInfected[id] = 0;
      }
    }

    parts.push(
      `"${skey}":${JSON.stringify({ h: homesArray, p: placesArray })}`
    );

    spl = await simIter.next();
    ppl = await patIter.next();
  }

  parts.push(`},"hotspots":${JSON.stringify(hotspots)}`);

  await writeFile(outputPath, parts.join(''));
}
