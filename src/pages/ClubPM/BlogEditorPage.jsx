import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import BlogEditor from '../../components/clubpm/blog/BlogEditor';
import RevisionHistoryDrawer from '../../components/clubpm/blog/RevisionHistoryDrawer';
import BlogMetaPanel from '../../components/clubpm/blog/BlogMetaPanel';
import BlogAnnotationsPanel from '../../components/clubpm/blog/BlogAnnotationsPanel';
import BlogPreviewFrame from '../../components/clubpm/blog/BlogPreviewFrame';
import OrbitLoader from '../../components/OrbitLoader';
import ApprovalChips from '../../components/clubpm/ApprovalChips';
import { useClubPmAuth } from '../../clubpm/ClubPmAuth';
import {
  getBlogPost, updateBlogPost, publishBlogPost,
  scheduleBlogPost, unpublishBlogPost, archiveBlogPost, get, deleteBlogPost,
} from '../../api/clubPmClient';

const STATUS_LABELS = {
  DRAFT: 'Draft',
  SCHEDULED: 'Scheduled',
  PUBLISHED: 'Published',
  ARCHIVED: 'Archived',
};

export default function BlogEditorPage() {
  const { id } = useParams();
  const { member } = useClubPmAuth();
  const navigate = useNavigate();

  const [post, setPost]         = useState(null);
  const [title, setTitle]       = useState('');
  const [contentJson, setContentJson] = useState(null);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [dirty, setDirty]       = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [error, setError]       = useState(null);
  const [approval, setApproval] = useState(null); // { required, approvals, complete } or null
  const [scheduledAtInput, setScheduledAtInput] = useState('');
  const [busyAction, setBusyAction] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);
  const [metaPanelOpen, setMetaPanelOpen] = useState(false);
  const [reviewPanelOpen, setReviewPanelOpen] = useState(false);
  const [theme, setTheme] = useState(null);

  // Keep the latest editable state in a ref so the debounced autosave always
  // persists current values without re-arming on every keystroke.
  const stateRef = useRef({ title: '', contentJson: null });
  stateRef.current = { title, contentJson };
  const autosaveTimer = useRef(null);
  const editorRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getBlogPost(id)
      .then((p) => {
        if (cancelled) return;
        setPost(p);
        setTitle(p.title ?? '');
        setContentJson(p.contentJson ?? null);
        setTheme(p.theme ?? null);
      })
      .catch(() => { if (!cancelled) setError('Could not load this post.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id]);

  // Blog posts created via "Expand to blog" carry sourceSubmissionId — reuse the
  // outreach submission's approval workflow to gate Publish when sign-off is required.
  useEffect(() => {
    const sourceId = post?.sourceSubmissionId;
    if (!sourceId) { setApproval(null); return undefined; }
    let cancelled = false;
    get(`/api/outreach/submissions/${sourceId}/approvals`)
      .then((data) => { if (!cancelled) setApproval(data); })
      .catch(() => { if (!cancelled) setApproval(null); });
    return () => { cancelled = true; };
  }, [post?.sourceSubmissionId]);

  const approvalPending = !!approval && approval.required?.length > 0 && !approval.complete;

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

  const handleThemeChange = useCallback((next) => {
    setTheme(next);
    updateBlogPost(id, { theme: next }).catch(() => {});
  }, [id]);

  // Debounced autosave for title + body. When the Yjs collab server is
  // reachable it persists the body on its own store cadence; this REST PATCH is
  // a safety net for when it isn't (WS blocked / proxy misconfigured) so edits
  // still save. It only writes contentJson (never contentYjs), so it can't
  // corrupt the live CRDT, and onLoadDocument prefers contentYjs when present —
  // meaning collab stays authoritative when up, and this wins only when it's down.
  useEffect(() => {
    if (!dirty) return undefined;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => { handleSave({ silent: true }); }, 1500);
    return () => { if (autosaveTimer.current) clearTimeout(autosaveTimer.current); };
  }, [dirty, title, handleSave]);

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

  // Ctrl/Cmd+S saves the draft. The shared page-shortcut registry
  // (src/clubpm/ShortcutsRegistry.jsx) deliberately ignores modifier-key
  // combos, so this needs its own listener rather than useKeyboardShortcuts.
  useEffect(() => {
    const onKeyDown = (e) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod || e.key.toLowerCase() !== 's') return;
      e.preventDefault();
      handleSave();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleSave]);

  const guardedNav = (e) => {
    if (dirty && !window.confirm('You have unsaved changes. Leave anyway?')) {
      e.preventDefault();
    }
  };

  const handlePublish = useCallback(async () => {
    if (approvalPending) { toast.error('Awaiting approval before this post can publish'); return; }
    const ok = await handleSave();
    if (!ok) return;
    setBusyAction(true);
    try {
      const updated = await publishBlogPost(id);
      setPost(updated);
      toast.success('Published');
    } catch {
      toast.error('Publish failed');
    } finally {
      setBusyAction(false);
    }
  }, [id, handleSave, approvalPending]);

  const handleSchedule = useCallback(async () => {
    if (approvalPending) { toast.error('Awaiting approval before this post can be scheduled'); return; }
    if (!scheduledAtInput) { toast.error('Pick a date and time first'); return; }
    const ok = await handleSave();
    if (!ok) return;
    setBusyAction(true);
    try {
      const updated = await scheduleBlogPost(id, new Date(scheduledAtInput).toISOString());
      setPost(updated);
      toast.success('Scheduled');
    } catch {
      toast.error('Scheduling failed');
    } finally {
      setBusyAction(false);
    }
  }, [id, handleSave, approvalPending, scheduledAtInput]);

  const handleUnpublish = useCallback(async () => {
    setBusyAction(true);
    try {
      const updated = await unpublishBlogPost(id);
      setPost(updated);
      toast.success('Unpublished');
    } catch {
      toast.error('Unpublish failed');
    } finally {
      setBusyAction(false);
    }
  }, [id]);

  const handleArchive = useCallback(async () => {
    setBusyAction(true);
    try {
      const updated = await archiveBlogPost(id);
      setPost(updated);
      toast.success('Archived');
    } catch {
      toast.error('Archive failed');
    } finally {
      setBusyAction(false);
    }
  }, [id]);

  const handleDelete = useCallback(async () => {
    if (!window.confirm('Delete this post permanently? This cannot be undone.')) return;
    setBusyAction(true);
    try {
      await deleteBlogPost(id);
      toast.success('Post deleted');
      navigate('/clubpm/outreach');
    } catch {
      toast.error('Delete failed (only the author or an admin can).');
      setBusyAction(false);
    }
  }, [id, navigate]);

  // Passed to BlogMetaPanel: `patch` set → PATCH + merge; `patch` null with
  // `already` set → merge an already-fetched post (e.g. from setBlogTaxonomy).
  const handleMetaUpdate = useCallback(async (patch, already) => {
    if (!patch) {
      if (already) setPost((prev) => ({ ...prev, ...already }));
      return already;
    }
    const updated = await updateBlogPost(id, patch);
    setPost((prev) => ({ ...prev, ...updated }));
    return updated;
  }, [id]);

  const handleRestored = (updated) => {
    setPost(updated);
    setTitle(updated.title ?? '');
    setContentJson(updated.contentJson ?? null);
    setDirty(false);
    setLastSavedAt(new Date());
  };

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
          {post?.status === 'SCHEDULED' && post?.scheduledAt && (
            <span className="cpm-blog-saved">for {new Date(post.scheduledAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
          )}
          {dirty
            ? <span className="cpm-blog-dirty">Unsaved changes…</span>
            : lastSavedAt && <span className="cpm-blog-saved">Saved {lastSavedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
          {approvalPending && <span className="cpm-blog-status cpm-blog-status--scheduled">Awaiting approval</span>}
        </div>
        <div className="cpm-blog-editor-header-actions">
          <button
            type="button"
            className={`clubpm-btn-secondary${previewMode ? ' is-active' : ''}`}
            onClick={() => setPreviewMode((v) => !v)}
            title="Preview as it will appear on the public site"
          >
            <i className={`fas ${previewMode ? 'fa-pen' : 'fa-eye'}`} aria-hidden="true" style={{ marginRight: 6 }} />
            {previewMode ? 'Edit' : 'Preview'}
          </button>
          <button type="button" className="clubpm-btn-secondary" onClick={() => setHistoryOpen(true)} title="Revision history">
            <i className="fas fa-clock-rotate-left" aria-hidden="true" />
          </button>
          <button
            type="button"
            className={`clubpm-btn-secondary${metaPanelOpen ? ' is-active' : ''}`}
            onClick={() => setMetaPanelOpen((v) => !v)}
            title="Metadata & SEO"
          >
            <i className="fas fa-sliders-h" aria-hidden="true" />
          </button>
          <button
            type="button"
            className={`clubpm-btn-secondary${reviewPanelOpen ? ' is-active' : ''}`}
            onClick={() => setReviewPanelOpen((v) => !v)}
            title="Review notes & authors"
          >
            <i className="fas fa-users-viewfinder" aria-hidden="true" />
          </button>
          <button type="button" className="clubpm-btn-secondary" onClick={() => handleSave()} disabled={saving}>
            {saving ? 'Saving…' : 'Save draft'}
          </button>
          {post?.status !== 'ARCHIVED' && (
            <>
              <input
                type="datetime-local"
                className="cpm-blog-schedule-input"
                value={scheduledAtInput}
                onChange={(e) => setScheduledAtInput(e.target.value)}
                title="Schedule for"
              />
              <button type="button" className="clubpm-btn-secondary" onClick={handleSchedule} disabled={busyAction || saving || approvalPending}>
                Schedule
              </button>
            </>
          )}
          {post?.status === 'PUBLISHED' && (
            <button type="button" className="clubpm-btn-secondary" onClick={handleUnpublish} disabled={busyAction}>
              Unpublish
            </button>
          )}
          {post?.status !== 'ARCHIVED' && (
            <button type="button" className="clubpm-btn-secondary" onClick={handleArchive} disabled={busyAction}>
              Archive
            </button>
          )}
          {post?.status !== 'PUBLISHED' && (
            <button
              type="button"
              className="clubpm-btn-primary"
              onClick={handlePublish}
              disabled={saving || busyAction || approvalPending}
              title={approvalPending ? 'Awaiting approval' : undefined}
            >
              Publish
            </button>
          )}
          <button
            type="button"
            className="clubpm-btn-secondary cpm-blog-delete-btn"
            onClick={handleDelete}
            disabled={busyAction}
            title="Delete post"
          >
            <i className="fas fa-trash" aria-hidden="true" style={{ marginRight: 6 }} />
            Delete
          </button>
        </div>
      </header>

      {approval?.required?.length > 0 && (
        <div className="cpm-blog-approval-row">
          <ApprovalChips
            submissionId={post.sourceSubmissionId}
            currentMemberId={member?.id}
            isAdmin={!!member?.isAdmin}
            onAdvanced={() => setApproval((prev) => (prev ? { ...prev, complete: true } : prev))}
          />
        </div>
      )}

      <div className="cpm-blog-editor-body">
        {previewMode ? (
          <BlogPreviewFrame postId={id} title={title} contentJson={contentJson} />
        ) : (
          <input
            className="cpm-blog-title-input"
            value={title}
            onChange={(e) => { setTitle(e.target.value); setDirty(true); }}
            placeholder="Post title"
          />
        )}
        <div style={previewMode ? { display: 'none' } : undefined}>
          <BlogEditor
            key={id}
            postId={id}
            collabUser={{ id: member?.id, name: member?.displayName }}
            content={contentJson}
            onChange={(json) => { setContentJson(json); setDirty(true); }}
            onEditorReady={(ed) => { editorRef.current = ed; }}
            theme={theme}
            onThemeChange={handleThemeChange}
          />
        </div>
      </div>

      {historyOpen && (
        <RevisionHistoryDrawer
          postId={id}
          onClose={() => setHistoryOpen(false)}
          onRestored={handleRestored}
        />
      )}

      <BlogMetaPanel
        post={post}
        title={title}
        isOpen={metaPanelOpen}
        onClose={() => setMetaPanelOpen(false)}
        onUpdate={handleMetaUpdate}
      />

      {reviewPanelOpen && (
        <BlogAnnotationsPanel
          post={post}
          currentMember={member}
          isOpen={reviewPanelOpen}
          onClose={() => setReviewPanelOpen(false)}
          onAuthorsChanged={() => { getBlogPost(id).then(setPost).catch(() => {}); }}
        />
      )}
    </div>
  );
}
