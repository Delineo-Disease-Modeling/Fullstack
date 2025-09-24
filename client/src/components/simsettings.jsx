import CzDict from './czdict';
import useSimSettings from '../stores/simsettings';
// import InterventionTimeline from './intervention-timeline';

import './simsettings.css';

// Slider
function SimParameter({label, value, callback, min=0, max=100, percent=true}) {
  return (
    <div className='simset_slider'>
      <div className='simset_slider_label'>
        {label}: {percent ? Math.ceil(value * 100) : value}{percent ? '%' : ''}
      </div>

      <input type='range' className='simset_slider_input w-[300px]'
        min={min}
        max={max}
        defaultValue={percent ? value * 100.0 : value}
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
          onChange={(e) => callback(e.target.checked)}
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
        <p className='text-gray-400 italic'>for advanced users</p>
      </div>

      <input type='file' className='max-w-72' 
        multiple={true}
        onChange={(e) => callback(e.target.files)}
      />
    </div>
  );
}

export default function SimSettings({ sendData }) {
  const settings = useSimSettings((state) => state.settings);
  const setSettings = useSimSettings((state) => state.setSettings);

  return (
    <div className='simset_settings'>
      <div className='simset_params'>
        {/* Pass setSelectedZone to SimLocation, so we get the full object */}
        <CzDict
          zone={settings.zone}
          setZone={(zone) => setSettings({ zone })}
        />

        <SimParameter
          label={'Length (Hours)'}
          value={settings.hours}
          callback={(hours) => setSettings({ hours })}
          min={1}
          max={168}
          percent={false}
        />
        <SimParameter
          label={'Percent Masking'}
          value={settings.mask}
          callback={(mask) => setSettings({ mask })}
        />
        <SimParameter
          label={'Percent Vaccinated'}
          value={settings.vaccine}
          callback={(vaccine) => setSettings({ vaccine })}
        />
        <SimParameter
          label={'Maximum Facility Capacity'}
          value={settings.capacity}
          callback={(capacity) => setSettings({ capacity })}
        />
        <SimParameter
          label={'Lockdown Probability'}
          value={settings.lockdown}
          callback={(lockdown) => setSettings({ lockdown })}
        />
        <SimParameter
          label={'Self-Isolation Percent'}
          value={settings.selfiso}
          callback={(selfiso) => setSettings({ selfiso })}
        />
        <SimBoolean 
          label={'Random Seed'}
          value={settings.randseed}
          callback={(randseed) => setSettings({ randseed })}
        />
        <SimBoolean 
          label={'Use Cached Data (faster)'}
          value={settings.usecache}
          callback={(usecache) => setSettings({ usecache })}
        />
        {/* <MatrixSelector customFiles={customFiles} setMatrices={setMatrices}/> */}
        <SimFile 
          label={'Custom DMP Matrix Files'}
          // callback={setCustomFiles}
          callback={console.log}
        />
      </div>

      {/* <InterventionTimeline hours={hours} /> */}
      
      <button
        className='simset_button w-32'
        onClick={() => {
          if (!settings.zone?.ready) {
            alert('Please pick a valid convenience zone first!');
            return;
          }

          // Now pass the zone's name & full object to the parent
          sendData();
        }}
      >
        Simulate
      </button>
    </div>
  );
}