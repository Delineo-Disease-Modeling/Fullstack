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

  const detectedState = getStateFromCBG(zone?.cbg_list);
  const endDateIso = getInclusiveEndDateIso(zone?.start_date, hours);
  const startDateParam = toSimulationDateParam(zone?.start_date);
  const endDateParam = toSimulationDateParam(endDateIso);

  const updateZone = useCallback(
    (zone: ConvenienceZone) => setSettings({ zone }),
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

    const coveredMonths = formatMonthList(
      patternAvailability.data.required_months?.length
        ? patternAvailability.data.required_months
        : patternAvailability.data.available_months
    );

    if (patternAvailability.data.has_coverage) {
      return {
        tone: 'text-green-600',
        message: coveredMonths
          ? `Pattern data available for ${detectedState} (${coveredMonths})`
          : `Pattern data available for ${detectedState}`
      };
    }

    const missingMonths = formatMonthList(patternAvailability.data.missing_months);
    return {
      tone: 'text-amber-600',
      message: missingMonths
        ? `Missing pattern data for ${detectedState}: ${missingMonths}`
        : `No pattern data available for ${detectedState}`
    };
  })();

  const patternBlocksSimulation =
    !!zone &&
    sim_id === null &&
    !!detectedState &&
    !!startDateParam &&
    !!endDateParam &&
    patternAvailability.status === 'ready' &&
    !patternAvailability.data.has_coverage;

  return (
    <div className="flex flex-col items-center gap-16">
      <CzDict zone={zone} setZone={updateZone} />

      {zone?.start_date && (
        <div className="text-sm text-gray-600 -mt-10">
          <span className="font-medium">Date Range:</span>{' '}
          {formatDateDisplay(zone.start_date)} to {formatDateDisplay(endDateIso)}
          <span className="text-xs text-gray-400 ml-2">
            ({zone.length ? Math.round(zone.length / 24) : '?'} days)
          </span>
        </div>
      )}

      {patternStatus && (
        <div className={`text-xs -mt-12 ${patternStatus.tone}`}>
          {patternStatus.message}
        </div>
      )}

      <div className="flex flex-wrap justify-center gap-8">
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

      <InterventionTimeline />

      <div className="relative flex items-center w-96 max-w-[90vw]">
        <div className="grow border-t border-(--color-border-dark)"></div>
        <span className="mx-4">or</span>
        <div className="grow border-t border-(--color-border-dark)"></div>
      </div>

      <SimRunSelector
        czone_id={zone?.id}
        sim_id={sim_id}
        callback={(sim_id) => setSettings({ sim_id })}
      />

      <div className="flex flex-col items-center gap-8 w-full">
        <Button
          className="w-32 disabled:bg-gray-400!"
          disabled={loading || patternBlocksSimulation}
          onClick={() => {
            if (!zone) {
              alert('Please pick a convenience zone first.');
              return;
            }
            if (!zone.ready) {
              alert(
                'This convenience zone is still generating. Try again in a moment.'
              );
              return;
            }
            if (sim_id) {
              router.push(`/simulator/${sim_id}`);
              return;
            }
            if (detectedState && startDateParam && endDateParam) {
              if (
                patternAvailability.status === 'ready' &&
                !patternAvailability.data.has_coverage
              ) {
                const missingMonths =
                  patternAvailability.data.missing_months?.join(', ') ||
                  'the selected date range';
                alert(
                  `Simulation blocked: missing pattern data for ${missingMonths}.`
                );
                return;
              }
            }
            sendData();
          }}
        >
          {loading ? 'Processing...' : 'Simulate'}
        </Button>
        {loading && (
          <div className="w-80 max-w-[85vw] flex flex-col gap-1">
            <div className="w-full h-3 bg-(--color-bg-dark) rounded-full overflow-hidden">
              <div
                className="h-full bg-(--color-primary-blue) rounded-full transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-sm text-center text-gray-400">
              {progressMessage || 'Starting...'}
              {progress > 0 ? ` ${progress}%` : ''}
            </p>
          </div>
        )}
        {error && (
          <div className="text-red-500 text-sm max-w-md text-center">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
