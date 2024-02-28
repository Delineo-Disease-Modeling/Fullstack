import React, { useEffect, useState, PureComponent } from 'react';

import { AreaChart,Area, PieChart, Pie, Cell, BarChart, Bar, LineChart,
  Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';

import './outputgraphs.css';

class CustomizedAxisTick extends PureComponent {
  render() {
    const { x, y, stroke, payload } = this.props;

    return (
      <g transform={`translate(${x},${y})`}>
        <text x={0} y={0} dy={16} textAnchor="end" fill="#666" transform="rotate(-35)">
          {payload.value}
        </text>
      </g>
    );
  }
}

function generateRandomColor() {
  return '#' + Math.floor(Math.random() * 16777215).toString(16);
}

export default function OutputGraphs() {
  const [data, setData] = useState(null)
  const [ageData, setData1] = useState(null)
  const [selectedChart, setSelectedChart] = useState('line');
  const styles = {
    centerText: {
      textAlign: 'center',
      textAlign: 'center',
      fontWeight: 'bold',
    },
  };
    const COLORS = Array.from({ length: 80 }, () => generateRandomColor());

  const handleChange = (e) => {
    setSelectedChart(e.target.value);
  };
const areaData = []
  useEffect(() => {
    async function fetchJSON() {
      let r = await fetch('data/infectivity.json')
      let a = await fetch('data/papdata.json')
      r = await r.json()
      a = await a.json()
      console.log(a)
      areaData.length = 0
      for (let index = 0; index <= 3477; index++) {
        const element = a.people[index.toString()];
        areaData.push(element);
      }
      setData(r)
     
    const ageCounts = areaData.reduce((acc, curr) => {
      const age = curr.age;
      if (acc[age]) {
        acc[age] += 1;
      } else {
        acc[age] = 1;
      }
      return acc;
    }, {});
    
    const ageCountsArray = Object.keys(ageCounts).map((age) => {
      return { age: parseInt(age)+" years old", count: ageCounts[age] };
    });

    setData1(ageCountsArray);/*
    for (let index = 0; index < ageCountsArray.length; index++) {
      ageData.push(ageCountsArray[index]);
    }
    */
    }

    fetchJSON()
    console.log(areaData);
  }, []);

  const rdata = []
  for (let key in data){
    let infectAmt = {}
    infectAmt["name"] = key
    for(let value in data[key])
      infectAmt[value] = data[key][value].length
    //for (let value in key.value)
    
    rdata.push(infectAmt)
  }

  return (
    <div>
          <div>
                <label>Select Chart Type:</label>
                <select value={selectedChart} onChange={handleChange}>
                  <option value="line">Line Chart</option>
                  <option value="area">Area Chart</option>
                  <option value="bar">Bar Chart</option>
                  <option value="pie">Pie Chart</option>
                </select>
                {selectedChart && <p>You selected: {selectedChart}</p>}
              </div>
            {selectedChart === "line"&&
            (<div>
               <h6 style={styles.centerText}>infectiousness Over Time</h6>
            <LineChart width={1500}height={600}data={rdata}  margin={{
                top: 5,
                right: 30,
                left: 20,
                bottom: 5,
              }}>
             
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" dataKey="name" tickCount={20 } tick={<CustomizedAxisTick />}/>
              <YAxis label={{ value: 'Total Infectiousness', angle: -90, position: 'insideLeft' }} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="delta" stroke="#8884d8" fill="#8884d8" dot={false}/>
              <Line type="monotone" dataKey="omicron" stroke="#82ca9d"  fill="#82ca9d" dot={false} />
            </LineChart>
            <h6 style={styles.centerText}>Time(minutes)</h6>
            </div>
            )}
            {selectedChart === "bar" &&
            <div>
              <h6 style={styles.centerText}>infectiousness Over Time</h6>
              <BarChart
                width={1500}
                height={600}
                data={rdata}
                margin={{
                  top: 5,
                  right: 30,
                  left: 20,
                  bottom: 5,
                }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" label={{ value: 'Time(minutes)', position: 'insideBottom', offset: -10 }}/>
                <YAxis label={{ value: 'Total Infectiousness', angle: -90, position: 'insideLeft' }}/>
                <Tooltip />
                <Legend />
                <Bar dataKey="delta" stackId="a" fill="#8884d8" />
          <Bar dataKey="omicron" stackId="a" fill="#82ca9d" />
              </BarChart>
            </div>}
            {selectedChart === "pie" &&
            <div>
            <h6 style={styles.centerText}>age of infected person</h6>
         
              <PieChart width={1500} height={600}>
                <Pie data={ageData} dataKey="count" nameKey="age" cx="50%" cy="50%" outerRadius={300}>
                  {
                    ageData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))
                  }
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
              </div>
            }
              {selectedChart === "area" &&
          <div>
            <h6 style={styles.centerText}>infectiousness Over Time</h6>
            <AreaChart
              width={1500}
              height={600}
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
          </div>
  );
}