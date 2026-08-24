import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import toast from 'react-hot-toast';
import { EditorContent, useEditor } from '@tiptap/react';
import { listBlogRevisions, rollbackBlogRevision, renameBlogRevision } from '../../../api/clubPmClient';
import { blogExtensions } from './BlogEditor';

function RevisionPreview({ revision }) {
  const editor = useEditor({
    extensions: blogExtensions(),
    content: revision.contentJson ?? { type: 'doc', content: [{ type: 'paragraph' }] },
    editable: false,
  }, [revision.id]);

  return (
    <div className="cpm-blog-revision-preview">
      <h2 className="cpm-blog-revision-preview-title">{revision.title}</h2>
      <EditorContent editor={editor} className="cpm-blog-editor-surface" />
    </div>
  );
}

// The blog endpoints, used when no `api` prop is given. A course section keeps
// its own history at a different URL but the identical shape, so it passes its
// three functions in rather than forking this component.
const BLOG_API = {
  list: listBlogRevisions,
  rename: renameBlogRevision,
  rollback: rollbackBlogRevision,
};

// Drawer for viewing / restoring past snapshots of a document's content.
// Opened from the editor header; "View" renders a read-only copy of the
// snapshot in place, "Restore" rolls the live document back to it.
//
// `postId` is the owning document's id — a blog post, or a course section when
// `api` points at the course endpoints.
export default function RevisionHistoryDrawer({ postId, onClose, onRestored, api = BLOG_API, label = 'post' }) {
  const [revisions, setRevisions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [restoringId, setRestoringId] = useState(null);
  // Snapshots are taken automatically before every publish and rollback, so the
  // list gets long fast. Naming one is how a member marks the handful that
  // matter; this filter is how they find them again.
  const [namedOnly, setNamedOnly] = useState(false);
  const [renamingId, setRenamingId] = useState(null);
  const [draftName, setDraftName] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.list(postId)
      .then((list) => { if (!cancelled) setRevisions(Array.isArray(list) ? list : []); })
      .catch((err) => { if (!cancelled) setError(err?.message ?? 'Failed to load revisions'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [postId, api]);

  const startRename = (rev) => { setRenamingId(rev.id); setDraftName(rev.name ?? ''); };

  const commitRename = async (rev) => {
    const next = draftName.trim();
    setRenamingId(null);
    if (next === (rev.name ?? '')) return;
    // Optimistic: the row is a label, and a failed rename puts the old one back
    // rather than leaving the list blanked while the request is in flight.
    setRevisions((rows) => rows.map((r) => (r.id === rev.id ? { ...r, name: next || null } : r)));
    try {
      await api.rename(postId, rev.id, next);
    } catch (err) {
      setRevisions((rows) => rows.map((r) => (r.id === rev.id ? { ...r, name: rev.name ?? null } : r)));
      toast.error(err?.message ?? 'Could not rename this version');
    }
  };

  const handleRestore = async (revision) => {
    if (!window.confirm(`Restore the ${label} to the "${revision.name || revision.title}" snapshot from ${new Date(revision.createdAt).toLocaleString()}? The current version will be saved as a new snapshot first.`)) return;
    setRestoringId(revision.id);
    try {
      const updated = await api.rollback(postId, revision.id);
      toast.success('Restored');
      onRestored?.(updated);
      onClose();
    } catch (err) {
      toast.error(err?.message ?? 'Restore failed');
    } finally {
      setRestoringId(null);
    }
  };

  const shown = namedOnly ? revisions.filter((r) => r.name) : revisions;

  return createPortal(
    <div className="cpm-blog-snippet-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="cpm-blog-revision-modal" role="dialog" aria-label="Revision history">
        <div className="cpm-blog-snippet-header">
          <span><i className="fas fa-clock-rotate-left" aria-hidden="true" style={{ marginRight: 8 }} />Revision history</span>
          <button type="button" onClick={onClose} aria-label="Close" className="cpm-blog-snippet-close">
            <i className="fas fa-times" aria-hidden="true" />
          </button>
        </div>

        <div className="cpm-blog-revision-body">
          <div className="cpm-blog-revision-list-col">
            {error && <p className="cpm-gh-error">{error}</p>}
            {!loading && revisions.length > 0 && (
              <label className="cpm-blog-revision-filter">
                <input
                  type="checkbox"
                  checked={namedOnly}
                  onChange={(e) => setNamedOnly(e.target.checked)}
                />
                Named versions only
              </label>
            )}
            {loading ? (
              <div className="cpm-blog-snippet-empty">Loading…</div>
            ) : revisions.length === 0 ? (
              <div className="cpm-blog-snippet-empty">No snapshots yet — one is saved automatically before each publish or rollback.</div>
            ) : shown.length === 0 ? (
              <div className="cpm-blog-snippet-empty">No named versions yet — name a snapshot to pin it here.</div>
            ) : (
              <ul className="cpm-blog-revision-list">
                {shown.map((rev) => (
                  <li key={rev.id} className={`cpm-blog-revision-item${viewing?.id === rev.id ? ' is-active' : ''}`}>
                    <button type="button" className="cpm-blog-revision-item-main" onClick={() => setViewing(rev)}>
                      {rev.author?.avatarUrl
                        ? <img src={rev.author.avatarUrl} alt="" className="cpm-blog-revision-avatar" />
                        : <span className="cpm-blog-revision-avatar cpm-blog-revision-avatar--empty"><i className="fas fa-user" aria-hidden="true" /></span>}
                      <span className="cpm-blog-revision-item-text">
                        {/* A name, once given, is the label people look for. The
                            timestamp never goes away — it is what actually
                            distinguishes two snapshots from the same day. */}
                        <span className="cpm-blog-revision-item-title">
                          {rev.name || rev.title}
                          {rev.name && <i className="fas fa-bookmark cpm-blog-revision-named" aria-label="Named version" />}
                        </span>
                        <span className="cpm-blog-revision-item-meta">
                          {rev.author?.displayName ?? 'Unknown'} · {new Date(rev.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </span>
                    </button>
                    {renamingId === rev.id ? (
                      <input
                        className="cpm-blog-revision-rename"
                        autoFocus
                        value={draftName}
                        placeholder="Name this version…"
                        onChange={(e) => setDraftName(e.target.value)}
                        onBlur={() => commitRename(rev)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') { e.preventDefault(); commitRename(rev); }
                          if (e.key === 'Escape') { e.preventDefault(); setRenamingId(null); }
                        }}
                      />
                    ) : (
                      <button
                        type="button"
                        className="cpm-blog-revision-rename-btn"
                        onClick={() => startRename(rev)}
                        title={rev.name ? 'Rename this version' : 'Name this version'}
                        aria-label={rev.name ? 'Rename this version' : 'Name this version'}
                      >
                        <i className="fas fa-pen" aria-hidden="true" />
                      </button>
                    )}
                    <button
                      type="button"
                      className="clubpm-btn-secondary cpm-blog-revision-restore"
                      onClick={() => handleRestore(rev)}
                      disabled={restoringId === rev.id}
                    >
                      {restoringId === rev.id ? 'Restoring…' : 'Restore'}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="cpm-blog-revision-view-col">
            {viewing
              ? <RevisionPreview revision={viewing} />
              : <div className="cpm-blog-snippet-empty">Select a snapshot to preview it here.</div>}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
