/**
 * ClubPM stylesheet loading. The mechanism now lives in src/theme/loadTheme.js
 * and is shared with the ARES public pages; this file keeps the ClubPM-specific
 * href and marker, and the call signatures ~20 sites in App.js already use.
 *
 * public/search-theme.css used to carry every ClubPM rule too, so visitors who
 * only ever saw the marketing pages still downloaded ~65 kB (gzip) of dashboard
 * CSS. The ClubPM-only rules live in public/clubpm-theme.css, fetched here the
 * first time a /clubpm/* route loads.
 *
 * The href is a stable public URL because BlogPreviewFrame's iframe links it
 * directly. Do not change it.
 */
import { loadTheme, lazyWithTheme } from '../theme/loadTheme';

// BUMP THIS whenever public/clubpm-theme.css changes.
//
// The sheet lives in public/, so CRA does not content-hash it and GitHub Pages
// serves it with a long-lived cache. Without a bump, a returning visitor keeps
// the sheet their browser cached on an earlier visit while the JS bundle (which
// *is* hashed) updates — so new markup renders against old CSS and the new rules
// look like they were silently dropped. That is exactly what happened to the
// Reports "Charts" tab: v=1 shipped before the .pm-an-* rules existed, so the
// whole tab rendered unstyled for anyone who had loaded ClubPM before.
//
// loadTheme() keys its memo and its DOM guard on the (marker, href) pair, so a
// bump here is correctly treated as a new sheet rather than resolving against
// the stale <link>.
const HREF = '/clubpm-theme.css?v=2';
const MARKER = 'data-clubpm-theme';

export function loadClubPmTheme() {
  return loadTheme(HREF, MARKER);
}

export function lazyWithClubPmTheme(load) {
  return lazyWithTheme(HREF, MARKER)(load);
}
