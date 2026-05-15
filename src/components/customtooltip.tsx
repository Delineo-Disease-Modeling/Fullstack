'use client';

import type { TooltipContentProps } from 'recharts';

export function CustomTooltip({ active, payload, label }: TooltipContentProps) {
  if (!active || !payload?.length) {
    return null;
  }

  return (
    <div className="bg-white p-4">
      <h1 className="mb-2.5 text-base">
        <b>{label}</b>
      </h1>
      {payload.map((data) => (
        <p
          className="mb-1"
          style={{ color: data.color }}
          key={`${data.name ?? data.dataKey}`}
        >
          {data.name}:{' '}
          {Array.isArray(data.value) ? data.value.join(', ') : data.value}
        </p>
      ))}
    </div>
  );
}
