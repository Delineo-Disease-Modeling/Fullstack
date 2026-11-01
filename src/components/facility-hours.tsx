'use client';

import { useId, useMemo, useState } from 'react';
import { HEAT_PALETTE, MAX_DAY_COLUMNS } from '@/lib/daily-incidence';
import {
  buildPlaceTable,
  busiestHourOfDay,
  describeHour,
  HOURS_PER_DAY,
  type HourlyFailure,
  type HourlyPresence,
  hourNumber,
  presenceColor
} from '@/lib/hourly-presence';
import {
  type PlaceSeriesState,
  usePlaceSeries
} from '@/lib/use-hourly-presence';
import type { RunIncidence } from '@/stores/mapdata';

const MESSAGES: Record<HourlyFailure, string> = {
  'not-hourly': 'An hour-by-hour view is not available for this run.',
  'too-long': `Runs longer than ${MAX_DAY_COLUMNS} days are not shown hour by hour.`,
  'bad-data':
    'The server returned data for this place that cannot be used, so no table is shown.',
  misaligned:
    'The hours recorded for this place do not line up with this run, so no table is shown.',
  mismatch:
    'The new infections of this place do not add up to its whole-run count, so no table is shown.',
  inexact: 'The counts of this run are too large to add up exactly.'
};

export type FacilityPlace = { id: string; label: string };

// One decimal below 10, whole numbers from 10 up, a dot for none.
function formatMean(value: number): string {
  if (!(value > 0)) return '·';
  return value >= 10 ? String(Math.round(value)) : value.toFixed(1);
}

function Legend({ maxPeople }: { maxPeople: number }) {
  return (
    <div className="hotspot_heatmap_legend">
      <span className="hotspot_heatmap_legend_scale" aria-hidden="true">
        {HEAT_PALETTE.map((color, level) => (
          <span
            key={color.background}
            className="hotspot_heatmap_swatch"
            style={{ background: color.background }}
            title={level === 0 ? 'Nobody there' : undefined}
          />
        ))}
      </span>
      <span className="hotspot_heatmap_legend_text">
        None, then up to {maxPeople.toLocaleString('en-US')} people. Colour is
        relative to the busiest hour of this place, on a square-root scale so
        small numbers stay visible.
      </span>
    </div>
  );
}

