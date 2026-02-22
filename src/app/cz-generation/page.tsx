'use client';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useSession } from '@/lib/auth-client';
import '@/styles/cz-generation.css';

const InteractiveMap = dynamic(() => import('@/components/interactive-map'), {
  ssr: false
});
const CBGMap = dynamic(() => import('@/components/cbg-map'), { ssr: false });

interface LatLng {
  lat: number;
  lng: number;
}

interface GeoJSONData {
  type: string;
  features: Array<{
    type: string;
    properties: Record<string, unknown>;
    geometry: object;
  }>;
}

interface FormFieldProps {
  label: string;
  name: string;
  type: string;
  placeholder?: string;
  defaultValue?: string | number;
  disabled?: boolean;
  value?: string | number;
  onChange?: (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => void;
  min?: number;
  max?: number;
}

function FormField({
  label,
  name,
  type,
  placeholder,
  defaultValue,
  disabled,
  value,
  onChange,
  min,
  max
}: FormFieldProps) {
  return (
    <div className="flex flex-col gap-0.5">
      <label htmlFor={name}>{label}</label>
      {type === 'textarea' ? (
        <textarea
          className="formfield"
          name={name}
          id={name}
          placeholder={placeholder}
          disabled={disabled}
          value={value as string}
          onChange={onChange as React.ChangeEventHandler<HTMLTextAreaElement>}
          required
        />
      ) : (
        <input
          className="formfield"
          name={name}
          id={name}
          type={type}
          placeholder={placeholder}
          defaultValue={defaultValue}
          disabled={disabled}
          value={value as string}
          onChange={onChange as React.ChangeEventHandler<HTMLInputElement>}
          min={min}
          max={max}
          required
        />
      )}
    </div>
  );
}

export default function CZGeneration() {
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const user = session?.user;
  const isResolvingMapClickRef = useRef(false);

  const [location, setLocation] = useState('');
  const [minPop, setMinPop] = useState(5000);
  const [startDate, setStartDate] = useState('2019-01-01');
  const [length, setLength] = useState(15);
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [phase, setPhase] = useState<'input' | 'edit' | 'finalizing'>('input');
  const [cbgGeoJSON, setCbgGeoJSON] = useState<GeoJSONData | null>(null);
  const [selectedCBGs, setSelectedCBGs] = useState<string[]>([]);
  const [seedCBG, setSeedCBG] = useState('');
  const [totalPopulation, setTotalPopulation] = useState(0);
  const [mapCenter, setMapCenter] = useState<[number, number] | null>(null);
  const [cityName, setCityName] = useState('');
  const [cziMetrics, setCziMetrics] = useState<{
    movement_inside?: number;
    movement_boundary?: number;
    czi?: number;
  } | null>(null);
  const [cziLoading, setCziLoading] = useState(false);

  const hasGenerated = phase === 'edit';
  const isFinalizing = phase === 'finalizing';

  const ALG_URL = process.env.NEXT_PUBLIC_ALG_URL;

  useEffect(() => {
    if (!hasGenerated || !seedCBG || selectedCBGs.length === 0) {
      setCziMetrics(null);
      setCziLoading(false);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      setCziLoading(true);
      try {
        const resp = await fetch(`${ALG_URL}cz-metrics`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ seed_cbg: seedCBG, cbg_list: selectedCBGs })
        });
        const data = await resp.json();
        if (!cancelled) setCziMetrics(data || null);
      } catch (err) {
        if (!cancelled) {
          setCziMetrics({ movement_inside: 0, movement_boundary: 0, czi: 0 });
        }
        console.warn('Failed to compute CZI metrics:', err);
      } finally {
        if (!cancelled) setCziLoading(false);
      }
    }, 180);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [hasGenerated, seedCBG, selectedCBGs, ALG_URL]);

  const movementInside = Number(cziMetrics?.movement_inside ?? 0);
  const movementBoundary = Number(cziMetrics?.movement_boundary ?? 0);
  const cziDisplay = (() => {
    if (cziLoading) return 'Calculating...';
    if (movementBoundary === 0) return movementInside > 0 ? 'Infinity' : '0';
    const cziValue = Number(cziMetrics?.czi);
    if (Number.isFinite(cziValue)) return cziValue.toFixed(4);
    return (movementInside / movementBoundary).toFixed(4);
  })();

  const finalizeCZ = async () => {
    if (selectedCBGs.length === 0) {
      setError('Please select at least one CBG');
      return;
    }

    setPhase('finalizing');
    setError('');
    try {
      const lengthHours = length * 24;

      const resp = await fetch(`${ALG_URL}finalize-cz`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: cityName,
          description: description,
          cbg_list: selectedCBGs,
          start_date: new Date(startDate).toISOString(),
          length: lengthHours,
          latitude: mapCenter?.[0] || 0,
          longitude: mapCenter?.[1] || 0,
          user_id: user?.id
        })
      });

      const data = await resp.json();

      if (resp.ok && data?.id) {
        console.log('CZ finalized with ID:', data.id);
        router.push('/simulator');
      } else {
        throw new Error('Failed to finalize CZ');
      }
    } catch (err) {
      console.error('Error finalizing CZ:', err);
      setError(
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || 'Failed to create convenience zone. Please try again.'
      );
      setPhase('edit');
    }
  };

  const handleCBGClick = async (
    cbgId: string,
    properties: Record<string, unknown>
  ) => {
    const wasInCluster = selectedCBGs.includes(cbgId);

    if (wasInCluster) {
      setSelectedCBGs((prev) => prev.filter((id) => id !== cbgId));
      setTotalPopulation((p) => p - ((properties.population as number) || 0));
    } else {
      setSelectedCBGs((prev) => [...prev, cbgId]);
      setTotalPopulation((p) => p + ((properties.population as number) || 0));

      if (!properties.in_cluster) {
        try {
          const resp = await fetch(
            `${ALG_URL}cbg-geojson?cbgs=${cbgId}&include_neighbors=true`
          );
          const data = await resp.json();
          if (data?.features) {
            setCbgGeoJSON((prev) => {
              if (!prev) return data;
              const existingIds = new Set(
                prev.features.map(
                  (f) =>
                    (
                      f.properties as {
                        GEOID?: string;
                        CensusBlockGroup?: string;
                      }
                    )?.GEOID ||
                    (
                      f.properties as {
                        GEOID?: string;
                        CensusBlockGroup?: string;
                      }
                    )?.CensusBlockGroup
                )
              );
              const newFeatures = data.features.filter(
                (f: {
                  properties: { GEOID?: string; CensusBlockGroup?: string };
                }) => {
                  const id =
                    f.properties?.GEOID || f.properties?.CensusBlockGroup;
                  return !existingIds.has(id);
                }
              );
              if (newFeatures.length === 0) return prev;
              return { ...prev, features: [...prev.features, ...newFeatures] };
            });
          }
        } catch (err) {
          console.warn('Failed to fetch neighbors for newly added CBG:', err);
        }
      }
    }
  };

  const handleMapBackgroundClick = async (latlng: LatLng) => {
    if (!latlng || isResolvingMapClickRef.current) return;
    const stateHint = String(selectedCBGs?.[0] ?? '').slice(0, 2);
    if (!stateHint) return;

    isResolvingMapClickRef.current = true;
    try {
      const resp = await fetch(
        `${ALG_URL}cbg-at-point?latitude=${latlng.lat}&longitude=${latlng.lng}&state_fips=${stateHint}`
      );
      const data = await resp.json();
      const clickedCbg = data?.cbg;
      if (!clickedCbg || selectedCBGs.includes(clickedCbg)) return;
      await handleCBGClick(clickedCbg, {
        population: data?.population || 0,
        in_cluster: false
      });
    } catch (err) {
      if ((err as { status?: number })?.status !== 404) {
        console.warn('Failed to resolve clicked map location to CBG:', err);
      }
    } finally {
      isResolvingMapClickRef.current = false;
    }
  };

  const lookupLocation = async (location: string) => {
    const resp = await fetch('/api/lookup-location', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ location })
    });
    if (!resp.ok) return null;
    return await resp.json();
  };

  const generateCZ = (formdata: FormData) => {
    const func_body = async (formdata: FormData) => {
      const rawLocation = String(formdata.get('location') ?? '').trim();

      const locationData = await lookupLocation(rawLocation);
      const core_cbg = locationData?.cbg;
      const resolvedCity = locationData?.city || rawLocation;

      if (!core_cbg) {
        setError(
          'Could not find location or CBG. Please try a different location or enter a 5-digit ZIP code.'
        );
        return;
      }

      setCityName(resolvedCity);

      const resp = await fetch(`${ALG_URL}cluster-cbgs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cbg: core_cbg,
          min_pop: +(formdata.get('min_pop') ?? 0)
        })
      });

      const data = await resp.json();

      if (!resp.ok || !data?.cluster) {
        throw new Error('Failed to cluster CBGs');
      }

      setSelectedCBGs(data.cluster || []);
      setSeedCBG(data.seed_cbg || core_cbg);
      setTotalPopulation(data.size || 0);
      setMapCenter(data.center || null);

      if (data.geojson) setCbgGeoJSON(data.geojson);
      setPhase('edit');
    };

    if (loading) return;
    setError('');
    setLoading(true);
    func_body(formdata)
      .catch((err) => {
        console.error(err);
        setError(
          (err as { response?: { data?: { message?: string } } })?.response
            ?.data?.message || 'Failed to cluster CBGs. Please try again.'
        );
      })
      .finally(() => setLoading(false));
  };

  if (isPending) {
    return <div className="text-white text-center mt-20">Loading...</div>;
  }

  if (!user) {
    router.replace('/simulator');
    return null;
  }

  return (
    <div className="flex flex-col items-center justify-start gap-20 min-h-[calc(100vh-160px)]">
      <h1 className="mt-28 text-3xl mx-8 text-wrap text-center">
        Convenience Zone Creation
      </h1>

      <form
        action={generateCZ}
        className="flex flex-col gap-8 mb-28 items-center"
      >
        <div className="flex justify-center items-start gap-10 flex-wrap mx-4">
          <div className="flex flex-col gap-4 items-stretch">
            <FormField
              label="City, Address, or Location"
              name="location"
              type="text"
              placeholder="e.g. 55902"
              value={location}
              onChange={(e) =>
                setLocation((e.target as HTMLInputElement).value)
              }
              disabled={loading || hasGenerated}
            />

            <FormField
              label="Minimum Population"
              name="min_pop"
              type="number"
              value={minPop}
              min={100}
              max={100_000}
              onChange={(e) => setMinPop(+(e.target as HTMLInputElement).value)}
              disabled={loading || hasGenerated}
            />

            <FormField
              label="Start Date"
              name="start_date"
              type="date"
              value={startDate}
              onChange={(e) =>
                setStartDate((e.target as HTMLInputElement).value)
              }
              disabled={loading || hasGenerated}
            />

            <FormField
              label="Length (days)"
              name="length"
              type="number"
              value={length}
              min={7}
              max={365}
              onChange={(e) => setLength(+(e.target as HTMLInputElement).value)}
              disabled={loading || hasGenerated}
            />

            <FormField
              label="Description"
              name="description"
              type="textarea"
              placeholder="a short description for this convenience zone..."
              value={description}
              onChange={(e) =>
                setDescription((e.target as HTMLTextAreaElement).value)
              }
              disabled={loading || hasGenerated}
            />

            {hasGenerated && (
              <div className="mt-4 p-3 bg-[var(--color-bg-ivory)] outline outline-2 outline-[var(--color-primary-blue)] rounded-lg">
                <div className="text-sm font-semibold mb-2">
                  Zone Statistics
                </div>
                <div className="text-sm">CBGs: {selectedCBGs.length}</div>
                <div className="text-sm">
                  Population: {totalPopulation.toLocaleString()}
                </div>
                <div className="text-sm">
                  CZI (inside / boundary): {cziDisplay}
                </div>
                <div className="text-xs text-gray-600 mt-1">
                  Movement inside: {Math.round(movementInside).toLocaleString()}{' '}
                  | Boundary movement:{' '}
                  {Math.round(movementBoundary).toLocaleString()}
                </div>
              </div>
            )}
          </div>

          {hasGenerated ? (
            <div className="flex flex-col gap-2">
              <div className="h-80 w-140 max-w-[85vw] relative">
                {cbgGeoJSON ? (
                  <CBGMap
                    cbgData={cbgGeoJSON}
                    onCBGClick={handleCBGClick}
                    onMapBackgroundClick={handleMapBackgroundClick}
                    selectedCBGs={selectedCBGs}
                  />
                ) : (
                  <div className="h-full w-full flex items-center justify-center bg-gray-100 text-gray-500">
                    <div className="text-center">
                      <p>CBG map not available</p>
                      <p className="text-sm">
                        GeoJSON endpoint needed on Algorithms server
                      </p>
                    </div>
                  </div>
                )}
                <div className="absolute bottom-2 left-2 bg-white/90 px-2 py-1 rounded text-xs">
                  Click CBGs (or empty map area) to add/remove from zone
                </div>
              </div>
            </div>
          ) : (
            <div className="h-72 w-140 max-w-[85vw]">
              <InteractiveMap
                onLocationSelect={setLocation}
                disabled={loading}
              />
            </div>
          )}
        </div>
        {error && (
          <div className="text-red-500 font-bold mb-4 text-center mx-4">
            {error}
          </div>
        )}
        <input
          type={phase === 'input' ? 'submit' : 'button'}
          value={
            loading
              ? 'Clustering...'
              : isFinalizing
                ? 'Generating Patterns...'
                : phase === 'input'
                  ? 'Preview CBGs'
                  : 'Finalize & Generate'
          }
          onClick={() => phase === 'edit' && finalizeCZ()}
          disabled={loading || isFinalizing}
          className="bg-[var(--color-bg-dark)] text-[var(--color-text-light)] w-48 h-12 p-3 rounded-3xl transition-[200ms] ease-in-out hover:scale-105 cursor-pointer active:brightness-75 disabled:bg-gray-500"
        />
      </form>
    </div>
  );
}
