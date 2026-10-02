import { forwardRef } from 'react';

// Anchor that opens in a new tab.
const ExternalLink = forwardRef(function ExternalLink({ children, rel, ...rest }, ref) {
  return (
    <a
      {...rest}
      ref={ref}
      target="_blank"
      rel={rel ? `noopener noreferrer ${rel}` : 'noopener noreferrer'}
    >
      {children}
    </a>
  );
});

export default ExternalLink;
