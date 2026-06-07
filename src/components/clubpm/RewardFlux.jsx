// Floating reward particles ("+50 XP", "+5 coins") that appear when a reward is
// granted. Each particle starts somewhere in the viewport (origin from event
// detail, or screen-center), the doubloon variant gets a brief gravity-style
// drop, and then both quickly fly to the sidebar XP/doubloon bar.
//
// Listens for `clubpm:reward-granted` dispatched by src/api/clubPmClient.js.

import { useEffect, useRef, useState } from 'react';
import { animate, spring, springSnap, prefersReducedMotion } from '../../clubpm/anim/motion';

let nextId = 0;

function originFromDetail(detail) {
  // Caller may pass an explicit { x, y } origin; otherwise default to viewport center-ish.
  if (detail?.origin && typeof detail.origin.x === 'number' && typeof detail.origin.y === 'number') {
    return { x: detail.origin.x, y: detail.origin.y };
  }
  if (typeof window === 'undefined') return { x: 0, y: 0 };
  return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
}

export default function RewardFlux() {
  const [particles, setParticles] = useState([]);
  const layerRef = useRef(null);

  useEffect(() => {
    const onReward = (e) => {
      if (prefersReducedMotion()) return;
      const { xpDelta, doubloonsDelta } = e.detail ?? {};
      const origin = originFromDetail(e.detail);
      const created = [];
      if (xpDelta > 0) created.push({ id: ++nextId, kind: 'xp', value: xpDelta, origin });
      if (doubloonsDelta > 0) created.push({ id: ++nextId, kind: 'db', value: doubloonsDelta, origin });
      if (!created.length) return;
      setParticles(p => [...p, ...created]);
      setTimeout(() => {
        setParticles(p => p.filter(x => !created.some(c => c.id === x.id)));
      }, 2800);
    };
    window.addEventListener('clubpm:reward-granted', onReward);
    return () => window.removeEventListener('clubpm:reward-granted', onReward);
  }, []);

  return (
    <div ref={layerRef} className="pm-reward-flux-layer" aria-hidden="true">
      {particles.map(p => (
        <RewardParticle key={p.id} kind={p.kind} value={p.value} origin={p.origin} />
      ))}
    </div>
  );
}

function RewardParticle({ kind, value, origin }) {
  const elRef = useRef(null);

  useEffect(() => {
    const anchorSel = kind === 'xp'
      ? '[data-reward-anchor="sidebar-xp"]'
      : '[data-reward-anchor="sidebar-doubloons"]';
    const anchor = document.querySelector(anchorSel);
    const el = elRef.current;
    if (!el) return;

    // Place the particle at the origin (action site or screen center).
    el.style.left = `${origin.x}px`;
    el.style.top = `${origin.y}px`;
    el.style.opacity = '0';

    if (!anchor) {
      // No anchor in DOM yet — fall back to fade-in-and-up so it doesn't get
      // stuck mid-screen with no destination.
      animate(el, {
        opacity: [0, 1, 0],
        translateY: [0, -28],
        scale: [0.7, 1.05, 0.95],
        duration: 900,
        ease: spring,
      });
      return;
    }

    // 1) Pop in at the origin. Doubloons get a small drop (gravity bounce).
    // 2) Then fly to the anchor with spring.
    const popIn = kind === 'db'
      ? {
          // Coins: drop down briefly (~22px) before launching toward the bar.
          opacity:  [0, 1, 1],
          scale:    [0.5, 1.15, 1],
          translateY: [-6, 24, 22],
          duration: 800,
          ease: springSnap,
        }
      : {
          // XP: gentle appear & slight rise.
          opacity:  [0, 1],
          scale:    [0.6, 1.05, 1],
          translateY: [0, -4, -2],
          duration: 600,
          ease: spring,
        };

    const popAnim = animate(el, popIn);

    // After pop-in finishes, fly toward the sidebar anchor.
    const flyDelay = kind === 'db' ? 800 : 600;
    const flyTimer = setTimeout(() => {
      // Recompute target position in case the layout has shifted (e.g. sidebar hover).
      const rect = anchor.getBoundingClientRect();
      const finalX = rect.left + rect.width / 2;
      const finalY = rect.top + rect.height / 2;
      const dx = finalX - origin.x;
      const dy = finalY - origin.y - (kind === 'db' ? 22 : -2);

      animate(el, {
        translateX: [0, dx],
        // Preserve the prior translateY end-state in the start frame so the
        // flight doesn't snap. Coins start at +22, XP at -2.
        translateY: [kind === 'db' ? 22 : -2, kind === 'db' ? 22 + dy : -2 + dy],
        scale:      [1, 0.55],
        opacity:    [1, 0],
        duration:   1000,
        ease:       spring,
      });

      // Pulse the destination bar to receive the reward.
      const bar = anchorSel === '[data-reward-anchor="sidebar-xp"]'
        ? document.querySelector('.pm-sidebar-xp-bar-fill')
        : anchor;
      if (bar) {
        animate(bar, {
          scale: [1, 1.08, 1],
          duration: 500,
          delay: 800,
          ease: spring,
        });
      }
    }, flyDelay);

    return () => {
      clearTimeout(flyTimer);
      popAnim?.pause?.();
    };
  }, [kind, origin]);

  return (
    <span ref={elRef} className={`pm-reward-flux pm-reward-flux--${kind}`}>
      {kind === 'xp'
        ? `+${value.toLocaleString()} XP`
        : <><i className="fas fa-coins" aria-hidden="true" /> +{value.toLocaleString()}</>}
    </span>
  );
}
