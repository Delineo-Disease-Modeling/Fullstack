import { useState } from 'react';
import { DB_URL, SIM_URL } from '../env';
import axios from 'axios';
import useSimSettings from '../stores/simsettings';
import useSimData from '../stores/simdata';

import SimSettings from '../components/simsettings.jsx';
import ModelMap from '../components/modelmap.jsx';
import OutputGraphs from '../components/outputgraphs.jsx';
import InstructionBanner from '../components/instruction-banner.jsx';

import './simulator.css';

export default function Simulator() {
  const settings = useSimSettings((state) => state.settings);
  const simdata = useSimData((state) => state.simdata);
  const papdata = useSimData((state) => state.papdata);

  const setSettings = useSimSettings((state) => state.setSettings);
  const setSimData = useSimData((state) => state.setSimData);
  const setPapData = useSimData((state) => state.setPapData);

  const [showSim, setShowSim] = useState(false);
  const [selectedZone, setSelectedZone] = useState(null);
  const [selectedLoc, setSelectedLoc] = useState(null);

  const makePostRequest = async () => {
    const reqbody = {
      ...settings,
      czone_id: settings.zone.id,
      length: settings.hours * 60
    };

    console.log(reqbody);

    if (settings.usecache) {
      try {
        const res = await fetch(`${DB_URL}simdata/cache/${settings.zone.id}`);

        if (!res.ok) {
          throw new Error(`Invalid cache response ${res.status}`);
        }

        const json = await res.json();

        setSettings({ sim_id: json['data']['sim_id'] });
        setSimData(json['data']['sim_data']);
      } catch (error) {
        console.error(error);
      }
    }

    axios.post(`${SIM_URL}simulation/`, reqbody)
      .then(({ status, data }) => {
        if (status !== 200) {
          throw new Error('Status code mismatch');
        }

        setSettings({ sim_id: data['data']['id'] });

        axios.get(`${DB_URL}simdata/${data['data']['id']}`)
          .then(({ status, data }) => {
            if (status !== 200) {
              throw new Error('Status code mismatch');
            }

            setSimData(data['data']);
          })
          .catch(console.error);
      })
      .catch(console.error);
  };

  const sendSimulatorData = () => {
    // Reset Data
    setSimData(null);
    setPapData(null);

    // Switch "pages"
    setShowSim(true);
    setSelectedZone(settings.zone);
    
    fetch(`${DB_URL}papdata/${settings.zone.id}`)
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

    makePostRequest({
      ...settings,
      czone_id: settings.zone.id,
      length: settings.hours * 60
    });
  };

  const handleMarkerClick = ({id, label, type}) => {
    setSelectedLoc({ id, label, type });
  };

  const onReset = () => {
    setSelectedLoc(null);
  };

  return (
    <div>
      <div className='sim_container'>
        {!showSim ? (
          <div className='sim_settings px-4'>
            <InstructionBanner text="Welcome! Generate a Convenience Zone or pick one that's already generated, then click 'Simulate' to begin." />
            <SimSettings sendData={sendSimulatorData} />
          </div>
        ) : !simdata || !papdata ? (
          <div>Loading simulation data...</div>
        ) : (
          <div className='sim_output px-4'>
            <InstructionBanner text="Tip: Click on a marker in the map below to view its population and infection stats in the charts on the bottom." />
            <div className='flex flex-col gap-4'>
              <div className='flex items-center justify-between gap-4 text-center'>
                <h2 className='text-xl font-semibold'>Convenience Zone: {selectedZone.name}</h2>
                <p className='text-sm text-gray-600'>Created on: {new Date(selectedZone.created_at).toLocaleDateString()}</p>
              </div>
              <ModelMap
                selectedZone={selectedZone}
                onMarkerClick={handleMarkerClick}
              />
            </div>
            
            <InstructionBanner text="Use the time slider or play button to navigate through the simulation timeline." />

            <OutputGraphs
              selected_loc={selectedLoc}
              onReset={onReset}
            />
          </div>
        )}
      </div>
    </div>
  );
}