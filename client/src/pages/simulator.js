import {useState} from 'react';

import SimSettings from '../components/simsettings.js';
import ModelMap from '../components/modelmap.js';
import OutputGraphs from '../components/outputgraphs.js';

import './simulator.css';

export default function Simulator() {
  const [ showSim, setShowSim ] = useState(false);          // Show simulator, or show settings?

  return (
    <div>
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
            <OutputGraphs />
          </div>
        }
      </div>
    </div>
  )
}
