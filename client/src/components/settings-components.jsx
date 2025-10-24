import './settings-components.css';

// Slider
export function SimParameter({label, value, callback, min=0, max=100, percent=true}) {
  return (
    <div className='simset_slider'>
      <div className='simset_slider_label'>
        {label}: {percent ? Math.ceil(value * 100) : value}{percent ? '%' : ''}
      </div>

      <input type='range' className='simset_slider_input w-[300px]'
        min={min}
        max={max}
        value={percent ? value * 100.0 : value}
        onChange={(e) => callback(percent ? e.target.value / 100.0 : e.target.value)}
      />
    </div>
  );
}

// Checkbox
export function SimBoolean({label, value, callback}) {
  return (
    <div className='simset_checkbox'>
      <div className='flex items-center justify-center gap-x-2 flex-nowrap'>
        <input type='checkbox'
          className='w-6 h-6'
          checked={value}
          onChange={(e) => callback(e.target.checked)}
        />
        <div>{label}</div>
      </div>
    </div>
  );
}

export function SimFile({label, callback}) {
  return (
    <div className='simset_fileup'>
      <div className='simset_fileup_label'>
        {label}
        <p className='text-gray-400 italic'>for advanced users</p>
      </div>

      <input type='file' className='max-w-72' 
        multiple={true}
        onChange={(e) => callback(e.target.files)}
      />
    </div>
  );
}
