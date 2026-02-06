import './about.css';

export default function About() {
  return (
    <div className="w-full flex justify-center items-center flex-wrap">
      <header className="about_title">About Delineo</header>

      <div className="timeline">
        <div className="entry" data-aos="fade-up" data-aos-once="true">
          <img className="aboutimg" src="./algosAboutPagePic.png" alt="logo" />
          <div className="aboutinfo">
            <h1 className="text-2xl font-medium pb-5 text-center">
              Convenience Zone Generation & Pre-Computation
            </h1>
            <p className="text-base">
              Our team specializes in designing innovative algorithms that lay
              the foundation for accurate and detailed simulations.
              <br />
              <br />
              <strong>Clustering Movement Data:</strong> Using U.S. Census data
              and SafeGraph mobility patterns, we group census block groups
              (CBGs) to reveal how populations interact and move within a city.
              Our algorithm produces dynamic map visualizations that showcase
              these connections over time, offering insights into the
              interconnectedness of neighborhoods.
              <br />
              <br />
              <strong>Modeling Realistic Movement Patterns:</strong> We build
              synthetic populations that replicate real-world movement
              behaviors. By simulating interactions at homes, workplaces, and
              community spaces, we capture the complexity of daily life,
              integrating travel and daily routines to create a flexible
              framework.
            </p>
          </div>
        </div>

        <div className="entry" data-aos="fade-up" data-aos-once="true">
          <img
            className="aboutimg"
            src="./simulatorAboutPagePic.png"
            alt="logo"
          />
          <div className="aboutinfo">
            <header className="text-2xl font-medium pb-5 text-center">
              Simulation & DMP
            </header>
            <p className="text-base">
              Our simulation framework is at the heart of understanding disease
              dynamics in communities.
              <br />
              <br />
              When someone is marked as infected, our Disease Modeling Platform
              (DMP) tracks their progression through various health states,
              guided by scientifically derived transition matrices. This allows
              for a realistic representation of disease spread over time.
              <br />
              <br />
              By integrating clustering algorithms, population data, and
              movement patterns, the simulator models disease progression within
              pre-defined geographic regions. Each module is fully customizable,
              enabling users to adapt the system for unique research needs.
            </p>
          </div>
        </div>

        <div className="entry" data-aos="fade-up" data-aos-once="true">
          <img
            className="aboutimg"
            src="./fullstackAboutPagePic.png"
            alt="logo"
          />
          <div className="aboutinfo">
            <header className="text-2xl font-medium pb-5 text-center">
              Fullstack & Visualizations
            </header>
            <p className="text-base">
              Our platform brings complex simulations to life with intuitive and
              impactful visualizations seen on this very website.
              <br />
              <br />
              Users can explore the spread of disease through dynamic heatmaps,
              zoom into specific facilities or households, and analyze infection
              trends, demographic breakdowns, and state transitions. These tools
              offer an in-depth view of how infections impact different parts of
              a community.
              <br />
              <br />
              We’re constantly enhancing our visualizations to present data in
              more meaningful and actionable ways, helping users uncover
              patterns and insights at a glance.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
