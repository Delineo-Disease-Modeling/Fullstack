'use client';

import dynamic from 'next/dynamic';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import ComparisonSummary from '@/components/comparison-summary';
import EditDeleteActions from '@/components/edit-delete-actions';
import InstructionBanner from '@/components/instruction-banner';
import LoginModal from '@/components/login-modal';
import OutputGraphs from '@/components/outputgraphs';
import PersonPathPanel from '@/components/person-path-panel';
import PoiRankings from '@/components/poi-rankings';
import { useSession } from '@/lib/auth-client';
import {
  type ProgressUpdate,
  runSimulation
} from '@/lib/simulation-runner-client';
import useMapData, { type PapData, type SimData } from '@/stores/mapdata';
import useSimSettings, {
  type SimSettings as SimSettingsState
} from '@/stores/simsettings';
import '@/styles/simulator.css';
import '@/styles/settings-components.css';
import Button from '@/components/ui/button';

const ModelMap = dynamic(() => import('@/components/modelmap'), { ssr: false });

interface SelectedLoc {
  id: string;
  label: string;
  type: string;
}

// The map-store fields that differ between the intervention and baseline runs.
// Held in local state so the toggle can swap them without re-fetching.
interface SimRunData {
  simdata: SimData | null;
  papdata: PapData | null;
  hotspots: { [key: string]: number[] } | null;
  metadata?: unknown;
}

type RunView = 'intervention' | 'baseline' | 'disabled';

function getDisabledPoiIdsFromMetadata(metadata: unknown) {
  if (!metadata || typeof metadata !== 'object') {
    return [];
  }

  const ids = (metadata as Record<string, unknown>).disabled_poi_ids;
  if (!Array.isArray(ids)) {
    return [];
  }

  return ids.map((id) => String(id).trim()).filter(Boolean);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : null;
}

function getStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return null;
  }
  const strings = value.map((item) => String(item).trim()).filter(Boolean);
  return strings.length > 0 ? strings : null;
}

function getModelPaths(value: unknown) {
  const record = asRecord(value);
  if (!record) {
    return null;
  }
  const paths: Record<string, string | null> = {};
  for (const [variant, path] of Object.entries(record)) {
    if (path === null || typeof path === 'string') {
      paths[variant] = path;
    }
  }
  return paths;
}

function getInterventions(
  value: unknown
): SimSettingsState['interventions'] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const interventions = value.filter((item) => {
    const record = asRecord(item);
    return (
      record &&
      ['time', 'mask', 'vaccine', 'capacity', 'lockdown', 'selfiso'].every(
        (key) => typeof record[key] === 'number'
      )
    );
  }) as SimSettingsState['interventions'];
  return interventions.length > 0 ? interventions : null;
}

function getRunSettingsFromMetadata(
  metadata: unknown,
  fallback: SimSettingsState
): Partial<SimSettingsState> {
  const record = asRecord(metadata);
  if (!record) {
    return {};
  }

  const dmpMode =
    record.dmp_mode === 'required' || record.dmp_mode === 'off'
      ? record.dmp_mode
      : record.dmp_mode === 'auto'
        ? 'auto'
        : null;

  return {
    disease_name:
      typeof record.disease_name === 'string'
        ? record.disease_name
        : fallback.disease_name,
    variants: getStringArray(record.variants) ?? fallback.variants,
    dmp_mode: dmpMode ?? fallback.dmp_mode,
    model_path_by_variant:
      getModelPaths(record.model_path_by_variant) ??
      fallback.model_path_by_variant,
    initial_infected_count:
      typeof record.initial_infected_count === 'number'
        ? record.initial_infected_count
        : fallback.initial_infected_count,
    randseed:
      typeof record.randseed === 'boolean'
        ? record.randseed
        : fallback.randseed,
    interventions:
      getInterventions(record.interventions) ?? fallback.interventions
  };
}

