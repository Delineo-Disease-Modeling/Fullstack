import { useState, useEffect, useRef } from 'react';
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
  const patterns = useSimData((state) => state.patterns);
  const papdata = useSimData((state) => state.papdata);

  const setSimData = useSimData((state) => state.setSimData);
  const setPatterns = useSimData((state) => state.setPatterns);
  const setPapData = useSimData((state) => state.setPapData);

  const [showSim, setShowSim] = useState(false);
  const [selectedZone, setSelectedZone] = useState(null);

  const [selectedId, setSelectedId] = useState(null);
  const [isHousehold, setIsHousehold] = useState(false);

  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  const timeRef = useRef(currentTime);
  useEffect(() => {
    timeRef.current = currentTime;
  }, [currentTime]);

  const makePostRequest = async () => {
    const reqbody = {
      ...settings,
      czone_id: settings.zone.id,
      length: settings.hours * 60
    };

    console.log(reqbody);

    if (settings.usecache) {
      try {
        const resp = await axios.get(`${DB_URL}simdata/${settings.zone.id}`);

        if (resp.status === 200 && resp.data['data']) {
          console.log('Using cached data!');
    
          const data = JSON.parse(resp.data['data']);
          const movement = data['movement'];

          for (const key in movement) {
            if (key > reqbody['length']) {
              delete movement[key];
            }
          }

          setSimData(data['result']);
          setPatterns(movement);

          return;
        }  
      } catch (error) {
        console.error(error.status);
      }
    }

    axios.post(`${SIM_URL}simulation/`, reqbody)
      .then(({ status, data }) => {
        if (status !== 200) {
          throw new Error('Status code mismatch');
        }
        if (!data?.['result']) {
          throw new Error('Invalid JSON (missing id)');
        }

        setSimData(data['result']);
        setPatterns(data['movement']);
      })
      .catch(console.error);
  };

  const sendSimulatorData = () => {
    // Reset Data
    setSimData(null);
    setPatterns(null);
    setPapData(null);

    // Switch "pages"
    setShowSim(true);
    setSelectedZone(settings.zone);
    
    fetch(`${DB_URL}patterns/${settings.zone.id}`)
      .then((res) => {
        if (!res.ok) {
          throw new Error();
        }
        return res.json();
      })
      .then((json) => setPapData(json['data']['papdata']))
      .catch(console.error);

    makePostRequest({
      ...settings,
      czone_id: settings.zone.id,
      length: settings.hours * 60
    });
  };

  const handleMarkerClick = (id, isHome) => {
    setSelectedId(id);
    setIsHousehold(isHome);
  };

  const onReset = () => {
    setSelectedId(null);
    setIsHousehold(null);
  };

  useEffect(() => {
    if (!patterns || Object.keys(patterns).length === 0) return;
    let interval;
  
    if (isPlaying) {
      interval = setInterval(() => {
        const max = Object.keys(patterns).length;
        const next = Math.min(timeRef.current + 1, max);
  
        // if reached end, stop playback
        if (next >= max) {
          clearInterval(interval);
          setIsPlaying(false);
        }
  
        setCurrentTime(next);
        timeRef.current = next;
      }, 200);
    }
  
    return () => clearInterval(interval);
  }, [isPlaying, patterns]);


  return (
    <div>
      <div className='sim_container'>
        {!showSim ? (
          <div className='sim_settings px-4'>
            <InstructionBanner text="Welcome! Generate a Convenience Zone or pick one that's already generated, then click 'Simulate' to begin." />
            <SimSettings sendData={sendSimulatorData} />
          </div>
        ) : !simdata || !patterns || !papdata ? (
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
                currentTime={currentTime}
                setCurrentTime={setCurrentTime}
                isPlaying={isPlaying}
                setIsPlaying={setIsPlaying}
              />
            </div>
            
            <InstructionBanner text="Use the time slider or play button to navigate through the simulation timeline." />

            <OutputGraphs
              poi_id={selectedId}
              is_household={isHousehold}
              onReset={onReset}
              currentTime={currentTime}
            />
          </div>
        )}
      </div>
    </div>
  );
}