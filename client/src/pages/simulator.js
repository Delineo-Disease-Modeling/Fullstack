import { useState } from 'react';
import axios from 'axios';

import SimSettings from '../components/simsettings.js';
import ModelMap from '../components/modelmap.js';
import OutputGraphs from '../components/outputgraphs.js';

import './simulator.css';

function sendSimulatorData(setSimData, { location, days, pmask, pvaccine, capacity, lockdown, selfiso }) {
  // Uncomment if you want to work with the simulator
  // const data = {
  //   location: location,
  //   matrices: null,
  //   days: days,
  //   mask: pmask,
  //   vaccine: pvaccine,
  //   capacity: capacity,
  //   selfiso: selfiso,
  //   lockdown: lockdown,
  // };

  // axios.post("http://127.0.0.1:5000/simulation/", data)
  //   .then((res) => {
  //     setSimData(res.data);
  //     console.log(res.data);
  //   })
  //   .catch((error) => {
  //     console.log(error.response);
  //   });

  fetch('data/infectivity.json').then((res) => {
    res.json().then((data) => {
      setSimData(data);
      console.log(data);
    })
  })
}

export default function Simulator() {
  const [ showSim, setShowSim ] = useState(false);          // Show simulator, or show settings?
  const [ simData, setSimData ] = useState(null);           // Simulator output data

  return (
    <div>
      <div className='sim_container'>
        {!showSim && 
          <div className='sim_settings'>
            <SimSettings sendData={(dict) => { sendSimulatorData(setSimData, dict); }} showSim={setShowSim}/>
          </div>
        }

        {showSim && !simData &&
          <div>Loading...</div>
        }

        {showSim && simData &&
          <div className='sim_output'>
            <ModelMap sim_data={simData} />
            <OutputGraphs sim_data={simData} />
          </div>
        }
      </div>
    </div>
  )
}
