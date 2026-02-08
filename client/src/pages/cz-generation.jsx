import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { MapContainer, TileLayer, Marker, Popup, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import { ALG_URL, DB_URL } from "../env";
import axios from 'axios';
import useAuth from "../stores/auth";

import zip_cbg_json from '../data/zip_to_cbg.json';

import 'leaflet/dist/leaflet.css';
import './cz-generation.css';

function InteractiveMap({ onLocationSelect, disabled }) {
  const [ markerPosition, setMarkerPosition ] = useState(null);

  function LocationMarker() {
    useMapEvents({
      click(e) {
        if (disabled) {
          return;
        }

        setMarkerPosition(e.latlng);
        const coords = `${e.latlng.lat.toFixed(4)}, ${e.latlng.lng.toFixed(4)}`;
        onLocationSelect(coords);
      }
    });

    return markerPosition === null ? null : (
      <Marker position={markerPosition}>
        <Popup>
          Selected Location: {markerPosition.lat.toFixed(4)}, {markerPosition.lng.toFixed(4)}
        </Popup>
      </Marker>
    );
  }

  return (
    <MapContainer
      center={[39.3290708, -76.6219753]}
      zoom={10}
      style={{ height: '100%', width: '100%'}}
    >
      <TileLayer
        attribution='&copy; OpenStreetMap contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      <LocationMarker />
    </MapContainer>
  );
}

// Static CBG Map component for viewing and editing CBGs after generation
function CBGMap({ cbgData, center, onCBGClick, selectedCBGs }) {
  const geoJsonLayerRef = useRef(null);
  const layersRef = useRef(new Map()); // Map of cbgId -> layer
  const selectedRef = useRef(selectedCBGs); // Keep ref to avoid stale closures
  const hasFittedRef = useRef(false);
  
  // Update ref when selection changes
  useEffect(() => {
    selectedRef.current = selectedCBGs;
  }, [selectedCBGs]);

  const getStyleForCbg = (cbgId) => {
    const isSelected = selectedRef.current?.includes(cbgId);
    return {
      fillColor: isSelected ? '#70B4D4' : '#BDBDBD',
      weight: isSelected ? 2 : 1.25,
      opacity: 1,
      color: isSelected ? '#1f2937' : '#6b7280',
      fillOpacity: isSelected ? 0.6 : 0.2,
    };
  };

  // Update layer styles when selection changes (without remounting)
  useEffect(() => {
    layersRef.current.forEach((layer, cbgId) => {
      layer.setStyle(getStyleForCbg(cbgId));
      // Update tooltip
      const pop = layer.feature?.properties?.population ?? 'N/A';
      const isSelected = selectedCBGs?.includes(cbgId);
      layer.setTooltipContent(
        `<strong>CBG:</strong> ${cbgId}<br/><strong>Population:</strong> ${pop}<br/><strong>Status:</strong> ${isSelected ? 'In Zone' : 'Click to Add'}`
      );
    });
  }, [selectedCBGs]);

  // Component that adds GeoJSON to map
  function GeoJSONLayer() {
    const map = useMap();
    
    useEffect(() => {
      if (!cbgData) return;

      // Clear previous layer
      if (geoJsonLayerRef.current) {
        map.removeLayer(geoJsonLayerRef.current);
        layersRef.current.clear();
      }

      // Create new GeoJSON layer
      const geoJsonLayer = L.geoJSON(cbgData, {
        style: (feature) => {
          const cbgId = feature.properties.GEOID || feature.properties.CensusBlockGroup;
          return getStyleForCbg(cbgId);
        },
        onEachFeature: (feature, layer) => {
          const cbgId = feature.properties.GEOID || feature.properties.CensusBlockGroup;
          const pop = feature.properties.population ?? 'N/A';
          const isSelected = selectedRef.current?.includes(cbgId);
          
          // Store layer reference
          layersRef.current.set(cbgId, layer);
          
          layer.bindTooltip(
            `<strong>CBG:</strong> ${cbgId}<br/><strong>Population:</strong> ${pop}<br/><strong>Status:</strong> ${isSelected ? 'In Zone' : 'Click to Add'}`,
            { sticky: true }
          );
          
          layer.on({
            click: () => {
              if (onCBGClick) {
                onCBGClick(cbgId, feature.properties);
              }
            },
            mouseover: (e) => {
              e.target.setStyle({
                weight: 3,
                fillOpacity: 0.9,
              });
            },
            mouseout: (e) => {
              e.target.setStyle(getStyleForCbg(cbgId));
            }
          });
        }
      });

      geoJsonLayer.addTo(map);
      geoJsonLayerRef.current = geoJsonLayer;

      // Fit bounds only once
      if (!hasFittedRef.current) {
        const bounds = geoJsonLayer.getBounds();
        if (bounds.isValid()) {
          map.invalidateSize();
          map.fitBounds(bounds, { padding: [20, 20], maxZoom: 12 });
          hasFittedRef.current = true;
        }
      }

      return () => {
        if (geoJsonLayerRef.current) {
          map.removeLayer(geoJsonLayerRef.current);
        }
      };
    }, [map, cbgData]);
    
    return null;
  }

  return (
    <MapContainer
      center={center || [39.3290708, -76.6219753]}
      zoom={12}
      style={{ height: '100%', width: '100%' }}
    >
      <TileLayer
        attribution='&copy; OpenStreetMap contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <GeoJSONLayer />
    </MapContainer>
  );
}

function FormField({ label, name, type, placeholder, defaultValue, disabled, value, onChange, min, max }) {
  return (
    <div className='flex flex-col gap-0.5'>
      <label htmlFor={name}>{label}</label>
      {type === 'textarea' ? (
        <textarea
          className='formfield'
          name={name}
          id={name}
          type={type}
          placeholder={placeholder}
          disabled={disabled}
          value={value}
          onChange={onChange}
          required
        />
      ): (
        <input
          className='formfield'
          name={name}
          id={name}
          type={type}
          placeholder={placeholder}
          defaultValue={defaultValue}
          disabled={disabled}
          value={value}
          onChange={onChange}
          min={min}
          max={max}
          required
        />
      )}
    </div>
  );
}

export default function CZGeneration() {
  const navigate = useNavigate();
  const user = useAuth((state) => state.user);

  const [ location, setLocation ] = useState('');
  const [ minPop, setMinPop ] = useState(5000);
  const [ startDate, setStartDate ] = useState('2019-01-01');  // Default to 2019 (pattern files are from 2019)
  const [ endDate, setEndDate ] = useState('2019-01-15');      // Default 2 weeks
  const [ description, setDescription ] = useState('');
  const [ loading, setLoading ] = useState(false);
  
  // Two-phase state
  const [ phase, setPhase ] = useState('input'); // 'input' | 'edit' | 'finalizing'
  const [ cbgGeoJSON, setCbgGeoJSON ] = useState(null);
  const [ selectedCBGs, setSelectedCBGs ] = useState([]);
  const [ totalPopulation, setTotalPopulation ] = useState(0);
  const [ mapCenter, setMapCenter ] = useState(null);
  const [ cityName, setCityName ] = useState('');

  // Derived state
  const hasGenerated = phase === 'edit';
  const isFinalizing = phase === 'finalizing';

  if (!user) {
    navigate('/simulator');
  }

  // Finalize CZ - create DB record and generate patterns with the final CBG list
  const finalizeCZ = async () => {
    if (selectedCBGs.length === 0) {
      alert('Please select at least one CBG');
      return;
    }
    
    setPhase('finalizing');
    try {
      const start = new Date(startDate);
      const end = new Date(endDate);
      const lengthHours = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60));
      
      console.log('Finalizing CZ with CBGs:', selectedCBGs);
      const resp = await axios.post(`${ALG_URL}finalize-cz`, {
        name: cityName,
        description: description,
        cbg_list: selectedCBGs,
        start_date: start.toISOString(),
        length: lengthHours,
        latitude: mapCenter?.[0] || 0,
        longitude: mapCenter?.[1] || 0,
        user_id: user.id
      });
      
      if (resp.status === 200 && resp.data?.id) {
        console.log('CZ finalized with ID:', resp.data.id);
        navigate('/simulator');
      } else {
        throw new Error('Failed to finalize CZ');
      }
    } catch (err) {
      console.error('Error finalizing CZ:', err);
      alert('Failed to create convenience zone. Please try again.');
      setPhase('edit'); // Go back to edit phase
    }
  };

  // Handle CBG click to toggle selection
  const handleCBGClick = (cbgId, properties) => {
    setSelectedCBGs(prev => {
      if (prev.includes(cbgId)) {
        // Remove CBG
        const newSelection = prev.filter(id => id !== cbgId);
        // Update population
        setTotalPopulation(p => p - (properties.population || 0));
        return newSelection;
      } else {
        // Add CBG
        setTotalPopulation(p => p + (properties.population || 0));
        return [...prev, cbgId];
      }
    });
  };

  const loc_lookup = async (location) => {
    const resp = await fetch(`${DB_URL}lookup-zip`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ location })
    });

    if (!resp.ok) {
      return null;
    }

    return await resp.json();
  };

  const zip_to_cbg = (location) => {
    const cbgs = zip_cbg_json[location];
    if (!Array.isArray(cbgs) || cbgs.length === 0) {
      return undefined;
    }

    // ZIPs can overlap multiple CBGs (and occasionally multiple counties).
    // Choose a stable "core" CBG by taking the most common county (state+county FIPS).
    const countyCounts = new Map();
    for (const cbg of cbgs) {
      if (typeof cbg !== 'string' || cbg.length < 5) continue;
      const county = cbg.slice(0, 5);
      countyCounts.set(county, (countyCounts.get(county) ?? 0) + 1);
    }

    let bestCounty = cbgs[0]?.slice(0, 5);
    let bestCount = -1;
    for (const [county, count] of countyCounts.entries()) {
      if (count > bestCount) {
        bestCounty = county;
        bestCount = count;
      }
    }

    return cbgs.find((cbg) => typeof cbg === 'string' && cbg.startsWith(bestCounty)) ?? cbgs[0];
  };

  const generateCZ = (formdata) => {
    const func_body = async (formdata) => {
      console.log(formdata);

      const rawLocationInput = String(formdata.get('location') ?? '').trim();
      const zipMatch = rawLocationInput.match(/^\d{5}(?:-\d{4})?$/);
      const userZip = zipMatch ? rawLocationInput.slice(0, 5) : null;

      // If user entered a valid ZIP, try to use it directly first
      let core_cbg = null;
      let location = null;
      let cityName = rawLocationInput;

      if (userZip) {
        // User entered a ZIP code - try local lookup first (no Google API needed)
        core_cbg = zip_to_cbg(userZip);
        if (core_cbg) {
          // Try to get city name from Google API, but don't fail if unavailable
          try {
            location = await loc_lookup(rawLocationInput);
            if (location?.['city']) {
              cityName = location['city'];
            }
          } catch (e) {
            console.log('Google API unavailable, using ZIP as location name');
          }
        }
      } else {
        // User entered a city/address - need Google API to resolve ZIP
        location = await loc_lookup(rawLocationInput);
        if (location?.['zip_code']) {
          core_cbg = zip_to_cbg(location['zip_code']);
          cityName = location['city'] ?? rawLocationInput;
        }
      }
  
      if (!core_cbg) {
        console.error('Could not find location. Try entering a 5-digit ZIP code.');
        alert('Could not find location. Please try entering a 5-digit ZIP code (e.g., 21201 for Baltimore).');
        return;
      }
  
      console.log(location);
      console.log(core_cbg);

      // Phase 1: Just cluster CBGs (fast) - don't create DB record yet
      const { status, data } = await axios.post(`${ALG_URL}cluster-cbgs`, {
        cbg: core_cbg,
        min_pop: +formdata.get('min_pop')
      });

      if (status !== 200) {
        throw new Error('Status code mismatch');
      }

      if (!data?.cluster) {
        throw new Error('Invalid response (missing cluster)');
      }

      // Store cluster data for editing
      const cluster = data.cluster || [];
      setSelectedCBGs(cluster);
      setTotalPopulation(data.size || 0);
      setMapCenter(data.center || null);
      setCityName(cityName);
      
      // GeoJSON is returned directly from cluster-cbgs
      if (data.geojson) {
        setCbgGeoJSON(data.geojson);
      }
      
      setPhase('edit');
    };

    if (loading) {
      return;
    }

    setLoading(true);
    func_body(formdata)
      .catch((err) => {
        console.error(err);
        alert('Failed to cluster CBGs. Please try again.');
      })
      .finally(() => setLoading(false));
  }

  return (
    <div className='flex flex-col items-center justify-start gap-20 min-h-[calc(100vh-160px)]'>
      <header className='mt-28 text-3xl mx-8 text-wrap text-center'>
        Convenience Zone Creation
      </header>

        <form action={generateCZ} className='flex flex-col gap-8 mb-28 items-center'>
          <div className='flex justify-center items-start gap-10 flex-wrap mx-4'>
            <div className='flex flex-col gap-4 items-stretch'>
              <FormField 
                label='City, Address, or Location'
                name='location'
                type='text'
                placeholder='e.g. 55902'
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                disabled={loading || hasGenerated}
              />

              <FormField 
                label='Minimum Population'
                name='min_pop'
                type='number'
                value={minPop}
                min={100}
                max={100_000}
                onChange={(e) => setMinPop(e.target.value)}
                disabled={loading || hasGenerated}
              />

              <FormField 
                label='Start Date'
                name='start_date'
                type='date'
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                disabled={loading || hasGenerated}
              />

              <FormField 
                label='End Date'
                name='end_date'
                type='date'
                value={endDate}
                min={startDate}
                onChange={(e) => setEndDate(e.target.value)}
                disabled={loading || hasGenerated}
              />

              <FormField
                label='Description'
                name='description'
                type='textarea'
                placeholder='a short description for this convenience zone...'
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={loading || hasGenerated}
              />
              
              {/* Show stats after generation */}
              {hasGenerated && (
                <div className='mt-4 p-3 bg-[#fffff2] outline outline-2 outline-[#70B4D4] rounded-lg'>
                  <div className='text-sm font-semibold mb-2'>Zone Statistics</div>
                  <div className='text-sm'>CBGs: {selectedCBGs.length}</div>
                  <div className='text-sm'>Population: {totalPopulation.toLocaleString()}</div>
                </div>
              )}
            </div>

          {hasGenerated ? (
            <div className='flex flex-col gap-2'>
              <div className='h-80 w-140 max-w-[85vw] relative'>
                {cbgGeoJSON ? (
                  <CBGMap
                    cbgData={cbgGeoJSON}
                    center={null}
                    onCBGClick={handleCBGClick}
                    selectedCBGs={selectedCBGs}
                  />
                ) : (
                  <div className='h-full w-full flex items-center justify-center bg-gray-100 text-gray-500'>
                    <div className='text-center'>
                      <p>CBG map not available</p>
                      <p className='text-sm'>GeoJSON endpoint needed on Algorithms server</p>
                    </div>
                  </div>
                )}
                <div className='absolute bottom-2 left-2 bg-white/90 px-2 py-1 rounded text-xs'>
                  Click CBGs to add/remove from zone
                </div>
              </div>
            </div>
          ) : (
            <div className='h-72 w-140 max-w-[85vw]'>
              <InteractiveMap
                onLocationSelect={setLocation}
                disabled={loading}
              />
            </div>
          )}
        </div>
        <input
          type={phase === 'input' ? 'submit' : 'button'}
          value={
            loading ? 'Clustering...' : 
            isFinalizing ? 'Generating Patterns...' : 
            phase === 'input' ? 'Preview CBGs' : 
            'Finalize & Generate'
          }
          onClick={() => phase === 'edit' && finalizeCZ()}
          disabled={loading || isFinalizing}
          className='bg-[#222629] text-[#F0F0F0] w-48 h-12 p-3 rounded-3xl transition-[200ms] ease-in-out hover:scale-105 cursor-pointer active:brightness-75 disabled:bg-gray-500 outline-none focus:outline-none'
        />
      </form>
    </div>
  );
}
