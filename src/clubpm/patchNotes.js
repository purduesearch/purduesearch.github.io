import { useEffect, useState } from 'react';

// Constellation patch notes. The file is generated from constellation-v* git
// tags at build time by scripts/patch-notes.mjs (guide: docs/PATCH-NOTES.md);
// nothing here knows how notes are written, only how to show them.

const NOTES_URL = '/constellation-patch-notes.json';
const SEEN_KEY = 'cpm.patchNotes.seen';
const SEEN_EVENT = 'cpm:patch-notes-seen';
const EMPTY = { current: null, releases: [] };

let request = null;

export function loadPatchNotes() {
  if (!request) {
    if (typeof fetch !== 'function') return Promise.resolve(EMPTY); // jsdom tests
    request = fetch(NOTES_URL, { cache: 'no-cache' })
      .then(r => (r.ok ? r.json() : EMPTY))
      .then(data => (Array.isArray(data?.releases) ? data : EMPTY))
      .catch(() => EMPTY);
  }
  return request;
}

/** Numeric semver comparison; a missing version sorts first. */
export function compareVersions(a, b) {
  const pa = (a || '0.0.0').split('.').map(Number);
  const pb = (b || '0.0.0').split('.').map(Number);
  for (let i = 0; i < 3; i += 1) if (pa[i] !== pb[i]) return pa[i] - pb[i];
  return 0;
}

export function readSeenVersion() {
  try { return localStorage.getItem(SEEN_KEY); } catch { return null; }
}

export function markPatchNotesSeen(version) {
  if (!version) return;
  try { localStorage.setItem(SEEN_KEY, version); } catch { /* private mode */ }
  window.dispatchEvent(new Event(SEEN_EVENT));
}

/** `undefined` while loading, then `{ current, releases }`. */
export function usePatchNotes() {
  const [notes, setNotes] = useState(undefined);
  useEffect(() => {
    let alive = true;
    loadPatchNotes().then(data => { if (alive) setNotes(data); });
    return () => { alive = false; };
  }, []);
  return notes;
}

/** Current version plus whether the member has not opened it yet. */
export function usePatchNotesBadge() {
  const notes = usePatchNotes();
  const [seen, setSeen] = useState(readSeenVersion);
  useEffect(() => {
    const sync = () => setSeen(readSeenVersion());
    window.addEventListener(SEEN_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(SEEN_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);
  const current = notes?.current ?? null;
  return { current, unseen: !!current && compareVersions(current, seen) > 0 };
}
