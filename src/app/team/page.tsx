'use client';

import Image from 'next/image';
import { useState } from 'react';
import { SiGithub } from '@icons-pack/react-simple-icons';

function LinkedinIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  );
}
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
  currentTeam: TeamMember[];
  pastAlumni: TeamMember[];
} = {
  professors: [
    { name: 'Dr. Anton Dahbura', department: 'Computer Science' },
    {
      name: 'Dr. Kimia Ghobadi',
      department: 'Civil and Systems Engineering'
    },
    { name: 'Dr. Eili Klein', department: 'Emergency Medicine' }
  ],

  currentTeam: [
    {
      name: 'Mahmoud Said',
      github: 'https://github.com/stickms',
      department: 'Computer Science, Neuroscience',
      gradYear: '2026'
    },
    {
      name: 'Ryad Taleb',
      department: 'Applied Mathematics and Statistics',
      linkedin: 'https://www.linkedin.com/in/ryad-taleb-654850251'
    },
    {
      name: 'Liam Perez',
      linkedin: 'https://www.linkedin.com/in/liam-p-5a4033323/',
      gradYear: '2027',
      department: 'Computer Science'
    },
    {
      name: 'Crystal Yang',
      department: 'Computer Science'
    },
    {
      name: 'Naavya Jain',
      department: 'Computer Science'
    },
    {
      name: 'Vrinda Sehgal',
      department: 'Computer Science'
    },
    {
      name: 'Zeyu Shen',
      department: 'Computer Science'
    }
  ],

  pastAlumni: [
    { name: 'Iason Mihalopoulos' },
    {
      name: 'Navya Mehrotra',
      linkedin: 'https://www.linkedin.com/in/navyamehrotra/',
      department: 'Computer Science, Applied Mathematics and Statistics',
      gradYear: '2028'
    },
    {
      name: 'Caroline Jia',
      linkedin: 'https://www.linkedin.com/in/carolinejjia/',
      department: 'Computer Science, Cognitive Science',
      gradYear: '2028'
    },
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
                    <SiGithub size={14} />
                  </a>
                )}
                {member.linkedin && (
                  <a
                    href={member.linkedin}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`${member.name}'s LinkedIn`}
                  >
                    <LinkedinIcon size={14} />
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
        <h1 className="team-title">The Delineo Team</h1>
        <p className="team-lede">
          A multidisciplinary group of faculty and students from Johns Hopkins
          working on community-level disease modeling.
        </p>
      </div>

      <TeamSection team={teamData.professors} teamName="Faculty" />
      <TeamSection team={teamData.currentTeam} teamName="Students" />
      <TeamSection
        team={teamData.pastAlumni}
        teamName="Delineo alumni"
        compact
      />

      <div className="join-cta" data-aos="fade-up" data-aos-once="true">
        <h2 className="join-title">Join Delineo</h2>
        <p className="join-body">
          Interested in contributing? We&apos;re always looking for students,
          researchers, and collaborators across disciplines.
        </p>
        <a
          className="join-link"
          href="mailto:atd@hublabels.com?Subject=Delineo%20Project%20Interest"
        >
          atd@hublabels.com
        </a>
      </div>
    </div>
  );
}
