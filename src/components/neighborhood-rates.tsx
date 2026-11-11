'use client';

import { useId, useState } from 'react';
import {
  HEAT_PALETTE,
  heatLevel,
  MAX_DAY_COLUMNS
} from '@/lib/daily-incidence';
import {
  describeBlockGroup,
  describeCoverage,
  describeNeighborhoodCell,
  formatRate,
  formatRateInText,
  formatShare,
  isMostlyAway,
  LOW_AT_HOME_PERCENT,
  lastDaySpread,
  limitRows,
  MAX_NEIGHBORHOOD_ROWS,
  mostlyAwayCount,
  type NeighborhoodTable,
  READING_HOUR,
  ratePer1000
} from '@/lib/neighborhood-rates';
import type { NeighborhoodFailure } from '@/lib/neighborhood-rates-client';
import { totalNewInfections } from '@/lib/seed-check';
import {
  type NeighborhoodState,
  useNeighborhoodRates
} from '@/lib/use-neighborhood-rates';
import type { RunIncidence } from '@/stores/mapdata';

const MESSAGES: Record<NeighborhoodFailure, string> = {
  'no-grid': 'A day-by-day view is not available for this run.',
  'no-days': 'This run has no whole day to show.',
  'too-long': `Runs longer than ${MAX_DAY_COLUMNS} days are not shown day by day.`,
  'bad-homes':
    'The homes of this run do not say which neighborhood they are in, or how many people live there, so no table is shown.',
  'bad-frames':
    'The server returned data for this run that cannot be used, so no table is shown.'
};

function Legend({ maxRate }: { maxRate: number }) {
  return (
    <div className="hotspot_heatmap_legend">
      <span className="hotspot_heatmap_legend_scale" aria-hidden="true">
        {HEAT_PALETTE.map((color, level) => (
          <span
            key={color.background}
            className="hotspot_heatmap_swatch"
            style={{ background: color.background }}
            title={level === 0 ? 'Nobody infected yet' : undefined}
          />
        ))}
      </span>
      <span className="hotspot_heatmap_legend_text">
        None, then up to {formatRateInText(maxRate)} per 1,000 people at home.
        Colour is relative to the highest rate in this table, on a square-root
        scale so small numbers stay visible.
      </span>
    </div>
  );
}

