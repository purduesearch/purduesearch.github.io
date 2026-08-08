import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import AvatarPortrait from '../avatar/AvatarPortrait';
import RankIcon from '../RankIcon';
import CourseAssignModal from './CourseAssignModal';
import {
  getCourseProgress,
  getCourseQuizAnalysis,
  getMemberCourseProgress,
} from '../../../api/clubPmClient';

// Admin reporting for one course: the completion matrix, a per-member drawer
// (mirroring MemberDrawer in MembersView.jsx), and quiz item analysis.
//
// Due dates are shown here because `CourseEnrollment.dueDate` is stored and a
// human needs to act on it. Nothing acts on it automatically — the overdue cron
// and Slack nudges were explicitly excluded from this feature's scope.

const VIEWS = [
  { id: 'matrix',   label: 'Completion matrix', icon: 'fas fa-table-cells' },
  { id: 'analysis', label: 'Quiz item analysis', icon: 'fas fa-clipboard-question' },
];

const CELL_STATUS = {
  COMPLETED:   { cls: 'is-complete',  icon: 'fas fa-circle-check',  label: 'Completed' },
  IN_PROGRESS: { cls: 'is-partial',   icon: 'fas fa-circle-half-stroke', label: 'In progress' },
  NOT_STARTED: { cls: 'is-empty',     icon: 'fas fa-circle',        label: 'Not started' },
};

