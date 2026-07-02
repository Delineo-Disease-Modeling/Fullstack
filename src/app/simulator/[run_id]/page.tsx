'use client';

import dynamic from 'next/dynamic';
import { ArrowLeft, Check, Save } from 'lucide-react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ComparisonSummary from '@/components/comparison-summary';
import EditDeleteActions from '@/components/edit-delete-actions';
import LoginModal from '@/components/login-modal';
import OutputGraphs from '@/components/outputgraphs';
import PersonPathPanel from '@/components/person-path-panel';
import PoiRankings from '@/components/poi-rankings';
import { useSession } from '@/lib/auth-client';
import {
  type ProgressUpdate,
  runSimulation
} from '@/lib/simulation-runner-client';
import useMapData from '@/stores/mapdata';
import useSimSettings, {
  type SimSettings as SimSettingsState
} from '@/stores/simsettings';
import '@/styles/simulator.css';
import '@/styles/settings-components.css';
import Button from '@/components/ui/button';
import {
  EMPTY_DISABLED_POI_IDS,
  formatRunDate,
  getDisabledPoiIdsFromMetadata,
  getRunSettingsFromMetadata,
  getSeedCbgIdsForRun,
  getSeedRegionLookupQueryForRun,
  RUN_VIEW_LABELS,
  type RunView,
  type SelectedLoc,
  type SimRunData
} from './run-metadata';

