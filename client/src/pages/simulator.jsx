import { useState } from 'react';
import axios from 'axios';

import SimSettings from '../components/simsettings.jsx';
import ModelMap from '../components/modelmap.jsx';
import OutputGraphs from '../components/outputgraphs.jsx';

import './simulator.css';
import { DB_URL, SIM_URL } from '../env';

// InstructionBanner component to show user-friendly instructions
function InstructionBanner({ text }) {
  return (
    <div className="p-4 mb-4 text-blue-800 bg-blue-100 border border-blue-200 rounded">
      {text}
    </div>
  );
}

function makePostRequest(data, setSimData, setMovePatterns) {
  axios.post(`${SIM_URL}simulation/`, data)
    .then(({ status, data }) => {
      if (status !== 200) {
        throw new Error('Status code mismatch');
      }
      if (!data?.['result']) {
        throw new Error('Invalid JSON (missing id)');
      }

      setSimData(data['result']);
      setMovePatterns(data['movement']);
    })
    .catch(console.error);
}

function sendSimulatorData(setSimData, setMovePatterns, setPapData, { matrices, location, hours, pmask, pvaccine, capacity, lockdown, selfiso, randseed, zone }) {
  fetch(`${DB_URL}patterns/${zone.id}`)
    .then((res) => {
      if (!res.ok) {
        throw new Error();
      }
      return res.json();
    })
    .then((json) => setPapData(json['data']['papdata']))
    .catch(console.error);

  makePostRequest({
    'czone_id': zone.id,
    'matrices': matrices,
    'location': location,
    'length': hours * 60,
    'mask': pmask,
    'vaccine': pvaccine,
    'capacity': capacity,
    'lockdown': lockdown,
    'selfiso': selfiso,
    'randseed': randseed
  }, setSimData, setMovePatterns);
}

export default function Simulator() {
  const [showSim, setShowSim] = useState(false);
  const [papData, setPapData] = useState(null);
  const [movePatterns, setMovePatterns] = useState(null);
  const [simData, setSimData] = useState(null);
  const [selectedZone, setSelectedZone] = useState(null);

  const [selectedId, setSelectedId] = useState(null);
  const [isHousehold, setIsHousehold] = useState(false);

  // Handle initial simulation request
  const handleSimData = (dict) => {
    setShowSim(true);
    sendSimulatorData(setSimData, setMovePatterns, setPapData, dict);
    setSelectedZone(dict.zone);
  };

  const handleMarkerClick = (id, isHome) => {
    setSelectedId(id);
    setIsHousehold(isHome);
  };

  const onReset = () => {
    setSelectedId(null);
    setIsHousehold(null);
  };

  return (
    <div>
      <div className='sim_container'>
        {!showSim ? (
          <div className='sim_settings'>
            <InstructionBanner text="Welcome! Generate a Convenience Zone or pick one that's already generated, then click 'Simulate' to begin." />
            <SimSettings sendData={handleSimData} showSim={setShowSim} />
          </div>
        ) : !simData || !movePatterns || !papData ? (
          <div>Loading simulation data...</div>
        ) : (
          <div className='sim_output'>
            <InstructionBanner text="Tip: Click on a marker in the map below to view its population and infection stats in the charts on the right." />
            <div className='flex flex-col gap-4'>
              <div className='flex items-center justify-between'>
                <h2 className='text-xl font-semibold'>Convenience Zone: {selectedZone.name}</h2>
                <p className='text-sm text-gray-600'>Created on: {new Date(selectedZone.created_at).toLocaleDateString()}</p>
              </div>
              <ModelMap
                selectedZone={selectedZone}
                sim_data={simData}
                move_patterns={movePatterns}
                pap_data={papData}
                onMarkerClick={handleMarkerClick}
              />
            </div>
            <InstructionBanner text="Use the time slider above to navigate through the simulation timeline." />
            <OutputGraphs
              sim_data={simData}
              move_patterns={movePatterns}
              pap_data={papData}
              poi_id={selectedId}
              is_household={isHousehold}
              onReset={onReset}
            />
            <button onClick={onReset} className="mt-4 px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600">
              Reset Selection
            </button>
          </div>
        )}
      </div>
    </div>
  );
}