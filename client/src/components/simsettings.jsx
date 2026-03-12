import { useEffect, useState } from 'react';
import CzDict from './czdict';
import useSimSettings from '../stores/simsettings';
import InterventionTimeline from './intervention-timeline';
import { SimParameter, SimBoolean, SimFile, SimRunSelector } from './settings-components';
import { SIM_URL } from '../env';
import { getInclusiveEndDateIso, toSimulationDateParam } from '../lib/simulation-dates';

import './simsettings.css';

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
  if (!cbgList || cbgList.length === 0) return null;
  const fips = cbgList[0]?.substring(0, 2);
  return FIPS_TO_STATE[fips] || null;
}

function formatMonthList(months) {
  return Array.isArray(months) && months.length > 0 ? months.join(', ') : '';
}

export default function SimSettings({ sendData }) {
  const settings = useSimSettings((state) => state.settings);
  const setSettings = useSimSettings((state) => state.setSettings);
  const [patternAvailability, setPatternAvailability] = useState({ status: 'idle' });
  
  // Auto-detect state from zone's CBGs
  const detectedState = getStateFromCBG(settings.zone?.cbg_list);
  const endDateIso = getInclusiveEndDateIso(settings.zone?.start_date, settings.zone?.length);
  const startDateParam = toSimulationDateParam(settings.zone?.start_date);
  const endDateParam = toSimulationDateParam(endDateIso);
  
  // Format dates for display
  const formatDateDisplay = (isoString) => {
    if (!isoString) return 'N/A';
    const d = new Date(isoString);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  // Calculate end date from start_date + length (hours)
  const getEndDate = () => {
    return endDateIso;
  };

  useEffect(() => {
    if (!detectedState || !startDateParam || !endDateParam) {
      setPatternAvailability({ status: 'idle' });
      return undefined;
    }

    const controller = new AbortController();

    async function loadPatternAvailability() {
      setPatternAvailability({ status: 'loading' });

      try {
        const params = new URLSearchParams({
          state: detectedState,
          start_date: startDateParam,
          end_date: endDateParam,
        });
        const response = await fetch(`${SIM_URL}simulation/pattern-availability?${params.toString()}`, {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`Pattern availability request failed with status ${response.status}`);
        }

        const json = await response.json();
        setPatternAvailability({ status: 'ready', data: json.data });
      } catch (error) {
        if (error.name === 'AbortError') {
          return;
        }

        console.error('Pattern availability check failed:', error);
        setPatternAvailability({ status: 'error' });
      }
    }

    loadPatternAvailability();

    return () => controller.abort();
  }, [detectedState, startDateParam, endDateParam]);

  const patternStatus = (() => {
    if (!detectedState) {
      return null;
    }

    if (!startDateParam || !endDateParam) {
      return {
        tone: 'text-gray-500',
        message: `State detected: ${detectedState}`,
      };
    }

    if (patternAvailability.status === 'loading') {
      return {
        tone: 'text-gray-500',
        message: `Checking pattern data for ${detectedState}...`,
      };
    }

    if (patternAvailability.status === 'error') {
      return {
        tone: 'text-gray-500',
        message: `State detected: ${detectedState} (pattern availability check unavailable)`,
      };
    }

    if (patternAvailability.status !== 'ready') {
      return null;
    }

    const coveredMonths = formatMonthList(
      patternAvailability.data?.required_months?.length
        ? patternAvailability.data.required_months
        : patternAvailability.data?.available_months
    );
    if (patternAvailability.data?.has_coverage) {
      return {
        tone: 'text-green-600',
        message: coveredMonths
          ? `✓ Pattern data available for ${detectedState} (${coveredMonths})`
          : `✓ Pattern data available for ${detectedState}`,
      };
    }

    const missingMonths = formatMonthList(patternAvailability.data?.missing_months);
    return {
      tone: 'text-amber-600',
      message: missingMonths
        ? `⚠ Missing pattern data for ${detectedState}: ${missingMonths}`
        : `⚠ No pattern data available for ${detectedState}`,
    };
  })();

  return (
    <div className='simset_settings'>
      <div className='simset_params'>
        {/* Pass setSelectedZone to SimLocation, so we get the full object */}
        <CzDict
          zone={settings.zone}
          setZone={(zone) => {
            setSettings({ zone });
            // Update hours from zone's length if available
            if (zone?.length) {
              setSettings({ hours: zone.length });
            }
          }}
        />

        {/* Show zone's date range (read-only, set during CZ generation) */}
        {settings.zone?.start_date && (
          <div className='text-sm text-gray-600 -mt-2 mb-2'>
            <span className='font-medium'>Date Range:</span>{' '}
            {formatDateDisplay(settings.zone.start_date)} → {formatDateDisplay(getEndDate())}
            <span className='text-xs text-gray-400 ml-2'>
              ({settings.zone?.length ? Math.round(settings.zone.length / 24) : '?'} days)
            </span>
          </div>
        )}
        
        {/* Show detected state and availability warning */}
        {patternStatus && (
          <div className={`text-xs ${patternStatus.tone} ml-1 mb-2`}>
            {patternStatus.message}
          </div>
        )}

        <SimBoolean 
          label={'Random Seed'}
          value={settings.randseed}
          callback={(randseed) => setSettings({ randseed })}
        />
        <SimParameter
          label={'Initial Infected'}
          value={settings.initial_infected_count}
          callback={(initial_infected_count) => setSettings({ initial_infected_count })}
          min={1}
          max={Math.min(100, settings.zone?.size ?? 100)}
          percent={false}
          units=' people'
        />
        {/* <MatrixSelector customFiles={customFiles} setMatrices={setMatrices}/> */}
        <SimFile 
          label={'Custom DMP Matrix Files'}
          // callback={setCustomFiles}
          callback={console.log}
        />
      </div>

      <InterventionTimeline />

      <div className="relative flex items-center my-8 w-96 max-w-[90vw]">
        <div className="flex-grow border-t border-[#222629]"></div>
        <span className="mx-4">or</span>
        <div className="flex-grow border-t border-[#222629]"></div>
      </div>

      <SimRunSelector
        czone_id={settings.zone?.id}
        sim_id={settings.sim_id}
        callback={(sim_id) => setSettings({ sim_id })}
      />
      
      <button
        className='simset_button w-32'
        onClick={() => {
          if (!settings.zone) {
            alert('Please pick a convenience zone first.');
            return;
          }

          if (!settings.zone.ready) {
            alert('This convenience zone is still generating. Try again in a moment.');
            return;
          }

          // Now pass the zone's name & full object to the parent
          sendData();
        }}
      >
        Simulate
      </button>
    </div>
  );
}
