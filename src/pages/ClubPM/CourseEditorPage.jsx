import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import BlogEditor from '../../components/clubpm/blog/BlogEditor';
import BlogAiPanel from '../../components/clubpm/blog/BlogAiPanel';
import CourseSectionRail, { SECTION_KINDS } from '../../components/clubpm/courses/CourseSectionRail';
import CourseQuizBuilder from '../../components/clubpm/courses/CourseQuizBuilder';
import CourseVideoWorkbench from '../../components/clubpm/courses/CourseVideoWorkbench';
import OrbitLoader from '../../components/OrbitLoader';
import { useClubPmAuth } from '../../clubpm/ClubPmAuth';
import {
  getCourse, updateCourse, publishCourse, archiveCourse, deleteCourse,
  createCourseSection, updateCourseSection, deleteCourseSection, reorderCourseSections,
  getCourseCollabWsUrl,
} from '../../api/clubPmClient';

const STATUS_LABELS = {
  DRAFT: 'Draft',
  PUBLISHED: 'Published',
  ARCHIVED: 'Archived',
};

// Publish is the single primary action; every other workflow verb lives in its
// menu, with destructive items separated and confirmed. Mirrors
// BlogEditorPage's PublishMenu, minus Schedule/Unpublish — courses have no
// scheduled-publish endpoint.
function PublishMenu({ status, disabled, onPublish, onArchive, onDelete }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);

  return (
    <span className="cpm-blog-publish-wrap" ref={ref}>
      {status !== 'PUBLISHED' && (
        <button
          type="button"
          className="clubpm-btn-primary cpm-blog-publish-main"
          onClick={onPublish}
          disabled={disabled}
          title="Publish this course to the catalog"
        >
          Publish
        </button>
      )}
      <button
        type="button"
        className={`clubpm-btn-primary cpm-blog-publish-caret${status === 'PUBLISHED' ? ' is-solo' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="More publishing actions"
      >
        <i className="fas fa-chevron-down" aria-hidden="true" />
      </button>

      {open && (
        <div className="cpm-blog-publish-pop" role="menu">
          {status !== 'ARCHIVED' && (
            <button type="button" role="menuitem" onClick={() => { setOpen(false); onArchive(); }}>
              <i className="fas fa-box-archive" aria-hidden="true" /> Archive
            </button>
          )}
          <div className="cpm-blog-publish-sep" />
          <button type="button" role="menuitem" className="is-danger" onClick={() => { setOpen(false); onDelete(); }}>
            <i className="fas fa-trash" aria-hidden="true" /> Delete course
          </button>
        </div>
      )}
    </span>
  );
}

/**
 * Wraps the section's collaborative document. For a VIDEO section it collapses
 * into a `<details>` so the video is the subject of the page and the prose is
 * clearly the supporting note it is.
 *
 * `<details>` keeps its children mounted when closed — which is the point.
 * Conditionally rendering the editor instead would tear down the Hocuspocus
 * provider every time the author collapsed the notes, dropping their presence
 * and forcing a resync on every reopen.
 */
function CourseDocument({ collapsible, children }) {
  if (!collapsible) return children;
  return (
    <details className="pm-course-doc-fold">
      <summary className="pm-course-doc-fold-summary">
        <i className="fas fa-align-left" aria-hidden="true" />
        <span>Notes shown under the video</span>
      </summary>
      <div className="pm-course-doc-fold-body">{children}</div>
    </details>
  );
}

export default function CourseEditorPage() {
  const { id } = useParams();
  const { member } = useClubPmAuth();
  const navigate = useNavigate();

  const [course, setCourse]     = useState(null);
  const [sections, setSections] = useState([]);
  const [selectedSectionId, setSelectedSectionId] = useState(null);
  const [courseTitle, setCourseTitle]   = useState('');
  const [sectionTitle, setSectionTitle] = useState('');
  const [contentJson, setContentJson]   = useState(null);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [dirty, setDirty]       = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [error, setError]       = useState(null);
  const [busyAction, setBusyAction] = useState(false);
  // One slot, one panel. Only the AI panel remains — the settings panel is gone,
  // its contents having moved into the main column — but the arbitration stays
  // because `.cpm-blog-meta-panel` is `position: fixed` against a fixed
  // rectangle, so any second panel added later would silently cover this one.
  const [openPanel, setOpenPanel] = useState(null); // 'ai' | null
  const aiPanelOpen = openPanel === 'ai';
  const [aiSelection, setAiSelection] = useState('');
  const [editorInstance, setEditorInstance] = useState(null);
  // The quiz builder saves questions explicitly, outside the page's autosave, so
  // it reports its own dirtiness for the section-switch guard below.
  const [questionsDirty, setQuestionsDirty] = useState(false);

  // Leaving the AI panel drops any pending selection, whichever way it closes:
  // a stale one forces the next open onto the Selection tab.
  const showPanel = useCallback((panelId) => {
    setOpenPanel((current) => {
      const next = current === panelId ? null : panelId;
      if (next !== 'ai') setAiSelection('');
      return next;
    });
  }, []);

  // Keep the latest editable state in a ref so the debounced autosave always
  // persists current values without re-arming on every keystroke.
  const stateRef = useRef({ courseTitle: '', sectionTitle: '', contentJson: null, sectionId: null });
  stateRef.current = { courseTitle, sectionTitle, contentJson, sectionId: selectedSectionId };
  const autosaveTimer = useRef(null);
  const editorRef = useRef(null);

  const selectedSection = useMemo(
    () => sections.find((s) => s.id === selectedSectionId) ?? null,
    [sections, selectedSectionId]
  );

  // Which kind-specific surface the main column shows. A QUIZ section has no
  // document at all — CoursePlayerPage never renders `contentJson` for that kind
  // — so it gets neither an editor nor the AI panel that operates on one.
  const sectionKind = selectedSection?.kind ?? 'CONTENT';
  const hasDocument = !!selectedSection && sectionKind !== 'QUIZ';

  // Who may edit the document (accept/reject a suggestion, resolve someone
  // else's comment). Mirrors the server's course-access check in
  // backend/src/api/courses.ts so the UI does not offer actions it will refuse.
  const canEditDoc = !!member?.id && (
    member.isAdmin || course?.createdById === member.id || course?.canEdit === true
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getCourse(id)
      .then((c) => {
        if (cancelled) return;
        setCourse(c);
        setCourseTitle(c.title ?? '');
        const list = c.sections ?? [];
        setSections(list);
        setSelectedSectionId((prev) => prev ?? list[0]?.id ?? null);
      })
      .catch(() => { if (!cancelled) setError('Could not load this course.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id]);

  // Switching sections resets the per-section editable state. The body itself
  // arrives over the collab connection (BlogEditor ignores `content` when
  // `postId` is set), so only the title needs seeding here.
  useEffect(() => {
    setSectionTitle(selectedSection?.title ?? '');
    setContentJson(null);
    setDirty(false);
    // The previous section's editor is torn down on switch; holding its instance
    // would leave BlogAiPanel operating on a dead ProseMirror view.
    setEditorInstance(null);
    editorRef.current = null;
  }, [selectedSection?.id, selectedSection?.title]);

  // A quiz section has nothing for the AI panel to act on, so close it rather
  // than leave an empty panel pinned open across the switch.
  useEffect(() => {
    if (!hasDocument) { setOpenPanel(null); setAiSelection(''); }
  }, [hasDocument]);

  const handleSave = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setSaving(true);
    try {
      const { courseTitle: ct, sectionTitle: st, contentJson: cj, sectionId } = stateRef.current;
      const updated = await updateCourse(id, { title: ct });
      setCourse((prev) => ({ ...prev, ...updated }));
      if (sectionId) {
        const patch = { title: st };
        if (cj) patch.contentJson = cj;
        const savedSection = await updateCourseSection(sectionId, patch);
        setSections((prev) => prev.map((s) => (s.id === sectionId ? { ...s, ...savedSection } : s)));
      }
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

  // Debounced autosave for titles + body. When the Yjs collab server is
  // reachable it persists the body on its own store cadence; this REST PATCH is
  // a safety net for when it isn't (WS blocked / proxy misconfigured) so edits
  // still save. It only writes contentJson (never contentYjs), so it can't
  // corrupt the live CRDT, and onLoadDocument prefers contentYjs when present.
  useEffect(() => {
    if (!dirty) return undefined;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => { handleSave({ silent: true }); }, 1500);
    return () => { if (autosaveTimer.current) clearTimeout(autosaveTimer.current); };
  }, [dirty, courseTitle, sectionTitle, handleSave]);

  // Warn before leaving (browser navigation / tab close) with unsaved edits.
  useEffect(() => {
    const onBeforeUnload = (e) => {
      if (!dirty && !questionsDirty) return undefined;
      e.preventDefault();
      e.returnValue = '';
      return '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty, questionsDirty]);

  // Ctrl/Cmd+S saves. The shared page-shortcut registry
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
    if ((dirty || questionsDirty) && !window.confirm('You have unsaved changes. Leave anyway?')) {
      e.preventDefault();
    }
  };

  // ── Section rail actions ───────────────────────────────────

  const handleSelectSection = useCallback(async (sectionId) => {
    if (sectionId === stateRef.current.sectionId) return;
    // Questions live outside the autosave, so leaving with unsaved ones would
    // drop them silently. The autosaved fields need no prompt — they just save.
    if (questionsDirty && !window.confirm('This section has unsaved questions. Leave anyway?')) return;
    if (dirty) await handleSave({ silent: true });
    setQuestionsDirty(false);
    setSelectedSectionId(sectionId);
  }, [dirty, handleSave, questionsDirty]);

  const handleAddSection = useCallback(async (kind) => {
    const meta = SECTION_KINDS[kind] ?? SECTION_KINDS.CONTENT;
    try {
      const created = await createCourseSection(id, { title: `New ${meta.label.toLowerCase()} section`, kind });
      setSections((prev) => [...prev, created]);
      setSelectedSectionId(created.id);
    } catch {
      toast.error('Could not add that section');
    }
  }, [id]);

  const handleUpdateSection = useCallback(async (sectionId, patch) => {
    try {
      const updated = await updateCourseSection(sectionId, patch);
      setSections((prev) => prev.map((s) => (s.id === sectionId ? { ...s, ...updated } : s)));
    } catch {
      toast.error('Could not update that section');
    }
  }, []);

  const handleDeleteSection = useCallback(async (section) => {
    if (!window.confirm(`Delete "${section.title}" and everything in it? This cannot be undone.`)) return;
    try {
      await deleteCourseSection(section.id);
      setSections((prev) => {
        const next = prev.filter((s) => s.id !== section.id);
        if (section.id === stateRef.current.sectionId) setSelectedSectionId(next[0]?.id ?? null);
        return next;
      });
    } catch {
      toast.error('Delete failed');
    }
  }, []);

  // Optimistic reorder, rolled back if the transactional re-index rejects.
  const handleReorderSections = useCallback(async (orderedIds) => {
    const previous = sections;
    const byId = new Map(sections.map((s) => [s.id, s]));
    setSections(orderedIds.map((sid) => byId.get(sid)).filter(Boolean));
    try {
      const fresh = await reorderCourseSections(id, orderedIds);
      if (Array.isArray(fresh)) setSections(fresh);
    } catch {
      setSections(previous);
      toast.error('Reorder failed');
    }
  }, [id, sections]);

  // ── Course-level actions ───────────────────────────────────

  const handlePublish = useCallback(async () => {
    const ok = await handleSave();
    if (!ok) return;
    setBusyAction(true);
    try {
      const updated = await publishCourse(id);
      setCourse((prev) => ({ ...prev, ...updated }));
      toast.success('Published');
    } catch {
      toast.error('Publish failed (a course needs at least one section)');
    } finally {
      setBusyAction(false);
    }
  }, [id, handleSave]);

  const handleArchive = useCallback(async () => {
    setBusyAction(true);
    try {
      const updated = await archiveCourse(id);
      setCourse((prev) => ({ ...prev, ...updated }));
      toast.success('Archived');
    } catch {
      toast.error('Archive failed');
    } finally {
      setBusyAction(false);
    }
  }, [id]);

  const handleDelete = useCallback(async () => {
    if (!window.confirm('Delete this course permanently? Sections, enrollments and progress go with it.')) return;
    setBusyAction(true);
    try {
      await deleteCourse(id);
      toast.success('Course deleted');
      navigate('/clubpm/outreach');
    } catch {
      toast.error('Delete failed (only the author or an admin can).');
      setBusyAction(false);
    }
  }, [id, navigate]);

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
    <div className="cpm-blog-editor-page pm-course-editor">
      <header className="cpm-blog-editor-header">
        <div className="cpm-blog-editor-header-left">
          <Link to="/clubpm/outreach" className="cpm-blog-back" title="Back to Outreach" onClick={guardedNav}>
            <i className="fas fa-arrow-left" aria-hidden="true" />
          </Link>
          <span className={`cpm-blog-status cpm-blog-status--${course?.status?.toLowerCase()}`}>
            {STATUS_LABELS[course?.status] ?? course?.status}
          </span>
          {dirty
            ? <span className="cpm-blog-dirty">Unsaved changes…</span>
            : lastSavedAt && <span className="cpm-blog-saved">Saved {lastSavedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
        </div>
        <div className="cpm-blog-editor-header-actions">
          {/* The AI panel operates on a ProseMirror document, so it appears only
              for the kinds that have one. There is no settings button any more:
              CONTENT has nothing to configure, and VIDEO/QUIZ settings are now
              in the main column rather than behind a slide-over. */}
          {hasDocument && (
            <>
              <div className="cpm-blog-tool-group" role="group" aria-label="Panels">
                <button
                  type="button"
                  className={`cpm-blog-tool-btn${aiPanelOpen ? ' is-active' : ''}`}
                  onClick={() => showPanel('ai')}
                  title="AI assistant"
                  aria-label="AI assistant"
                >
                  <i className="fas fa-wand-magic-sparkles" aria-hidden="true" />
                </button>
              </div>

              <span className="cpm-blog-header-sep" />
            </>
          )}

          {course?.slug && (
            <Link
              // ?preview=1 — unlocks every section and records nothing, so
              // checking your own course does not enrol you in it.
              to={`/clubpm/outreach/courses/${course.slug}/learn?preview=1`}
              className="clubpm-btn-secondary"
              onClick={guardedNav}
              title="Open the learner view"
            >
              <i className="fas fa-eye" aria-hidden="true" />
              <span>Preview</span>
            </Link>
          )}

          <button type="button" className="clubpm-btn-secondary" onClick={() => handleSave()} disabled={saving}>
            <i className="fas fa-floppy-disk" aria-hidden="true" />
            <span>{saving ? 'Saving…' : 'Save draft'}</span>
          </button>

          <PublishMenu
            status={course?.status}
            disabled={saving || busyAction}
            onPublish={handlePublish}
            onArchive={handleArchive}
            onDelete={handleDelete}
          />
        </div>
      </header>

      <div className="pm-course-editor-body">
        <CourseSectionRail
          sections={sections}
          selectedId={selectedSectionId}
          canEdit={canEditDoc}
          onSelect={handleSelectSection}
          onReorder={handleReorderSections}
          onAdd={handleAddSection}
          onUpdate={handleUpdateSection}
          onDelete={handleDeleteSection}
        />

        <div className="cpm-blog-editor-body pm-course-editor-main">
          <input
            className="cpm-blog-title-input pm-course-title-input"
            value={courseTitle}
            onChange={(e) => { setCourseTitle(e.target.value); setDirty(true); }}
            placeholder="Course title"
            aria-label="Course title"
          />

          {selectedSection ? (
            <>
              <input
                className="cpm-blog-title-input pm-course-section-title-input"
                value={sectionTitle}
                onChange={(e) => { setSectionTitle(e.target.value); setDirty(true); }}
                placeholder="Section title"
                aria-label="Section title"
              />

              {/* The main column is the section's real work surface, chosen by
                  kind. Only CONTENT is a document first; VIDEO is a video with
                  optional notes, and QUIZ is a question set with no document. */}
              {sectionKind === 'QUIZ' && (
                <CourseQuizBuilder
                  // Keyed on the section so switching remounts with fresh
                  // question state rather than the previous section's draft.
                  key={selectedSection.id}
                  section={selectedSection}
                  canEdit={canEditDoc}
                  onUpdateSection={handleUpdateSection}
                  onDirtyChange={setQuestionsDirty}
                />
              )}

              {sectionKind === 'VIDEO' && (
                <CourseVideoWorkbench
                  key={selectedSection.id}
                  section={selectedSection}
                  canEdit={canEditDoc}
                  onUpdateSection={handleUpdateSection}
                />
              )}

              {hasDocument && (
                <CourseDocument
                  // Collapsed for VIDEO — the notes are a supporting detail
                  // there, but they still render to learners beneath the player,
                  // so they keep the full collaborative editor.
                  collapsible={sectionKind === 'VIDEO'}
                >
                  <BlogEditor
                    // Keyed on the section id: switching sections must tear down
                    // and rebuild the Hocuspocus provider, not reuse one pointed
                    // at the previous document.
                    key={selectedSection.id}
                    postId={selectedSection.id}
                    collabWsUrl={getCourseCollabWsUrl()}
                    collabUser={{ id: member?.id, name: member?.displayName }}
                    content={null}
                    onChange={(json) => { setContentJson(json); setDirty(true); }}
                    onEditorReady={(ed) => { editorRef.current = ed; setEditorInstance(ed); }}
                    docType="COURSE_SECTION"
                    docId={selectedSection.id}
                    canEditDoc={canEditDoc}
                    onAskAi={(text) => { setAiSelection(text); setOpenPanel('ai'); }}
                  />
                </CourseDocument>
              )}
            </>
          ) : (
            <p className="pm-course-editor-empty" style={{ color: 'var(--pm-text-muted, #9aa)' }}>
              Add a section from the rail to start authoring.
            </p>
          )}
        </div>
      </div>

      {hasDocument && (
        <BlogAiPanel
          editor={editorInstance}
          docType="COURSE_SECTION"
          docId={selectedSection.id}
          title={sectionTitle}
          isOpen={aiPanelOpen}
          onClose={() => { setOpenPanel(null); setAiSelection(''); }}
          initialSelection={aiSelection}
        />
      )}
    </div>
  );
}
