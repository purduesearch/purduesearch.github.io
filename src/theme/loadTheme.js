/**
 * Loads a hand-written stylesheet from public/ on demand.
 *
 * Generalized from the ClubPM-only loader. Two sheets now use it:
 *   /clubpm-theme.css  — fetched by /clubpm/* routes
 *   /ares-theme.css    — fetched by /ares/* routes
 *
 * Why a runtime <link> rather than an `import './x.css'`:
 *   - search-theme.css is itself a static <link> in public/index.html, not a
 *     webpack import, so there is no CSS chunk graph to piggyback on.
 *   - Appending to <head> puts these sheets after style.min.css and
 *     search-theme.css, preserving the cascade order they rely on.
 *   - It keeps a stable public URL, which BlogPreviewFrame's iframe needs.
 *
 * CAUTION: both sheets end up in <head> in *visit order*, so a visitor who
 * hits /ares then /clubpm gets the opposite order from one who does the
 * reverse. clubpm-theme.css is a broad verbatim tail slice of the pre-split
 * stylesheet, so ares-theme.css scopes every selector under .ares-page and
 * cannot be affected either way. Keep it that way.
 *
 * The returned promise resolves once the sheet has applied, so callers can hold
 * rendering and avoid a flash of unstyled UI.
 */

const pending = new Map();

export function loadTheme(href, marker) {
  if (pending.has(href)) return pending.get(href);

  const promise = new Promise((resolve) => {
    if (typeof document === 'undefined') {
      resolve();
      return;
    }

    if (document.querySelector(`link[${marker}]`)) {
      resolve();
      return;
    }

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.setAttribute(marker, '');

    // Resolve on error too: a missing stylesheet should degrade to unstyled
    // rather than hang the route behind a Suspense fallback forever.
    link.onload = () => resolve();
    link.onerror = () => resolve();

    document.head.appendChild(link);
  });

  pending.set(href, promise);
  return promise;
}

/**
 * Wraps a React.lazy loader so the chunk resolves only after the stylesheet is
 * in place. Both fetches run in parallel; the Suspense fallback covers the wait.
 */
export function lazyWithTheme(href, marker) {
  return (load) => () => Promise.all([load(), loadTheme(href, marker)]).then(([mod]) => mod);
}

/** Test-only: clears the in-flight cache between cases. */
export function __resetThemeCacheForTests() {
  pending.clear();
}
