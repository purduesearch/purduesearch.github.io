import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import { ReplaceStep } from '@tiptap/pm/transform';
import { ySyncPluginKey } from '@tiptap/y-tiptap';

/**
 * Which document modes a resolved access level may use, in display order.
 *
 * COMMENT deliberately gets Viewing ONLY — never Suggesting. Suggestions are
 * marks, and marks are document writes; a COMMENT user rides a readOnly
 * Hocuspocus connection, so their suggestions would be silently dropped by
 * MessageReceiver. Offering a mode that does nothing is worse than not
 * offering it. Commenting is orthogonal to the mode, exactly as in Google
 * Docs — a COMMENT user sits in Viewing with the comment affordances live.
 */
export function modesFor(level) {
  if (level === 'EDIT' || level === 'OWNER') return ['editing', 'suggesting', 'viewing'];
  return ['viewing'];
}

export function defaultMode(level) {
  return (level === 'EDIT' || level === 'OWNER') ? 'editing' : 'viewing';
}

export const MODE_LABELS = {
  editing: 'Editing',
  suggesting: 'Suggesting',
  viewing: 'Viewing',
};

export const MODE_ICONS = {
  editing: 'fa-pen',
  suggesting: 'fa-pen-to-square',
  viewing: 'fa-eye',
};

export const suggestingModeKey = new PluginKey('blogSuggestingMode');

/** Ids are per-edit-run, so one accept/reject covers a contiguous typing burst. */
let counter = 0;
function newSuggestionId(prefix) {
  counter += 1;
  return `sugg-${prefix || 'local'}-${Date.now().toString(36)}-${counter}`;
}

/**
 * True when every piece of the slice is inline. Structural deletions (a whole
 * paragraph, a section node, a table row) cannot be re-inserted as struck-through
 * text without changing the document's shape, so they are left as real deletions
 * rather than being faked into something accept/reject could not undo.
 */
function isInlineSlice(slice) {
  if (slice.openStart !== 0 || slice.openEnd !== 0) return false;
  let inline = true;
  slice.content.forEach((node) => { if (!node.isInline) inline = false; });
  return inline;
}

/**
 * Suggesting mode.
 *
 * While `enabled`, the user's own edits never destroy text: insertions are
 * re-marked `suggestInsert`, and deletions are undone and re-marked
 * `suggestDelete`, leaving the original text in place. Accept/reject then run
 * through `SuggestionCommands` in ./suggestionMarks.js — this extension defines
 * no marks of its own.
 *
 * Options:
 *   enabled  — boolean; flip with editor.commands.setSuggesting(bool)
 *   authorId — member id, used only to make suggestion ids readable
 */
export const SuggestingMode = Extension.create({
  name: 'suggestingMode',

  addOptions() {
    return { enabled: false, authorId: null };
  },

  addCommands() {
    return {
      setSuggesting: (enabled) => ({ editor }) => {
        editor.extensionManager.extensions
          .find((e) => e.name === 'suggestingMode').options.enabled = !!enabled;
        return true;
      },
    };
  },

  addProseMirrorPlugins() {
    const ext = this;

    return [new Plugin({
      key: suggestingModeKey,

      appendTransaction: (transactions, oldState, newState) => {
        if (!ext.options.enabled) return null;
        if (!transactions.some((t) => t.docChanged)) return null;
        // Remote Yjs updates and our own rewrite must pass through untouched —
        // re-marking a co-editor's text would attribute their edit to us and
        // re-marking our own output would loop.
        if (transactions.some((t) => t.getMeta(ySyncPluginKey) || t.getMeta(suggestingModeKey))) {
          return null;
        }

        const insType = newState.schema.marks.suggestInsert;
        const delType = newState.schema.marks.suggestDelete;
        if (!insType || !delType) return null;

        const tr = newState.tr;
        let touched = false;
        const threadId = newSuggestionId(ext.options.authorId);

        for (const source of transactions) {
          if (!source.docChanged) continue;
          // Only plain replacements are rewritten. ReplaceAroundStep (lift,
          // wrap, list changes) and mark steps change structure or formatting,
          // not text, so they are left alone.
          if (!source.steps.every((s) => s instanceof ReplaceStep)) continue;

          for (let i = 0; i < source.steps.length; i += 1) {
            const step = source.steps[i];
            const before = source.docs[i];
            const { from, to, slice } = step;
            // Where this step's result landed in the final document: past the
            // remaining steps of its own transaction, then past anything we
            // have already appended.
            const rest = source.mapping.slice(i + 1);
            const mapOut = (pos) => tr.mapping.map(rest.map(pos));

            const insStart = mapOut(from);
            const insEnd = mapOut(from + slice.size);
            if (slice.size > 0 && insEnd > insStart) {
              tr.addMark(insStart, insEnd, insType.create({ threadId }));
              touched = true;
            }

            if (to > from) {
              const deleted = before.slice(from, to);
              if (!isInlineSlice(deleted)) continue;
              // Put the deleted text back, struck through, ahead of whatever
              // replaced it — the reading order a reviewer expects.
              tr.insert(insStart, deleted.content);
              tr.addMark(insStart, insStart + deleted.content.size, delType.create({ threadId }));
              touched = true;
            }
          }
        }

        if (!touched) return null;
        // The caret was mapped through our re-insertion, so it would otherwise
        // sit before the restored text instead of after the user's typing.
        const head = tr.mapping.map(newState.selection.head);
        tr.setSelection(TextSelection.create(tr.doc, Math.min(head, tr.doc.content.size)));
        tr.setMeta(suggestingModeKey, true);
        tr.setMeta('addToHistory', false);
        return tr;
      },
    })];
  },
});

export default SuggestingMode;
