// Site-wide micro-interaction helpers (public pages only — ClubPM has
// its own wrapper at src/clubpm/anim/motion.js). Single import surface
// so easing, timing, and reduced-motion handling stay consistent.
import { animate } from 'animejs';

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export const canHover = () =>
  typeof window !== 'undefined' &&
  !!window.matchMedia?.('(hover: hover)').matches;

/** Count an element's text 0 → end when scrolled into view. */
export function countUpOnView(el, end, { duration = 1400, suffix = '', prefix = '' } = {}) {
  if (!el) return () => {};
  const render = (v) => {
    el.textContent = `${prefix}${Math.round(v).toLocaleString()}${suffix}`;
  };
  if (prefersReducedMotion()) { render(end); return () => {}; }
  render(0);
  const io = new IntersectionObserver(([entry]) => {
    if (!entry.isIntersecting) return;
    io.disconnect();
    const state = { v: 0 };
    animate(state, { v: end, duration, ease: 'outExpo', onUpdate: () => render(state.v) });
  }, { threshold: 0.4 });
  io.observe(el);
  return () => io.disconnect();
}

/** Tactile press feedback for CTAs. */
export function pressFeedback(el) {
  if (!el || prefersReducedMotion()) return () => {};
  const down = () => animate(el, { scale: 0.965, duration: 90, ease: 'outQuad' });
  const up   = () => animate(el, { scale: 1, duration: 260, ease: 'outElastic(1, .6)' });
  el.addEventListener('pointerdown', down);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointerleave', up);
  return () => {
    el.removeEventListener('pointerdown', down);
    el.removeEventListener('pointerup', up);
    el.removeEventListener('pointerleave', up);
  };
}
