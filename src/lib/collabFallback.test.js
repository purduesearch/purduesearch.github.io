import { shouldFallbackSeed } from './collabFallback';

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
