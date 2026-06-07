// Thin wrapper around canvas-confetti. Two helpers:
//   - burstAt(element, opts)  → origin-anchored burst at an element's center
//   - bigBurst(opts)          → full-window cannons for milestones
// Both no-op when prefers-reduced-motion is set.

import confetti from 'canvas-confetti';
import { prefersReducedMotion } from '../../../clubpm/anim/motion';

const PALETTES = {
  taskComplete:  ['#26d49a', '#34d3a0', '#a6f0d1', '#3cb38a'],
  rankUp:        ['#f6c544', '#ffd96b', '#d99a2a', '#ffe28a'],
  milestone:     ['#26d49a', '#ffd96b', '#9b6bff', '#5ec1ff', '#ff7a8f'],
  purchase:      ['#9b6bff', '#5ec1ff', '#ffd96b'], // overridden per-rarity at call site
  streakExtend:  ['#ff9248', '#ffb766', '#ff5e3a', '#ffd6a8'],
  consumable:    ['#5ec1ff', '#26d49a', '#ffd96b'],
};

function paletteOf(name) {
  if (Array.isArray(name)) return name;
  return PALETTES[name] ?? PALETTES.taskComplete;
}

/**
 * Burst confetti at the centre of a DOM element.
 *   intensity: 'small' | 'normal' | 'large'  (default: 'normal')
 *   palette:   name | array of colour strings
 */
export function burstAt(element, { intensity = 'normal', palette = 'taskComplete' } = {}) {
  if (prefersReducedMotion()) return;
  if (!element || typeof window === 'undefined') return;

  const rect = element.getBoundingClientRect?.();
  if (!rect) return;
  const x = (rect.left + rect.width  / 2) / window.innerWidth;
  const y = (rect.top  + rect.height / 2) / window.innerHeight;

  const params = {
    small:  { particleCount: 30,  spread: 55, startVelocity: 22, scalar: 0.7 },
    normal: { particleCount: 70,  spread: 75, startVelocity: 32, scalar: 0.95 },
    large:  { particleCount: 130, spread: 95, startVelocity: 40, scalar: 1.1 },
  }[intensity] ?? null;

  if (!params) return;

  try {
    confetti({
      ...params,
      origin: { x, y },
      colors: paletteOf(palette),
      disableForReducedMotion: true,
      zIndex: 9999,
    });
  } catch (err) {
    // Silently swallow — confetti is best-effort and must never crash callers.
    console.warn('[confetti] burst failed:', err);
  }
}

/** Full-window cannons — left + right. Used for milestones, rank-ups. */
export function bigBurst({ palette = 'milestone' } = {}) {
  if (prefersReducedMotion()) return;
  if (typeof window === 'undefined') return;

  const colors = paletteOf(palette);
  try {
    confetti({
      particleCount: 90, spread: 70, startVelocity: 45, angle: 60,
      origin: { x: 0, y: 0.7 }, colors, disableForReducedMotion: true, zIndex: 9999,
    });
    confetti({
      particleCount: 90, spread: 70, startVelocity: 45, angle: 120,
      origin: { x: 1, y: 0.7 }, colors, disableForReducedMotion: true, zIndex: 9999,
    });
    setTimeout(() => {
      confetti({
        particleCount: 60, spread: 120, startVelocity: 30,
        origin: { x: 0.5, y: 0.5 }, colors, disableForReducedMotion: true, zIndex: 9999,
      });
    }, 250);
  } catch (err) {
    console.warn('[confetti] bigBurst failed:', err);
  }
}

/** Per-rarity palette helper for purchase bursts. */
export function rarityPalette(rarity) {
  switch ((rarity || '').toUpperCase()) {
    case 'MYTHIC':   return ['#ffd966', '#9b6bff', '#ff7a8f', '#5ec1ff'];
    case 'RARE':     return ['#5ec1ff', '#9b6bff', '#cce7ff'];
    case 'UNCOMMON': return ['#26d49a', '#aef0d3', '#5ed4a8'];
    case 'COMMON':
    default:         return ['#b8c2cf', '#dde3ea', '#8693a4'];
  }
}
