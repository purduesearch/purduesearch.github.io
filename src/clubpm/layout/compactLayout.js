import { useSyncExternalStore } from 'react';

/**
 * The single definition of Constellation's compact (phone) layout.
 *
 * Portrait phones and narrow windows are everything below 768 CSS px; the
 * second clause catches short landscape phones (touch-only, no hover, under
 * 1024 x 500). 767.98 rather than 767 so a fractional viewport at some zoom
 * levels cannot fall between the phone and desktop rules.
 *
 * Contract: docs/superpowers/plans/2026-09-13-constellation-mobile-redesign/contracts.md §1.
 *
 * public/clubpm-theme.css wraps every compact rule in `@media` with this exact
 * string AND scopes it under `.pm-shell--compact` (the class AppShell sets from
 * this hook). The class is what keeps CSS and JS from disagreeing about which
 * presentation is mounted; the media wrapper keeps the rules from ever reaching
 * a desktop-sized viewport. compactLayout.test.js fails if the two strings drift.
 */
export const COMPACT_QUERY =
  '(max-width: 767.98px), (pointer: coarse) and (hover: none) and (max-width: 1023.98px) and (max-height: 499.98px)';

/** Class on the shell root, and on every portalled phone surface. */
export const COMPACT_CLASS = 'pm-shell--compact';

/**
 * Temporary rollout switch (plan §6 Phase 5 step 5 — remove once stable).
 *
 * - Build time: REACT_APP_CLUBPM_COMPACT=off ships the desktop shell at every
 *   width. Unset or any other value leaves the compact layout on.
 * - Per browser: localStorage['pm-compact'] = 'on' | 'off' overrides the build
 *   value for previewing. Never persisted server-side.
 *
 * The switch only enables or disables the layout; it never forces the phone
 * presentation onto a viewport that fails COMPACT_QUERY.
 */
export const COMPACT_STORAGE_KEY = 'pm-compact';
const CHANGE_EVENT = 'pm-compact-changed';

function readOverride() {
  try {
    const v = window.localStorage.getItem(COMPACT_STORAGE_KEY);
    return v === 'on' || v === 'off' ? v : null;
  } catch {
    return null;
  }
}

export function isCompactEnabled(buildValue = process.env.REACT_APP_CLUBPM_COMPACT) {
  const override = readOverride();
  if (override) return override === 'on';
  return String(buildValue ?? 'on').trim().toLowerCase() !== 'off';
}

/** Preview helper: setCompactPreview('off') from the console, null to clear. */
export function setCompactPreview(value) {
  try {
    if (value === 'on' || value === 'off') window.localStorage.setItem(COMPACT_STORAGE_KEY, value);
    else window.localStorage.removeItem(COMPACT_STORAGE_KEY);
  } catch { /* storage blocked — nothing to preview */ }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

let mql = null;
function mediaList() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null;
  if (!mql) mql = window.matchMedia(COMPACT_QUERY);
  return mql;
}

function getSnapshot() {
  const list = mediaList();
  return Boolean(list && list.matches && isCompactEnabled());
}

function subscribe(onChange) {
  const list = mediaList();
  const onStorage = (e) => { if (!e.key || e.key === COMPACT_STORAGE_KEY) onChange(); };
  if (list) {
    if (list.addEventListener) list.addEventListener('change', onChange);
    else list.addListener?.(onChange);
  }
  window.addEventListener('storage', onStorage);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    if (list) {
      if (list.removeEventListener) list.removeEventListener('change', onChange);
      else list.removeListener?.(onChange);
    }
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

/** True when the phone presentation should be mounted. */
export function useCompactLayout() {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

/** Test seam: drop the cached MediaQueryList so a new matchMedia mock is read. */
export function resetCompactLayoutForTests() {
  mql = null;
}
