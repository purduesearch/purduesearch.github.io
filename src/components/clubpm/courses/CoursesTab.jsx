import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { listCourses, createCourse, deleteCourse } from '../../../api/clubPmClient';
import CourseProgressDashboard from './CourseProgressDashboard';

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

  const load = useCallback(() => {
    setLoading(true);
    listCourses()
      .then((c) => setCourses(Array.isArray(c) ? c : []))
      .catch(() => setCourses([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

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

                {p && <ProgressRing pct={pct} />}

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
    </div>
  );
}
