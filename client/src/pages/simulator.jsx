import { useState } from 'react';
import axios from 'axios';
import useSimSettings from '../stores/simsettings';
import useSimData from '../stores/simdata';

import SimSettings from '../components/simsettings.jsx';
import ModelMap from '../components/modelmap.jsx';
import OutputGraphs from '../components/outputgraphs.jsx';
import InstructionBanner from '../components/instruction-banner.jsx';

import '../styles/simulator.css';

export default function Simulator() {
  const sim_id = useSimSettings((state) => state.sim_id);
  const zone = useSimSettings((state) => state.zone);
  const simdata = useSimData((state) => state.simdata);
  const papdata = useSimData((state) => state.papdata);
  const runName = useSimData((state) => state.name);

  const setSettings = useSimSettings((state) => state.setSettings);
  const setSimData = useSimData((state) => state.setSimData);
  const setPapData = useSimData((state) => state.setPapData);
  const setRunName = useSimData((state) => state.setName);

  const [showSim, setShowSim] = useState(false);
  const [selectedZone, setSelectedZone] = useState(null);
  const [selectedLoc, setSelectedLoc] = useState(null);

  const handleRename = async () => {
    if (!sim_id || !runName || runName.length < 2) return;

    try {
      const res = await fetch(`${import.meta.env.VITE_DB_URL}simdata/${sim_id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ name: runName })
      });

      if (!res.ok) {
        throw new Error('Failed to rename');
      }

      const json = await res.json();
      if (json.data && json.data.name) {
        setRunName(json.data.name);
      }
    } catch (error) {
      console.error('Rename failed:', error);
    }
  };

  const makePostRequest = async () => {
    const settings = useSimSettings.getState();
    const reqbody = {
      ...settings,
      czone_id: settings.zone.id,
      length: settings.hours * 60
    };

    console.log(reqbody);

    if (settings.sim_id !== null) {
      try {
        const res = await fetch(`${import.meta.env.VITE_DB_URL}simdata/${settings.sim_id}`);

        if (!res.ok) {
          throw new Error(`Invalid simdata response ${res.status}`);
        }

        const json = await res.json();

        setSimData(json['data']['simdata']);
        setRunName(json['data']['name']);
        return;
      } catch (error) {
        console.error(error);
      }
    }

    axios
      .post(`${import.meta.env.VITE_SIM_URL}simulation/`, reqbody)
      .then(({ status, data }) => {
        if (status !== 200) {
          throw new Error('Status code mismatch');
        }

        setSettings({ sim_id: data['data']['id'] });

        axios
          .get(`${import.meta.env.VITE_DB_URL}simdata/${data['data']['id']}`)
          .then(({ status, data }) => {
            if (status !== 200) {
              throw new Error('Status code mismatch');
            }

            setSimData(data['data']['simdata']);
            setRunName(data['data']['name']);
          })
          .catch(console.error);
      })
      .catch(console.error);
  };

  const sendSimulatorData = () => {
    // Reset Data
    setSimData(null);
    setPapData(null);
    setRunName('');

    // Switch "pages"
    setShowSim(true);
    setSelectedZone(zone);

    fetch(`${import.meta.env.VITE_DB_URL}papdata/${zone.id}`)
      .then((res) => {
        if (!res.ok) {
          throw new Error();
        }
        return res.json();
      })
      .then((json) => {
        setPapData(json['data']);
      })
      .catch(console.error);

    const settings = useSimSettings.getState();
    makePostRequest({
      ...settings,
      czone_id: zone.id,
      length: settings.hours * 60
    });
  };

  const handleMarkerClick = ({ id, label, type }) => {
    setSelectedLoc({ id, label, type });
  };

  const onReset = () => {
    setSelectedLoc(null);
  };

  return (
    <div className="sim_container">
      {!showSim ? (
        <div className="sim_settings px-4">
          <InstructionBanner text="Welcome! Generate a Convenience Zone or pick one that's already generated, then click 'Simulate' to begin." />
          <SimSettings sendData={sendSimulatorData} />
        </div>
      ) : !simdata || !papdata ? (
        <div>Loading simulation data...</div>
      ) : (
        <div className="sim_output px-4">
          <InstructionBanner text="Tip: Click on a marker in the map below to view its population and infection stats in the charts on the bottom." />
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-4 text-center">
              <h2 className="text-xl font-semibold">
                Convenience Zone: {selectedZone.name}
              </h2>
              <p className="text-sm text-gray-600">
                Created on:{' '}
                {new Date(selectedZone.created_at).toLocaleDateString()}
              </p>
            </div>
            <div className="flex items-center justify-between gap-2">
              <div className="flex gap-2 items-center">
                <label htmlFor="run-name" className="text-sm text-gray-700">
                  Run Name:
                </label>
                <input
                  id="run-name"
                  type="text"
                  value={runName || ''}
                  onChange={(e) => setRunName(e.target.value)}
                  onBlur={handleRename}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleRename();
                      e.currentTarget.blur();
                    }
                  }}
                  className="rounded px-2 py-1 text-sm bg-[var(--color-bg-ivory)] outline-solid outline-2 outline-[var(--color-primary-blue)]"
                  placeholder="Untitled Run"
                />
              </div>
              <button
                onClick={async () => {
                  if (
                    window.confirm(
                      'Are you sure you want to delete this run? This action cannot be undone.'
                    )
                  ) {
                    try {
                      const res = await fetch(
                        `${import.meta.env.VITE_DB_URL}simdata/${settings.sim_id}`,
                        {
                          method: 'DELETE'
                        }
                      );

                      if (!res.ok) {
                        throw new Error('Failed to delete');
                      }

                      // Reset Data
                      setSimData(null);
                      setPapData(null);
                      setRunName('');
                      setSettings({ sim_id: null });

                      // Switch "pages"
                      setShowSim(false);
                      setSelectedZone(null);
                    } catch (error) {
                      console.error('Delete failed:', error);
                      alert('Failed to delete run');
                    }
                  }
                }}
                className="bg-red-500 hover:bg-red-600 text-white text-xs py-2 px-2 rounded"
              >
                Delete Run
              </button>
            </div>
            <ModelMap
              selectedZone={selectedZone}
              onMarkerClick={handleMarkerClick}
            />
          </div>

          <InstructionBanner text="Use the time slider or play button to navigate through the simulation timeline." />

          <OutputGraphs selected_loc={selectedLoc} onReset={onReset} />
        </div>
      )}
    </div>
  );
}
