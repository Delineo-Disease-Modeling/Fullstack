import { useState } from "react";
import { useNavigate } from "react-router-dom";

import zip_cbg_json from '../../public/data/zip_to_cbg.json';
import { API_URL, DB_URL } from "../env";

function FormField({ label, name, type, placeholder, defaultValue, disabled }) {
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
        required
      />
    </div>
  );
}

export default function CZGeneration() {
  const navigate = useNavigate();

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
    console.log(formdata);
    setLoading(true);

    const location = await loc_lookup(formdata.get('label'));
    const core_cbg = zip_to_cbg(location?.['zip_code'] ?? formdata.get('label'));

    console.log(location);
    console.log(core_cbg);

    fetch(`${API_URL}generate-cz`, {
      method: 'POST',
      body: JSON.stringify({
        name: formdata.get('name'),
        cbg: core_cbg,
        zip_code: '21740',
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
        setIframeHTML(json['map']);
      })
      .catch(() => console.error('An unknown error occurred'))
      .finally(() => setLoading(false));
  }

  return (
    <div className='flex flex-col items-center justify-start gap-20 min-h-[calc(100vh-160px)]'>
      <header className='mt-28 text-3xl'>Convenience Zone Creation</header>

        <form action={generateCZ} className='flex flex-col gap-8 mb-28 items-center'>
          <div className='flex justify-center gap-10 flex-wrap mx-4'>
            <div className='flex flex-col gap-8 items-center'>
              <FormField 
                label='City, Address, or Zip Code'
                name='label'
                type='text'
                placeholder='e.g. 55902'
                disabled={!!iframeHTML}
              />

              <FormField 
                label='Internal name'
                name='name'
                type='text'
                placeholder='e.g. barnsdall'
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

          <iframe
            srcDoc={iframeHTML}
            title='Generated Convenience Zone'
            className='h-72 w-[35rem] max-w-[85vw]'
          />

        </div>
        <input
          type={!iframeHTML ? 'submit' : 'button'}
          value={!iframeHTML ? 'Generate!' : 'Return'}
          onClick={() => iframeHTML && navigate('/simulator')}
          disabled={loading}
          className='bg-[#222629] text-[#F0F0F0] w-32 h-12 p-3 rounded-3xl transition-[200ms] ease-in-out hover:scale-105 cursor-pointer active:brightness-75 disabled:bg-gray-500'
        />
      </form>
    </div>
  );
}
