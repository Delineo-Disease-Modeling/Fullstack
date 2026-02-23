'use client';

import { useEffect, useRef, useState } from 'react';
import '@/styles/maplegend.css';

interface MapLegendProps {
  icon_lookup: Record<string, string>;
}

export default function MapLegend({ icon_lookup }: MapLegendProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  return (
    <div className="maplegend-container" ref={ref}>
      <button
        className="maplegend-toggle"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="maplegend-toggle-icon">{open ? '▾' : '▸'}</span>
        Legend
      </button>
      <div className={`maplegend-dropdown ${open ? 'open' : ''}`}>
        {Object.entries(icon_lookup).map(([label, icon]) => (
          <div key={label} className="maplegend-row">
            <span className="maplegend-icon">{icon}</span>
            <span className="maplegend-label">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
