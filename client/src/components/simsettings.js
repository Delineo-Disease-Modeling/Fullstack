import React, { useState } from 'react';

import './simsettings.css';

// Dropdown
function SimLocation({value, callback}) {
  return (
    <div className='simset_dropdown'>
    <div className='simset_dropdown_label'>Convenience Zone</div>
    <select className='simset_dropdown' name='location' onChange={(e) => callback(e.value)}>
      <option value='barnsdall'>Barnsdall, OK</option>
      <option value='hagerstown'>Hagerstown, MD</option>
    </select>
    </div>
  );
}

// Slider
function SimParameter({label, value, callback, min=0, max=100, def=50, percent=true}) {
  return (
    <div className='simset_slider'>
      <div className='simset_slider_label'>
        {label}: {percent ? Math.ceil(value * 100) : value}{percent ? '%' : ''}
      </div>

      <input type='range' className='simset_slider_input'
        min={min}
        max={max}
        defaultValue={def}
        onChange={(e) => callback(percent ? e.target.value / 100.0 : e.target.value)}
      />
    </div>
  );
}

function SimFile({label, value, callback}) {
  return (
    <div className='simset_fileup'>
      <div className='simset_fileup_label'>
        {label}
      </div>

      <input type='file' className='simset_fileup_input' 
        multiple={true}
        onChange={(e) => callback(e.target.files)}
      />
    </div>
  );
}

export default function SimSettings({ sendData, showSim }) {
  const [ location, setLocation ] = useState('Barnsdall');  // Area to simulate
  const [ days, setDays ] = useState(50);                   // How long to run the simulation
  const [ pmask, setPmask ] = useState(0.4);                // Percent masking
  const [ pvaccine, setPvaccine ] = useState(0.2);          // Percent vaccinated
  const [ capacity, setCapacity ] = useState(1.0);          // Capacity percentages
  const [ lockdown, setLockdown ] = useState(0.0);          // Lockdown probability
  const [ selfiso, setSelfiso ] = useState(0.5);            // Self-isolation probability
  const [ matrices, setMatrices ] = useState(null);           // Uploaded file matrices

  return (
    <div className='simset_settings'>
      <div className='simset_params'>
        <SimLocation 
          value={location}
          callback={setLocation}
        />

        <SimParameter
          label={'Length (Days)'}
          value={days}
          callback={setDays}
          min={14}
          max={180}
          percent={false}
        />
        <SimParameter
          label={'Percent Masking'}
          value={pmask}
          callback={setPmask}
          def={40}
        />
        <SimParameter
          label={'Percent Vaccinated'}
          value={pvaccine}
          callback={setPvaccine}
          def={20}
        />
        <SimParameter
          label={'Maximum Facility Capacity'}
          value={capacity}
          callback={setCapacity}
          def={100}
        />
        <SimParameter
          label={'Lockdown Probability'}
          value={lockdown}
          callback={setLockdown}
          def={0}
        />
        <SimParameter
          label={'Self-Isolation Percent'}
          value={selfiso}
          callback={setSelfiso}
          def={50}
        />
        <SimFile 
          label={'Custom Matrix File(s)'}
          value={matrices}
          callback={setMatrices}
        />
      </div>
      
      <button onClick={() => { 
        sendData({ location, matrices, days, pmask, pvaccine, capacity, lockdown, selfiso }); 
        showSim(true); 
      }}>Simulate</button>
    </div>
  );
}