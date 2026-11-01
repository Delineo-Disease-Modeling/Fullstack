'use client';

import { useId, useMemo, useState } from 'react';
import {
  buildHeatmap,
  type DailyIncidence,
  describeColumn,
  HEAT_PALETTE,
  type HeatView,
  heatLevel,
  MAX_DAY_COLUMNS,
  ROW_LIMITS,
  toHeatPlaces
} from '@/lib/daily-incidence';
import type { DailyFailure } from '@/lib/daily-incidence-client';
import { type DailyState, useDailyIncidence } from '@/lib/use-daily-incidence';
import type { PapData, RunIncidence } from '@/stores/mapdata';

const MESSAGES: Record<DailyFailure, string> = {
  'no-grid': 'A by-day view is not available for this run.',
  'no-days': 'A by-day view is not available for this run.',
  'starts-late': 'A by-day view is not available for this run.',
  'bad-places': 'A by-day view is not available for this run.',
  'bad-frames': 'A by-day view is not available for this run.',
  'too-long': `Runs longer than ${MAX_DAY_COLUMNS} days are not shown by day.`,
  decreasing:
    'The recorded counts of this run go down from one day to the next, so no by-day view is shown.',
  mismatch:
    'The days of this run do not add up to its whole-run counts, so no by-day view is shown.',
  inexact: 'The counts of this run are too large to add up exactly.'
};

