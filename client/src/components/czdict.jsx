import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../lib/auth-client';
import InstructionBanner from './instruction-banner';
import useSimSettings from '../stores/simsettings';

export default function CzDict({ zone, setZone }) {
  const navigate = useNavigate();
  const { data: session } = useSession();
  const user = session?.user;
  const setSettings = useSimSettings((state) => state.setSettings);

  const [tab, setTab] = useState(0);
  const [locations, setLocations] = useState([]);
  const [hoveredLocId, setHoveredLocId] = useState(null);

  const hasUserZones = user && locations.some((loc) => loc.user_id === user.id);

  useEffect(() => {
    let active = true;
    fetch(`${import.meta.env.VITE_DB_URL}convenience-zones`)
      .then((res) => res.json())
      .then((json) => {
        if (!active) return;
        const locs = json.data ?? [];
        setLocations(locs);

        if (zone) {
          // If we have a selected zone, ensure it's up to date with the fetched list
          const freshZone = locs.find((z) => z.id === zone.id);
          if (freshZone && JSON.stringify(freshZone) !== JSON.stringify(zone)) {
            // Determine if we should update.
            // Simple equality check might be enough if object order is stable
            console.log('Syncing stale zone data', zone, freshZone);
            setZone(freshZone);
          }
        } else if (locs.length > 0) {
          // No zone selected, select the first one
          setZone(locs[0]);
        }
      })
      .catch(console.error);

    return () => {
      active = false;
    };
  }, [setZone, zone]);

  useEffect(() => {
    if (!hasUserZones) {
      setTab(0);
    }
  }, [hasUserZones]);

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex flex-col w-120 h-80 max-w-[90vw] outline-solid outline-2 outline-[var(--color-primary-blue)] bg-[var(--color-bg-ivory)]">
        {/* Tabs */}
        {hasUserZones ? (
          <div className="flex h-6">
            <div
              className="bg-[var(--color-primary-blue)] text-center text-white flex-1 h-full hover:cursor-pointer"
              style={tab === 0 ? { filter: 'brightness(0.8)' } : undefined}
              onClick={() => setTab(0)}
            >
              All Zones
            </div>
            <div
              className="bg-[var(--color-primary-blue)] text-center text-white flex-1 h-full hover:cursor-pointer"
              style={tab === 1 ? { filter: 'brightness(0.8)' } : undefined}
              onClick={() => setTab(1)}
            >
              My Zones
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-6 text-white bg-[var(--color-primary-blue)]">
            Convenience Zones
          </div>
        )}

        {/* Header Row */}
        <div className="flex px-1 justify-between text-xs font-semibold bg-[var(--color-primary-blue)] text-white py-1">
          <p className="flex-1">Name</p>
          <p className="flex-1 text-center">Population Size</p>
          <p className="flex-1 text-right">Created Date</p>
        </div>

        {/* List */}
        <div className="relative flex flex-col h-full overflow-y-scroll gap-y-1">
          {locations.length === 0 && (
            <p className="text-center my-auto">
              No zones found, create one to get started!
            </p>
          )}
          {locations
            .filter((loc) => (tab === 0 ? true : loc.user_id === user?.id))
            .map((loc) => (
              <div
                key={loc.id}
                className="flex px-1 justify-between items-center hover:cursor-pointer hover:scale-[0.98] py-1 relative select-none"
                style={
                  !loc.ready
                    ? {
                        background: '#11111140',
                        color: 'white',
                        cursor: 'not-allowed'
                      }
                    : zone.id === loc.id
                      ? {
                          background: 'var(--color-primary-blue)',
                          color: 'white'
                        }
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
                <p className="flex-1 text-right">
                  {new Date(loc.created_at).toLocaleDateString()}
                </p>

                {!loc.ready && hoveredLocId === loc.id && (
                  <div className="absolute z-10 px-2 py-1 text-xs text-white -translate-x-1/2 -translate-y-1/2 bg-black rounded-sm shadow-lg top-1/2 left-1/2">
                    Currently Generating
                  </div>
                )}
              </div>
            ))}
        </div>
      </div>

      {/* Description of current zone */}
      {zone && (
        <div className="w-120 max-w-[90vw] py-1 px-1.5 outline-solid outline-2 outline-[var(--color-primary-blue)] bg-[var(--color-bg-ivory)] italic whitespace-pre-line">
          {zone.description}
        </div>
      )}

      {user ? (
        <button
          className="w-48 simset_button"
          onClick={() => navigate('/cz-generation')}
        >
          + Generate Zone
        </button>
      ) : (
        <InstructionBanner text="Login to generate a Convenience Zone" />
      )}
    </div>
  );
}
