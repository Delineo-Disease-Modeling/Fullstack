import { useState } from "react";
import { useNavigate } from "react-router-dom";

import zip_cbg_json from '../../public/data/zip_to_cbg.json';
import { API_URL, DB_URL } from "../env";

function FormField({ label, name, type, placeholder, defaultValue }) {
  return (
    <div className='flex flex-col gap-2'>
      <label htmlFor={name}>{label}</label>
      <input
        className='px-2 py-1 rounded-lg'
        name={name}
        id={name}
        type={type}
        placeholder={placeholder}
        defaultValue={defaultValue}
        required
      />
    </div>
  );
}

export default function CZGeneration() {
  const navigate = useNavigate();
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

    const json = await resp.json();

    console.log(json['zip_code'])

    return json['zip_code'];
  };

  const zip_to_cbg = async (location) => {
    const zip = zip_cbg_json[location]?.[0];

    if (!zip) {
      const lookup = await loc_lookup(location);

      if (!lookup) {
        return null;
      }

      return zip_cbg_json[lookup]?.[0];
    }

    return zip;
  };

  const generateCZ = async (formdata) => {
    console.log(formdata);
    setLoading(true);

    const core_cbg = await zip_to_cbg(formdata.get('label'));

    console.log(core_cbg);

    fetch(`${API_URL}generate-cz`, {
      method: 'POST',
      body: JSON.stringify({
        name: formdata.get('name'),
        label: formdata.get('label'),
        core_cbg: core_cbg,
        min_pop: +formdata.get('min_pop'),
      })
    })
      .then((resp) => {
        if (!resp.ok) {
          throw new Error();
        }

        return resp.json();
      })
      .then((json) => {
        console.log(json);
        navigate('/simulator');
      })
      .catch(() => console.error('An unknown error occurred'))
      .finally(() => setLoading(false));
  }

  return (
    <div className='flex flex-col items-center justify-start gap-20 min-h-[calc(100vh-160px)]'>
      <header className='mt-28 text-3xl'>Convenience Zone Creation</header>

      <form action={generateCZ} className='flex flex-col gap-8 mb-28 items-center'>
        <FormField 
          label='Address or Zip Code'
          name='label'
          type='text'
          placeholder='e.g. 55902'
        />

        <FormField 
          label='Internal name'
          name='name'
          type='text'
          placeholder='e.g. barnsdall'
        />

        <FormField 
          label='Minimum Population'
          name='min_pop'
          type='number'
          defaultValue={5000}
        />

        <input
          type='submit'
          value='Generate!'
          disabled={loading}
          className='bg-[#222629] text-[#F0F0F0] w-32 h-12 p-3 rounded-3xl transition-[200ms] ease-in-out hover:scale-105 cursor-pointer active:brightness-75 disabled:bg-gray-500'
        />
      </form>
    </div>
  );
}
