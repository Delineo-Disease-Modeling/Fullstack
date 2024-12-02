import { useState } from 'react';
import axios from 'axios';

import SimSettings from '../components/simsettings.jsx';
import ModelMap from '../components/modelmap.jsx';
import OutputGraphs from '../components/outputgraphs.jsx';

import './simulator.css';
import CytoGraph from '../components/cytograph.jsx';
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
function sendSimulatorData(setSimData, setMovePatterns, setPapData, { matrices, location, days, pmask, pvaccine, capacity, lockdown, selfiso }) {
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
      'selfiso': selfiso
    }, setSimData, setMovePatterns);  
  }
}

export default function Simulator() {
  const [showSim, setShowSim] = useState(false);          // Show simulator, or show settings?
  const [papData, setPapData] = useState(null);
  const [movePatterns, setMovePatterns] = useState(null);
  const [simData, setSimData] = useState(null);           // Simulator output data
  const [location, setLocation] = useState('barnsdall');

  // State to track selected marker information
  const [selectedId, setSelectedId] = useState(null);
  const [isHousehold, setIsHousehold] = useState(false);

  // Function to handle marker clicks in ModelMap
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
            <SimSettings sendData={(dict) => {
              sendSimulatorData(setSimData, setMovePatterns, setPapData, dict);
              setLocation(dict['location']);
            }} showSim={setShowSim} />
          </div>
        }

        {showSim && (!simData || !movePatterns || !papData) &&
          <div>Loading...</div>
        }

        {showSim && simData && movePatterns && papData &&
          <div className='sim_output'>
            <ModelMap
              sim_data={simData}
              move_patterns={movePatterns}
              pap_data={papData}
              location={location}
              onMarkerClick={handleMarkerClick} // Pass the click handler to ModelMap
            />
            <OutputGraphs
              sim_data={simData}
              move_patterns={movePatterns}
              pap_data={papData}
              poi_id={selectedId} // Pass selected marker ID to OutputGraphs
              is_household={isHousehold} // Pass marker type to OutputGraphs
              onReset={onReset}
            />
            <CytoGraph 
              move_patterns={movePatterns}
              pap_data={papData}
            />
          </div>
        }
      </div>
    </div>
  );
}