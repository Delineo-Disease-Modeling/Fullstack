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
 *   ,"simdata":{...},"hotspots":{...}
 * which is spliced into the full response by the GET handler.
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

  // Accumulate as array of strings and join once at the end — avoids
  // repeated large-string concatenation in the hot loop.
  const parts: string[] = [',"simdata":{'];
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

    const curinfected = new Set<string>(
      Object.values(svalue).flatMap((people) => Object.keys(people as any))
    );

    const homesArray: number[] = [];
    const placesArray: number[] = [];

    for (const id of homeIds) {
      const pop = pvalue.homes[id];
      if (pop) {
        homesArray.push(
          pop.length,
          pop.filter((v: string) => curinfected.has(v)).length
        );
      } else {
        homesArray.push(0, 0);
      }
    }

    for (const id of placeIds) {
      const pop = pvalue.places[id];
      if (pop) {
        const infCount = pop.filter((v: string) => curinfected.has(v)).length;
        placesArray.push(pop.length, infCount);
        const prevInf = prevInfected[id] || 0;
        if (infCount > 0 && prevInf > 0 && infCount >= prevInf * 5) {
          if (!hotspots[id]) hotspots[id] = [];
          hotspots[id].push(Number(skey));
        }
        prevInfected[id] = infCount;
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
