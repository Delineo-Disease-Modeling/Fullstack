import CzDict from './czdict';
import useSimSettings from '../stores/simsettings';
import InterventionTimeline from './intervention-timeline';
import { SimParameter, SimBoolean, SimFile } from './settings-components';

import './simsettings.css';

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
          label={'Length'}
          value={settings.hours}
          callback={(hours) => setSettings({ hours })}
          min={24}
          max={settings.zone?.length ?? 168}
          percent={false}
          units=' hours'
        />
        <SimBoolean 
          label={'Random Seed'}
          value={settings.randseed}
          callback={(randseed) => setSettings({ randseed })}
        />
        <SimBoolean 
          label={'Use Cached Data'}
          description={'uses pre-computed simulation data'}
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

      <InterventionTimeline />
      
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