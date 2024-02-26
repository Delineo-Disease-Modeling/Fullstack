import {useState, useEffect} from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';

import SimSettings from '../components/simsettings.js';
import ModelMap from '../components/modelmap.js';
import './simulator.css';

export default function Simulator() {
  const [ showSim, setShowSim ] = useState(false);          // Show simulator, or show settings?
  const [data, setData] = useState(null)

  useEffect(() => {
    async function fetchJSON() {
      let r = await fetch('data/infectivity.json')
      r = await r.json()
      setData(r)
    }

    fetchJSON()
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
    <div className='simulator'>
      <div className='container'>
        {!showSim && 
          <div className='settings'>
            <SimSettings />
            <button onClick={() => setShowSim(true)}>Simulate</button>
          </div>
        }

        {showSim && 
          <div className='output'>
            <ModelMap />
            <LineChart
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
              <XAxis type="number" dataKey="name" tickCount={20}/>
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="delta" stroke="#8884d8" dot={false}/>
              <Line type="monotone" dataKey="omicron" stroke="#82ca9d" dot={false} />
            </LineChart>
          </div>
        }
      </div>
    </div>
  )
}
