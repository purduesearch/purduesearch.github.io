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

// Has the editor's document actually LOADED yet?
//
// A collab editor is empty between mount and the moment its body arrives, and
// every ProseMirror transaction in that window reports an empty document. That
// window is not a document state anyone may act on: CourseEditorPage's 1.5s
// debounced autosave persisted it straight over `contentJson`, while the
// fallback seed that would have filled the editor waits 4s. Opening a section
// was therefore enough to destroy it — ares-101 lost two written articles that
// way, and with no revision table there was nothing to roll back to.
//
// So the editor stays read-only, and reports no changes, until this is true.
// Both terms are needed: `synced` is the normal path, and `fallbackElapsed`
// (the seed window having passed) releases the editor when the socket never
// syncs at all — otherwise a blocked WS would trade lost content for an editor
// that can never save.
export function isDocHydrated({ collab, synced, fallbackElapsed }) {
  if (!collab) return true; // loads its `content` prop synchronously
  return !!(synced || fallbackElapsed);
}
