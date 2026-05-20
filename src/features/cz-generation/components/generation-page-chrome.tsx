'use client';

export function GenerationLoadingState() {
  return (
    <div className="czgen_page">
      <p
        className="czgen_lede"
        style={{ textAlign: 'center', paddingTop: '60px' }}
      >
        Loading...
      </p>
    </div>
  );
}

export function GenerationIntroHeader() {
  return (
    <div className="czgen_header" data-aos="fade-up" data-aos-once="true">
      <h1 className="czgen_title">Generate a Convenience Zone</h1>
      <p className="czgen_lede">
        Define your simulation&apos;s geographic area by selecting a location
        and clustering nearby Census Block Groups.
      </p>
    </div>
  );
}
