import { Schema } from '@tiptap/pm/model';
import { findMarkRanges } from './suggestionMarks';

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { content: 'inline*', group: 'block', toDOM: () => ['p', 0] },
    text: { group: 'inline' },
  },
  marks: {
    // Only here to differentiate the markup of two otherwise-identical text
    // nodes: ProseMirror's Fragment joins adjacent text nodes with identical
    // markup at construction time, so without a distinguishing mark the merge
    // branch in findMarkRanges is unreachable from a test.
    bold: {},
    suggestDelete: { attrs: { threadId: {} } },
    suggestInsert: { attrs: { threadId: {} } },
    commentMark: { attrs: { threadId: {} } },
  },
});

// Builds a one-paragraph doc from [text, markName|null, threadId|null] triples.
function docFrom(...pieces) {
  const inline = pieces.map(([text, markName, threadId]) =>
    schema.text(text, markName ? [schema.marks[markName].create({ threadId })] : []));
  return schema.node('doc', null, [schema.node('paragraph', null, inline)]);
}

test('finds a single marked range', () => {
  const doc = docFrom(['keep ', null, null], ['struck', 'suggestDelete', 't1'], [' keep', null, null]);
  // Paragraph content starts at position 1, so "struck" spans 6..12.
  expect(findMarkRanges(doc, 'suggestDelete', 't1')).toEqual([{ from: 6, to: 12 }]);
});

test('ignores the same mark belonging to a different thread', () => {
  const doc = docFrom(['a', 'suggestDelete', 't1'], ['b', 'suggestDelete', 't2']);
  expect(findMarkRanges(doc, 'suggestDelete', 't1')).toEqual([{ from: 1, to: 2 }]);
  expect(findMarkRanges(doc, 'suggestDelete', 't2')).toEqual([{ from: 2, to: 3 }]);
});

test('ignores a different mark type on the same thread', () => {
  const doc = docFrom(['x', 'suggestInsert', 't1']);
  expect(findMarkRanges(doc, 'suggestDelete', 't1')).toEqual([]);
});

test('merges adjacent text nodes carrying the same mark', () => {
  // Two separate text nodes, same mark+thread — must come back as ONE range,
  // otherwise accept/reject would delete in pieces and corrupt positions.
  // "ab" is bold and "cd" is not, so their markup differs and ProseMirror keeps
  // them as two text nodes; both still carry suggestDelete/t1. This is what a
  // suggestion spanning a bolded word looks like in production.
  const del = schema.marks.suggestDelete.create({ threadId: 't1' });
  const paragraph = schema.node('paragraph', null, [
    schema.text('ab', [schema.marks.bold.create(), del]),
    schema.text('cd', [del]),
  ]);
  // Guard: if ProseMirror ever joined these, the merge branch would go untested.
  expect(paragraph.childCount).toBe(2);
  const doc = schema.node('doc', null, [paragraph]);
  expect(findMarkRanges(doc, 'suggestDelete', 't1')).toEqual([{ from: 1, to: 5 }]);
});

test('finds ranges across separate paragraphs', () => {
  const mark = [schema.marks.commentMark.create({ threadId: 't1' })];
  const doc = schema.node('doc', null, [
    schema.node('paragraph', null, [schema.text('aa', mark)]),
    schema.node('paragraph', null, [schema.text('bb', mark)]),
  ]);
  expect(findMarkRanges(doc, 'commentMark', 't1')).toEqual([{ from: 1, to: 3 }, { from: 5, to: 7 }]);
});

test('returns empty for an unknown thread', () => {
  expect(findMarkRanges(docFrom(['a', null, null]), 'commentMark', 'nope')).toEqual([]);
});
