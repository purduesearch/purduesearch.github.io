import * as Y from 'yjs';
import { Editor } from '@tiptap/core';
import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import Collaboration from '@tiptap/extension-collaboration';
import { ThreadDecorations, setThreadDecorations } from './ThreadDecorations';
import { anchorFromSelection } from './threadAnchors';

/**
 * The comment rail is downstream of exactly one thing: does an anchor made from
 * a selection come back out of the decoration set as a position? Everything the
 * rail does (coordsAtPos, layout, the tether) is meaningless if it doesn't.
 */
function makeEditor(onPositions) {
  const ydoc = new Y.Doc();
  return new Editor({
    extensions: [
      Document,
      Paragraph,
      Text,
      Collaboration.configure({ document: ydoc }),
      ThreadDecorations.configure({ threads: [], onPositions, focusedThreadId: null }),
    ],
  });
}

const thread = (anchor) => ({ id: 't1', status: 'OPEN', kind: 'COMMENT', ...anchor });

describe('ThreadDecorations', () => {
  it('emits a position for a thread anchored to live text', () => {
    const seen = [];
    const editor = makeEditor((p) => seen.push(p));
    editor.commands.setContent('<p>Hello brave new world</p>');

    // "brave" — doc positions are 1-based, so the paragraph's text starts at 1.
    const from = 7;
    const to = 12;
    expect(editor.state.doc.textBetween(from, to)).toBe('brave');

    const anchor = anchorFromSelection(editor, from, to);
    expect(anchor).not.toBeNull();

    setThreadDecorations(editor, { threads: [thread(anchor)] });

    const last = seen[seen.length - 1];
    expect(last.get('t1')).toEqual({ from, to });
    editor.destroy();
  });

  it('keeps the position current when text above the anchor changes', () => {
    const seen = [];
    const editor = makeEditor((p) => seen.push(p));
    editor.commands.setContent('<p>Hello brave new world</p>');

    const anchor = anchorFromSelection(editor, 7, 12);
    setThreadDecorations(editor, { threads: [thread(anchor)] });

    editor.commands.insertContentAt(1, 'XXX');

    const last = seen[seen.length - 1];
    expect(last.get('t1')).toEqual({ from: 10, to: 15 });
    editor.destroy();
  });

  it('omits a thread whose anchored text was deleted', () => {
    const seen = [];
    const editor = makeEditor((p) => seen.push(p));
    editor.commands.setContent('<p>Hello brave new world</p>');

    const anchor = anchorFromSelection(editor, 7, 12);
    setThreadDecorations(editor, { threads: [thread(anchor)] });

    editor.commands.deleteRange({ from: 7, to: 12 });
    setThreadDecorations(editor, { threads: [thread(anchor)] });

    const last = seen[seen.length - 1];
    expect(last.has('t1')).toBe(false);
    editor.destroy();
  });
});
