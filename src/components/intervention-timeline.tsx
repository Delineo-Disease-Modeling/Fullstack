'use client';

import { useEffect, useState } from 'react';
import useSimSettings from '@/stores/simsettings';

import '@/styles/intervention-timeline.css';
import Interventions from './interventions';

export default function InterventionTimeline() {
  const hours = useSimSettings((state) => state.hours);
  const zone = useSimSettings((state) => state.zone);
  const _interventions = useSimSettings((state) => state.interventions);

  const addInterventions = useSimSettings((state) => state.addInterventions);
  const setInterventions = useSimSettings((state) => state.setInterventions);
  const deleteInterventions = useSimSettings(
    (state) => state.deleteInterventions
  );

  const [values, setValues] = useState([0]);
  const [curtime, setCurtime] = useState(0);

  const getTrackTime = (clientX: number, track: HTMLDivElement) => {
    const rect = track.getBoundingClientRect();
    if (rect.width <= 0) return curtime;
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return Math.round(ratio * hours);
  };

  const isTimelineThumb = (target: EventTarget | null) =>
    target instanceof HTMLInputElement &&
    target.classList.contains('iv_timeline');

  const moveIntervention = (fromTime: number, toTime: number) => {
    if (fromTime === toTime) return;
    if (values.includes(toTime)) {
      setCurtime(toTime);
      return;
    }

    setInterventions(fromTime, { time: toTime });
    setValues((cur) =>
      cur
        .map((value) => (value === fromTime ? toTime : value))
        .sort((a, b) => a - b)
    );
    setCurtime(toTime);
  };

  useEffect(() => {
    const unused = Array.from({ length: hours }, (_, i) => i + 1).filter(
      (v) => !values.includes(v)
    );

    for (let i = 0; i < values.length; i++) {
      if (values[i] > hours) {
        const newtime = unused.pop();
        if (newtime !== undefined) {
          setInterventions(values[i], { time: newtime });
          setValues((cur) => [...cur].with(i, newtime));
          if (curtime === values[i]) setCurtime(newtime);
        }
      }
    }
  }, [curtime, setInterventions, hours, values]);

  const moveSelectedThumb = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isTimelineThumb(e.target)) return;
    moveIntervention(curtime, getTrackTime(e.clientX, e.currentTarget));
  };

  const deleteThumb = (i: number) => {
    if (values[i] === 0 || values.length === 1) return;
    const next = [...values].filter((_, idx) => idx !== i);
    deleteInterventions(values[i]);
    setValues(next);
    setCurtime(next[next.length - 1]);
  };

  const moveLeft = () => {
    const sorted = [...values].sort((a, b) => a - b);
    if (curtime === sorted[0]) setCurtime(sorted[sorted.length - 1]);
    else setCurtime(sorted[sorted.indexOf(curtime) - 1]);
  };

  const moveRight = () => {
    const sorted = [...values].sort((a, b) => a - b);
    if (curtime === sorted[sorted.length - 1]) setCurtime(sorted[0]);
    else setCurtime(sorted[sorted.indexOf(curtime) + 1]);
  };

  const nextAddTime = Array.from({ length: hours }, (_, i) => i + 1).find(
    (value) => !values.includes(value)
  );

  return (
    <div className="flex flex-col w-full max-w-250 gap-4">
      <div
        className="relative flex items-center w-full h-8 select-none cursor-pointer"
        onPointerDown={moveSelectedThumb}
      >
        <div className="absolute top-1/2 -translate-y-1/2 left-0 w-full h-1.5 bg-(--color-border-subtle) rounded-full outline-0" />
        {values.map((value, i) => (
          <input
            key={value}
            className={`iv_timeline absolute top-1/2 -translate-y-1/2 left-0 w-full ${curtime === value ? 'current ' : ''}`}
            type="range"
            min={0}
            max={hours}
            value={value}
            aria-label={`Intervention ${i + 1} hour`}
            onChange={(e) => {
              const nextTime = +e.target.value;
              if (values.includes(nextTime) && nextTime !== value) return;
              setInterventions(values[i], { time: nextTime });
              setValues((cur) => cur.with(i, nextTime).sort((a, b) => a - b));
              setCurtime(nextTime);
            }}
            onMouseDownCapture={(e) =>
              setCurtime(+(e.target as HTMLInputElement).value)
            }
            onContextMenu={(e) => {
              e.preventDefault();
              deleteThumb(i);
            }}
          />
        ))}
      </div>

      <div className="flex w-full items-center justify-center">
        <div className="iv_controls">
          <button
            type="button"
            className="iv_control_btn"
            onClick={moveLeft}
            disabled={values.length <= 1}
            aria-label="Previous intervention"
          >
            ‹
          </button>
          <button
            type="button"
            className="iv_control_btn iv_control_btn--danger"
            onClick={() => deleteThumb(values.indexOf(curtime))}
            disabled={values.length <= 1}
          >
            Delete
          </button>
          <button
            type="button"
            className="iv_control_btn iv_control_btn--add"
            onClick={() => {
              if (nextAddTime === undefined) return;
              addInterventions(nextAddTime);
              setValues((cur) => [...cur, nextAddTime].sort((a, b) => a - b));
              setCurtime(nextAddTime);
            }}
            disabled={values.length >= 10 || nextAddTime === undefined}
          >
            + Add
          </button>
          <button
            type="button"
            className="iv_control_btn"
            onClick={moveRight}
            disabled={values.length <= 1}
            aria-label="Next intervention"
          >
            ›
          </button>
        </div>
      </div>

      <div className="iv_intervention_label">
        <span className="iv_intervention_index">
          Intervention #{values.indexOf(curtime) + 1}
        </span>
        <span className="iv_intervention_hour">
          Hour {curtime.toString().padStart(3, '0')}
        </span>
        {zone && (
          <span className="iv_intervention_date">
            {new Date(
              new Date(zone.start_date).getTime() + curtime * 60 * 60 * 1000
            ).toLocaleString('en-US', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
              weekday: 'short',
              hour: '2-digit',
              minute: '2-digit'
            })}
          </span>
        )}
      </div>

      <Interventions time={curtime} />
    </div>
  );
}
