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

// FIPS state codes - first 2 digits of CBG identify state
const FIPS_TO_STATE = {
  '01': 'AL', '02': 'AK', '04': 'AZ', '05': 'AR', '06': 'CA',
  '08': 'CO', '09': 'CT', '10': 'DE', '11': 'DC', '12': 'FL',
  '13': 'GA', '15': 'HI', '16': 'ID', '17': 'IL', '18': 'IN',
  '19': 'IA', '20': 'KS', '21': 'KY', '22': 'LA', '23': 'ME',
  '24': 'MD', '25': 'MA', '26': 'MI', '27': 'MN', '28': 'MS',
  '29': 'MO', '30': 'MT', '31': 'NE', '32': 'NV', '33': 'NH',
  '34': 'NJ', '35': 'NM', '36': 'NY', '37': 'NC', '38': 'ND',
  '39': 'OH', '40': 'OK', '41': 'OR', '42': 'PA', '44': 'RI',
  '45': 'SC', '46': 'SD', '47': 'TN', '48': 'TX', '49': 'UT',
  '50': 'VT', '51': 'VA', '53': 'WA', '54': 'WV', '55': 'WI', '56': 'WY'
};

function getStateFromCBG(cbgList) {
  if (!cbgList || cbgList.length === 0) return 'OK'; // Default fallback
  const fips = cbgList[0]?.substring(0, 2);
  return FIPS_TO_STATE[fips] || 'OK';
}

// Keep enough timesteps to preserve visible movement in long runs without freezing the UI.
const MAX_RENDER_TIMESTAMPS = 2000;

// Helper function to transform simulation data for the UI
function transformSimData(result, movement, sampledTimestamps) {
  const transformed = {};
  
  // Debug: Track infection transitions
  let prevInfectedCount = null;
  
  for (const timestamp of sampledTimestamps) {
    const timestampStr = String(timestamp);
    const moveData = movement[timestampStr];
    const resultData = result[timestampStr] ?? {};
    
    if (!moveData) continue;
    
    // Get all infected person IDs across all variants
    // InfectionState flags: SUSCEPTIBLE=0, INFECTED=1, INFECTIOUS=2, SYMPTOMATIC=4, HOSPITALIZED=8, RECOVERED=16, REMOVED=32
    const infectedPersons = new Set();
    for (const variant of Object.values(resultData)) {
      for (const [personId, state] of Object.entries(variant)) {
        // Check if INFECTED bit is set (bitwise AND with 1)
        if ((state & 1) === 1) {
          infectedPersons.add(personId);
        }
      }
    }
    
    // Transform homes
    const homes = {};
    for (const [homeId, personIds] of Object.entries(moveData?.homes ?? {})) {
      const population = personIds.length;
      const infected = personIds.filter(id => infectedPersons.has(String(id))).length;
      homes[homeId] = { population, infected };
    }
    
    // Transform places
    const places = {};
    for (const [placeId, personIds] of Object.entries(moveData?.places ?? {})) {
      const population = personIds.length;
      const infected = personIds.filter(id => infectedPersons.has(String(id))).length;
      places[placeId] = { population, infected };
    }
    
    transformed[timestampStr] = { homes, places };
  }
  
  return transformed;
}

