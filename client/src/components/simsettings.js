import React, { useState } from 'react';

import './simsettings.css';

// Dropdown
function SimLocation({value, callback}) {
  return (
    <div>
    <label for='location'>Convenience Zone:</label>
    <select name='location' onChange={(e) => callback(e.value)}>
      <option value='barnsdall'>Barnsdall, OK</option>
      <option value='hagerstown'>Hagerstown, MD</option>
    </select>
    </div>
  );
}

// Slider
function SimParameter({label, value, callback}) {
  return (
    <input>

    </input>
  );
}

export default function SimSettings() {
  const [ location, setLocation ] = useState('Barnsdall');  // Area to simulate
  const [ pmask, setPmask ] = useState(0.0);                // Percent masking
  const [ pvaccine, setPvaccine ] = useState(0.0);          // Percent vaccinated
  const [ capacity, setCapacity ] = useState(1.0);          // Capacity percentages
  const [ lockdown, setLockdown ] = useState(0.0);          // Lockdown probability
  const [ selfiso, setSelfiso ] = useState(0.0);            // Self-isolation probability

  return (
    <div className='settings'>
      <SimLocation 
        value={location}
        callback={setLocation}
      />

      <SimParameter
        label={'Percent Masking'}
        value={pmask}
        callback={setPmask}
      />
      <SimParameter
        label={'Percent Vaccinated'}
        value={pvaccine}
        callback={setPvaccine}
      />
      <SimParameter
        label={'Maximum Facility Capacity'}
        value={capacity}
        callback={setCapacity}
      />
      <SimParameter
        label={'Lockdown Probability'}
        value={lockdown}
        callback={setLockdown}
      />
      <SimParameter
        label={'Self-Isolation Percent'}
        value={selfiso}
        callback={setSelfiso}
      />
    </div>
  );
}