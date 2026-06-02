'use client';

import type { TooltipContentProps } from 'recharts';

function formatTooltipLabel(label: unknown) {
  const value = Number(label);
  return Number.isFinite(value) ? `Hour ${Math.round(value)}` : String(label);
}

function formatTooltipValue(value: unknown) {
  if (typeof value === 'number') {
    return Math.round(value).toLocaleString();
  }
  if (Array.isArray(value)) {
    return value.join(', ');
  }
  return String(value ?? '');
}

export function CustomTooltip({ active, payload, label }: TooltipContentProps) {
  if (!active || !payload?.length) {
    return null;
  }

  const rows = payload.filter((data) => data.value != null);

  return (
    <div className="rounded-md border border-(--color-border-subtle) bg-white/95 p-3 text-sm shadow-lg">
      <h1 className="mb-2 text-sm font-bold text-(--color-text-main)">
        {formatTooltipLabel(label)}
      </h1>
      {rows.map((data) => (
        <p
          className="mb-1 flex items-baseline justify-between gap-5 last:mb-0"
          style={{ color: data.color }}
          key={`${data.name ?? data.dataKey}`}
        >
          <span className="font-medium">{data.name}</span>
          <span className="font-semibold tabular-nums">
            {formatTooltipValue(data.value)}
          </span>
        </p>
      ))}
    </div>
  );
}
