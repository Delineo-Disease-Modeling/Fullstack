import React, { useEffect, useState } from 'react';
import InfectedMap from './infectedmap.js';
import { AreaChart,Area, PieChart, Pie, Cell, BarChart, Bar, LineChart,
  Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';

import './outputgraphs.css';

const age_ranges = [
  [0, 20],
  [21, 40],
  [41, 60],
  [61, 80],
  [81, 99]
]

const styles = {
  centerText: {
    textAlign: 'center',
    fontWeight: 'bold',
  },
};

const COLORS = [ "#8884d8", "#82ca9d", "#FFCC00", "#66FF33" ];

export default function OutputGraphs({ sim_data, move_patterns, pap_data, location }) {
  const [ diseases, setDiseases ] = useState([]);
  const [ chart_data, setChartData ] = useState(null); // Infectivity over time data, age data, etc
  const [ selected_chart, setSelectedChart ] = useState('iot');
  
  const handleChartSelect = (e) => {
    setSelectedChart(e.target.value);
  };

  useEffect(() => {
    // Get disease labels
    setDiseases(Object.keys(Object.values(sim_data)[0]));

    // Set Infectivity over time chart
    const c_data = [];
    for (const [ time, infdata ] of Object.entries(sim_data)) {
      let disease_infectivity = {};
      let age_data = {};
      let sex_data = { 'male': 0, 'female': 0 };

      for (const range of age_ranges) {
        age_data[`${range[0]}-${range[1]}`] = 0;
      }

      for (const [ disease, infected ] of Object.entries(infdata)) {
        disease_infectivity[disease] = Object.keys(infected).length;

        for (const person_id of Object.keys(infected)) {
          const sex = pap_data['people'][person_id.toString()]['sex'];
          const age = pap_data['people'][person_id.toString()]['age'];

          sex_data[(sex == 0 ? 'male' : 'female')]++;
          
          for (const range of age_ranges) {
            if (age >= range[0] && age <= range[1]) {
              age_data[`${range[0]}-${range[1]}`]++;
            }
          }
        }
      }


      c_data.push({
        'time': time,
        ...disease_infectivity,
        ...age_data,
        ...sex_data
      });
    }

    setChartData(c_data);
  }, []);

  return (
    <div>
      <div>
        <label>Select Chart Type:</label>
        <select value={selected_chart} onChange={handleChartSelect}>
          <option value="iot">Infectiousness Over Time</option>
          <option value="ages">Age Of Infected </option>
          <option value="sexes">Infection Gender</option>
          <option value="bar">Diseases Info (WIP)</option>
        </select>
      </div>

      {selected_chart === "iot" && (
        <div>
          <h6 style={styles.centerText}>Infectivity Over Time</h6>
          <LineChart width={window.innerWidth*0.6} height={window.innerHeight*0.6} data={chart_data} margin={{
            top: 5,
            right: 30,
            left: 20,
            bottom: 5,
          }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis type="number" dataKey="time" tickCount={20} />
            <YAxis label={{ value: 'Total Infected', angle: -90, position: 'insideLeft' }} />
            <Tooltip />
            <Legend />
            {
              diseases.map(disease => (
                <Line type="monotone" dataKey={disease} dot={false} />
              ))
            }
          </LineChart>
          <h6 style={styles.centerText}>Time(minutes)</h6>
        </div>
      )}

      {selected_chart === "ages" && (
        <div>
          <h6 style={styles.centerText}>Infected Age Distribution Over Time</h6>
          <LineChart width={window.innerWidth*0.6} height={window.innerHeight*0.6} data={chart_data} margin={{
            top: 5,
            right: 30,
            left: 20,
            bottom: 5,
          }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis type="number" dataKey="time" tickCount={20} />
            <YAxis label={{ value: 'Total Ages', angle: -90, position: 'insideLeft' }} />
            <Tooltip />
            <Legend />
            {
              age_ranges.map(range => (
                <Line type="monotone" dataKey={`${range[0]}-${range[1]}`} dot={false} />
              ))
            }
          </LineChart>
          <h6 style={styles.centerText}>Time(minutes)</h6>
        </div>
      )}

      {selected_chart === "sexes" && (
        <div>
          <h6 style={styles.centerText}>Infected Sex Distrubtion Over Time</h6>
          <LineChart width={window.innerWidth*0.6} height={window.innerHeight*0.6} data={chart_data} margin={{
            top: 5,
            right: 30,
            left: 20,
            bottom: 5,
          }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis type="number" dataKey="time" tickCount={20} />
            <YAxis label={{ value: 'Total Ages', angle: -90, position: 'insideLeft' }} />
            <Tooltip />
            <Legend />
            {
              ['male', 'female'].map(sex => (
                <Line type="monotone" dataKey={sex} dot={false} />
              ))
            }
          </LineChart>
          <h6 style={styles.centerText}>Time(minutes)</h6>
        </div>
      )}

            {/* {selected_chart === "bar" &&
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh',width: '60vw'  }}>
              <h6 style={styles.centerText}>Diseases Info</h6>
              <BarChart
                width={window.innerWidth*0.6}height={window.innerHeight*0.6}
                data={InfectInfoData}
                margin={{
                  top: 5,
                  right: 30,
                  left: 20,
                  bottom: 5,
                }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="susceptible" label={{ value: 'Diseases', position: 'insideBottom', offsetX: 25 }}/>
                <YAxis />
                <Tooltip />
                <Legend />
              <Bar dataKey="INFECTED" stackId="a" fill="#FF6633" />
              <Bar dataKey="INFECTIOUS" stackId="a" fill="#82ca9d" />
              <Bar dataKey="SYMPTOMATIC " stackId="a" fill="#FFCC00" />
              <Bar dataKey="HOSPITALIZED" stackId="a" fill="#66FF33" />
              <Bar dataKey="RECOVERED " stackId="a" fill="#00CC99" />
              <Bar dataKey="REMOVED" stackId="a" fill="#8884d8" />
              </BarChart>
            </div>}

            {selected_chart === "pie1" &&
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh',width: '60vw' }}>
            <h6 style={styles.centerText}>age of infected person</h6>
            <PieChart width={400} height={400}>
                <Pie data={ageData} dataKey="count" nameKey="age" cx="50%" cy="50%" outerRadius={150}>
                  {
                    ageData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]}  label={{ position: 'bottom' }} />
                    ))
                  }
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
              </div>
            }
            
            {selected_chart === "pie2" &&
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh',width: '60vw' }}>
            <h6 style={styles.centerText}>Infection Gender</h6>
              <PieChart width={400} height={400}>
                <Pie data={genderData}  cx="50%" cy="50%" dataKey="count" nameKey="gender"  outerRadius={150}>
                  {
                    ageData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]}  label={{ position: 'bottom' }} />
                    ))
                  }
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
              </div>
            }

            {selected_chart === "area" &&
              <div >
                <h6 style={styles.centerText}>infectiousness Over Time</h6>
                  <AreaChart
                    width={window.innerWidth-200}
                    height={window.innerHeight/2}
                    data={rdata}
                    margin={{
                      top: 0,
                      right: 30,
                      left: 0,
                      bottom: 0,
                    }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" dataKey="name" tickCount={20 }  />
                    <YAxis label={{ value: 'Total Infectiousness', angle: -90, position: 'insideLeft' }} />
                    <Tooltip />
                    <Area type="monotone" dataKey="delta" stackId="1" stroke="#8884d8" fill="#8884d8" />
                    <Area type="monotone" dataKey="omicron" stackId="1" stroke="#82ca9d" fill="#82ca9d" />
                    
                  </AreaChart>
                <h6 style={styles.centerText}>Time(minutes)</h6>
              </div>
            }

        {selected_chart === "map" &&
          <div>
            <h6 style={styles.centerText}>Distribution Of Infected Population</h6>
            <InfectedMap  infectedLatitude={ 36.561075}  infectedLongitude={-96.16224} mapZoom = {233} />
          </div>
        } */}
    </div>
  );
}