import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { listBlogPosts, createBlogPost, deleteBlogPost } from '../../api/clubPmClient';

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

export default function BlogTab() {
  const navigate = useNavigate();
  const [posts, setPosts]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter]   = useState('');
  const [creating, setCreating] = useState(false);

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
        <button className="clubpm-btn-primary" onClick={handleNew} disabled={creating}>
          <i className="fas fa-plus" aria-hidden="true" style={{ marginRight: 6 }} />
          New post
        </button>
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
    </div>
  );
}
