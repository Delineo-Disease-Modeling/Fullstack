import React from 'react';

import 'animate.css';
import './team.css';

const teamData = {
  professors: [
    { name: "Professor Anton Dahbura",  github: "https://github.com/stickms", linkedin: "https://linkedin.com" },
  ],

  fullstackTeam: [
    { name: "Lixing Wu", github: "https://github.com/stickms", linkedin: "https://www.linkedin.com/in/1ixin9-wu/" },
    { name: "Mahmoud Said", github: "https://github.com/stickms", linkedin: "https://linkedin.com" },
    { name: "Allen Gong",  github: "https://github.com/stickms", linkedin: "https://www.linkedin.com/in/allen-gong27/" },
    { name: "Jeffrey Yao", github: "https://github.com/stickms", linkedin: "https://linkedin.com" },
    { name: "Matthew Yu", github: "https://github.com/stickms", linkedin: "https://linkedin.com" },
    { name: "Zoe Xie", github: "https://github.com/stickms", linkedin: "https://linkedin.com" },
  ],

  algorithmsTeam: [
    { name: "Jin Hong Moon",  github: "https://github.com/stickms", linkedin: "https://linkedin.com" },
    { name: "Keeyan Mukherjee", github: "https://github.com/stickms", linkedin: "https://linkedin.com" },
    { name: "Ryan Lu",  github: "https://github.com/stickms", linkedin: "https://linkedin.com" },
    { name: "Scott Klosen",  github: "https://github.com/stickms", linkedin: "https://linkedin.com" },
    { name: "Shayan Hossain",  github: "https://github.com/stickms", linkedin: "https://linkedin.com" },
    { name: "Siva Indukuri",  github: "https://github.com/stickms", linkedin: "https://linkedin.com" },
  ],

  simulationsTeam: [
    { name: "Alisa Yang",  github: "https://github.com/stickms", linkedin: "https://linkedin.com" },
    { name: "Jason Mihalopoulos",  github: "https://github.com/stickms", linkedin: "https://linkedin.com" },
    { name: "Michelle Wang",  github: "https://github.com/stickms", linkedin: "https://linkedin.com" },
    { name: "Neil Patel",  github: "https://github.com/stickms", linkedin: "https://linkedin.com" },
  ],

  pastAlumn: [
    { name: "User 6", role: "Role"},
    { name: "User 7", role: "Role"},
    { name: "User 8", role: "Role"},
    { name: "User 9", role: "Role"},
    { name: "User 10", role: "Role"},
  ]
}
export default function Team() {
  const renderTeamSection = (team, teamName) => (
    <div className='team' data-aos='fade-up' data-aos-once='true'>
      <header className='teamheader'>{teamName}</header>
      {team.map(member => (
        <div className='member' key={member.name}>
          <img className='member' src={`images/team/${member.name.toLowerCase().replace(/\s/g, '')}.jpg`} alt={member.name}></img>
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
      
      {renderTeamSection(teamData.professors, "Professors")}
      {renderTeamSection(teamData.fullstackTeam, "Full-Stack Team")}
      {renderTeamSection(teamData.algorithmsTeam, "Algorithms Team")}
      {renderTeamSection(teamData.simulationsTeam, "Simulations Team")}
      {renderTeamSection(teamData.pastAlumn, "Past Alumni")}

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