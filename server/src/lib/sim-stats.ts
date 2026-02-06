import { createReadStream } from 'fs';
import { writeFile } from 'fs/promises';
import { DB_FOLDER } from '../env.js';
import chain from 'stream-chain';
import parser from 'stream-json';
import StreamObject from 'stream-json/streamers/StreamObject.js';

const age_ranges = [
  [0, 20],
  [21, 40],
  [41, 60],
  [61, 80],
  [81, 99]
];

const infection_states = {
  Susceptible: 0,
  Infected: 1,
  Infectious: 2,
  Symptomatic: 4,
  Hospitalized: 8,
  Recovered: 16,
  Removed: 32
};

type DataPoint = {
  time: number;
  [key: string]: number;
};

type ChartData = {
  [type: string]: DataPoint[];
};

export async function generateGlobalStats(
  simdataPath: string,
  patternsPath: string,
  papDataPath: string,
  outputPath: string
) {
  // Read PapData first
  const papDataRaw = await import('fs/promises').then((fs) =>
    fs.readFile(papDataPath, 'utf8')
  );
  const papdata = JSON.parse(papDataRaw);

  const data: ChartData = {
    iot: [],
    ages: [],
    sexes: [],
    states: []
  };

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

  while (!spl.done && !ppl.done) {
    const skey = spl.value.key;
    const pkey = ppl.value.key;

    if (skey !== pkey) {
      // Should technically sync up streams if one is ahead, but for now assuming aligned keys
      if (+skey < +pkey) {
        spl = await simdatapl.next();
        continue;
      } else if (+pkey < +skey) {
        ppl = await patternspl.next();
        continue;
      }
    }

    const svalue = spl.value.value;
    const pvalue = ppl.value.value;

    // Global IOT
    const iot_data: DataPoint = {
      time: +skey / 60
    };

    const ages_data: DataPoint = {
      time: +skey / 60
    };
    const sexes_data: DataPoint = {
      time: +skey / 60
    };
    const states_data: DataPoint = {
      time: +skey / 60
    };

    // Initialize counts
    sexes_data['Male'] = 0;
    sexes_data['Female'] = 0;
    for (const range of age_ranges) {
      ages_data[range.join('-')] = 0;
    }
    for (const state of Object.keys(infection_states)) {
      states_data[state] = 0;
    }

    // Process Infections (svalue is disease -> { personId: stateBitmask })

    // Total Infected per disease
    for (const [disease, people] of Object.entries(svalue) as [string, any][]) {
      iot_data[disease] = Object.keys(people).length;

      // Aggregate states
      for (const [state, value] of Object.entries(infection_states)) {
        states_data[state] += Object.values(people).filter(
          (s: any) => s & (value as number)
        ).length;
      }

      // Aggregate Demographics of INFECTED people
      Object.keys(people).forEach((id) => {
        const person_data = papdata['people'][id];
        if (!person_data) return;

        sexes_data[person_data['sex'] == 0 ? 'Male' : 'Female'] += 1;

        for (const range of age_ranges) {
          if (
            person_data['age'] >= range[0] &&
            person_data['age'] <= range[1]
          ) {
            ages_data[range.join('-')] += 1;
          }
        }
      });
    }

    data['iot'].push(iot_data);
    data['ages'].push(ages_data);
    data['sexes'].push(sexes_data);
    data['states'].push(states_data);

    spl = await simdatapl.next();
    ppl = await patternspl.next();
  }

  await writeFile(outputPath, JSON.stringify(data));
  return data;
}
