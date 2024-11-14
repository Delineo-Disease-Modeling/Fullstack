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
          {/* <h2 className='role'>{member.role}</h2> */}
          <div className='w-full flex items-center justify-center'>
            <a href={member.github}><i className='px-2 bi-github'></i></a>
            <a href={member.linkedin}><i className='px-2 bi-linkedin'></i></a>
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div>
      <div className='w-full text-center m-auto py-32' data-aos='fade-up' data-aos-once='true'>
        <header className='teamheader'>Core Team</header>
        <p className='teamheader'>The Delineo Project</p>
      </div>
      
      {renderTeamSection(teamData.professors, "Professors")}
      {renderTeamSection(teamData.fullstackTeam, "Full-Stack Team")}
      {renderTeamSection(teamData.algorithmsTeam, "Algorithms Team")}
      {renderTeamSection(teamData.simulationsTeam, "Simulations Team")}
      {renderTeamSection(teamData.pastAlumn, "Past Alumni")}


      <div className='w-full text-center m-auto py-32' data-aos='fade-up' data-aos-once='true'>
        <header className='font-medium text-4xl'>Join Delineo</header>
        <p>
          Contact Dr. Dahbura at <a className='email' href='mailto:atd@hublabels.com?Subject=Delineo%20Project%20Interest'>atd@hublabels.com</a>
        </p>
      </div>
    </div>
  );
}
