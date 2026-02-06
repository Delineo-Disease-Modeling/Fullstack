import CzDict from './czdict';
import useSimSettings from '../stores/simsettings';
import InterventionTimeline from './intervention-timeline';
import {
  SimParameter,
  SimBoolean,
  SimFile,
  SimRunSelector
} from './settings-components';

import '../styles/simsettings.css';

export default function SimSettings({ sendData }) {
  const zone = useSimSettings((state) => state.zone);
  const hours = useSimSettings((state) => state.hours);
  const randseed = useSimSettings((state) => state.randseed);
  const sim_id = useSimSettings((state) => state.sim_id);
  const setSettings = useSimSettings((state) => state.setSettings);

  return (
    <div className="simset_settings">
      <div className="simset_params">
        {/* Pass setSelectedZone to SimLocation, so we get the full object */}
        <CzDict
          zone={zone}
          setZone={(zone) => setSettings({ zone })}
        />

        <SimParameter
          label={'Length'}
          value={hours}
          callback={(hours) => setSettings({ hours })}
          min={24}
          max={zone?.length ?? 168}
          percent={false}
          units=" hours"
        />
        <SimBoolean
          label={'Random Seed'}
          value={randseed}
          callback={(randseed) => setSettings({ randseed })}
        />
        {/* <MatrixSelector customFiles={customFiles} setMatrices={setMatrices}/> */}
        <SimFile
          label={'Custom DMP Matrix Files'}
          // callback={setCustomFiles}
          callback={console.log}
        />
      </div>

      <InterventionTimeline />

      <div className="relative flex items-center my-8 w-96 max-w-[90vw]">
        <div className="flex-grow border-t border-[var(--color-border-dark)]"></div>
        <span className="mx-4">or</span>
        <div className="flex-grow border-t border-[var(--color-border-dark)]"></div>
      </div>

      <SimRunSelector
        czone_id={zone?.id}
        sim_id={sim_id}
        callback={(sim_id) => setSettings({ sim_id })}
      />

      <button
        className="simset_button w-32"
        onClick={() => {
          if (!zone?.ready) {
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
