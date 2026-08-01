import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { listCourses, createCourse, deleteCourse, listCourseGenJobs } from '../../../api/clubPmClient';
import CourseProgressDashboard from './CourseProgressDashboard';
import CourseGenModal from './CourseGenModal';

// A generation job keeps running server-side after its modal is closed, so the
// catalog surfaces anything still in flight (or parked awaiting review) with a
// way back into it. Without this row, closing the modal loses the job.
const RESUMABLE = ['OUTLINING', 'AWAITING_REVIEW', 'GENERATING'];

const STATUS_FILTERS = [
  { id: '',          label: 'All' },
  { id: 'DRAFT',     label: 'Drafts' },
  { id: 'PUBLISHED', label: 'Published' },
  { id: 'ARCHIVED',  label: 'Archived' },
];

function fmt(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Days until a due date; negative once overdue. null when there is no due date.
function daysUntil(dateStr) {
  if (!dateStr) return null;
  const ms = new Date(dateStr).getTime() - Date.now();
  return Math.ceil(ms / 86400000);
}

// SVG progress ring. `pct` is 0-100.
function ProgressRing({ pct, size = 48 }) {
  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <svg className="cpm-course-ring" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <circle className="cpm-course-ring-track" cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth="4" />
      <circle
        className="cpm-course-ring-fill"
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - clamped / 100)}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text className="cpm-course-ring-label" x="50%" y="50%" dominantBaseline="central" textAnchor="middle">
        {Math.round(clamped)}%
      </text>
    </svg>
  );
}