function Rates({
  table,
  newInfections
}: {
  table: NeighborhoodTable;
  newInfections: number | null;
}) {
  const { rows, hiddenRows, maxRate } = limitRows(table, MAX_NEIGHBORHOOD_ROWS);
  const spread = lastDaySpread(table);
  const away = mostlyAwayCount(table);
  const coverage = describeCoverage(table, newInfections);
  const last = table.columns.length - 1;
  const lastColumn = table.columns[last];
  const followUp = table.runHours > lastColumn.hour;

  return (
    <>
      <p className="hotspot_heatmap_note">
        People infected so far, per 1,000 people at home, in each census block
        group (a neighborhood). Each day is read at its last hour (hour{' '}
        {READING_HOUR} of the day), counted from the start of the run, not by
        the clock. People who are away from home at that hour are not counted
        that day, so a rate can also go down from one day to the next; the At
        home column shows the people at home as a share of the residents listed
        for the neighborhood, a number that is only roughly right. Neighborhoods
        are listed by their rate on the last day, highest first. A day is 24
        hours of simulation time, not a calendar date.
        {followUp
          ? ` The last reading is on day ${lastColumn.day} (hour ${lastColumn.hour}); infections after it are not included.`
          : ''}
      </p>
      {coverage && <p className="hotspot_heatmap_note">{coverage}</p>}
      <p className="hotspot_heatmap_note">
        {spread
          ? `On day ${spread.day} the rate ranges from ${formatRateInText(
              spread.lowest
            )} to ${formatRateInText(spread.highest)} per 1,000 across ${spread.count.toLocaleString(
              'en-US'
            )} neighborhoods. This is one run: a difference between neighborhoods can also be chance, and the check against other random seeds below shows how far a run can move.`
          : table.rows.length < 2
            ? 'There is only one neighborhood, so there is nothing to compare it with.'
            : `Fewer than two neighborhoods had people at home on day ${lastColumn.day}, so there is nothing to compare.`}
      </p>
      {away > 0 && (
        <p className="hotspot_heatmap_note">
          * On day {lastColumn.day}, fewer than {LOW_AT_HOME_PERCENT}% of the
          residents of {away.toLocaleString('en-US')}{' '}
          {away === 1 ? 'neighborhood were' : 'neighborhoods were'} at home at
          hour {READING_HOUR}. For those, the rate describes only the people who
          were at home.
        </p>
      )}
      <section
        className="hotspot_heatmap_scroll facility_hours_scroll"
        aria-label="Infected people per 1,000 at home by neighborhood and day, scrollable"
        // biome-ignore lint/a11y/noNoninteractiveTabindex: a region that scrolls must be reachable from the keyboard
        tabIndex={0}
      >
        <table className="hotspot_heatmap_table">
          <caption className="sr-only">
            Infected people per 1,000 at home, by neighborhood and day, read at
            hour {READING_HOUR} of each day
          </caption>
          <thead>
            <tr>
              <th
                scope="col"
                className="hotspot_heatmap_corner facility_hours_corner"
              >
                Neighborhood
              </th>
              {table.columns.map((column) => (
                <th
                  key={column.day}
                  scope="col"
                  className="hotspot_heatmap_day facility_hours_head neighborhood_rates_head"
                  title={`Day ${column.day}, hour ${READING_HOUR} of the day (hour ${column.hour} of the run)`}
                >
                  <span className="sr-only">Day </span>
                  {column.day}
                </th>
              ))}
              <th
                scope="col"
                className="hotspot_heatmap_day facility_hours_head neighborhood_rates_side"
                title="Residents listed for the neighborhood: the members of its homes added up"
              >
                Residents
              </th>
              <th
                scope="col"
                className="hotspot_heatmap_day facility_hours_head neighborhood_rates_side"
                title={`People at home at hour ${READING_HOUR} of day ${lastColumn.day}, as a share of the residents listed for the neighborhood (the listed number is approximate)`}
              >
                At home
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <th
                  scope="row"
                  className="hotspot_heatmap_name"
                  title={describeBlockGroup(row.id) ?? undefined}
                >
                  <span className="hotspot_heatmap_label">{row.id}</span>
                </th>
                {row.cells.map((cell, index) => {
                  const rate = ratePer1000(cell.infected, cell.present);
                  const color = HEAT_PALETTE[heatLevel(rate ?? 0, maxRate)];
                  const column = table.columns[index];
                  return (
                    <td
                      key={column.day}
                      className="hotspot_heatmap_cell facility_hours_cell neighborhood_rates_cell"
                      style={{
                        background: color.background,
                        color: color.color
                      }}
                      title={describeNeighborhoodCell(row.id, column.day, cell)}
                    >
                      {rate !== null && rate > 0 ? (
                        formatRate(rate)
                      ) : (
                        <>
                          <span aria-hidden="true">
                            {rate === null ? '–' : '·'}
                          </span>
                          <span className="sr-only">
                            {rate === null ? 'nobody at home' : '0'}
                          </span>
                        </>
                      )}
                    </td>
                  );
                })}
                <td className="hotspot_heatmap_total facility_hours_total neighborhood_rates_side">
                  {row.residents.toLocaleString('en-US')}
                </td>
                <td className="hotspot_heatmap_total neighborhood_rates_side">
                  {formatShare(row.cells[last].present, row.residents)}
                  {isMostlyAway(row.cells[last].present, row.residents) && (
                    <>
                      <span aria-hidden="true">*</span>
                      <span className="sr-only">
                        , fewer than {LOW_AT_HOME_PERCENT}% of the residents
                        were at home
                      </span>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" className="hotspot_heatmap_name">
                <span className="hotspot_heatmap_label">All neighborhoods</span>
              </th>
              {table.totals.map((cell, index) => (
                <td
                  key={table.columns[index].day}
                  className="hotspot_heatmap_total facility_hours_cell neighborhood_rates_cell"
                  title={describeNeighborhoodCell(
                    'all neighborhoods',
                    table.columns[index].day,
                    cell
                  )}
                >
                  {formatRate(ratePer1000(cell.infected, cell.present))}
                </td>
              ))}
              <td className="hotspot_heatmap_total facility_hours_total neighborhood_rates_side">
                {table.residents.toLocaleString('en-US')}
              </td>
              <td className="hotspot_heatmap_total neighborhood_rates_side">
                {formatShare(table.totals[last].present, table.residents)}
              </td>
            </tr>
          </tfoot>
        </table>
      </section>
      {maxRate > 0 && <Legend maxRate={maxRate} />}
      {hiddenRows > 0 && (
        <p className="hotspot_heatmap_note">
          {hiddenRows.toLocaleString('en-US')} more neighborhoods are not shown,
          the ones lowest in the list. The row for all neighborhoods includes
          them.
        </p>
      )}
    </>
  );
}

// What a screen reader is told about the state of the load (see the status
// region in NeighborhoodRates). The number of days loaded so far is left out: it
// changes up to 100 times and must not be read out each time.
function statusText(state: NeighborhoodState): string {
  switch (state.status) {
    case 'loading':
      return 'Loading the neighborhoods…';
    case 'error':
      return state.message;
    case 'unavailable':
      return MESSAGES[state.reason];
    case 'ready':
      return 'The neighborhoods are loaded.';
    default:
      return '';
  }
}

// "Neighborhoods over time": the infected share of the people at home in each
// neighborhood, day by day. Loaded only when the section is opened. Rendered by
// the hotspot panel for the run it shows; it follows that run, and a different
// run reloads it while it is open.
export default function NeighborhoodRates({
  simId,
  timesteps,
  homes,
  wholeRun
}: {
  simId: number | null;
  timesteps: readonly number[] | null;
  homes: readonly unknown[] | null;
  // The run's whole-run incidence, for the sentence on what the table covers.
  wholeRun: RunIncidence | null;
}) {
  const [open, setOpen] = useState(false);
  const headingId = useId();
  const bodyId = useId();
  const { state, retry } = useNeighborhoodRates({
    enabled: open,
    simId,
    timesteps,
    homes
  });

  return (
    <section className="hotspot_heatmap" aria-labelledby={headingId}>
      <div className="hotspot_heatmap_header">
        <h3 id={headingId} className="poi_rankings_subtitle">
          Neighborhoods over time
        </h3>
        <button
          type="button"
          className="hotspot_heatmap_toggle"
          aria-expanded={open}
          aria-controls={open ? bodyId : undefined}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? 'Hide' : 'Show neighborhoods'}
        </button>
      </div>
      {/* Mounted before the section is opened and left empty until then, so
          that the first message is a CHANGE of an existing live region, which
          screen readers announce more reliably than a region that appears with
          its text. It sits outside the busy body, so loading, a failure and
          completion are each announced once. The visible messages below are not
          live regions. */}
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
                : 'Loading the neighborhoods…'}
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
          {state.status === 'ready' && (
            <Rates
              table={state.table}
              newInfections={totalNewInfections(wholeRun)}
            />
          )}
        </div>
      )}
    </section>
  );
}
