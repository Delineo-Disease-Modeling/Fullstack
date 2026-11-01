'use client';

import { useMemo } from 'react';
import {
  type ChangeRow,
  categoryRows,
  compareCounts,
  formatChange,
  formatPercent,
  rankByChange,
  type Totals
} from '@/lib/compare-incidence';
import {
  type Comparability,
  type ComparisonRuns,
  seedNote,
  seedPairing
} from '@/lib/comparison-pair';
import type { ComparisonWindowResult } from '@/lib/comparison-window-client';
import type { ComparisonWindowState } from '@/lib/use-comparison-window';

const TOP_N = 10;
const LABEL_MAX = 44;

export type ComparisonView = 'pois' | 'types';

function truncate(label: string) {
  return label.length > LABEL_MAX
    ? `${label.slice(0, LABEL_MAX - 1)}...`
    : label;
}

function changeClass(change: number) {
  if (change < 0) return 'is-down';
  if (change > 0) return 'is-up';
  return 'is-flat';
}

// A change is read from its sign, never from its colour alone.
function ChangeCell({
  change,
  percent
}: {
  change: number;
  percent: number | null;
}) {
  return (
    <td className={`hotspot_compare_change ${changeClass(change)}`}>
      <span>{formatChange(change)}</span>
      {percent !== null && change !== 0 && (
        <span className="hotspot_compare_percent">
          {formatPercent(percent)}
        </span>
      )}
    </td>
  );
}

