'use client';

interface TooltipProps {
  active?: boolean;
  payload?: { color: string; name: string; value: number }[];
  label?: string;
}

export function CustomTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload?.length) {
    return null;
  }

  return (
    <div className="bg-white p-4">
      <h1 className="mb-2.5 text-base">
        <b>{label}</b>
      </h1>
      {payload.map((data) => (
        <p className="mb-1" style={{ color: data.color }} key={data.name}>
          {data.name}: {data.value}
        </p>
      ))}
    </div>
  );
}