export default function Simulator() {
  const settings = useSimSettings((state) => state.settings);
  const simdata = useSimData((state) => state.simdata);
  const papdata = useSimData((state) => state.papdata);
  const runName = useSimData((state) => state.name);

  const setSettings = useSimSettings((state) => state.setSettings);
  const setSimData = useSimData((state) => state.setSimData);
  const setPapData = useSimData((state) => state.setPapData);
  const setRunName = useSimData((state) => state.setName);

  const [showSim, setShowSim] = useState(false);
  const [selectedZone, setSelectedZone] = useState(null);
  const [selectedLoc, setSelectedLoc] = useState(null);
  const [rawSimData, setRawSimData] = useState(null); // Store raw data for saving
  const [isSaving, setIsSaving] = useState(false);
  const [runParams, setRunParams] = useState(null);
  const [showRunParams, setShowRunParams] = useState(false);
  const [loadError, setLoadError] = useState(null);

  const saveSimulation = async () => {
    if (!rawSimData || !settings.zone?.id) {
      alert('No simulation data to save');
      return;
    }

    setIsSaving(true);
    try {
      // Get first intervention's parameters
      const intervention = settings.interventions?.[0] ?? {};
      
      const response = await fetch(`${DB_URL}simdata-json`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          czone_id: settings.zone.id,
          name: runName || `Simulation ${new Date().toLocaleString()}`,
          simdata: rawSimData.result,
          movement: rawSimData.movement,
          papdata: rawSimData.papdata,
          hours: settings.hours,
          mask_rate: intervention.mask,
          vaccine_rate: intervention.vaccine,
          capacity: intervention.capacity,
          lockdown: intervention.lockdown
        })
      });

      if (!response.ok) {
        throw new Error('Failed to save simulation');
      }

      const json = await response.json();
      setSettings({ sim_id: json.data.id });
      alert('Simulation saved successfully!');
    } catch (error) {
      console.error('Save failed:', error);
      alert('Failed to save simulation');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRename = async () => {
    if (!settings.sim_id || !runName || runName.length < 2) return;

    try {
      const res = await fetch(`${DB_URL}simdata/${settings.sim_id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ name: runName })
      });

      if (!res.ok) {
        throw new Error('Failed to rename');
      }

      const json = await res.json();
      if (json.data && json.data.name) {
        setRunName(json.data.name);
      }
    } catch (error) {
      console.error('Rename failed:', error);
    }
  };

  const makePostRequest = async () => {
    setLoadError(null);

    // Use zone description (e.g., "hagerstown") as location, falling back to name
    const locationName = (settings.zone?.description || settings.zone?.name || 'barnsdall')
      .toLowerCase()
      .replace(/\s+/g, '');
    
    // Derive state from zone's CBG list
    const state = getStateFromCBG(settings.zone?.cbg_list);
    
    // Get dates from zone (set during CZ generation)
    // Convert ISO dates to YYYY-MM-DD format for the simulation API
    const formatDate = (isoString) => {
      if (!isoString) return null;
      return new Date(isoString).toISOString().split('T')[0];
    };
    
    const zoneStart = settings.zone?.start_date;
    const zoneLengthHours = Number(settings.zone?.length ?? settings.hours ?? 0);
    const startDate = formatDate(settings.zone?.start_date);
    const endDate = zoneStart && zoneLengthHours > 0
      ? formatDate(new Date(new Date(zoneStart).getTime() + zoneLengthHours * 60 * 60 * 1000).toISOString())
      : null;

    const missing = [];
    if (!startDate) missing.push('start_date');
    if (!endDate) missing.push('end_date');
    if (!state) missing.push('state');
    if (missing.length > 0) {
      setLoadError(`Missing required simulation fields: ${missing.join(', ')}. Re-select or regenerate the convenience zone.`);
      return;
    }
    
    const reqbody = {
      start_date: startDate,
      end_date: endDate,
      state: state,
      location: locationName,
      czone_id: settings.zone?.id,
      initial_infected_count: settings.initial_infected_count,
      interventions: settings.interventions,
      randseed: settings.randseed,
    };

    console.log('[SIM] Request body:', reqbody);

    if (settings.sim_id !== null) {
      try {
        const res = await fetch(`${DB_URL}simdata/${settings.sim_id}`);

        if (!res.ok) {
          throw new Error(`Invalid simdata response ${res.status}`);
        }

        const json = await res.json();

        setSimData(json['data']['simdata']);
        setRunName(json['data']['name']);
        setRunParams({
          hours: json?.data?.hours,
          initial_infected_count: json?.data?.initial_infected_count,
          mask_rate: json?.data?.mask_rate,
          vaccine_rate: json?.data?.vaccine_rate,
          capacity: json?.data?.capacity,
          lockdown: json?.data?.lockdown
        });
        setShowRunParams(false);
        setLoadError(null);
        return;
      } catch (error) {
        console.error(error);
      }
    }

    axios.post(`${SIM_URL}simulation/`, reqbody)
      .then(({ status, data }) => {
        if (status !== 200) {
          throw new Error('Status code mismatch');
        }

        console.log('[SIM] Response:', data);

        // Check if this is a multi-month response
        if (data?.['data']?.['monthly_results']) {
          // Multi-month simulation response
          const monthlyResults = data['data']['monthly_results'];
          const months = data['data']['months'] || Object.keys(monthlyResults);
          
          console.log(`[SIM] Multi-month response: ${months.length} months`);
          
          // Combine all months' results into a single timeline
          let combinedResult = {};
          let combinedMovement = {};
          let papdata = null;
          let timeOffset = 0;
          
          for (const month of months) {
            const monthData = monthlyResults[month]?.result || {};
            const monthResult = monthData.result || {};
            const monthMovement = monthData.movement || {};
            
            console.log(`[SIM] Month ${month}: ${Object.keys(monthResult).length} result keys, ${Object.keys(monthMovement).length} movement keys`);
            
            // DEBUG: Check if result data has any infected people at all
            let totalInfectedInMonth = 0;
            for (const [ts, tsData] of Object.entries(monthResult)) {
              for (const variant of Object.values(tsData || {})) {
                for (const state of Object.values(variant)) {
                  if ((state & 1) === 1) totalInfectedInMonth++;
                }
              }
            }
            console.log(`[SIM] Month ${month} total infected entries across ALL timestamps: ${totalInfectedInMonth}`);
            
            // Debug: Check infection counts at start and end of this month
            const resultTimestamps = Object.keys(monthResult).map(Number).sort((a, b) => a - b);
            if (resultTimestamps.length > 0) {
              const firstTs = resultTimestamps[0];
              const lastTs = resultTimestamps[resultTimestamps.length - 1];
              const countInfected = (resultData) => {
                let count = 0;
                for (const variant of Object.values(resultData || {})) {
                  for (const state of Object.values(variant)) {
                    if ((state & 1) === 1) count++;
                  }
                }
                return count;
              };
              console.log(`[SIM] Month ${month} infections: start=${countInfected(monthResult[firstTs])}, end=${countInfected(monthResult[lastTs])}`);
            }
            
            // Get papdata from first month
            if (!papdata && monthData.papdata) {
              papdata = monthData.papdata;
            }
            
            // Get the max timestamp from this month's data to calculate offset for next month
            const timestamps = Object.keys(monthMovement).map(Number);
            const maxTimestamp = timestamps.length > 0 ? Math.max(...timestamps) : 0;
            
            // Add this month's data with offset
            for (const [ts, data] of Object.entries(monthResult)) {
              combinedResult[String(Number(ts) + timeOffset)] = data;
            }
            for (const [ts, data] of Object.entries(monthMovement)) {
              combinedMovement[String(Number(ts) + timeOffset)] = data;
            }
            
            timeOffset += maxTimestamp + 60; // Add gap between months
            console.log(`[SIM] Month ${month} done, new timeOffset: ${timeOffset}`);
          }
          
          console.log(`[SIM] Combined: ${Object.keys(combinedMovement).length} timesteps`);
          
          // Debug: Check infection counts at combined boundaries
          const combinedTimestamps = Object.keys(combinedResult).map(Number).sort((a, b) => a - b);
          if (combinedTimestamps.length > 0) {
            const countInfectedCombined = (ts) => {
              let count = 0;
              const data = combinedResult[String(ts)];
              for (const variant of Object.values(data || {})) {
                for (const state of Object.values(variant)) {
                  if ((state & 1) === 1) count++;
                }
              }
              return count;
            };
            console.log(`[SIM] Combined infections at boundaries:`);
            for (let i = 0; i < combinedTimestamps.length; i += Math.floor(combinedTimestamps.length / 5)) {
              const ts = combinedTimestamps[i];
              console.log(`  ts=${ts}: ${countInfectedCombined(ts)} infected`);
            }
          }
          
          // Now process like regular simdata
          const result = combinedResult;
          const movement = combinedMovement;
          
          // OPTIMIZATION: Sample timesteps to prevent UI freeze
          const allTimestamps = Object.keys(movement).map(Number).sort((a, b) => a - b);
          const maxTimestamps = Math.min(
            MAX_RENDER_TIMESTAMPS,
            Math.max(400, Number(settings.hours || 0))
          );
          const sampleRate = Math.max(1, Math.ceil(allTimestamps.length / maxTimestamps));
          const sampledTimestamps = allTimestamps.filter((_, i) => i % sampleRate === 0 || i === allTimestamps.length - 1);
          
          console.log(`[PERF] Sampling ${sampledTimestamps.length} of ${allTimestamps.length} timesteps`);
          
          // Transform the data
          const transformed = transformSimData(result, movement, sampledTimestamps);
          
          // DEBUG: Check transformed data has infections
          let totalTransformedInfected = 0;
          for (const ts of Object.keys(transformed)) {
            const tsData = transformed[ts];
            for (const loc of Object.values(tsData.homes || {})) {
              totalTransformedInfected += loc.infected || 0;
            }
            for (const loc of Object.values(tsData.places || {})) {
              totalTransformedInfected += loc.infected || 0;
            }
          }
          console.log(`[DEBUG] Transformed data total infected across all timesteps: ${totalTransformedInfected}`);
          console.log(`[DEBUG] Sample transformed data:`, Object.keys(transformed).slice(0, 2).map(k => ({ ts: k, data: transformed[k] })));
          
          setSimData(transformed);
          if (papdata) setPapData(papdata);
          
          setRawSimData({ result, movement, papdata: papdata || {} });
          
          const intervention = settings.interventions?.[0] ?? {};
          const zoneStart = settings.zone?.start_date ? new Date(settings.zone.start_date).toLocaleDateString() : 'N/A';
          const zoneEnd = settings.zone?.start_date && settings.zone?.length
            ? new Date(new Date(settings.zone.start_date).getTime() + settings.zone.length * 60 * 60 * 1000).toLocaleDateString()
            : 'N/A';
          setRunParams({
            date_range: `${zoneStart} → ${zoneEnd}`,
            initial_infected_count: settings.initial_infected_count,
            mask_rate: intervention.mask,
            vaccine_rate: intervention.vaccine,
            capacity: intervention.capacity,
            lockdown: intervention.lockdown
          });
          setShowRunParams(false);
          setRunName(`Multi-month: ${months.join(', ')}`);
          return;
        }

        // Check if we have a DB ID or direct simdata (legacy format)
        const simId = data?.['data']?.['id'];
        
        if (simId) {
          // We have a DB ID, fetch the data from DB
          setSettings({ sim_id: simId });

          axios.get(`${DB_URL}simdata/${simId}`)
            .then(({ status, data }) => {
              if (status !== 200) {
                throw new Error('Status code mismatch');
              }

              setSimData(data['data']['simdata']);
              setRunName(data['data']['name']);
              setRunParams({
                hours: data?.data?.hours,
                initial_infected_count: data?.data?.initial_infected_count,
                mask_rate: data?.data?.mask_rate,
                vaccine_rate: data?.data?.vaccine_rate,
                capacity: data?.data?.capacity,
                lockdown: data?.data?.lockdown
              });
              setShowRunParams(false);
              setLoadError(null);
            })
            .catch((error) => {
              console.error(error);
              setLoadError('Failed to load saved simulation data.');
            });
        } else if (data?.['simdata']) {
          // Direct simdata returned from simulation (legacy format)
          const simOutput = data['simdata'];
          const result = simOutput?.['result'] ?? {};
          const movement = simOutput?.['movement'] ?? {};
          
          // OPTIMIZATION: Sample timesteps to prevent UI freeze
          const allTimestamps = Object.keys(movement).map(Number).sort((a, b) => a - b);
          const maxTimestamps = Math.min(
            MAX_RENDER_TIMESTAMPS,
            Math.max(400, Number(settings.hours || 0))
          );
          const sampleRate = Math.max(1, Math.ceil(allTimestamps.length / maxTimestamps));
          const sampledTimestamps = allTimestamps.filter((_, i) => i % sampleRate === 0 || i === allTimestamps.length - 1);
          
          console.log(`[PERF] Sampling ${sampledTimestamps.length} of ${allTimestamps.length} timesteps (rate: 1/${sampleRate})`);
          
          const transformed = transformSimData(result, movement, sampledTimestamps);
          
          console.log(`[PERF] Transformation complete: ${Object.keys(transformed).length} timesteps`);
          
          setSimData(transformed);
          setLoadError(null);
          
          // Set papdata if available
          if (simOutput?.['papdata']) {
            setPapData(simOutput['papdata']);
          }
          
          // Store raw data for potential saving
          setRawSimData({
            result: result,
            movement: movement,
            papdata: simOutput?.['papdata'] ?? {}
          });

          // Best-effort params for an unsaved run
          const intervention = settings.interventions?.[0] ?? {};
          setRunParams({
            hours: settings.hours,
            initial_infected_count: settings.initial_infected_count,
            mask_rate: intervention.mask,
            vaccine_rate: intervention.vaccine,
            capacity: intervention.capacity,
            lockdown: intervention.lockdown
          });
          setShowRunParams(false);
          
          setRunName('Simulation Result');
        } else {
          console.error('No simulation data received');
          setLoadError('No simulation data received.');
        }
      })
      .catch((error) => {
        console.error(error);
        setLoadError(
          error?.response?.data?.error
          || error?.response?.data?.message
          || error?.message
          || 'Failed to run simulation.'
        );
      });
  };

  const sendSimulatorData = () => {
    // Reset Data
    setSimData(null);
    setPapData(null);
    setRunName('');
    setLoadError(null);

    // Switch "pages"
    setShowSim(true);
    setSelectedZone(settings.zone);

    fetch(`${DB_URL}papdata/${settings.zone.id}`)
      .then((res) => {
        if (!res.ok) {
          throw new Error('This convenience zone is missing simulation input files. Please regenerate it.');
        }
        return res.json();
      })
      .then((json) => {
        setPapData(json['data']);
        setLoadError(null);
      })
      .catch((error) => {
        console.error(error);
        setLoadError(error?.message || 'Failed to load papdata.');
      });

    makePostRequest({
      ...settings,
      czone_id: settings.zone.id,
      length: settings.hours * 60
    });
  };

  const handleMarkerClick = ({ id, label, type }) => {
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
        ) : loadError ? (
          <div className='text-red-600'>{loadError}</div>
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
              <div className='flex items-center justify-between gap-2'>
                <div className='flex gap-2 items-center'>
                  <label htmlFor='run-name' className='text-sm text-gray-700'>Run Name:</label>
                  <input
                    id='run-name'
                    type='text'
                    value={runName || ''}
                    onChange={(e) => setRunName(e.target.value)}
                    onBlur={handleRename}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleRename();
                        e.currentTarget.blur();
                      }
                    }}
                    className='rounded px-2 py-1 text-sm bg-[#fffff2] outline-solid outline-2 outline-[#70B4D4]'
                    placeholder='Untitled Run'
                  />
                </div>
                <div className='flex gap-2'>
                  {!settings.sim_id && rawSimData && (
                    <button
                      onClick={saveSimulation}
                      disabled={isSaving}
                      className='bg-green-500 hover:bg-green-600 disabled:bg-green-300 text-white text-xs py-2 px-2 rounded'
                    >
                      {isSaving ? 'Saving...' : 'Save Simulation'}
                    </button>
                  )}
                  {settings.sim_id && (
                    <button
                      onClick={async () => {
                        if (window.confirm('Are you sure you want to delete this run? This action cannot be undone.')) {
                          try {
                            const res = await fetch(`${DB_URL}simdata/${settings.sim_id}`, {
                              method: 'DELETE'
                            });

                            if (!res.ok) {
                              throw new Error('Failed to delete');
                            }

                            // Reset Data
                            setSimData(null);
                            setPapData(null);
                            setRunName('');
                            setSettings({ sim_id: null });

                            // Switch "pages"
                            setShowSim(false);
                            setSelectedZone(null);
                          } catch (error) {
                            console.error('Delete failed:', error);
                            alert('Failed to delete run');
                          }
                        }
                      }}
                      className='bg-red-500 hover:bg-red-600 text-white text-xs py-2 px-2 rounded'
                    >
                      Delete Run
                    </button>
                  )}
                </div>
              </div>

              {runParams && (
                <div
                  className='w-full outline-solid outline-2 outline-[#70B4D4] bg-[#fffff2] px-3 py-2 text-sm text-gray-700 hover:cursor-pointer'
                  onClick={() => setShowRunParams((v) => !v)}
                  title='Click to toggle initial parameters'
                >
                  <div className='flex items-center justify-between'>
                    <span className='font-semibold'>Parameters</span>
                    <span className='text-xs text-gray-600'>{showRunParams ? 'Hide' : 'Show'}</span>
                  </div>
                  {showRunParams && (
                    <div className='mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs'>
                      <div>Hours: {runParams.hours ?? '-'}</div>
                      <div>Initial Infected: {runParams.initial_infected_count ?? '-'}</div>
                      <div>Capacity: {runParams.capacity != null ? `${Math.round(runParams.capacity * 100)}%` : '-'}</div>
                      <div>Mask: {runParams.mask_rate != null ? `${Math.round(runParams.mask_rate * 100)}%` : '-'}</div>
                      <div>Lockdown: {runParams.lockdown != null ? `${Math.round(runParams.lockdown * 100)}%` : '-'}</div>
                      <div>Vaccine: {runParams.vaccine_rate != null ? `${Math.round(runParams.vaccine_rate * 100)}%` : '-'}</div>
                    </div>
                  )}
                </div>
              )}

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
