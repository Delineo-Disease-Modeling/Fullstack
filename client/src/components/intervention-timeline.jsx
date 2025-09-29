import { useState } from 'react';
import useSimSettings from '../stores/simsettings';

import './intervention-timeline.css';
import Interventions from './interventions';

export default function InterventionTimeline() {
  const settings = useSimSettings((state) => state.settings);
  const addInterventions = useSimSettings((state) => state.addInterventions);
  const setInterventions = useSimSettings((state) => state.setInterventions);
  const deleteInterventions = useSimSettings((state) => state.deleteInterventions);

  const [values, setValues] = useState([0]);
  const [curtime, setCurtime] = useState(0);

  const addThumb = (e) => {
    if (values.length >= 10) {
      return;
    }

    const target = e.target;
    const isthumb = target.closest('[role="slider"]');
    if (isthumb) {
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const clickRatio = (e.clientX - rect.left) / (rect.right - rect.left);
    const newtime = Math.round(clickRatio * settings.hours);

    addInterventions(newtime);
    setValues((prev) => [...prev, newtime].sort((a, b) => a - b));
    setCurtime(() => newtime);
  };

  const deleteThumb = (i) => {
    if (values.length === 1) {
      return;
    }

    let next = [...values].filter((_, idx) => idx != i);

    deleteInterventions(values[i]);
    setValues(() => next);
    setCurtime(() => next[next.length - 1]);
  }

  return (
    <div className='flex flex-col w-full p-4 gap-4'>
      {/* Timeline bar */}
      <div className='relative w-full mb-4 select-none'>
        {/* Background slider */}
        <div
          className='absolute w-full h-2 bg-[#5D576B] rounded-md outline-0'
          onDoubleClick={addThumb}
        />

        {values.map((value, i) => (
          <input
            key={i}
            className={'timeline absolute w-full h-1.5 '
              + (curtime === value ? 'current' : '')}
            type="range"
            min={0}
            max={settings.hours}
            value={value}
            onChange={(e) => {
              // No repeat values
              if (values.includes(+e.target.value)) {
                return;
              }

              setInterventions(values[i], { time: +e.target.value });
              setValues((cur) => [...cur].with(i, +e.target.value));
              setCurtime(+e.target.value);
            }}
            onMouseDown={(e) => {
              setCurtime(+e.target.value);
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              deleteThumb(i);
            }}
          />
        ))}
      </div>

      {/* Buttons */}
      <div className='flex w-full items-center justify-center gap-2'>
        <div className={curtime === values.sort()[0] ? 'cursor-not-allowed' : ''}>
          <button
            className='timeline bg-[#222629] disabled:bg-stone-600 px-4!'
            onClick={() => setCurtime(() => values.sort()[values.sort().indexOf(curtime) - 1])}
            disabled={curtime === values.sort()[0]}
          >
            &lt;
          </button>
        </div>
        <div className={values.length <= 1 ? 'cursor-not-allowed' : ''}>
          <button
            className='timeline bg-red-400 disabled:bg-red-800'
            onClick={() => deleteThumb(values.indexOf(curtime))}
            disabled={values.length <= 1}
          >
            Delete
          </button>
        </div>
        <div className={values.length >= 10 ? 'cursor-not-allowed' : ''}>
          <button
            className='timeline bg-[#222629] disabled:bg-stone-600'
            onClick={() => {
              const newvalue = [...Array(settings.hours).keys()]
                .filter((v) => !values.includes(v))[0];

              addInterventions(newvalue);
              setValues((cur) => [...cur, newvalue]);
              setCurtime(newvalue);
            }}
            disabled={values.length >= 10}
          >
            + Add Intervention
          </button>
        </div>
        <div className={curtime === values.sort()[values.length - 1] ? 'cursor-not-allowed' : ''}>
          <button
            className='timeline bg-[#222629] disabled:bg-stone-600 px-4!'
            onClick={() => setCurtime(() => values.sort()[values.sort().indexOf(curtime) + 1])}
            disabled={curtime === values.sort()[values.length - 1]}
          >
            &gt;
          </button>
        </div>
      </div>

      {/* Information & Buttons*/}
      <div className='flex flex-col gap-4'>
        <h4 className='text-center text-lg'>
          Hour #{curtime.toString().padStart(3, '0')} - {' '}
          {settings.zone && new Date(new Date(settings.zone.start_date).getTime() + curtime * 60 * 60 * 1000).toLocaleString('en-US', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
            weekday: 'short',
            hour: '2-digit',
            minute: '2-digit'
          })}
        </h4>
      </div>

      {/* Settings */}
      <Interventions time={curtime} />
    </div>
  );
}
