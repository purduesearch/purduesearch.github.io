import { forwardRef } from 'react';

const HINT = 'opens in a new tab';

// Anchor that opens in a new tab and says so to assistive tech.
// With aria-label the hint is appended to it; otherwise a visually hidden span is added.
const ExternalLink = forwardRef(function ExternalLink({ children, rel, 'aria-label': ariaLabel, ...rest }, ref) {
  return (
    <a
      {...rest}
      ref={ref}
      target="_blank"
      rel={rel ? `noopener noreferrer ${rel}` : 'noopener noreferrer'}
      aria-label={ariaLabel ? `${ariaLabel} (${HINT})` : undefined}
    >
      {children}
      {!ariaLabel && <span className="sr-only"> ({HINT})</span>}
    </a>
  );
});

export default ExternalLink;
