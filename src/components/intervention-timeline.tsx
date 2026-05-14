'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import useSimSettings from '@/stores/simsettings';

import '@/styles/intervention-timeline.css';
import Interventions from './interventions';

export default function InterventionTimeline() {
  const hours = useSimSettings((state) => state.hours);
  const zone = useSimSettings((state) => state.zone);
  const interventions = useSimSettings((state) => state.interventions);

  const addInterventions = useSimSettings((state) => state.addInterventions);
  const setInterventions = useSimSettings((state) => state.setInterventions);
  const deleteInterventions = useSimSettings(
    (state) => state.deleteInterventions
  );

  const [curtime, setCurtime] = useState(0);
  const values = useMemo(
    () =>
      Array.from(new Set(interventions.map((intervention) => intervention.time))).sort(
        (a, b) => a - b
      ),
    [interventions]
  );
  const timelineValues = values.filter((value) => value > 0);
  const dragTimeRef = useRef<number | null>(null);
  const pointerDragRef = useRef(false);
  const valuesRef = useRef(values);

  useEffect(() => {
    valuesRef.current = values;
  }, [values]);

  const getTrackTime = (clientX: number, track: HTMLElement) => {
    const rect = track.getBoundingClientRect();
    if (rect.width <= 0) return curtime;
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return Math.min(hours, Math.max(1, Math.round(ratio * hours)));
  };

  const moveIntervention = (fromTime: number, toTime: number) => {
    const nextTime = Math.min(hours, Math.max(1, toTime));
    if (fromTime === 0 || fromTime === nextTime) return;
    if (values.includes(nextTime)) {
      setCurtime(nextTime);
      return;
    }

    setInterventions(fromTime, { time: nextTime });
    setCurtime(nextTime);
  };

  const moveDraggedIntervention = (fromTime: number, toTime: number) => {
    const nextTime = Math.min(hours, Math.max(1, toTime));
    if (fromTime === 0 || fromTime === nextTime) return fromTime;
    if (valuesRef.current.includes(nextTime)) return fromTime;

    setInterventions(fromTime, { time: nextTime });
    valuesRef.current = valuesRef.current
      .map((value) => (value === fromTime ? nextTime : value))
      .sort((a, b) => a - b);
    setCurtime(nextTime);
    return nextTime;
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
          if (curtime === values[i]) setCurtime(newtime);
        }
      }
    }
  }, [curtime, setInterventions, hours, values]);

  useEffect(() => {
    if (values.includes(curtime)) return;
    setCurtime(values[0] ?? 0);
  }, [curtime, values]);

  const beginTimelineDrag = (clientX: number, track: HTMLElement) => {
    const nextTime = getTrackTime(clientX, track);
    let dragTime = curtime;

    if (curtime === 0) {
      if (values.includes(nextTime)) {
        setCurtime(nextTime);
        dragTime = nextTime;
      } else if (values.length < 10) {
        addInterventions(nextTime);
        valuesRef.current = [...valuesRef.current, nextTime].sort((a, b) => a - b);
        setCurtime(nextTime);
        dragTime = nextTime;
      }
    } else {
      dragTime = moveDraggedIntervention(curtime, nextTime);
    }

    dragTimeRef.current = dragTime;
  };

  const startTimelineDrag = (e: React.PointerEvent<HTMLFieldSetElement>) => {
    if (e.button !== 0) return;

    pointerDragRef.current = true;
    beginTimelineDrag(e.clientX, e.currentTarget);
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
  };

  const continueTimelineDrag = (e: React.PointerEvent<HTMLFieldSetElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    const dragTime = dragTimeRef.current;
    if (dragTime === null) return;

    dragTimeRef.current = moveDraggedIntervention(
      dragTime,
      getTrackTime(e.clientX, e.currentTarget)
    );
  };

  const stopTimelineDrag = (e: React.PointerEvent<HTMLFieldSetElement>) => {
    dragTimeRef.current = null;
    pointerDragRef.current = false;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  const startTimelineMouseDrag = (e: React.MouseEvent<HTMLFieldSetElement>) => {
    if (pointerDragRef.current || e.button !== 0) return;

    beginTimelineDrag(e.clientX, e.currentTarget);
    e.preventDefault();
  };

  const continueTimelineMouseDrag = (e: React.MouseEvent<HTMLFieldSetElement>) => {
    const dragTime = dragTimeRef.current;
    if (dragTime === null) return;

    dragTimeRef.current = moveDraggedIntervention(
      dragTime,
      getTrackTime(e.clientX, e.currentTarget)
    );
  };

  const stopTimelineMouseDrag = () => {
    pointerDragRef.current = false;
    dragTimeRef.current = null;
  };

  const deleteThumb = (time: number) => {
    if (time === 0 || values.length === 1) return;
    const index = values.indexOf(time);
    const next = values.filter((value) => value !== time);
    deleteInterventions(time);
    setCurtime(next[Math.min(index, next.length - 1)] ?? 0);
  };

  const moveLeft = () => {
    const sorted = [...values].sort((a, b) => a - b);
    const currentIndex = sorted.indexOf(curtime);
    if (currentIndex === -1) {
      setCurtime(sorted[0] ?? 0);
      return;
    }
    if (curtime === sorted[0]) setCurtime(sorted[sorted.length - 1]);
    else setCurtime(sorted[currentIndex - 1]);
  };

  const moveRight = () => {
    const sorted = [...values].sort((a, b) => a - b);
    const currentIndex = sorted.indexOf(curtime);
    if (currentIndex === -1) {
      setCurtime(sorted[0] ?? 0);
      return;
    }
    if (curtime === sorted[sorted.length - 1]) setCurtime(sorted[0]);
    else setCurtime(sorted[currentIndex + 1]);
  };

  const handleThumbKeyDown = (
    e: React.KeyboardEvent<HTMLButtonElement>,
    value: number
  ) => {
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      deleteThumb(value);
      return;
    }

    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault();
      moveIntervention(value, value - 1);
      return;
    }

    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault();
      moveIntervention(value, value + 1);
      return;
    }

    if (e.key === 'Home') {
      e.preventDefault();
      moveIntervention(value, 1);
      return;
    }

    if (e.key === 'End') {
      e.preventDefault();
      moveIntervention(value, hours);
    }
  };

  const nextAddTime = (() => {
    const anchorTime = Math.min(hours, Math.max(1, curtime || 1));

    for (let offset = 0; offset <= hours; offset++) {
      const laterTime = anchorTime + offset;
      if (laterTime <= hours && !values.includes(laterTime)) return laterTime;

      const earlierTime = anchorTime - offset;
      if (offset > 0 && earlierTime >= 1 && !values.includes(earlierTime)) {
        return earlierTime;
      }
    }
  })();

  return (
    <div className="flex flex-col w-full max-w-250 gap-4">
      <fieldset
        className="iv_timeline_track"
        onPointerDown={startTimelineDrag}
        onPointerMove={continueTimelineDrag}
        onPointerUp={stopTimelineDrag}
        onPointerCancel={stopTimelineDrag}
        onMouseDown={startTimelineMouseDrag}
        onMouseMove={continueTimelineMouseDrag}
        onMouseUp={stopTimelineMouseDrag}
        onMouseLeave={stopTimelineMouseDrag}
      >
        <legend className="iv_timeline_legend">Intervention timeline</legend>
        <div className="iv_timeline_track_line" />
        {curtime === 0 && (
          <button
            type="button"
            className="iv_timeline_thumb iv_timeline_thumb--baseline current"
            style={{ left: '0%' }}
            aria-label="Baseline intervention hour 0"
            onClick={() => setCurtime(0)}
            onPointerDown={(e) => {
              e.stopPropagation();
              setCurtime(0);
            }}
            onMouseDown={(e) => {
              e.stopPropagation();
              setCurtime(0);
            }}
          />
        )}
        {timelineValues.map((value) => (
          <button
            key={value}
            type="button"
            role="slider"
            className={`iv_timeline_thumb${curtime === value ? ' current' : ''}`}
            style={{ left: `${(value / hours) * 100}%` }}
            aria-valuemin={1}
            aria-valuemax={hours}
            aria-valuenow={value}
            aria-label={`Intervention ${values.indexOf(value) + 1} hour`}
            onFocus={() => setCurtime(value)}
            onKeyDown={(e) => handleThumbKeyDown(e, value)}
            onContextMenu={(e) => {
              e.preventDefault();
              deleteThumb(value);
            }}
          />
        ))}
      </fieldset>

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
            onClick={() => deleteThumb(curtime)}
            disabled={values.length <= 1 || values.indexOf(curtime) === 0}
          >
            Delete
          </button>
          <button
            type="button"
            className="iv_control_btn iv_control_btn--add"
            onClick={() => {
              if (nextAddTime === undefined) return;
              addInterventions(nextAddTime);
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
          {curtime === 0 ? 'Baseline Intervention' : `Intervention #${values.indexOf(curtime) + 1}`}
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
