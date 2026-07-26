import React, { useState, useCallback } from 'react';
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

  const selectedText = editor
    ? editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to, ' ')
    : '';

  const reset = useCallback(() => { setMode(null); setBody(''); setReplace(''); }, []);

  const openSuggest = () => { setReplace(selectedText); setMode('suggest'); };

  const submit = async () => {
    if (!editor || !docId) return;
    const { from, to } = editor.state.selection;
    const anchorText = editor.state.doc.textBetween(from, to, ' ');
    if (!anchorText.trim()) { toast.error('Select some text first'); return; }
    if (mode === 'comment' && !body.trim()) { toast.error('Write a comment first'); return; }

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
      if (mode === 'suggest') {
        editor.chain().focus()
          .applySuggestion({ threadId: thread.id, from, to, replace })
          .run();
      } else {
        editor.chain().focus().setCommentThread(thread.id).run();
      }
      onThreadCreated?.(thread);
      reset();
    } catch (err) {
      toast.error(err.message ?? 'Could not save that');
    } finally {
      setBusy(false);
    }
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
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setMode('comment')}>
            <i className="fas fa-comment" aria-hidden="true" /> Comment
          </button>
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={openSuggest}>
            <i className="fas fa-pen-to-square" aria-hidden="true" /> Suggest edit
          </button>
          {canEdit && (
            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => onAskAi?.(selectedText)}>
              <i className="fas fa-wand-magic-sparkles" aria-hidden="true" /> Ask AI
            </button>
          )}
        </div>
      ) : (
        <div className="cpm-blog-bubble-form">
          <p className="cpm-blog-bubble-form-quote">“{selectedText.slice(0, 140)}”</p>
          {mode === 'suggest' && (
            <textarea
              autoFocus
              value={replace}
              onChange={(e) => setReplace(e.target.value)}
              placeholder="Proposed replacement (leave empty to suggest deleting this)"
            />
          )}
          <textarea
            autoFocus={mode === 'comment'}
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
