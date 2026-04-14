/**
 * Reusable section heading with optional label pill, title, bold suffix, and subtitle.
 * Reuses existing CSS classes from search-theme.css:
 *   .about-section-label, .section-title, .section-sub-title
 * New modifier .title-wrap--light is added in the 2026 improvements CSS block.
 */
const SectionHeading = ({
  label,
  title,
  bold,
  subtitle,
  center = false,
  light = false,
}) => (
  <div
    className={[
      'title-wrap mb-5',
      center ? 'text-center' : '',
      light  ? 'title-wrap--light' : '',
    ].filter(Boolean).join(' ')}
  >
    {label && <span className="about-section-label">{label}</span>}
    <h2 className="section-title">
      {title}{bold && <> <b>{bold}</b></>}
    </h2>
    {subtitle && <p className="section-sub-title">{subtitle}</p>}
  </div>
);

export default SectionHeading;