function RowCount({
  limit,
  onChange
}: {
  limit: number;
  onChange: (limit: number) => void;
}) {
  return (
    <fieldset className="hotspot_window_row hotspot_window_fieldset">
      <legend className="sr-only">Rows shown</legend>
      <span className="hotspot_window_label" aria-hidden="true">
        Rows
      </span>
      <div className="hotspot_view_toggle">
        {ROW_LIMITS.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={limit === option}
            className={`hotspot_view_toggle_button ${
              limit === option ? 'is-active' : ''
            }`}
            onClick={() => onChange(option)}
          >
            {option}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function Legend({ maxCell }: { maxCell: number }) {
  return (
    <div className="hotspot_heatmap_legend">
      <span className="hotspot_heatmap_legend_scale" aria-hidden="true">
        {HEAT_PALETTE.map((color, level) => (
          <span
            key={color.background}
            className="hotspot_heatmap_swatch"
            style={{ background: color.background }}
            title={level === 0 ? 'No infections' : undefined}
          />
        ))}
      </span>
      <span className="hotspot_heatmap_legend_text">
        None, then up to {maxCell.toLocaleString('en-US')}. Colour is relative
        to the largest cell shown, on a square-root scale so small counts stay
        visible. It changes when the rows shown change.
      </span>
    </div>
  );
}

function Heatmap({
  daily,
  places,
  view,
  limit,
  onLimitChange
}: {
  daily: DailyIncidence;
  places: PapData['places'];
  view: HeatView;
  limit: number;
  onLimitChange: (limit: number) => void;
}) {
  const catalog = useMemo(() => toHeatPlaces(places), [places]);
  const heatmap = useMemo(
    () => buildHeatmap(daily, catalog, view, limit),
    [daily, catalog, view, limit]
  );
  const columns = useMemo(
    () => daily.columns.map((column) => describeColumn(column)),
    [daily.columns]
  );
  const lastHour = daily.columns[daily.columns.length - 1].toHour;
  const subject = view === 'pois' ? 'places' : 'types';

  return (
    <>
      <RowCount limit={limit} onChange={onLimitChange} />
      <p className="hotspot_heatmap_note">
        New infections at POIs per simulation day, over the whole run (hours 0
        to {lastHour.toLocaleString('en-US')}). The time window above does not
        change it. A day is 24 hours of simulation time from the start of the
        run, not a calendar date.
      </p>
      {heatmap.rows.length === 0 && (
        <p className="hotspot_heatmap_note">
          No new infections at POIs in this run.
        </p>
      )}
      <section
        className="hotspot_heatmap_scroll"
        aria-label="New infections by day, scrollable"
        // biome-ignore lint/a11y/noNoninteractiveTabindex: a region that scrolls sideways must be reachable from the keyboard
        tabIndex={0}
      >
        <table className="hotspot_heatmap_table">
          <caption className="sr-only">
            New infections at POIs per simulation day, by{' '}
            {view === 'pois' ? 'place' : 'place type'}
          </caption>
          <thead>
            <tr>
              <th scope="col" className="hotspot_heatmap_corner">
                {view === 'pois' ? 'Place' : 'Type'}
              </th>
              {columns.map((column, index) => (
                <th
                  key={daily.columns[index].index}
                  scope="col"
                  className="hotspot_heatmap_day"
                  title={column.full}
                >
                  <span aria-hidden="true">{column.label}</span>
                  {column.note && (
                    <span
                      aria-hidden="true"
                      className="hotspot_heatmap_daynote"
                    >
                      {column.note}
                    </span>
                  )}
                  <span className="sr-only">{column.full}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {heatmap.rows.map((row) => (
              <tr key={row.id}>
                <th
                  scope="row"
                  className="hotspot_heatmap_name"
                  title={row.label}
                >
                  <span className="hotspot_heatmap_label">{row.label}</span>
                </th>
                {row.counts.map((count, index) => {
                  const color = HEAT_PALETTE[heatLevel(count, heatmap.maxCell)];
                  return (
                    <td
                      key={daily.columns[index].index}
                      className="hotspot_heatmap_cell"
                      style={{
                        background: color.background,
                        color: color.color
                      }}
                    >
                      {count > 0 ? (
                        count.toLocaleString('en-US')
                      ) : (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="sr-only">0</span>
                        </>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" className="hotspot_heatmap_name">
                <span className="hotspot_heatmap_label">All POIs</span>
              </th>
              {heatmap.footer.places.map((count, index) => (
                <td
                  key={daily.columns[index].index}
                  className="hotspot_heatmap_total"
                >
                  {count.toLocaleString('en-US')}
                </td>
              ))}
            </tr>
            {heatmap.footer.home && (
              <tr>
                <th scope="row" className="hotspot_heatmap_name">
                  <span className="hotspot_heatmap_label">At home</span>
                </th>
                {heatmap.footer.home.map((count, index) => (
                  <td
                    key={daily.columns[index].index}
                    className="hotspot_heatmap_total"
                  >
                    {count.toLocaleString('en-US')}
                  </td>
                ))}
              </tr>
            )}
          </tfoot>
        </table>
      </section>
      {heatmap.rows.length > 0 && <Legend maxCell={heatmap.maxCell} />}
      {heatmap.hiddenRows > 0 && (
        <p className="hotspot_heatmap_note">
          {heatmap.hiddenRows.toLocaleString('en-US')} more {subject} with{' '}
          {heatmap.hiddenTotal.toLocaleString('en-US')} infections are not
          shown. The totals below the table include them.
        </p>
      )}
    </>
  );
}

// What a screen reader is told about the state of the load (see the status
// region in HotspotHeatmap). Numbers of days loaded so far are left out: they
// change up to 100 times and must not be read out each time.
function statusText(state: DailyState): string {
  switch (state.status) {
    case 'loading':
      return 'Loading the days…';
    case 'error':
      return state.message;
    case 'unavailable':
      return MESSAGES[state.reason];
    case 'ready':
      return 'The days are loaded.';
    default:
      return '';
  }
}

// "New infections by day": a place x day table coloured by size, loaded only
// when the section is opened. Rendered by the hotspot panel for the run it
// shows; it follows that run, and a different run reloads it while it is open.
export default function HotspotHeatmap({
  simId,
  timesteps,
  places,
  wholeRun,
  view
}: {
  simId: number | null;
  timesteps: readonly number[] | null;
  places: PapData['places'] | null;
  wholeRun: RunIncidence | null;
  view: HeatView;
}) {
  const [open, setOpen] = useState(false);
  // Kept here, not in the table, so it survives a reload of the days.
  const [limit, setLimit] = useState<number>(ROW_LIMITS[0]);
  const headingId = useId();
  const bodyId = useId();
  const { state, retry } = useDailyIncidence({
    enabled: open,
    simId,
    timesteps,
    places,
    wholeRun
  });

  return (
    <section className="hotspot_heatmap" aria-labelledby={headingId}>
      <div className="hotspot_heatmap_header">
        <h3 id={headingId} className="poi_rankings_subtitle">
          New infections by day
        </h3>
        <button
          type="button"
          className="hotspot_heatmap_toggle"
          aria-expanded={open}
          aria-controls={open ? bodyId : undefined}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? 'Hide' : 'Show by day'}
        </button>
      </div>
      {/* Mounted before the section is opened and left empty until then, so
          that the first message ("Loading the days…") is a CHANGE of an
          existing live region, which screen readers announce more reliably than
          a region that appears with its text. It sits outside the busy body, so
          loading, a failure and completion are each announced once. The visible
          messages below are not live regions. */}
      <output className="sr-only">{open ? statusText(state) : ''}</output>
      {open && (
        <div
          id={bodyId}
          className="hotspot_heatmap_body"
          aria-busy={state.status === 'loading'}
        >
          {state.status === 'loading' && (
            <div className="hotspot_empty" aria-hidden="true">
              {state.total > 0
                ? `Loaded ${state.done} of ${state.total} days…`
                : 'Loading the days…'}
            </div>
          )}
          {state.status === 'error' && (
            <div className="hotspot_empty">
              <span className="hotspot_window_error">
                {state.message}{' '}
                <button
                  type="button"
                  className="hotspot_window_retry"
                  onClick={retry}
                >
                  Retry
                </button>
              </span>
            </div>
          )}
          {state.status === 'unavailable' && (
            <div className="hotspot_empty">{MESSAGES[state.reason]}</div>
          )}
          {state.status === 'ready' && places && (
            <Heatmap
              daily={state.daily}
              places={places}
              view={view}
              limit={limit}
              onLimitChange={setLimit}
            />
          )}
        </div>
      )}
    </section>
  );
}
