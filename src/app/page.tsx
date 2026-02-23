'use client';

import Image from 'next/image';
import Link from 'next/link';
import DiseaseGraph from '@/components/disease-graph';
import Button from '@/components/ui/button';
import '@/styles/home.css';

export default function Home() {
  return (
    <div>
      <div className="main" data-aos="fade-up">
        <DiseaseGraph />
        <div className="left relative">
          <div className="bubble" />
          <h1 className="title">Delineo</h1>
          <h2 className="title">Community-level infectious disease modeling</h2>
          <Link href="/simulator">
            <Button variant="destructive" className="w-25 p-2! border-0!">Start</Button>
          </Link>
        </div>
        <Image className="logo" src="/images/logo.png" alt="logo" width={400} height={400} />
      </div>
      <div className="featurelist">
        <div className="feature" data-aos="fade-left">
          <i className="bi-pencil-square feature"></i>
          <h1 className="feature">Customize</h1>
          <p className="feature">
            Set custom population and disease parameters for a given geographic
            area. Keep it simple, or dive deep into custom disease matrices
          </p>
        </div>
        <div className="feature" data-aos="fade-up">
          <i className="bi-diagram-3 feature"></i>
          <h1 className="feature">Simulate</h1>
          <p className="feature">
            The simulator optimizes itself by only calculating what changes.
            Computationally-heavy tasks are pre-computed ahead of time
          </p>
        </div>
        <div className="feature" data-aos="fade-right">
          <i className="bi-bar-chart-line feature"></i>
          <h1 className="feature">Visualize</h1>
          <p className="feature">
            Visualize the spread of disease through an interactive infection
            map, or through one of the many statistical charts on our website
          </p>
        </div>
      </div>
    </div>
  );
}
