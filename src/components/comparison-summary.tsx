'use client';

import { useEffect, useState } from 'react';
import {
  computeOutcomeStats,
  fetchChartData,
  type OutcomeStats
} from '@/lib/chartdata-client';

/** A scenario compared against the reference run (e.g. baseline, disabled POIs). */
export interface ComparisonScenario {
  simId: number;
  label: string;
}

interface ComparisonSummaryProps {
  /** The anchor run every other scenario is measured against (the current/intervention run). */
  referenceSimId: number;
  referenceLabel?: string;
  scenarios: ComparisonScenario[];
  title?: string;
  note?: string | null;
}

type Delta = { text: string; tone: string };

type LoadedStats = {
  label: string;
  stats: OutcomeStats;
};

type Loaded = {
  reference: OutcomeStats;
  scenarios: LoadedStats[];
};

const MUTED_TONE = 'text-(--color-text-muted)';
// Green = the better epidemic outcome (fewer infections / a later, flatter peak);
// amber = the worse one. Always read relative to the reference (intervention) run.
const GOOD_TONE = 'text-green-600';
const BAD_TONE = 'text-amber-600';

/** Metrics where fewer is better (peak, total infected), measured vs. the reference run. */
function lowerIsBetterDelta(referenceValue: number, value: number): Delta {
  if (referenceValue <= 0) return { text: '—', tone: MUTED_TONE };
  const pct = ((value - referenceValue) / referenceValue) * 100;
  if (Math.abs(pct) < 0.5) return { text: 'about the same', tone: MUTED_TONE };
  if (pct < 0)
    return { text: `↓ ${Math.abs(pct).toFixed(0)}% lower`, tone: GOOD_TONE };
  return { text: `↑ ${pct.toFixed(0)}% higher`, tone: BAD_TONE };
}

/** Time-to-peak: a later peak (a flattened curve) is the win. */
function peakTimingDelta(referenceHours: number, hours: number): Delta {
  const deltaDays = (hours - referenceHours) / 24;
  if (Math.abs(deltaDays) < 0.05)
    return { text: 'same timing', tone: MUTED_TONE };
  if (deltaDays > 0)
    return { text: `${deltaDays.toFixed(1)} days later`, tone: GOOD_TONE };
  return {
    text: `${Math.abs(deltaDays).toFixed(1)} days earlier`,
    tone: BAD_TONE
  };
}

const countFmt = (n: number) => Math.round(n).toLocaleString();
const daysFmt = (hours: number) => `${(hours / 24).toFixed(1)} days`;

type Row = { label: string; value: string; delta: Delta | null };

function MetricCard({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <div className="rounded-lg border border-(--color-border-light) bg-(--color-bg-ivory) p-4 flex flex-col gap-3">
      <span className={`text-xs uppercase tracking-wide ${MUTED_TONE}`}>
        {title}
      </span>
      <div className="flex flex-col gap-2 text-sm">
        {rows.map((row, i) => (
          <div key={row.label} className="flex flex-col">
            <div className="flex items-baseline justify-between gap-3">
              <span className={i === 0 ? 'font-medium' : MUTED_TONE}>
                {row.label}
              </span>
              <span className="font-semibold tabular-nums whitespace-nowrap">
                {row.value}
              </span>
            </div>
            <span
              className={`text-xs font-medium text-right whitespace-nowrap ${
                row.delta ? row.delta.tone : MUTED_TONE
              }`}
            >
              {row.delta ? row.delta.text : 'reference'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ComparisonSummary({
  referenceSimId,
  referenceLabel = 'Interventions',
  scenarios,
  title = 'Scenario comparison',
  note = 'Tip: for a clean comparison, disable “Random Seed” before running so every scenario shares the same seed — otherwise some of the difference is stochastic noise rather than the change you made.'
}: ComparisonSummaryProps) {
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Primitive keys so the effect only refetches when the set of runs changes,
  // not on every parent re-render (scenarios is a fresh array each render).
  const scenariosKey = JSON.stringify(
    scenarios.map((scenario) => ({
      simId: scenario.simId,
      label: scenario.label
    }))
  );

  useEffect(() => {
    const scenarioEntries = JSON.parse(scenariosKey) as ComparisonScenario[];

    if (referenceSimId == null || scenarioEntries.length === 0) {
      return;
    }

    const controller = new AbortController();
    const { signal } = controller;
    setData(null);
    setError(null);

    (async () => {
      try {
        const ids = [referenceSimId, ...scenarioEntries.map((s) => s.simId)];
        const charts = await Promise.all(
          ids.map((id) => fetchChartData(id, null, signal))
        );
        if (signal.aborted) return;
        setData({
          reference: computeOutcomeStats(charts[0]),
          scenarios: scenarioEntries.map((s, i) => ({
            label: s.label,
            stats: computeOutcomeStats(charts[i + 1])
          }))
        });
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        console.error('Comparison summary failed:', err);
        setError('Comparison summary unavailable.');
      }
    })();

    return () => controller.abort();
  }, [referenceSimId, scenariosKey]);

  if (referenceSimId == null || scenarios.length === 0) {
    return null;
  }

  const cards: { title: string; rows: Row[] }[] = data
    ? [
        {
          title: 'Peak infections',
          rows: [
            {
              label: referenceLabel,
              value: countFmt(data.reference.peakInfected),
              delta: null
            },
            ...data.scenarios.map((s) => ({
              label: s.label,
              value: countFmt(s.stats.peakInfected),
              delta: lowerIsBetterDelta(
                data.reference.peakInfected,
                s.stats.peakInfected
              )
            }))
          ]
        },
        {
          title: 'Time to peak',
          rows: [
            {
              label: referenceLabel,
              value: daysFmt(data.reference.peakTimeHours),
              delta: null
            },
            ...data.scenarios.map((s) => ({
              label: s.label,
              value: daysFmt(s.stats.peakTimeHours),
              delta: peakTimingDelta(
                data.reference.peakTimeHours,
                s.stats.peakTimeHours
              )
            }))
          ]
        },
        {
          title: 'Total infected',
          rows: [
            {
              label: referenceLabel,
              value: countFmt(data.reference.totalInfected),
              delta: null
            },
            ...data.scenarios.map((s) => ({
              label: s.label,
              value: countFmt(s.stats.totalInfected),
              delta: lowerIsBetterDelta(
                data.reference.totalInfected,
                s.stats.totalInfected
              )
            }))
          ]
        }
      ]
    : [];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-md font-semibold">{title}</h3>
        {!data && !error && (
          <span className={`text-xs ${MUTED_TONE}`}>Loading comparison…</span>
        )}
      </div>

      {error ? (
        <p className={`text-sm ${MUTED_TONE}`}>{error}</p>
      ) : data ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {cards.map((card) => (
              <MetricCard key={card.title} title={card.title} rows={card.rows} />
            ))}
          </div>
          {note && <p className={`text-xs italic ${MUTED_TONE}`}>{note}</p>}
        </>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="rounded-lg border border-(--color-border-light) bg-(--color-bg-ivory) h-28 animate-pulse"
            />
          ))}
        </div>
      )}
    </div>
  );
}
