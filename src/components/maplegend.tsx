'use client';

import { useState } from 'react';
import '@/styles/maplegend.css';

interface MapLegendProps {
  icon_lookup: Record<string, string>;
}

export default function MapLegend({ icon_lookup }: MapLegendProps) {
  const [hovered, setHovered] = useState(false);
  let timeout: ReturnType<typeof setTimeout> | null = null;

  function handleMouseEnter() {
    const legend = document.getElementById('modelmap_legend_div');
    if (!legend) return;
    legend.classList.remove('modelmap_legend_div_unhover');
    legend.classList.add('modelmap_legend_div_hover');
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => setHovered(true), 50);
  }

  function handleMouseLeave() {
    const legend = document.getElementById('modelmap_legend_div');
    if (!legend) return;
    legend.classList.remove('modelmap_legend_div_hover');
    legend.classList.add('modelmap_legend_div_unhover');
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => setHovered(false), 250);
  }

  return (
    <div
      id="modelmap_legend_div"
      className="modelmap_legend_div modelmap_legend_div_unhover"
      onMouseOver={handleMouseEnter}
      onMouseOut={handleMouseLeave}
    >
      {!hovered && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            width: '100%'
          }}
        >
          <div>Legend</div>
        </div>
      )}
      {hovered && (
        <div style={{ width: '90px' }}>
          {Object.entries(icon_lookup).map(([label, icon]) => (
            <div key={label} style={{ marginBottom: '10px' }}>
              <div style={{ width: '100%' }}>
                {icon} {label}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
