export function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) {
    return null;
  }

  return (
    <div className='bg-white p-4'>
      <h1 className='mb-2.5 text-base'><b>{label}</b></h1>
      {payload.map(data => (
        <p className='mb-1' style={{color: data.color}} key={data.name}>{data.name}: {data.value}</p>
      ))}
    </div>
  );
}