function SummaryTable({
  runs,
  rows
}: {
  runs: ComparisonRuns;
  rows: Array<[string, Totals]>;
}) {
  return (
    <table className="hotspot_compare_summary">
      <caption className="sr-only">
        New infections by where they happened, in both runs
      </caption>
      <thead>
        <tr>
          <th scope="col">Where</th>
          <th scope="col">{runs.reference.label}</th>
          <th scope="col">{runs.primary.label}</th>
          <th scope="col">Change</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([label, totals]) => (
          <tr key={label}>
            <th scope="row">{label}</th>
            <td>{totals.reference.toLocaleString('en-US')}</td>
            <td>{totals.primary.toLocaleString('en-US')}</td>
            <ChangeCell change={totals.change} percent={totals.percent} />
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function HotspotComparison({
  runs,
  result,
  view,
  windowed,
  refreshing,
  notes
}: {
  runs: ComparisonRuns;
  // The two runs' counts for one window, from one request.
  result: ComparisonWindowResult;
  view: ComparisonView;
  // false = the whole run, true = a time window.
  windowed: boolean;
  // A newer window is loading; this pair is the previous one.
  refreshing: boolean;
  // Lines a reader should see with the numbers (seed noise, run differences).
  notes: readonly string[];
}) {
  const comparison = useMemo(
    () => compareCounts(result.reference, result.primary, runs.primary.places),
    [result, runs.primary.places]
  );
  const ranked = useMemo<ChangeRow[]>(
    () =>
      rankByChange(
        view === 'pois'
          ? comparison.placeRows
          : categoryRows(comparison.placeRows, runs.primary.places),
        TOP_N
      ),
    [comparison, view, runs.primary.places]
  );

  const subject = view === 'pois' ? 'POIs' : 'POI types';
  const title = windowed
    ? `Where the runs differ in this window (${subject})`
    : `Where the runs differ (${subject})`;

  return (
    <div
      className={`hotspot_results hotspot_compare ${
        refreshing ? 'is-refreshing' : ''
      }`}
      aria-busy={refreshing}
    >
      <SummaryTable
        runs={runs}
        rows={[
          ['At home', comparison.home],
          ['At POIs', comparison.places],
          ['All', comparison.all]
        ]}
      />
      {notes.map((note) => (
        <p key={note} className="hotspot_compare_note">
          {note}
        </p>
      ))}
      <h3 className="poi_rankings_subtitle">{title}</h3>
      <p className="hotspot_compare_hint">
        Change = {runs.primary.label} minus {runs.reference.label}. Largest
        changes first.
      </p>
      {ranked.length === 0 ? (
        <div className="hotspot_table">
          <div className="hotspot_empty">
            {windowed
              ? 'No new infections at POIs in either run in this window.'
              : 'No infections at POIs recorded in either run.'}
          </div>
        </div>
      ) : (
        <div className="hotspot_table hotspot_compare_scroll">
          <table className="hotspot_compare_table">
            <caption className="sr-only">{title}</caption>
            <thead>
              <tr>
                <th scope="col" className="hotspot_compare_rank">
                  #
                </th>
                <th scope="col">{view === 'pois' ? 'Place' : 'Type'}</th>
                <th scope="col">{runs.reference.label}</th>
                <th scope="col">{runs.primary.label}</th>
                <th scope="col">Change</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((row, index) => (
                <tr key={row.id}>
                  <td className="hotspot_compare_rank">{index + 1}</td>
                  <th
                    scope="row"
                    className="hotspot_compare_name"
                    title={row.label}
                  >
                    <span aria-hidden="true">{truncate(row.label)}</span>
                    <span className="sr-only">{row.label}</span>
                  </th>
                  <td>{row.reference.toLocaleString('en-US')}</td>
                  <td>{row.primary.toLocaleString('en-US')}</td>
                  <ChangeCell change={row.change} percent={row.percent} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Message({ children }: { children: React.ReactNode }) {
  return (
    <div className="hotspot_table">
      <output className="hotspot_empty">{children}</output>
    </div>
  );
}

function ErrorWithRetry({
  message,
  onRetry
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <span className="hotspot_window_error">
      {message}{' '}
      <button type="button" className="hotspot_window_retry" onClick={onRetry}>
        Retry
      </button>
    </span>
  );
}

// Everything the comparison can show in place of the numbers, in the order a
// reader needs it: the runs are loading or failed, the pair cannot be compared,
// the window is loading or failed, or the numbers themselves. Numbers are only
// ever drawn from a complete pair that passed every check.
export function ComparisonBody({
  runs,
  runsFailure,
  onRetryRuns,
  comparability,
  windowState,
  staleResult,
  onRetryWindow,
  view,
  windowed
}: {
  runs: ComparisonRuns | null;
  // Why the runs could not be loaded; null while they are still loading.
  runsFailure: string | null;
  onRetryRuns: () => void;
  comparability: Comparability | null;
  windowState: ComparisonWindowState;
  staleResult: ComparisonWindowResult | null;
  onRetryWindow: () => void;
  view: ComparisonView;
  windowed: boolean;
}) {
  if (!runs) {
    return (
      <Message>
        {runsFailure !== null ? (
          <ErrorWithRetry message={runsFailure} onRetry={onRetryRuns} />
        ) : (
          'Loading the two runs…'
        )}
      </Message>
    );
  }
  if (!comparability?.ok) {
    return (
      <Message>
        {comparability?.message ?? 'These runs cannot be compared.'}
      </Message>
    );
  }
  const shown =
    windowState.status === 'ready'
      ? windowState.result
      : windowState.status === 'loading'
        ? staleResult
        : null;
  if (!shown) {
    return (
      <Message>
        {windowState.status === 'error' ? (
          <ErrorWithRetry
            message={windowState.message}
            onRetry={onRetryWindow}
          />
        ) : windowState.status === 'unavailable' ? (
          'These runs cannot be compared for this window.'
        ) : (
          'Loading this window…'
        )}
      </Message>
    );
  }
  return (
    <HotspotComparison
      runs={runs}
      result={shown}
      view={view}
      windowed={windowed}
      refreshing={windowState.status === 'loading'}
      notes={[
        seedNote(seedPairing(runs.reference.metadata, runs.primary.metadata)),
        ...comparability.notes
      ]}
    />
  );
}
