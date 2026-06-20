'use client';

import { Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useSession } from '@/lib/auth-client';
import { useIsAdmin } from '@/lib/use-is-admin';
import type { ConvenienceZone } from '@/stores/simsettings';
import useSimSettings from '@/stores/simsettings';
import EditDeleteActions from './edit-delete-actions';

interface CzDictProps {
  zone: ConvenienceZone | null;
  setZone: (zone: ConvenienceZone) => void;
  locations: ConvenienceZone[];
  setLocations: React.Dispatch<React.SetStateAction<ConvenienceZone[]>>;
}

export default function CzDict({ zone, setZone, locations, setLocations }: CzDictProps) {
  const { data: session } = useSession();
  const user = session?.user;
  const userId = user?.id ?? null;
  const isAdmin = useIsAdmin();
  const setSettings = useSimSettings((state) => state.setSettings);

  // Admins can delete any zone (server-enforced) — used to prune duplicates.
  // Cascades the zone's runs + files; not undoable.
  const handleDeleteZone = async (loc: ConvenienceZone) => {
    if (
      !window.confirm(
        `Delete zone "${loc.name}" (pop ${loc.size}) and ALL its runs? This cannot be undone.`
      )
    ) {
      return;
    }
    try {
      const res = await fetch(`/api/convenience-zones/${loc.id}`, {
        method: 'DELETE'
      });
      if (!res.ok) throw new Error(`Delete failed (${res.status})`);
      setLocations((prev) => prev.filter((l) => l.id !== loc.id));
      if (zone?.id === loc.id) {
        setSettings({ zone: null, sim_id: null });
      }
    } catch (e) {
      console.error(e);
      window.alert('Could not delete zone. Are you signed in as an admin?');
    }
  };

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [showMyZones, setShowMyZones] = useState(false);
  const zoneRef = useRef(zone);
  const previousUserIdRef = useRef<string | null>(null);
  zoneRef.current = zone;

  useEffect(() => {
    const previousUserId = previousUserIdRef.current;
    const currentZone = zoneRef.current;

    if (
      previousUserId &&
      previousUserId !== userId &&
      currentZone?.user_id === previousUserId
    ) {
      setSettings({ zone: null, sim_id: null });
    }

    previousUserIdRef.current = userId;
  }, [userId, setSettings]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: userId is an intentional re-run trigger — a login/logout change must refetch zones and rebuild the SSE connection, even though userId is not read in the effect body.
  useEffect(() => {
    let active = true;
    let es: EventSource | null = null;
    let fallbackTimer: number | null = null;

    const fetchZones = async () => {
      if (!active) return;
      try {
        const res = await fetch('/api/convenience-zones?all=true');
        const json = await res.json().catch(() => ({}));
        const locs = Array.isArray(json.data) ? json.data : [];

        if (!active) return;

        if (!res.ok) {
          const currentZone = zoneRef.current;
          setLocations(currentZone ? [currentZone] : []);
          setLoadError(res.status === 401 ? '' : `Failed to load zones (${res.status}).`);
          setLoading(false);
          return;
        }

        setLocations(locs);
        setLoadError('');
        setLoading(false);

        const currentZone = zoneRef.current;
        if (currentZone) {
          const freshZone = locs.find(
            (candidate: ConvenienceZone) => candidate.id === currentZone.id
          );
          if (freshZone && JSON.stringify(freshZone) !== JSON.stringify(currentZone)) {
            setZone(freshZone);
          } else if (!freshZone && locs.length > 0) {
            setZone(locs[0]);
          }
        } else if (locs.length > 0) {
          setZone(locs[0]);
        }
      } catch (e) {
        if (!active) return;
        console.error(e);
        setLocations([]);
        setLoadError('Unable to reach the API. Check that the backend is running.');
        setLoading(false);
      }
    };

    const connectSSE = () => {
      es = new EventSource('/api/convenience-zones/events');

      es.onmessage = () => {
        fetchZones();
      };

      es.onerror = () => {
        if (!active) return;
        if (!fallbackTimer) {
          fallbackTimer = window.setInterval(fetchZones, 10_000);
        }
      };

      es.onopen = () => {
        if (fallbackTimer) {
          clearInterval(fallbackTimer);
          fallbackTimer = null;
        }
        fetchZones();
      };
    };

    setLoading(true);
    fetchZones().then(() => {
      if (active) connectSSE();
    });

    const heartbeat = window.setInterval(fetchZones, 60_000);
    window.addEventListener('delineo:guest-zone-claims-changed', fetchZones);
    window.addEventListener('delineo:guest-zones-claimed', fetchZones);

    return () => {
      active = false;
      if (es) es.close();
      if (fallbackTimer) clearInterval(fallbackTimer);
      clearInterval(heartbeat);
      window.removeEventListener(
        'delineo:guest-zone-claims-changed',
        fetchZones
      );
      window.removeEventListener('delineo:guest-zones-claimed', fetchZones);
    };
  }, [setZone, setLocations, userId]);

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="sim_table sim_table--zones">
        <div className="sim_table_header">
          <h3 className="sim_table_title">Zones</h3>
          {user && (
            <label className="sim_table_header_toggle">
              <input
                type="checkbox"
                checked={showMyZones}
                onChange={(e) => setShowMyZones(e.target.checked)}
              />
              My zones
            </label>
          )}
        </div>

        <div className="sim_table_columns">
          <span className="flex-1">Name</span>
          <span className="flex-1 text-center">Population Size</span>
          <span className="flex-1 text-right">Created Date</span>
        </div>

        <div className="sim_table_body" style={{ overflowAnchor: 'none' }}>
          {(() => {
            const visibleLocations = showMyZones
              ? locations.filter((l) => l.user_id === userId)
              : locations;

            if (loading) return <p className="sim_table_empty">Loading...</p>;
            if (visibleLocations.length === 0) {
              const message = loadError
                || (showMyZones
                  ? "You haven't generated any zones yet."
                  : 'No zones found, create one to get started.');
              return <p className="sim_table_empty">{message}</p>;
            }

            return visibleLocations.map((loc) => {
              const isSelected = zone?.id === loc.id;
              const rowClasses = [
                'sim_table_row',
                isSelected ? 'is-selected' : '',
                !loc.ready ? 'is-pending' : ''
              ]
                .filter(Boolean)
                .join(' ');
              return (
                <div key={loc.id} className="flex items-stretch gap-1">
                  <button
                    type="button"
                    className={`${rowClasses} flex-1`}
                    onClick={() => {
                      setZone(loc);
                      setSettings({ sim_id: null });
                    }}
                  >
                    <span className="flex-1 truncate">{loc.name}</span>
                    <span className="flex-1 text-center">{loc.size}</span>
                    <span className="flex-1 text-right">
                      {new Date(loc.created_at).toLocaleDateString()}
                    </span>
                    {!loc.ready && (
                      <span className="sim_table_row_badge">Generating…</span>
                    )}
                  </button>
                  {isAdmin && (
                    <button
                      type="button"
                      aria-label={`Delete zone ${loc.name}`}
                      title="Delete zone (and all its runs)"
                      className="px-2 rounded text-(--color-text-muted) hover:text-red-600 hover:bg-red-50 transition-colors"
                      onClick={() => handleDeleteZone(loc)}
                    >
                      <Trash2 size={15} aria-hidden="true" />
                    </button>
                  )}
                </div>
              );
            });
          })()}
        </div>
      </div>

      {!user && (
        <p className="sim_guest_save_notice">
          Log in to save generated zones. Zones created during this visit will
          be saved to your account when you log in.
        </p>
      )}

      {zone?.description && (
        <div className="sim_zone_description">
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

    </div>
  );
}
