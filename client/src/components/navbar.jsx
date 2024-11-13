import { NavLink } from 'react-router-dom';

import './navbar.css';

export default function Navbar() {
 return (
  <div>
    <div className='navbuffer'></div>
    <nav>
      <NavLink to='/' className='link'>
        <img className='bg-[#88D2D8]' src='./delineo.svg' alt='logo'></img>
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