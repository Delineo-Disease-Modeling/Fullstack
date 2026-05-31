'use client';

import { useEffect, useState } from 'react';
import useSimSettings, {
  DEFAULT_INTERVENTION_VALUES,
  type InterventionValues,
  type Interventions
} from '@/stores/simsettings';
import { SimParameter } from './settings-components';

import '@/styles/intervention-timeline.css';

const INTERVENTION_VALUE_KEYS = [
  'mask',
  'vaccine',
  'capacity',
  'lockdown',
  'selfiso'
] as const satisfies readonly (keyof InterventionValues)[];

function valuesMatch(a: InterventionValues, b: InterventionValues) {
  return INTERVENTION_VALUE_KEYS.every((k) => a[k] === b[k]);
}

const pad = (n: number) => n.toString().padStart(3, '0');

export default function InterventionTimeline() {
  const hours = useSimSettings((state) => state.hours);
  const zone = useSimSettings((state) => state.zone);
  const interventions = useSimSettings((state) => state.interventions);
  const addInterventions = useSimSettings((state) => state.addInterventions);
  const deleteInterventions = useSimSettings(
    (state) => state.deleteInterventions
  );

  const sorted = [...interventions].sort((a, b) => a.time - b.time);

  const [draftTime, setDraftTime] = useState(1);
  const [draft, setDraft] = useState<InterventionValues>({
    ...DEFAULT_INTERVENTION_VALUES
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (draftTime > hours) setDraftTime(Math.max(1, hours));
  }, [hours, draftTime]);

  const previous: Interventions =
    sorted.reduce<Interventions | null>(
      (best, cur) =>
        cur.time < draftTime && (!best || cur.time > best.time) ? cur : best,
      null
    ) ?? sorted[0];

  const handleAdd = () => {
    if (sorted.some((i) => i.time === draftTime)) {
      setError(`An intervention already exists at hour ${pad(draftTime)}.`);
      return;
    }
    if (previous && valuesMatch(draft, previous)) {
      const label =
        previous.time === 0
          ? 'the seed intervention'
          : `the previous intervention at hour ${pad(previous.time)}`;
      setError(`No change from ${label} — adjust a percentage before adding.`);
      return;
    }
    addInterventions(draftTime, draft);
    setError(null);
  };

  const updateDraft = (next: Partial<InterventionValues>) => {
    setDraft((d) => ({ ...d, ...next }));
    setError(null);
  };

  const onTrackPointerDown = (e: React.PointerEvent<HTMLFieldSetElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const t = Math.max(1, Math.min(hours, Math.round(ratio * hours)));
    setDraftTime(t);
    setError(null);
  };

  const dateAt = (hour: number) =>
    zone
      ? new Date(
          new Date(zone.start_date).getTime() + hour * 60 * 60 * 1000
        ).toLocaleString('en-US', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
          weekday: 'short',
          hour: '2-digit',
          minute: '2-digit'
        })
      : null;

  return (
    <div className="flex flex-col w-full max-w-250 gap-4">
      <fieldset
        className="iv_timeline_track"
        aria-label="New intervention timeline"
        onPointerDown={onTrackPointerDown}
      >
        <div className="iv_timeline_track_line" />

        {sorted.map((i) => (
          <input
            key={`marker-${i.time}`}
            className={`iv_timeline_marker${i.time === 0 ? ' seed' : ''}`}
            type="range"
            min={0}
            max={hours}
            value={i.time}
            readOnly
            tabIndex={-1}
            aria-hidden
          />
        ))}

        <input
          className="iv_timeline_draft"
          type="range"
          min={1}
          max={hours}
          value={draftTime}
          onChange={(e) => {
            setDraftTime(+e.target.value);
            setError(null);
          }}
          aria-label="New intervention hour"
        />
      </fieldset>

      <div className="iv_intervention_label">
        <span className="iv_intervention_index">New Intervention</span>
        <span className="iv_intervention_hour">Hour {pad(draftTime)}</span>
        {zone && (
          <span className="iv_intervention_date">{dateAt(draftTime)}</span>
        )}
      </div>

      <div className="iv_sliders_grid">
        <SimParameter
          label="Percent Masking"
          value={draft.mask}
          callback={(mask) => updateDraft({ mask })}
          info="Proportion of people who wear masks, reducing the probability of disease transmission between individuals."
        />
        <SimParameter
          label="Percent Vaccinated"
          value={draft.vaccine}
          callback={(vaccine) => updateDraft({ vaccine })}
          info="Proportion of the population that is vaccinated, reducing individual susceptibility to infection."
        />
        <SimParameter
          label="Maximum Facility Capacity"
          value={draft.capacity}
          callback={(capacity) => updateDraft({ capacity })}
          info="Scales the maximum occupancy of every facility. At 50%, a venue that holds 100 people caps at 50, and anyone over the limit is sent home."
          disabled
        />
        <SimParameter
          label="Lockdown Probability"
          value={draft.lockdown}
          callback={(lockdown) => updateDraft({ lockdown })}
          info="Chance that any person stays home instead of travelling to a facility during a movement event. Applies regardless of health status."
        />
        <SimParameter
          label="Self-Isolation Percent"
          value={draft.selfiso}
          callback={(selfiso) => updateDraft({ selfiso })}
          info="Chance that a symptomatic (visibly ill) person stays home instead of going to a facility, modelling voluntary quarantine behaviour."
        />
      </div>

      <div className="flex flex-col items-center gap-2">
        <button
          type="button"
          className="iv_control_btn iv_control_btn--add"
          onClick={handleAdd}
        >
          + Add Intervention
        </button>
        {error && (
          <div className="iv_timeline_error" role="alert">
            {error}
          </div>
        )}
      </div>

      <div className="iv_committed_list">
        {sorted.map((i, idx) => (
          <div key={i.time} className="iv_committed_row">
            <div className="iv_committed_label">
              {idx === 0 ? 'Seed' : `Intervention #${idx + 1}`}
            </div>
            <div className="iv_committed_hour">Hour {pad(i.time)}</div>
            <div className="iv_committed_values">
              <span>Mask {Math.ceil(i.mask * 100)}%</span>
              <span>Vaccine {Math.ceil(i.vaccine * 100)}%</span>
              <span>Capacity {Math.ceil(i.capacity * 100)}%</span>
              <span>Lockdown {Math.ceil(i.lockdown * 100)}%</span>
              <span>Self-iso {Math.ceil(i.selfiso * 100)}%</span>
            </div>
            {idx !== 0 && (
              <button
                type="button"
                className="iv_committed_delete"
                onClick={() => deleteInterventions(i.time)}
                aria-label={`Delete intervention at hour ${pad(i.time)}`}
              >
                Delete
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
