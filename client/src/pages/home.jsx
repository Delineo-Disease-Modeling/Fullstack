import { NavLink } from 'react-router-dom';

import Shapes from '../components/shapes.jsx';
import './home.css';


export default function Home() {
  return (
    <div>
      <div className='main' data-aos='fade-up'>
        <Shapes />
        <div className='left'>
          <h1 className='title'>Delineo Project</h1>
          <h2 className='title'>Small-town disease simulation</h2>
          <NavLink to='/simulator'>
            <button className='app'>Start</button>
          </NavLink>
        </div>
        <img className='logo p-4 rounded-3xl border-10 border-[#932D3B]' src='/logo2.png' alt='logo'></img>
      </div>
      <div className='featurelist'>
        <div className='feature' data-aos='fade-left'>
          <i className='bi-pencil-square feature'></i>
          <h1 className='feature'>Customize</h1>
          <p className='feature'>
            Set custom population and disease parameters for a given geographic area. Keep it simple, or dive deep into custom disease matrices
          </p>
        </div>
        <div className='feature' data-aos='fade-up'>
          <i className='bi-diagram-3 feature'></i>
          <h1 className='feature'>Simulate</h1>
          <p className='feature'>
            The simulator optimizes itself by only calculating what changes. Computationally-heavy tasks are pre-computed ahead of time
          </p>
        </div>
        <div className='feature' data-aos='fade-right'>
          <i className='bi-bar-chart-line feature'></i>
          <h1 className='feature'>Visualize</h1>
          <p className='feature'>
            Visualize the spread of disease through an interactive infection map, or through one of the many statistical charts on our website
          </p>
        </div>
      </div>
    </div>
  )
}