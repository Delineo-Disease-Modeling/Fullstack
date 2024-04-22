import React from 'react';

import 'animate.css';
import './team.css';

const teamData = {
  fullstackTeam: [
    { name: "Lixing Wu", role: "Role", github: "https://github.com/stickms", linkedin: "https://linkedin.com" },
    { name: "Mahmoud Said", role: "Role", github: "https://github.com/stickms", linkedin: "https://linkedin.com" },
    { name: "Allen Gong", role: "Role", github: "https://github.com/stickms", linkedin: "https://www.linkedin.com/in/allen-gong27/" },
    { name: "Name", role: "Role", github: "https://github.com/stickms", linkedin: "https://linkedin.com" },
    { name: "Name", role: "Role", github: "https://github.com/stickms", linkedin: "https://linkedin.com" },
    { name: "Name", role: "Role", github: "https://github.com/stickms", linkedin: "https://linkedin.com" },
  ],

  algorithmsTeam: [
    { name: "Name", role: "Role", github: "https://github.com/stickms", linkedin: "https://linkedin.com" },
    { name: "Name", role: "Role", github: "https://github.com/stickms", linkedin: "https://linkedin.com" },
    { name: "Name", role: "Role", github: "https://github.com/stickms", linkedin: "https://linkedin.com" },
  ],

  simulationsTeam: [
    { name: "Name", role: "Role", github: "https://github.com/stickms", linkedin: "https://linkedin.com" },
    { name: "Name", role: "Role", github: "https://github.com/stickms", linkedin: "https://linkedin.com" },
    { name: "Name", role: "Role", github: "https://github.com/stickms", linkedin: "https://linkedin.com" },
  ]
}
export default function Team() {
  const renderTeamSection = (team, teamName) => (
    <div className='team' data-aos='fade-up' data-aos-once='true'>
      <header className='teamheader'>{teamName}</header>
      {team.map(member => (
        <div className='member' key={member.name}>
          <img className='member' src='images/logo.png' alt='drake'></img>
          <h1 className='name'>{member.name}</h1>
          <h2 className='role'>{member.role}</h2>
          <div className='socials'>
            <a href={member.github}><i className='bi-github'></i></a>
            <a href={member.linkedin}><i className='bi-linkedin'></i></a>
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div>
      <div className='teamheader' data-aos='fade-up' data-aos-once='true'>
        <header className='teamheader'>Core Team</header>
        <p className='teamheader'>The Delineo Project</p>
      </div>
      {renderTeamSection(teamData.fullstackTeam, "Full-Stack Team")}
      {renderTeamSection(teamData.algorithmsTeam, "Algorithms Team")}
      {renderTeamSection(teamData.simulationsTeam, "Simulations Team")}

      <div className='teamheader' data-aos='fade-up' data-aos-once='true'>
        <header className='teamheader'>Join Delineo</header>
        <p className='teamheader'>
          Contact Dr. Dahbura at <a className='email' href='mailto:atd@hublabels.com?Subject=Delineo%20Project%20Interest'>atd@hublabels.com</a>
        </p>
      </div>
    </div>
  );
  
  // return (
  //   <div>
  //     <div className='teamheader' data-aos='fade-up' data-aos-once='true'>
  //       <header className='teamheader'>
  //         Core Team
  //       </header>
  //       <p className='teamheader'>
  //         The Delineo Project
  //       </p>
  //     </div>
  //     <div className='team' data-aos='fade-up' data-aos-once='true'>
  //       <div className='member'>
  //         <img className='member' src='images/logo.png' alt='drake'></img>
  //         <h1 className='name'>User 1</h1> 
  //         <h2 className='role'>Role</h2>
  //         <div className='socials'>
  //           <a href='https://github.com/stickms'><i className='bi-github socials'></i></a>
  //           <a href='https://github.com/stickms'><i className='bi-linkedin socials'></i></a>
  //         </div>
  //       </div>
  //       <div className='member'>
  //         <img className='member' src='images/logo.png' alt='drake'></img>
  //         <h1 className='name'>User 2</h1> 
  //         <h2 className='role'>Role</h2>
  //         <div className='socials'>
  //           <a href='https://github.com/stickms'><i className='bi-github socials'></i></a>
  //           <a href='https://github.com/stickms'><i className='bi-linkedin socials'></i></a>
  //         </div>
  //       </div>
  //       <div className='member'>
  //         <img className='member' src='images/logo.png' alt='drake'></img>
  //         <h1 className='name'>User 3</h1> 
  //         <h2 className='role'>Role</h2>
  //         <div className='socials'>
  //           <a href='https://github.com/stickms'><i className='bi-github socials'></i></a>
  //           <a href='https://github.com/stickms'><i className='bi-linkedin socials'></i></a>
  //         </div>
  //       </div>
  //       <div className='member'>
  //         <img className='member' src='images/logo.png' alt='drake'></img>
  //         <h1 className='name'>User 4</h1> 
  //         <h2 className='role'>Role</h2>
  //         <div className='socials'>
  //           <a href='https://github.com/stickms'><i className='bi-github socials'></i></a>
  //           <a href='https://github.com/stickms'><i className='bi-linkedin socials'></i></a>
  //         </div>
  //       </div>
  //       <div className='member'>
  //         <img className='member' src='images/logo.png' alt='drake'></img>
  //         <h1 className='name'>User 5</h1> 
  //         <h2 className='role'>Role</h2>
  //         <div className='socials'>
  //           <a href='https://github.com/stickms'><i className='bi-github socials'></i></a>
  //           <a href='https://github.com/stickms'><i className='bi-linkedin socials'></i></a>
  //         </div>
  //       </div>
  //     </div>

  //     {/* Section for additional helpers */}
  //     <div className='teamheader' data-aos='fade-up' data-aos-once='true'>
  //       <header className='teamheader'>
  //         Delineo Alumni
  //       </header>
  //       <p className='teamheader'>
  //         Past Delineo team members 
  //       </p>
  //     </div>
  //     <div className='team' data-aos='fade-up' data-aos-once='true'>
  //       <div className='member'>
  //         <img className='member' src='images/logo.png' alt='drake'></img>
  //         <h1 className='name'>User 6</h1> 
  //         <h2 className='role'>Role</h2>
  //         <div className='socials'>
  //           <a href='https://github.com/stickms'><i className='bi-github socials'></i></a>
  //           <a href='https://github.com/stickms'><i className='bi-linkedin socials'></i></a>
  //         </div>
  //       </div>
  //     </div>

  //     {/* Join us */}

  //     <div className='teamheader' data-aos='fade-up' data-aos-once='true'>
  //       <header className='teamheader'>
  //         Join Delineo
  //       </header>
  //       <p className='teamheader'>
  //         Contact Dr. Dahbura at <a className='email' href='mailto:atd@hublabels.com.com?Subject=Delineo%20Project%20Interest'>atd@hublabels.com</a>
  //       </p>
  //     </div>
  //   </div>
  // )
}