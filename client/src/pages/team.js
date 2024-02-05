import React from 'react';

import 'animate.css';
import './team.css';

export default function Team() {
  return (
    <div>
      <div className='teamheader' data-aos='fade-up' data-aos-once='true'>
        <header className='teamheader'>
          Core Team
        </header>
        <p className='teamheader'>
          The Delineo Project
        </p>
      </div>
      <div className='team' data-aos='fade-up' data-aos-once='true'>
        <div className='member'>
          <img className='member' src='images/logo.png' alt='drake'></img>
          <h1 className='name'>User 1</h1> 
          <h2 className='role'>Role</h2>
          <div className='socials'>
            <a href='https://github.com/stickms'><i className='bi-github socials'></i></a>
            <a href='https://github.com/stickms'><i className='bi-linkedin socials'></i></a>
          </div>
        </div>
        <div className='member'>
          <img className='member' src='images/logo.png' alt='drake'></img>
          <h1 className='name'>User 2</h1> 
          <h2 className='role'>Role</h2>
          <div className='socials'>
            <a href='https://github.com/stickms'><i className='bi-github socials'></i></a>
            <a href='https://github.com/stickms'><i className='bi-linkedin socials'></i></a>
          </div>
        </div>
        <div className='member'>
          <img className='member' src='images/logo.png' alt='drake'></img>
          <h1 className='name'>User 3</h1> 
          <h2 className='role'>Role</h2>
          <div className='socials'>
            <a href='https://github.com/stickms'><i className='bi-github socials'></i></a>
            <a href='https://github.com/stickms'><i className='bi-linkedin socials'></i></a>
          </div>
        </div>
        <div className='member'>
          <img className='member' src='images/logo.png' alt='drake'></img>
          <h1 className='name'>User 4</h1> 
          <h2 className='role'>Role</h2>
          <div className='socials'>
            <a href='https://github.com/stickms'><i className='bi-github socials'></i></a>
            <a href='https://github.com/stickms'><i className='bi-linkedin socials'></i></a>
          </div>
        </div>
        <div className='member'>
          <img className='member' src='images/logo.png' alt='drake'></img>
          <h1 className='name'>User 5</h1> 
          <h2 className='role'>Role</h2>
          <div className='socials'>
            <a href='https://github.com/stickms'><i className='bi-github socials'></i></a>
            <a href='https://github.com/stickms'><i className='bi-linkedin socials'></i></a>
          </div>
        </div>
      </div>

      {/* Section for additional helpers */}
      <div className='teamheader' data-aos='fade-up' data-aos-once='true'>
        <header className='teamheader'>
          Delineo Alumni
        </header>
        <p className='teamheader'>
          Past Delineo team members 
        </p>
      </div>
      <div className='team' data-aos='fade-up' data-aos-once='true'>
        <div className='member'>
          <img className='member' src='images/logo.png' alt='drake'></img>
          <h1 className='name'>User 6</h1> 
          <h2 className='role'>Role</h2>
          <div className='socials'>
            <a href='https://github.com/stickms'><i className='bi-github socials'></i></a>
            <a href='https://github.com/stickms'><i className='bi-linkedin socials'></i></a>
          </div>
        </div>
      </div>

      {/* Join us */}

      <div className='teamheader' data-aos='fade-up' data-aos-once='true'>
        <header className='teamheader'>
          Join Delineo
        </header>
        <p className='teamheader'>
          Contact Dr. Dahbura at <a className='email' href='mailto:atd@hublabels.com.com?Subject=Delineo%20Project%20Interest'>atd@hublabels.com</a>
        </p>
      </div>
    </div>
  )
}