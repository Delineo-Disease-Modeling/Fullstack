import { useState } from 'react';
import axios from 'axios';

import SimSettings from '../components/simsettings.js';
import ModelMap from '../components/modelmap.js';
import OutputGraphs from '../components/outputgraphs.js';

import './simulator.css';

var sim_data = null;

function sendSimulatorData({ location, days, pmask, pvaccine, capacity, lockdown, selfiso }) {
  const data = {
    location: location,
    matrices: null,
    days: days,
    mask: pmask,
    vaccine: pvaccine,
    capacity: capacity,
    selfiso: selfiso,
    lockdown: lockdown,
  };

  axios.post("http://127.0.0.1:5000/simulation/", data)
    .then((res) => {
      sim_data = res.data;
      console.log(res.data);
    })
    .catch((error) => {
      console.log(error.response);
    });
}

export default function Simulator() {
  const [ showSim, setShowSim ] = useState(false);          // Show simulator, or show settings?

  return (
    <div>
      <div className='sim_container'>
        {!showSim && 
          <div className='sim_settings'>
            <SimSettings sendData={sendSimulatorData} showSim={setShowSim}/>
          </div>
        }

        {showSim && 
          <div className='sim_output'>
            <ModelMap />
            <OutputGraphs />
          </div>
        }
      </div>
    </div>
  )
}
