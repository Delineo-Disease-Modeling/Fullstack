import { useEffect, useState } from 'react';
import MatrixSelector from './matrixselector';

import './simsettings.css';
import { DB_URL } from '../env';

// Dropdown
function SimLocation({ setZone }) {
  const [locations, setLocations] = useState([]);

  useEffect(() => {
    fetch(`${DB_URL}convenience-zones`)
      .then((res) => res.json())
      .then((json) => setLocations(json['data']))
      .catch(console.error);
  }, []);

  const handleChange = (e) => {
    // Locate the entire zone object
    const zoneObj = locations.find((l) => l.id == +e.target.value);
    if (zoneObj) {
      // Pass the full zone object up to parent
      setZone(zoneObj);
    }
  };

  return (
    <div className='simset_dropdown'>
      <div className='simset_dropdown_label'>Convenience Zone</div>
      <select className='simset_dropdown' onChange={handleChange}>
        {/* Optionally add a placeholder */}
        <option value="">-- Select a zone --</option>

        {locations.map((data) => (
          <option key={data.id} value={data.id}>
            {data.label}
          </option>
        ))}
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

// Checkbout
function SimBoolean({label, value, callback}) {
  return (
    <div className='simset_checkbox'>
      <div className='flex items-center justify-center gap-x-2 flex-nowrap'>
        <input type='checkbox'
          className='w-6 h-6'
          checked={value}
          onChange={(e) => callback(() => e.target.checked)}
        />
        <div>{label}</div>
      </div>
    </div>
  );
}

function SimFile({label, callback}) {
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
  const [ zone, setZone ] = useState(null);
  const [ days, setDays ] = useState(50);                   // How long to run the simulation
  const [ pmask, setPmask ] = useState(0.4);                // Percent masking
  const [ pvaccine, setPvaccine ] = useState(0.2);          // Percent vaccinated
  const [ capacity, setCapacity ] = useState(1.0);          // Capacity percentages
  const [ lockdown, setLockdown ] = useState(0.0);          // Lockdown probability
  const [ selfiso, setSelfiso ] = useState(0.5);            // Self-isolation probability
  const [ randseed, setRandseed ] = useState(true);     // Random or set seed for sim/dmp?

  const [ matrices, setMatrices ] = useState(null);                 // To-be-sent file matrices
  const [ customFiles, setCustomFiles ] = useState(null);           // Uploaded file matrices

  return (
    <div className='simset_settings'>
      <div className='simset_params'>
        {/* Pass setSelectedZone to SimLocation, so we get the full object */}
        <SimLocation setZone={setZone} />

        {/* <SimParameter
          label={'Length (Days)'}
          value={days}
          callback={setDays}
          min={14}
          max={180}
          percent={false}
        /> */}
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
        <SimBoolean 
          label={'Random Seed'}
          value={randseed}
          callback={setRandseed}
        />
        <MatrixSelector customFiles={customFiles} setMatrices={setMatrices}/>
        <SimFile 
          label={'Custom Matrix File(s)'}
          callback={setCustomFiles}
        />
      </div>
      
      <button className='simset_button' onClick={() => {
          if (!zone) {
            alert('Please pick a convenience zone first!');
            return;
          }

          // Now pass the zone's name & full object to the parent
          sendData({
            zone: zone,
            location: zone.name,
            days,
            pmask,
            pvaccine,
            capacity,
            lockdown,
            selfiso,
            randseed,
            matrices
          });

          showSim(true);
        }}
      >
        Simulate
      </button>
    </div>
  );
}