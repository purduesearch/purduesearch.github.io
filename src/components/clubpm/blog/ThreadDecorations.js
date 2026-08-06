import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { resolveAnchor } from './threadAnchors';

export const threadDecorationsKey = new PluginKey('threadDecorations');

/**
 * Renders comment anchors as view-layer decorations resolved from Yjs relative
 * positions. Nothing here touches the document, so a COMMENT-level user on a
 * readOnly connection can still see and create anchors.
 *
 * The thread set arrives through transaction meta — see `setThreadDecorations`.
 * It deliberately does NOT arrive by mutating `extension.options`: the object
 * reachable via `editor.extensionManager.extensions.find(...)` is not the one
 * the running plugin closed over (verified in threadDecorations.test.js), so
 * writes to it never reach `build` and every comment silently resolved to no
 * decoration at all.
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

    const build = (state, threads, focusedId) => {
      const decos = [];
      for (const thread of threads ?? []) {
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
          init: (_, state) => ({
            set: build(state, extension.options.threads, extension.options.focusedThreadId),
            threads: extension.options.threads ?? [],
            focusedThreadId: extension.options.focusedThreadId ?? null,
          }),
          apply(tr, old, _oldState, newState) {
            // A full recompute is only needed when the thread set or the
            // focused thread changes; ordinary keystrokes just map the existing
            // set, which keeps typing cheap with many threads open.
            const meta = tr.getMeta(threadDecorationsKey);
            if (meta) {
              const threads = meta.threads ?? old.threads;
              const focusedThreadId = 'focusedThreadId' in meta ? meta.focusedThreadId : old.focusedThreadId;
              return { set: build(newState, threads, focusedThreadId), threads, focusedThreadId };
            }
            if (!tr.docChanged) return old;
            const mapped = old.set.map(tr.mapping, tr.doc);
            // `DecorationSet.map` returns the receiver unchanged for an empty
            // set, so an editor with no comments never re-renders the rail.
            if (mapped !== old.set) emit(mapped);
            return { ...old, set: mapped };
          },
        },
        props: {
          decorations(state) { return threadDecorationsKey.getState(state)?.set; },
        },
      }),
    ];
  },
});

/**
 * Push the current thread set (and which one is focused) into the editor.
 * Anchors resolve against the Yjs binding, so callers must re-send after the
 * document syncs as well as whenever the threads change.
 */
export function setThreadDecorations(editor, { threads, focusedThreadId = null }) {
  if (!editor || editor.isDestroyed) return;
  editor.view.dispatch(
    editor.state.tr.setMeta(threadDecorationsKey, { threads, focusedThreadId })
  );
}

export default ThreadDecorations;
