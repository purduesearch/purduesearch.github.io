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

const MODE_STORAGE_PREFIX = 'clubpm_doc_mode:';

/**
 * The mode is a working preference, not a document property: someone reviewing
 * in Suggesting should still be in Suggesting after a reload. Stored per
 * document, and always re-checked against the access level the server resolved
 * this session — a stored 'editing' must never survive losing edit rights.
 */
export function storedMode(docKey, level) {
  const allowed = modesFor(level);
  try {
    const saved = window.localStorage?.getItem(MODE_STORAGE_PREFIX + docKey);
    if (saved && allowed.includes(saved)) return saved;
  } catch {
    // Private-mode / disabled storage: fall through to the default.
  }
  return defaultMode(level);
}

export function rememberMode(docKey, mode) {
  try {
    window.localStorage?.setItem(MODE_STORAGE_PREFIX + docKey, mode);
  } catch {
    // Nothing to do — the mode still applies for this session.
  }
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

const SUGGESTION_MARKS = ['suggestInsert', 'suggestDelete'];

let counter = 0;
function newSuggestionId(prefix) {
  counter += 1;
  return `sugg-${prefix || 'local'}-${Date.now().toString(36)}-${counter}`;
}

/**
 * The suggestion already under the caret, if any.
 *
 * `appendTransaction` runs per transaction and a transaction is roughly one
 * keystroke, so minting a fresh id each time made typing "hello" into five
 * separate suggestions — five cards in the rail, five things to accept. Joining
 * an adjacent run instead is what actually delivers the "one accept/reject per
 * contiguous burst" this always claimed.
 *
 * Both sides of the position are checked: `$pos.marks()` reports the marks the
 * caret would inherit (the node *before* it), which misses typing at the very
 * start of an existing run.
 */
function adjacentSuggestionId(state, pos) {
  const clamped = Math.min(Math.max(pos, 0), state.doc.content.size);
  const $pos = state.doc.resolve(clamped);
  const candidates = [
    ...$pos.marks(),
    ...($pos.nodeAfter?.marks ?? []),
    ...($pos.nodeBefore?.marks ?? []),
  ];
  const hit = candidates.find(
    (m) => SUGGESTION_MARKS.includes(m.type.name) && m.attrs?.threadId
  );
  return hit?.attrs.threadId ?? null;
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

  // The flag lives in plugin state, NOT in `options`. It used to be written
  // through `editor.extensionManager.extensions.find(...)`, whose `options` is
  // a different object from the one `addProseMirrorPlugins` closes over (see
  // threadDecorations.test.js) — so `appendTransaction` always read the
  // default `false` and Suggesting mode never did anything at all.
  addCommands() {
    return {
      setSuggesting: (enabled) => ({ tr, dispatch }) => {
        if (dispatch) tr.setMeta(suggestingModeKey, { enabled: !!enabled });
        return true;
      },
    };
  },

  addProseMirrorPlugins() {
    const ext = this;

    return [new Plugin({
      key: suggestingModeKey,

      state: {
        init: () => !!ext.options.enabled,
        apply: (tr, enabled) => {
          const meta = tr.getMeta(suggestingModeKey);
          // `setMeta(key, true)` is this plugin marking its OWN output below;
          // only an { enabled } payload is a mode change.
          return typeof meta?.enabled === 'boolean' ? meta.enabled : enabled;
        },
      },

      appendTransaction: (transactions, oldState, newState) => {
        if (!suggestingModeKey.getState(newState)) return null;
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
        // Join the run the caret is already in, so a burst of typing is one
        // suggestion rather than one per keystroke.
        const firstStep = transactions.find((t) => t.docChanged)?.steps?.[0];
        const threadId = (firstStep && adjacentSuggestionId(oldState, firstStep.from))
          || newSuggestionId(ext.options.authorId);

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
