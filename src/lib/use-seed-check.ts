'use client';

import { useCallback, useEffect, useReducer, useRef } from 'react';
import { type ProgressUpdate, runSimulation } from './simulation-runner-client';
import { fetchDefaultMatrixId, fetchRunInfo } from './seed-check-client';
import {
  buildRerunSettings,
  IDLE,
  RERUN_DEFAULTS,
  RERUN_COUNT,
  rowFromRunInfo,
  type SeedCheckState,
  seedCheckReducer
} from './seed-check';

function messageOf(error: unknown) {
  if (error instanceof TypeError) {
    // fetch() itself failed: the server did not answer.
    return 'The simulation server did not answer.';
  }
  return error instanceof Error && error.message
    ? error.message
    : 'The check failed.';
}

// Runs the settings of the run `simId` again RERUN_COUNT times, one after
// another, each with a fresh random seed, and keeps one row per run. Nothing
// starts until `start` is called. The state belongs to the run it was started
// for: another run, or leaving the page, cancels it (the run that is already
// going keeps going on the server and is saved; no further one is started).
export function useSeedCheck(
  simId: number | null,
  ignorePlaceIds?: ReadonlySet<string>
) {
  const [state, dispatch] = useReducer(seedCheckReducer, IDLE);
  // Bumped by every start, stop, change of run and unmount; a loop only
  // continues while its own number is still current.
  const generation = useRef(0);
  // Read when a run finishes, so a new set never restarts anything.
  const ignoreRef = useRef(ignorePlaceIds);
  ignoreRef.current = ignorePlaceIds;

  // biome-ignore lint/correctness/useExhaustiveDependencies: simId is the trigger, a run switch must cancel and clear
  useEffect(() => {
    generation.current += 1;
    dispatch({ type: 'reset' });
    return () => {
      generation.current += 1;
    };
  }, [simId]);

  const start = useCallback(async () => {
    if (simId == null) {
      return;
    }
    generation.current += 1;
    const mine = generation.current;
    const alive = () => generation.current === mine;
    dispatch({ type: 'begin', simId });
    try {
      const info = await fetchRunInfo(simId);
      if (!alive()) return;
      const first = rowFromRunInfo(simId, info, ignoreRef.current);
      if (first === null) {
        throw new Error('This run has no usable infection counts.');
      }
      const defaultMatrixId = await fetchDefaultMatrixId();
      if (!alive()) return;
      const built = buildRerunSettings(info, RERUN_DEFAULTS, {
        defaultMatrixId
      });
      if (!built.ok) {
        throw new Error(built.reason);
      }
      dispatch({ type: 'first-row', simId, row: first });
      for (let index = 0; index < RERUN_COUNT; index += 1) {
        if (!alive()) return;
        const newId = await runSimulation(
          built.settings,
          ({ value, message }: ProgressUpdate) => {
            if (alive()) dispatch({ type: 'progress', simId, value, message });
          }
        );
        if (!alive()) return;
        const row = rowFromRunInfo(
          newId,
          await fetchRunInfo(newId),
          ignoreRef.current
        );
        if (row === null) {
          throw new Error(`Run ${newId} has no usable infection counts.`);
        }
        if (!alive()) return;
        dispatch({ type: 'run-done', simId, row });
      }
    } catch (error) {
      if (alive()) {
        dispatch({ type: 'fail', simId, message: messageOf(error) });
      }
    }
  }, [simId]);

  const stop = useCallback(() => {
    if (simId == null) {
      return;
    }
    generation.current += 1;
    dispatch({ type: 'stop', simId });
  }, [simId]);

  // Shown only for the run it was started for.
  const shown: SeedCheckState =
    state.status !== 'idle' && state.simId === simId ? state : IDLE;
  return { state: shown, start, stop };
}
