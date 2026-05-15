'use client';

import Image from 'next/image';
import Link from 'next/link';
import { BarChart2, Network, SquarePen } from 'lucide-react';
import DiseaseGraph from '@/components/disease-graph';
import Button from '@/components/ui/button';
import '@/styles/home.css';

export default function Home() {
  return (
    <div>
      <div className="main" data-aos="fade-up">
        <DiseaseGraph />
        <div className="left relative">
          <h1 className="title">
            Model how disease moves through a{' '}
            <span className="accent">community</span>.
          </h1>
          <h2 className="title">
            Delineo simulates community-level infectious disease spread using
            real mobility data, customizable populations, and pre-computed
            convenience zones.
          </h2>
          <div className="hero-ctas">
            <Link href="/simulator">
              <Button
                variant="primary"
                className="px-5! py-2.5! text-sm font-medium"
              >
                Launch simulator
              </Button>
            </Link>
            <Link href="/cz-generation">
              <Button
                variant="secondary"
                className="px-5! py-2.5! text-sm font-medium"
              >
                Generate zones
              </Button>
            </Link>
            <Link href="/about">
              <Button
                variant="secondary"
                className="px-5! py-2.5! text-sm font-medium"
              >
                How it works
              </Button>
            </Link>
          </div>
        </div>
        <Image
          className="logo"
          src="/images/logo.png"
          alt="logo"
          width={400}
          height={400}
        />
      </div>
      <div className="featurelist">
        <div className="feature" data-aos="fade-up">
          <SquarePen className="feature" />
          <h1 className="feature">Customize</h1>
          <p className="feature">
            Set custom population and disease parameters for a given geographic
            area. Keep it simple, or dive deep into custom disease matrices.
          </p>
        </div>
        <div className="feature" data-aos="fade-up" data-aos-delay="80">
          <Network className="feature" />
          <h1 className="feature">Simulate</h1>
          <p className="feature">
            The simulator optimizes itself by only calculating what changes.
            Computationally-heavy tasks are pre-computed ahead of time.
          </p>
        </div>
        <div className="feature" data-aos="fade-up" data-aos-delay="160">
          <BarChart2 className="feature" />
          <h1 className="feature">Visualize</h1>
          <p className="feature">
            Explore the spread of disease through an interactive infection map
            and a library of statistical charts.
          </p>
        </div>
      </div>
    </div>
  );
}
