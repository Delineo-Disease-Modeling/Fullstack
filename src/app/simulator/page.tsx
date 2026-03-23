'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import InstructionBanner from '@/components/instruction-banner';
import SimSettings from '@/components/simsettings';
import {
  getInclusiveEndDateIso,
  getStateFromCBG,
  getZoneLocationName,
  toSimulationDateParam
} from '@/lib/simulation-zone';
import useMapData from '@/stores/mapdata';
import useSimSettings from '@/stores/simsettings';
import '@/styles/simulator.css';

function extractMessage(payload: unknown) {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const message = record.message;
  if (typeof message === 'string' && message.trim()) {
    return message;
  }

  const error = record.error;
  if (typeof error === 'string' && error.trim()) {
    return error;
  }

  return null;
}

async function readResponseMessage(response: Response) {
  try {
    const payload = await response.json();
    return (
      extractMessage(payload) || `Simulation failed with status ${response.status}`
    );
  } catch {
    return response.statusText || `Simulation failed with status ${response.status}`;
  }
}

export default function Simulator() {
  const router = useRouter();

  const setSettings = useSimSettings((state) => state.setSettings);
  const setSimData = useMapData((state) => state.setSimData);
  const setRunName = useMapData((state) => state.setName);

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState<string | null>(null);

  useEffect(() => {
    setSettings({ sim_id: null });
  }, [setSettings]);

  const makePostRequest = async (): Promise<boolean> => {
    const settings = useSimSettings.getState();

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

    const zone = settings.zone;
    if (!zone) {
      setError('Please pick a convenience zone first.');
      return false;
    }

    const startDate = toSimulationDateParam(zone.start_date);
    const endDate = toSimulationDateParam(
      getInclusiveEndDateIso(zone.start_date, settings.hours)
    );
    const state = getStateFromCBG(zone.cbg_list);

    if (!startDate || !endDate || !state) {
      setError('Selected convenience zone is missing required simulation data.');
      return false;
    }

    const reqbody = {
      ...settings,
      czone_id: zone.id,
      length: settings.hours * 60,
      start_date: startDate,
      end_date: endDate,
      state,
      location: getZoneLocationName(zone),
      initial_infected_count: settings.initial_infected_count,
      interventions: settings.interventions,
      randseed: settings.randseed
    };

    setProgress(0);
    setProgressMessage('Starting simulation...');
    try {
      const simUrl = process.env.NEXT_PUBLIC_SIM_URL;
      if (!simUrl) {
        throw new Error('NEXT_PUBLIC_SIM_URL is not configured.');
      }

      const response = await fetch(`${simUrl}simulation/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(reqbody)
      });

      if (!response.ok) {
        throw new Error(await readResponseMessage(response));
      }

      const contentType = response.headers.get('content-type') || '';

      if (contentType.includes('text/event-stream')) {
        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error('No response body');
        }

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) {
              continue;
            }

            const msg = JSON.parse(line.slice(6));

            if (msg.type === 'progress') {
              const value = Number(msg.value);
              setProgress(Number.isFinite(value) ? value : 0);
              if (msg.message) {
                setProgressMessage(msg.message);
              }
            } else if (msg.type === 'result') {
              const simId = Number(msg.data?.id);
              if (!Number.isFinite(simId) || simId <= 0) {
                throw new Error('Simulation finished but no saved run ID was returned.');
              }

              setProgress(100);
              setProgressMessage('Simulation complete.');
              setSettings({ sim_id: simId });
              return true;
            } else if (msg.type === 'error') {
              throw new Error(msg.message);
            }
          }
        }

        return false;
      }

      const json = await response.json().catch(() => null);
      const responseData =
        json && typeof json === 'object' && 'data' in json
          ? (json.data as { id?: unknown })
          : undefined;

      const simId = Number(responseData?.id);
      if (!Number.isFinite(simId) || simId <= 0) {
        throw new Error('Simulation finished but no saved run ID was returned.');
      }

      setProgress(100);
      setProgressMessage('Simulation complete.');
      setSettings({ sim_id: simId });
      return true;
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
          progressMessage={progressMessage}
        />
      </div>
    </div>
  );
}
