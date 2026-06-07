// Shared anime.js v4 helpers for the ClubPM satisfaction layer.
//
// Single import surface so easing, timing, and reduced-motion handling stay
// consistent across the app. v4 uses named exports — there is no default
// `anime()` call.

import { animate, createSpring, stagger, svg, utils } from 'animejs';

/** True if the user prefers reduced motion. Cached per call; cheap. */
export function prefersReducedMotion() {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** True only on devices with a true hover device (mouse). False on touch. */
export function hasHoverCapability() {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  try {
    return window.matchMedia('(hover: hover)').matches;
  } catch {
    return false;
  }
}

/** Shared spring config — tuned for tactile feel. */
export const spring = createSpring({ stiffness: 180, damping: 16, mass: 1 });
export const springSnap   = createSpring({ stiffness: 260, damping: 18, mass: 1 });
export const springBouncy = createSpring({ stiffness: 220, damping: 11, mass: 1 });

/**
 * Animate a number from `from` to `to` and write each frame into `el.textContent`
 * (or a custom updater). Spring-eased by default. Snaps to integer by default.
 *
 *   tweenNumber(el, 0, 1234)
 *   tweenNumber(el, prev, next, { format: v => '$' + v.toFixed(2), duration: 900 })
 */
export function tweenNumber(el, from, to, opts = {}) {
  const {
    format = (v) => Math.round(v).toLocaleString(),
    duration = 700,
    ease: easeOpt = spring,
    onUpdate,
  } = opts;

  if (!el) return { pause() {}, cancel() {} };
  // Reduced motion: write final immediately and return a no-op handle.
  if (prefersReducedMotion()) {
    el.textContent = format(to);
    onUpdate?.(to);
    return { pause() {}, cancel() {} };
  }

  const proxy = { v: Number(from) || 0 };
  return animate(proxy, {
    v: Number(to) || 0,
    duration,
    ease: easeOpt,
    onUpdate: () => {
      el.textContent = format(proxy.v);
      onUpdate?.(proxy.v);
    },
  });
}

/**
 * Mount-in cascade: scale 0.92→1 + opacity 0→1 on a list of elements with a
 * staggered start. Common helper for grids, tile rows, leaderboard rows.
 */
export function revealStagger(targets, opts = {}) {
  if (!targets || (targets.length === 0)) return { pause() {}, cancel() {} };
  const { delay = 40, duration = 520, fromY = 12 } = opts;

  if (prefersReducedMotion()) {
    const list = Array.isArray(targets) ? targets : Array.from(targets);
    for (const el of list) {
      if (el && el.style) { el.style.opacity = 1; el.style.transform = ''; }
    }
    return { pause() {}, cancel() {} };
  }

  return animate(targets, {
    opacity:   [0, 1],
    scale:     [0.92, 1],
    translateY:[fromY, 0],
    duration,
    ease: spring,
    delay: stagger(delay),
  });
}

/** Brief tactile glow ring on a satisfaction tap — color drops back to transparent. */
export function pulseGlow(el, color = 'rgba(80, 200, 255, 0.55)') {
  if (!el || prefersReducedMotion()) return { pause() {}, cancel() {} };
  return animate(el, {
    boxShadow: [
      `0 0 0 0 ${color}`,
      `0 0 22px 6px ${color}`,
      `0 0 0 0 ${color}`,
    ],
    duration: 700,
    ease: spring,
  });
}

/**
 * Animate width % of a progress bar between two values, spring-eased.
 * Pass percentages as numbers (0–100).
 */
export function tweenWidthPercent(el, fromPct, toPct, opts = {}) {
  const { duration = 700, ease: easeOpt = spring } = opts;
  if (!el) return { pause() {}, cancel() {} };
  if (prefersReducedMotion()) { el.style.width = `${toPct}%`; return { pause() {}, cancel() {} }; }
  const proxy = { p: Number(fromPct) || 0 };
  return animate(proxy, {
    p: Number(toPct) || 0,
    duration,
    ease: easeOpt,
    onUpdate: () => { el.style.width = `${proxy.p}%`; },
  });
}

/**
 * Pop a stack of avatar elements in sequence — used after a project's progress
 * bar settles to call attention to contributors whose XP events landed after
 * the user's last visit. Each element scales from 0.6 → 1.05 → 1 with a faint
 * glow ring, staggered.
 */
export function popAvatarStack(targets, opts = {}) {
  if (!targets || (targets.length === 0)) return { pause() {}, cancel() {} };
  const { delay = 70, duration = 520, glow = 'rgba(80, 200, 255, 0.55)' } = opts;
  if (prefersReducedMotion()) {
    const list = Array.isArray(targets) ? targets : Array.from(targets);
    for (const el of list) {
      if (el && el.style) { el.style.opacity = 1; el.style.transform = ''; }
    }
    return { pause() {}, cancel() {} };
  }
  return animate(targets, {
    scale: [0.6, 1.05, 1],
    opacity: [0, 1],
    boxShadow: [
      `0 0 0 0 ${glow}`,
      `0 0 12px 4px ${glow}`,
      `0 0 0 0 ${glow}`,
    ],
    duration,
    ease: springBouncy,
    delay: stagger(delay),
  });
}

/**
 * Pulse a coloured ring around a status badge — for milestone health changes
 * and task status transitions. Keep amplitudes small; this fires on routine
 * edits, not celebrations.
 */
export function pulseBadge(el, color = 'rgba(45, 212, 191, 0.6)') {
  if (!el || prefersReducedMotion()) return { pause() {}, cancel() {} };
  return animate(el, {
    boxShadow: [
      `0 0 0 0 ${color}`,
      `0 0 0 8px transparent`,
    ],
    duration: 600,
    ease: spring,
  });
}

/**
 * Expand a Kanban drop-slot placeholder vertically as the drag-over column
 * changes. Driven from KanbanBoard's onDragUpdate.
 */
export function expandDropSlot(el, fromHeight = 0, toHeight = 56) {
  if (!el) return { pause() {}, cancel() {} };
  if (prefersReducedMotion()) { el.style.maxHeight = `${toHeight}px`; return { pause() {}, cancel() {} }; }
  return animate(el, {
    maxHeight: [`${fromHeight}px`, `${toHeight}px`],
    duration: 160,
    ease: spring,
  });
}

// ── Challenge / reward helpers ────────────────────────────────

/**
 * Press-depth tactile push: translateY 0 → +4px → 0.
 * Attach to a claim button's ref on click.
 */
export function pressDepth(el) {
  if (!el || prefersReducedMotion()) return { pause() {}, cancel() {} };
  return animate(el, {
    translateY: [0, 4, 0],
    duration: 260,
    ease: springSnap,
  });
}

/**
 * Bounce-pop a quest card when it transitions to completed state.
 */
export function completeBounce(el) {
  if (!el || prefersReducedMotion()) return { pause() {}, cancel() {} };
  return animate(el, {
    scale: [1, 1.04, 0.98, 1],
    duration: 480,
    ease: springBouncy,
  });
}

const RARITY_GLOW = {
  COMMON:   'rgba(255,255,255,0.25)',
  UNCOMMON: 'rgba(80,150,255,0.55)',
  RARE:     'rgba(160,60,255,0.55)',
  EPIC:     'rgba(255,120,0,0.55)',
  MYTHIC:   'rgba(255,180,0,0.65)',
};

/**
 * One-shot glow pulse in the rarity color of a cosmetic drop.
 * rarity: 'COMMON' | 'UNCOMMON' | 'RARE' | 'EPIC' | 'MYTHIC'
 */
export function rarityGlow(el, rarity = 'COMMON') {
  if (!el || prefersReducedMotion()) return { pause() {}, cancel() {} };
  const color = RARITY_GLOW[rarity] ?? RARITY_GLOW.COMMON;
  return animate(el, {
    boxShadow: [
      `0 0 0 0 ${color}`,
      `0 0 28px 8px ${color}`,
      `0 0 0 0 ${color}`,
    ],
    duration: 900,
    ease: spring,
  });
}

/**
 * Flip a card in place (Y axis, 0° → 180°) — use two calls:
 *   first to 90° (hide front), swap content, then 90° → 0° (show back).
 * Returns a Promise that resolves when the first half completes.
 */
export function cardFlipReveal(el, opts = {}) {
  const { duration = 320, ease: easeOpt = springSnap } = opts;
  if (!el || prefersReducedMotion()) {
    el && (el.style.transform = 'rotateY(0deg)');
    return Promise.resolve();
  }
  return new Promise(resolve => {
    animate(el, {
      rotateY: [0, 90],
      duration,
      ease: easeOpt,
      onComplete: resolve,
    });
  });
}

/**
 * Fly a reward chip (XP / DB label) from `origin` to its resting position.
 * `origin` is a { x, y } viewport coordinate; `el` is the chip element.
 */
export function flyInChip(el, origin, opts = {}) {
  const { duration = 560, ease: easeOpt = springBouncy } = opts;
  if (!el || prefersReducedMotion()) {
    if (el && el.style) { el.style.opacity = 1; el.style.transform = ''; }
    return { pause() {}, cancel() {} };
  }
  const rect = el.getBoundingClientRect();
  const dx = origin.x - (rect.left + rect.width  / 2);
  const dy = origin.y - (rect.top  + rect.height / 2);
  return animate(el, {
    translateX: [dx, 0],
    translateY: [dy, 0],
    opacity:    [0, 1],
    scale:      [0.6, 1],
    duration,
    ease: easeOpt,
  });
}

// Re-export the most commonly used named exports so callers can import them
// from this module instead of reaching for animejs directly. Keeps the import
// surface small and the easing config consistent.
export { animate, createSpring, stagger, svg, utils };
