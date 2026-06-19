'use client';

import { useEffect, useRef } from 'react';
import { applyAlpha } from '@/features/model-map/map-constants';
import type { ModelMapInstance } from '@/features/model-map/map-types';

export default function EmojiOverlay({
  map,
  hotspots = {}
}: {
  map: ModelMapInstance;
  hotspots: Record<string, number[]>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!map) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const overlayCanvas = canvas;
    const overlayContext = ctx;

    function drawEmojis() {
      const { width, height } = map.getContainer().getBoundingClientRect();
      overlayCanvas.width = width;
      overlayCanvas.height = height;
      overlayContext.clearRect(0, 0, width, height);
      const features = map.queryRenderedFeatures(undefined, {
        source: 'points'
      });
      if (!features?.length) return;
      const zoom = map.getZoom();
      const time = Date.now() / 1000;
      features.forEach((f) => {
        const props = f.properties;
        if (!props || props.cluster || !props.icon) return;
        const [lng, lat] = f.geometry.coordinates;
        if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;
        const pixel = map.project([lng, lat]);
        const infectionRatio = Number.parseFloat(
          String(props.infection_ratio || 0)
        );
        const isDisabled =
          props.disabled === true || String(props.disabled) === 'true';
        const adjusted = Math.sqrt(infectionRatio);
        let baseColor = isDisabled ? '#111827' : '#4CAF50';
        if (!isDisabled && adjusted >= 0.5) baseColor = '#F44336';
        else if (!isDisabled && adjusted >= 0.35) baseColor = '#FF9800';
        else if (!isDisabled && adjusted >= 0.2) baseColor = '#FFEB3B';
        const size = 6 + zoom * 1.2;
        const isHotspot =
          !isDisabled &&
          props.type === 'places' &&
          hotspots &&
          Object.keys(hotspots).includes(String(props.id ?? ''));
        const pulse = isHotspot
          ? 0.5 +
            0.5 *
              Math.sin(time * 4 + (parseInt(String(props.id ?? ''), 36) % 10))
          : 0;
        const pulseSize = size * (1 + 0.3 * pulse);
        const pulseAlpha = isHotspot ? 0.4 + 0.4 * pulse : 1.0;
        overlayContext.beginPath();
        overlayContext.arc(pixel.x, pixel.y, pulseSize * 0.6, 0, Math.PI * 2);
        overlayContext.fillStyle = applyAlpha(baseColor, pulseAlpha);
        overlayContext.fill();
        overlayContext.strokeStyle = 'rgba(255,255,255,0.9)';
        overlayContext.lineWidth = 2;
        overlayContext.stroke();
        overlayContext.font = `${size}px 'Noto Color Emoji', sans-serif`;
        overlayContext.textAlign = 'center';
        overlayContext.textBaseline = 'middle';
        overlayContext.fillText(props.icon, pixel.x, pixel.y);
      });
    }

    map.on('render', drawEmojis);
    drawEmojis();
    return () => map.off('render', drawEmojis);
  }, [map, hotspots]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex: 5,
        pointerEvents: 'none'
      }}
    />
  );
}
