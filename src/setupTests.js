// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';
import { TextEncoder, TextDecoder } from 'util';

// jsdom (via Jest 27, pinned by react-scripts 5) does not implement the
// TextEncoder/TextDecoder globals that Node and real browsers both provide.
// react-router 7 constructs a `new TextEncoder()` at module scope
// (react-router/dist/development/index.js, server-runtime crypto), so merely
// importing react-router-dom throws ReferenceError without these.
// Guarded so they defer to a real implementation if jsdom ever ships one.
if (typeof global.TextEncoder === 'undefined') {
  global.TextEncoder = TextEncoder;
}
if (typeof global.TextDecoder === 'undefined') {
  global.TextDecoder = TextDecoder;
}

// jsdom implements no matchMedia at all. GSAP's ScrollTrigger calls it during
// gsap.registerPlugin() (src/anim/scrollFx.js runs that at module scope), and
// our own prefers-reduced-motion checks use it. Reporting `matches: false`
// means tests see the full-motion branch, matching a default browser.
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}

// jsdom ships neither observer API. Home.jsx constructs an IntersectionObserver
// in an effect, and several ClubPM/recharts surfaces use ResizeObserver, so
// without these a render throws instead of failing on a real assertion.
// These never invoke their callback: nothing is "in view" and nothing resizes
// under jsdom anyway, so observed components keep their initial state.
if (typeof global.IntersectionObserver === 'undefined') {
  global.IntersectionObserver = class IntersectionObserver {
    constructor(callback, options) {
      this.callback = callback;
      this.options = options;
      this.root = options?.root ?? null;
      this.rootMargin = options?.rootMargin ?? '0px';
      this.thresholds = [options?.threshold ?? 0].flat();
    }

    observe() {}

    unobserve() {}

    disconnect() {}

    takeRecords() {
      return [];
    }
  };
}

if (typeof global.ResizeObserver === 'undefined') {
  global.ResizeObserver = class ResizeObserver {
    constructor(callback) {
      this.callback = callback;
    }

    observe() {}

    unobserve() {}

    disconnect() {}
  };
}

// jsdom has no layout engine, so scrollTo is unimplemented and logs a noisy
// "Not implemented" error whenever <ScrollToTop> runs. Stub it to a no-op.
if (typeof window !== 'undefined') {
  window.scrollTo = () => {};
}