const ModelMap = dynamic(() => import('@/components/modelmap'), { ssr: false });

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
  const setTimesteps = useMapData((state) => state.setTimesteps);
  const setPoiPeaks = useMapData((state) => state.setPoiPeaks);
  const setIncidence = useMapData((state) => state.setIncidence);
  const setRunName = useMapData((state) => state.setName);

  const { data: session } = useSession();
  const user = session?.user;

  const [selectedZone, setSelectedZone] = useState<typeof zone>(null);
  const [selectedLoc, setSelectedLoc] = useState<SelectedLoc | null>(null);
  const [focusPoi, setFocusPoi] = useState<{ id: string; nonce: number } | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(0);
  const [loginOpen, setLoginOpen] = useState(false);

  // Whether this run is kept (listed in "Visit a Previous Run"). Unsaved runs
  // are reachable by URL but pruned by the cleanup job after a TTL.
  const [isSaved, setIsSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

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
  const [resolvedSeedRegionCbgIds, setResolvedSeedRegionCbgIds] = useState<
    string[]
  >([]);
  // Set when the user kicks off a disabled rerun, so the page auto-switches to
  // the rerouted run once its payload loads instead of leaving them on the
  // original (un-rerouted) run with a stale view.
  const autoShowDisabledRef = useRef(false);

  const activeSimId =
    activeView === 'disabled' && disabledSimId != null
      ? disabledSimId
      : activeView === 'baseline' && baselineId != null
        ? baselineId
        : interventionSimId;
  const hasComparisonRuns = baselineId != null || disabledSimId != null;
  const activeViewLabel = RUN_VIEW_LABELS[activeView];
  const activeRunMetadata =
    activeView === 'disabled'
      ? disabledPayload?.metadata
      : activeView === 'baseline'
        ? baselinePayload?.metadata
        : interventionPayload?.metadata;
  const seedCbgIds = useMemo(
    () => getSeedCbgIdsForRun(selectedZone, activeRunMetadata),
    [activeRunMetadata, selectedZone]
  );
  const seedRegionLookupQuery = useMemo(
    () => getSeedRegionLookupQueryForRun(selectedZone, activeRunMetadata),
    [activeRunMetadata, selectedZone]
  );
  const effectiveSeedCbgIds = useMemo(
    () =>
      resolvedSeedRegionCbgIds.length > seedCbgIds.length
        ? resolvedSeedRegionCbgIds
        : seedCbgIds,
    [resolvedSeedRegionCbgIds, seedCbgIds]
  );

  // Keep this run (and its baseline/disabled companions, so the comparison
  // survives) by marking them saved.
  const handleSaveRun = useCallback(async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const ids = [interventionSimId];
      if (baselineId != null) ids.push(baselineId);
      if (disabledSimId != null) ids.push(disabledSimId);
      const results = await Promise.all(
        ids.map((id) =>
          fetch(`/api/simdata/${id}/save`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ saved: true })
          })
        )
      );
      if (results.some((r) => !r.ok)) {
        throw new Error('One or more runs could not be saved.');
      }
      setIsSaved(true);
    } catch (e) {
      console.error(e);
      setSaveError('Could not save this run. Please try again.');
    } finally {
      setSaving(false);
    }
  }, [interventionSimId, baselineId, disabledSimId]);

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
      setTimesteps(payload.timesteps);
      setPoiPeaks(payload.poiPeaks);
      setIncidence(payload.incidence);
      setPapData(payload.papdata);
      setActiveView(view);
    },
    [
      baselinePayload,
      disabledPayload,
      interventionPayload,
      setHotspots,
      setIncidence,
      setPoiPeaks,
      setPapData,
      setSimData,
      setTimesteps
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
    setResolvedSeedRegionCbgIds([]);
    if (!seedRegionLookupQuery || seedCbgIds.length > 1) {
      return;
    }

    const controller = new AbortController();
    fetch('/api/lookup-location', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ location: seedRegionLookupQuery }),
      signal: controller.signal
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (controller.signal.aborted) {
          return;
        }
        const seedCbgs = Array.isArray(data?.seed_cbgs)
          ? data.seed_cbgs.filter((cbg: unknown): cbg is string => {
              return typeof cbg === 'string' && cbg.trim().length > 0;
            })
          : [];
        setResolvedSeedRegionCbgIds(seedCbgs);
      })
      .catch((error) => {
        if ((error as Error)?.name !== 'AbortError') {
          console.warn('Failed to resolve seed region CBGs:', error);
        }
      });

    return () => {
      controller.abort();
    };
  }, [seedCbgIds.length, seedRegionLookupQuery]);

  // After a disabled rerun completes and its payload loads, switch the map to
  // the rerouted run so the user sees the actual effect of disabling rather
  // than the original run with a (now-gated) disabled overlay.
  useEffect(() => {
    if (autoShowDisabledRef.current && disabledPayload) {
      autoShowDisabledRef.current = false;
      showRun('disabled');
    }
  }, [disabledPayload, showRun]);

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
      setTimesteps(null);
      setPoiPeaks(null);
      setIncidence(null);
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
          response = await fetch(`/api/simdata/${run_id}/map`, { signal });
          if (response.status !== 202) break;
          const status = await response.json();
          if (typeof status.progress === 'number') {
            setProgress(status.progress);
          }
          await new Promise((r) => setTimeout(r, 2000));
        }
        if (!response.ok) throw new Error('Run not found');

        setProgress(100);

        const {
          name,
          saved,
          zone: zoneData,
          hotspots,
          papdata,
          timesteps,
          poiPeaks,
          incidence,
          metadata
        } = (await response.json()).data;

        setSettings({
          sim_id: +run_id,
          zone: zoneData,
          hours: zoneData.length
        });

        setIsSaved(Boolean(saved));
        setSelectedZone(zoneData);
        setSimData(null);
        setRunName(name);
        setHotspots(hotspots);
        setPapData(papdata);
        setTimesteps(timesteps);
        setPoiPeaks(poiPeaks);
        setIncidence(incidence ?? null);
        setInterventionPayload({
          simdata: null,
          papdata,
          hotspots,
          timesteps,
          poiPeaks,
          incidence: incidence ?? null,
          metadata
        });

        const loadComparisonPayload = async (
          comparisonId: number,
          label: string
        ): Promise<SimRunData | null> => {
          try {
            let comparisonRes: Response;
            while (true) {
              comparisonRes = await fetch(`/api/simdata/${comparisonId}/map`, {
                signal
              });
              if (comparisonRes.status !== 202) break;
              await new Promise((r) => setTimeout(r, 2000));
            }
            if (comparisonRes.ok) {
              const comparisonJson = await comparisonRes.json();
              return {
                simdata: null,
                papdata: comparisonJson.data.papdata,
                hotspots: comparisonJson.data.hotspots,
                timesteps: comparisonJson.data.timesteps,
                poiPeaks: comparisonJson.data.poiPeaks,
                incidence: comparisonJson.data.incidence ?? null,
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
    setPoiPeaks,
    setIncidence,
    setPapData,
    setRunName,
    setSettings,
    setSimData,
    setTimesteps
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
      // Land the user on the rerouted run once it finishes loading.
      autoShowDisabledRef.current = true;
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

  // Selecting a POI from the hotspot rankings scopes the chart (as a marker
  // click does) AND flies the Cases map to that POI. The bumped nonce lets a
  // repeat click on the same POI re-trigger the fly-to.
  const handleSelectPoiFromRankings = (loc: {
    id: string;
    label: string;
    type: string;
  }) => {
    handleMarkerClick(loc);
    setFocusPoi((previous) => ({
      id: loc.id,
      nonce: (previous?.nonce ?? 0) + 1
    }));
  };

  const onReset = () => {
    setSelectedLoc(null);
  };

  if (loading) {
    return (
      <div className="sim_container sim_run_container">
        <div className="sim_run_status">
          <p className="sim_run_status_label">Loading simulation data</p>
          <div className="sim_run_status_track">
            <div
              className="sim_run_status_fill"
              style={{ width: `${Math.max(progress, 2)}%` }}
            />
          </div>
          <p className="sim_run_status_detail">
            {progress > 0 ? `${progress}%` : 'Starting...'}
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="sim_container sim_run_container">
        <div className="sim_run_status">
          <p className="sim_run_status_label is-error">{error}</p>
          <Button
            type="button"
            variant="secondary"
            onClick={() => router.push('/simulator')}
            className="sim_return_button"
          >
            <ArrowLeft size={16} aria-hidden="true" />
            <span>New setup</span>
          </Button>
        </div>
      </div>
    );
  }

  if (!selectedZone) {
    return (
      <div className="sim_container sim_run_container">
        <div className="sim_run_status">
          <p className="sim_run_status_label">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="sim_container sim_run_container">
      <div className="sim_output sim_run_shell">
        <header className="sim_run_header">
          <div className="sim_run_title_group">
            <span className="sim_run_kicker">Simulation Result</span>
            <h1 className="sim_run_title">{selectedZone.name}</h1>
            <div className="sim_run_meta">
              <span>{runName || 'Untitled Run'}</span>
              <span>Created {formatRunDate(selectedZone.created_at)}</span>
              <span>Viewing {activeViewLabel}</span>
            </div>
          </div>

          <div className="sim_run_header_actions">
            <div className="sim_run_edit_actions">
              <span className="sim_run_edit_label">
                {runName || 'Untitled Run'}
              </span>
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
                    setTimesteps(null);
                    setPoiPeaks(null);
                    setRunName('');
                    setSettings({ sim_id: null });
                    router.push('/simulator');
                    return true;
                  }}
                />
              ) : (
                <button
                  type="button"
                  className="sim_login_edit_button"
                  onClick={() => setLoginOpen(true)}
                >
                  Login to edit or delete this run
                </button>
              )}
            </div>
            <Button
              variant="secondary"
              className="sim_return_button"
              onClick={() => router.push('/simulator')}
            >
              <ArrowLeft size={16} aria-hidden="true" />
              <span>New setup</span>
            </Button>
          </div>
        </header>

        {hasComparisonRuns && (
          <section className="sim_run_panel sim_run_comparison_panel">
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
          </section>
        )}

        <section className="sim_run_panel sim_run_map_panel">
          <div className="sim_run_section_header">
            <div>
              <span className="sim_run_section_kicker">Map</span>
              <h2 className="sim_run_section_title">
                Movement and exposure over time
              </h2>
            </div>
            {hasComparisonRuns && (
              <fieldset className="sim_view_switcher">
                <legend className="sr-only">Map view</legend>
                <button
                  type="button"
                  className={`sim_view_switcher_button ${
                    activeView === 'intervention' ? 'is-active' : ''
                  }`}
                  onClick={() => showRun('intervention')}
                >
                  With interventions
                </button>
                {baselineId != null && (
                  <button
                    type="button"
                    disabled={!baselinePayload}
                    className={`sim_view_switcher_button ${
                      activeView === 'baseline' ? 'is-active' : ''
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
                    className={`sim_view_switcher_button ${
                      activeView === 'disabled' ? 'is-active' : ''
                    }`}
                    onClick={() => showRun('disabled')}
                  >
                    {disabledPayload
                      ? 'Disabled POIs'
                      : 'Disabled POIs (loading...)'}
                  </button>
                )}
              </fieldset>
            )}
          </div>
          <ModelMap
            key={activeSimId}
            selectedZone={selectedZone}
            simId={activeSimId}
            seedCbgIds={effectiveSeedCbgIds}
            // Only paint POIs as disabled on the run that actually rerouted
            // them; the intervention/baseline runs still placed people there.
            disabledPoiIds={
              activeView === 'disabled'
                ? effectiveDisabledPoiIds
                : EMPTY_DISABLED_POI_IDS
            }
            onMarkerClick={handleMarkerClick}
            focusPoi={focusPoi}
          />
        </section>

        <OutputGraphs
          simId={interventionSimId}
          baselineSimId={baselineId}
          disabledPoiSimId={disabledSimId}
          selected_loc={selectedLoc}
          onReset={onReset}
        />

        <PersonPathPanel simId={activeSimId} />

        <PoiRankings
          onSelectPoi={handleSelectPoiFromRankings}
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

        <div className="sim_run_bottom_actions">
          {isSaved ? (
            <Button variant="secondary" className="sim_return_button" disabled>
              <Check size={16} aria-hidden="true" />
              <span>Saved</span>
            </Button>
          ) : (
            <Button
              variant="primary"
              className="sim_return_button"
              onClick={handleSaveRun}
              disabled={saving}
            >
              <Save size={16} aria-hidden="true" />
              <span>{saving ? 'Saving…' : 'Save run'}</span>
            </Button>
          )}
          <Button
            variant="secondary"
            className="sim_return_button"
            onClick={() => router.push('/simulator')}
          >
            <ArrowLeft size={16} aria-hidden="true" />
            <span>Return to simulator setup</span>
          </Button>
        </div>
        {!isSaved && (
          <p className="text-sm text-center mt-2 text-(--color-text-muted)">
            Unsaved runs are removed automatically. Save to keep this run in
            “Visit a Previous Run”.
          </p>
        )}
        {saveError && (
          <p className="text-sm text-center mt-2 text-red-600">{saveError}</p>
        )}
      </div>
      <LoginModal
        isOpen={loginOpen}
        onRequestClose={() => setLoginOpen(false)}
      />
    </div>
  );
}
