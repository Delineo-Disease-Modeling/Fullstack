'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useSession } from '@/lib/auth-client';
import type { ConvenienceZone } from '@/stores/simsettings';
import useSimSettings from '@/stores/simsettings';
import EditDeleteActions from './edit-delete-actions';
import InstructionBanner from './instruction-banner';

interface CzDictProps {
  zone: ConvenienceZone | null;
  setZone: (zone: ConvenienceZone) => void;
}

export default function CzDict({ zone, setZone }: CzDictProps) {
  const router = useRouter();
  const { data: session } = useSession();
  const user = session?.user;
  const setSettings = useSimSettings((state) => state.setSettings);

  const [tab, setTab] = useState(0);
  const [locations, setLocations] = useState<ConvenienceZone[]>([]);
  const [hoveredLocId, setHoveredLocId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const zoneRef = useRef(zone);
  zoneRef.current = zone;

  const hasUserZones = user && locations.some((loc) => loc.user_id === user.id);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetch('/api/convenience-zones')
      .then((res) => res.json())
      .then((json) => {
        if (!active) return;
        const locs = json.data ?? [];
        setLocations(locs);
        setLoading(false);

        const currentZone = zoneRef.current;
        if (currentZone) {
          const freshZone = locs.find((z: ConvenienceZone) => z.id === currentZone.id);
          if (freshZone && JSON.stringify(freshZone) !== JSON.stringify(currentZone)) {
            setZone(freshZone);
          }
        } else if (locs.length > 0) {
          setZone(locs[0]);
        }
      })
      .catch((e) => { console.error(e); if (active) setLoading(false); });

    return () => {
      active = false;
    };
  }, [setZone]);

  useEffect(() => {
    if (!hasUserZones) {
      setTab(0);
    }
  }, [hasUserZones]);


  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex flex-col w-120 h-80 max-w-[90vw] outline-solid outline-2 outline-(--color-primary-blue) bg-(--color-bg-ivory)">
        {hasUserZones ? (
          <div className="flex h-6">
            <button
              type="button"
              className="bg-(--color-primary-blue) text-center text-white flex-1 h-full cursor-pointer"
              style={tab === 0 ? { filter: 'brightness(0.8)' } : undefined}
              onClick={() => setTab(0)}
            >
              All Zones
            </button>
            <button
              type="button"
              className="bg-(--color-primary-blue) text-center text-white flex-1 h-full cursor-pointer"
              style={tab === 1 ? { filter: 'brightness(0.8)' } : undefined}
              onClick={() => setTab(1)}
            >
              My Zones
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-center h-6 text-white bg-(--color-primary-blue)">
            Convenience Zones
          </div>
        )}

        <div className="flex px-2 justify-between text-xs font-semibold bg-(--color-primary-blue) text-white py-1">
          <p className="flex-1">Name</p>
          <p className="flex-1 text-center">Population Size</p>
          <p className="flex-1 text-right">Created Date</p>
        </div>

        <div className="relative flex flex-col h-full overflow-y-scroll gap-y-1 px-1 py-1" style={{ overflowAnchor: 'none' }}>
          {loading ? (
            <p className="text-center my-auto">Loading...</p>
          ) : locations.length === 0 && (
            <p className="text-center my-auto">
              No zones found, create one to get started!
            </p>
          )}
          {locations
            .filter((loc) => (tab === 0 ? true : loc.user_id === user?.id))
            .map((loc) => (
              <button
                type="button"
                key={loc.id}
                className={`flex w-full text-left px-1 justify-between items-center py-1 relative select-none rounded-md hover:outline-solid hover:outline-1 ${zone?.id === loc.id ? 'hover:outline-(--color-bg-dark)' : 'hover:outline-(--color-primary-blue)'}`}
                style={
                  !loc.ready
                    ? {
                        background: '#11111140',
                        color: 'white',
                        cursor: 'not-allowed'
                      }
                    : zone?.id === loc.id
                      ? {
                          background: 'var(--color-primary-blue)',
                          color: 'white'
                        }
                      : undefined
                }
                onClick={() => {
                  if (loc.ready) setZone(loc);
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
              </button>
            ))}
        </div>
      </div>

      {zone && (
        <div className="w-120 max-w-[90vw] py-1 px-1.5 outline-solid outline-2 outline-(--color-primary-blue) bg-(--color-bg-ivory) italic whitespace-pre-line">
          {zone.description}
        </div>
      )}

      {zone && user && zone.user_id === user.id && zone.ready && (
        <div className="flex gap-2 w-120 max-w-[90vw] justify-center">
          <EditDeleteActions
            fields={[
              { key: 'name', label: 'Name' },
              { key: 'description', label: 'Description', type: 'textarea', rows: 3 },
            ]}
            itemName={zone.name}
            getInitialValues={() => ({ name: zone.name, description: zone.description })}
            onSave={async (values) => {
              const res = await fetch(`/api/convenience-zones/${zone.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: values.name.trim(), description: values.description }),
              });
              
              if (res.ok) {
                const { data } = await res.json();
                setZone(data);
                setLocations((prev) => prev.map((l) => (l.id === data.id ? data : l)));
                return true;
              }

              return false;
            }}
            onDelete={async () => {
              const res = await fetch(`/api/convenience-zones/${zone.id}`, {
                method: 'DELETE',
              });

              if (res.ok) {
                const remaining = locations.filter((l) => l.id !== zone.id);
                setLocations(remaining);
                if (remaining.length > 0) {
                  setZone(remaining[0]);
                } else {
                  setSettings({ zone: null, sim_id: null });
                }
                return true;
              }
              
              return false;
            }}
          />
        </div>
      )}

      {user ? (
        <button
          type="button"
          className="w-42 simset_button"
          onClick={() => router.push('/cz-generation')}
        >
          + Generate Zone
        </button>
      ) : (
        <InstructionBanner text="Login to generate a Convenience Zone" />
      )}
    </div>
  );
}
