// GSAP scroll-effect utilities for public pages. Every helper returns
// a cleanup function and no-ops (static end-state) under reduced motion.
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

const reduced = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function parallaxLayer(el, { strength = 18 } = {}) {
  if (!el || reduced()) return () => {};
  const tween = gsap.fromTo(el, { yPercent: -strength }, {
    yPercent: strength, ease: 'none',
    scrollTrigger: {
      trigger: el.parentElement, start: 'top bottom', end: 'bottom top', scrub: true,
    },
  });
  return () => { tween.scrollTrigger?.kill(); tween.kill(); };
}

export function drawPathOnScroll(path, { start = 'top 75%', end = 'bottom 45%', scrub = true } = {}) {
  if (!path) return () => {};
  if (reduced()) return () => {};
  const len = path.getTotalLength();
  gsap.set(path, { strokeDasharray: len, strokeDashoffset: len });
  const tween = gsap.to(path, {
    strokeDashoffset: 0, ease: 'none',
    scrollTrigger: { trigger: path.closest('section') || path, start, end, scrub },
  });
  return () => { tween.scrollTrigger?.kill(); tween.kill(); };
}

export function staggerGroup(container, childSelector, { y = 24, each = 0.08 } = {}) {
  if (!container || reduced()) return () => {};
  const items = container.querySelectorAll(childSelector);
  if (!items.length) return () => {};
  const tween = gsap.from(items, {
    y, autoAlpha: 0, duration: 0.55, ease: 'power3.out', stagger: each,
    scrollTrigger: { trigger: container, start: 'top 78%', once: true },
  });
  return () => { tween.scrollTrigger?.kill(); tween.kill(); };
}

export function marquee(track, { pxPerSec = 40 } = {}) {
  if (!track || reduced()) return () => {};
  const width = track.scrollWidth / 2; // content must be duplicated once in JSX
  const tween = gsap.to(track, {
    x: -width, duration: width / pxPerSec, ease: 'none', repeat: -1,
  });
  const pause = () => tween.pause();
  const play  = () => tween.play();
  track.addEventListener('pointerenter', pause);
  track.addEventListener('pointerleave', play);
  track.addEventListener('focusin', pause);
  track.addEventListener('focusout', play);
  return () => {
    tween.kill();
    track.removeEventListener('pointerenter', pause);
    track.removeEventListener('pointerleave', play);
    track.removeEventListener('focusin', pause);
    track.removeEventListener('focusout', play);
  };
}

export function heroIntro(container, childSelector) {
  if (!container || reduced()) return () => {};
  const tween = gsap.from(container.querySelectorAll(childSelector), {
    y: 28, autoAlpha: 0, duration: 0.7, ease: 'power3.out', stagger: 0.12, delay: 0.15,
  });
  return () => tween.kill();
}
