'use client';

import { useEffect, useState } from 'react';
import '@/styles/settings-components.css';

interface SimParameterProps {
  label: string;
  value: number;
  callback: (v: number) => void;
  min?: number;
  max?: number;
  percent?: boolean;
  units?: string;
}

export function SimParameter({
  label,
  value,
  callback,
  min = 0,
  max = 100,
  percent = true,
  units = ''
}: SimParameterProps) {
  return (
    <div className="simset_slider">
      <div className="simset_slider_label">
        {label}: {percent ? Math.ceil(value * 100) : value}
        {percent ? '%' : units}
      </div>
      <input
        type="range"
        className="simset_slider_input w-[300px]"
        min={min}
        max={max}
        value={percent ? value * 100.0 : value}
        onChange={(e) =>
          callback(percent ? +e.target.value / 100.0 : +e.target.value)
        }
      />
    </div>
  );
}

interface SimBooleanProps {
  label: string;
  description?: string;
  value: boolean;
  callback: (v: boolean) => void;
}

export function SimBoolean({
  label,
  description,
  value,
  callback
}: SimBooleanProps) {
  return (
    <div className="simset_checkbox">
      <div className="flex items-start justify-center gap-x-2 flex-nowrap">
        <input
          type="checkbox"
          className="w-6 h-6"
          checked={value}
          onChange={(e) => callback(e.target.checked)}
        />
        <div>
          {label}
          {description && (
            <p className="text-gray-400 italic max-w-72">{description}</p>
          )}
        </div>
      </div>
    </div>
  );
}

interface SimFileProps {
  label: string;
  callback: (files: FileList | null) => void;
}

export function SimFile({ label, callback }: SimFileProps) {
  return (
    <div className="simset_fileup">
      <div className="simset_fileup_label">
        {label}
        <p className="text-gray-400 italic">for advanced users</p>
      </div>
      <input
        type="file"
        className="max-w-72"
        multiple={true}
        onChange={(e) => callback(e.target.files)}
      />
    </div>
  );
}

interface SimRunSelectorProps {
  czone_id: number | undefined;
  sim_id: number | null;
  callback: (sim_id: number | null) => void;
}

export function SimRunSelector({
  czone_id,
  sim_id,
  callback
}: SimRunSelectorProps) {
  const [data, setData] = useState<any[] | null>(null);

  useEffect(() => {
    if (!czone_id) {
      setData(null);
      return;
    }
    fetch(`/api/simdata/cache/${czone_id}`)
      .then((res) => {
        if (!res.ok) throw new Error(`Invalid cache response ${res.status}`);
        return res.json();
      })
      .then((json) => setData(json.data))
      .catch((e) => {
        console.error(e);
        setData(null);
      });
  }, [czone_id]);

  return (
    <div className="flex flex-col w-120 h-80 max-w-[90vw] outline-solid outline-2 outline-[var(--color-primary-blue)] bg-[var(--color-bg-ivory)]">
      <div className="bg-[var(--color-primary-blue)] text-center text-white w-full h-6">
        Visit a Previous Run
      </div>
      <div className="flex px-1 justify-between text-xs font-semibold bg-[var(--color-primary-blue)] text-white py-1">
        <p className="flex-1">Name</p>
        <p className="flex-1 text-right">Created Date</p>
      </div>
      <div className="relative flex flex-col h-full overflow-y-scroll gap-y-1">
        {!data?.length && (
          <p className="text-center text-wrap my-auto">
            No previous runs found, run a simulation to get started!
          </p>
        )}
        {data?.map((run) => (
          <div
            key={run.sim_id}
            className="flex px-1 justify-between items-center hover:cursor-pointer hover:scale-[0.98] py-1 relative select-none"
            style={
              run.sim_id === sim_id
                ? { background: 'var(--color-primary-blue)', color: 'white' }
                : undefined
            }
            onClick={() => callback(run.sim_id === sim_id ? null : run.sim_id)}
          >
            <p className="flex-1">{run.name}</p>
            <p className="flex-1 text-right">
              {new Date(run.created_at).toLocaleDateString()}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
