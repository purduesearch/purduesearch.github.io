import { useEffect, useState } from 'react';

/**
 * Shared `prefers-reduced-motion: reduce` hook for every /ares interactive.
 *
 * Previously written three times (DelayVsT90.jsx, NdirBeam.jsx,
 * SystemDiagram.jsx) with three different bodies. Only this one — originally
 * DelayVsT90's — guarded `typeof window.matchMedia === 'function'` and fell
 * back to the legacy `addListener`/`removeListener` pair; the other two
 * called `mq.addEventListener` unguarded, which throws on mount in older
 * Safari (no `addListener` fallback, and no feature check at all). This is
 * that version, factored out for every component to share.
 */
const hasMatchMedia = () => (
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
);

/**
 * One-shot, non-reactive check — for components that only need the
 * preference's value *at the moment an effect runs* (a canvas setup effect,
 * an rAF loop's setup) rather than a value that re-renders the component
 * when the OS setting changes mid-session. Same hasMatchMedia() guard as the
 * hook above, exported separately so those call sites don't have to adopt
 * the hook's re-render semantics just to get the safe existence check.
 */
export function prefersReducedMotion() {
  return hasMatchMedia() && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export default function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(() => (
    hasMatchMedia() && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ));

  useEffect(() => {
    if (!hasMatchMedia()) return undefined;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReduced(mq.matches);
    if (mq.addEventListener) mq.addEventListener('change', onChange);
    else mq.addListener(onChange);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', onChange);
      else mq.removeListener(onChange);
    };
  }, []);

  return reduced;
}
