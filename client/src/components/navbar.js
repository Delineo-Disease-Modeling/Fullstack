import React from 'react';
import { NavLink } from 'react-router-dom';

import './navbar.css';

export default function Navbar() {
 return (
  <div>
    <div className='navbuffer'></div>
    <nav>
      <NavLink to='/' className='link'>
        <img src='images/logo.png' alt='logo'></img>
      </NavLink>
      <ul>
        <li>
          <NavLink to='/simulator' className='link'>Simulator</NavLink>
        </li>
        <li>
          <NavLink to='/about' className='link'>About</NavLink>
        </li>
        <li>
          <NavLink to='/team' className='link'>Team</NavLink>
        </li>
      </ul>
    </nav>
  </div>
 );
}