import React, { useEffect, useState, PureComponent } from 'react';
import InfectedMap from './infectedmap.js';
import { AreaChart,Area, PieChart, Pie, Cell, BarChart, Bar, LineChart,
  Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';

import './outputgraphs.css';

export default function OutputGraphs({ sim_data, location }) {
  const [data, setData] = useState(null)
  const [ageData, setData1] = useState(null)
  const [genderData, setGenderData] = useState(null)
  const [selectedChart, setSelectedChart] = useState('line');
  const [placesData, setPlacesData] = useState(null);
  const [InfectInfoData, setInfectInfoData] = useState(null);
  const styles = {
    centerText: {
      textAlign: 'center',
      fontWeight: 'bold',
    },
  };
  const COLORS = ["#8884d8"
  ,"#82ca9d","#FFCC00","#66FF33"];//Array.from({ length: 80 }, () => generateRandomColor());
COLORS.push()
  const handleChange = (e) => {
    setSelectedChart(e.target.value);
  };
const areaData = []
  useEffect(() => {
    async function fetchJSON() {
      let r = await fetch(`data/${location}/infectivity.json`)
      let a = await fetch(`data/${location}/papdata.json`)
      r = await r.json()
      a = await a.json()
      let diseases  = ["delta","omicron"];

    //diseases.push("alpha", "beta");
      const InfectionState ={"day":1,
      "susceptible": diseases[0],
      "INFECTED": 1,
      "INFECTIOUS": 2,
      "SYMPTOMATIC": 4,
      "HOSPITALIZED": 8,
      "RECOVERED": 16,
      "REMOVED": 32
      };

      // A function that generates random values ​​close to a given value
      function generateCloseRandomValue(value) {
          const minValue = Math.max(0, value - 5);
          const maxValue = Math.min(32, value + 5);
          let returnValue = Math.floor(Math.random() * (maxValue - minValue + 1)) + minValue;
          return returnValue<=0?1:returnValue;
      }

      // Randomly generate 7 arrays of JSON format data
      const dataInjectInfo = [];
      dataInjectInfo.push(InfectionState)
      for (let i = 2; i < 3; i++) {
          const jsonData = {"day":i,
          "susceptible":diseases[i-1],// generateCloseRandomValue(InfectionState.susceptible),
          "INFECTED": generateCloseRandomValue(InfectionState.INFECTED),
          "INFECTIOUS": generateCloseRandomValue(InfectionState.INFECTIOUS),
          "SYMPTOMATIC": generateCloseRandomValue(InfectionState.SYMPTOMATIC),
          "HOSPITALIZED": generateCloseRandomValue(InfectionState.HOSPITALIZED),
          "RECOVERED": generateCloseRandomValue(InfectionState.RECOVERED),
          "REMOVED": generateCloseRandomValue(InfectionState.REMOVED)
        };
          dataInjectInfo.push(jsonData);
      }
      setInfectInfoData(dataInjectInfo);


      setPlacesData(a.places);
      const min_idx = Math.min(...Object.keys(a.people).map(x => parseInt(x)));
      const max_idx = Math.max(...Object.keys(a.people).map(x => parseInt(x)));
      for (let index = min_idx; index <= max_idx; index++) {
        const element = a.people[index.toString()];
        areaData.push(element);
      }
      setData(r)
    
    
const ageRanges = {
  "0-20": 0,
  "21-40": 0,
  "41-60": 0,
  "61-80": 0
};

const ageCounts = Object.values(areaData).reduce((acc, curr) => {
  const age = curr.age;
  if (age >= 0 && age <= 20) {
    acc["0-20"] += 1;
  } else if (age > 20 && age <= 40) {
    acc["21-40"] += 1;
  } else if (age > 40 && age <= 60) {
    acc["41-60"] += 1;
  } else if (age > 60 && age <= 80) {
    acc["61-80"] += 1;
  }
  return acc;
}, ageRanges);


let maleCount = 0;
let femaleCount = 0;

for (const key in areaData) {
    if (areaData[key].sex === 1) {
        maleCount++;
    } else {
        femaleCount++;
    }
}

setGenderData([{"gender":"male","count":maleCount},{"gender":"female","count":femaleCount}])
  
const ageCountsArray = Object.keys(ageCounts).map((ageRange) => {
  const ageRangeArray = ageRange.split("-");
  const minAge = ageRangeArray[0];
  const maxAge = ageRangeArray[1];
  return { age: `${minAge}-${maxAge} years old`, count: ageCounts[ageRange] };
});

    setData1(ageCountsArray);/*
    for (let index = 0; index < ageCountsArray.length; index++) {
      ageData.push(ageCountsArray[index]);
    }
    */
    }

    fetchJSON()
  }, []);

  const rdata = []
  for (let key in data){
    let infectAmt = {}
    infectAmt["name"] = key
    for(let value in data[key])
    {
      const total = Object.values( data[key][value]).reduce((acc, curr) => acc + curr, 0);
      infectAmt[value] =total;
    }  //for (let value in key.value)

    rdata.push(infectAmt)

  }
  return (
    <div>
          <div>
                <label>Select Chart Type:</label>
                <select value={selectedChart} onChange={handleChange}>
                  <option value="line">Infectiousness Over Time</option>
                  <option value="bar">Diseases Info</option>
                  <option value="pie1">Age Of Infected </option>
                  <option value="pie2">Infection Gender</option>
                  <option value="map">Distribution Of Infected Population</option>
                </select>
                {selectedChart && <p>You selected: {selectedChart}</p>}
              </div>
            {selectedChart === "line"&&
            (<div >
               <h6 style={styles.centerText}>infectiousness Over Time</h6>
            <LineChart width={window.innerWidth*0.6}height={window.innerHeight*0.6}data={rdata}  margin={{
                top: 5,
                right: 30,
                left: 20,
                bottom: 5,
              }}>
             
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" dataKey="name" tickCount={20 } />
              <YAxis label={{ value: 'Total Infectiousness', angle: -90, position: 'insideLeft' }} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="delta" stroke="#8884d8" fill="#8884d8" dot={false} />
              <Line type="monotone" dataKey="omicron" stroke="#82ca9d"  fill="#82ca9d" dot={false} />
            </LineChart>
            <h6 style={styles.centerText}>Time(minutes)</h6>
            </div>
            )}
            {selectedChart === "bar" &&
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
            {selectedChart === "pie1" &&
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
            }{selectedChart === "pie2" &&
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
              {selectedChart === "area" &&
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

        {selectedChart === "map" &&
          <div>
          <h6 style={styles.centerText}>Distribution Of Infected Population</h6>
          <InfectedMap  infectedLatitude={ 36.561075}  infectedLongitude={-96.16224} mapZoom = {233} infectedInfo = {placesData}/>
          </div>
        }
          </div>
  );
}