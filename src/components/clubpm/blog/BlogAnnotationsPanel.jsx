import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import CommentThread from '../CommentThread';
import { get, addBlogAuthor, removeBlogAuthor } from '../../../api/clubPmClient';

// Multi-author manager: add/remove BlogAuthor rows and set each author's role.
function AuthorsManager({ post, currentMemberId, onAuthorsChanged }) {
  const [allMembers, setAllMembers] = useState([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!pickerOpen || allMembers.length > 0) return;
    get('/api/members').then(setAllMembers).catch(() => {});
  }, [pickerOpen, allMembers.length]);

  const authors = post?.authors ?? [];
  const authorMemberIds = new Set(authors.map((a) => a.memberId));
  const candidates = allMembers.filter((m) => !authorMemberIds.has(m.id));

  const handleAdd = async (memberId) => {
    setBusy(true);
    try {
      await addBlogAuthor(post.id, memberId, 'author');
      toast.success('Author added');
      onAuthorsChanged();
      setPickerOpen(false);
    } catch (err) {
      toast.error(err.message ?? 'Failed to add author');
    } finally {
      setBusy(false);
    }
  };

  const handleRoleChange = async (memberId, role) => {
    try {
      await addBlogAuthor(post.id, memberId, role);
      onAuthorsChanged();
    } catch (err) {
      toast.error(err.message ?? 'Failed to update role');
    }
  };

  const handleRemove = async (memberId) => {
    if (memberId === post.createdById) {
      toast.error('The post creator cannot be removed');
      return;
    }
    setBusy(true);
    try {
      await removeBlogAuthor(post.id, memberId);
      toast.success('Author removed');
      onAuthorsChanged();
    } catch (err) {
      toast.error(err.message ?? 'Failed to remove author');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="cpm-blog-authors">
      <div className="cpm-blog-authors-header">
        <h3 className="cpm-blog-authors-title">
          <i className="fas fa-user-group" aria-hidden="true" /> Authors
        </h3>
        <button type="button" className="clubpm-btn-secondary" onClick={() => setPickerOpen((v) => !v)}>
          <i className="fas fa-plus" aria-hidden="true" /> Add
        </button>
      </div>

      {pickerOpen && (
        <div className="cpm-blog-authors-picker">
          {candidates.length === 0 ? (
            <p className="cpm-blog-snippet-empty">No other members to add.</p>
          ) : (
            <ul className="cpm-blog-authors-picker-list">
              {candidates.map((m) => (
                <li key={m.id}>
                  <button type="button" disabled={busy} onClick={() => handleAdd(m.id)}>
                    {m.avatarUrl ? <img src={m.avatarUrl} alt="" /> : <i className="fas fa-user" aria-hidden="true" />}
                    {m.displayName}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <ul className="cpm-blog-authors-list">
        <li className="cpm-blog-authors-item">
          {post?.createdBy?.avatarUrl
            ? <img src={post.createdBy.avatarUrl} alt="" className="cpm-blog-authors-avatar" />
            : <span className="cpm-blog-authors-avatar cpm-blog-authors-avatar--empty"><i className="fas fa-user" aria-hidden="true" /></span>}
          <span className="cpm-blog-authors-name">{post?.createdBy?.displayName ?? 'Unknown'}</span>
          <span className="cpm-blog-authors-role">creator</span>
        </li>
        {authors.map((a) => (
          <li key={a.id} className="cpm-blog-authors-item">
            {a.member?.avatarUrl
              ? <img src={a.member.avatarUrl} alt="" className="cpm-blog-authors-avatar" />
              : <span className="cpm-blog-authors-avatar cpm-blog-authors-avatar--empty"><i className="fas fa-user" aria-hidden="true" /></span>}
            <span className="cpm-blog-authors-name">{a.member?.displayName ?? 'Unknown'}</span>
            <input
              className="cpm-blog-authors-role-input"
              defaultValue={a.role ?? 'author'}
              onBlur={(e) => {
                const role = e.target.value.trim() || 'author';
                if (role !== a.role) handleRoleChange(a.memberId, role);
              }}
            />
            <button
              type="button"
              className="cpm-blog-authors-remove"
              onClick={() => handleRemove(a.memberId)}
              aria-label={`Remove ${a.member?.displayName ?? 'author'}`}
            >
              <i className="fas fa-times" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Side panel hosting draft review notes (internal annotations reusing the
// OutreachComment thread) and the multi-author manager.
export default function BlogAnnotationsPanel({ post, currentMember, isOpen, onClose, onAuthorsChanged }) {
  const refreshAuthors = useCallback(() => { onAuthorsChanged?.(); }, [onAuthorsChanged]);

  if (!isOpen) return null;

  return (
    <aside className="cpm-blog-meta-panel" aria-label="Draft annotations">
      <div className="cpm-blog-meta-panel-header">
        <h2 className="cpm-blog-meta-panel-title">
          <i className="fas fa-users-viewfinder" aria-hidden="true" /> Review &amp; Authors
        </h2>
        <button type="button" className="cpm-blog-meta-panel-close" onClick={onClose} aria-label="Close review panel">
          <i className="fas fa-times" aria-hidden="true" />
        </button>
      </div>

      <div className="cpm-blog-meta-panel-body">
        <AuthorsManager post={post} currentMemberId={currentMember?.id} onAuthorsChanged={refreshAuthors} />

        <div className="cpm-blog-meta-field">
          <CommentThread
            endpoint={`/api/blog/posts/${post.id}/annotations`}
            title="Review notes"
            currentMember={currentMember}
          />
        </div>
      </div>
    </aside>
  );
}
