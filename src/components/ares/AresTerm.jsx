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
 */
export default function AresTerm({ term, children }) {
  const definition = GLOSSARY_TERMS[term];
  if (!definition) return <>{children}</>;

  return (
    <span className="abbr-tip ares-term" data-tip={definition} tabIndex={0}>
      {children}
    </span>
  );
}
