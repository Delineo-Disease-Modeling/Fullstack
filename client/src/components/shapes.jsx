import { useEffect, useState, useRef } from 'react';

import './shapes.css';

function Shape() {
  const y = Math.floor(Math.random() * 101);
  const s = 20;
  const t = Math.floor(Math.random() * 10) + 10;
  const d = Math.floor(Math.random() * (t + 1));

  const hue = Math.floor(Math.random() * 10);
  const saturation = Math.floor(Math.random() * 25) + 60;
  const lightness = Math.floor(Math.random() * 20) + 45;

  const color = `hsl(${hue}, ${saturation}%, ${lightness}%)`;

  const shapeStyle = {
    top: `${y}%`,
    borderLeft: `${s}px solid transparent`,
    borderRight: `${s}px solid transparent`,
    borderBottom: `${s * 1.8}px solid ${color}`,
    animation: `scroll ${t}s linear infinite, spin ${t * 0.2}s linear infinite`,
    animationDelay: `${-d}s`
  };

  return <span className="home_shape" style={shapeStyle}></span>;
}

export default function Shapes() {
  const [shapes, setShapes] = useState([]);
  const called = useRef(false); // StrictMode calls useEffect twice in dev mode

  useEffect(() => {
    if (called.current) return;
    for (let i = 0; i < 14; i++) {
      setShapes((x) => [...x, <Shape key={i} />]);
    }
    called.current = true;
  }, []);

  return <div className="home_shapes">{shapes}</div>;
}
