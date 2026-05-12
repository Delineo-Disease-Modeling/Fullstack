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
      className="member-img"
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
  teamName,
  compact = false
}: {
  team: TeamMember[];
  teamName: string;
  compact?: boolean;
}) {
  return (
    <section className="team-section" data-aos="fade-up" data-aos-once="true">
      <h2 className="team-section-title">{teamName}</h2>
      <div className={`team ${compact ? 'team-compact' : ''}`}>
        {team.map((member) => (
          <div className="member" key={member.name}>
            <MemberImage name={member.name} />
            <div className="member-info">
              <h3 className="member-name">{member.name}</h3>
              {member.department && (
                <p className="member-role">{member.department}</p>
              )}
              {member.gradYear && (
                <p className="member-grad">Class of {member.gradYear}</p>
              )}
            </div>
            {(member.github || member.linkedin) && (
              <div className="member-socials">
                {member.github && (
                  <a
                    href={member.github}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`${member.name}'s GitHub`}
                  >
                    <i className="bi-github"></i>
                  </a>
                )}
                {member.linkedin && (
                  <a
                    href={member.linkedin}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`${member.name}'s LinkedIn`}
                  >
                    <i className="bi-linkedin"></i>
                  </a>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

export default function Team() {
  return (
    <div className="team-page">
      <div className="team-header" data-aos="fade-up" data-aos-once="true">
        <span className="team-eyebrow">The Delineo Project</span>
        <h1 className="team-title">Core team</h1>
        <p className="team-lede">
          A multidisciplinary group of faculty and students from Johns Hopkins
          working on community-level disease modeling.
        </p>
      </div>

      <TeamSection team={teamData.professors} teamName="Faculty" />
      <TeamSection team={teamData.fullstackTeam} teamName="Fullstack" />
      <TeamSection team={teamData.algorithmsTeam} teamName="Algorithms" />
      <TeamSection team={teamData.simulationsTeam} teamName="Simulation" />
      <TeamSection
        team={teamData.pastAlumn}
        teamName="Past contributors"
        compact
      />

      <div className="join-cta" data-aos="fade-up" data-aos-once="true">
        <span className="team-eyebrow">Get involved</span>
        <h2 className="join-title">Join Delineo</h2>
        <p className="join-body">
          Interested in contributing? We&apos;re always looking for students,
          researchers, and collaborators across disciplines.
        </p>
        <a
          className="join-link"
          href="mailto:atd@hublabels.com?Subject=Delineo%20Project%20Interest"
        >
          atd@hublabels.com →
        </a>
      </div>
    </div>
  );
}
