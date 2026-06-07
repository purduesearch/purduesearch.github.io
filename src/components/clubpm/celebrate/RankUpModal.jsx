import React, { useEffect, useRef } from 'react';
import { animate, spring, springBouncy, prefersReducedMotion } from '../../../clubpm/anim/motion';
import { bigBurst } from './confetti';

const RANK_ORDER = ['NESTLING', 'FLEDGLING', 'CADET', 'SPECIALIST', 'PIONEER', 'COSMONAUT', 'CELESTIAL'];

const RANK_DISPLAY = {
  NESTLING:   'Nestling',
  FLEDGLING:  'Fledgling',
  CADET:      'Cadet',
  SPECIALIST: 'Specialist',
  PIONEER:    'Pioneer',
  COSMONAUT:  'Cosmonaut',
  CELESTIAL:  'Celestial',
};

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ#@$%&!?*';

/** Scramble-text helper — letters cycle through random glyphs before settling. */
function scrambleInto(el, finalText, durationMs = 700) {
  if (!el) return null;
  if (prefersReducedMotion()) {
    el.textContent = finalText;
    return null;
  }
  const target = finalText.toUpperCase();
  const frames = Math.max(8, Math.round(durationMs / 50));
  let frame = 0;

  // Build chars
  el.textContent = target.replace(/./g, () => CHARS[Math.floor(Math.random() * CHARS.length)]);

  const tick = () => {
    frame += 1;
    const progress = Math.min(1, frame / frames);
    const settled = Math.floor(progress * target.length);
    let out = '';
    for (let i = 0; i < target.length; i++) {
      if (i < settled || target[i] === ' ') out += target[i];
      else out += CHARS[Math.floor(Math.random() * CHARS.length)];
    }
    el.textContent = out;
    if (frame < frames) requestAnimationFrame(tick);
    else el.textContent = target;
  };
  requestAnimationFrame(tick);
  return { cancel() {} };
}

export default function RankUpModal({ rank, onDismiss }) {
  const cardRef = useRef(null);
  const titleRef = useRef(null);
  const rankRef = useRef(null);
  const backdropRef = useRef(null);
  const hasFiredRef = useRef(false);

  useEffect(() => {
    if (!rank) return;
    if (hasFiredRef.current) return;
    hasFiredRef.current = true;
    if (!prefersReducedMotion()) {
      animate(backdropRef.current, { opacity: [0, 1], duration: 250 });
      animate(cardRef.current, {
        scale: [0.6, 1.04, 1],
        opacity: [0, 1],
        duration: 600,
        ease: springBouncy,
      });
    }

    setTimeout(() => scrambleInto(titleRef.current, 'RANK UP', 600), 250);
    setTimeout(() => scrambleInto(rankRef.current, RANK_DISPLAY[rank] ?? rank, 800), 500);
    setTimeout(() => bigBurst({ palette: 'rankUp' }), 350);

    const onKey = (e) => { if (e.key === 'Escape') onDismiss?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [rank, onDismiss]);

  useEffect(() => {
    if (!rank) hasFiredRef.current = false;
  }, [rank]);

  if (!rank) return null;

  return (
    <div
      ref={backdropRef}
      className="pm-celebrate-backdrop"
      style={{ opacity: prefersReducedMotion() ? 1 : 0 }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="rankup-title"
    >
      <div
        ref={cardRef}
        className="pm-rankup-card"
        style={{ opacity: prefersReducedMotion() ? 1 : 0 }}
      >
        <div ref={titleRef} id="rankup-title" className="pm-rankup-eyebrow">RANK UP</div>
        <div ref={rankRef} className="pm-rankup-rank">{RANK_DISPLAY[rank] ?? rank}</div>
        <div className="pm-rankup-sub">You've reached a new tier. Wear it.</div>
        <button
          className="pm-rankup-continue"
          onClick={() => {
            if (!prefersReducedMotion()) {
              animate(cardRef.current, { scale: [1, 0.9], opacity: [1, 0], duration: 250, ease: spring });
              animate(backdropRef.current, { opacity: [1, 0], duration: 250 });
            }
            setTimeout(() => onDismiss?.(), prefersReducedMotion() ? 0 : 250);
          }}
        >
          Continue
        </button>
      </div>
    </div>
  );
}

export { RANK_ORDER };
