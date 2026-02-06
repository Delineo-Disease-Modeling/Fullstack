import { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import useSimSettings from '../stores/simsettings';
import useSimData from '../stores/simdata';

import SimSettings from '../components/simsettings.jsx';
import InstructionBanner from '../components/instruction-banner.jsx';

import '../styles/simulator.css';

export default function Simulator() {
  const navigate = useNavigate();
  const zone = useSimSettings((state) => state.zone);

  const setSettings = useSimSettings((state) => state.setSettings);
  const setSimData = useSimData((state) => state.setSimData);
  const setPapData = useSimData((state) => state.setPapData);
  const setRunName = useSimData((state) => state.setName);

  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Deselect any previous run when entering this page
    setSettings({ sim_id: null });
  }, [setSettings]);

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

    try {
      const { status, data } = await axios.post(
        `${import.meta.env.VITE_SIM_URL}simulation/`,
        reqbody
      );

      if (status !== 200) {
        throw new Error('Status code mismatch');
      }

      setSettings({ sim_id: data['data']['id'] });

      setSettings({ sim_id: data['data']['id'] });
      console.log('Set sim_id to:', data['data']['id']);

      // We rely on the navigation to /simulator/:id to fetch the data
      return true;
    } catch (e) {
      console.error(e);
      setError('Failed to start simulation. Please try again.');
      return false;
    }
  };

  const sendSimulatorData = async () => {
    // Reset Data
    setSimData(null);
    setPapData(null);
    setRunName('');
    setError(null);
    setLoading(true);

    try {
      const papRes = await fetch(
        `${import.meta.env.VITE_DB_URL}papdata/${zone.id}`
      );
      if (!papRes.ok) throw new Error('Failed to fetch population data');
      const papJson = await papRes.json();
      setPapData(papJson['data']);

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
        />
      </div>
    </div>
  );
}
