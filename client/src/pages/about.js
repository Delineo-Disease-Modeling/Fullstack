import React from 'react';

import './about.css';

export default function About() {
  return (
    <div>
      <header className='title'>
        About Delineo
      </header>

      <div className='timeline'>
        <div className='entry' data-aos='fade-up'>
          <img className='aboutimg' src='images/logo.png' alt='logo'></img>
          <div className='aboutinfo'>
            <header>The Project</header>
            <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.</p>
          </div>
        </div>

        <div className='entry reverse' data-aos='fade-up' data-aos-once='true'>
          <div className='aboutinfo'>
            <header>The Project</header>
            <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.</p>
          </div>
          <img className='aboutimg' src='images/logo.png' alt='logo'></img>
        </div>

        <div className='entry' data-aos='fade-up' data-aos-once='true'>
          <img className='aboutimg' src='images/logo.png' alt='logo'></img>
          <div className='aboutinfo'>
            <header>The Project</header>
            <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.</p>
          </div>
        </div>
      </div>
    </div>
  )
}