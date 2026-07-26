import { Mark, Extension, mergeAttributes } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';

// Every review mark carries only the id of its Postgres thread. Bodies,
// status and rationale live in the DB (see backend/src/services/
// blogThreadService.ts); the mark is purely the anchor, which is what lets
// Yjs drift it correctly as other people edit around it.
const threadIdAttribute = {
  threadId: {
    default: null,
    parseHTML: (el) => el.getAttribute('data-thread-id'),
    renderHTML: (attrs) => (attrs.threadId ? { 'data-thread-id': attrs.threadId } : {}),
  },
};

// excludes: '' lets several instances of the same mark type coexist on one
// range, so two people can comment on overlapping text.
function reviewMark({ name, tagAttr, className }) {
  return Mark.create({
    name,
    inclusive: false,
    excludes: '',
    addAttributes() { return threadIdAttribute; },
    parseHTML() { return [{ tag: `span[${tagAttr}]` }]; },
    renderHTML({ HTMLAttributes }) {
      return ['span', mergeAttributes(HTMLAttributes, { [tagAttr]: '', class: className }), 0];
    },
  });
}

export const CommentMark = reviewMark({
  name: 'commentMark', tagAttr: 'data-comment-thread', className: 'cpm-blog-comment-mark',
});
export const SuggestInsert = reviewMark({
  name: 'suggestInsert', tagAttr: 'data-suggest-insert', className: 'cpm-blog-sugg-ins',
});
export const SuggestDelete = reviewMark({
  name: 'suggestDelete', tagAttr: 'data-suggest-del', className: 'cpm-blog-sugg-del',
});

/**
 * All ranges in `doc` carrying `markName` with the given threadId.
 * Adjacent text nodes sharing the mark are merged into one range — splitting
 * them would make accept/reject delete in pieces and invalidate later positions.
 * @returns {Array<{from: number, to: number}>} in document order
 */
export function findMarkRanges(doc, markName, threadId) {
  const ranges = [];
  doc.descendants((node, pos) => {
    if (!node.isText) return;
    const hit = node.marks.find((m) => m.type.name === markName && m.attrs.threadId === threadId);
    if (!hit) return;
    const from = pos;
    const to = pos + node.nodeSize;
    const last = ranges[ranges.length - 1];
    if (last && last.to === from) last.to = to;
    else ranges.push({ from, to });
  });
  return ranges;
}

export const SuggestionCommands = Extension.create({
  name: 'suggestionCommands',

  addCommands() {
    return {
      setCommentThread: (threadId) => ({ commands }) =>
        commands.setMark('commentMark', { threadId }),

      removeCommentThread: (threadId) => ({ tr, state, dispatch }) => {
        const type = state.schema.marks.commentMark;
        const ranges = findMarkRanges(state.doc, 'commentMark', threadId);
        if (ranges.length === 0) return false;
        ranges.forEach(({ from, to }) => {
          tr.removeMark(from, to, type.create({ threadId }));
        });
        if (dispatch) dispatch(tr);
        return true;
      },

      /**
       * Turns [from,to] into a suggestion: the existing text is struck through
       * with suggestDelete, and `replace` (when non-empty) is inserted straight
       * after it carrying suggestInsert. One transaction, so Yjs ships it to
       * co-editors atomically.
       */
      applySuggestion: ({ threadId, from, to, replace }) => ({ tr, state, dispatch }) => {
        const delType = state.schema.marks.suggestDelete;
        const insType = state.schema.marks.suggestInsert;
        if (!delType || !insType || from >= to) return false;
        tr.addMark(from, to, delType.create({ threadId }));
        if (replace && replace.trim()) {
          tr.insert(to, state.schema.text(replace, [insType.create({ threadId })]));
        }
        if (dispatch) dispatch(tr);
        return true;
      },

      /** Accept: drop the struck text, keep the insertion as plain text. */
      acceptSuggestion: (threadId) => ({ tr, state, dispatch }) => {
        const dels = findMarkRanges(state.doc, 'suggestDelete', threadId);
        const ins  = findMarkRanges(state.doc, 'suggestInsert', threadId);
        if (dels.length === 0 && ins.length === 0) return false;
        // Unwrap the kept insertions first, then delete back-to-front so
        // earlier deletions never invalidate later positions.
        ins.forEach(({ from, to }) => {
          tr.removeMark(from, to, state.schema.marks.suggestInsert.create({ threadId }));
        });
        [...dels].reverse().forEach(({ from, to }) => { tr.delete(from, to); });
        if (dispatch) dispatch(tr);
        return true;
      },

      /** Reject: restore the struck text, drop the insertion. */
      rejectSuggestion: (threadId) => ({ tr, state, dispatch }) => {
        const dels = findMarkRanges(state.doc, 'suggestDelete', threadId);
        const ins  = findMarkRanges(state.doc, 'suggestInsert', threadId);
        if (dels.length === 0 && ins.length === 0) return false;
        dels.forEach(({ from, to }) => {
          tr.removeMark(from, to, state.schema.marks.suggestDelete.create({ threadId }));
        });
        [...ins].reverse().forEach(({ from, to }) => { tr.delete(from, to); });
        if (dispatch) dispatch(tr);
        return true;
      },
    };
  },
});

// Keeps a live threadId → position index so the panel can scroll to a thread
// and tell an orphaned thread (anchor deleted) from a live one.
const threadPositionsKey = new PluginKey('blogThreadPositions');

export const ThreadPositions = Extension.create({
  name: 'blogThreadPositions',

  addStorage() {
    return { positions: new Map() };
  },

  addProseMirrorPlugins() {
    const storage = this.storage;
    const reindex = (doc) => {
      const map = new Map();
      doc.descendants((node, pos) => {
        if (!node.isText) return;
        node.marks.forEach((m) => {
          const name = m.type.name;
          if (name !== 'commentMark' && name !== 'suggestInsert' && name !== 'suggestDelete') return;
          const id = m.attrs.threadId;
          if (!id) return;
          const existing = map.get(id);
          const from = existing ? Math.min(existing.from, pos) : pos;
          const to = existing ? Math.max(existing.to, pos + node.nodeSize) : pos + node.nodeSize;
          map.set(id, { from, to, markName: existing?.markName ?? name });
        });
      });
      storage.positions = map;
    };

    return [new Plugin({
      key: threadPositionsKey,
      view: () => ({ update: (view) => reindex(view.state.doc) }),
      state: {
        init: (_config, state) => { reindex(state.doc); return null; },
        apply: () => null,
      },
    })];
  },
});

/** Everything to splice into blogExtensions(). */
export function suggestionExtensions() {
  return [CommentMark, SuggestInsert, SuggestDelete, SuggestionCommands, ThreadPositions];
}
