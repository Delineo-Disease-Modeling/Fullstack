'use client';

import { useEffect, useState } from 'react';
import {
  computeOutcomeStats,
  fetchChartData,
  type OutcomeStats
} from '@/lib/chartdata-client';

interface ComparisonSummaryProps {
  interventionSimId: number;
  baselineSimId: number;
}

type Pair = { baseline: OutcomeStats; intervention: OutcomeStats };

type Delta = { text: string; tone: string };

const MUTED_TONE = 'text-(--color-text-muted)';

function reductionPct(baseline: number, intervention: number): number | null {
  if (baseline <= 0) return null;
  return ((baseline - intervention) / baseline) * 100;
}

/** Metrics where a lower intervention value is the win (peak, total infected). */
function betterWhenLower(
  baseline: number,
  intervention: number,
  noun: string
): Delta {
  const r = reductionPct(baseline, intervention);
  if (r === null) return { text: '—', tone: MUTED_TONE };
  if (Math.abs(r) < 0.5) return { text: `About the same ${noun}`, tone: MUTED_TONE };
  if (r > 0) {
    return { text: `↓ ${r.toFixed(0)}% lower ${noun}`, tone: 'text-green-600' };
  }
  return {
    text: `↑ ${Math.abs(r).toFixed(0)}% higher ${noun}`,
    tone: 'text-amber-600'
  };
}

/** Time-to-peak: a later intervention peak (a flattened curve) is the win. */
function peakTimingDelta(baselineHours: number, interventionHours: number): Delta {
  const deltaDays = (interventionHours - baselineHours) / 24;
  if (Math.abs(deltaDays) < 0.05) return { text: 'Same timing', tone: MUTED_TONE };
  if (deltaDays > 0) {
    return { text: `Peak delayed ${deltaDays.toFixed(1)} days`, tone: 'text-green-600' };
  }
  return {
    text: `Peak ${Math.abs(deltaDays).toFixed(1)} days earlier`,
    tone: 'text-amber-600'
  };
}

const countFmt = (n: number) => Math.round(n).toLocaleString();
const daysFmt = (hours: number) => `${(hours / 24).toFixed(1)} days`;

function StatCard({
  title,
  baselineLabel,
  interventionLabel,
  delta
}: {
  title: string;
  baselineLabel: string;
  interventionLabel: string;
  delta: Delta;
}) {
  return (
    <div className="rounded-lg border border-(--color-border-light) bg-(--color-bg-ivory) p-4 flex flex-col gap-3">
      <span className={`text-xs uppercase tracking-wide ${MUTED_TONE}`}>
        {title}
      </span>
      <div className="flex flex-col gap-1 text-sm">
        <div className="flex justify-between gap-3">
          <span className={MUTED_TONE}>Baseline</span>
          <span className="font-semibold tabular-nums">{baselineLabel}</span>
        </div>
        <div className="flex justify-between gap-3">
          <span className={MUTED_TONE}>Interventions</span>
          <span className="font-semibold tabular-nums">{interventionLabel}</span>
        </div>
      </div>
      <span className={`text-sm font-medium ${delta.tone}`}>{delta.text}</span>
    </div>
  );
}

export default function ComparisonSummary({
  interventionSimId,
  baselineSimId
}: ComparisonSummaryProps) {
  const [pair, setPair] = useState<Pair | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    setPair(null);
    setError(null);

    (async () => {
      try {
        const [interventionStats, baselineStats] = await Promise.all([
          fetchChartData(interventionSimId, null, signal),
          fetchChartData(baselineSimId, null, signal)
        ]);
        if (signal.aborted) return;
        setPair({
          intervention: computeOutcomeStats(interventionStats),
          baseline: computeOutcomeStats(baselineStats)
        });
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        console.error('Comparison summary failed:', err);
        setError('Comparison summary unavailable.');
      }
    })();

    return () => controller.abort();
  }, [interventionSimId, baselineSimId]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-md font-semibold">Interventions vs. baseline</h3>
        {!pair && !error && (
          <span className={`text-xs ${MUTED_TONE}`}>Loading comparison…</span>
        )}
      </div>

      {error ? (
        <p className={`text-sm ${MUTED_TONE}`}>{error}</p>
      ) : pair ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <StatCard
              title="Peak infections"
              baselineLabel={countFmt(pair.baseline.peakInfected)}
              interventionLabel={countFmt(pair.intervention.peakInfected)}
              delta={betterWhenLower(
                pair.baseline.peakInfected,
                pair.intervention.peakInfected,
                'peak'
              )}
            />
            <StatCard
              title="Time to peak"
              baselineLabel={daysFmt(pair.baseline.peakTimeHours)}
              interventionLabel={daysFmt(pair.intervention.peakTimeHours)}
              delta={peakTimingDelta(
                pair.baseline.peakTimeHours,
                pair.intervention.peakTimeHours
              )}
            />
            <StatCard
              title="Total infected"
              baselineLabel={countFmt(pair.baseline.totalInfected)}
              interventionLabel={countFmt(pair.intervention.totalInfected)}
              delta={betterWhenLower(
                pair.baseline.totalInfected,
                pair.intervention.totalInfected,
                'total'
              )}
            />
          </div>
          <p className={`text-xs italic ${MUTED_TONE}`}>
            Tip: for a clean paired comparison, disable “Random Seed” before
            running so both runs share the same seed — otherwise some of the
            difference is stochastic noise rather than the interventions.
          </p>
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