export default function CoursesTab({ isAdmin = false, currentMemberId = null }) {
  const navigate = useNavigate();
  const [courses, setCourses]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [filter, setFilter]     = useState('');
  const [creating, setCreating] = useState(false);
  const [showDashboard, setShowDashboard] = useState(false);
  const [genOpen, setGenOpen]   = useState(false);
  const [resumeId, setResumeId] = useState(null);
  const [genJobs, setGenJobs]   = useState([]);

  const load = useCallback(() => {
    setLoading(true);
    listCourses()
      .then((c) => setCourses(Array.isArray(c) ? c : []))
      .catch(() => setCourses([]))
      .finally(() => setLoading(false));
  }, []);

  const loadJobs = useCallback(() => {
    listCourseGenJobs()
      .then((j) => setGenJobs(Array.isArray(j) ? j.filter((x) => RESUMABLE.includes(x.status)) : []))
      .catch(() => setGenJobs([]));
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadJobs(); }, [loadJobs]);

  // While the modal is closed nothing else refreshes the row, so poll slowly —
  // enough to notice an outline finishing, not enough to matter.
  useEffect(() => {
    if (genOpen || genJobs.length === 0) return undefined;
    const t = setInterval(loadJobs, 15000);
    return () => clearInterval(t);
  }, [genOpen, genJobs.length, loadJobs]);

  const openGen = (jobId = null) => { setResumeId(jobId); setGenOpen(true); };

  const closeGen = () => {
    setGenOpen(false);
    setResumeId(null);
    loadJobs();
    load();
  };

  const handleNew = async () => {
    if (creating) return;
    setCreating(true);
    try {
      const course = await createCourse({ title: 'Untitled course' });
      navigate(`/clubpm/outreach/courses/${course.id}/edit`);
    } catch {
      toast.error('Could not create course');
    } finally {
      setCreating(false);
    }
  };

  // Optimistic removal with rollback if the request fails.
  const handleDelete = async (e, course) => {
    e.stopPropagation();
    if (!window.confirm(`Delete "${course.title}"? This cannot be undone.`)) return;
    const prev = courses;
    setCourses((cs) => cs.filter((c) => c.id !== course.id));
    try {
      await deleteCourse(course.id);
      toast.success('Course deleted');
    } catch {
      setCourses(prev);
      toast.error('Could not delete course (only the author or an admin can).');
    }
  };

  const openCourse = (course) => {
    if (course.canEdit) navigate(`/clubpm/outreach/courses/${course.id}/edit`);
    else navigate(`/clubpm/outreach/courses/${course.slug}/learn`);
  };

  const takeCourse = (e, course) => {
    e.stopPropagation();
    navigate(`/clubpm/outreach/courses/${course.slug}/learn`);
  };

  // Authors and admins land in the editor when they open a card, which left them
  // with no way to actually TAKE a course they had assigned to themselves. This
  // is that path — and for a plain learner it is a clearer target than the card.
  const takeLabel = (course) => {
    if (course.myProgress?.completedAt) return 'Review';
    if (course.myProgress) return 'Continue';
    return 'Start';
  };

  const visible = filter ? courses.filter((c) => c.status === filter) : courses;

  if (showDashboard) {
    return (
      <div className="cpm-course-tab">
        <div className="cpm-course-tab-header">
          <button className="clubpm-btn-secondary" onClick={() => setShowDashboard(false)}>
            <i className="fas fa-arrow-left" aria-hidden="true" style={{ marginRight: 6 }} />
            Back to catalog
          </button>
        </div>
        <CourseProgressDashboard courses={courses} isAdmin={isAdmin} />
      </div>
    );
  }

  return (
    <div className="cpm-course-tab">
      <div className="cpm-course-tab-header">
        <div className="cpm-course-filters" role="tablist">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.id || 'all'}
              role="tab"
              aria-selected={filter === f.id}
              className={`cpm-course-filter${filter === f.id ? ' is-active' : ''}`}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="cpm-course-tab-actions">
          {isAdmin && (
            <button className="clubpm-btn-secondary" onClick={() => setShowDashboard(true)}>
              <i className="fas fa-chart-bar" aria-hidden="true" style={{ marginRight: 6 }} />
              Progress dashboard
            </button>
          )}
          <button className="clubpm-btn-secondary" onClick={() => openGen()}>
            <i className="fas fa-wand-magic-sparkles" aria-hidden="true" style={{ marginRight: 6 }} />
            Generate with AI
          </button>
          <button className="clubpm-btn-primary" onClick={handleNew} disabled={creating}>
            <i className="fas fa-plus" aria-hidden="true" style={{ marginRight: 6 }} />
            New course
          </button>
        </div>
      </div>

      {loading ? (
        <p style={{ color: 'var(--pm-accent-teal)', padding: 24 }}>Loading…</p>
      ) : visible.length === 0 ? (
        <div className="cpm-course-empty">
          <i className="fas fa-graduation-cap" aria-hidden="true" />
          <p>No courses yet. Create one to start building club training.</p>
        </div>
      ) : (
        <ul className="cpm-course-grid">
          {visible.map((course) => {
            const p = course.myProgress;
            const total = p?.totalSections ?? course._count?.sections ?? 0;
            const pct = p && total ? (p.completedSections / total) * 100 : 0;
            const due = daysUntil(p?.dueDate);
            return (
              <li
                key={course.id}
                className="cpm-course-card"
                role="button"
                tabIndex={0}
                onClick={() => openCourse(course)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openCourse(course); } }}
              >
                {course.coverImageUrl
                  ? <img src={course.coverImageUrl} alt="" className="cpm-course-card-cover" />
                  : <div className="cpm-course-card-cover cpm-course-card-cover--empty"><i className="fas fa-graduation-cap" aria-hidden="true" /></div>}

                <div className="cpm-course-card-main">
                  <span className="cpm-course-card-title">{course.title}</span>
                  {course.summary && <span className="cpm-course-card-summary">{course.summary}</span>}
                  <span className="cpm-course-card-meta">
                    {total} section{total === 1 ? '' : 's'}
                    {course.estimatedMinutes ? ` · ${course.estimatedMinutes} min` : ''}
                    {course.publishedAt ? ` · published ${fmt(course.publishedAt)}` : ''}
                  </span>

                  <div className="cpm-course-card-chips">
                    <span className={`cpm-course-status cpm-course-status--${course.status?.toLowerCase()}`}>
                      {course.status}
                    </span>
                    {p?.completedAt && (
                      <span className="cpm-course-chip cpm-course-chip--done">
                        <i className="fas fa-circle-check" aria-hidden="true" style={{ marginRight: 4 }} />
                        Completed
                      </span>
                    )}
                    {p?.dueDate && !p.completedAt && (
                      <span className={`cpm-course-chip${due < 0 ? ' cpm-course-chip--overdue' : ''}`}>
                        <i className="fas fa-clock" aria-hidden="true" style={{ marginRight: 4 }} />
                        {due < 0 ? `Overdue — due ${fmt(p.dueDate)}` : `Due ${fmt(p.dueDate)}`}
                      </span>
                    )}
                    {course.createdById === currentMemberId && (
                      <span className="cpm-course-chip cpm-course-chip--mine">Author</span>
                    )}
                  </div>
                </div>

                {/* One grid item, not two: the card's template has exactly
                    three columns, so a loose fourth child wraps onto a second
                    row instead of sitting beside the ring. */}
                <div className="cpm-course-card-actions">
                  {p && <ProgressRing pct={pct} />}
                  {(course.status === 'PUBLISHED' || p) && (
                    <button
                      type="button"
                      className="clubpm-btn-secondary cpm-course-card-take"
                      onClick={(e) => takeCourse(e, course)}
                      title={`${takeLabel(course)} this course`}
                      aria-label={`${takeLabel(course)} ${course.title}`}
                    >
                      <i className="fas fa-play" aria-hidden="true" style={{ marginRight: 6 }} />
                      {takeLabel(course)}
                    </button>
                  )}
                </div>

                {course.canEdit && (
                  <button
                    type="button"
                    className="cpm-course-card-delete"
                    title="Delete course"
                    aria-label={`Delete ${course.title}`}
                    onClick={(e) => handleDelete(e, course)}
                  >
                    <i className="fas fa-trash" aria-hidden="true" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {genJobs.length > 0 && (
        <ul className="pm-course-gen-jobs">
          {genJobs.map((j) => (
            <li key={j.id} className="cpm-card pm-course-gen-job-row">
              <i
                className={`fas ${j.status === 'AWAITING_REVIEW' ? 'fa-clipboard-check' : 'fa-wand-magic-sparkles fa-spin'}`}
                aria-hidden="true"
              />
              <div className="pm-course-gen-job-main">
                <span className="pm-course-gen-job-label">
                  {j.status === 'AWAITING_REVIEW' ? 'Outline ready for review' : (j.stepLabel ?? 'Working…')}
                </span>
                <span className="pm-course-gen-job-sub">{j.prompt?.slice(0, 110)}</span>
                {j.status === 'GENERATING' && (
                  <div className="cpm-progress-bar">
                    <div className="cpm-progress-bar-fill" style={{ width: `${j.progress ?? 0}%` }} />
                  </div>
                )}
              </div>
              <button type="button" className="clubpm-btn-secondary" onClick={() => openGen(j.id)}>
                Resume
              </button>
            </li>
          ))}
        </ul>
      )}

      <CourseGenModal open={genOpen} onClose={closeGen} resumeJobId={resumeId} />
    </div>
  );
}
