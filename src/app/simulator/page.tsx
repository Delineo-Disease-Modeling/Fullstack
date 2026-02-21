'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import InstructionBanner from '@/components/instruction-banner';
import SimSettings from '@/components/simsettings';
import useMapData from '@/stores/mapdata';
import useSimSettings from '@/stores/simsettings';
import '@/styles/simulator.css';

export default function Simulator() {
  const router = useRouter();

  const setSettings = useSimSettings((state) => state.setSettings);
  const setSimData = useMapData((state) => state.setSimData);
  const setRunName = useMapData((state) => state.setName);

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    // Deselect any previous run when entering this page
    setSettings({ sim_id: null });
  }, [setSettings]);

  const makePostRequest = async (): Promise<boolean> => {
    const settings = useSimSettings.getState();
    const reqbody = {
      ...settings,
      czone_id: settings.zone?.id,
      length: settings.hours * 60
    };

    console.log(reqbody);

    // If we have a selected run, load it directly
    if (settings.sim_id !== null) {
      try {
        const res = await fetch(`/api/simdata/${settings.sim_id}`);

        if (!res.ok) {
          throw new Error(`Invalid simdata response ${res.status}`);
        }

        const json = await res.json();

        setSimData(json.data.simdata);
        setRunName(json.data.name);
        return true;
      } catch (error) {
        console.error(error);
        setError('Failed to load simulation data. Please try again.');
        return false;
      }
    }

    // Start a new simulation with SSE
    setProgress(0);
    try {
      const simUrl = process.env.NEXT_PUBLIC_SIM_URL;
      const response = await fetch(`${simUrl}simulation/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(reqbody)
      });

      if (!response.ok) {
        throw new Error(`Simulation failed with status ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const msg = JSON.parse(line.slice(6));

              if (msg.type === 'progress') {
                setProgress(msg.value);
              } else if (msg.type === 'result') {
                setSettings({ sim_id: msg.data.id });
                console.log('Set sim_id to:', msg.data.id);
                return true;
              } else if (msg.type === 'error') {
                throw new Error(msg.message);
              }
            } catch (e) {
              console.error('Error parsing SSE message:', e);
            }
          }
        }
      }

      return false;
    } catch (e) {
      console.error(e);
      setError(`Failed to start simulation: ${(e as Error).message}`);
      return false;
    }
  };

  const sendSimulatorData = async () => {
    setError(null);
    setLoading(true);

    try {
      const simSuccess = await makePostRequest();

      if (simSuccess) {
        const currentSimId = useSimSettings.getState().sim_id;
        if (currentSimId) {
          router.push(`/simulator/${currentSimId}`);
        }
      }
    } catch (e) {
      console.error(e);
      setError('Failed to fetch data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="sim_container">
      <div className="sim_settings px-4">
        <InstructionBanner text="Welcome! Generate a Convenience Zone or pick one that's already generated, then click 'Simulate' to begin." />
        <SimSettings
          sendData={sendSimulatorData}
          error={error}
          loading={loading}
          progress={progress}
        />
      </div>
    </div>
  );
}
