import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import useSimSettings from '../stores/simsettings';
import useMapData from '../stores/mapdata';
import SimSettings from '../components/simsettings.jsx';
import InstructionBanner from '../components/instruction-banner.jsx';

import '../styles/simulator.css';

export default function Simulator() {
  const navigate = useNavigate();

  const setSettings = useSimSettings((state) => state.setSettings);
  const setSimData = useMapData((state) => state.setSimData);
  const setRunName = useMapData((state) => state.setName);

  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Deselect any previous run when entering this page
    setSettings({ sim_id: null });
  }, [setSettings]);

  const [progress, setProgress] = useState(0);

  const makePostRequest = async () => {
    const settings = useSimSettings.getState();
    const reqbody = {
      ...settings,
      czone_id: settings.zone.id,
      length: settings.hours * 60
    };

    console.log(reqbody);

    // If we have a selected run, load it directly
    if (settings.sim_id !== null) {
      try {
        const res = await fetch(
          `${import.meta.env.VITE_DB_URL}simdata/${settings.sim_id}`
        );

        if (!res.ok) {
          throw new Error(`Invalid simdata response ${res.status}`);
        }

        const json = await res.json();

        setSimData(json['data']['simdata']);
        setRunName(json['data']['name']);
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
      const response = await fetch(
        `${import.meta.env.VITE_SIM_URL}simulation/`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(reqbody)
        }
      );

      if (!response.ok) {
        throw new Error(`Simulation failed with status ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop(); // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const msg = JSON.parse(line.slice(6));

              if (msg.type === 'progress') {
                setProgress(msg.value);
              } else if (msg.type === 'result') {
                setSettings({ sim_id: msg.data.id });
                console.log('Set sim_id to:', msg.data.id);
                return true; // Success
              } else if (msg.type === 'error') {
                throw new Error(msg.message);
              }
            } catch (e) {
              console.error('Error parsing SSE message:', e);
            }
          }
        }
      }

      // If stream ends without result, investigate (shouldn't happen with our server logic)
      return false;
    } catch (e) {
      console.error(e);
      setError(`Failed to start simulation: ${e.message}`);
      return false;
    }
  };

  const sendSimulatorData = async () => {
    // Reset Data
    setError(null);
    setLoading(true);

    try {
      const simSuccess = await makePostRequest();

      if (simSuccess) {
        // Navigate to the run page
        const currentSimId = useSimSettings.getState().sim_id;
        if (currentSimId) {
          navigate(`/simulator/${currentSimId}`);
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
