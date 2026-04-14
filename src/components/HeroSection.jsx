/**
 * Reusable static-image hero section.
 * Only for pages with a background image (not video-scrub) — About, Blog, Contact, Analogs.
 * Video-scrub heroes in Home, SA2TP, and Outreach use custom JSX with GSAP refs.
 */
const HeroSection = ({ bgImage, title, subtitle, className = '' }) => (
  <div
    className={`jumbotron jumbotron-single d-flex align-items-center ${className}`}
    style={{ backgroundImage: `url(${bgImage})` }}
  >
    <div className="container text-center">
      <h1 className="display-2 mb-4">{title}</h1>
      {subtitle && (
        <p className="header-sub-title" style={{ fontWeight: 'bold', fontSize: '120%' }}>
          {subtitle}
        </p>
      )}
    </div>
  </div>
);

export default HeroSection;
