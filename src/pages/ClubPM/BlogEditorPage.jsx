import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [error, setError]       = useState(null);

  // Keep the latest editable state in a ref so the debounced autosave always
  // persists current values without re-arming on every keystroke.
  const stateRef = useRef({ title: '', contentJson: null });
  stateRef.current = { title, contentJson };
  const autosaveTimer = useRef(null);

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

  const handleSave = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setSaving(true);
    try {
      const { title: t, contentJson: c } = stateRef.current;
      const updated = await updateBlogPost(id, { title: t, contentJson: c });
      setPost((prev) => ({ ...prev, ...updated }));
      setDirty(false);
      setLastSavedAt(new Date());
      return true;
    } catch {
      if (!silent) toast.error('Save failed');
      return false;
    } finally {
      if (!silent) setSaving(false);
    }
  }, [id]);

  // Debounced autosave — the critical "never lose work" path.
  useEffect(() => {
    if (!dirty) return undefined;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => { handleSave({ silent: true }); }, 1500);
    return () => { if (autosaveTimer.current) clearTimeout(autosaveTimer.current); };
  }, [dirty, title, contentJson, handleSave]);

  // Warn before leaving (browser navigation / tab close) with unsaved edits.
  useEffect(() => {
    const onBeforeUnload = (e) => {
      if (!dirty) return undefined;
      e.preventDefault();
      e.returnValue = '';
      return '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  const guardedNav = (e) => {
    if (dirty && !window.confirm('You have unsaved changes. Leave anyway?')) {
      e.preventDefault();
    }
  };

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
          <Link to="/clubpm/outreach" className="cpm-blog-back" title="Back to Outreach" onClick={guardedNav}>
            <i className="fas fa-arrow-left" aria-hidden="true" />
          </Link>
          <span className={`cpm-blog-status cpm-blog-status--${post?.status?.toLowerCase()}`}>
            {STATUS_LABELS[post?.status] ?? post?.status}
          </span>
          {dirty
            ? <span className="cpm-blog-dirty">Unsaved changes…</span>
            : lastSavedAt && <span className="cpm-blog-saved">Saved {lastSavedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
        </div>
        <div className="cpm-blog-editor-header-actions">
          <button type="button" className="clubpm-btn-secondary" onClick={() => handleSave()} disabled={saving}>
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
