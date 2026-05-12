'use client';

interface TooltipProps {
  active?: boolean;
  payload?: {
    color?: string;
    dataKey?: string;
    name?: string;
    value?: number | string;
    payload?: Record<string, unknown>;
  }[];
  label?: number | string;
  labelFormatter?: (label: number | string) => string;
}

export function CustomTooltip({
  active,
  payload,
  label,
  labelFormatter
}: TooltipProps) {
  if (!active || !payload?.length) {
    return null;
  }

  const isNumericLabel = typeof label === 'number';
  const displayLabel =
    label !== undefined && labelFormatter
      ? labelFormatter(label)
      : isNumericLabel
        ? `Time: ${label}h`
        : label;
  const categoryValue = payload[0]?.payload?.category;
  const category = typeof categoryValue === 'string' ? categoryValue : null;

  return (
    <div className="rounded-md border-2 border-(--color-primary-blue) bg-(--color-bg-ivory) px-3 py-2 shadow-lg">
      <h1 className="mb-1 text-sm font-semibold text-(--color-bg-dark)">
        {displayLabel}
      </h1>
      {category && (
        <p className="mb-2 text-xs italic text-(--color-text-main)">
          {category}
        </p>
      )}
      {payload.map((data) => (
        <p
          className="mb-1 text-sm"
          style={{ color: data.color }}
          key={data.dataKey ?? data.name ?? String(data.value)}
        >
          {data.name}: {data.value}
        </p>
      ))}
    </div>
  );
}
