'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import type { ConvenienceZone } from '@/stores/simsettings';
import useSimSettings from '@/stores/simsettings';
import CzDict from './czdict';
import InterventionTimeline from './intervention-timeline';
import {
  SimBoolean,
  SimFile,
  SimParameter,
  SimRunSelector
} from './settings-components';
import Button from '@/components/ui/button';
import ZoneActions from './zone-actions';
import {
  formatDateDisplay,
  getInclusiveEndDateIso,
  getStateFromCBG,
  toSimulationDateParam
} from '@/lib/simulation-zone';

interface SimSettingsProps {
  sendData: () => void;
  error: string | null;
  loading: boolean;
  progress: number;
  progressMessage: string | null;
}

type PatternAvailabilityData = {
  state: string;
  available_months: string[];
  required_months: string[];
  missing_months: string[];
  has_any_data: boolean;
  has_coverage: boolean;
};

type PatternAvailabilityState =
  | { status: 'idle' | 'loading' | 'error' }
  | { status: 'ready'; data: PatternAvailabilityData };

function formatMonthList(months?: string[]): string {
  return months?.length ? months.join(', ') : '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

async function readJsonObject(
  response: Response
): Promise<Record<string, unknown> | null> {
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.toLowerCase().includes('application/json')) {
    return null;
  }

  const payload = await response.json().catch(() => null);
  return isRecord(payload) ? payload : null;
}

function getResponseErrorMessage(
  response: Response,
  payload: Record<string, unknown> | null,
  fallback: string
) {
  if (typeof payload?.message === 'string' && payload.message.trim()) {
    return payload.message;
  }

  if (typeof payload?.error === 'string' && payload.error.trim()) {
    return payload.error;
  }

  return response.status === 404
    ? 'Pattern availability endpoint was not found on the deployed Algorithms service.'
    : fallback;
}

