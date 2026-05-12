import type { Metadata } from 'next';
import Image from 'next/image';
import '@/styles/about.css';

export const metadata: Metadata = { title: 'About' };

const SECTIONS = [
  {
    eyebrow: '01 · Algorithms',
    image: '/images/about/algosAboutPagePic.png',
    title: 'Convenience Zone Generation & Pre-Computation',
    lede: 'Our team specializes in designing innovative algorithms that lay the foundation for accurate and detailed simulations.',
    points: [
      {
        title: 'Clustering Movement Data',
        body: 'Using U.S. Census data and SafeGraph mobility patterns, we group census block groups (CBGs) to reveal how populations interact and move within a city. Our algorithm produces dynamic map visualizations that showcase these connections over time, offering insights into the interconnectedness of neighborhoods.'
      },
      {
        title: 'Modeling Realistic Movement Patterns',
        body: 'We build synthetic populations that replicate real-world movement behaviors. By simulating interactions at homes, workplaces, and community spaces, we capture the complexity of daily life, integrating travel and daily routines to create a flexible framework.'
      }
    ]
  },
  {
    eyebrow: '02 · Simulator',
    image: '/images/about/simulatorAboutPagePic.png',
    title: 'Simulation & DMP',
    lede: 'Our simulation framework is at the heart of understanding disease dynamics in communities.',
    points: [
      {
        title: 'Disease Modeling Platform',
        body: 'When someone is marked as infected, our Disease Modeling Platform (DMP) tracks their progression through various health states, guided by scientifically derived transition matrices. This allows for a realistic representation of disease spread over time.'
      },
      {
        title: 'Composable simulation',
        body: 'By integrating clustering algorithms, population data, and movement patterns, the simulator models disease progression within pre-defined geographic regions. Each module is fully customizable, enabling users to adapt the system for unique research needs.'
      }
    ]
  },
  {
    eyebrow: '03 · Fullstack',
    image: '/images/about/fullstackAboutPagePic.png',
    title: 'Fullstack & Visualizations',
    lede: 'Our platform brings complex simulations to life with intuitive and impactful visualizations seen on this very website.',
    points: [
      {
        title: 'Interactive exploration',
        body: 'Users can explore the spread of disease through dynamic heatmaps, zoom into specific facilities or households, and analyze infection trends, demographic breakdowns, and state transitions. These tools offer an in-depth view of how infections impact different parts of a community.'
      },
      {
        title: 'Always improving',
        body: 'We’re constantly enhancing our visualizations to present data in more meaningful and actionable ways, helping users uncover patterns and insights at a glance.'
      }
    ]
  }
];

export default function About() {
  return (
    <div className="about_page">
      <div className="about_header" data-aos="fade-up" data-aos-once="true">
        <span className="about_eyebrow">About Delineo</span>
        <h1 className="about_title">
          A research platform for modeling how disease moves through real communities.
        </h1>
        <p className="about_lede">
          Delineo brings together algorithms, simulation, and visualization into
          a single open-source platform for community-level infectious disease
          research.
        </p>
      </div>

      <div className="timeline">
        {SECTIONS.map((section, idx) => (
          <section
            key={section.title}
            className={`entry ${idx % 2 === 1 ? 'reverse' : ''}`}
            data-aos="fade-up"
            data-aos-once="true"
          >
            <div className="entry_visual">
              <Image
                className="aboutimg"
                src={section.image}
                alt={section.title}
                width={800}
                height={600}
              />
            </div>
            <div className="aboutinfo">
              <span className="entry_eyebrow">{section.eyebrow}</span>
              <h2 className="entry_title">{section.title}</h2>
              <p className="entry_lede">{section.lede}</p>
              <ul className="entry_points">
                {section.points.map((point) => (
                  <li key={point.title} className="entry_point">
                    <strong>{point.title}</strong>
                    <span>{point.body}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
