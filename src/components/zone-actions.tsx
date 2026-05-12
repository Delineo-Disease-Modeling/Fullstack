'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useSession } from '@/lib/auth-client';
import type { ConvenienceZone } from '@/stores/simsettings';
import useSimSettings from '@/stores/simsettings';
import Button from './ui/button';

interface ZoneActionsProps {
  zone: ConvenienceZone | null;
  setZone: (zone: ConvenienceZone) => void;
  locations: ConvenienceZone[];
  setLocations: React.Dispatch<React.SetStateAction<ConvenienceZone[]>>;
}

export default function ZoneActions({ zone, setZone, locations, setLocations }: ZoneActionsProps) {
  const router = useRouter();
  const { data: session } = useSession();
  const user = session?.user;
  const setSettings = useSimSettings((state) => state.setSettings);

  const [clearOpen, setClearOpen] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [clearError, setClearError] = useState('');

  if (!user) {
    return null;
  }

  const myZones = locations.filter((loc) => loc.user_id === user.id);

  return (
    <div className="flex gap-2 items-start justify-center">
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
              <p className="text-sm font-semibold">
                Delete your {myZones.length} zone{myZones.length === 1 ? '' : 's'}?
              </p>
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
                            const res = await fetch(`/api/convenience-zones/${loc.id}`, {
                              method: 'DELETE'
                            });
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
                        myZones
                          .filter((_, i) => statuses[i] >= 200 && statuses[i] < 300)
                          .map((loc) => loc.id)
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
                        setClearError(
                          `Failed to delete ${failed.length} of ${myZones.length} (status ${failed[0] || 'network'}). Check console.`
                        );
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
}
