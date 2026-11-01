import Link from 'next/link';
import { useId, useMemo, useState } from 'react';
import {
  describeSeedCheck,
  placeLabels,
  RERUN_COUNT,
  type RunRow,
  summarizeSeedCheck
} from '@/lib/seed-check';
import { useSeedCheck } from '@/lib/use-seed-check';

type PlaceLabel = { id: string; label: string; top_category?: string };

// The stand-in for workplaces outside the zone has this category.
const EXTERNAL_CATEGORY = 'External';

function rowName(index: number) {
  return index === 0 ? 'This run' : `Other seed ${index}`;
}

function ResultTable({
  rows,
  labelOf
}: {
  rows: readonly RunRow[];
  labelOf: (placeId: string) => string;
}) {
  return (
    <table className="seed_check_table">
      <caption className="sr-only">
        Total new infections and top hotspot of this run and of the runs with
        other random seeds
      </caption>
      <thead>
        <tr>
          <th scope="col">Run</th>
          <th scope="col" className="seed_check_number">
            New infections
          </th>
          <th scope="col">Top hotspot</th>
          <th scope="col">
            <span className="sr-only">Open</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr key={row.simId}>
            <th scope="row">{rowName(index)}</th>
            <td className="seed_check_number">
              {row.total.toLocaleString('en-US')}
            </td>
            <td>{row.topPlaceId === null ? '—' : labelOf(row.topPlaceId)}</td>
            <td>
              {index > 0 && (
                <Link href={`/simulator/${row.simId}`}>
                  Open<span className="sr-only"> {rowName(index)}</span>
                </Link>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// "Check against other random seeds": a run is one random draw. This runs the
// same settings a few more times, one after another, each with a fresh seed,
// and shows how far the whole-run numbers move. Nothing starts until the button
// is pressed, and the button says that it starts simulations.
export default function SeedCheck({
  simId,
  places
}: {
  simId: number | null;
  places: readonly PlaceLabel[] | null;
}) {
  const [open, setOpen] = useState(false);
  const headingId = useId();
  const bodyId = useId();
  const { labels, outside } = useMemo(() => {
    const map = placeLabels(places);
    const external = new Map<string, string>();
    for (const place of places ?? []) {
      if (place.top_category === EXTERNAL_CATEGORY) {
        external.set(
          String(place.id),
          map.get(String(place.id)) ?? place.label
        );
      }
    }
    return { labels: map, outside: external };
  }, [places]);
  const outsideIds = useMemo(() => new Set(outside.keys()), [outside]);
  const { state, start, stop } = useSeedCheck(simId, outsideIds);
  const labelOf = (placeId: string) =>
    labels.get(placeId) ?? `Place ${placeId}`;

  const rows = state.status === 'idle' ? [] : state.rows;
  const summary = useMemo(() => summarizeSeedCheck(rows), [rows]);
  const running = state.status === 'running';
  const finishedRerunCount = Math.max(0, rows.length - 1);
  const status =
    state.status === 'running'
      ? rows.length === 0
        ? 'Preparing…'
        : `Run ${Math.min(finishedRerunCount + 1, RERUN_COUNT)} of ${RERUN_COUNT}${
            state.progress !== null ? `, ${Math.round(state.progress)}%` : ''
          }…`
      : state.status === 'done'
        ? `All ${RERUN_COUNT} runs finished.`
        : state.status === 'stopped'
          ? `Stopped after ${finishedRerunCount} of ${RERUN_COUNT} runs.`
          : state.status === 'error'
            ? state.message
            : '';

  return (
    <section className="hotspot_heatmap" aria-labelledby={headingId}>
      <div className="hotspot_heatmap_header">
        <h3 id={headingId} className="poi_rankings_subtitle">
          Check against other random seeds
        </h3>
        <button
          type="button"
          className="hotspot_heatmap_toggle"
          aria-expanded={open}
          aria-controls={open ? bodyId : undefined}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? 'Hide' : 'Show'}
        </button>
      </div>
      <output className="sr-only">{open ? status : ''}</output>
      {open && (
        <div id={bodyId} className="hotspot_heatmap_body seed_check_body">
          <p className="hotspot_heatmap_note">
            A run is one random draw. This starts {RERUN_COUNT} more simulations
            with the same settings and the same initially infected people, one
            after another, each with a different random seed. They are kept as
            runs that are not saved: each can be opened by its link until the
            cleanup removes it. They use the website's default DMP matrix, as a
            new run from the form does. It shows how far the numbers of this run
            can move.
          </p>
          {state.status === 'idle' && (
            <div>
              <button
                type="button"
                className="hotspot_heatmap_toggle"
                disabled={simId == null}
                onClick={start}
              >
                Run {RERUN_COUNT} more times
              </button>
            </div>
          )}
          {running && (
            <div className="seed_check_progress">
              <span aria-hidden="true">{status}</span>
              <button
                type="button"
                className="hotspot_window_retry"
                onClick={stop}
              >
                Stop
              </button>
            </div>
          )}
          {state.status === 'error' && (
            <div className="seed_check_progress">
              <span className="hotspot_window_error">{state.message}</span>
              <button
                type="button"
                className="hotspot_window_retry"
                onClick={start}
              >
                Try again
              </button>
            </div>
          )}
          {state.status === 'stopped' && (
            <div className="seed_check_progress">
              <span>{status}</span>
              <button
                type="button"
                className="hotspot_window_retry"
                onClick={start}
              >
                Run again
              </button>
            </div>
          )}
          {summary && rows.length >= 2 && (
            <>
              {describeSeedCheck(summary, labelOf).map((line) => (
                <p key={line} className="seed_check_line">
                  {line}
                </p>
              ))}
              <div className="hotspot_heatmap_scroll">
                <ResultTable rows={rows} labelOf={labelOf} />
              </div>
              {outside.size > 0 && (
                <p className="hotspot_heatmap_note">
                  Places outside the zone, such as {[...outside.values()][0]},
                  are not counted as the top hotspot; their infections are in
                  the totals.
                </p>
              )}
              <p className="hotspot_heatmap_note">
                {state.status === 'done'
                  ? `These ${summary.runs} runs show how far one run can move. They are not a confidence interval.`
                  : 'Runs finished so far. One run can move this far; these are not a confidence interval.'}
              </p>
              {state.status === 'done' && (
                <div>
                  <button
                    type="button"
                    className="hotspot_window_retry"
                    onClick={start}
                  >
                    Run again
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
