'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useSession } from '@/lib/auth-client';
import type { ConvenienceZone } from '@/stores/simsettings';
import useSimSettings from '@/stores/simsettings';
import EditDeleteActions from './edit-delete-actions';
import InstructionBanner from './instruction-banner';
import Button from './ui/button';

interface CzDictProps {
  zone: ConvenienceZone | null;
  setZone: (zone: ConvenienceZone) => void;
}

export default function CzDict({ zone, setZone }: CzDictProps) {
  const router = useRouter();
  const { data: session } = useSession();
  const user = session?.user;
  const setSettings = useSimSettings((state) => state.setSettings);

  const [locations, setLocations] = useState<ConvenienceZone[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [clearOpen, setClearOpen] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [clearError, setClearError] = useState('');
  const zoneRef = useRef(zone);
  zoneRef.current = zone;

  useEffect(() => {
    let active = true;
    let es: EventSource | null = null;
    let fallbackTimer: number | null = null;

    const fetchZones = async () => {
      if (!active) return;
      try {
        const res = await fetch('/api/convenience-zones');
        const json = await res.json().catch(() => ({}));
        const locs = Array.isArray(json.data) ? json.data : [];

        if (!active) return;

        if (!res.ok) {
          setLocations([]);
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

    return () => {
      active = false;
      if (es) es.close();
      if (fallbackTimer) clearInterval(fallbackTimer);
      clearInterval(heartbeat);
    };
  }, [setZone]);

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

      {zone && zone.description && (
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

      {user ? (
        (() => {
          const myZones = locations.filter((loc) => loc.user_id === user.id);
          return (
            <div className="flex gap-2 items-start">
              <Button
                type="button"
                className="w-42 p-2!"
                onClick={() => router.push('/cz-generation')}
              >
                + Generate Zone
              </Button>
              {myZones.length > 0 && (
                <div className="relative">
                  <Button
                    type="button"
                    variant="destructive"
                    className="p-2!"
                    onClick={() => setClearOpen((v) => !v)}
                  >
                    Clear My Zones
                  </Button>
                  {clearOpen && (
                    <div className="absolute right-0 top-full mt-1 z-20 w-64 bg-(--color-bg-ivory) outline-solid outline-2 outline-red-600 rounded-md p-3 flex flex-col gap-2 shadow-lg">
                      <p className="text-sm font-semibold">Delete your {myZones.length} zone{myZones.length === 1 ? '' : 's'}?</p>
                      <p className="text-xs text-gray-600">This action cannot be undone.</p>
                      <div className="flex gap-2 justify-end">
                        <Button
                          type="button"
                          variant="neutral"
                          className="text-sm py-1! px-3!"
                          onClick={() => setClearOpen(false)}
                        >
                          Cancel
                        </Button>
                        <Button
                          type="button"
                          variant="destructive"
                          className="text-sm py-1! px-3!"
                          disabled={clearing}
                          onClick={async () => {
                            setClearing(true);
                            setClearError('');
                            try {
                              const statuses = await Promise.all(
                                myZones.map(async (loc) => {
                                  try {
                                    const res = await fetch(`/api/convenience-zones/${loc.id}`, { method: 'DELETE' });
                                    if (!res.ok) {
                                      const text = await res.text().catch(() => '');
                                      console.error(`DELETE zone ${loc.id} failed: ${res.status}`, text);
                                    }
                                    return res.status;
                                  } catch (e) {
                                    console.error(`DELETE zone ${loc.id} threw`, e);
                                    return 0;
                                  }
                                })
                              );
                              const deletedIds = new Set(
                                myZones.filter((_, i) => statuses[i] >= 200 && statuses[i] < 300).map((loc) => loc.id)
                              );
                              const failed = statuses.filter((s) => !(s >= 200 && s < 300));
                              const survivors = locations.filter((loc) => !deletedIds.has(loc.id));
                              setLocations(survivors);
                              if (zone && deletedIds.has(zone.id)) {
                                if (survivors.length > 0) {
                                  setZone(survivors[0]);
                                } else {
                                  setSettings({ zone: null, sim_id: null });
                                }
                              }
                              if (failed.length === 0) {
                                setClearOpen(false);
                              } else {
                                setClearError(`Failed to delete ${failed.length} of ${myZones.length} (status ${failed[0] || 'network'}). Check console.`);
                              }
                            } finally {
                              setClearing(false);
                            }
                          }}
                        >
                          {clearing ? 'Clearing...' : 'Clear All'}
                        </Button>
                      </div>
                      {clearError && (
                        <p className="text-xs text-red-600 mt-1">{clearError}</p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })()
      ) : (
        <InstructionBanner text="Login to generate a Convenience Zone" />
      )}
    </div>
  );
}
