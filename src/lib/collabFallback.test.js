import { shouldFallbackSeed, isDocHydrated } from './collabFallback';

describe('shouldFallbackSeed', () => {
  // The regression: the WS socket reaches "connected" but the document never
  // syncs (collab auth silently failed), so the editor is still empty. The old
  // logic gated the seed on `!connected` and therefore did NOT seed here — the
  // editor stayed blank. It must seed so the draft is visible.
  test('seeds when connected but never synced (auth silently failed)', () => {
    expect(shouldFallbackSeed({ synced: false, editorEmpty: true, hasContent: true })).toBe(true);
  });

  test('seeds when the WS never connected at all (blocked by the browser)', () => {
    expect(shouldFallbackSeed({ synced: false, editorEmpty: true, hasContent: true })).toBe(true);
  });

  test('does NOT seed once the document has synced (collab is authoritative)', () => {
    expect(shouldFallbackSeed({ synced: true, editorEmpty: true, hasContent: true })).toBe(false);
  });

  test('does NOT seed when the editor already has content', () => {
    expect(shouldFallbackSeed({ synced: false, editorEmpty: false, hasContent: true })).toBe(false);
  });

  test('does NOT seed when there is no draft content to fall back to', () => {
    expect(shouldFallbackSeed({ synced: false, editorEmpty: true, hasContent: false })).toBe(false);
  });
});

// The regression these guard: a collab editor is EMPTY between mount and the
// moment the body arrives. Every ProseMirror transaction in that window reports
// an empty document, and CourseEditorPage's 1.5s debounced autosave PATCHed it
// straight over `contentJson` — while the fallback seed that would have filled
// the editor waits 4s. Opening a section was therefore enough to destroy it
// (ares-101 lost "How gravity moves air" and "The plume and the bubble" this
// way). Nothing may be treated as an edit until the document has hydrated.
describe('isDocHydrated', () => {
  test('a non-collab editor is hydrated immediately — it loads `content` synchronously', () => {
    expect(isDocHydrated({ collab: false, synced: false, fallbackElapsed: false })).toBe(true);
  });

  test('a collab editor is NOT hydrated before the document syncs', () => {
    expect(isDocHydrated({ collab: true, synced: false, fallbackElapsed: false })).toBe(false);
  });

  test('syncing hydrates it', () => {
    expect(isDocHydrated({ collab: true, synced: true, fallbackElapsed: false })).toBe(true);
  });

  // Without this a section whose socket never syncs would stay non-hydrated
  // forever, and real typing would never be persisted — trading data loss for
  // a different kind of data loss.
  test('the elapsed fallback window hydrates it even though it never synced', () => {
    expect(isDocHydrated({ collab: true, synced: false, fallbackElapsed: true })).toBe(true);
  });
});
