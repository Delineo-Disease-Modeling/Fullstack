import { useEffect, useState } from 'react';
import {
  LineChart,
  Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer
} from 'recharts';
import { CustomTooltip } from './customtooltip';
import './outputgraphs.css';

const age_ranges = [
  [0, 20],
  [21, 40],
  [41, 60],
  [61, 80],
  [81, 99]
];

const styles = {
  centerText: {
    textAlign: 'center',
    fontWeight: 'bold',
    paddingBottom: '15px'
  }
};

const infection_states = {
  'Susceptible': 0,
  'Infected': 1,
  'Infectious': 2,
  'Symptomatic': 4,
  'Hospitalized': 8,
  'Recovered': 16,
  'Removed': 32
};

const COLORS = ["#8884d8", "#82ca9d", "#d54df7", "#ffdc4f", "#ff954f", "#4fd0ff"];

export default function OutputGraphs({ sim_data, move_patterns, pap_data, poi_id, is_household, onReset }) {
  const [diseases, setDiseases] = useState([]);
  const [chart_data, setChartData] = useState(null);
  const [selected_chart, setSelectedChart] = useState('iot');

  const handleChartSelect = (e) => {
    setSelectedChart(e.target.value);
  };

  useEffect(() => {
    if (!sim_data || !move_patterns || !pap_data) {
      return;
    }

    // Get disease labels
    if (poi_id) {
      setDiseases(['total', ...Object.keys(Object.values(sim_data)[0] || {})]);
    } else {
      setDiseases(Object.keys(Object.values(sim_data)[0] || {}));
    }

    const domain = [
      Math.min(...Object.keys(move_patterns).map(x => Number(x))),
      Math.max(...Object.keys(move_patterns).map(x => Number(x)))
    ];

    const c_data = [];
    for (const [time, infdata] of Object.entries(sim_data)) {
      const timeNumber = Number(time);
      if (timeNumber < domain[0] || timeNumber > domain[1]) {
        continue;
      }

      let disease_infectivity = {};
      let state_data = {};
      let age_data = {};
      let sex_data = { 'male': 0, 'female': 0 };

      for (const state of Object.keys(infection_states)) {
        state_data[state] = 0;
      }

      for (const range of age_ranges) {
        age_data[`${range[0]}-${range[1]}`] = 0;
      }

      if (poi_id) {
        const personType = is_household ? 'homes' : 'places';
        const people_list = move_patterns[time]?.[personType]?.[poi_id];
        disease_infectivity['total'] = people_list?.length ?? 0;
      }

      for (const [disease, infected] of Object.entries(infdata)) {
        let disease_count = 0;

        for (const [person_id, inf_state] of Object.entries(infected)) {
          if (poi_id) {
            const personType = is_household ? 'homes' : 'places';
            const person_move = move_patterns[time]?.[personType]?.[poi_id];
            if (!person_move || !person_move.includes(person_id)) {
              continue;
            }
          }

          disease_count++;
          const sex = pap_data['people'][person_id.toString()]?.['sex'];
          const age = pap_data['people'][person_id.toString()]?.['age'];

          if (sex !== undefined) {
            sex_data[sex === 0 ? 'male' : 'female']++;
          }

          for (const [state, value] of Object.entries(infection_states)) {
            if (inf_state & value) {
              state_data[state]++;
            }
          }

          for (const range of age_ranges) {
            if (age >= range[0] && age <= range[1]) {
              age_data[`${range[0]}-${range[1]}`]++;
            }
          }
        }

        disease_infectivity[disease] = disease_count;
      }

      if (Object.values(disease_infectivity).some(count => count >= 0) || !poi_id) {
        c_data.push({
          'time': timeNumber / 60,
          ...disease_infectivity,
          ...age_data,
          ...sex_data,
          ...state_data
        });
      }
    }

    setChartData(c_data);
  }, [sim_data, move_patterns, pap_data, poi_id, is_household]);

  const poi_name = poi_id ? (is_household ? `Household #${poi_id}` : `${pap_data['places'][poi_id]?.['label']}`) : '';

  const noInfectionsAtFacility = () => {
    return (
      chart_data &&
      poi_id &&
      chart_data.every(dataPoint =>
        diseases
          .filter(disease => disease !== 'total')  // Ignore total
          .every(disease => (dataPoint[disease] ?? 0) === 0)
      )
    );
  };

  return (
    <div className='outputgraphs_container'>
      <div className='p-2.5'>
        <label>Select Chart Type: </label>
        <select
          className='px-1'
          value={selected_chart}
          onChange={handleChartSelect}
        >
          <option value="iot">Infectiousness Over Time</option>
          <option value="ages">Age Of Infected</option>
          <option value="sexes">Infection Gender</option>
          <option value="states">Diseases Info</option>
        </select>
      </div>

      {poi_id && (
        <div style={{ textAlign: 'center', marginBottom: '10px' }}>
          <button onClick={onReset}>
            Reset Selection
          </button>
        </div>
      )}

      {/* Chart Areas */}
      {selected_chart === "iot" && (
        <div className='relative outputgraph_chart'>
          {noInfectionsAtFacility() && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center p-4 text-center bg-white bg-opacity-75">
              <p className="text-lg font-semibold">No infections occurred at this location during the simulation.</p>
              <p className="mt-2 text-sm">Try selecting another location or generating a new simulation.</p>
            </div>
          )}
          <h6 style={styles.centerText}>
            Infection Distribution Over Time
            {poi_id && <span> for {poi_name}</span>}
          </h6>
          <ResponsiveContainer width='100%' height='100%'>
            <LineChart data={chart_data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis label={{ value: 'Time (h)', position: 'bottom' }} type="number" dataKey="time" tickCount={20} />
              <YAxis label={{ value: 'Total Infected', angle: -90, position: 'insideLeft' }} />
              <Tooltip content={CustomTooltip} />
              <Legend wrapperStyle={{ paddingTop: '30px', paddingBottom: '20px' }} />
              {diseases.map((disease, index) => (
                <Line type="monotone" key={disease} dataKey={disease} stroke={COLORS[index % COLORS.length]} dot={false} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {selected_chart === "ages" && (
        <div className='outputgraph_chart'>
          <h6 style={styles.centerText}>
            Infected Age Distribution Over Time
            {poi_id && <span> for {poi_name}</span>}
          </h6>
          <ResponsiveContainer width='100%' height='100%'>
            <LineChart data={chart_data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis label={{ value: 'Time (h)', position: 'bottom' }} type="number" dataKey="time" tickCount={20} />
              <YAxis label={{ value: 'Total Number', angle: -90, position: 'insideLeft' }} />
              <Tooltip content={CustomTooltip} />
              <Legend wrapperStyle={{ paddingTop: '30px', paddingBottom: '20px' }} />
              {age_ranges.map((range, index) => (
                <Line type="monotone" key={range.join('-')} dataKey={`${range[0]}-${range[1]}`} stroke={COLORS[index % COLORS.length]} dot={false} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {selected_chart === "sexes" && (
        <div className='outputgraph_chart'>
          <h6 style={styles.centerText}>
            Infected Sex Distribution Over Time
            {poi_id && <span> for {poi_name}</span>}
          </h6>
          <ResponsiveContainer width='100%' height='100%'>
            <LineChart data={chart_data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis label={{ value: 'Time (h)', position: 'bottom' }} type="number" dataKey="time" tickCount={20} />
              <YAxis label={{ value: 'Total Number', angle: -90, position: 'insideLeft' }} />
              <Tooltip content={CustomTooltip} />
              <Legend wrapperStyle={{ paddingTop: '30px', paddingBottom: '20px' }} />
              {['male', 'female'].map((sex, index) => (
                <Line type="monotone" key={sex} dataKey={sex} stroke={COLORS[index % COLORS.length]} dot={false} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {selected_chart === "states" && (
        <div className='outputgraph_chart'>
          <h6 style={styles.centerText}>
            Infected State Distribution Over Time
            {poi_id && <span> for {poi_name}</span>}
          </h6>
          <ResponsiveContainer width='100%' height='100%'>
            <LineChart data={chart_data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis label={{ value: 'Time (h)', position: 'bottom' }} type="number" dataKey="time" tickCount={20} />
              <YAxis label={{ value: 'Total Number', angle: -90, position: 'insideLeft' }} />
              <Tooltip content={CustomTooltip} />
              <Legend wrapperStyle={{ paddingTop: '30px', paddingBottom: '20px' }} />
              {Object.keys(infection_states).map((state, index) => (
                <Line type="monotone" key={state} dataKey={state} stroke={COLORS[index % COLORS.length]} dot={false} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}