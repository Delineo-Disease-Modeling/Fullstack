import SectionTitle from "../Common/SectionTitle";
import SingleFeature from "./SingleFeature";
import featuresData from "./featuresData";

const Features = () => {
  return (
    <>
      <section
        id="features"
        className="bg-primary/[.03] py-15 md:py-20 lg:py-28"
      >
        <div className="container">
          <SectionTitle
            title="Meet The Team"
            paragraph="The Delineo Disease Modeling Project is working to bring a fresh approach to the 
            challenge of modeling the spread of pandemics. The project draws from a diverse set of academic fields, 
            using knowledge and principles from computer science, applied mathematics, and public 
            health to create a much more realistic model of disease spread."
            center
          />

          <div className="grid grid-cols-1 gap-x-8 gap-y-14 md:grid-cols-2 lg:grid-cols-3">
            {featuresData.map((feature) => (
              <SingleFeature key={feature.id} feature={feature} />
            ))}
          </div>
        </div>
      </section>
    </>
  );
};

export default Features;