function HoursTable({
  place,
  table,
  infectionsLeftOut
}: {
  place: FacilityPlace;
  table: HourlyPresence;
  infectionsLeftOut: boolean;
}) {
  const hours = useMemo(
    () => Array.from({ length: HOURS_PER_DAY }, (_, hour) => hour),
    []
  );
  const busiest = useMemo(
    () => busiestHourOfDay(table.meanByHour),
    [table.meanByHour]
  );
  const lastDayHours = table.hours - (table.days - 1) * HOURS_PER_DAY;

  return (
    <>
      <p className="hotspot_heatmap_note">
        <strong className="facility_hours_place">{place.label}</strong>: people
        present at the place, per hour of
        each simulation day, over the whole run (hours 1 to{' '}
        {table.hours.toLocaleString('en-US')}). Hours are numbered 1 to 24
        within each day, counting from the start of the run, not by the clock.
        A day is 24 hours of simulation time, not a calendar date.
      </p>
      <p className="hotspot_heatmap_note">
        {table.peak && busiest
          ? `Most people at once: ${table.peak.people.toLocaleString('en-US')} on day ${
              table.peak.day + 1
            }, hour ${hourNumber(table.peak.hour)}. On an average day it is busiest at hour ${hourNumber(
              busiest.hour
            )} (${formatMean(busiest.mean)} people).`
          : 'Nobody is recorded at this place during the run.'}
      </p>
      {infectionsLeftOut && (
        <p className="hotspot_heatmap_note">
          The new infections of this place could not be loaded or matched to this
          run, so that column is left out.
        </p>
      )}
      <section
        className="hotspot_heatmap_scroll facility_hours_scroll"
        aria-label="People present by day and hour, scrollable"
        // biome-ignore lint/a11y/noNoninteractiveTabindex: a region that scrolls must be reachable from the keyboard
        tabIndex={0}
      >
        <table className="hotspot_heatmap_table">
          <caption className="sr-only">
            People present at {place.label} per hour of each simulation day
            {table.hasIncidence ? ', and new infections per day' : ''}
          </caption>
          <thead>
            <tr>
              <th
                scope="col"
                className="hotspot_heatmap_corner facility_hours_corner"
              >
                Day
              </th>
              {hours.map((hour) => (
                <th
                  key={hour}
                  scope="col"
                  className="hotspot_heatmap_day facility_hours_head"
                >
                  <span className="sr-only">Hour </span>
                  {hourNumber(hour)}
                </th>
              ))}
              {table.hasIncidence && (
                <th
                  scope="col"
                  className="hotspot_heatmap_day facility_hours_head facility_hours_infections"
                >
                  New infections
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {table.cells.map((row, day) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: the days of a run are a fixed list in order
              <tr key={day}>
                <th scope="row" className="hotspot_heatmap_name">
                  <span className="hotspot_heatmap_label">Day {day + 1}</span>
                  {day === table.days - 1 && lastDayHours < HOURS_PER_DAY && (
                    <span className="hotspot_heatmap_daynote">
                      first {lastDayHours} h
                    </span>
                  )}
                </th>
                {row.map((cell, hour) => {
                  if (cell === null) {
                    return (
                      <td
                        // biome-ignore lint/suspicious/noArrayIndexKey: the hours of a day are a fixed list in order
                        key={hour}
                        aria-hidden="true"
                        className="facility_hours_cell facility_hours_cell_empty"
                      />
                    );
                  }
                  const color = presenceColor(cell.people, table.maxPeople);
                  return (
                    <td
                      // biome-ignore lint/suspicious/noArrayIndexKey: the hours of a day are a fixed list in order
                      key={hour}
                      className="hotspot_heatmap_cell facility_hours_cell"
                      style={{
                        background: color.background,
                        color: color.color
                      }}
                      title={describeHour(day, hour, cell)}
                    >
                      {cell.people > 0 ? (
                        cell.people.toLocaleString('en-US')
                      ) : (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="sr-only">0</span>
                        </>
                      )}
                    </td>
                  );
                })}
                {table.hasIncidence && (
                  <td className="hotspot_heatmap_total facility_hours_total">
                    {(table.perDay[day].newInfections ?? 0).toLocaleString(
                      'en-US'
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" className="hotspot_heatmap_name">
                <span className="hotspot_heatmap_label">Average</span>
              </th>
              {table.meanByHour.map((mean, hour) => (
                <td
                  // biome-ignore lint/suspicious/noArrayIndexKey: the hours of a day are a fixed list in order
                  key={hour}
                  className="hotspot_heatmap_total facility_hours_cell"
                >
                  {formatMean(mean)}
                </td>
              ))}
              {table.hasIncidence && (
                <td className="hotspot_heatmap_total facility_hours_total">
                  Total{' '}
                  {(table.totalNewInfections ?? 0).toLocaleString('en-US')}
                </td>
              )}
            </tr>
          </tfoot>
        </table>
      </section>
      {table.maxPeople > 0 && <Legend maxPeople={table.maxPeople} />}
    </>
  );
}

// What a screen reader is told about the state of the load; see the status
// region in FacilityHours.
function statusText(
  state: PlaceSeriesState,
  failure: HourlyFailure | null
): string {
  switch (state.status) {
    case 'loading':
      return 'Loading this place…';
    case 'error':
      return state.message;
    case 'ready':
      return failure ? MESSAGES[failure] : 'The hours of this place are loaded.';
    default:
      return '';
  }
}

// "Busy hours at a place": how many people are at the selected place in each
// hour of each day, and its new infections per day. Loaded only when the
// section is opened, for the place selected in the ranking; it follows that
// place and the run the panel shows.
export default function FacilityHours({
  simId,
  timesteps,
  place,
  wholeRun
}: {
  simId: number | null;
  timesteps: readonly number[] | null;
  // The place selected in the ranking, null when none is (or a home is).
  place: FacilityPlace | null;
  wholeRun: RunIncidence | null;
}) {
  const [open, setOpen] = useState(false);
  const headingId = useId();
  const bodyId = useId();
  const placeId = place ? place.id : null;
  const { state, retry } = usePlaceSeries({
    enabled: open,
    simId,
    placeId
  });

  const expected =
    wholeRun && placeId !== null ? (wholeRun.places[placeId] ?? 0) : null;
  const built = useMemo(
    () =>
      state.status === 'ready'
        ? buildPlaceTable({
            timesteps,
            presence: state.series.presence,
            incidence: state.series.incidence,
            expectedNewInfections: expected
          })
        : null,
    [state, timesteps, expected]
  );
  const failure = built && !built.result.ok ? built.result.reason : null;

  return (
    <section className="hotspot_heatmap" aria-labelledby={headingId}>
      <div className="hotspot_heatmap_header">
        <h3 id={headingId} className="poi_rankings_subtitle">
          Busy hours at a place
        </h3>
        <button
          type="button"
          className="hotspot_heatmap_toggle"
          aria-expanded={open}
          aria-controls={open ? bodyId : undefined}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? 'Hide' : 'Show hours'}
        </button>
      </div>
      {/* Mounted before the section is opened and left empty until then, so
          that the first message is a CHANGE of an existing live region, which
          screen readers announce more reliably than a region that appears with
          its text. It sits outside the busy body. */}
      <output className="sr-only">
        {open && place ? statusText(state, failure) : ''}
      </output>
      {open && (
        <div
          id={bodyId}
          className="hotspot_heatmap_body"
          aria-busy={state.status === 'loading'}
        >
          {!place && (
            <div className="hotspot_empty">
              Select a place in the ranking above, or click one on the map in
              Markers view, to see when it is busy.
            </div>
          )}
          {place && state.status === 'loading' && (
            <div className="hotspot_empty" aria-hidden="true">
              Loading this place…
            </div>
          )}
          {place && state.status === 'error' && (
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
          {place && failure && (
            <div className="hotspot_empty">{MESSAGES[failure]}</div>
          )}
          {place && built?.result.ok && (
            <HoursTable
              place={place}
              table={built.result.value}
              infectionsLeftOut={built.infectionsLeftOut}
            />
          )}
        </div>
      )}
    </section>
  );
}
