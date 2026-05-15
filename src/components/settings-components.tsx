'use client';

import { useEffect, useRef, useState } from 'react';
import { Info } from 'lucide-react';
import '@/styles/settings-components.css';
import Slider from './ui/slider';

function InfoPopover({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent | TouchEvent) => {
      if (btnRef.current && !btnRef.current.closest('.simset_info')?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [open]);

  return (
    <span className="simset_info">
      <button
        ref={btnRef}
        type="button"
        className={`simset_info_btn${open ? ' is-open' : ''}`}
        aria-label="More information"
        aria-expanded={open}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
      >
        <Info size={14} aria-hidden="true" />
      </button>
      {open && (
        <span role="tooltip" className="simset_info_popover">
          {text}
        </span>
      )}
    </span>
  );
}

interface SimParameterProps {
  label: string;
  value: number;
  callback: (v: number) => void;
  min?: number;
  max?: number;
  percent?: boolean;
  units?: string;
  disabled?: boolean;
  disabledLabel?: string;
  info?: string;
}

export function SimParameter({
  label,
  value,
  callback,
  min = 0,
  max = 100,
  percent = true,
  units = '',
  disabled = false,
  disabledLabel = 'Currently unavailable',
  info
}: SimParameterProps) {
  const displayValue = percent ? Math.ceil(value * 100) : value;
  return (
    <div
      className={`simset_slider${disabled ? ' simset_slider--disabled' : ''}`}
      aria-disabled={disabled}
    >
      <div className="simset_slider_label">
        <span className="simset_slider_label_text">
          {label}
          {info && <InfoPopover text={info} />}
        </span>
        <span className="simset_slider_label_value">
          {disabled ? (
            disabledLabel
          ) : (
            <>
              {displayValue}
              {percent ? '%' : units}
            </>
          )}
        </span>
      </div>
      <Slider
        className="w-75"
        min={min}
        max={max}
        value={percent ? value * 100.0 : value}
        disabled={disabled}
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

interface SimTextProps {
  label: string;
  value: string;
  callback: (v: string) => void;
  placeholder?: string;
}

export function SimText({
  label,
  value,
  callback,
  placeholder
}: SimTextProps) {
  return (
    <div className="simset_fileup">
      <div className="simset_fileup_label">{label}</div>
      <input
        type="text"
        className="max-w-72 border border-(--color-border-dark) rounded-md px-2 py-1 bg-(--color-bg-ivory)"
        value={value}
        placeholder={placeholder}
        onChange={(e) => callback(e.target.value)}
      />
    </div>
  );
}

interface SimSelectProps {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  callback: (v: string) => void;
}

export function SimSelect({
  label,
  value,
  options,
  callback
}: SimSelectProps) {
  return (
    <div className="simset_fileup">
      <div className="simset_fileup_label">{label}</div>
      <select
        className="max-w-72 border border-(--color-border-dark) rounded-md px-2 py-1 bg-(--color-bg-ivory)"
        value={value}
        onChange={(e) => callback(e.target.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
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
