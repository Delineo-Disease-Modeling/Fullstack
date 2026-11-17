'use client';

import dynamic from 'next/dynamic';
import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  getClusteringProgressUrl,
  startV2PopulationPreparation,
  startV2RegionPreview
} from '@/features/cz-generation/api';
import type {
  V2CensusPreparation,
  V2RegionPreview
} from '@/features/cz-generation/types';

import { V2PopulationSummary } from './v2-population-summary';

const CBGMap = dynamic(() => import('@/components/cbg-map'), { ssr: false });
const ignoreMapClick = () => {};

function formatCoverage(value: number | null) {
  return value === null ? 'No external jobs' : `${(value * 100).toFixed(1)}%`;
}

function waitForJob<T>(
  id: number,
  signal: AbortSignal,
  onProgress: (message: string, progress: number) => void,
  stage: 'region' | 'census'
): Promise<T> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error('Preview cancelled.'));
      return;
    }
    const events = new EventSource(getClusteringProgressUrl(id));
    let settled = false;
    let timeout: number | undefined;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      events.close();
      window.clearTimeout(timeout);
      signal.removeEventListener('abort', cancel);
      callback();
    };
    const cancel = () => finish(() => reject(new Error('Preview cancelled.')));
    const resetTimeout = () => {
      window.clearTimeout(timeout);
      timeout = window.setTimeout(
        () =>
          finish(() =>
            reject(
              new Error(
                'No progress received for 15 minutes. Please retry; completed data preparation will be reused.'
              )
            )
          ),
        15 * 60 * 1000
      );
    };
    resetTimeout();
    signal.addEventListener('abort', cancel, { once: true });
    events.onerror = () =>
      finish(() =>
        reject(
          new Error('Region progress connection was interrupted. Please retry.')
        )
      );
    events.onmessage = (event) => {
      if (settled) return;
      try {
        const payload = JSON.parse(event.data);
        resetTimeout();
        if (payload.error) {
          finish(() =>
            reject(new Error(payload.message || 'Region generation failed.'))
          );
          return;
        }
        onProgress(
          String(payload.message || 'Preparing region...'),
          Number(payload.progress) || 0
        );
        if (payload.done) {
          const result = payload.result;
          const valid =
            stage === 'region'
              ? Array.isArray(result?.cluster) &&
                result.geojson?.features &&
                Number.isFinite(result.size) &&
                result.region_metadata?.method === 'v2'
              : result?.stage === 'census_inputs' &&
                Array.isArray(result.cluster) &&
                Number.isFinite(result.summary?.cbg_count) &&
                result.census?.sources;
          if (!valid)
            throw new Error(
              'The Algorithms service returned an invalid preparation result.'
            );
          finish(() => resolve(result as T));
        }
      } catch (error) {
        finish(() =>
          reject(
            error instanceof Error
              ? error
              : new Error('Invalid region response.')
          )
        );
      }
    };
  });
}

