import * as Y from 'yjs';
import {
  absolutePositionToRelativePosition,
  relativePositionToAbsolutePosition,
  ySyncPluginKey,
} from '@tiptap/y-tiptap';

// Anchors travel as base64 in JSON and are stored as Bytes. They deliberately
// do NOT live in the document: a comment is metadata about content, not
// content, so it must not reach contentJson, revisions, or markdown export.
//
// The position helpers come from @tiptap/y-tiptap — the same package
// @tiptap/extension-collaboration peers on — NOT y-prosemirror. The two ship
// distinct ySyncPluginKey instances; mixing them yields undefined plugin state
// and a crash on mount.

export function encodeAnchor(relPos) {
  const bytes = Y.encodeRelativePosition(relPos);
  let binary = '';
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary);
}

export function decodeAnchor(b64) {
  if (!b64) return null;
  try {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return Y.decodeRelativePosition(bytes);
  } catch {
    // A malformed anchor must degrade to "orphaned", never crash the editor.
    return null;
  }
}

// The Yjs binding the collaboration extension installed. Absent when the editor
// is running without collab (preview, revision view) — callers treat that as
// "cannot resolve anchors" rather than an error.
function binding(editor) {
  if (!editor || editor.isDestroyed) return null;
  return ySyncPluginKey.getState(editor.state)?.binding ?? null;
}

export function anchorFromSelection(editor, from, to) {
  const b = binding(editor);
  if (!b) return null;
  const start = absolutePositionToRelativePosition(from, b.type, b.mapping);
  const end = absolutePositionToRelativePosition(to, b.type, b.mapping);
  return { anchorStart: encodeAnchor(start), anchorEnd: encodeAnchor(end) };
}

/**
 * Absolute range for a thread's anchor, or null when it can no longer be
 * placed — the anchored text was deleted. Null is the orphan signal the rail
 * renders under "No longer in the document". It is not an error, and there is
 * no fallback position to substitute.
 */
export function resolveAnchor(editor, thread) {
  const b = binding(editor);
  if (!b) return null;

  const start = decodeAnchor(thread.anchorStart);
  const end = decodeAnchor(thread.anchorEnd);
  if (!start || !end) return null;

  const ydoc = b.doc ?? b.type.doc;
  const from = relativePositionToAbsolutePosition(ydoc, b.type, start, b.mapping);
  const to = relativePositionToAbsolutePosition(ydoc, b.type, end, b.mapping);
  if (from == null || to == null || from >= to) return null;

  return { from, to };
}
