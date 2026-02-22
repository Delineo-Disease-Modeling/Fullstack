'use client';

import dynamic from 'next/dynamic';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import InstructionBanner from '@/components/instruction-banner';
import OutputGraphs from '@/components/outputgraphs';
import useMapData from '@/stores/mapdata';
import useSimSettings from '@/stores/simsettings';
import '@/styles/simulator.css';
import '@/styles/settings-components.css';

const ModelMap = dynamic(() => import('@/components/modelmap'), { ssr: false });

interface SelectedLoc {
  id: string;
  label: string;
  type: string;
}

export default function SimulatorRun() {
  const { run_id } = useParams<{ run_id: string }>();
  const router = useRouter();
  const sim_id = useSimSettings((state) => state.sim_id);
  const zone = useSimSettings((state) => state.zone);
  const runName = useMapData((state) => state.name);

  const setSettings = useSimSettings((state) => state.setSettings);
  const setSimData = useMapData((state) => state.setSimData);
  const setPapData = useMapData((state) => state.setPapData);
  const setHotspots = useMapData((state) => state.setHotspots);
  const setRunName = useMapData((state) => state.setName);

  const [selectedZone, setSelectedZone] = useState<typeof zone>(null);
  const [selectedLoc, setSelectedLoc] = useState<SelectedLoc | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(0);

  const handleRename = async () => {
    if (!sim_id || !runName || runName.length < 2) {
      return;
    }

    try {
      const res = await fetch(`/api/simdata/${sim_id}`, {
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
      if (json.data?.name) {
        setRunName(json.data.name);
      }
    } catch (error) {
      console.error('Rename failed:', error);
    }
  };

  useEffect(() => {
    if (!run_id) {
      router.replace('/simulator');
      return;
    }

    const controller = new AbortController();
    const { signal } = controller;

    const loadRun = async () => {
      setLoading(true);
      setProgress(0);
      setSimData(null);
      setPapData(null);
      setError(null);

      try {
        const response = await fetch(`/api/simdata/${run_id}`, { signal });
        if (!response.ok) throw new Error('Run not found');

        const reader = response.body?.getReader();
        if (!reader) throw new Error('No response body');
        const decoder = new TextDecoder();

        let totalSteps = 0;
        let fullJsonString = '';
        let maxTimestamp = 0;
        let tail = '';

        while (true) {
          const { done, value } = await reader.read();

          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          fullJsonString += chunk;

          const textToScan = tail + chunk;
          tail = chunk.slice(-50);

          if (totalSteps === 0) {
            const lengthMatch = textToScan.match(/"length":\s*(\d+)/);
            if (lengthMatch) {
              totalSteps = parseInt(lengthMatch[1], 10);
            }
          }

          if (totalSteps > 0) {
            const matches = [...textToScan.matchAll(/"(\d+)":\{"(?:h|p)"/g)];

            for (const match of matches) {
              const ts = parseInt(match[1], 10);
              if (!Number.isNaN(ts)) {
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

        setProgress(100);

        const simJson = JSON.parse(fullJsonString);
        const { simdata, name, zone: zoneData, hotspots, papdata } = simJson.data;

        setSettings({
          sim_id: +run_id,
          zone: zoneData,
          hours: zoneData.length
        });

        setSelectedZone(zoneData);
        setSimData(simdata);
        setRunName(name);
        setHotspots(hotspots);
        setPapData(papdata);
      } catch (e) {
        if ((e as Error).name === 'AbortError') {
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

    loadRun();

    return () => {
      controller.abort();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run_id]);

  const handleMarkerClick = ({
    id,
    label,
    type
  }: {
    id: string;
    label: string;
    type: string;
  }) => {
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
            onClick={() => router.push('/simulator')}
            className="bg-(--color-bg-dark) text-(--color-text-light) w-32 h-12 p-3 rounded-3xl transition-[200ms] ease-in-out hover:scale-105 cursor-pointer active:brightness-75"
          >
            Return
          </button>
        </div>
      </div>
    );
  }

  if (!selectedZone) {
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
                    const res = await fetch(`/api/simdata/${sim_id}`, {
                      method: 'DELETE'
                    });

                    if (!res.ok) {
                      throw new Error('Failed to delete');
                    }

                    setSimData(null);
                    setPapData(null);
                    setRunName('');
                    setSettings({ sim_id: null });

                    router.push('/simulator');
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
          onClick={() => router.push('/simulator')}
          className="simset_button w-32"
        >
          Return
        </button>
      </div>
    </div>
  );
}
