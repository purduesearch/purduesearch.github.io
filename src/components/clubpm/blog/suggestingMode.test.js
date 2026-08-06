import { Editor } from '@tiptap/core';
import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import { suggestionExtensions } from './suggestionMarks';
import { modesFor, defaultMode, SuggestingMode } from './SuggestingMode';

// COMMENT users ride a readOnly connection, so their suggestions — which are
// marks, and therefore document writes — would be dropped. Suggesting requires
// EDIT. Commenting is orthogonal to the mode, exactly as in Google Docs.
test('VIEW gets viewing only', () => {
  expect(modesFor('VIEW')).toEqual(['viewing']);
  expect(defaultMode('VIEW')).toBe('viewing');
});

test('COMMENT gets viewing only, not suggesting', () => {
  expect(modesFor('COMMENT')).toEqual(['viewing']);
  expect(defaultMode('COMMENT')).toBe('viewing');
});

test('EDIT gets all three modes and defaults to editing', () => {
  expect(modesFor('EDIT')).toEqual(['editing', 'suggesting', 'viewing']);
  expect(defaultMode('EDIT')).toBe('editing');
});

test('OWNER matches EDIT', () => {
  expect(modesFor('OWNER')).toEqual(['editing', 'suggesting', 'viewing']);
});

// ── Behaviour ────────────────────────────────────────────────
// The tests above are pure-function checks and stayed green while the mode was
// completely inert: setSuggesting wrote to an `options` object that the running
// plugin did not share, so `appendTransaction` always saw `enabled: false`.
// These exercise the command end to end.
describe('setSuggesting', () => {
  const makeEditor = () => new Editor({
    extensions: [
      Document, Paragraph, Text,
      ...suggestionExtensions(),
      SuggestingMode.configure({ enabled: false, authorId: 'm1' }),
    ],
    content: '<p>Hello world</p>',
  });

  it('marks typed text as an insertion once enabled', () => {
    const editor = makeEditor();
    editor.commands.setSuggesting(true);
    editor.commands.insertContentAt(6, 'brave ');

    const marks = [];
    editor.state.doc.descendants((node) => {
      node.marks.forEach((m) => marks.push(m.type.name));
    });
    expect(marks).toContain('suggestInsert');
    editor.destroy();
  });

  it('leaves typed text alone while disabled', () => {
    const editor = makeEditor();
    editor.commands.insertContentAt(6, 'brave ');

    const marks = [];
    editor.state.doc.descendants((node) => {
      node.marks.forEach((m) => marks.push(m.type.name));
    });
    expect(marks).toEqual([]);
    editor.destroy();
  });

  it('restores deleted text struck through instead of removing it', () => {
    const editor = makeEditor();
    editor.commands.setSuggesting(true);
    editor.commands.deleteRange({ from: 7, to: 12 });   // "world"

    expect(editor.state.doc.textContent).toContain('world');
    const marks = [];
    editor.state.doc.descendants((node) => {
      node.marks.forEach((m) => marks.push(m.type.name));
    });
    expect(marks).toContain('suggestDelete');
    editor.destroy();
  });

  it('can be turned back off', () => {
    const editor = makeEditor();
    editor.commands.setSuggesting(true);
    editor.commands.setSuggesting(false);
    editor.commands.insertContentAt(6, 'brave ');

    const marks = [];
    editor.state.doc.descendants((node) => {
      node.marks.forEach((m) => marks.push(m.type.name));
    });
    expect(marks).toEqual([]);
    editor.destroy();
  });
});
