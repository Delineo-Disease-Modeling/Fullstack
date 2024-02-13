import React from 'react';
import { NavLink } from 'react-router-dom';

import Shapes from '../components/shapes.js';
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
        <img className='logo' src='images/logo.png' alt='logo'></img>
      </div>
      <div className='featurelist'>
        <div className='feature' data-aos='fade-left'>
          <i className='bi-pencil-square feature'></i>
          <h1 className='feature'>Lorem ipsum dolor</h1>
          <p className='feature'>
          Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et
          </p>
        </div>
        <div className='feature' data-aos='fade-up'>
          <i className='bi-sort-up-alt feature'></i>
          <h1 className='feature'>Lorem ipsum dolor</h1>
          <p className='feature'>
            Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et
          </p>
        </div>
        <div className='feature' data-aos='fade-right'>
          <i className='bi-check-circle feature'></i>
          <h1 className='feature'>Lorem ipsum dolor</h1>
          <p className='feature'>
            Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et
          </p>
        </div>
      </div>
    </div>
  )
}