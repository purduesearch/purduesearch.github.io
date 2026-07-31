import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import BlogEditor from '../../components/clubpm/blog/BlogEditor';
import LockedVideoPlayer from '../../components/clubpm/courses/LockedVideoPlayer';
import CourseQuizRunner from '../../components/clubpm/courses/CourseQuizRunner';
import { SECTION_KINDS } from '../../components/clubpm/courses/CourseSectionRail';
import OrbitLoader from '../../components/OrbitLoader';
import {
  getLearnerCourse, completeCourseSection, listCourseQuestions,
} from '../../api/clubPmClient';

const kindMeta = (kind) => SECTION_KINDS[kind] ?? SECTION_KINDS.CONTENT;

/**
 * The learner rail, grouped by module.
 *
 * A locked module still shows its title, summary and counts — that teaser is
 * author-written metadata the server sends deliberately. Its sections are still
 * padlocked and genuinely have nothing behind them: the server withholds
 * `contentJson` and `videoConfig` for locked sections, so this is a label for a
 * real gate, not a UI-only one.
 */
function LearnerRail({ modules, sections, selectedId, onSelect }) {
  const selectedModuleId = modules.find(
    (m) => m.sectionIds.includes(selectedId)
  )?.id ?? null;

  const [collapsed, setCollapsed] = useState(() => new Set());
  const toggle = (id) => setCollapsed((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const byId = new Map(sections.map((s) => [s.id, s]));

  return (
    <nav className="pm-course-learn-rail" aria-label="Course modules">
      {modules.map((mod, moduleIndex) => {
        // Finished modules collapse by default; the current one stays open.
        const isOpen = !collapsed.has(mod.id)
          && !mod.locked
          && (mod.id === selectedModuleId || !mod.completed);
        const own = mod.sectionIds.map((sid) => byId.get(sid)).filter(Boolean);

        return (
          <section
            key={mod.id}
            className={[
              'pm-course-learn-module',
              mod.locked ? 'is-locked' : '',
              mod.completed ? 'is-done' : '',
            ].filter(Boolean).join(' ')}
          >
            <button
              type="button"
              className="pm-course-learn-module-head"
              onClick={() => !mod.locked && toggle(mod.id)}
              disabled={mod.locked}
              aria-expanded={mod.locked ? undefined : isOpen}
            >
              <span className="pm-course-learn-module-num">{moduleIndex + 1}</span>
              <span className="pm-course-learn-module-title">{mod.title}</span>
              {mod.locked
                ? <i className="fas fa-lock" aria-hidden="true" title="Locked" />
                : mod.completed
                  ? <i className="fas fa-circle-check" aria-hidden="true" title="Completed" />
                  : <i className={`fas ${isOpen ? 'fa-chevron-down' : 'fa-chevron-right'}`} aria-hidden="true" />}
            </button>

            {/* The teaser: shown for a locked module, which has no rows to show. */}
            {mod.locked && (
              <div className="pm-course-learn-module-teaser">
                {mod.summary && <p>{mod.summary}</p>}
                <span className="cpm-tag">
                  {mod.sectionIds.length} section{mod.sectionIds.length === 1 ? '' : 's'}
                  {mod.estimatedMinutes ? ` · ${mod.estimatedMinutes} min` : ''}
                </span>
              </div>
            )}

            {!mod.locked && (
              <div className="pm-course-learn-module-meta">
                <span>{mod.completedCount} of {mod.sectionIds.length}</span>
                {!mod.sequential && <span className="cpm-tag">any order</span>}
                {!mod.isRequired && <span className="cpm-tag">Optional</span>}
              </div>
            )}

            {!mod.locked && isOpen && (
              <ol>
                {own.map((section, index) => {
                  const meta = kindMeta(section.kind);
                  const done = section.status === 'COMPLETED';
                  const locked = section.locked;
                  return (
                    <li key={section.id}>
                      <button
                        type="button"
                        className={[
                          'pm-course-learn-rail-item',
                          section.id === selectedId ? 'is-selected' : '',
                          done ? 'is-done' : '',
                          locked ? 'is-locked' : '',
                        ].filter(Boolean).join(' ')}
                        onClick={() => !locked && onSelect(section.id)}
                        disabled={locked}
                        aria-current={section.id === selectedId ? 'true' : undefined}
                        title={locked ? 'Finish the sections above to unlock this one' : section.title}
                      >
                        <span className="pm-course-learn-rail-num">{index + 1}</span>
                        <i className={meta.icon} aria-hidden="true" />
                        <span className="pm-course-learn-rail-title">{section.title}</span>
                        {locked && <i className="fas fa-lock" aria-hidden="true" title="Locked" />}
                        {!locked && done && <i className="fas fa-circle-check" aria-hidden="true" title="Completed" />}
                        {!section.isRequired && <span className="cpm-tag">Optional</span>}
                      </button>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        );
      })}
    </nav>
  );
}

export default function CoursePlayerPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // The editor's Preview link. Honoured server-side for the author/admin only:
  // every section unlocked, and no enrollment created — otherwise checking your
  // own course puts you in its completion matrix as a learner who never
  // finished. Progress is not recorded in this mode.
  const preview = searchParams.get('preview') === '1';

  const [course, setCourse] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [completing, setCompleting] = useState(false);
  // In-video pop-ups for the selected VIDEO section (learner-safe shape).
  const [popups, setPopups] = useState([]);
  // Mirrors selectedId so `load` can read the current selection without taking a
  // dependency on it (which would re-arm the initial-load effect on every click).
  const selectedIdRef = useRef(null);
  selectedIdRef.current = selectedId;

  /**
   * Which section should be open after a refetch.
   *
   * Deliberately a plain function of the payload rather than a `setSelectedId`
   * updater: the previous version read an "advance" ref inside the updater, but
   * cleared that ref in `load`'s `finally` — which runs synchronously, before
   * React ever invokes the updater during render. The advance branch therefore
   * read `false` every time and completing a section never moved the learner on.
   */
  const nextSelection = useCallback((payload, { preserveSelection, advance }) => {
    const sections = payload?.sections ?? [];
    if (!sections.length) return null;

    const currentIndex = preserveSelection
      ? sections.findIndex((s) => s.id === selectedIdRef.current && !s.locked)
      : -1;

    if (currentIndex >= 0) {
      const current = sections[currentIndex];
      if (!advance) return current.id;
      // The server returns sections ordered by (module order, section order), so
      // "after this one" is simply a later array index — which is what makes
      // advancing across a module boundary land in the right place. Comparing
      // `order` here would compare two different modules' local indices.
      const onward = sections
        .slice(currentIndex + 1)
        .find((s) => !s.locked && s.status !== 'COMPLETED');
      return (onward ?? current).id;
    }

    const firstOpen = sections.find((s) => !s.locked && s.status !== 'COMPLETED');
    const resume = sections.find((s) => s.id === payload.enrollment?.lastSectionId && !s.locked);
    return (firstOpen ?? resume ?? sections.find((s) => !s.locked) ?? sections[0])?.id ?? null;
  }, []);

  const load = useCallback(async ({ preserveSelection = true, advance = false } = {}) => {
    try {
      const payload = await getLearnerCourse(slug, { preview });
      setCourse(payload);
      setError(null);
      setSelectedId(nextSelection(payload, { preserveSelection, advance }));
      return payload;
    } catch (err) {
      setError(err.message ?? 'Could not load this course');
      return null;
    } finally {
      setLoading(false);
    }
  }, [slug, preview, nextSelection]);

  useEffect(() => { setLoading(true); load({ preserveSelection: false }); }, [load]);

  const sections = useMemo(() => course?.sections ?? [], [course]);
  const modules = useMemo(() => course?.modules ?? [], [course]);
  const selected = useMemo(
    () => sections.find((s) => s.id === selectedId) ?? null,
    [sections, selectedId]
  );

  // Pop-up questions are only meaningful for a VIDEO section, and only once it
  // is unlocked (a locked section has no videoConfig to play anyway).
  useEffect(() => {
    if (!selected || selected.kind !== 'VIDEO' || selected.locked) { setPopups([]); return undefined; }
    let cancelled = false;
    listCourseQuestions(selected.id)
      .then((rows) => {
        if (cancelled) return;
        setPopups((Array.isArray(rows) ? rows : []).filter((q) => q.videoTimestampSec != null));
      })
      .catch(() => { if (!cancelled) setPopups([]); });
    return () => { cancelled = true; };
  }, [selected]);

  // CONTENT + VIDEO completion. The response carries the reward envelope, which
  // clubPmClient turns into the RewardFlux / quest / rank events — if particles
  // do not fly, the response shape is wrong, not this call site.
  const handleComplete = useCallback(async (sectionId, { advance = true } = {}) => {
    if (completing) return;
    setCompleting(true);
    try {
      const res = await completeCourseSection(sectionId);
      if (!res?.alreadyComplete) toast.success('Section complete');
      await load({ advance });
    } catch (err) {
      toast.error(err.message ?? 'Could not mark that section complete');
    } finally {
      setCompleting(false);
    }
  }, [completing, load]);

  const handleQuizPassed = useCallback(async () => {
    await load({ advance: true });
  }, [load]);

  if (loading) {
    return (
      <div className="clubpm-app pm-course-learn">
        <OrbitLoader />
      </div>
    );
  }

  if (error || !course) {
    return (
      <div className="clubpm-app pm-course-learn">
        <button className="clubpm-btn-secondary" onClick={() => navigate('/clubpm/outreach')}>
          <i className="fas fa-arrow-left" aria-hidden="true" /> Back to Outreach
        </button>
        <p className="pm-course-learn-error">
          <i className="fas fa-triangle-exclamation" aria-hidden="true" /> {error ?? 'Course not found'}
        </p>
      </div>
    );
  }

  const completedCount = sections.filter((s) => s.status === 'COMPLETED').length;
  const pct = sections.length ? Math.round((completedCount / sections.length) * 100) : 0;

  return (
    <div className="clubpm-app pm-course-learn">
      <header className="pm-course-learn-header">
        <button className="clubpm-btn-secondary" onClick={() => navigate('/clubpm/outreach')}>
          <i className="fas fa-arrow-left" aria-hidden="true" /> Back to Outreach
        </button>
        <div className="pm-course-learn-heading">
          <h1>
            <i className="fas fa-graduation-cap" aria-hidden="true" /> {course.title}
          </h1>
          {course.summary && <p className="pm-course-learn-summary">{course.summary}</p>}
        </div>
        <div className="pm-course-learn-progress">
          {course.preview && (
            <span className="cpm-tag pm-course-preview-tag">
              <i className="fas fa-eye" aria-hidden="true" /> Author preview — every section unlocked, nothing recorded
            </span>
          )}
          <div className="cpm-progress-bar">
            <div className="cpm-progress-bar-fill" style={{ width: `${pct}%` }} />
          </div>
          <span>{completedCount} of {sections.length} sections</span>
          {course.enrollment?.dueDate && (
            <span className="cpm-tag">
              Due {new Date(course.enrollment.dueDate).toLocaleDateString()}
            </span>
          )}
          {course.enrollment?.completedAt && (
            <span className="cpm-tag"><i className="fas fa-trophy" aria-hidden="true" /> Completed</span>
          )}
        </div>
      </header>

      <div className="pm-course-learn-body">
        <LearnerRail modules={modules} sections={sections} selectedId={selectedId} onSelect={setSelectedId} />

        <main className="pm-course-learn-main">
          {!selected ? (
            <p className="pm-course-learn-empty">This course has no sections yet.</p>
          ) : (
            <>
              <h2 className="pm-course-learn-section-title">{selected.title}</h2>

              {selected.kind === 'VIDEO' && (
                <LockedVideoPlayer
                  // Keyed on the section so switching tears the YouTube player
                  // down rather than reusing one pointed at the previous video.
                  key={selected.id}
                  sectionId={selected.id}
                  videoConfig={selected.videoConfig}
                  initialMaxWatchedSec={selected.maxWatchedSec}
                  questions={popups}
                  answeredPopupIds={selected.answeredPopupIds}
                  // In author preview there is no enrollment to write progress
                  // against, so the player must not ping the server or complete.
                  preview={course.preview}
                  onComplete={() => handleComplete(selected.id)}
                />
              )}

              {/* Prose for CONTENT sections, and the notes under a video.
                  Rendering `contentJson` through the editor read-only is what
                  keeps a second renderer from having to track blogRender.ts. */}
              {selected.kind !== 'QUIZ' && selected.contentJson && (
                <div className="pm-course-learn-reader">
                  <BlogEditor
                    key={`reader-${selected.id}`}
                    content={selected.contentJson}
                    editable={false}
                    theme={course.theme}
                  />
                </div>
              )}

              {selected.kind === 'QUIZ' && (
                <CourseQuizRunner
                  key={selected.id}
                  section={selected}
                  preview={course.preview}
                  onPassed={handleQuizPassed}
                />
              )}

              {selected.kind === 'CONTENT' && !course.preview && (
                <div className="pm-course-learn-actions">
                  {selected.status === 'COMPLETED' ? (
                    <span className="cpm-tag">
                      <i className="fas fa-circle-check" aria-hidden="true" /> Completed
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="clubpm-btn-primary"
                      onClick={() => handleComplete(selected.id)}
                      disabled={completing}
                    >
                      {completing ? 'Saving…' : 'Mark complete & continue'}
                    </button>
                  )}
                </div>
              )}

              {selected.kind === 'VIDEO' && selected.status === 'COMPLETED' && (
                <div className="pm-course-learn-actions">
                  <span className="cpm-tag">
                    <i className="fas fa-circle-check" aria-hidden="true" /> Completed
                  </span>
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
