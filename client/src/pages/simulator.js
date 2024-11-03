import { useState } from 'react';
import axios from 'axios';

import SimSettings from '../components/simsettings.js';
import ModelMap from '../components/modelmap.js';
import OutputGraphs from '../components/outputgraphs.js';

import './simulator.css';

function makePostRequest(data, setSimData) {
  axios.post("http://127.0.0.1:5000/simulation/", data)
    .then((res) => {
      setSimData(res.data);
      console.log(res.data);
    })
    .catch((error) => {
      console.log(error.response);
    });
}

function sendSimulatorData(setSimData, setMovePatterns, setPapData, { matrices, location, days, pmask, pvaccine, capacity, lockdown, selfiso }) {
  fetch('data/barnsdall/patterns.json').then((res) => {
    res.json().then((data) => {
      setMovePatterns(data);
      console.log(data);
    })
  });

  fetch('data/barnsdall/papdata.json').then((res) => {
    res.json().then((data) => {
      setPapData(data);
      console.log(data);
    })
  });

  fetch('data/barnsdall/infectivity.json').then((res) => {
    res.json().then((data) => {
      setSimData(data);
      console.log(data);
    })
  });
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

        {showSim && !simData && !movePatterns && !papData &&
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
          </div>
        }
      </div>
    </div>
  );
}