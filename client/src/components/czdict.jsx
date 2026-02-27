import { useEffect, useState } from 'react';
import { useNavigate } from "react-router-dom";
import { DB_URL } from '../env';
import useAuth from '../stores/auth';
import InstructionBanner from './instruction-banner';
import useSimSettings from '../stores/simsettings';

export default function CzDict({ zone, setZone }) {
  const navigate = useNavigate();
  const user = useAuth((state) => state.user);
  const setSettings = useSimSettings((state) => state.setSettings);

  const [tab, setTab] = useState(0);
  const [locations, setLocations] = useState([]);
  const [loadError, setLoadError] = useState('');
  const [hoveredLocId, setHoveredLocId] = useState(null);

  useEffect(() => {
    let cancelled = false;

    fetch(`${DB_URL}convenience-zones`)
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        const zones = Array.isArray(json?.data) ? json.data : [];

        if (cancelled) {
          return;
        }

        if (!res.ok) {
          setLocations([]);
          setLoadError(`Failed to load zones (${res.status}).`);
          return;
        }

        if (!zone && zones[0]) {
          setZone(zones[0]);
        }
        setLocations(zones);
        setLoadError('');
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        console.error(error);
        setLocations([]);
        setLoadError('Unable to reach the API. Check that the backend is running.');
      });

    return () => {
      cancelled = true;
    };
  }, [zone, setZone]);

  const visibleLocations = (Array.isArray(locations) ? locations : [])
    .filter((loc) => tab === 0 ? true : loc.user_id === user?.id);

  const deleteZone = async (loc, e) => {
    e?.stopPropagation?.();
    if (!user || loc.user_id !== user.id) {
      return;
    }

    const ok = window.confirm(`Delete zone "${loc.name}"? This also deletes its saved runs.`);
    if (!ok) {
      return;
    }

    try {
      const res = await fetch(`${DB_URL}convenience-zones/${loc.id}`, { method: 'DELETE' });
      if (!res.ok) {
        throw new Error(`Delete failed (${res.status})`);
      }

      const remaining = (locations || []).filter((z) => z.id !== loc.id);
      setLocations(remaining);

      if (zone?.id === loc.id) {
        setSettings({ sim_id: null });
        setZone(remaining[0] ?? null);
      }
    } catch (err) {
      console.error(err);
      alert('Failed to delete zone');
    }
  };

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
          {visibleLocations.map((loc) => (
            <div
              key={loc.id}
              className='flex px-1 justify-between items-center hover:cursor-pointer hover:scale-[0.98] py-1 relative select-none'
              style={
                !loc.ready
                  ? { background: '#11111140', color: 'white', cursor: 'not-allowed' }
                  : zone?.id === loc.id
                    ? { background: '#70B4D4', color: 'white' }
                    : undefined
              }
              onClick={() => {
                if (loc.ready) {
                  setZone(loc);
                }

                setSettings({ sim_id: null });
              }}
              onMouseEnter={() => setHoveredLocId(loc.id)}
              onMouseLeave={() => setHoveredLocId(null)}
            >
              <p className="flex-1">{loc.name}</p>
              <p className="flex-1 text-center">{loc.size}</p>
              <div className="flex-1 flex items-center justify-end gap-2">
                <p className="text-right">{new Date(loc.created_at).toLocaleDateString()}</p>
                {tab === 1 && user && loc.user_id === user.id && (
                  <button
                    className='text-xs px-2 py-0.5 rounded-sm bg-[#222629] text-white hover:brightness-110'
                    onClick={(e) => deleteZone(loc, e)}
                    title='Delete zone'
                  >
                    Delete
                  </button>
                )}
              </div>

              {!loc.ready && hoveredLocId === loc.id && (
                <div className="absolute z-10 px-2 py-1 text-xs text-white -translate-x-1/2 -translate-y-1/2 bg-black rounded-sm shadow-lg top-1/2 left-1/2">
                  Currently Generating
                </div>
              )}
            </div>
          ))}
          {visibleLocations.length === 0 && (
            <div className='px-2 py-3 text-sm text-gray-500'>
              {loadError || 'No convenience zones found.'}
            </div>
          )}
        </div>
      </div>

      {/* Description of current zone */}
      {zone && (
        <div className='w-120 max-w-[90vw] py-1 px-1.5 outline-solid outline-2 outline-[#70B4D4] bg-[#fffff2] italic whitespace-pre-line'>
          {zone.description}
        </div>
      )}


      {user ? (
        <button
          className='w-48 simset_button'
          onClick={() => navigate('/cz-generation')}
        >
          + Generate Zone
        </button>
      ) : (
        <InstructionBanner text='Login to generate a Convenience Zone' />
      )}
    </div>
  );
}
