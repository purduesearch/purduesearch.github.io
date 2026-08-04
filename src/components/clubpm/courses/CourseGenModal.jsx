import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import CourseOutlineReview from './CourseOutlineReview';
import {
  listBlogPosts,
  startCourseGen,
  getCourseGenJob,
  saveCourseGenOutline,
  runCourseGen,
  cancelCourseGen,
} from '../../../api/clubPmClient';

// AI course generation, as three screens in one modal driven by the job status.
//
//   (no job)        brief    — prompt + reference + source posts
//   OUTLINING       spinner  — one model call, seconds
//   AWAITING_REVIEW review   — the editable outline; nothing has been written yet
//   GENERATING      progress — one model call per section, minutes
//   DONE / FAILED   outcome
//
// The work runs in the API process, not here. Closing this modal does NOT cancel
// anything — CoursesTab shows a resume row for exactly that reason.

const ACTIVE = ['OUTLINING', 'GENERATING'];
const MIN_PROMPT = 20;

export default function CourseGenModal({ open, onClose, resumeJobId = null, onJobChange }) {
  const navigate = useNavigate();

  const [jobId, setJobId]   = useState(resumeJobId);
  const [job, setJob]       = useState(null);
  const [prompt, setPrompt] = useState('');
  const [reference, setReference] = useState('');
  const [posts, setPosts]   = useState([]);
  const [pickedPosts, setPickedPosts] = useState(() => new Set());
  const [starting, setStarting] = useState(false);
  const [outline, setOutline]   = useState(null);
  const [saving, setSaving]     = useState(false);

  const saveTimer = useRef(null);

  // Reset to the brief screen (or the resumed job) each time the modal opens.
  useEffect(() => {
    if (!open) return;
    setJobId(resumeJobId);
    setJob(null);
    setOutline(null);
  }, [open, resumeJobId]);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    listBlogPosts('?status=PUBLISHED')
      .then((d) => {
        if (cancelled) return;
        const rows = Array.isArray(d) ? d : (d?.posts ?? []);
        setPosts(rows.slice(0, 50));
      })
      .catch(() => { if (!cancelled) setPosts([]); });
    return () => { cancelled = true; };
  }, [open]);

  // Fetch immediately on open/resume so a resumed job does not sit blank for the
  // first poll interval.
  useEffect(() => {
    if (!open || !jobId) return;
    getCourseGenJob(jobId).then(setJob).catch(() => {});
  }, [open, jobId]);

  const status = job?.status ?? null;
  const isActive = ACTIVE.includes(status);

  // Poll only while the job is doing something. A terminal status must stop the
  // interval, or the modal quietly hammers the API for as long as it stays open.
  //
  // Depends on `status`, never on `job` — the poll replaces `job` every two
  // seconds, so depending on the object would tear down and rebuild the interval
  // on every tick.
  useEffect(() => {
    if (!open || !jobId) return undefined;
    if (status && !ACTIVE.includes(status)) return undefined;
    const t = setInterval(() => {
      getCourseGenJob(jobId).then(setJob).catch(() => {});
    }, 2000);
    return () => clearInterval(t);
  }, [open, jobId, status]);

  // Adopt the server's outline once, when review opens. After that the local
  // copy is authoritative — re-adopting on every poll would stomp the author's
  // keystrokes with whatever the last debounced PATCH happened to persist.
  useEffect(() => {
    if (job?.status === 'AWAITING_REVIEW' && job.outline && !outline) {
      setOutline(job.outline);
    }
  }, [job?.status, job?.outline, outline]);

  useEffect(() => { onJobChange?.(job); }, [job, onJobChange]);

  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);

  const handleClose = useCallback(() => {
    if (isActive) {
      const msg = status === 'GENERATING'
        ? 'Closing this window does NOT cancel the generation — it keeps running on the server.\n\n'
          + 'You can reopen it from the "Resume" button under the course list. Close it?'
        : 'Closing this window does NOT cancel the outline — it keeps running on the server.\n\n'
          + 'You can reopen it from the "Resume" button under the course list. Close it?';
      if (!window.confirm(msg)) return;
    }
    if (saveTimer.current) clearTimeout(saveTimer.current);
    onClose();
  }, [isActive, status, onClose]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') handleClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, handleClose]);

  const handleStart = async () => {
    if (prompt.trim().length < MIN_PROMPT || starting) return;
    setStarting(true);
    try {
      const created = await startCourseGen({
        prompt: prompt.trim(),
        reference: reference.trim() || undefined,
        sourcePostIds: [...pickedPosts],
      });
      setJobId(created.id);
      setJob({ id: created.id, status: 'OUTLINING', stepLabel: 'Drafting the outline…', progress: 0 });
    } catch (err) {
      toast.error(err?.message ?? 'Could not start generation');
    } finally {
      setStarting(false);
    }
  };

  // Debounced save: the author types continuously, and the outline is a whole
  // document per PATCH.
  const handleOutlineChange = (next) => {
    setOutline(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      setSaving(true);
      saveCourseGenOutline(jobId, next)
        .catch(() => toast.error('Could not save the outline'))
        .finally(() => setSaving(false));
    }, 800);
  };

  const handleRun = async () => {
    // Flush any pending debounce first, or "Generate" races the last edit and
    // stage 2 walks a stale outline.
    if (saveTimer.current) clearTimeout(saveTimer.current);
    try {
      if (outline) await saveCourseGenOutline(jobId, outline);
      await runCourseGen(jobId);
      setJob((j) => ({ ...j, status: 'GENERATING', progress: 1, stepLabel: 'Creating the course…' }));
    } catch (err) {
      toast.error(err?.message ?? 'Could not start generation');
    }
  };

  const handleCancel = async () => {
    if (!window.confirm('Stop generating? Sections already written are kept as a draft course.')) return;
    try {
      await cancelCourseGen(jobId);
      toast('Cancelling after the current section…');
    } catch {
      toast.error('Could not cancel that job');
    }
  };

  const startOver = () => { setJobId(null); setJob(null); setOutline(null); };

  const openCourse = () => {
    onClose();
    navigate(`/clubpm/courses/${job.courseId}/edit`);
  };

  if (!open) return null;

  const togglePost = (id) => setPickedPosts((s) => {
    const next = new Set(s);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  return createPortal(
    <>
      <div className="pm-drawer-overlay" onClick={handleClose} />
      <div className="pm-course-gen-modal" role="dialog" aria-modal="true" aria-label="Generate a course with AI">
        <header className="pm-course-gen-header">
          <h2>
            <i className="fas fa-wand-magic-sparkles" aria-hidden="true" style={{ marginRight: 8 }} />
            Generate a course
          </h2>
          <button type="button" className="clubpm-btn-secondary" onClick={handleClose} aria-label="Close">
            <i className="fas fa-xmark" aria-hidden="true" />
          </button>
        </header>

        <div className="pm-course-gen-body">
          {/* ── Brief ─────────────────────────────────────────── */}
          {!jobId && (
            <div className="pm-course-gen-brief-screen">
              <label className="cpm-form-label" htmlFor="cgen-prompt">What should this course teach?</label>
              <textarea
                id="cgen-prompt"
                className="cpm-form-input"
                rows={6}
                placeholder="Who it is for, what they should be able to do afterwards, and what it must cover. A few paragraphs beats a sentence."
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
              />
              <span className="pm-course-gen-counter">
                {prompt.trim().length < MIN_PROMPT
                  ? `${MIN_PROMPT - prompt.trim().length} more characters needed`
                  : `${prompt.trim().length} characters`}
              </span>

              <label className="cpm-form-label" htmlFor="cgen-ref">Reference material (optional)</label>
              <span className="pm-course-gen-hint">
                Paste anything the course must be grounded in — procedures, specs, notes. The model is
                told not to invent facts beyond it.
              </span>
              <textarea
                id="cgen-ref"
                className="cpm-form-input"
                rows={6}
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />

              {posts.length > 0 && (
                <>
                  <label className="cpm-form-label">Draw on published blog posts (optional, up to 5)</label>
                  <ul className="pm-course-gen-posts">
                    {posts.map((p) => (
                      <li key={p.id}>
                        <label>
                          <input
                            type="checkbox"
                            checked={pickedPosts.has(p.id)}
                            disabled={!pickedPosts.has(p.id) && pickedPosts.size >= 5}
                            onChange={() => togglePost(p.id)}
                          />
                          {p.title}
                        </label>
                      </li>
                    ))}
                  </ul>
                </>
              )}

              <div className="pm-course-gen-actions">
                <button
                  type="button"
                  className="clubpm-btn-primary"
                  disabled={prompt.trim().length < MIN_PROMPT || starting}
                  onClick={handleStart}
                >
                  {starting ? 'Starting…' : 'Draft the outline'}
                </button>
                <span className="pm-course-gen-hint">
                  One quick model call. You review and edit the outline before anything is written.
                </span>
              </div>
            </div>
          )}

          {/* ── Outlining ─────────────────────────────────────── */}
          {status === 'OUTLINING' && (
            <div className="pm-course-gen-waiting">
              <div className="cpm-spinner" aria-hidden="true" />
              <p>{job.stepLabel ?? 'Drafting the outline…'}</p>
            </div>
          )}

          {/* ── Review ────────────────────────────────────────── */}
          {status === 'AWAITING_REVIEW' && outline && (
            <>
              <p className="pm-course-gen-review-note">
                Nothing has been written yet. Edit freely — this outline is exactly what gets built.
              </p>
              <CourseOutlineReview outline={outline} onChange={handleOutlineChange} />
            </>
          )}

          {/* ── Generating ────────────────────────────────────── */}
          {status === 'GENERATING' && (
            <div className="pm-course-gen-progress">
              <div className="cpm-progress-bar">
                <div className="cpm-progress-bar-fill" style={{ width: `${job.progress ?? 0}%` }} />
              </div>
              <p className="pm-course-gen-step">{job.stepLabel ?? 'Working…'}</p>
              <p className="pm-course-gen-hint">
                This keeps running on the server if you close this window — reopen it from
                the Resume button under the course list.
              </p>
            </div>
          )}

          {/* ── Done ──────────────────────────────────────────── */}
          {status === 'DONE' && (
            <div className="pm-course-gen-waiting">
              <i className="fas fa-circle-check pm-course-gen-done-icon" aria-hidden="true" />
              <p>Your draft course is ready. Review it before publishing — it was written by a model.</p>
            </div>
          )}

          {/* ── Failed ────────────────────────────────────────── */}
          {status === 'FAILED' && (
            <div className="pm-course-gen-waiting">
              <i className="fas fa-triangle-exclamation pm-course-gen-fail-icon" aria-hidden="true" />
              <p>{job.error ?? 'Generation failed'}</p>
              {job.courseId && (
                <p className="pm-course-gen-hint">
                  The sections written before it stopped were kept as a draft course.
                </p>
              )}
            </div>
          )}
        </div>

        <footer className="pm-course-gen-footer">
          {status === 'AWAITING_REVIEW' && (
            <>
              <span className="pm-course-gen-hint">{saving ? 'Saving…' : 'Saved'}</span>
              <button type="button" className="clubpm-btn-secondary" onClick={handleClose}>Close</button>
              <button type="button" className="clubpm-btn-primary" onClick={handleRun}>
                Generate course
              </button>
            </>
          )}
          {status === 'GENERATING' && (
            <>
              <button type="button" className="clubpm-btn-secondary" onClick={handleCancel}>
                Cancel generation
              </button>
              <button type="button" className="clubpm-btn-secondary" onClick={handleClose}>
                Close (keeps running)
              </button>
            </>
          )}
          {status === 'DONE' && (
            <button type="button" className="clubpm-btn-primary" onClick={openCourse}>
              Open the course
            </button>
          )}
          {status === 'FAILED' && (
            <>
              {job.courseId && (
                <button type="button" className="clubpm-btn-secondary" onClick={openCourse}>
                  Open the partial course
                </button>
              )}
              <button type="button" className="clubpm-btn-primary" onClick={startOver}>Start over</button>
            </>
          )}
        </footer>
      </div>
    </>,
    document.body,
  );
}
