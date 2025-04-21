import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from 'react-leaflet';

import zip_cbg_json from '../data/zip_to_cbg.json';
import { ALG_URL, DB_URL } from "../env";

function InteractiveMap({ onLocationSelect, disabled }) {
  const [ markerPosition, setMarkerPosition ] = useState(null);

  function LocationMarker() {
    useMapEvents({
      click(e) {
        if (disabled) {
          return;
        }

        setMarkerPosition(e.latlng);
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
      center={[39.3290708, -76.6219753]}
      zoom={10}
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

export default function CZGeneration() {
  const navigate = useNavigate();

  const [ location, setLocation ] = useState('');
  const [ iframeHTML, setIframeHTML ] = useState();
  const [ loading, setLoading ] = useState(false);

  const loc_lookup = async (location) => {
    const resp = await fetch(`${DB_URL}lookup-zip`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        location: location
      })
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
    const func_body = async (formdata) => {
      console.log(formdata);
  
      const location = await loc_lookup(formdata.get('location'));
      const core_cbg = zip_to_cbg(location?.['zip_code'] ?? formdata.get('location'));
  
      if (!core_cbg) {
        console.error('Could not find location');
        return;
      }
  
      console.log(location);
      console.log(core_cbg);
  
      const resp = await fetch(`${ALG_URL}generate-cz`, {
        method: 'POST',
        body: JSON.stringify({
          name: location['city'],
          cbg: core_cbg,
          zip_code: '21740',
          start_date: new Date(formdata.get('start_date')).toISOString(),
          min_pop: +formdata.get('min_pop'),
        })
      });
  
      if (!resp.ok) {
        console.error('An unknown error occurred');
        return;
      }
  
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      const chunks = [];
  
      while (true) {
        const { done, value } = await reader.read();
  
        if (done) {
          break;
        }
  
        chunks.push(decoder.decode(value));
      }
  
      const json = JSON.parse(chunks.join(''));

      if (!json['id']) {
        throw new Error('Invalid JSON Response Body');
      }

      const localdict = localStorage.getItem('czlist') ?? '[]';
      localStorage.setItem('czlist', JSON.stringify([ ...JSON.parse(localdict), json['id']]));
      setIframeHTML(json['map']);
    };

    if (loading) {
      return;
    }

    setLoading(true);
    func_body(formdata)
      .catch(console.error)
      .finally(() => setLoading(false));
  }

  return (
    <div className='flex flex-col items-center justify-start gap-20 min-h-[calc(100vh-160px)]'>
      <header className='mt-28 text-3xl mx-8 text-wrap text-center'>
        Convenience Zone Creation
      </header>

        <form action={generateCZ} className='flex flex-col gap-8 mb-28 items-center'>
          <div className='flex justify-center items-center gap-10 flex-wrap mx-4'>
            <div className='flex flex-col gap-8 items-center'>
              <FormField 
                label='City, Address, or Location'
                name='location'
                type='text'
                placeholder='e.g. 55902'
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                disabled={loading || !!iframeHTML}
              />

              <FormField 
                label='Minimum Population'
                name='min_pop'
                type='number'
                defaultValue={5000}
                disabled={loading || !!iframeHTML}
              />

              <FormField 
                label='Start Date'
                name='start_date'
                type='date'
                defaultValue={new Date().toISOString().slice(0, 10)}
                disabled={loading || !!iframeHTML}
              /> 
            </div>

          {iframeHTML ? (
            <iframe
              srcDoc={iframeHTML}
              title='Generated Convenience Zone'
              className='h-72 w-[35rem] max-w-[85vw]'
            />
          ) : (
            <div className='h-72 w-[35rem] max-w-[85vw]'>
              <InteractiveMap
                onLocationSelect={setLocation}
                disabled={loading}
              />
            </div>
          )}
        </div>
        <input
          type={!iframeHTML ? 'submit' : 'button'}
          value={loading ? 'Loading...' : !iframeHTML ? 'Generate!' : 'Return'}
          onClick={() => iframeHTML && navigate('/simulator')}
          disabled={loading}
          className='bg-[#222629] text-[#F0F0F0] w-32 h-12 p-3 rounded-3xl transition-[200ms] ease-in-out hover:scale-105 cursor-pointer active:brightness-75 disabled:bg-gray-500'
        />
      </form>
    </div>
  );
}
