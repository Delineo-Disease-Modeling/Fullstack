'use client';

import L from 'leaflet';
import { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

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

type LayerType = {
  setStyle: (s: object) => void;
  setTooltipContent: (s: string) => void;
  feature?: { properties?: { population?: number } };
  bindTooltip: (content: string, options?: object) => void;
  on: (events: object) => void;
};

function GeoJSONLayer({
  cbgData,
  onCBGClick,
  selectedCBGs,
  selectedRef,
  geoJsonLayerRef,
  layersRef,
  hasFittedRef
}: {
  cbgData: GeoJSONData;
  onCBGClick: (cbgId: string, properties: Record<string, unknown>) => void;
  selectedCBGs: string[];
  selectedRef: React.RefObject<string[]>;
  geoJsonLayerRef: React.MutableRefObject<unknown>;
  layersRef: React.MutableRefObject<Map<string, LayerType>>;
  hasFittedRef: React.MutableRefObject<boolean>;
}) {
  const map = useMap();

  const getStyleForCbg = (cbgId: string) => {
    const isSelected = selectedRef.current?.includes(cbgId);
    return {
      fillColor: isSelected ? '#70B4D4' : '#BDBDBD',
      weight: isSelected ? 2 : 1.25,
      opacity: 1,
      color: isSelected ? '#1f2937' : '#6b7280',
      fillOpacity: isSelected ? 0.6 : 0.2
    };
  };

  useEffect(() => {
    if (geoJsonLayerRef.current) {
      map.removeLayer(
        geoJsonLayerRef.current as Parameters<typeof map.removeLayer>[0]
      );
      layersRef.current.clear();
    }

    const geoJsonLayer = L.geoJSON(cbgData as Parameters<typeof L.geoJSON>[0], {
      style: (feature) => {
        const cbgId =
          (feature?.properties as { GEOID?: string; CensusBlockGroup?: string })
            ?.GEOID ||
          (feature?.properties as { GEOID?: string; CensusBlockGroup?: string })
            ?.CensusBlockGroup ||
          '';
        return getStyleForCbg(cbgId);
      },
      onEachFeature: (feature, layer) => {
        const cbgId =
          (feature?.properties as { GEOID?: string; CensusBlockGroup?: string })
            ?.GEOID ||
          (feature?.properties as { GEOID?: string; CensusBlockGroup?: string })
            ?.CensusBlockGroup ||
          '';
        const pop =
          (feature?.properties as { population?: number })?.population ?? 'N/A';
        const isSelected = selectedRef.current?.includes(cbgId);
        const typedLayer = layer as unknown as LayerType;

        layersRef.current.set(cbgId, typedLayer);

        typedLayer.bindTooltip(
          `<strong>CBG:</strong> ${cbgId}<br/><strong>Population:</strong> ${pop}<br/><strong>Status:</strong> ${isSelected ? 'In Zone' : 'Click to Add'}`,
          { sticky: true }
        );

        typedLayer.on({
          click: (e: { originalEvent: Event }) => {
            L.DomEvent.stopPropagation(e as unknown as Event);
            if (onCBGClick)
              onCBGClick(cbgId, feature.properties as Record<string, unknown>);
          },
          mouseover: (e: { target: { setStyle: (s: object) => void } }) => {
            e.target.setStyle({ weight: 3, fillOpacity: 0.9 });
          },
          mouseout: (e: { target: { setStyle: (s: object) => void } }) => {
            e.target.setStyle(getStyleForCbg(cbgId));
          }
        });
      }
    });

    geoJsonLayer.addTo(map);
    geoJsonLayerRef.current = geoJsonLayer;

    if (!hasFittedRef.current) {
      const bounds = geoJsonLayer.getBounds();
      if (bounds.isValid()) {
        map.invalidateSize();
        map.fitBounds(bounds, { padding: [20, 20], maxZoom: 12 });
        hasFittedRef.current = true;
      }
    }

    return () => {
      if (geoJsonLayerRef.current)
        map.removeLayer(
          geoJsonLayerRef.current as Parameters<typeof map.removeLayer>[0]
        );
    };
  }, [
    map,
    cbgData,
    geoJsonLayerRef,
    getStyleForCbg,
    hasFittedRef,
    layersRef.current.clear,
    layersRef.current.set,
    onCBGClick,
    selectedRef.current?.includes
  ]);

  useEffect(() => {
    layersRef.current.forEach((layer, cbgId) => {
      layer.setStyle(getStyleForCbg(cbgId));
      const pop = layer.feature?.properties?.population ?? 'N/A';
      const isSelected = selectedCBGs?.includes(cbgId);
      layer.setTooltipContent(
        `<strong>CBG:</strong> ${cbgId}<br/><strong>Population:</strong> ${pop}<br/><strong>Status:</strong> ${isSelected ? 'In Zone' : 'Click to Add'}`
      );
    });
  }, [selectedCBGs, getStyleForCbg, layersRef.current.forEach]);

  return null;
}

function BackgroundClickLayer({
  onMapBackgroundClick
}: {
  onMapBackgroundClick: (latlng: LatLng) => void;
}) {
  useMapEvents({
    click(e: { latlng: LatLng }) {
      if (onMapBackgroundClick) onMapBackgroundClick(e.latlng);
    }
  });
  return null;
}

export default function CBGMap({
  cbgData,
  onCBGClick,
  onMapBackgroundClick,
  selectedCBGs
}: {
  cbgData: GeoJSONData;
  onCBGClick: (cbgId: string, properties: Record<string, unknown>) => void;
  onMapBackgroundClick: (latlng: LatLng) => void;
  selectedCBGs: string[];
}) {
  const geoJsonLayerRef = useRef<unknown>(null);
  const layersRef = useRef<Map<string, LayerType>>(new Map());
  const selectedRef = useRef(selectedCBGs);
  const hasFittedRef = useRef(false);

  useEffect(() => {
    selectedRef.current = selectedCBGs;
  }, [selectedCBGs]);

  return (
    <MapContainer
      center={[39.3290708, -76.6219753]}
      zoom={12}
      style={{ height: '100%', width: '100%' }}
    >
      <TileLayer
        attribution="&copy; OpenStreetMap contributors"
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <BackgroundClickLayer onMapBackgroundClick={onMapBackgroundClick} />
      <GeoJSONLayer
        cbgData={cbgData}
        onCBGClick={onCBGClick}
        selectedCBGs={selectedCBGs}
        selectedRef={selectedRef}
        geoJsonLayerRef={geoJsonLayerRef}
        layersRef={layersRef}
        hasFittedRef={hasFittedRef}
      />
    </MapContainer>
  );
}
