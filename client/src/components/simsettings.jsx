import { useCallback, useEffect } from 'react';
import CzDict from './czdict';
import useSimSettings from '../stores/simsettings';
import InterventionTimeline from './intervention-timeline';
import {
  SimParameter,
  SimBoolean,
  SimFile,
  SimRunSelector
} from './settings-components';
import { useNavigate } from 'react-router-dom';

export default function SimSettings({ sendData, error, loading, progress }) {
  const zone = useSimSettings((state) => state.zone);
  const hours = useSimSettings((state) => state.hours);
  const randseed = useSimSettings((state) => state.randseed);
  const sim_id = useSimSettings((state) => state.sim_id);
  const setSettings = useSimSettings((state) => state.setSettings);

  const navigate = useNavigate();

  const updateZone = useCallback(
    (zone) => setSettings({ zone }),
    [setSettings]
  );

  useEffect(() => {
    if (hours > zone?.length) {
      setSettings({ hours: zone.length });
    }
  }, [zone, hours, setSettings]);

  return (
    <div className="flex flex-col items-center gap-16">
      {/* Pass setSelectedZone to SimLocation, so we get the full object */}
      <CzDict zone={zone} setZone={updateZone} />

      <div className="flex flex-wrap justify-center gap-8">
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

      <div className="relative flex items-center w-96 max-w-[90vw]">
        <div className="grow border-t border-(--color-border-dark)"></div>
        <span className="mx-4">or</span>
        <div className="grow border-t border-(--color-border-dark)"></div>
      </div>

      <SimRunSelector
        czone_id={zone?.id}
        sim_id={sim_id}
        callback={(sim_id) => setSettings({ sim_id })}
      />

      <div className="flex flex-col items-center gap-8 w-full">
        <button
          className="simset_button w-32 disabled:bg-gray-400! disabled:pointer-events-none"
          disabled={loading}
          onClick={() => {
            if (!zone?.name) {
              alert('Please pick a valid convenience zone first!');
              return;
            }

            // If sim_id is set, navigate to the simulator page
            if (sim_id) {
              navigate(`/simulator/${sim_id}`);
              return;
            }

            // Now pass the zone's name & full object to the parent
            sendData();
          }}
        >
          {loading ? 'Processing...' : 'Simulate'}
        </button>
        {loading && progress > 0 && (
          <div className="w-64 rounded-full h-2.5 bg-(--color-bg-dark) mb-4">
            <div
              className="bg-(--color-primary-blue) h-2.5 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            ></div>
            <p className="text-xs text-center mt-1">
              Simulating... {progress}%
            </p>
          </div>
        )}
        {error && (
          <div className="text-red-500 text-sm max-w-md text-center">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
