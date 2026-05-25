import React, { useState, useEffect, useRef } from 'react';
import { get, post } from '../../api/clubPmClient';
import toast from 'react-hot-toast';

// ── Relative time helper ──────────────────────────────────────

function relativeTime(dateStr) {
  if (!dateStr) return '';
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  if (diffMs < 0) return 'just now';
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 30) return 'just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  const diffMo = Math.floor(diffDay / 30);
  if (diffMo < 12) return `${diffMo}mo ago`;
  const diffYr = Math.floor(diffMo / 12);
  return `${diffYr}y ago`;
}

// ── @mention highlighter ──────────────────────────────────────

function CommentText({ body }) {
  if (!body) return null;
  // Split on @word boundaries, rendering each @mention with a highlight span
  const parts = body.split(/(@\w+)/g);
  return (
    <span className="pm-comment-text">
      {parts.map((part, i) =>
        /^@\w+$/.test(part)
          ? <span key={i} className="pm-comment-mention">{part}</span>
          : part
      )}
    </span>
  );
}

// ── Avatar helper ─────────────────────────────────────────────

function CommentAvatar({ member }) {
  if (member?.avatarUrl) {
    return <img src={member.avatarUrl} alt="" className="pm-comment-avatar" />;
  }
  const initials = (member?.displayName ?? '?').slice(0, 2).toUpperCase();
  return <div className="pm-comment-avatar pm-comment-avatar--initials">{initials}</div>;
}

// ── ReplyForm ─────────────────────────────────────────────────

function ReplyForm({ submissionId, parentId, currentMember, onReplyPosted, onCancel }) {
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const textareaRef = useRef(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmed = body.trim();
    if (!trimmed) return;
    setSubmitting(true);
    try {
      const newReply = await post(`/api/outreach/submissions/${submissionId}/comments`, {
        body: trimmed,
        parentId,
      });
      onReplyPosted(newReply, parentId);
      setBody('');
    } catch (err) {
      toast.error(err.message ?? 'Failed to post reply.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      handleSubmit(e);
    }
    if (e.key === 'Escape') {
      onCancel();
    }
  };

  return (
    <form className="pm-comment-reply-form" onSubmit={handleSubmit}>
      <CommentAvatar member={currentMember} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <textarea
          ref={textareaRef}
          className="pm-comment-input"
          rows={2}
          placeholder="Write a reply… (Ctrl+Enter to post, Esc to cancel)"
          value={body}
          onChange={e => setBody(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={submitting}
        />
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            type="submit"
            className="pm-comment-submit"
            disabled={submitting || !body.trim()}
          >
            {submitting ? 'Posting…' : 'Reply'}
          </button>
          <button
            type="button"
            className="pm-comment-cancel-btn"
            onClick={onCancel}
            disabled={submitting}
          >
            Cancel
          </button>
        </div>
      </div>
    </form>
  );
}

// ── CommentItem ───────────────────────────────────────────────

function CommentItem({ comment, submissionId, currentMember, onReplyPosted, isReply }) {
  const [showReplyForm, setShowReplyForm] = useState(false);
  const author = comment.author ?? comment.member ?? null;

  const handleReplyPosted = (newReply, parentId) => {
    onReplyPosted(newReply, parentId);
    setShowReplyForm(false);
  };

  return (
    <li className={`pm-comment-item${isReply ? ' pm-comment-item--reply' : ''}`}>
      <CommentAvatar member={author} />
      <div className="pm-comment-body">
        <div className="pm-comment-meta">
          <span className="pm-comment-author">{author?.displayName ?? 'Unknown'}</span>
          <span className="pm-comment-time">{relativeTime(comment.createdAt)}</span>
        </div>
        <CommentText body={comment.body} />
        {!isReply && (
          <div className="pm-comment-actions">
            <button
              className="pm-comment-reply-btn"
              onClick={() => setShowReplyForm(v => !v)}
              aria-expanded={showReplyForm}
            >
              <i className="fas fa-reply" aria-hidden="true" />
              {' '}Reply
            </button>
          </div>
        )}
        {showReplyForm && (
          <ReplyForm
            submissionId={submissionId}
            parentId={comment.id}
            currentMember={currentMember}
            onReplyPosted={handleReplyPosted}
            onCancel={() => setShowReplyForm(false)}
          />
        )}
        {/* Render replies (one level only) */}
        {Array.isArray(comment.replies) && comment.replies.length > 0 && (
          <ul className="pm-comment-list pm-comment-list--replies">
            {comment.replies.map(reply => (
              <CommentItem
                key={reply.id}
                comment={reply}
                submissionId={submissionId}
                currentMember={currentMember}
                onReplyPosted={onReplyPosted}
                isReply
              />
            ))}
          </ul>
        )}
      </div>
    </li>
  );
}

// ── CommentThread ─────────────────────────────────────────────

export default function CommentThread({ submissionId, currentMember }) {
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!submissionId) return;
    setLoading(true);
    get(`/api/outreach/submissions/${submissionId}/comments`)
      .then(data => setComments(Array.isArray(data) ? data : []))
      .catch(err => toast.error(err.message ?? 'Failed to load comments.'))
      .finally(() => setLoading(false));
  }, [submissionId]);

  // Called when a new reply is posted — insert it under the correct parent
  const handleReplyPosted = (newReply, parentId) => {
    setComments(prev =>
      prev.map(c => {
        if (c.id !== parentId) return c;
        return { ...c, replies: [...(c.replies ?? []), newReply] };
      })
    );
  };

  const handleCompose = async (e) => {
    e.preventDefault();
    const trimmed = body.trim();
    if (!trimmed) return;
    setSubmitting(true);
    try {
      const newComment = await post(`/api/outreach/submissions/${submissionId}/comments`, { body: trimmed });
      setComments(prev => [{ ...newComment, replies: [] }, ...prev]);
      setBody('');
    } catch (err) {
      toast.error(err.message ?? 'Failed to post comment.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      handleCompose(e);
    }
  };

  // Count top-level comments + replies for the heading
  const totalCount = comments.reduce((sum, c) => sum + 1 + (c.replies?.length ?? 0), 0);

  return (
    <div className="pm-comment-thread">
      <div className="pm-comment-thread-title">
        <i className="fas fa-comment-alt" aria-hidden="true" style={{ marginRight: 6 }} />
        Comments{totalCount > 0 ? ` (${totalCount})` : ''}
      </div>

      {loading ? (
        <p className="pm-comment-loading">Loading comments…</p>
      ) : comments.length === 0 ? (
        <p className="pm-comment-empty">No comments yet. Be the first to comment.</p>
      ) : (
        <ul className="pm-comment-list">
          {comments.map(comment => (
            <CommentItem
              key={comment.id}
              comment={comment}
              submissionId={submissionId}
              currentMember={currentMember}
              onReplyPosted={handleReplyPosted}
              isReply={false}
            />
          ))}
        </ul>
      )}

      {/* Compose new top-level comment */}
      <form className="pm-comment-compose" onSubmit={handleCompose}>
        <CommentAvatar member={currentMember} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <textarea
            className="pm-comment-input"
            rows={3}
            placeholder="Add a comment… (Ctrl+Enter to post)"
            value={body}
            onChange={e => setBody(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={submitting}
          />
          <button
            type="submit"
            className="pm-comment-submit"
            disabled={submitting || !body.trim()}
          >
            {submitting ? 'Posting…' : 'Post'}
          </button>
        </div>
      </form>
    </div>
  );
}
