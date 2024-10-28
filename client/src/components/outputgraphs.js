import React, { useEffect, useState } from 'react';
import { LineChart,
  Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
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
}

const COLORS = [ "#8884d8", "#82ca9d", "#d54df7", "#ffdc4f", "#ff954f", "#4fd0ff" ];

export default function OutputGraphs({ sim_data, move_patterns, pap_data }) {
  const [ diseases, setDiseases ] = useState([]);
  const [ chart_data, setChartData ] = useState(null); // Infectivity over time data, age data, etc
  const [ selected_chart, setSelectedChart ] = useState('iot');
  
  const handleChartSelect = (e) => {
    setSelectedChart(e.target.value);
  };

  useEffect(() => {
    // Get disease labels
    setDiseases(Object.keys(Object.values(sim_data)[0]));

    const domain = [Math.min(...Object.keys(move_patterns).map(x => Number(x))), Math.max(...Object.keys(move_patterns).map(x => Number(x)))]

    // Set Infectivity over time chart
    const c_data = [];
    for (const [ time, infdata ] of Object.entries(sim_data)) {
      if (Number(time) < domain[0] || Number(time) > domain[1]) {
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

      for (const [ disease, infected ] of Object.entries(infdata)) {
        disease_infectivity[disease] = Object.keys(infected).length;

        for (const [ person_id, inf_state ] of Object.entries(infected)) {
          const sex = pap_data['people'][person_id.toString()]['sex'];
          const age = pap_data['people'][person_id.toString()]['age'];

          sex_data[(sex == 0 ? 'male' : 'female')]++;

          for (const [ state, value ] of Object.entries(infection_states)) {
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
      }

      c_data.push({
        'time': time / 60,
        ...disease_infectivity,
        ...age_data,
        ...sex_data,
        ...state_data
      });
    }

    setChartData(c_data);
  }, [ sim_data, move_patterns, pap_data ]);

  return (
    <div>
      <div style={{padding: '10px'}}>
        <label>Select Chart Type: </label>
        <select value={selected_chart} onChange={handleChartSelect}>
          <option value="iot">Infectiousness Over Time</option>
          <option value="ages">Age Of Infected </option>
          <option value="sexes">Infection Gender</option>
          <option value="states">Diseases Info</option>
        </select>
      </div>

      {selected_chart === "iot" && (
        <div className='outputgraph_chart'>
          <h6 style={styles.centerText}>Infection Distribution Over Time</h6>
          <LineChart width={window.innerWidth*0.6} height={window.innerHeight*0.6} data={chart_data} margin={{
            top: 5,
            right: 30,
            left: 20,
            bottom: 5,
          }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis label={{ value: 'Time (h)', position: 'bottom' }} type="number" dataKey="time" tickCount={20} />
            <YAxis label={{ value: 'Total Infected', angle: -90, position: 'insideLeft' }} />
            <Tooltip content={CustomTooltip}/>
            <Legend wrapperStyle={{ paddingTop: "30px" }} />
            {
              diseases.map((disease, index) => (
                <Line type="monotone" dataKey={disease} stroke={COLORS[index % COLORS.length]} dot={false} />
              ))
            }
          </LineChart>
        </div>
      )}

      {selected_chart === "ages" && (
        <div className='outputgraph_chart'>
          <h6 style={styles.centerText}>Infected Age Distribution Over Time</h6>
          <LineChart width={window.innerWidth*0.6} height={window.innerHeight*0.6} data={chart_data} margin={{
            top: 5,
            right: 30,
            left: 20,
            bottom: 5,
          }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis label={{ value: 'Time (h)', position: 'bottom' }} type="number" dataKey="time" tickCount={20} />
            <YAxis label={{ value: 'Total Number', angle: -90, position: 'insideLeft' }} />
            <Tooltip content={CustomTooltip}/>
            <Legend wrapperStyle={{ paddingTop: "30px" }} />
            {
              age_ranges.map((range, index) => (
                <Line type="monotone" dataKey={`${range[0]}-${range[1]}`} stroke={COLORS[index % COLORS.length]} dot={false} />
              ))
            }
          </LineChart>
        </div>
      )}

      {selected_chart === "sexes" && (
        <div className='outputgraph_chart'>
          <h6 style={styles.centerText}>Infected Sex Distribution Over Time</h6>
          <LineChart width={window.innerWidth*0.6} height={window.innerHeight*0.6} data={chart_data} margin={{
            top: 5,
            right: 30,
            left: 20,
            bottom: 5,
          }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis label={{ value: 'Time (h)', position: 'bottom' }} type="number" dataKey="time" tickCount={20} />
            <YAxis label={{ value: 'Total Number', angle: -90, position: 'insideLeft' }} />
            <Tooltip content={CustomTooltip}/>
            <Legend wrapperStyle={{ paddingTop: "30px" }} />
            {
              ['male', 'female'].map((sex, index) => (
                <Line type="monotone" dataKey={sex} stroke={COLORS[index % COLORS.length]} dot={false} />
              ))
            }
          </LineChart>
        </div>
      )}

      {selected_chart === "states" && (
        <div className='outputgraph_chart'>
          <h6 style={styles.centerText}>Infected State Distribution Over Time</h6>
          <LineChart width={window.innerWidth*0.6} height={window.innerHeight*0.6} data={chart_data} margin={{
            top: 5,
            right: 30,
            left: 20,
            bottom: 5,
          }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis label={{ value: 'Time (h)', position: 'bottom' }} type="number" dataKey="time" tickCount={20} />
            <YAxis label={{ value: 'Total Number', angle: -90, position: 'insideLeft' }} />
            <Tooltip content={CustomTooltip}/>
            <Legend wrapperStyle={{ paddingTop: "30px" }} />
            {
              Object.keys(infection_states).map((state, index) => (
                <Line type="monotone" dataKey={state} stroke={COLORS[index % COLORS.length]} dot={false} />
              ))
            }
          </LineChart>
        </div>
      )}
    </div>
  );
}