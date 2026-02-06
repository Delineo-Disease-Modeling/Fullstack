import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import useSimSettings from '../stores/simsettings';
import useSimData from '../stores/simdata';

import ModelMap from '../components/modelmap.jsx';
import OutputGraphs from '../components/outputgraphs.jsx';
import InstructionBanner from '../components/instruction-banner.jsx';

import '../styles/simulator.css';

export default function SimulatorRun() {
  const { run_id } = useParams();
  const navigate = useNavigate();
  const sim_id = useSimSettings((state) => state.sim_id);
  const zone = useSimSettings((state) => state.zone);
  const simdata = useSimData((state) => state.simdata);
  const papdata = useSimData((state) => state.papdata);
  const runName = useSimData((state) => state.name);

  const setSettings = useSimSettings((state) => state.setSettings);
  const setSimData = useSimData((state) => state.setSimData);
  const setPapData = useSimData((state) => state.setPapData);
  const setRunName = useSimData((state) => state.setName);

  const [selectedZone, setSelectedZone] = useState(null);
  const [selectedLoc, setSelectedLoc] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const handleRename = async () => {
    if (!sim_id || !runName || runName.length < 2) return;

    try {
      const res = await fetch(
        `${import.meta.env.VITE_DB_URL}simdata/${sim_id}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ name: runName })
        }
      );

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

  const loadRunFromUrl = async (id) => {
    setLoading(true);
    setSimData(null);
    setPapData(null);
    setError(null);

    try {
      const simRes = await fetch(`${import.meta.env.VITE_DB_URL}simdata/${id}`);
      if (!simRes.ok) throw new Error('Run not found');

      const simJson = await simRes.json();
      const { simdata, name, zone: zoneData } = simJson.data;

      // Restore Settings
      setSettings({
        sim_id: +id,
        zone: zoneData,
        hours: zoneData.length
      });
      setSelectedZone(zoneData);

      // Restore Data
      setSimData(simdata);
      setRunName(name);

      // Fetch PapData for this zone
      const papRes = await fetch(
        `${import.meta.env.VITE_DB_URL}papdata/${zoneData.id}`
      );
      if (!papRes.ok) throw new Error('Population data not found');
      const papJson = await papRes.json();
      setPapData(papJson.data);
    } catch (e) {
      console.error(e);
      setError('Failed to load run from URL.');
      // If run fails to load, maybe we should redirect or show a big error?
      // For now, let's show the error state.
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (run_id) {
      loadRunFromUrl(run_id);
    } else {
      // If no run_id, invalid state for this page
      navigate('/simulator');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run_id]);

  const handleMarkerClick = ({ id, label, type }) => {
    setSelectedLoc({ id, label, type });
  };

  const onReset = () => {
    setSelectedLoc(null);
  };

  if (loading) {
    return (
      <div className="sim_container">
        <div>Loading simulation data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="sim_container">
        <div className="flex flex-col items-center justify-center gap-4 mt-20">
          <div className="text-red-500 font-bold text-xl">{error}</div>
          <button
            onClick={() => navigate('/simulator')}
            className="bg-[var(--color-bg-dark)] text-[var(--color-text-light)] w-32 h-12 p-3 rounded-3xl transition-[200ms] ease-in-out hover:scale-105 cursor-pointer active:brightness-75"
          >
            Return
          </button>
        </div>
      </div>
    );
  }

  if (!simdata || !papdata || !selectedZone) {
    // Should handle this better, but loading should cover it.
    return <div className="sim_container">Loading...</div>;
  }

  return (
    <div className="sim_container">
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
                      `${import.meta.env.VITE_DB_URL}simdata/${sim_id}`,
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

                    navigate('/simulator');
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
      <div className="flex justify-center w-full">
        <button
          onClick={() => navigate('/simulator')}
          className="bg-[var(--color-bg-dark)] text-[var(--color-text-light)] w-32 h-12 p-3 rounded-3xl transition-[200ms] ease-in-out hover:scale-105 cursor-pointer active:brightness-75 mb-8"
        >
          Return to Settings
        </button>
      </div>
    </div>
  );
}