export default function SimulatorRun() {
  const { run_id } = useParams<{ run_id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const sim_id = useSimSettings((state) => state.sim_id);
  const zone = useSimSettings((state) => state.zone);
  const runName = useMapData((state) => state.name);

  const setSettings = useSimSettings((state) => state.setSettings);
  const setSimData = useMapData((state) => state.setSimData);
  const setPapData = useMapData((state) => state.setPapData);
  const setHotspots = useMapData((state) => state.setHotspots);
  const setRunName = useMapData((state) => state.setName);

  const { data: session } = useSession();
  const user = session?.user;

  const [selectedZone, setSelectedZone] = useState<typeof zone>(null);
  const [selectedLoc, setSelectedLoc] = useState<SelectedLoc | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(0);
  const [loginOpen, setLoginOpen] = useState(false);

  // Comparison mode: `?baseline=<id>` pairs this (intervention) run with a
  // no-intervention baseline run over the same zone.
  const baselineParam = Number(searchParams.get('baseline'));
  const baselineId =
    Number.isFinite(baselineParam) && baselineParam > 0 ? baselineParam : null;
  const disabledParam = Number(searchParams.get('disabled'));
  const disabledSimId =
    Number.isFinite(disabledParam) && disabledParam > 0 ? disabledParam : null;
  const interventionSimId = Number(run_id);

  const [interventionPayload, setInterventionPayload] =
    useState<SimRunData | null>(null);
  const [baselinePayload, setBaselinePayload] = useState<SimRunData | null>(
    null
  );
  const [disabledPayload, setDisabledPayload] = useState<SimRunData | null>(
    null
  );
  const [activeView, setActiveView] = useState<RunView>('intervention');
  const [disabledPoiIds, setDisabledPoiIds] = useState<Set<string>>(
    () => new Set()
  );
  const [disabledCategories, setDisabledCategories] = useState<Set<string>>(
    () => new Set()
  );
  const [disabledRunLoading, setDisabledRunLoading] = useState(false);
  const [disabledRunProgress, setDisabledRunProgress] = useState(0);
  const [disabledRunMessage, setDisabledRunMessage] = useState<string | null>(
    null
  );
  const [disabledRunError, setDisabledRunError] = useState<string | null>(null);

  const activeSimId =
    activeView === 'disabled' && disabledSimId != null
      ? disabledSimId
      : activeView === 'baseline' && baselineId != null
        ? baselineId
        : interventionSimId;

  // Swap which run drives the map. setSimData merges by default, so clear it
  // first to guarantee a clean replace rather than a union of both timelines.
  const showRun = useCallback(
    (view: RunView) => {
      const payload = {
        intervention: interventionPayload,
        baseline: baselinePayload,
        disabled: disabledPayload
      }[view];
      if (!payload) return;
      setSimData(null);
      setSimData(payload.simdata);
      setHotspots(payload.hotspots ?? {});
      setPapData(payload.papdata);
      setActiveView(view);
    },
    [
      baselinePayload,
      disabledPayload,
      interventionPayload,
      setHotspots,
      setPapData,
      setSimData
    ]
  );

  const categoryToPoiIds = useMemo(() => {
    const byCategory = new Map<string, string[]>();
    for (const place of interventionPayload?.papdata?.places ?? []) {
      const category = place.top_category || 'Uncategorized';
      const ids = byCategory.get(category) ?? [];
      ids.push(String(place.id));
      byCategory.set(category, ids);
    }
    return byCategory;
  }, [interventionPayload]);

  const poiToCategory = useMemo(() => {
    const byPoi = new Map<string, string>();
    for (const [category, ids] of categoryToPoiIds) {
      for (const id of ids) {
        byPoi.set(id, category);
      }
    }
    return byPoi;
  }, [categoryToPoiIds]);

  const effectiveDisabledPoiIds = useMemo(() => {
    const ids = new Set(disabledPoiIds);
    for (const category of disabledCategories) {
      for (const id of categoryToPoiIds.get(category) ?? []) {
        ids.add(id);
      }
    }
    return ids;
  }, [categoryToPoiIds, disabledCategories, disabledPoiIds]);

  useEffect(() => {
    if (loading) {
      document.title = 'Loading Simulation | Delineo';
    } else if (selectedZone?.name) {
      document.title = `${selectedZone.name} | Delineo`;
    }
  }, [loading, selectedZone?.name]);

  useEffect(() => {
    const metadataDisabledIds = getDisabledPoiIdsFromMetadata(
      disabledPayload?.metadata
    );
    if (metadataDisabledIds.length === 0) {
      return;
    }
    setDisabledCategories(new Set());
    setDisabledPoiIds(new Set(metadataDisabledIds));
  }, [disabledPayload?.metadata]);

  useEffect(() => {
    if (!run_id) {
      router.replace('/simulator');
      return;
    }

    const controller = new AbortController();
    const { signal } = controller;

    const loadRun = async () => {
      setLoading(true);
      setProgress(0);
      setSimData(null);
      setPapData(null);
      setError(null);
      setInterventionPayload(null);
      setBaselinePayload(null);
      setDisabledPayload(null);
      setDisabledCategories(new Set());
      setDisabledPoiIds(new Set());
      setActiveView('intervention');

      try {
        // Poll until the map cache is ready (API returns 202 with progress while processing)
        let response: Response;
        while (true) {
          response = await fetch(`/api/simdata/${run_id}`, { signal });
          if (response.status !== 202) break;
          const status = await response.json();
          if (typeof status.progress === 'number') {
            setProgress(status.progress);
          }
          await new Promise((r) => setTimeout(r, 2000));
        }
        if (!response.ok) throw new Error('Run not found');

        const reader = response.body?.getReader();
        if (!reader) throw new Error('No response body');
        const decoder = new TextDecoder();

        let totalSteps = 0;
        let fullJsonString = '';
        let maxTimestamp = 0;
        let tail = '';

        while (true) {
          const { done, value } = await reader.read();

          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          fullJsonString += chunk;

          const textToScan = tail + chunk;
          tail = chunk.slice(-50);

          if (totalSteps === 0) {
            const lengthMatch = textToScan.match(/"length":\s*(\d+)/);
            if (lengthMatch) {
              totalSteps = parseInt(lengthMatch[1], 10);
            }
          }

          if (totalSteps > 0) {
            const matches = [...textToScan.matchAll(/"(\d+)":\{"(?:h|p)"/g)];

            for (const match of matches) {
              const ts = parseInt(match[1], 10);
              if (!Number.isNaN(ts)) {
                maxTimestamp = Math.max(maxTimestamp, ts);
              }
            }

            if (maxTimestamp > 0) {
              const currentProgress = Math.min(
                100,
                Math.round((maxTimestamp / totalSteps) * 100)
              );
              setProgress((old) => Math.max(old, currentProgress));
            }
          }
        }

        setProgress(100);

        const simJson = JSON.parse(fullJsonString);
        const {
          simdata,
          name,
          zone: zoneData,
          hotspots,
          papdata,
          metadata
        } = simJson.data;

        setSettings({
          sim_id: +run_id,
          zone: zoneData,
          hours: zoneData.length
        });

        setSelectedZone(zoneData);
        setSimData(simdata);
        setRunName(name);
        setHotspots(hotspots);
        setPapData(papdata);
        setInterventionPayload({ simdata, papdata, hotspots, metadata });

        const loadComparisonPayload = async (
          comparisonId: number,
          label: string
        ): Promise<SimRunData | null> => {
          try {
            let comparisonRes: Response;
            while (true) {
              comparisonRes = await fetch(`/api/simdata/${comparisonId}`, {
                signal
              });
              if (comparisonRes.status !== 202) break;
              await new Promise((r) => setTimeout(r, 2000));
            }
            if (comparisonRes.ok) {
              const comparisonJson = await comparisonRes.json();
              return {
                simdata: comparisonJson.data.simdata,
                papdata: comparisonJson.data.papdata,
                hotspots: comparisonJson.data.hotspots,
                metadata: comparisonJson.data.metadata
              };
            }
            console.error(`${label} run failed to load:`, comparisonRes.status);
          } catch (e) {
            if ((e as Error).name !== 'AbortError') {
              console.error(`Failed to load ${label} run:`, e);
            }
          }
          return null;
        };

        // In comparison mode, load the paired runs too (already cached from the
        // submit step). Best-effort: failures just disable their map toggles.
        if (baselineId != null) {
          const payload = await loadComparisonPayload(baselineId, 'Baseline');
          if (payload) setBaselinePayload(payload);
        }
        if (disabledSimId != null) {
          const payload = await loadComparisonPayload(
            disabledSimId,
            'Disabled-POI comparison'
          );
          if (payload) setDisabledPayload(payload);
        }
      } catch (e) {
        if ((e as Error).name === 'AbortError') {
          return;
        }
        console.error(e);
        setError('Failed to load run from URL.');
      } finally {
        if (!signal.aborted) {
          setLoading(false);
        }
      }
    };

    loadRun();

    return () => {
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    run_id,
    baselineId,
    disabledSimId,
    router.replace,
    setHotspots,
    setPapData,
    setRunName,
    setSettings,
    setSimData
  ]);

  const handleTogglePoi = useCallback(
    (poiId: string) => {
      const category = poiToCategory.get(poiId);
      const categoryIds = category ? categoryToPoiIds.get(category) : undefined;
      const categoryIsDisabled = category
        ? disabledCategories.has(category)
        : false;

      if (category && categoryIsDisabled) {
        setDisabledCategories((previous) => {
          const next = new Set(previous);
          next.delete(category);
          return next;
        });
      }

      setDisabledPoiIds((previous) => {
        const next = new Set(previous);
        if (categoryIsDisabled && categoryIds) {
          for (const id of categoryIds) {
            if (id !== poiId) {
              next.add(id);
            }
          }
          next.delete(poiId);
          return next;
        }

        if (next.has(poiId)) {
          next.delete(poiId);
        } else {
          next.add(poiId);
        }
        return next;
      });
    },
    [categoryToPoiIds, disabledCategories, poiToCategory]
  );

  const handleToggleCategory = useCallback(
    (category: string) => {
      const ids = categoryToPoiIds.get(category) ?? [];

      setDisabledCategories((previous) => {
        const next = new Set(previous);
        if (next.has(category)) {
          next.delete(category);
        } else {
          next.add(category);
        }
        return next;
      });

      setDisabledPoiIds((previous) => {
        const next = new Set(previous);
        for (const id of ids) {
          next.delete(id);
        }
        return next;
      });
    },
    [categoryToPoiIds]
  );

  const handleRunDisabledComparison = useCallback(async () => {
    if (!selectedZone || effectiveDisabledPoiIds.size === 0) {
      return;
    }

    setDisabledRunLoading(true);
    setDisabledRunProgress(0);
    setDisabledRunMessage(null);
    setDisabledRunError(null);

    try {
      const settings = useSimSettings.getState();
      const disabledIds = [...effectiveDisabledPoiIds].sort();
      const comparisonSettings: SimSettingsState = {
        ...settings,
        ...getRunSettingsFromMetadata(interventionPayload?.metadata, settings),
        sim_id: null,
        zone: selectedZone,
        hours: selectedZone.length,
        disabled_poi_ids: disabledIds
      };
      const onProgress = ({ value, message }: ProgressUpdate) => {
        if (value !== undefined) setDisabledRunProgress(value);
        if (message !== undefined) setDisabledRunMessage(message);
      };

      const comparisonId = await runSimulation(comparisonSettings, onProgress);
      const params = new URLSearchParams(searchParams.toString());
      params.set('disabled', String(comparisonId));
      router.push(`/simulator/${interventionSimId}?${params.toString()}`);
    } catch (e) {
      console.error(e);
      setDisabledRunError((e as Error).message || 'Failed to run comparison.');
    } finally {
      setDisabledRunLoading(false);
    }
  }, [
    effectiveDisabledPoiIds,
    interventionPayload?.metadata,
    interventionSimId,
    router,
    searchParams,
    selectedZone
  ]);

  const handleMarkerClick = ({
    id,
    label,
    type
  }: {
    id: string;
    label: string;
    type: string;
  }) => {
    setSelectedLoc({ id, label, type });
  };

  const onReset = () => {
    setSelectedLoc(null);
  };

  if (loading) {
    return (
      <div className="sim_container">
        <div className="flex flex-col items-center gap-4 my-auto">
          <div className="text-lg">Loading simulation data...</div>
          <div className="w-72 rounded-full h-2 bg-(--color-bg-dark)">
            <div
              className="bg-(--color-primary-blue) h-2 rounded-full transition-all duration-100"
              style={{ width: `${Math.max(progress, 2)}%` }}
            />
            <p className="text-sm text-center mt-2">
              {progress > 0 ? `${progress}%` : 'Starting...'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="sim_container">
        <div className="flex flex-col items-center justify-center gap-4 mt-20">
          <div className="text-red-500 text-lg">{error}</div>
          <button
            type="button"
            onClick={() => router.push('/simulator')}
            className="bg-(--color-bg-dark) text-(--color-text-light) w-32 h-12 p-3 rounded-md transition-[200ms] ease-in-out hover:scale-105 cursor-pointer active:brightness-75"
          >
            Return
          </button>
        </div>
      </div>
    );
  }

  if (!selectedZone) {
    return <div className="sim_container">Loading...</div>;
  }

  return (
    <div className="sim_container">
      <div className="sim_output px-4">
        <InstructionBanner text="Tip: Click on a marker in the map below to view its population and infection stats in the charts on the bottom." />
        <div className="flex flex-col gap-4">
          <div className="flex justify-between">
            <span className="flex flex-col gap-1">
              <h2 className="text-xl font-semibold">{selectedZone.name}</h2>
              <p className="text-sm italic text-gray-600">
                Created on:{' '}
                {new Date(selectedZone.created_at).toLocaleDateString()}
              </p>
            </span>

            <span className="flex flex-col gap-1 items-end">
              <h3 className="text-md font-semibold text-(--color-text-dark)">
                {runName || 'Untitled Run'}
              </h3>
              {user ? (
                <EditDeleteActions
                  align="right"
                  fields={[{ key: 'name', label: 'Name' }]}
                  itemName={runName || 'Untitled Run'}
                  getInitialValues={() => ({ name: runName || '' })}
                  onSave={async (values) => {
                    const res = await fetch(`/api/simdata/${sim_id}`, {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ name: values.name.trim() })
                    });

                    if (res.ok) {
                      const json = await res.json();
                      if (json.data?.name) setRunName(json.data.name);
                      return true;
                    }

                    return false;
                  }}
                  onDelete={async () => {
                    const res = await fetch(`/api/simdata/${sim_id}`, {
                      method: 'DELETE'
                    });

                    if (!res.ok) {
                      return false;
                    }

                    setSimData(null);
                    setPapData(null);
                    setRunName('');
                    setSettings({ sim_id: null });
                    router.push('/simulator');
                    return true;
                  }}
                />
              ) : (
                <button
                  type="button"
                  className="text-xs text-(--color-text-muted) hover:underline cursor-pointer"
                  onClick={() => setLoginOpen(true)}
                >
                  Login to edit or delete this run
                </button>
              )}
            </span>
          </div>
          {(baselineId != null || disabledSimId != null) && (
            <ComparisonSummary
              referenceSimId={interventionSimId}
              referenceLabel="Interventions"
              scenarios={[
                ...(baselineId != null
                  ? [{ simId: baselineId, label: 'Baseline' }]
                  : []),
                ...(disabledSimId != null
                  ? [{ simId: disabledSimId, label: 'Disabled POIs' }]
                  : [])
              ]}
            />
          )}
          {(baselineId != null || disabledSimId != null) && (
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-sm text-(--color-text-muted)">
                Map view:
              </span>
              <div className="inline-flex rounded-md border border-(--color-border-light) overflow-hidden">
                <button
                  type="button"
                  className={`px-3 py-1.5 text-sm transition-colors ${
                    activeView === 'intervention'
                      ? 'bg-(--color-primary-blue) text-(--color-text-light)'
                      : 'bg-(--color-bg-ivory) hover:brightness-95'
                  }`}
                  onClick={() => showRun('intervention')}
                >
                  With interventions
                </button>
                {baselineId != null && (
                  <button
                    type="button"
                    disabled={!baselinePayload}
                    className={`px-3 py-1.5 text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                      activeView === 'baseline'
                        ? 'bg-(--color-primary-blue) text-(--color-text-light)'
                        : 'bg-(--color-bg-ivory) hover:brightness-95'
                    }`}
                    onClick={() => showRun('baseline')}
                  >
                    {baselinePayload ? 'Baseline' : 'Baseline (loading...)'}
                  </button>
                )}
                {disabledSimId != null && (
                  <button
                    type="button"
                    disabled={!disabledPayload}
                    className={`px-3 py-1.5 text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                      activeView === 'disabled'
                        ? 'bg-(--color-primary-blue) text-(--color-text-light)'
                        : 'bg-(--color-bg-ivory) hover:brightness-95'
                    }`}
                    onClick={() => showRun('disabled')}
                  >
                    {disabledPayload
                      ? 'Disabled POIs'
                      : 'Disabled POIs (loading...)'}
                  </button>
                )}
              </div>
            </div>
          )}
          <ModelMap
            key={activeSimId}
            selectedZone={selectedZone}
            simId={activeSimId}
            disabledPoiIds={effectiveDisabledPoiIds}
            onMarkerClick={handleMarkerClick}
          />
          <PersonPathPanel simId={activeSimId} />
        </div>

        <InstructionBanner text="Use the time slider or play button to navigate through the simulation timeline." />

        <OutputGraphs
          simId={interventionSimId}
          baselineSimId={baselineId}
          disabledPoiSimId={disabledSimId}
          selected_loc={selectedLoc}
          onReset={onReset}
        />

        <PoiRankings
          onSelectPoi={handleMarkerClick}
          disabledPoiIds={effectiveDisabledPoiIds}
          disabledCategories={disabledCategories}
          effectiveDisabledPoiCount={effectiveDisabledPoiIds.size}
          onTogglePoi={handleTogglePoi}
          onToggleCategory={handleToggleCategory}
          onRunDisabledComparison={handleRunDisabledComparison}
          disabledComparisonRunning={disabledRunLoading}
          disabledComparisonProgress={disabledRunProgress}
          disabledComparisonMessage={disabledRunMessage}
          disabledComparisonError={disabledRunError}
        />
      </div>
      <Button className="w-32" onClick={() => router.push('/simulator')}>
        Return
      </Button>
      <LoginModal
        isOpen={loginOpen}
        onRequestClose={() => setLoginOpen(false)}
      />
    </div>
  );
}
