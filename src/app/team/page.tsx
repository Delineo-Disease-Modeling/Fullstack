'use client';

import Image from 'next/image';
import { useState } from 'react';
import 'animate.css';
import '@/styles/team.css';

interface TeamMember {
  name: string;
  department?: string;
  gradYear?: string;
  github?: string;
  linkedin?: string;
}

const teamData: {
  professors: TeamMember[];
  fullstackTeam: TeamMember[];
  algorithmsTeam: TeamMember[];
  simulationsTeam: TeamMember[];
  pastAlumn: TeamMember[];
} = {
  professors: [
    { name: 'Dr. Anton Dahbura', department: 'Computer Science' },
    {
      name: 'Dr. Kimia Ghobadi',
      department: 'Civil and Systems Engineering'
    },
    { name: 'Dr. Eili Klein', department: 'Emergency Medicine' }
  ],

  fullstackTeam: [
    {
      name: 'Mahmoud Said',
      github: 'https://github.com/stickms',
      department: 'Computer Science, Neuroscience',
      gradYear: '2026'
    },
    {
      name: 'Caroline Jia',
      linkedin: 'https://www.linkedin.com/in/carolinejjia/',
      department: 'Computer Science, Cognitive Science',
      gradYear: '2028'
    }
  ],

  algorithmsTeam: [
    {
      name: 'Ryan Taleb',
      department: 'Applied Mathematics and Statistics',
      linkedin: 'https://www.linkedin.com/in/ryad-taleb-654850251'
    }
  ],

  simulationsTeam: [
    { name: 'Iason Mihalopoulos' },
    {
      name: 'Navya Mehrotra',
      linkedin: 'https://www.linkedin.com/in/navyamehrotra/',
      department: 'Computer Science, Applied Mathematics and Statistics',
      gradYear: '2028'
    },
    {
      name: 'Liam Perez',
      linkedin: 'https://www.linkedin.com/in/liam-p-5a4033323/',
      gradYear: '2027',
      department: 'Computer Science'
    }
  ],

  pastAlumn: [
    { name: 'Jeffrey Yao' },
    { name: 'Matthew Yu' },
    { name: 'Zoe Xie' },
    { name: 'Lixing Wu', linkedin: 'https://www.linkedin.com/in/1ixin9-wu/' },
    {
      name: 'Allen Gong',
      linkedin: 'https://www.linkedin.com/in/allen-gong27/'
    },
    { name: 'Jin Hong Moon' },
    { name: 'Keeyan Mukherjee' },
    { name: 'Ryan Lu' },
    { name: 'Scott Klosen' },
    { name: 'Siva Indukuri' },
    { name: 'Jingxu Cui' },
    { name: 'Alisa Yang' },
    { name: 'Michelle Wang' },
    { name: 'Neil Patel' }
  ]
};

function MemberImage({ name }: { name: string }) {
  const [src, setSrc] = useState(
    `/images/team/${name.toLowerCase().replace(/\s/g, '')}.jpg`
  );

  return (
    <Image
      key={src}
      className="member bg-(--color-accent-teal)"
      onError={() => setSrc('/images/delineo.svg')}
      src={src}
      alt={name}
      width={130}
      height={130}
    />
  );
}

function TeamSection({
  team,
  teamName
}: {
  team: TeamMember[];
  teamName: string;
}) {
  return (
    <div className="team-section" data-aos="fade-up" data-aos-once="true">
      <h1 className="teamheader">{teamName}</h1>
      <div className="team">
        {team.map((member) => (
          <div className="member" key={member.name}>
            <MemberImage name={member.name} />
            <h1 className="name">{member.name}</h1>

            {member.department && <h2 className="role">{member.department}</h2>}
            {member.gradYear && (
              <h2 className="gradYear">Class of {member.gradYear}</h2>
            )}

            <div className="w-full flex items-center justify-center min-h-6">
              {member.github && (
                <a href={member.github}>
                  <i className="px-2 bi-github"></i>
                </a>
              )}
              {member.linkedin && (
                <a href={member.linkedin}>
                  <i className="px-2 bi-linkedin"></i>
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Team() {
  return (
    <div>
      <div
        className="w-full text-center m-auto py-32"
        data-aos="fade-up"
        data-aos-once="true"
      >
        <header className="teamheader">Core Team</header>
        <p className="teamheader">The Delineo Project</p>
      </div>

      <TeamSection team={teamData.professors} teamName="Professors" />
      <TeamSection team={teamData.fullstackTeam} teamName="Full-Stack Team" />
      <TeamSection team={teamData.algorithmsTeam} teamName="Algorithms Team" />
      <TeamSection
        team={teamData.simulationsTeam}
        teamName="Simulations Team"
      />
      <TeamSection team={teamData.pastAlumn} teamName="Past Team Members" />

      <div
        className="w-full text-center m-auto py-32"
        data-aos="fade-up"
        data-aos-once="true"
      >
        <header className="font-medium text-4xl">Join Delineo</header>
        <p>
          Contact Dr. Dahbura at{' '}
          <a
            className="email"
            href="mailto:atd@hublabels.com?Subject=Delineo%20Project%20Interest"
          >
            atd@hublabels.com
          </a>
        </p>
      </div>
    </div>
  );
}
