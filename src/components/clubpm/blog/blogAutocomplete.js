import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { blogAiComplete } from '../../../api/clubPmClient';

// Manually triggered ghost-text completion (Ctrl/Cmd + \). Manual rather than
// on-pause because every standard-model Gemini caller shares one 30 RPM window;
// this also gets its own cheap-model lane server-side (generateTextFast).
export const autocompleteKey = new PluginKey('blogAutocomplete');

// How much text before the caret to send. Enough for voice and context,
// small enough to keep the call cheap.
const CONTEXT_CHARS = 1500;

export const BlogAutocomplete = Extension.create({
  name: 'blogAutocomplete',

  addOptions() {
    return { docType: 'BLOG_POST', docId: null, enabled: true };
  },

  addProseMirrorPlugins() {
    return [new Plugin({
      key: autocompleteKey,

      state: {
        init: () => ({ pos: null, text: '' }),
        apply(tr, value) {
          const meta = tr.getMeta(autocompleteKey);
          if (meta) return meta;
          // Any document change or cursor move invalidates the suggestion —
          // ghost text left over from an earlier caret position is worse than none.
          if (tr.docChanged || tr.selectionSet) return { pos: null, text: '' };
          return value;
        },
      },

      props: {
        decorations(state) {
          const { pos, text } = autocompleteKey.getState(state);
          if (pos == null || !text) return null;
          const widget = Decoration.widget(pos, () => {
            const span = document.createElement('span');
            span.className = 'cpm-blog-ghost';
            span.textContent = text;
            return span;
          }, { side: 1 });
          return DecorationSet.create(state.doc, [widget]);
        },

        handleKeyDown(view, event) {
          // Never mutate a read-only editor — and never swallow the keystroke either.
          if (!view.editable) return false;
          const { pos, text } = autocompleteKey.getState(view.state);
          if (pos == null || !text) return false;

          if (event.key === 'Tab') {
            event.preventDefault();
            view.dispatch(
              view.state.tr
                .insertText(text, pos)
                .setMeta(autocompleteKey, { pos: null, text: '' }),
            );
            return true;
          }
          if (event.key === 'Escape') {
            event.preventDefault();
            view.dispatch(view.state.tr.setMeta(autocompleteKey, { pos: null, text: '' }));
            return true;
          }
          return false;
        },
      },
    })];
  },

  addKeyboardShortcuts() {
    const options = this.options;

    return {
      'Mod-\\': () => {
        const { editor } = this;
        if (!options.enabled || !options.docId) return false;
        const { state, view } = editor;
        if (!state.selection.empty) return false;

        const pos = state.selection.from;
        const before = state.doc.textBetween(0, pos, '\n\n', ' ').slice(-CONTEXT_CHARS);
        if (before.trim().length < 3) return false;

        blogAiComplete(options.docType, options.docId, before)
          .then(({ completion }) => {
            if (!completion) return;
            // Only show it if the caret has not moved since the request went out.
            if (view.isDestroyed || view.state.selection.from !== pos) return;
            view.dispatch(view.state.tr.setMeta(autocompleteKey, { pos, text: completion }));
          })
          .catch(() => { /* silent: no ghost text is the correct failure mode */ });

        return true;
      },
    };
  },
});

export default BlogAutocomplete;
