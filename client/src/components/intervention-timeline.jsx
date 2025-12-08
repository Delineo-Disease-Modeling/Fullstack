import { useEffect, useState } from 'react';
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

  useEffect(() => {
    const unused = Array.from({ length: settings.hours }, (_, i) => i + 1)
      .filter((v) => !values.includes(v));

    for (let i = 0; i < values.length; i++) {
      if (values[i] > settings.hours) {
        const newtime = unused.pop();
        setInterventions(values[i], { time: newtime });
        setValues((cur) => [...cur].with(i, newtime));
        if (curtime === values[i]) {
          setCurtime(newtime);
        }
      }
    }
  }, [curtime, setInterventions, settings.hours, values]);

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
    // Can't delete value 0 
    if (values[i] === 0) {
      return;
    }

    if (values.length === 1) {
      return;
    }

    let next = [...values].filter((_, idx) => idx != i);

    deleteInterventions(values[i]);
    setValues(() => next);
    setCurtime(() => next[next.length - 1]);
  }

  const moveLeft = () => {
    if (curtime === values.sort()[0]) {
      setCurtime(values.sort()[values.length - 1]);
    } else {
      setCurtime(values.sort()[values.sort().indexOf(curtime) - 1]);
    }
  };

  const moveRight = () => {
    if (curtime === values.sort()[values.length - 1]) {
      setCurtime(values.sort()[0]);
    } else {
      setCurtime(values.sort()[values.sort().indexOf(curtime) + 1]);
    }
  };

  return (
    <div className='flex flex-col w-full p-4 gap-4'>
      {/* Timeline bar */}
      <div
        className='relative flex items-center w-full h-6 select-none'
        onDoubleClick={addThumb}
      >
        {/* Background slider */}
        <div
          className='absolute w-full h-2 bg-[#5D576B] rounded-md outline-0'
        />

        {values.map((value, i) => (
          <input
            key={i}
            className={'iv_timeline absolute w-full h-1.5 '
              + (curtime === value ? 'current ' : '')
            }
            type="range"
            min={0}
            max={settings.hours}
            value={value}
            onChange={(e) => {
              // Can't change the first timeline option
              if (value === 0) {
                return;
              }

              // No repeat values
              if (values.includes(+e.target.value)) {
                return;
              }

              setInterventions(values[i], { time: +e.target.value });
              setValues((cur) => [...cur].with(i, +e.target.value));
              setCurtime(+e.target.value);
            }}
            onMouseDownCapture={(e) => {
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
        <button
          className='iv_timeline bg-[#222629] disabled:bg-stone-600 px-4!'
          onClick={moveLeft}
        >
          &lt;
        </button>
        <div className={values.length <= 1 ? 'cursor-not-allowed' : ''}>
          <button
            className='iv_timeline bg-red-400 disabled:bg-red-800'
            onClick={() => deleteThumb(values.indexOf(curtime))}
            disabled={values.length <= 1}
          >
            Delete
          </button>
        </div>
        <div className={values.length >= 10 ? 'cursor-not-allowed' : ''}>
          <button
            className='iv_timeline bg-[#222629] disabled:bg-stone-600'
            onClick={() => {
              const newvalue = Array.from({ length: settings.hours }, (_, i) => i + 1)
                .filter((v) => !values.includes(v))[0];

              addInterventions(newvalue);
              setValues((cur) => [...cur, newvalue]);
              setCurtime(newvalue);
            }}
            disabled={values.length >= 10}
          >
            + Add
          </button>
        </div>
        <button
          className='iv_timeline bg-[#222629] disabled:bg-stone-600 px-4!'
          onClick={moveRight}
        >
          &gt;
        </button>
      </div>

      {/* Information & Buttons*/}
      <div className='flex flex-col gap-4'>
        <h4 className='text-center text-lg'>
          Intervention #{values.findIndex((v) => v === curtime) + 1} - Hour #{curtime.toString().padStart(3, '0')}
        </h4>
        <h4 className='text-center text-lg'>
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
