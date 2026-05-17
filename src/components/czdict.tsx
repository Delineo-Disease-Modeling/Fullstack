'use client';

import { useEffect, useRef, useState } from 'react';
import { useSession } from '@/lib/auth-client';
import { getGuestZoneClaimHeaders } from '@/lib/guest-zone-claims';
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
  const setSettings = useSimSettings((state) => state.setSettings);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
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

  useEffect(() => {
    let active = true;
    let es: EventSource | null = null;
    let fallbackTimer: number | null = null;

    if (!userId) {
      setLocations([]);
    }

    const fetchZones = async () => {
      if (!active) return;
      try {
        const res = await fetch('/api/convenience-zones', {
          headers: getGuestZoneClaimHeaders()
        });
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
        </div>

        <div className="sim_table_columns">
          <span className="flex-1">Name</span>
          <span className="flex-1 text-center">Population Size</span>
          <span className="flex-1 text-right">Created Date</span>
        </div>

        <div className="sim_table_body" style={{ overflowAnchor: 'none' }}>
          {loading ? (
            <p className="sim_table_empty">Loading...</p>
          ) : locations.length === 0 && (
            <p className="sim_table_empty">
              {loadError || 'No zones found, create one to get started.'}
            </p>
          )}
          {locations.map((loc) => {
            const isSelected = zone?.id === loc.id;
            const rowClasses = [
              'sim_table_row',
              isSelected ? 'is-selected' : '',
              !loc.ready ? 'is-pending' : ''
            ]
              .filter(Boolean)
              .join(' ');
            return (
              <button
                type="button"
                key={loc.id}
                className={rowClasses}
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
            );
          })}
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
