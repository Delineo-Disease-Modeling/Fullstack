import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from 'react-leaflet';
import L from 'leaflet';

import zip_cbg_json from '../../public/data/zip_to_cbg.json';
import { API_URL, DB_URL } from "../env";

function FormField({ label, name, type, placeholder, defaultValue, disabled, value, onChange }) {
  return (
    <div className='flex flex-col gap-2'>
      <label htmlFor={name}>{label}</label>
      <input
        className='px-2 py-1 rounded-lg disabled:cursor-not-allowed disabled:brightness-75'
        name={name}
        id={name}
        type={type}
        placeholder={placeholder}
        defaultValue={defaultValue}
        disabled={disabled}
        value={value}
        onChange={onChange}
        required
      />
    </div>
  );
}

function InteractiveMap({ onLocationSelect }) {
  const [markerPosition, setMarkerPosition] = useState(null);

  function LocationMarker() {
    useMapEvents({
      click(e) {
        setMarkerPosition(e.latlng);

        // coords here

        const coords = `${e.latlng.lat.toFixed(4)}, ${e.latlng.lng.toFixed(4)}`;
        onLocationSelect(coords);
      }
    });

    return markerPosition === null ? null : (
      <Marker position={markerPosition}>
        <Popup>
          Selected Location: {markerPosition.lat.toFixed(4)}, {markerPosition.lng.toFixed(4)}
        </Popup>
      </Marker>
    );
  }

  return (
    <MapContainer
      center={[37.7749, -122.4194]}
      zoom={13}
      style={{ height: '300px', width: '100%' }}
    >
      <TileLayer
        attribution='&copy; OpenStreetMap contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <LocationMarker />
    </MapContainer>
  );
}

export default function CZGeneration() {
  const navigate = useNavigate();

  const [iframeHTML, setIframeHTML] = useState();
  const [loading, setLoading] = useState(false);

  const [locationLabel, setLocationLabel] = useState('');

  const loc_lookup = async (location) => {
    const resp = await fetch(`${DB_URL}lookup-zip`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ location })
    });
    if (!resp.ok) {
      return null;
    }
    return await resp.json();
  };

  const zip_to_cbg = (location) => {
    return zip_cbg_json[location]?.[0];
  };

  const generateCZ = async (formdata) => {
    setLoading(true);
    const locationData = await loc_lookup(formdata.get('label'));
    const core_cbg = zip_to_cbg(locationData?.['zip_code'] ?? formdata.get('label'));

    fetch(`${API_URL}generate-cz`, {
      method: 'POST',
      body: JSON.stringify({
        name: locationData['city'],
        cbg: core_cbg,
        zip_code: locationData['zip_code'] || formdata.get('label'),
        min_pop: +formdata.get('min_pop'),
      })
    })
      .then((resp) => {
        if (!resp.ok) throw new Error();
        return resp.json();
      })
      .then((json) => {
        const localdict = localStorage.getItem('czlist') ?? '[]';
        localStorage.setItem('czlist', JSON.stringify([...JSON.parse(localdict), json['id']]));
        setIframeHTML(json['map']);
      })
      .catch(() => console.error('An unknown error occurred'))
      .finally(() => setLoading(false));
  };

  return (

    <div className='container mx-auto px-8 flex flex-col items-center justify-start gap-20 min-h-[calc(100vh-160px)]'>
      <header className='text-3xl mt-28'>Convenience Zone Creation</header>
      {/* Two-column layout without wrapping */}
      <div className='flex flex-row w-full gap-10'>
        {/* Left Column: Form & iFrame */}
        <div className='flex flex-col items-center w-1/2 gap-8'>
          <form action={generateCZ} className='flex flex-col items-center w-full gap-8'>
            <div className='flex flex-col w-full gap-10'>
              <FormField
                label='City, Address, or Zip Code'
                name='label'
                type='text'
                placeholder='e.g. 55902 or lat, lng'
                value={locationLabel}
                onChange={(e) => setLocationLabel(e.target.value)}
                disabled={!!iframeHTML}
              />
              <FormField
                label='Minimum Population'
                name='min_pop'
                type='number'
                defaultValue={5000}
                disabled={!!iframeHTML}
              />
            </div>
            <input
              type={!iframeHTML ? 'submit' : 'button'}
              value={loading ? 'Loading...' : !iframeHTML ? 'Generate!' : 'Return'}
              onClick={() => iframeHTML && navigate('/simulator')}
              disabled={loading}
              className='bg-[#222629] text-[#F0F0F0] w-32 h-12 p-3 rounded-3xl transition-[200ms] ease-in-out hover:scale-105 cursor-pointer active:brightness-75 disabled:bg-gray-500'
            />
          </form>
          <iframe
            srcDoc={iframeHTML}
            title='Generated Convenience Zone'
            className='w-full h-72'
          />
        </div>
        {/* Right Column: Interactive Map */}
        <div className='w-1/2'>
          <InteractiveMap onLocationSelect={setLocationLabel} />
        </div>
      </div>
    </div>
  );
}