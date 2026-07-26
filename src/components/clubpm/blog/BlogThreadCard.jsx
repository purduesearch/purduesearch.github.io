import React, { useState } from 'react';
import toast from 'react-hot-toast';
import {
  setBlogThreadStatus, addBlogThreadComment, deleteBlogThreadComment,
} from '../../../api/clubPmClient';

function when(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/**
 * One review thread. `orphaned` means the marks it anchored to were deleted —
 * the card still renders from the stored anchorText snapshot, but accepting is
 * meaningless because there is nothing left in the document to change.
 */
export default function BlogThreadCard({ thread, editor, canEdit, currentMember, onChanged }) {
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);

  // `editor.storage` is NOT reactive: ThreadPositions reassigns
  // `storage.positions` inside a plugin `view.update`, which React never sees.
  // So `anchor` — and therefore `orphaned` and the quote button's `disabled` —
  // is frozen at the last render of this card. That is by design here (the
  // panel is reopened to refresh, per the task's own verification steps); do
  // not assume liveness when building on top of this.
  const positions = editor?.storage?.blogThreadPositions?.positions;
  const anchor = positions?.get(thread.id);
  const terminal = thread.status === 'ACCEPTED' || thread.status === 'REJECTED';
  const orphaned = !anchor && !terminal;
  const isSuggestion = thread.kind === 'SUGGESTION';

  const run = async (fn) => {
    setBusy(true);
    try { await fn(); onChanged?.(); }
    catch (err) { toast.error(err.message || 'That did not work'); }
    finally { setBusy(false); }
  };

  // Status PATCH first, document mutation only after the server confirms.
  // There is no rollback: the Yjs/Hocuspocus layer has no content authority, so
  // a local transaction is broadcast and persisted no matter what the REST call
  // returns. Mutating first would let a member the server later 403s destroy
  // text in someone else's post with no way back.
  const confirmThen = (status, apply) => run(async () => {
    const updated = await setBlogThreadStatus(thread.id, status);
    if (!updated) throw new Error('The server did not confirm that change');
    apply();
  });

  const accept = () => confirmThen('ACCEPTED', () => {
    editor?.chain().focus().acceptSuggestion(thread.id).run();
  });

  const reject = () => confirmThen('REJECTED', () => {
    editor?.chain().focus().rejectSuggestion(thread.id).run();
  });

  const resolve = () => confirmThen('RESOLVED', () => {
    editor?.chain().focus().removeCommentThread(thread.id).run();
  });

  const scrollTo = () => {
    if (!editor || !anchor) return;
    editor.chain().focus().setTextSelection({ from: anchor.from, to: anchor.to }).scrollIntoView().run();
  };

  const send = () => {
    if (!reply.trim()) return;
    run(async () => { await addBlogThreadComment(thread.id, reply); setReply(''); });
  };

  return (
    <div
      className={[
        'cpm-blog-thread-card',
        isSuggestion ? 'cpm-blog-thread-card--suggestion' : '',
        orphaned ? 'cpm-blog-thread-card--orphan' : '',
      ].filter(Boolean).join(' ')}
    >
      <div className="cpm-blog-thread-head">
        <i className={`fas ${isSuggestion ? 'fa-pen-to-square' : 'fa-comment'}`} aria-hidden="true" />
        <span>{isSuggestion ? 'Suggestion' : 'Comment'}</span>
        {thread.origin === 'AI' && <span className="cpm-blog-thread-badge cpm-blog-thread-badge--ai">AI</span>}
        {thread.status !== 'OPEN' && <span className="cpm-blog-thread-badge">{thread.status.toLowerCase()}</span>}
        {orphaned && <span className="cpm-blog-thread-badge">anchor removed</span>}
        <span style={{ marginLeft: 'auto' }}>{thread.createdBy?.displayName ?? 'Someone'}</span>
      </div>

      <button
        type="button"
        className="cpm-blog-thread-quote"
        onClick={scrollTo}
        disabled={!anchor}
        style={{ display: 'block', textAlign: 'left', background: 'none', border: 0, color: 'inherit', cursor: anchor ? 'pointer' : 'default', font: 'inherit' }}
      >
        “{thread.anchorText}”
      </button>

      {isSuggestion && (
        <div className="cpm-blog-thread-diff">
          <del>{thread.anchorText}</del>
          {thread.replaceWith ? <ins>{thread.replaceWith}</ins> : <ins><em>(delete)</em></ins>}
        </div>
      )}
      {thread.rationale && <p className="cpm-blog-thread-rationale">{thread.rationale}</p>}

      <div className="cpm-blog-thread-comments">
        {(thread.comments ?? []).map((c) => (
          <div key={c.id} className="cpm-blog-thread-comment">
            <div className="cpm-blog-thread-comment-meta">
              {c.author?.displayName ?? 'Someone'} · {when(c.createdAt)}
              {(canEdit || c.authorId === currentMember?.id) && (
                <button
                  type="button"
                  style={{ marginLeft: 6, background: 'none', border: 0, color: 'inherit', cursor: 'pointer', opacity: 0.7 }}
                  aria-label="Delete comment"
                  onClick={() => run(() => deleteBlogThreadComment(thread.id, c.id))}
                >
                  <i className="fas fa-times" aria-hidden="true" />
                </button>
              )}
            </div>
            {c.body}
          </div>
        ))}
      </div>

      {!terminal && (
        <>
          <input
            className="cpm-blog-thread-reply"
            value={reply}
            placeholder="Reply…"
            onChange={(e) => setReply(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); send(); } }}
          />
          <div className="cpm-blog-thread-actions">
            {isSuggestion && canEdit && (
              <>
                <button type="button" className="clubpm-btn-primary" disabled={busy || orphaned} onClick={accept}>
                  <i className="fas fa-check" aria-hidden="true" /> Accept
                </button>
                <button type="button" className="clubpm-btn-secondary" disabled={busy} onClick={reject}>
                  <i className="fas fa-xmark" aria-hidden="true" /> Reject
                </button>
              </>
            )}
            {!isSuggestion && (canEdit || thread.createdById === currentMember?.id) && (
              <button type="button" className="clubpm-btn-secondary" disabled={busy} onClick={resolve}>
                <i className="fas fa-check-double" aria-hidden="true" /> Resolve
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
