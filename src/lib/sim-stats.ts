import { createReadStream } from 'node:fs';
import { createGunzip, gunzipSync } from 'node:zlib';
import chain from 'stream-chain';
import parser from 'stream-json';
import StreamObject from 'stream-json/streamers/StreamObject.js';

const age_ranges: [number, number][] = [
  [0, 20],
  [21, 40],
  [41, 60],
  [61, 80],
  [81, 99]
];

const age_range_labels = age_ranges.map(([lo, hi]) => `${lo}-${hi}`);

/* bitmask states */
const bitmask_states: [string, number][] = [
  ['Infected', 1],
  ['Infectious', 2],
  ['Symptomatic', 4],
  ['Hospitalized', 8],
  ['Recovered', 16],
  ['Removed', 32]
];

const all_state_names = ['Susceptible', ...bitmask_states.map(([n]) => n)];

type DataPoint = {
  time: number;
  [key: string]: number;
};

type ChartData = {
  [type: string]: DataPoint[];
};

export async function generateGlobalStats(
  simdataPath: string,
  papDataPath: string,
  totalPopulation?: number
) {
  const papDataRaw = await import('node:fs/promises').then((fs) =>
    fs.readFile(papDataPath)
  );
  let papdata: any;
  try {
    if (papDataPath.endsWith('.gz')) {
      papdata = JSON.parse(gunzipSync(papDataRaw).toString());
    } else {
      papdata = JSON.parse(papDataRaw.toString());
    }
  } catch (e) {
    console.error('Failed to parse PapData:', e);
    throw e;
  }

  // Derive total population from papdata if not provided
  const popCount =
    totalPopulation ?? Object.keys(papdata.people ?? {}).length;

  // Pre-build an age-range index for faster lookup per person
  const ageIndex: Map<string, number> = new Map();
  for (const [id, person] of Object.entries(papdata.people ?? {}) as [
    string,
    any
  ][]) {
    for (let i = 0; i < age_ranges.length; i++) {
      if (person.age >= age_ranges[i][0] && person.age <= age_ranges[i][1]) {
        ageIndex.set(id, i);
        break;
      }
    }
  }

  const data: ChartData = {
    iot: [],
    ages: [],
    sexes: [],
    states: []
  };

  // Stream only simdata
  const simChain: any[] = [createReadStream(simdataPath)];
  if (simdataPath.endsWith('.gz')) simChain.push(createGunzip());
  simChain.push(parser(), StreamObject.streamObject());

  const simIter = chain(simChain)[Symbol.asyncIterator]();

  for (let item = await simIter.next(); !item.done; item = await simIter.next()) {
    const { key: skey, value: svalue } = item.value;
    const time = +skey / 60;

    const iot_data: DataPoint = { time };
    const ages_data: DataPoint = { time };
    const sexes_data: DataPoint = { time };
    const states_data: DataPoint = { time };

    sexes_data.Male = 0;
    sexes_data.Female = 0;
    for (const label of age_range_labels) ages_data[label] = 0;
    for (const name of all_state_names) states_data[name] = 0;

    let totalInfected = 0;

    for (const [disease, people] of Object.entries(svalue) as [
      string,
      Record<string, number>
    ][]) {
      const entries = Object.entries(people);
      iot_data[disease] = entries.length;
      totalInfected += entries.length;

      // Single pass over infected people: bitmask states + demographics
      for (const [id, stateBitmask] of entries) {
        for (const [stateName, bit] of bitmask_states) {
          if (stateBitmask & bit) states_data[stateName]++;
        }

        const person = papdata.people[id];
        if (person) {
          sexes_data[person.sex === 0 ? 'Male' : 'Female']++;
          const ageIdx = ageIndex.get(id);
          if (ageIdx !== undefined) ages_data[age_range_labels[ageIdx]]++;
        }
      }
    }

    // Susceptible = total population minus anyone who appears in the infection data
    states_data.Susceptible = Math.max(0, popCount - totalInfected);

    data.iot.push(iot_data);
    data.ages.push(ages_data);
    data.sexes.push(sexes_data);
    data.states.push(states_data);
  }

  return data;
}
