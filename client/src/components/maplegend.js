import { useState } from 'react'
import './maplegend.css'

export default function MapLegend({ icon_lookup }) {
  const [ hovered, setHovered ] = useState(null);

  function handleMouseEnter(event) {
    setHovered(true);
    const legend = document.getElementById('modelmap_legend_div');
    legend.classList.remove('modelmap_legend_div_unhover');
    legend.classList.add('modelmap_legend_div_hover');
  }

  function handleMouseLeave(event) {
    setHovered(false);
    const legend = document.getElementById('modelmap_legend_div');
    legend.classList.remove('modelmap_legend_div_hover');
    legend.classList.add('modelmap_legend_div_unhover');
  }

  return (
    <div id='modelmap_legend_div' className='modelmap_legend_div modelmap_legend_div_unhover' onMouseOver={handleMouseEnter} onMouseOut={handleMouseLeave}>
      {!hovered && (
        <div style={{display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', width: '100%'}}>
          <div>Legend</div>
        </div>
        )
      }
      {hovered && Object.entries(icon_lookup).map(([label, icon]) => {
        return <div key={label} style={{marginBottom:'10px'}}>
          <div style={{width:'100%'}}>{icon} {label}</div>
        </div>
      })}
    </div>
  )
}