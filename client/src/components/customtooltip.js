export function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) {
    return null;
  }

  return (
    <div style={{ backgroundColor: 'white', padding:'15px' }}>
      <h1 style={{ marginBottom: '10px', fontSize:'16px' }}><b>{label}</b></h1>
      {payload.map(data => (
        <p key={data.name} style={{ color: data.color, margin:'0 0 0 0' }}>{data.name}: {data.value}</p>
      ))}
    </div>
  );
}