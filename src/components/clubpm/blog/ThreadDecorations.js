import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { resolveAnchor } from './threadAnchors';

export const threadDecorationsKey = new PluginKey('threadDecorations');

/**
 * Renders comment anchors as view-layer decorations resolved from Yjs relative
 * positions. Nothing here touches the document, so a COMMENT-level user on a
 * readOnly connection can still see and create anchors.
 */
export const ThreadDecorations = Extension.create({
  name: 'threadDecorations',

  addOptions() {
    return { threads: [], onPositions: null, focusedThreadId: null };
  },

  addProseMirrorPlugins() {
    const extension = this;

    /**
     * Positions are read back off the decoration set rather than kept in a
     * parallel Map, so they stay correct after ProseMirror maps the set through
     * an edit. Reporting only on rebuild would leave the rail measuring from
     * pre-edit offsets, and every card would drift the moment anyone typed
     * above it.
     */
    const emit = (set) => {
      const positions = new Map();
      for (const deco of set.find()) {
        if (deco.spec?.threadId) positions.set(deco.spec.threadId, { from: deco.from, to: deco.to });
      }
      extension.options.onPositions?.(positions);
    };

    const build = (state) => {
      const decos = [];
      const focusedId = extension.options.focusedThreadId;
      for (const thread of extension.options.threads ?? []) {
        if (thread.status !== 'OPEN') continue;
        const range = resolveAnchor(extension.editor, thread);
        if (!range) continue;                    // orphaned — no decoration
        decos.push(Decoration.inline(
          range.from,
          range.to,
          {
            class: `cpm-blog-comment-hl${thread.id === focusedId ? ' is-focused' : ''}`,
            'data-thread-id': thread.id,
          },
          // The spec is what makes the set self-describing; `emit` and the
          // focus rebuild both read the thread id back out of it.
          { threadId: thread.id },
        ));
      }
      const set = DecorationSet.create(state.doc, decos);
      emit(set);
      return set;
    };

    return [
      new Plugin({
        key: threadDecorationsKey,
        state: {
          init: (_, state) => build(state),
          apply(tr, old, _oldState, newState) {
            // A full recompute is only needed when the thread set, the focused
            // thread, or the Yjs binding changes; ordinary keystrokes just map
            // the existing set, which keeps typing cheap with many threads open.
            if (tr.getMeta(threadDecorationsKey)?.recompute) return build(newState);
            if (!tr.docChanged) return old;
            const mapped = old.map(tr.mapping, tr.doc);
            // `DecorationSet.map` returns the receiver unchanged for an empty
            // set, so an editor with no comments never re-renders the rail.
            if (mapped !== old) emit(mapped);
            return mapped;
          },
        },
        props: {
          decorations(state) { return threadDecorationsKey.getState(state); },
        },
      }),
    ];
  },
});

export default ThreadDecorations;
