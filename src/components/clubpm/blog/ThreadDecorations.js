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
    return { threads: [], onPositions: null };
  },

  addProseMirrorPlugins() {
    const extension = this;

    const build = (state) => {
      const decos = [];
      const positions = new Map();
      for (const thread of extension.options.threads ?? []) {
        if (thread.status !== 'OPEN') continue;
        const range = resolveAnchor(extension.editor, thread);
        if (!range) continue;                    // orphaned — no decoration
        positions.set(thread.id, range);
        decos.push(Decoration.inline(range.from, range.to, {
          class: 'cpm-blog-comment-hl',
          'data-thread-id': thread.id,
        }));
      }
      extension.options.onPositions?.(positions);
      return DecorationSet.create(state.doc, decos);
    };

    return [
      new Plugin({
        key: threadDecorationsKey,
        state: {
          init: (_, state) => build(state),
          apply(tr, old, _oldState, newState) {
            // A full recompute is only needed when the thread set changes or
            // Yjs syncs; ordinary keystrokes just map the existing set, which
            // keeps typing cheap with many threads open.
            if (tr.getMeta(threadDecorationsKey)?.recompute) return build(newState);
            return tr.docChanged ? old.map(tr.mapping, tr.doc) : old;
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
