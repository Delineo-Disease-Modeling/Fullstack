import { useEffect, useState } from 'react';
import { useNavigate } from "react-router-dom";
import { DB_URL } from '../env';

export default function CzDict({ setZone }) {
  const navigate = useNavigate();
  
  const [tab, setTab] = useState(0);
  const [locations, setLocations] = useState([]);

  const my_zones = JSON.parse(localStorage.getItem('czlist') ?? '[]');

  useEffect(() => {
    fetch(`${DB_URL}convenience-zones`)
      .then((res) => res.json())
      .then((json) => setLocations(json['data']))
      .catch(console.error);
  }, []);
  
  return (
    <div className='flex flex-col gap-4 w-full items-center'>
      <div className='flex flex-col w-[25rem] h-[15rem] outline outline-2 outline-[#70B4D4] bg-[#fffff2]'>
        {/* Tabs */}
        <div className='flex h-6'>
          <div
            className='bg-[#70B4D4] text-center text-white flex-1 h-full hover:cursor-pointer'
            style={tab === 0 ? {filter: 'brightness(0.8)'} : undefined}
            onClick={() => setTab(0)}
          >
            All Zones
          </div>
          <div
            className='bg-[#70B4D4] text-center text-white flex-1 h-full hover:cursor-pointer'
            style={tab === 1 ? {filter: 'brightness(0.8)'} : undefined}
            onClick={() => setTab(1)}
          >
            My Zones
          </div>
        </div>

        {/* List */}
        <div className='flex flex-col h-auto overflow-y-scroll px-1 gap-y-1'>
          {locations.filter((loc) => tab === 0 ? true : my_zones.includes(loc.id)).map((loc) => (
            <div
              key={loc.id}
              className='flex justify-between'
              onClick={() => setZone(loc)}
            >
              <p>{loc.label}</p>
              <p>{loc.size} - {new Date(loc.created_at).toLocaleDateString()}</p>
            </div>
          ))}
        </div>
      </div>
      
      <button
        className='simset_button w-48'
        onClick={() => navigate('/cz-generation')}
      >
        + Generate Zone
      </button>
    </div>
  );
}
