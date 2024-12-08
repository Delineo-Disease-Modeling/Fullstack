import 'animate.css';
import './team.css';

const teamData = {
  professors: [
    { name: "Professor Anton Dahbura" },
    { name: "Professor Kimia Ghobadi" },
    { name: "Professor Eili Klein" },
  ],

  fullstackTeam: [
    { name: "Lixing Wu", linkedin: "https://www.linkedin.com/in/1ixin9-wu/" },
    { name: "Mahmoud Said", github: "https://github.com/stickms" },
    { name: "Allen Gong", linkedin: "https://www.linkedin.com/in/allen-gong27/" },
    { name: "Jeffrey Yao" },
    { name: "Matthew Yu" },
    { name: "Zoe Xie" },
  ],

  algorithmsTeam: [
    { name: "Jin Hong Moon" },
    { name: "Keeyan Mukherjee" },
    { name: "Ryan Lu" },
    { name: "Scott Klosen" },
    { name: "Siva Indukuri"  },
    { name: "Jingxu Cui" }
  ],

  simulationsTeam: [
    { name: "Alisa Yang" },
    { name: "Iason Mihalopoulos" },
    { name: "Michelle Wang" },
    { name: "Neil Patel" },
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
          <img className='member bg-[#88D2D8]' 
            onError={(e) => e.target.src='./delineo.svg'} 
            src={`images/team/${member.name.toLowerCase().replace(/\s/g, '')}.jpg`} 
            alt={member.name} 
          />
          <h1 className='name'>{member.name}</h1>
          {/* <h2 className='role'>{member.role}</h2> */}
          <div className='w-full flex items-center justify-center min-h-6'>
            {member.github && <a href={member.github}><i className='px-2 bi-github'></i></a>}
            {member.linkedin && <a href={member.linkedin}><i className='px-2 bi-linkedin'></i></a>}
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
