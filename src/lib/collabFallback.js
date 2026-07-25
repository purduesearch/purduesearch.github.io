// Decides whether the offline/fallback content seed should run for a
// collaborative (Yjs/Hocuspocus) editor.
//
// In collab mode the editor starts empty and relies on the Yjs document
// SYNCING from the Hocuspocus server to populate it. If the document never
// syncs — the WS is blocked (some browsers/ad-blockers), or the socket reaches
// "connected" but authentication silently fails so the server never delivers a
// document — the editor would otherwise stay blank forever. In that case we
// seed the last-saved `content` prop so the draft is visible and editable (the
// REST autosave keeps persisting it).
//
// The decision is gated on SYNC, never on transport "connected": a socket can
// be connected yet never sync (auth failure), which is exactly the case the
// earlier `!connected` gate missed — it left the editor permanently blank.
export function shouldFallbackSeed({ synced, editorEmpty, hasContent }) {
  return !synced && editorEmpty && hasContent;
}
