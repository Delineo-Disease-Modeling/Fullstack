import { useEffect, useState } from 'react';
import { useNavigate } from "react-router-dom";
import { DB_URL } from '../env';

export default function CzDict({ zone, setZone }) {
  const navigate = useNavigate();

  const [tab, setTab] = useState(0);
  const [locations, setLocations] = useState([]);
  const [hoveredLocId, setHoveredLocId] = useState(null);

  const my_zones = JSON.parse(localStorage.getItem('czlist') ?? '[]');

  useEffect(() => {
    fetch(`${DB_URL}convenience-zones`)
      .then((res) => res.json())
      .then((json) => {
        if (!zone && json['data']?.[0]) {
          setZone(json['data'][0]);
        }
        setLocations(json['data']);
      })
      .catch(console.error);
  }, [zone, setZone]);

  return (
    <div className='flex flex-col items-center w-full gap-4'>
      <div className='flex flex-col w-120 h-80 max-w-[90vw] outline-solid outline-2 outline-[#70B4D4] bg-[#fffff2]'>
        {/* Tabs */}
        <div className='flex h-6'>
          <div
            className='bg-[#70B4D4] text-center text-white flex-1 h-full hover:cursor-pointer'
            style={tab === 0 ? { filter: 'brightness(0.8)' } : undefined}
            onClick={() => setTab(0)}
          >
            All Zones
          </div>
          <div
            className='bg-[#70B4D4] text-center text-white flex-1 h-full hover:cursor-pointer'
            style={tab === 1 ? { filter: 'brightness(0.8)' } : undefined}
            onClick={() => setTab(1)}
          >
            My Zones
          </div>
        </div>

        {/* Header Row */}
        <div className="flex px-1 justify-between text-xs font-semibold bg-[#70B4D4] text-white py-1">
          <p className="flex-1">Name</p>
          <p className="flex-1 text-center">Population Size</p>
          <p className="flex-1 text-right">Created Date</p>
        </div>

        {/* List */}
        <div className='relative flex flex-col h-auto overflow-y-scroll gap-y-1'>
          {locations.filter((loc) => tab === 0 ? true : my_zones.includes(loc.id)).map((loc) => (
            <div
              key={loc.id}
              className='flex px-1 justify-between items-center hover:cursor-pointer hover:scale-[0.98] py-1 relative'
              style={
                !loc.ready
                  ? { background: '#11111140', color: 'white', cursor: 'not-allowed' }
                  : zone.id === loc.id
                    ? { background: '#70B4D4', color: 'white' }
                    : undefined
              }
              onClick={() => loc.ready && setZone(loc)}
              onMouseEnter={() => setHoveredLocId(loc.id)}
              onMouseLeave={() => setHoveredLocId(null)}
            >
              <p className="flex-1">{loc.name}</p>
              <p className="flex-1 text-center">{loc.size}</p>
              <p className="flex-1 text-right">{new Date(loc.created_at).toLocaleDateString()}</p>

              {!loc.ready && hoveredLocId === loc.id && (
                <div className="absolute z-10 px-2 py-1 text-xs text-white -translate-x-1/2 -translate-y-1/2 bg-black rounded-sm shadow-lg top-1/2 left-1/2">
                  Currently Generating
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <button
        className='w-48 simset_button'
        onClick={() => navigate('/cz-generation')}
      >
        + Generate Zone
      </button>
    </div>
  );
}