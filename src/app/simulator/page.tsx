'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import InstructionBanner from '@/components/instruction-banner';
import SimSettings from '@/components/simsettings';
import {
  type ProgressUpdate,
  runSimulation
} from '@/lib/simulation-runner-client';
import useMapData from '@/stores/mapdata';
import useSimSettings, {
  DEFAULT_INTERVENTION_VALUES,
  type SimSettings as SimSettingsState
} from '@/stores/simsettings';
import '@/styles/simulator.css';

export default function Simulator() {
  const router = useRouter();

  const setSettings = useSimSettings((state) => state.setSettings);
  const setSimData = useMapData((state) => state.setSimData);
  const setRunName = useMapData((state) => state.setName);

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState<string | null>(null);
  const [progressPhase, setProgressPhase] = useState<string | null>(null);

  useEffect(() => {
    setSettings({ sim_id: null });
  }, [setSettings]);

  // "Visit a previous run" shortcut: a run was already selected, so just load
  // its cached data into the map store and let the caller navigate.
  const reloadExistingRun = async (simId: number): Promise<boolean> => {
    try {
      const res = await fetch(`/api/simdata/${simId}`);
      if (!res.ok) {
        throw new Error(`Invalid simdata response ${res.status}`);
      }
      const json = await res.json();
      setSimData(json.data.simdata);
      setRunName(json.data.name);
      return true;
    } catch (error) {
      console.error(error);
      setError('Failed to load simulation data. Please try again.');
      return false;
    }
  };

  const sendSimulatorData = async () => {
    setError(null);
    setLoading(true);
    setProgress(0);
    setProgressMessage(null);
    setProgressPhase(null);

    try {
      const settings = useSimSettings.getState();

      // Already-selected run → reload and navigate (no new simulation).
      if (settings.sim_id !== null) {
        if (await reloadExistingRun(settings.sim_id)) {
          router.push(`/simulator/${settings.sim_id}`);
        }
        return;
      }

      const compareBaseline = settings.compareBaseline;
      const onProgress = ({ value, message }: ProgressUpdate) => {
        if (value !== undefined) setProgress(value);
        if (message !== undefined) setProgressMessage(message);
      };

      // Run 1 — with the configured interventions (the primary run).
      if (compareBaseline) {
        setProgressPhase('Running simulation 1 of 2 — with interventions');
      }
      const interventionId = await runSimulation(settings, onProgress);

      // Run 2 — baseline: same settings, interventions reset to the zero seed.
      let baselineId: number | null = null;
      if (compareBaseline) {
        setProgressPhase(
          'Running simulation 2 of 2 — baseline (no interventions)'
        );
        setProgress(0);
        setProgressMessage('Starting baseline simulation...');
        const baselineSettings: SimSettingsState = {
          ...settings,
          interventions: [{ time: 0, ...DEFAULT_INTERVENTION_VALUES }]
        };
        baselineId = await runSimulation(baselineSettings, onProgress);
      }

      setSettings({ sim_id: interventionId });
      router.push(
        baselineId
          ? `/simulator/${interventionId}?baseline=${baselineId}`
          : `/simulator/${interventionId}`
      );
    } catch (e) {
      console.error(e);
      setError(`Failed to start simulation: ${(e as Error).message}`);
    } finally {
      setLoading(false);
      setProgressPhase(null);
    }
  };

  return (
    <div className="sim_container">
      <div className="sim_header" data-aos="fade-up" data-aos-once="true">
        <h1 className="sim_title">Run a simulation</h1>
        <p className="sim_lede">
          Pick or generate a Convenience Zone, tune the disease and intervention
          parameters, then run the simulation.
        </p>
      </div>
      <div
        className="sim_settings px-4"
        data-aos="fade-up"
        data-aos-once="true"
        data-aos-delay="80"
      >
        <InstructionBanner>
          Generate a Convenience Zone or pick one that&apos;s already generated,
          then click &lsquo;Simulate&rsquo; to begin.
        </InstructionBanner>
        <SimSettings
          sendData={sendSimulatorData}
          error={error}
          loading={loading}
          progress={progress}
          progressMessage={progressMessage}
          progressPhase={progressPhase}
        />
      </div>
    </div>
  );
}
