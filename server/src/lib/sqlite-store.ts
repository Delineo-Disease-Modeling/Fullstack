import Database from 'better-sqlite3';
import { createReadStream } from 'fs';
import chain from 'stream-chain';
import parser from 'stream-json';
import StreamObject from 'stream-json/streamers/StreamObject.js';

export class SimDatabase {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.init();
  }

  private init() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS location_stats (
        time INTEGER,
        location_id TEXT,
        location_type TEXT,
        population INTEGER,
        infected INTEGER,
        infected_list TEXT,
        PRIMARY KEY (location_id, time)
      );
      
      CREATE INDEX IF NOT EXISTS idx_location_time ON location_stats(location_id, time);
    `);
  }

  public insertBatch(rows: any[]) {
    const insert = this.db.prepare(`
      INSERT OR REPLACE INTO location_stats (time, location_id, location_type, population, infected, infected_list)
      VALUES (@time, @location_id, @location_type, @population, @infected, @infected_list)
    `);

    const insertMany = this.db.transaction((data) => {
      for (const row of data) insert.run(row);
    });

    insertMany(rows);
  }

  public getStats(locationId: string) {
    const stmt = this.db.prepare(`
      SELECT time, population, infected, infected_list
      FROM location_stats
      WHERE location_id = ?
      ORDER BY time ASC
    `);
    
    return stmt.all(locationId).map((row: any) => ({
      ...row,
      infected_list: JSON.parse(row.infected_list)
    }));
  }

  public close() {
    this.db.close();
  }
}

export async function ingestSimData(
  simdataPath: string,
  patternsPath: string,
  dbPath: string
) {
  const simDb = new SimDatabase(dbPath);
  
  // Streaming Logic (similar to sim-stats but inserting into DB)
  const simdatapl = chain([
    createReadStream(simdataPath),
    parser(),
    StreamObject.streamObject()
  ])[Symbol.asyncIterator]();

  const patternspl = chain([
    createReadStream(patternsPath),
    parser(),
    StreamObject.streamObject()
  ])[Symbol.asyncIterator]();

  let spl = await simdatapl.next();
  let ppl = await patternspl.next();

  let batch: any[] = [];
  const BATCH_SIZE = 1000; // Adjust based on memory/perf

  while (!spl.done && !ppl.done) {
    const skey = spl.value.key;
    const pkey = ppl.value.key;

    if (skey !== pkey) {
        if (+skey < +pkey) { spl = await simdatapl.next(); continue; }
        else { ppl = await patternspl.next(); continue; }
    }

    const svalue = spl.value.value;
    const pvalue = ppl.value.value;
    const time = +skey / 60; // Convert to hours or keep as minutes? User code divides by 60 usually.

    /*
      Data Structure needed for Chart:
      - time
      - population
      - infected
      - infected_list (breakdown by disease)
    */

    // Homes
    for (const [id, pop] of Object.entries(pvalue['homes']) as [string, string[]][]) {
        // Find infected in this house
        const houseInfections: Record<string, number> = {};
        
        let infectedCount = 0;
        const infectionDetails: any = {};

        for (const [disease, people] of Object.entries(svalue) as [string, object][]) {
            const diseaseInfections = Object.entries(people).filter(([pid, _]) => pop.includes(pid));
            if (diseaseInfections.length > 0) {
                infectionDetails[disease] = Object.fromEntries(diseaseInfections);
                infectedCount += diseaseInfections.length; // Approximate if one person has multiple diseases? Usually acceptable.
            }
        }

        batch.push({
            time,
            location_id: id,
            location_type: 'home',
            population: pop.length,
            infected: infectedCount,
            infected_list: JSON.stringify(infectionDetails)
        });
    }

    // Places
    for (const [id, pop] of Object.entries(pvalue['places']) as [string, string[]][]) {
        let infectedCount = 0;
        const infectionDetails: any = {};

        for (const [disease, people] of Object.entries(svalue) as [string, object][]) {
            const diseaseInfections = Object.entries(people).filter(([pid, _]) => pop.includes(pid));
            if (diseaseInfections.length > 0) {
                 infectionDetails[disease] = Object.fromEntries(diseaseInfections);
                 infectedCount += diseaseInfections.length;
            }
        }

        batch.push({
            time,
            location_id: id,
            location_type: 'place',
            population: pop.length,
            infected: infectedCount,
            infected_list: JSON.stringify(infectionDetails)
        });
    }
    
    if (batch.length >= BATCH_SIZE) {
        simDb.insertBatch(batch);
        batch = [];
    }

    spl = await simdatapl.next();
    ppl = await patternspl.next();
  }

  if (batch.length > 0) {
      simDb.insertBatch(batch);
  }

  simDb.close();
}
