import React, { useState, useCallback, useRef, useEffect } from 'react';
import { BubbleMenu } from '@tiptap/react/menus';
import toast from 'react-hot-toast';
import { createBlogThread } from '../../../api/clubPmClient';

// Floating actions on a non-empty selection. Comment and Suggest are open to
// any member; Ask AI is author-only (see the permission table in the spec) —
// which also bounds Gemini spend to the people who own the post.
export default function BlogSelectionBubble({ editor, docType, docId, canEdit, onThreadCreated, onAskAi }) {
  const [mode, setMode] = useState(null); // null | 'comment' | 'suggest'
  const [body, setBody] = useState('');
  const [replace, setReplace] = useState('');
  const [busy, setBusy] = useState(false);
  // Snapshot of the selected text taken when the form opens. Read from the
  // editor on demand rather than closed over at render: useEditor does not
  // re-render on every transaction, so a render-time value can lag the real
  // selection.
  const [quote, setQuote] = useState('');

  // The range the thread is about, kept current across the create request.
  // { from, to, invalid } — see trackRange below.
  const pendingRange = useRef(null);
  const trackerRef = useRef(null);

  const readSelection = useCallback(() => {
    if (!editor) return { from: 0, to: 0, text: '' };
    const { from, to } = editor.state.selection;
    return { from, to, text: editor.state.doc.textBetween(from, to, ' ') };
  }, [editor]);

  const reset = useCallback(() => {
    setMode(null); setBody(''); setReplace(''); setQuote('');
  }, []);

  const openComment = () => { setQuote(readSelection().text); setMode('comment'); };

  const openSuggest = () => {
    const { text } = readSelection();
    setQuote(text);
    setReplace(text);
    setMode('suggest');
  };

  const askAi = () => { onAskAi?.(readSelection().text); };

  // Maps the pending range through every transaction that lands while the POST
  // is in flight — local typing AND remote Yjs updates both arrive as
  // transactions, so this is what keeps the anchor on the original words.
  // Bias matches the marks' `inclusive: false`: content inserted exactly at
  // `from` falls outside the range (assoc 1), and content inserted at `to`
  // likewise (assoc -1).
  const trackRange = useCallback(({ transaction }) => {
    const range = pendingRange.current;
    if (!range || range.invalid || !transaction.docChanged) return;
    range.from = transaction.mapping.mapResult(range.from, 1).pos;
    range.to = transaction.mapping.mapResult(range.to, -1).pos;
    // The anchored text was deleted out from under us. Better to leave the
    // thread anchorless (the panel renders it as an orphan) than to mark text
    // the reviewer never selected.
    if (range.from >= range.to) range.invalid = true;
  }, []);

  // Never leave the listener attached if the bubble unmounts mid-request.
  useEffect(() => () => {
    if (editor && trackerRef.current) editor.off('transaction', trackerRef.current);
  }, [editor]);

  const submit = async () => {
    if (!editor || !docId) return;
    const { from, to, text: anchorText } = readSelection();
    if (!anchorText.trim()) { toast.error('Select some text first'); return; }
    if (mode === 'comment' && !body.trim()) { toast.error('Write a comment first'); return; }

    pendingRange.current = { from, to, invalid: false };
    trackerRef.current = trackRange;
    editor.on('transaction', trackRange);

    setBusy(true);
    try {
      const thread = await createBlogThread(docType, docId, {
        kind: mode === 'suggest' ? 'SUGGESTION' : 'COMMENT',
        anchorText,
        body,
        ...(mode === 'suggest' ? { replaceWith: replace } : {}),
      });
      // Persist first, then anchor: a mark pointing at a thread that failed to
      // save would render as a permanently orphaned annotation.
      const range = pendingRange.current;
      const docSize = editor.state.doc.content.size;
      const usable = !!range && !range.invalid
        && range.from >= 0 && range.from < range.to && range.to <= docSize;

      if (!usable) {
        toast.error('That text changed while saving — the thread was created without an anchor');
      } else if (mode === 'suggest') {
        editor.chain().focus()
          .applySuggestion({ threadId: thread.id, from: range.from, to: range.to, replace })
          .run();
      } else {
        // setCommentThread applies setMark to the selection, so point the
        // selection at the mapped range first rather than trusting whatever
        // happens to be selected now.
        editor.chain().focus()
          .setTextSelection({ from: range.from, to: range.to })
          .setCommentThread(thread.id)
          .run();
      }
      onThreadCreated?.(thread);
      reset();
    } catch (err) {
      toast.error(err.message ?? 'Could not save that');
    } finally {
      editor.off('transaction', trackRange);
      trackerRef.current = null;
      pendingRange.current = null;
      setBusy(false);
    }
  };

  const onFormKeyDown = (e) => {
    if (e.key === 'Escape' && !busy) { e.preventDefault(); e.stopPropagation(); reset(); }
  };

  if (!editor) return null;

  return (
    <BubbleMenu
      editor={editor}
      shouldShow={({ state }) => !state.selection.empty}
      options={{ placement: 'top' }}
    >
      {mode === null ? (
        <div className="cpm-blog-bubble">
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={openComment}>
            <i className="fas fa-comment" aria-hidden="true" /> Comment
          </button>
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={openSuggest}>
            <i className="fas fa-pen-to-square" aria-hidden="true" /> Suggest edit
          </button>
          {canEdit && (
            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={askAi}>
              <i className="fas fa-wand-magic-sparkles" aria-hidden="true" /> Ask AI
            </button>
          )}
        </div>
      ) : (
        <div className="cpm-blog-bubble-form" onKeyDown={onFormKeyDown}>
          <p className="cpm-blog-bubble-form-quote">“{quote.slice(0, 140)}”</p>
          {mode === 'suggest' && (
            <textarea
              autoFocus
              aria-label="Proposed replacement text"
              value={replace}
              onChange={(e) => setReplace(e.target.value)}
              placeholder="Proposed replacement (leave empty to suggest deleting this)"
            />
          )}
          <textarea
            autoFocus={mode === 'comment'}
            aria-label={mode === 'suggest' ? 'Reason for this suggestion (optional)' : 'Your comment'}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={mode === 'suggest' ? 'Why? (optional)' : 'Your comment'}
          />
          <div className="cpm-blog-bubble-form-actions">
            <button type="button" className="clubpm-btn-secondary" onClick={reset} disabled={busy}>Cancel</button>
            <button type="button" className="clubpm-btn-primary" onClick={submit} disabled={busy}>
              {busy ? 'Saving…' : mode === 'suggest' ? 'Suggest' : 'Comment'}
            </button>
          </div>
        </div>
      )}
    </BubbleMenu>
  );
}