export function V2RegionPreviewPanel() {
  const [zipCode, setZipCode] = useState('');
  const [coveragePercent, setCoveragePercent] = useState('5');
  const [previewId, setPreviewId] = useState<number | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [census, setCensus] = useState<V2CensusPreparation | null>(null);
  const [censusError, setCensusError] = useState('');
  const [censusStatus, setCensusStatus] = useState('');
  const [censusProgress, setCensusProgress] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<V2RegionPreview | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  useEffect(() => () => requestRef.current?.abort(), []);
  const styles = useMemo(() => {
    const core = new Set(result?.region_metadata.core_cbgs);
    return new Map(
      (result?.cluster || []).map((cbg) => [
        cbg,
        {
          fillColor: core.has(cbg) ? '#2563eb' : '#d97706',
          lineColor: core.has(cbg) ? '#1e40af' : '#92400e'
        }
      ])
    );
  }, [result]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading || preparing) return;
    if (!/^[0-9]{5}$/.test(zipCode)) {
      setError('Enter a five-digit ZIP code.');
      return;
    }
    const coverage = Number(coveragePercent);
    if (
      !coveragePercent.trim() ||
      !Number.isFinite(coverage) ||
      coverage < 0 ||
      coverage > 100
    ) {
      setError('Enter a coverage percentage from 0 to 100.');
      return;
    }
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setLoading(true);
    setError('');
    setResult(null);
    setPreviewId(null);
    setCensus(null);
    setCensusError('');
    setStatus('Starting region preview...');
    setProgress(0);
    try {
      const kickoff = await startV2RegionPreview(
        zipCode,
        coverage,
        controller.signal
      );
      if (
        !Number.isInteger(kickoff.clustering_id) ||
        kickoff.clustering_id <= 0
      ) {
        throw new Error('No region preview job ID was returned.');
      }
      const preview = await waitForJob<V2RegionPreview>(
        kickoff.clustering_id,
        controller.signal,
        (message, value) => {
          setStatus(message);
          setProgress(Math.min(100, Math.max(0, value)));
        },
        'region'
      );
      if (!controller.signal.aborted) {
        setResult(preview);
        setPreviewId(kickoff.clustering_id);
      }
    } catch (caught) {
      if (!controller.signal.aborted)
        setError(
          caught instanceof Error ? caught.message : 'Region preview failed.'
        );
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }

  async function confirmRegion() {
    if (!previewId || !result || loading || preparing) return;
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setPreparing(true);
    setCensus(null);
    setCensusError('');
    setCensusStatus('Confirming selection and preparing Census inputs...');
    setCensusProgress(0);
    try {
      const kickoff = await startV2PopulationPreparation(
        previewId,
        42,
        controller.signal
      );
      if (
        !Number.isInteger(kickoff.clustering_id) ||
        kickoff.clustering_id <= 0
      ) {
        throw new Error('No Census preparation job ID was returned.');
      }
      const prepared = await waitForJob<V2CensusPreparation>(
        kickoff.clustering_id,
        controller.signal,
        (message, value) => {
          setCensusStatus(message);
          setCensusProgress(Math.min(100, Math.max(0, value)));
        },
        'census'
      );
      if (!controller.signal.aborted) {
        console.groupCollapsed(
          `[ABM Census] Inputs ready for preview ${prepared.preview_id}`
        );
        console.info('Summary', prepared.summary);
        console.info('Source', prepared.census.sources);
        if (prepared.census.missing_fields.length > 0) {
          console.warn('Unavailable Census inputs', prepared.census.missing_fields);
        }
        console.info('Confirmed CBGs', prepared.cluster);
        console.table(
          Object.entries(prepared.census.block_groups).map(([cbg, block]) => ({
            cbg,
            county: block.county_geoid,
            population: block.population,
            households: block.households.total_households,
            householdPopulation: block.residence.household_population,
            groupQuartersPopulation: block.residence.group_quarters_population,
            employed: block.employment.civilian_employed,
            enrolled: block.enrollment.enrolled,
            workedFromHome: block.commuting.worked_from_home,
            ageSexBuckets: block.sex_age.length,
            ageSexTotal: block.sex_age.reduce(
              (total, bucket) => total + bucket.count,
              0
            )
          }))
        );
        console.info(
          'County age/sex distributions (assignment guidance, not region totals)',
          prepared.census.distributions_by_county
        );
        console.info(
          'Full Census inputs (expand to inspect household, employment and enrollment counts)',
          prepared.census
        );
        console.groupEnd();
        setCensus(prepared);
      }
    } catch (caught) {
      if (!controller.signal.aborted) {
        setCensusError(
          caught instanceof Error
            ? caught.message
            : 'Census preparation failed.'
        );
      }
    } finally {
      if (!controller.signal.aborted) setPreparing(false);
    }
  }

  const metadata = result?.region_metadata;
  return (
    <div className="czgen_page">
      <div className="czgen_header">
        <h1 className="czgen_title">Generate a Convenience Zone</h1>
        <p className="czgen_lede">
          Start with a ZIP code and preview its Census block groups and major
          work connections.
        </p>
      </div>
      <div className="v2-region-workspace">
        <aside
          className="v2-region-settings"
          aria-label="Region configuration"
        >
          <form onSubmit={submit} className="czgen_panel flex flex-col gap-4">
            <label className="czgen_field_label" htmlFor="v2-zip">
              ZIP code
            </label>
            <input
              id="v2-zip"
              className="formfield w-full"
              value={zipCode}
              inputMode="numeric"
              autoComplete="postal-code"
              pattern="[0-9]{5}"
              maxLength={5}
              required
              placeholder="21550"
              disabled={loading || preparing}
              onChange={(event) => {
                setZipCode(event.target.value);
                setResult(null);
                setPreviewId(null);
                setCensus(null);
                setCensusError('');
                setError('');
              }}
            />
            <div className="flex flex-col gap-1">
              <label className="czgen_field_label" htmlFor="v2-coverage">
                Commuting coverage (%)
              </label>
              <input
                id="v2-coverage"
                className="formfield w-full"
                type="number"
                min={0}
                max={100}
                step="any"
                required
                value={coveragePercent}
                disabled={loading || preparing}
                aria-describedby="v2-coverage-help"
                onChange={(event) => {
                  setCoveragePercent(event.target.value);
                  setResult(null);
                  setPreviewId(null);
                  setCensus(null);
                  setCensusError('');
                  setError('');
                }}
              />
              <p id="v2-coverage-help" className="text-sm">
                Target share of regional commuting jobs in each direction. Lower
                values select fewer block groups; 0% keeps only the ZIP core.
              </p>
            </div>
            <p>
              Includes whole Census block groups covering the ZIP area, then
              adds the strongest regional work connections in each direction.
            </p>
            <button
              type="submit"
              disabled={loading || preparing}
              className="rounded bg-blue-700 p-3 text-white disabled:opacity-50"
            >
              {loading ? 'Preparing region...' : 'Preview region'}
            </button>
            {loading && (
              <output>
                <p>{status}</p>
                <progress className="w-full" value={progress} max={100} />
              </output>
            )}
            {error && (
              <p role="alert" className="text-red-700">
                {error}
              </p>
            )}
          </form>
          <section
            className="czgen_panel v2-region-summary"
            aria-label="Population preparation"
          >
            <p>
              Confirm the previewed block groups to prepare population and map.
            </p>
            <button
              type="button"
              onClick={confirmRegion}
              disabled={!previewId || loading || preparing || !!census}
              className="czgen_btn czgen_btn--primary"
            >
              {preparing
                ? 'Preparing Census inputs...'
                : census
                  ? 'Selection confirmed'
                  : 'Confirm region'}
            </button>
            {preparing && (
              <output aria-live="polite">
                <p>{censusStatus}</p>
                <progress className="w-full" value={censusProgress} max={100} />
              </output>
            )}
            {censusError && (
              <p role="alert" className="czgen_error">
                {censusError}
              </p>
            )}
          </section>
        </aside>
        <section
          className="v2-region-results"
          aria-label="Region preview and results"
        >
          <div className="czgen_map v2-region-map">
            {result ? (
              <CBGMap
                key={result.region_metadata.zip_code}
                cbgData={result.geojson}
                center={result.center}
                selectedCBGs={result.cluster}
                selectionStyleByCbg={styles}
                editingEnabled={false}
                onCBGClick={ignoreMapClick}
                onMapBackgroundClick={ignoreMapClick}
              />
            ) : (
              <div className="v2-region-empty">
                <strong>Region Preview</strong>
                <p>Your region map will appear here</p>
              </div>
            )}
          </div>
          {result && metadata && (
            <div className="czgen_panel v2-region-summary">
              <h3 className="v2-region-heading">Region results</h3>
              <p>
                <strong>{result.size.toLocaleString()}</strong> estimated
                residents · {result.cluster.length} CBGs
              </p>
              <p>
                <span className="text-blue-700">
                  Blue: {metadata.core_cbgs.length} core CBGs
                </span>
                <br />
                <span className="text-amber-700">
                  Amber: {metadata.added_cbgs.length} expanded CBGs
                </span>
              </p>
              <p>
                Target coverage: {formatCoverage(metadata.coverage.target)}
                <br />
                Inbound coverage:{' '}
                {formatCoverage(metadata.coverage.inbound_achieved)}
                <br />
                Outbound coverage:{' '}
                {formatCoverage(metadata.coverage.outbound_achieved)}
              </p>
              <p className="text-sm">
                <strong>Regional commuting coverage</strong>
                <br />
                Core states and directly adjoining states:{' '}
                {metadata.sources.requested_workplace_states
                  .join(', ')
                  .toUpperCase()}
                .
                <br />
                Loaded workplace states:{' '}
                {metadata.sources.workplace_states.join(', ').toUpperCase()}.
                Only trips with both home and workplace in the selected region
                are included. Coverage percentages describe these regional trips
                in the loaded data, not all commuting connections.
              </p>
              {!!metadata.sources.unavailable_workplace_states?.length && (
                <p role="alert" className="text-amber-800">
                  Required {metadata.sources.lodes_year} files were unavailable
                  for:{' '}
                  {metadata.sources.unavailable_workplace_states
                    .join(', ')
                    .toUpperCase()}
                  . These workplace states are excluded from the coverage
                  calculation.
                </p>
              )}
              <p className="text-sm">
                ACS {metadata.sources.population_year} population estimates;
                LODES {metadata.sources.lodes_year} primary jobs. The region
                covers whole CBGs, not the exact ZIP boundary. Commuting
                connections can be geographically disconnected.
              </p>
            </div>
          )}
          {census && (
            <div className="czgen_panel">
              <V2PopulationSummary data={census} />
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
