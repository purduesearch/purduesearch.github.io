import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { listBlogPosts, createBlogPost, generateBlogPost, deleteBlogPost } from '../../api/clubPmClient';

const STATUS_FILTERS = [
  { id: '',          label: 'All' },
  { id: 'DRAFT',     label: 'Drafts' },
  { id: 'SCHEDULED', label: 'Scheduled' },
  { id: 'PUBLISHED', label: 'Published' },
  { id: 'ARCHIVED',  label: 'Archived' },
];

function fmt(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Dialog that turns raw text (notes / brief / outline / rough draft) into a
// designed, section-based blog draft via the AI section-plan pipeline.
function GenerateModal({ onClose, onDone }) {
  const [text, setText]         = useState('');
  const [title, setTitle]       = useState('');
  const [guidance, setGuidance] = useState('');
  const [busy, setBusy]         = useState(false);

  // Close on Escape (unless generating) and lock page scroll while open.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !busy) onClose(); };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [busy, onClose]);

  const submit = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      const payload = { text: text.trim() };
      if (title.trim()) payload.title = title.trim();
      if (guidance.trim()) payload.guidance = guidance.trim();
      const postData = await generateBlogPost(payload);
      toast.success('Draft generated');
      onDone(postData);
    } catch {
      toast.error('Could not generate post');
      setBusy(false);
    }
  };

  return createPortal(
    <div
      className="cpm-modal-overlay"
      onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}
    >
      <div
        className="cpm-blog-genmodal"
        role="dialog"
        aria-modal="true"
        aria-label="Generate blog post from text"
      >
        <div className="cpm-blog-genmodal-head">
          <h3><i className="fas fa-wand-magic-sparkles" aria-hidden="true" /> Generate blog post from text</h3>
          <button type="button" className="cpm-blog-genmodal-x" onClick={onClose} disabled={busy} aria-label="Close">
            <i className="fas fa-xmark" aria-hidden="true" />
          </button>
        </div>

        <label className="cpm-blog-genmodal-lab">Title <span>(optional — leave blank to let AI choose)</span></label>
        <input
          className="cpm-blog-genmodal-input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Post title"
          disabled={busy}
        />

        <label className="cpm-blog-genmodal-lab">Your text, notes, or brief</label>
        <textarea
          className="cpm-blog-genmodal-textarea"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste the raw text, meeting notes, an outline, or a rough draft…"
          disabled={busy}
          autoFocus
        />

        <label className="cpm-blog-genmodal-lab">Guidance <span>(optional)</span></label>
        <input
          className="cpm-blog-genmodal-input"
          value={guidance}
          onChange={(e) => setGuidance(e.target.value)}
          placeholder="e.g. announcement tone, focus on the technical challenges"
          disabled={busy}
        />

        <div className="cpm-blog-genmodal-actions">
          <button type="button" className="clubpm-btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className="clubpm-btn-primary" onClick={submit} disabled={busy || !text.trim()}>
            {busy
              ? <><i className="fas fa-spinner fa-spin" aria-hidden="true" style={{ marginRight: 6 }} />Generating…</>
              : <><i className="fas fa-wand-magic-sparkles" aria-hidden="true" style={{ marginRight: 6 }} />Generate</>}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default function BlogTab() {
  const navigate = useNavigate();
  const [posts, setPosts]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter]   = useState('');
  const [creating, setCreating] = useState(false);
  const [showGen, setShowGen] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    listBlogPosts(filter ? `?status=${filter}` : '')
      .then((p) => setPosts(Array.isArray(p) ? p : []))
      .catch(() => setPosts([]))
      .finally(() => setLoading(false));
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const handleNew = async () => {
    setCreating(true);
    try {
      const post = await createBlogPost({ title: 'Untitled post' });
      navigate(`/clubpm/outreach/blog/${post.id}/edit`);
    } catch {
      toast.error('Could not create post');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (e, postId, title) => {
    e.stopPropagation();
    if (!window.confirm(`Delete "${title}"? This cannot be undone.`)) return;
    try {
      await deleteBlogPost(postId);
      setPosts((prev) => prev.filter((p) => p.id !== postId));
      toast.success('Post deleted');
    } catch {
      toast.error('Could not delete post (only the author or an admin can).');
    }
  };

  return (
    <div className="cpm-blog-tab">
      <div className="cpm-blog-tab-header">
        <div className="cpm-blog-filters" role="tablist">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.id || 'all'}
              className={`cpm-blog-filter${filter === f.id ? ' is-active' : ''}`}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="cpm-blog-tab-actions">
          <button className="clubpm-btn-secondary" onClick={() => setShowGen(true)}>
            <i className="fas fa-wand-magic-sparkles" aria-hidden="true" style={{ marginRight: 6 }} />
            Generate from text
          </button>
          <button className="clubpm-btn-primary" data-tour-id="blog.new" onClick={handleNew} disabled={creating}>
            <i className="fas fa-plus" aria-hidden="true" style={{ marginRight: 6 }} />
            New post
          </button>
        </div>
      </div>

      {loading ? (
        <p style={{ color: 'var(--pm-accent-teal)', padding: 24 }}>Loading…</p>
      ) : posts.length === 0 ? (
        <div className="cpm-blog-empty">
          <i className="fas fa-newspaper" aria-hidden="true" />
          <p>No posts yet. Create one, or use “Expand to blog” on a submission.</p>
        </div>
      ) : (
        <ul className="cpm-blog-list">
          {posts.map((p) => (
            <li key={p.id} className="cpm-blog-list-row" onClick={() => navigate(`/clubpm/outreach/blog/${p.id}/edit`)}>
              {p.coverImageUrl
                ? <img src={p.coverImageUrl} alt="" className="cpm-blog-list-cover" />
                : <div className="cpm-blog-list-cover cpm-blog-list-cover--empty"><i className="fas fa-image" aria-hidden="true" /></div>}
              <div className="cpm-blog-list-main">
                <span className="cpm-blog-list-title">{p.title}</span>
                <span className="cpm-blog-list-meta">
                  Updated {fmt(p.updatedAt)}
                  {p.readingTimeMin ? ` · ${p.readingTimeMin} min read` : ''}
                </span>
              </div>
              <span className={`cpm-blog-status cpm-blog-status--${p.status?.toLowerCase()}`}>{p.status}</span>
              {p.status === 'PUBLISHED' && (
                <a
                  className="cpm-blog-list-view"
                  href={`/blog/${p.slug}`}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  title="View published post"
                >
                  <i className="fas fa-external-link-alt" aria-hidden="true" />
                </a>
              )}
              <button
                type="button"
                className="cpm-blog-list-delete"
                title="Delete post"
                aria-label="Delete post"
                onClick={(e) => handleDelete(e, p.id, p.title)}
              >
                <i className="fas fa-trash" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {showGen && (
        <GenerateModal
          onClose={() => setShowGen(false)}
          onDone={(post) => { setShowGen(false); navigate(`/clubpm/outreach/blog/${post.id}/edit`); }}
        />
      )}
    </div>
  );
}
