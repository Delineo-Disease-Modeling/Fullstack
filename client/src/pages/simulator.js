import React, { useState } from 'react';

import SimSettings from '../components/simsettings.js';
import ModelMap from '../components/modelmap.js';
import './simulator.css';

export default function Simulator() {
  const [ showSim, setShowSim ] = useState(false);          // Show simulator, or show settings?

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
            {/* Put graphs here */}
          </div>
        }
      </div>
    </div>
  )
}