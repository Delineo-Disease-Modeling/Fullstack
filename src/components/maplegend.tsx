'use client';

import '@/styles/maplegend.css';

interface MapLegendProps {
  icon_lookup: Record<string, string>;
}

export default function MapLegend({ icon_lookup }: MapLegendProps) {
  return (
    <div className="modelmap_legend_div">
      <div className="modelmap_legend_collapsed">
        <div>Legend</div>
      </div>
      <div className="modelmap_legend_expanded">
        {Object.entries(icon_lookup).map(([label, icon]) => (
          <div key={label} style={{ marginBottom: '10px' }}>
            <div style={{ width: '100%' }}>
              {icon} {label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
