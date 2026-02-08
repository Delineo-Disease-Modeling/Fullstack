import { useEffect, useState } from 'react';
import { DB_URL } from '../env';

import './settings-components.css';

// Slider
export function SimParameter({label, value, callback, min=0, max=100, percent=true, units=''}) {
  return (
    <div className='simset_slider'>
      <div className='simset_slider_label'>
        {label}: {percent ? Math.ceil(value * 100) : value}{percent ? '%' : units}
      </div>

      <input type='range' className='simset_slider_input w-[300px]'
        min={min}
        max={max}
        value={percent ? value * 100.0 : value}
        onChange={(e) => callback(percent ? e.target.value / 100.0 : e.target.value)}
      />
    </div>
  );
}

// Checkbox
export function SimBoolean({label, description, value, callback}) {
  return (
    <div className='simset_checkbox'>
      <div className='flex items-start justify-center gap-x-2 flex-nowrap'>
        <input type='checkbox'
          className='w-6 h-6'
          checked={value}
          onChange={(e) => callback(e.target.checked)}
        />
        <div>
          {label}
          {description && <p className='text-gray-400 italic max-w-72'>{description}</p>}
        </div>
      </div>
    </div>
  );
}

export function SimFile({label, callback}) {
  return (
    <div className='simset_fileup'>
      <div className='simset_fileup_label'>
        {label}
        <p className='text-gray-400 italic'>for advanced users</p>
      </div>

      <input type='file' className='max-w-72' 
        multiple={true}
        onChange={(e) => callback(e.target.files)}
      />
    </div>
  );
}

export function SimRunSelector({ czone_id, sim_id, callback }) {
  const [data, setData] = useState(null);

  const deleteRun = async (runId, runName, e) => {
    e?.stopPropagation?.();
    const ok = window.confirm(`Delete run "${runName}"?`);
    if (!ok) {
      return;
    }

    try {
      const res = await fetch(`${DB_URL}simdata/${runId}`, { method: 'DELETE' });
      if (!res.ok) {
        throw new Error(`Delete failed (${res.status})`);
      }

      setData((prev) => (prev || []).filter((r) => r.id !== runId));
      if (sim_id === runId) {
        callback(null);
      }
    } catch (err) {
      console.error(err);
      alert('Failed to delete run');
    }
  };

  useEffect(() => {
    if (!czone_id) {
      setData(null);
      return;
    }

    fetch(`${DB_URL}simdata-list/${czone_id}`)
      .then((res) => {
        if (!res.ok) {
          throw new Error(`Invalid cache response ${res.status}`);
        }

        return res.json();
      })
      .then((json) => {
        setData(json['data']);
      })
      .catch((e) => {
        console.error(e);
        setData(null);
      });
  }, [czone_id]);

  return (
    <div className='flex flex-col items-center w-full gap-4'>
      <div className='flex flex-col w-140 max-w-[90vw] outline-solid outline-2 outline-[#70B4D4] bg-[#fffff2]'>
        {/* Title */}
        <div className='bg-[#70B4D4] text-center text-white w-full h-6 hover:cursor-pointer'>
          Visit a Previous Run
        </div>

        {/* Header Row */}
        <div className="flex px-1 justify-between text-xs font-semibold bg-[#70B4D4] text-white py-1">
          <p className="w-32">Name</p>
          <p className="w-16 text-center">Hours</p>
          <p className="w-16 text-center">Mask</p>
          <p className="w-16 text-center">Vaccine</p>
          <p className="w-16 text-center">Capacity</p>
          <p className="w-16 text-center">Lockdown</p>
          <p className="w-24 text-right">Date</p>
          <p className="w-16 text-right">&nbsp;</p>
        </div>

        {/* List */}
        <div className='relative flex flex-col h-60 overflow-y-scroll gap-y-1'>
          {(!data || data.length === 0) ? (
            <div className='text-center text-gray-500 py-4'>
              No previous runs found
            </div>
          ) : data.map((run) => (
            <div
              key={run.id}
              className='flex px-1 justify-between items-center hover:cursor-pointer hover:scale-[0.98] py-1 relative select-none text-sm'
              style={
                  run.id === sim_id
                    ? { background: '#70B4D4', color: 'white' }
                    : undefined
              }
              title={JSON.stringify({
                hours: run.hours,
                mask_rate: run.mask_rate,
                vaccine_rate: run.vaccine_rate,
                capacity: run.capacity,
                lockdown: run.lockdown
              })}
              onClick={() => callback(run.id === sim_id ? null : run.id)}
            >
              <p className="w-32 truncate">{run.name}</p>
              <p className="w-16 text-center">{run.hours ?? '-'}</p>
              <p className="w-16 text-center">{run.mask_rate != null ? `${Math.round(run.mask_rate * 100)}%` : '-'}</p>
              <p className="w-16 text-center">{run.vaccine_rate != null ? `${Math.round(run.vaccine_rate * 100)}%` : '-'}</p>
              <p className="w-16 text-center">{run.capacity != null ? `${Math.round(run.capacity * 100)}%` : '-'}</p>
              <p className="w-16 text-center">{run.lockdown != null ? `${Math.round(run.lockdown * 100)}%` : '-'}</p>
              <p className="w-24 text-right">{new Date(run.created_at).toLocaleDateString()}</p>
              <div className="w-16 flex justify-end">
                <button
                  className='text-xs px-2 py-0.5 rounded-sm bg-[#222629] text-white hover:brightness-110'
                  onClick={(e) => deleteRun(run.id, run.name, e)}
                  title='Delete run'
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
