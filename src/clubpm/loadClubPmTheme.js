/**
 * Loads the ClubPM stylesheet on demand.
 *
 * public/search-theme.css used to carry every ClubPM rule too, so visitors who
 * only ever saw the marketing pages still downloaded ~65 kB (gzip) of dashboard
 * CSS. The ClubPM-only rules now live in public/clubpm-theme.css, which is
 * fetched here the first time a /clubpm/* route loads.
 *
 * Why a runtime <link> rather than `import './clubpm-theme.css'`:
 *   - search-theme.css is itself a static <link> in public/index.html, not a
 *     webpack import, so there is no CSS chunk graph to piggyback on.
 *   - Appending to <head> puts this sheet after style.min.css and
 *     search-theme.css, preserving the cascade order ClubPM rules rely on.
 *   - It keeps a stable public URL, which BlogPreviewFrame's iframe needs.
 *
 * The returned promise resolves once the sheet has actually applied, so callers
 * can hold rendering until then and avoid a flash of unstyled ClubPM UI.
 */

const HREF = '/clubpm-theme.css?v=1';

let pending = null;

export function loadClubPmTheme() {
  if (pending) return pending;

  pending = new Promise((resolve) => {
    if (typeof document === 'undefined') {
      resolve();
      return;
    }

    const existing = document.querySelector(`link[data-clubpm-theme]`);
    if (existing) {
      resolve();
      return;
    }

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = HREF;
    link.setAttribute('data-clubpm-theme', '');

    // Resolve on error too: a missing stylesheet should degrade to unstyled
    // ClubPM rather than hang the route behind a Suspense fallback forever.
    link.onload = () => resolve();
    link.onerror = () => resolve();

    document.head.appendChild(link);
  });

  return pending;
}

/**
 * Wraps a React.lazy loader so the chunk resolves only after the ClubPM
 * stylesheet is in place. Both fetches run in parallel; the existing Suspense
 * fallback covers the wait.
 */
export function lazyWithClubPmTheme(load) {
  return () => Promise.all([load(), loadClubPmTheme()]).then(([mod]) => mod);
}
