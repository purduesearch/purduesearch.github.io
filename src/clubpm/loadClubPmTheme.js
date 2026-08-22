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

const HREF = '/clubpm-theme.css?v=1';
const MARKER = 'data-clubpm-theme';

export function loadClubPmTheme() {
  return loadTheme(HREF, MARKER);
}

export function lazyWithClubPmTheme(load) {
  return lazyWithTheme(HREF, MARKER)(load);
}
