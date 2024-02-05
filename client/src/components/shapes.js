import React from 'react';
import { useEffect, useState, useRef } from 'react';

import './shapes.css';

function Shape(key) {
  const y = Math.floor(Math.random() * 101);
  const r = Math.floor(Math.random() * 15) + 25;
  const t = Math.floor(Math.random() * 20) + 10;
  const d = Math.floor(Math.random() * (t + 1));

  const shapeStyle = {
    width: `${r * 8}px`,
    height: `${r}px`,
    top: `${y}%`,
    animation: `scroll ${t}s linear infinite`,
    animationDelay: `${-d}s`
  };

  return (
    <span className='shape' key={key} style={shapeStyle}></span>
  );
}

export default function Shapes() {
  const [ shapes, setShapes ] = useState([]);
  const called = useRef(false); // StrictMode calls useEffect twice in dev mode

  useEffect(() => {
    if (called.current) return;
    for (let i = 0; i < 14; i++) {
      setShapes(x => [...x, <Shape key={i}/>]);
    }
    called.current = true;
  }, []);

  return (
    <div className='shapes'>
      {shapes}
    </div>
  );
}