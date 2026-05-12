'use client';

import { useEffect, useState } from 'react';
import '@/styles/settings-components.css';
import Slider from './ui/slider';

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
  const displayValue = percent ? Math.ceil(value * 100) : value;
  return (
    <div className="simset_slider">
      <div className="simset_slider_label">
        <span className="simset_slider_label_text">{label}</span>
        <span className="simset_slider_label_value">
          {displayValue}
          {percent ? '%' : units}
        </span>
      </div>
      <Slider
        className="w-75"
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
    <label className="simset_checkbox">
      <input
        type="checkbox"
        className="simset_checkbox_input"
        checked={value}
        onChange={(e) => callback(e.target.checked)}
      />
      <div className="simset_checkbox_body">
        <span className="simset_checkbox_label">{label}</span>
        {description && (
          <span className="simset_checkbox_description">{description}</span>
        )}
      </div>
    </label>
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
        <span className="simset_fileup_label_text">{label}</span>
        <span className="simset_fileup_hint">For advanced users</span>
      </div>
      <input
        type="file"
        className="simset_fileup_input"
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

type SimRunType = {
  name: string;
  created_at: string;
  sim_id: number;
};

export function SimRunSelector({
  czone_id,
  sim_id,
  callback
}: SimRunSelectorProps) {
  const [data, setData] = useState<SimRunType[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!czone_id) {
      setData(null);
      return;
    }
    setLoading(true);
    fetch(`/api/simdata/cache/${czone_id}`)
      .then((res) => {
        if (!res.ok) throw new Error(`Invalid cache response ${res.status}`);
        return res.json();
      })
      .then((json) => { setData(json.data); setLoading(false); })
      .catch((e) => {
        console.error(e);
        setData(null);
        setLoading(false);
      });
  }, [czone_id]);

  return (
    <div className="sim_table">
      <div className="sim_table_header">
        <h3 className="sim_table_title">Visit a Previous Run</h3>
      </div>
      <div className="sim_table_columns">
        <span className="flex-1">Name</span>
        <span className="flex-1 text-right">Created Date</span>
      </div>
      <div className="sim_table_body" style={{ overflowAnchor: 'none' }}>
        {loading ? (
          <p className="sim_table_empty">Loading...</p>
        ) : !data?.length && (
          <p className="sim_table_empty">
            No previous runs found, run a simulation to get started.
          </p>
        )}
        {data?.map((run) => (
          <button
            type="button"
            key={run.sim_id}
            className={`sim_table_row ${run.sim_id === sim_id ? 'is-selected' : ''}`}
            onClick={() => callback(run.sim_id === sim_id ? null : run.sim_id)}
          >
            <span className="flex-1 truncate">{run.name}</span>
            <span className="flex-1 text-right">
              {new Date(run.created_at).toLocaleDateString()}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
