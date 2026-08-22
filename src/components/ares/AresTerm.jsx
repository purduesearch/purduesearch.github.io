import { useId } from 'react';
import { GLOSSARY_TERMS } from './aresPhysics';

/**
 * Inline glossary tooltip. Reuses the site's existing .abbr-tip / data-tip
 * idiom (see search-theme.css and the ASTRO-USA bioreactor prose) so ARES
 * matches the rest of the public site rather than inventing a second pattern.
 *
 * Definitions come from one map in aresPhysics.js, which is what a binding
 * glossary is for — one definition per term, not one per page that mentions it.
 *
 * tabIndex is not optional: a hover-only tooltip is invisible to keyboard and
 * touch users, and these terms are load-bearing for the prose around them.
 *
 * data-tip drives the visual ::after tooltip only — generated content is not
 * reliably announced by screen readers. So the definition is also rendered a
 * second time, visually hidden, and wired to the span with aria-describedby.
 * useId (not a hand-rolled counter or Math.random) keeps the id stable across
 * server/client and re-renders.
 */
export default function AresTerm({ term, children }) {
  const definition = GLOSSARY_TERMS[term];
  const rawId = useId();
  if (!definition) return <>{children}</>;

  const descriptionId = `ares-term-desc-${rawId}`;

  return (
    <span
      className="abbr-tip ares-term"
      data-tip={definition}
      tabIndex={0}
      aria-describedby={descriptionId}
    >
      {children}
      <span id={descriptionId} className="ares-visually-hidden">
        {definition}
      </span>
    </span>
  );
}