export default function SimSettings({
  sendData,
  error,
  loading,
  progress,
  progressMessage
}: SimSettingsProps) {
  const zone = useSimSettings((state) => state.zone);
  const hours = useSimSettings((state) => state.hours);
  const randseed = useSimSettings((state) => state.randseed);
  const sim_id = useSimSettings((state) => state.sim_id);
  const initialInfectedCount = useSimSettings(
    (state) => state.initial_infected_count
  );
  const setSettings = useSimSettings((state) => state.setSettings);
  const router = useRouter();
  const [patternAvailability, setPatternAvailability] =
    useState<PatternAvailabilityState>({ status: 'idle' });
  const [locations, setLocations] = useState<ConvenienceZone[]>([]);

  const detectedState = getStateFromCBG(zone?.cbg_list);
  const endDateIso = getInclusiveEndDateIso(zone?.start_date, hours);
  const startDateParam = toSimulationDateParam(zone?.start_date);
  const endDateParam = toSimulationDateParam(endDateIso);

  const updateZone = useCallback(
    (nextZone: ConvenienceZone) => {
      const currentZone = useSimSettings.getState().zone;
      const zoneChanged = currentZone?.id !== nextZone.id;

      setSettings({
        zone: nextZone,
        ...(zoneChanged ? { hours: nextZone.length } : {})
      });
    },
    [setSettings]
  );

  useEffect(() => {
    if (zone && hours > zone.length) setSettings({ hours: zone.length });
  }, [zone, hours, setSettings]);

  useEffect(() => {
    const state = detectedState;
    const startDate = startDateParam;
    const endDate = endDateParam;

    if (!state || !startDate || !endDate) {
      setPatternAvailability({ status: 'idle' });
      return undefined;
    }

    const availabilityParams = new URLSearchParams({
      state,
      start_date: startDate,
      end_date: endDate
    });

    const algUrl = process.env.NEXT_PUBLIC_ALG_URL;
    if (!algUrl) {
      setPatternAvailability({ status: 'error' });
      return undefined;
    }

    const controller = new AbortController();

    async function loadPatternAvailability() {
      setPatternAvailability({ status: 'loading' });

      try {
        const response = await fetch(
          `${algUrl}pattern-availability?${availabilityParams.toString()}`,
          { signal: controller.signal }
        );
        const json = await readJsonObject(response);

        if (!response.ok) {
          const message = getResponseErrorMessage(
            response,
            json,
            `Pattern availability request failed with status ${response.status}`
          );
          throw new Error(
            message
          );
        }

        if (!isRecord(json?.data)) {
          throw new Error(
            'Algorithms service returned invalid pattern availability data'
          );
        }

        setPatternAvailability({
          status: 'ready',
          data: json.data as PatternAvailabilityData
        });
      } catch (error) {
        if ((error as Error).name === 'AbortError') {
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
        message: `State detected: ${detectedState}`
      };
    }

    if (patternAvailability.status === 'loading') {
      return {
        tone: 'text-gray-500',
        message: `Checking pattern data for ${detectedState}...`
      };
    }

    if (patternAvailability.status === 'error') {
      return {
        tone: 'text-gray-500',
        message: `State detected: ${detectedState} (pattern availability check unavailable)`
      };
    }

    if (patternAvailability.status !== 'ready') {
      return null;
    }

    const availableMonths = formatMonthList(patternAvailability.data.available_months);

    if (patternAvailability.data.has_any_data) {
      return {
        tone: 'text-green-600',
        message: availableMonths
          ? `Pattern data available for ${detectedState} (${availableMonths})`
          : `Pattern data available for ${detectedState}`
      };
    }

    return {
      tone: 'text-amber-600',
      message: `No pattern data found for ${detectedState} — simulation may fail`
    };
  })();

  return (
    <div className="flex flex-col items-center gap-7 w-full">
      <div className="sim_data_row">
        <div className="sim_data_col">
          <div className="sim_data_col_label">
            <span className="sim_data_col_label_num">1</span>
            <span>Pick a convenience zone</span>
          </div>
          <CzDict
            zone={zone}
            setZone={updateZone}
            locations={locations}
            setLocations={setLocations}
          />
        </div>
        <div className="sim_data_col">
          <div className="sim_data_col_label">
            <span className="sim_data_col_label_num">2</span>
            <span>Or open a previous run</span>
          </div>
          <SimRunSelector
            czone_id={zone?.id}
            sim_id={sim_id}
            callback={(sim_id) => setSettings({ sim_id })}
          />
        </div>
      </div>

      <ZoneActions
        zone={zone}
        setZone={updateZone}
        locations={locations}
        setLocations={setLocations}
      />

      {(zone?.start_date || patternStatus) && (
        <div className="flex flex-col items-center gap-2">
          {zone?.start_date && (
            <div className="sim_date_range">
              <span className="sim_date_range_label">Date range:</span>
              <span>
                {formatDateDisplay(zone.start_date)} → {formatDateDisplay(endDateIso)}
              </span>
              <span className="sim_date_range_days">
                ({zone.length ? Math.round(zone.length / 24) : '?'} days)
              </span>
            </div>
          )}
          {patternStatus && (
            <div className={`text-xs ${patternStatus.tone}`}>
              {patternStatus.message}
            </div>
          )}
        </div>
      )}

      <div className="sim_section">
        <h2 className="sim_section_title">Parameters</h2>
        <div className="sim_settings_row">
          <SimParameter
            label={'Simulation Length'}
            value={hours}
            callback={(hours) => setSettings({ hours })}
            min={24}
            max={zone?.length ?? 168}
            percent={false}
            units=" hours"
          />
          <SimBoolean
            label={'Random Seed'}
            value={randseed}
            callback={(randseed) => setSettings({ randseed })}
          />
          <SimParameter
            label={'Initial Infected'}
            value={initialInfectedCount}
            callback={(initial_infected_count) =>
              setSettings({ initial_infected_count })
            }
            min={1}
            max={Math.min(100, zone?.size ?? 100)}
            percent={false}
            units=" people"
          />
          <SimFile label={'Custom DMP Matrix Files'} callback={console.log} />
        </div>
      </div>

      <div className="sim_section">
        <h2 className="sim_section_title">Interventions</h2>
        <InterventionTimeline />
      </div>

      <div className="flex flex-col items-center gap-6 w-full">
        <Button
          variant="primary"
          className="px-8! py-2.5! text-sm font-medium disabled:bg-gray-400!"
          disabled={loading || (!!zone && zone.ready === false)}
          onClick={() => {
            if (!zone) {
              alert('Please pick a convenience zone first.');
              return;
            }
            if (sim_id) {
              router.push(`/simulator/${sim_id}`);
              return;
            }
            sendData();
          }}
        >
          {loading
            ? 'Processing…'
            : zone?.ready === false
              ? 'Generating…'
              : sim_id
                ? 'Open run →'
                : 'Simulate →'}
        </Button>
        {loading && (
          <div className="sim_progress">
            <div className="sim_progress_track">
              <div className="sim_progress_fill" style={{ width: `${progress}%` }} />
            </div>
            <p className="sim_progress_label">
              {progressMessage || 'Starting…'}
              {progress > 0 ? ` · ${progress}%` : ''}
            </p>
          </div>
        )}
        {error && <div className="sim_error">{error}</div>}
      </div>
    </div>
  );
}
