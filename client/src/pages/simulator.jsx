import { useState } from 'react';
import axios from 'axios';

import SimSettings from '../components/simsettings.jsx';
import ModelMap from '../components/modelmap.jsx';
import OutputGraphs from '../components/outputgraphs.jsx';

import './simulator.css';
//import CytoGraph from '../components/cytograph.jsx';
import { API_URL, USE_CACHED_DATA } from '../env';

function makePostRequest(data, setSimData, setMovePatterns) {
  axios.post(`${API_URL}simulation/`, data)
    .then((res) => {
      setSimData(res.data['result']);
      setMovePatterns(res.data['movement']);
      console.log(res.data);
    })
    .catch((error) => {
      console.log(error.response);
    });
}

// eslint-disable-next-line no-unused-vars
function sendSimulatorData(setSimData, setMovePatterns, setPapData, { matrices, location, days, pmask, pvaccine, capacity, lockdown, selfiso, randseed }) {
  fetch(`data/${location}/papdata.json`).then((res) => {
    res.json().then((data) => {
      setPapData(data);
      console.log(data);
    })
  });

  if (USE_CACHED_DATA === 'TRUE') {
    fetch(`data/${location}/patterns.json`).then((res) => {
      res.json().then((data) => {
        setMovePatterns(data);
        console.log(data);
      })
    });

    fetch(`data/${location}/infectivity.json`).then((res) => {
      res.json().then((data) => {
        setSimData(data);
        console.log(data);
      })
    });
  } else {
    makePostRequest({
      'matrices': matrices,
      'location': location,
      'length': 10080,
      'mask': pmask,
      'vaccine': pvaccine,
      'capacity': capacity,
      'lockdown': lockdown,
      'selfiso': selfiso,
      'randseed': randseed
    }, setSimData, setMovePatterns);  
  }
}

export default function Simulator() {
  const [showSim, setShowSim] = useState(false);          // Show simulator, or show settings?
  const [papData, setPapData] = useState(null);
  const [movePatterns, setMovePatterns] = useState(null);
  const [simData, setSimData] = useState(null);           // Simulator output data

  const [selectedZone, setSelectedZone] = useState(null);

  // State to track selected marker information
  const [selectedId, setSelectedId] = useState(null);
  const [isHousehold, setIsHousehold] = useState(false);

  // Function to handle marker clicks in ModelMap
  const handleSimData = (dict) => {
    // Run your existing function that sets papData, movePatterns, simData
    sendSimulatorData(setSimData, setMovePatterns, setPapData, dict);

    console.log(dict.zone);
    setSelectedZone(dict.zone); 
  };

  const handleMarkerClick = (id, isHome) => {
    setSelectedId(id);
    setIsHousehold(isHome);
  };

  const onReset = () => {
    setSelectedId(null);
    setIsHousehold(null);
  }

  return (
    <div>
      <div className='sim_container'>
        {!showSim &&
          <div className='sim_settings'>
            {/* Instead of inline, let's pass handleSimData */}
            <SimSettings sendData={handleSimData} showSim={setShowSim} />
          </div>
        }

        {showSim && (!simData || !movePatterns || !papData) &&
          <div>Loading...</div>
        }

        {showSim && simData && movePatterns && papData &&
          <div className='sim_output'>
            <div className='flex flex-col gap-4'>
              <div className='flex items-center justify-between'>
                <h2>{selectedZone.label} ({selectedZone.name})</h2>
                <p>{new Date(selectedZone.created_at).toLocaleDateString()}</p>
              </div>

              <ModelMap
                selectedZone={selectedZone}
                sim_data={simData}
                move_patterns={movePatterns}
                pap_data={papData}
                onMarkerClick={handleMarkerClick} // Pass the click handler to ModelMap
              />
            </div>

            <OutputGraphs
              sim_data={simData}
              move_patterns={movePatterns}
              pap_data={papData}
              poi_id={selectedId} // Pass selected marker ID to OutputGraphs
              is_household={isHousehold} // Pass marker type to OutputGraphs
              onReset={onReset}
            />
            {/* <CytoGraph 
              move_patterns={movePatterns}
              pap_data={papData}
            /> */}
          </div>
        }
      </div>
    </div>
  );
}