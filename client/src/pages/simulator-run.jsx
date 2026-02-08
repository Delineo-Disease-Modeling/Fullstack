import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import useSimSettings from '../stores/simsettings';
import useMapData from '../stores/mapdata';

import ModelMap from '../components/modelmap.jsx';
import OutputGraphs from '../components/outputgraphs.jsx';
import InstructionBanner from '../components/instruction-banner.jsx';

import '../styles/simulator.css';

export default function SimulatorRun() {
  const { run_id } = useParams();
  const navigate = useNavigate();
  const sim_id = useSimSettings((state) => state.sim_id);
  const zone = useSimSettings((state) => state.zone);
  const simdata = useMapData((state) => state.simdata);
  const papdata = useMapData((state) => state.papdata);
  const runName = useMapData((state) => state.name);

  const setSettings = useSimSettings((state) => state.setSettings);
  const setSimData = useMapData((state) => state.setSimData);
  const setPapData = useMapData((state) => state.setPapData);
  const setHotspots = useMapData((state) => state.setHotspots);
  const setRunName = useMapData((state) => state.setName);

  const [selectedZone, setSelectedZone] = useState(null);
  const [selectedLoc, setSelectedLoc] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  if (!run_id) {
    navigate('/simulator');
    return;
  }

  const handleRename = async () => {
    if (!sim_id || !runName || runName.length < 2) {
      return;
    }

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

  const [progress, setProgress] = useState(0);

  const loadRunFromUrl = async (id, signal) => {
    setLoading(true);
    setProgress(0);
    setSimData(null);
    setPapData(null);
    setError(null);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_DB_URL}simdata/${id}`,
        { signal }
      );
      if (!response.ok) throw new Error('Run not found');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      let totalSteps = 0;
      let fullJsonString = '';
      let maxTimestamp = 0;
      let tail = ''; // Buffer for handling split matches across chunks

      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        fullJsonString += chunk;

        // Use tail + chunk for scanning to handle split boundaries
        const textToScan = tail + chunk;
        tail = chunk.slice(-50); // Keep last 50 chars for next iteration

        // Extract Length if not found yet
        if (totalSteps === 0) {
          // Check for "length": 123 in the stream
          const lengthMatch = textToScan.match(/"length":\s*(\d+)/);
          if (lengthMatch) {
            totalSteps = parseInt(lengthMatch[1], 10);
          }
        }

        // Extract Progress
        if (totalSteps > 0) {
          // Regex to find "TIMESTAMP":{"h" or "TIMESTAMP":{"p"
          const matches = [
            ...textToScan.matchAll(/"(\d+)":\{"(?:h|p)"/g)
          ];

          for (const match of matches) {
            const ts = parseInt(match[1], 10);
            if (!isNaN(ts)) {
              maxTimestamp = Math.max(maxTimestamp, ts);
            }
          }

          if (maxTimestamp > 0) {
            const currentProgress = Math.min(
              100,
              Math.round((maxTimestamp / totalSteps) * 100)
            );
            setProgress((old) => Math.max(old, currentProgress));
          }
        }
      }

      // Force 100% on completion
      setProgress(100);

      // Parse the full JSON
      const simJson = JSON.parse(fullJsonString);
      const {
        simdata,
        name,
        zone: zoneData,
        hotspots,
        papdata
      } = simJson.data;

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
      setHotspots(hotspots);
      setPapData(papdata);
    } catch (e) {
      if (e.name === 'AbortError') {
        console.log('Fetch aborted');
        return;
      }
      console.error(e);
      setError('Failed to load run from URL.');
    } finally {
      if (!signal.aborted) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    loadRunFromUrl(run_id, controller.signal);

    return () => {
      controller.abort();
    };
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
        <div className="flex flex-col items-center gap-4 my-auto">
          <div className="text-lg">Loading simulation data...</div>
          {progress > 0 && (
            <div className="w-72 rounded-full h-2 bg-(--color-bg-dark)">
              <div
                className="bg-(--color-primary-blue) h-2 rounded-full transition-all duration-100"
                style={{ width: `${progress}%` }}
              />
              <p className="text-sm text-center mt-2">{progress}%</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="sim_container">
        <div className="flex flex-col items-center justify-center gap-4 mt-20">
          <div className="text-red-500 text-lg">{error}</div>
          <button
            onClick={() => navigate('/simulator')}
            className="bg-(--color-bg-dark) text-(--color-text-light) w-32 h-12 p-3 rounded-3xl transition-[200ms] ease-in-out hover:scale-105 cursor-pointer active:brightness-75"
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
                className="rounded px-2 py-1 text-sm bg-(--color-bg-ivory) outline-solid outline-2 outline-(--color-primary-blue)"
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
          className="simset_button w-32"
        >
          Return
        </button>
      </div>
    </div>
  );
}
