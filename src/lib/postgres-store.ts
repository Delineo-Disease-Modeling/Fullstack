import { createReadStream } from 'node:fs';
import { createGunzip, gunzipSync, gzipSync } from 'node:zlib';
import chain from 'stream-chain';
import parser from 'stream-json';
import StreamObject from 'stream-json/streamers/StreamObject.js';
import { prisma } from './prisma';

export async function processSimData(
  simDataId: number,
  simdataPath: string,
  patternsPath: string
) {
  const simChain: any[] = [createReadStream(simdataPath)];
  if (simdataPath.endsWith('.gz')) simChain.push(createGunzip());
  simChain.push(parser(), StreamObject.streamObject());

  const simdatapl = chain(simChain)[Symbol.asyncIterator]();

  const patChain: any[] = [createReadStream(patternsPath)];
  if (patternsPath.endsWith('.gz')) patChain.push(createGunzip());
  patChain.push(parser(), StreamObject.streamObject());

  const patternspl = chain(patChain)[Symbol.asyncIterator]();

  let spl = await simdatapl.next();
  let ppl = await patternspl.next();

  let batch: any[] = [];
  const BATCH_SIZE = 1000;

  while (!spl.done && !ppl.done) {
    const skey = spl.value.key;
    const pkey = ppl.value.key;

    if (skey !== pkey) {
      if (+skey < +pkey) {
        spl = await simdatapl.next();
        continue;
      } else {
        ppl = await patternspl.next();
        continue;
      }
    }

    const svalue = spl.value.value;
    const pvalue = ppl.value.value;
    const time = +skey / 60;

    for (const [id, pop] of Object.entries(pvalue.homes) as [
      string,
      string[]
    ][]) {
      let infectedCount = 0;
      const infectionDetails: any = {};

      for (const [disease, people] of Object.entries(svalue) as [
        string,
        object
      ][]) {
        const diseaseInfections = Object.entries(people).filter(([pid, _]) =>
          pop.includes(pid)
        );
        if (diseaseInfections.length > 0) {
          infectionDetails[disease] = Object.fromEntries(diseaseInfections);
          infectedCount += diseaseInfections.length;
        }
      }

      batch.push({
        simDataId,
        time,
        locationId: id,
        locationType: 'home',
        population: pop.length,
        infected: infectedCount,
        infectedList: gzipSync(JSON.stringify(infectionDetails))
      });
    }

    for (const [id, pop] of Object.entries(pvalue.places) as [
      string,
      string[]
    ][]) {
      let infectedCount = 0;
      const infectionDetails: any = {};

      for (const [disease, people] of Object.entries(svalue) as [
        string,
        object
      ][]) {
        const diseaseInfections = Object.entries(people).filter(([pid, _]) =>
          pop.includes(pid)
        );
        if (diseaseInfections.length > 0) {
          infectionDetails[disease] = Object.fromEntries(diseaseInfections);
          infectedCount += diseaseInfections.length;
        }
      }

      batch.push({
        simDataId,
        time,
        locationId: id,
        locationType: 'place',
        population: pop.length,
        infected: infectedCount,
        infectedList: gzipSync(JSON.stringify(infectionDetails))
      });
    }

    if (batch.length >= BATCH_SIZE) {
      try {
        await prisma.locationStats.createMany({ data: batch });
      } catch (e: any) {
        if (e?.code === 'P2003') {
          console.log(`Ingestion aborted for SimData #${simDataId}: parent record was deleted`);
          return;
        }
        throw e;
      }
      batch = [];
    }

    spl = await simdatapl.next();
    ppl = await patternspl.next();
  }

  if (batch.length > 0) {
    try {
      await prisma.locationStats.createMany({ data: batch });
    } catch (e: any) {
      if (e?.code === 'P2003') {
        console.log(`Ingestion aborted for SimData #${simDataId}: parent record was deleted`);
        return;
      }
      throw e;
    }
  }
}

export async function getStats(simDataId: number, locationId: string) {
  const rows = await prisma.locationStats.findMany({
    where: { simDataId, locationId },
    orderBy: { time: 'asc' }
  });

  return rows.map((row: any) => {
    let infected_list = {};
    try {
      if (row.infectedList) {
        infected_list = JSON.parse(gunzipSync(row.infectedList).toString());
      }
    } catch (e) {
      console.error('Failed to parse infected_list', e);
    }
    return { ...row, infected_list };
  });
}
