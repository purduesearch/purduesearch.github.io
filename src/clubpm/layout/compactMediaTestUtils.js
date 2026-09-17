// Test-only helper (imported by *.test.js files, never by app code).
import { COMPACT_QUERY, resetCompactLayoutForTests } from './compactLayout';

/** A matchMedia whose COMPACT_QUERY answer the test controls. */
export function installCompactMedia(initial) {
  const listeners = new Set();
  const list = {
    matches: initial,
    media: COMPACT_QUERY,
    addEventListener: (_t, fn) => listeners.add(fn),
    removeEventListener: (_t, fn) => listeners.delete(fn),
    addListener: (fn) => listeners.add(fn),
    removeListener: (fn) => listeners.delete(fn),
  };
  const original = window.matchMedia;
  window.matchMedia = (q) => (q === COMPACT_QUERY ? list : original(q));
  resetCompactLayoutForTests();
  return {
    set(matches) {
      list.matches = matches;
      listeners.forEach(fn => fn({ matches }));
    },
    listenerCount: () => listeners.size,
    restore() { window.matchMedia = original; resetCompactLayoutForTests(); },
  };
}