const KIND_ICON = {
  CONTENT: 'fas fa-file-lines',
  VIDEO:   'fas fa-play',
  QUIZ:    'fas fa-list-check',
};

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtDateTime(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function fmtClock(sec) {
  if (!sec) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

// Negative once overdue; null when there is no due date.
function daysUntil(d) {
  if (!d) return null;
  return Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);
}

function DueChip({ dueDate, completedAt }) {
  if (!dueDate) return null;
  const days = daysUntil(dueDate);
  const overdue = !completedAt && days < 0;
  const soon = !completedAt && days >= 0 && days <= 3;
  return (
    <span className={`cpm-course-due-chip${overdue ? ' is-overdue' : soon ? ' is-soon' : ''}`}>
      <i className="fas fa-clock" aria-hidden="true" />
      {completedAt
        ? `Due ${fmtDate(dueDate)}`
        : overdue
          ? `${Math.abs(days)}d overdue`
          : `Due ${fmtDate(dueDate)}`}
    </span>
  );
}

// ── Pass-rate bar ─────────────────────────────────────────────
// Low pass rates are the signal an author is looking for, so the bar is colored
// by band rather than by a single accent.
function PassRateBar({ pct }) {
  if (pct == null) return <span className="cpm-course-analysis-norate">No responses yet</span>;
  const band = pct < 40 ? 'is-bad' : pct < 70 ? 'is-warn' : 'is-good';
  return (
    <div className={`cpm-course-rate ${band}`}>
      <div className="cpm-course-rate-track">
        <div className="cpm-course-rate-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="cpm-course-rate-value">{pct}%</span>
    </div>
  );
}

// ── Member drawer ─────────────────────────────────────────────
// Same portal + overlay shape as MemberDrawer in MembersView.jsx, so it inherits
// the `pm-member-drawer` styling; the body is course progress instead of profile.

function MemberProgressDrawer({ member, onClose }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    getMemberCourseProgress(member.id)
      .then((d) => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [member.id]);

  // Escape closes, matching the rest of the ClubPM overlays.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <>
      <div className="pm-drawer-overlay" onClick={onClose} />
      <div className="pm-member-drawer open pm-course-member-drawer">
        <button className="pm-member-drawer-close" onClick={onClose} aria-label="Close">×</button>

        <div className="pm-member-drawer-profile">
          <span className="pm-member-avatar-wrap pm-member-avatar-wrap--lg">
            <AvatarPortrait member={member} size={72} className="pm-member-drawer-avatar" />
            {member.rank ? (
              <span className="cpm-member-badge-rank-overlay" aria-hidden="true">
                <RankIcon member={member} size={30} />
              </span>
            ) : null}
          </span>
          <div className="pm-member-drawer-name">{member.displayName}</div>
          {member.title && <div className="pm-member-drawer-title">{member.title}</div>}
        </div>

        {loading ? (
          <p className="cpm-course-drawer-note">Loading progress…</p>
        ) : error ? (
          <p className="cpm-course-drawer-note">Could not load this member's progress.</p>
        ) : !data?.enrollments?.length ? (
          <p className="cpm-course-drawer-note">Not enrolled in any courses yet.</p>
        ) : (
          <div className="cpm-course-drawer-body">
            {data.enrollments.map((e) => (
              <section key={e.enrollmentId} className="cpm-course-drawer-course">
                <header className="cpm-course-drawer-course-head">
                  <span className="cpm-course-drawer-course-title">{e.course.title}</span>
                  <span className="cpm-course-drawer-course-pct">{e.pct}%</span>
                </header>

                <div className="cpm-course-drawer-course-meta">
                  <span>{e.completedSections}/{e.totalSections} sections</span>
                  <DueChip dueDate={e.dueDate} completedAt={e.completedAt} />
                  {e.assignedBy && <span>Assigned by {e.assignedBy.displayName}</span>}
                  {e.completedAt
                    ? <span className="cpm-course-chip cpm-course-chip--done">Completed {fmtDate(e.completedAt)}</span>
                    : <span>Last activity {fmtDateTime(e.lastActivity)}</span>}
                </div>

                <ul className="cpm-course-drawer-sections">
                  {e.sections.map((s) => {
                    const st = CELL_STATUS[s.status] ?? CELL_STATUS.NOT_STARTED;
                    return (
                      <li key={s.id} className={`cpm-course-drawer-section ${st.cls}`}>
                        <i className={st.icon} aria-hidden="true" title={st.label} />
                        <i className={`${KIND_ICON[s.kind] ?? KIND_ICON.CONTENT} cpm-course-kind-icon`} aria-hidden="true" />
                        <span className="cpm-course-drawer-section-title">
                          {s.title}
                          {!s.isRequired && <span className="cpm-course-optional-tag">optional</span>}
                        </span>
                        <span className="cpm-course-drawer-section-stat">
                          {s.kind === 'QUIZ' && s.attemptCount > 0 && (
                            <>
                              {s.bestScorePct != null ? `${Math.round(s.bestScorePct)}%` : '—'}
                              {' · '}
                              {s.attemptCount} attempt{s.attemptCount === 1 ? '' : 's'}
                              {s.passed ? ' · passed' : ''}
                            </>
                          )}
                          {s.kind === 'QUIZ' && s.attemptCount === 0 && 'no attempts'}
                          {s.kind === 'VIDEO' && s.maxWatchedSec > 0 && `watched to ${fmtClock(s.maxWatchedSec)}`}
                          {s.completedAt && s.kind === 'CONTENT' && fmtDate(s.completedAt)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}

        <Link to={`/clubpm/profile/${member.id}`} className="pm-member-edit-profile-btn" onClick={onClose}>
          <i className="fas fa-external-link-alt" aria-hidden="true" /> View full profile
        </Link>
      </div>
    </>,
    document.body
  );
}

// ── Completion matrix ─────────────────────────────────────────

function CompletionMatrix({ data, onSelectMember }) {
  const { sections = [], rows = [], summary } = data;

  if (!rows.length) {
    return (
      <div className="cpm-course-empty">
        <i className="fas fa-user-group" aria-hidden="true" />
        <p>Nobody is enrolled in this course yet. Assign it to members, or wait for someone to start it from the catalog.</p>
      </div>
    );
  }

  return (
    <>
      <div className="cpm-course-summary-strip">
        {[
          { label: 'Enrolled',    value: summary.enrolled },
          { label: 'Completed',   value: summary.completed },
          { label: 'In progress', value: summary.inProgress },
          { label: 'Not started', value: summary.notStarted },
          { label: 'Overdue',     value: summary.overdue, danger: summary.overdue > 0 },
          { label: 'Avg progress', value: `${summary.avgPct}%` },
        ].map((s) => (
          <div key={s.label} className={`cpm-course-summary-tile${s.danger ? ' is-danger' : ''}`}>
            <span className="cpm-course-summary-value">{s.value}</span>
            <span className="cpm-course-summary-label">{s.label}</span>
          </div>
        ))}
      </div>

      {/* Wide table: scrolls inside its own container so the page never scrolls sideways. */}
      <div className="cpm-course-matrix-scroll">
        <table className="cpm-course-matrix">
          <thead>
            <tr>
              <th scope="col" className="cpm-course-matrix-member-head">Member</th>
              {sections.map((s) => (
                <th key={s.id} scope="col" className="cpm-course-matrix-section-head" title={s.title}>
                  <i className={KIND_ICON[s.kind] ?? KIND_ICON.CONTENT} aria-hidden="true" />
                  <span>{s.title}</span>
                  {!s.isRequired && <span className="cpm-course-optional-tag">optional</span>}
                </th>
              ))}
              <th scope="col">Progress</th>
              <th scope="col">Due</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.enrollmentId}>
                <th scope="row" className="cpm-course-matrix-member">
                  <button
                    type="button"
                    className="cpm-course-matrix-member-btn"
                    onClick={() => onSelectMember(r.member)}
                    title={`Open ${r.member.displayName}'s course record`}
                  >
                    <AvatarPortrait member={r.member} size={26} />
                    <span>{r.member.displayName}</span>
                  </button>
                </th>

                {sections.map((s) => {
                  const cell = r.cells[s.id] ?? { status: 'NOT_STARTED' };
                  const st = CELL_STATUS[cell.status] ?? CELL_STATUS.NOT_STARTED;
                  // Lit reviews complete on effort, so a completed cell says
                  // nothing about quality. The score is the officer's only signal.
                  const lit = s.kind === 'LIT_REVIEW' && cell.litAttempts
                    ? cell.litScorePct == null
                      ? ' · not graded'
                      : ` · ${cell.litScorePct}%${cell.litAttempts > 1 ? ` over ${cell.litAttempts} attempts` : ''}`
                    : '';
                  return (
                    <td key={s.id} className={`cpm-course-matrix-cell ${st.cls}`}>
                      <i
                        className={st.icon}
                        aria-hidden="true"
                        title={`${s.title}: ${st.label}${cell.completedAt ? ` (${fmtDate(cell.completedAt)})` : ''}${lit}`}
                      />
                      <span className="cpm-sr-only">{`${s.title}: ${st.label}${lit}`}</span>
                    </td>
                  );
                })}

                <td className="cpm-course-matrix-progress">
                  <div className="cpm-progress-bar">
                    <div className="cpm-progress-bar-fill" style={{ width: `${r.pct}%` }} />
                  </div>
                  <span>{r.pct}%</span>
                </td>

                <td className="cpm-course-matrix-due">
                  {r.dueDate
                    ? <DueChip dueDate={r.dueDate} completedAt={r.completedAt} />
                    : <span className="cpm-course-matrix-nodue">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ── Quiz item analysis ────────────────────────────────────────

function QuestionCard({ q, sectionStat }) {
  const [open, setOpen] = useState(false);

  return (
    <li className="cpm-course-analysis-item">
      <button
        type="button"
        className="cpm-course-analysis-head"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className="cpm-course-analysis-prompt">
          <span className="cpm-course-analysis-where">
            {q.section?.title}
            {q.isPopup && (
              <span className="cpm-course-popup-tag">
                <i className="fas fa-play" aria-hidden="true" /> pop-up @ {fmtClock(q.videoTimestampSec)}
              </span>
            )}
          </span>
          {q.prompt}
        </span>
        <PassRateBar pct={q.passRate} />
        <span className="cpm-course-analysis-n">{q.responses} response{q.responses === 1 ? '' : 's'}</span>
        <i className={`fas fa-chevron-${open ? 'up' : 'down'}`} aria-hidden="true" />
      </button>

      {open && (
        <div className="cpm-course-analysis-detail">
          <ul className="cpm-course-analysis-answers">
            {q.answers.map((a) => (
              <li key={a.id} className={a.isCorrect ? 'is-correct' : ''}>
                <i className={a.isCorrect ? 'fas fa-check' : 'fas fa-xmark'} aria-hidden="true" />
                {a.text}
              </li>
            ))}
          </ul>
          {q.explanation && (
            <p className="cpm-course-analysis-explanation">
              <strong>Explanation:</strong> {q.explanation}
            </p>
          )}
          <p className="cpm-course-analysis-stats">
            {q.correct} correct · {q.incorrect} incorrect
            {q.isPopup
              ? q.rewindToSec != null && ` · rewinds to ${fmtClock(q.rewindToSec)}`
              : sectionStat && ` · section: ${sectionStat.attempts} attempt${sectionStat.attempts === 1 ? '' : 's'}, ${sectionStat.passRate ?? 0}% passed, avg ${sectionStat.avgScorePct ?? 0}%`}
          </p>
        </div>
      )}
    </li>
  );
}

function QuizAnalysis({ data }) {
  const statBySection = useMemo(
    () => new Map((data.sectionStats ?? []).map((s) => [s.sectionId, s])),
    [data.sectionStats]
  );

  const quiz  = data.quizQuestions ?? [];
  const popup = data.popupQuestions ?? [];

  if (!quiz.length && !popup.length) {
    return (
      <div className="cpm-course-empty">
        <i className="fas fa-clipboard-question" aria-hidden="true" />
        <p>This course has no questions yet.</p>
      </div>
    );
  }

  // Questions everybody gets wrong are usually the question's fault, so the
  // worst pass rates sort to the top of each group.
  const byWorst = (a, b) => (a.passRate ?? 101) - (b.passRate ?? 101);

  return (
    <div className="cpm-course-analysis">
      {quiz.length > 0 && (
        <section>
          <h3 className="cpm-course-analysis-heading">
            <i className="fas fa-list-check" aria-hidden="true" /> Quiz questions
          </h3>
          <ul className="cpm-course-analysis-list">
            {[...quiz].sort(byWorst).map((q) => (
              <QuestionCard key={q.id} q={q} sectionStat={statBySection.get(q.section?.id)} />
            ))}
          </ul>
        </section>
      )}

      {popup.length > 0 && (
        <section>
          {/* Kept separate from quiz questions: a pop-up with a bad pass rate
              usually means a badly placed timestamp, not a badly written question. */}
          <h3 className="cpm-course-analysis-heading">
            <i className="fas fa-play" aria-hidden="true" /> Video pop-ups
          </h3>
          <ul className="cpm-course-analysis-list">
            {[...popup].sort(byWorst).map((q) => (
              <QuestionCard key={q.id} q={q} sectionStat={statBySection.get(q.section?.id)} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

// ── Dashboard shell ───────────────────────────────────────────

export default function CourseProgressDashboard({
  courses = [],
  initialCourseId = null,
  isAdmin = false,
}) {
  const selectable = useMemo(
    () => courses.filter((c) => c.canEdit || c.status === 'PUBLISHED'),
    [courses]
  );

  const [courseId, setCourseId] = useState(initialCourseId || selectable[0]?.id || '');
  const [view, setView]         = useState('matrix');
  const [progress, setProgress] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [drawerMember, setDrawerMember] = useState(null);
  const [assigning, setAssigning] = useState(false);

  const selectedCourse = useMemo(
    () => selectable.find((c) => c.id === courseId) ?? null,
    [selectable, courseId]
  );
  const enrolledMemberIds = useMemo(
    () => (progress?.rows ?? []).map((r) => r.member.id),
    [progress]
  );

  // Keep the selector valid if the catalog loads after this mounts.
  useEffect(() => {
    if (!courseId && selectable.length) setCourseId(selectable[0].id);
  }, [courseId, selectable]);

  const load = useCallback(() => {
    if (!courseId) return undefined;
    let cancelled = false;
    setLoading(true);
    setError('');
    Promise.all([getCourseProgress(courseId), getCourseQuizAnalysis(courseId)])
      .then(([p, a]) => {
        if (cancelled) return;
        setProgress(p);
        setAnalysis(a);
      })
      .catch(() => {
        if (cancelled) return;
        setProgress(null);
        setAnalysis(null);
        setError('Could not load progress for this course.');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [courseId]);

  useEffect(() => load(), [load]);

  return (
    <div className="pm-course-dashboard">
      <div className="pm-course-dashboard-bar">
        <label className="cpm-course-select-label">
          <span className="cpm-sr-only">Course</span>
          <select
            className="cpm-form-select"
            value={courseId}
            onChange={(e) => setCourseId(e.target.value)}
          >
            {selectable.length === 0 && <option value="">No courses available</option>}
            {selectable.map((c) => (
              <option key={c.id} value={c.id}>{c.title}</option>
            ))}
          </select>
        </label>

        <div className="cpm-course-view-toggle" role="tablist">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              role="tab"
              aria-selected={view === v.id}
              className={`cpm-course-filter${view === v.id ? ' is-active' : ''}`}
              onClick={() => setView(v.id)}
            >
              <i className={v.icon} aria-hidden="true" style={{ marginRight: 6 }} />
              {v.label}
            </button>
          ))}
        </div>

        {isAdmin && (
          <button
            className="clubpm-btn-primary"
            data-tour-id="courses.assign"
            onClick={() => setAssigning(true)}
            disabled={!courseId}
            title="Enrol members in this course with a due date"
          >
            <i className="fas fa-user-plus" aria-hidden="true" style={{ marginRight: 6 }} />
            Assign members
          </button>
        )}

        <button className="clubpm-btn-secondary" onClick={load} disabled={!courseId || loading}>
          <i className="fas fa-rotate" aria-hidden="true" style={{ marginRight: 6 }} />
          Refresh
        </button>
      </div>

      {!courseId ? (
        <div className="cpm-course-empty">
          <i className="fas fa-chart-bar" aria-hidden="true" />
          <p>Create a course to see progress here.</p>
        </div>
      ) : loading ? (
        <p style={{ color: 'var(--pm-accent-teal)', padding: 24 }}>Loading…</p>
      ) : error ? (
        <div className="cpm-course-empty">
          <i className="fas fa-triangle-exclamation" aria-hidden="true" />
          <p>{error}</p>
        </div>
      ) : view === 'matrix' && progress ? (
        <CompletionMatrix data={progress} onSelectMember={setDrawerMember} />
      ) : view === 'analysis' && analysis ? (
        <QuizAnalysis data={analysis} />
      ) : null}

      {drawerMember && (
        <MemberProgressDrawer member={drawerMember} onClose={() => setDrawerMember(null)} />
      )}

      {assigning && courseId && (
        <CourseAssignModal
          courseId={courseId}
          courseTitle={selectedCourse?.title ?? progress?.course?.title ?? 'this course'}
          enrolledMemberIds={enrolledMemberIds}
          onClose={() => setAssigning(false)}
          onAssigned={load}
        />
      )}
    </div>
  );
}
