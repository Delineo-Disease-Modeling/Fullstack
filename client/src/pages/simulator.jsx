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

async function makePostRequest(reqdata, setSimData, setMovePatterns, useCache) {
  if (useCache) {
    try {
      const resp = await axios.get(`${DB_URL}simdata/${reqdata.czone_id}`);

      if (resp.status === 200 && resp.data['data']) {
        console.log('Using cached data!');
  
        const data = JSON.parse(resp.data['data']);
        const movement = data['movement'];

        for (const key in movement) {
          if (key > reqdata['length']) {
            delete movement[key];
          }
        }

        setSimData(data['result']);
        setMovePatterns(movement);
        return;
      }  
    } catch (error) {
      console.error(error.status);
    }
  }

  axios.post(`${SIM_URL}simulation/`, reqdata)
    .then(({ status, data }) => {
      if (status !== 200) {
        throw new Error('Status code mismatch');
      }
      if (!data?.['result']) {
        throw new Error('Invalid JSON (missing id)');
      }

      setSimData(data['result']);
      setMovePatterns(data['movement']);

      if (reqdata['length'] == 10080) {
        axios.post(`${DB_URL}simdata`, {
          czone_id: reqdata['czone_id'],
          simdata: JSON.stringify(data)
        })
          .then((res) => console.log(res))
          .catch(console.error);
      }
    })
    .catch(console.error);
}

function sendSimulatorData(setSimData, setMovePatterns, setPapData, { matrices, location, hours, pmask, pvaccine, capacity, lockdown, selfiso, randseed, zone, useCache }) {
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
  }, setSimData, setMovePatterns, useCache);
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
            <InstructionBanner text="Tip: Click on a marker in the map below to view its population and infection stats in the charts on the bottom." />
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
            <button onClick={onReset} className="px-4 py-2 mt-4 text-white bg-red-500 rounded hover:bg-red-600">
              Reset Selection
            </button>
          </div>
        )}
      </div>
    </div>
  );
}