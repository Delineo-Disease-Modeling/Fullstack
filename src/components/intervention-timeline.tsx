'use client';

import { useEffect, useState } from 'react';
import useSimSettings from '@/stores/simsettings';

import '@/styles/intervention-timeline.css';
import Interventions from './interventions';
import Button from './ui/button';

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

  const addThumb = (e: React.MouseEvent<HTMLDivElement>) => {
    if (values.length >= 10) return;
    const target = e.target as HTMLElement;
    if (target.closest('[role="slider"]')) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickRatio = (e.clientX - rect.left) / (rect.right - rect.left);
    const newtime = Math.round(clickRatio * hours);
    addInterventions(newtime);
    setValues((prev) => [...prev, newtime].sort((a, b) => a - b));
    setCurtime(newtime);
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

  return (
    <div className="flex flex-col w-full max-w-250 gap-4">
      {/* biome-ignore lint/a11y/noStaticElementInteractions: custom slider track; range inputs inside handle keyboard accessibility */}
      <div
        className="relative flex items-center w-full h-6 select-none"
        onDoubleClick={addThumb}
      >
        <div className="absolute top-1/2 -translate-y-1/2 left-0 w-full h-2 bg-(--color-text-main) rounded-md outline-0" />
        {values.map((value, i) => (
          <input
            key={i}
            className={`iv_timeline absolute top-1/2 -translate-y-1/2 left-0 w-full ${curtime === value ? 'current ' : ''}`}
            type="range"
            min={0}
            max={hours}
            value={value}
            onChange={(e) => {
              if (value === 0 || values.includes(+e.target.value)) return;
              setInterventions(values[i], { time: +e.target.value });
              setValues((cur) => [...cur].with(i, +e.target.value));
              setCurtime(+e.target.value);
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

      <div className="flex w-full items-center justify-center gap-2">
        <Button
          type="button"
          className="py-1! px-4! text-sm text-nowrap disabled:bg-stone-600!"
          onClick={moveLeft}
        >
          &lt;
        </Button>
        <div className={values.length <= 1 ? 'cursor-not-allowed' : ''}>
          <Button
            type="button"
            variant="destructive"
            className="py-1! px-8! text-sm text-nowrap disabled:bg-red-800!"
            onClick={() => deleteThumb(values.indexOf(curtime))}
            disabled={values.length <= 1}
          >
            Delete
          </Button>
        </div>
        <div className={values.length >= 10 ? 'cursor-not-allowed' : ''}>
          <Button
            type="button"
            className="py-1! px-8! text-sm text-nowrap disabled:bg-stone-600!"
            onClick={() => {
              const newvalue = Array.from(
                { length: hours },
                (_, i) => i + 1
              ).filter((v) => !values.includes(v))[0];
              addInterventions(newvalue);
              setValues((cur) => [...cur, newvalue]);
              setCurtime(newvalue);
            }}
            disabled={values.length >= 10}
          >
            + Add
          </Button>
        </div>
        <Button
          type="button"
          className="py-1! px-4! text-sm text-nowrap disabled:bg-stone-600!"
          onClick={moveRight}
        >
          &gt;
        </Button>
      </div>

      <div className="flex flex-col gap-4">
        <h4 className="text-center text-lg">
          Intervention #{values.indexOf(curtime) + 1} - Hour #
          {curtime.toString().padStart(3, '0')}
        </h4>
        <h4 className="text-center text-lg">
          {zone &&
            new Date(
              new Date(zone.start_date).getTime() + curtime * 60 * 60 * 1000
            ).toLocaleString('en-US', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
              weekday: 'short',
              hour: '2-digit',
              minute: '2-digit'
            })}
        </h4>
      </div>

      <Interventions time={curtime} />
    </div>
  );
}
