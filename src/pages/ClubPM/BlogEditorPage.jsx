import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import BlogEditor from '../../components/clubpm/blog/BlogEditor';
import OrbitLoader from '../../components/OrbitLoader';
import { getBlogPost, updateBlogPost, publishBlogPost } from '../../api/clubPmClient';

const STATUS_LABELS = {
  DRAFT: 'Draft',
  SCHEDULED: 'Scheduled',
  PUBLISHED: 'Published',
  ARCHIVED: 'Archived',
};

export default function BlogEditorPage() {
  const { id } = useParams();

  const [post, setPost]         = useState(null);
  const [title, setTitle]       = useState('');
  const [contentJson, setContentJson] = useState(null);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [dirty, setDirty]       = useState(false);
  const [error, setError]       = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getBlogPost(id)
      .then((p) => {
        if (cancelled) return;
        setPost(p);
        setTitle(p.title ?? '');
        setContentJson(p.contentJson ?? null);
      })
      .catch(() => { if (!cancelled) setError('Could not load this post.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const updated = await updateBlogPost(id, { title, contentJson });
      setPost(updated);
      setDirty(false);
      return true;
    } catch {
      toast.error('Save failed');
      return false;
    } finally {
      setSaving(false);
    }
  }, [id, title, contentJson]);

  const handlePublish = useCallback(async () => {
    const ok = await handleSave();
    if (!ok) return;
    try {
      const updated = await publishBlogPost(id);
      setPost(updated);
      toast.success('Published');
    } catch {
      toast.error('Publish failed');
    }
  }, [id, handleSave]);

  if (loading) return <div style={{ padding: 48, display: 'grid', placeItems: 'center' }}><OrbitLoader /></div>;
  if (error) {
    return (
      <div style={{ padding: 48, textAlign: 'center' }}>
        <p style={{ color: 'var(--pm-accent-coral)' }}>{error}</p>
        <Link to="/clubpm/outreach" className="clubpm-btn-primary">Back to Outreach</Link>
      </div>
    );
  }

  return (
    <div className="cpm-blog-editor-page">
      <header className="cpm-blog-editor-header">
        <div className="cpm-blog-editor-header-left">
          <Link to="/clubpm/outreach" className="cpm-blog-back" title="Back to Outreach">
            <i className="fas fa-arrow-left" aria-hidden="true" />
          </Link>
          <span className={`cpm-blog-status cpm-blog-status--${post?.status?.toLowerCase()}`}>
            {STATUS_LABELS[post?.status] ?? post?.status}
          </span>
          {dirty && <span className="cpm-blog-dirty">Unsaved changes</span>}
        </div>
        <div className="cpm-blog-editor-header-actions">
          <button type="button" className="clubpm-btn-secondary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save draft'}
          </button>
          <button type="button" className="clubpm-btn-primary" onClick={handlePublish} disabled={saving}>
            Publish
          </button>
        </div>
      </header>

      <div className="cpm-blog-editor-body">
        <input
          className="cpm-blog-title-input"
          value={title}
          onChange={(e) => { setTitle(e.target.value); setDirty(true); }}
          placeholder="Post title"
        />
        <BlogEditor
          content={contentJson}
          onChange={(json) => { setContentJson(json); setDirty(true); }}
        />
      </div>
    </div>
  );
}
