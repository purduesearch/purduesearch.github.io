import React, { useState, useEffect, useCallback, useMemo } from 'react';
import toast from 'react-hot-toast';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { listCourseQuestions, replaceCourseQuestions } from '../../../api/clubPmClient';
import QuestionForm from './QuestionForm';
import {
  QUESTION_KINDS, blankQuestion, hydrate, serializeQuestion, validateQuestion,
} from './questionModel';

const DEFAULT_PASS_THRESHOLD = 80;

function SortableQuestion({ question, index, canEdit, expanded, onToggle, onChange, onDelete }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: question._key, disabled: !canEdit });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const meta = QUESTION_KINDS[question.kind] ?? QUESTION_KINDS.SINGLE;

  return (
    <div ref={setNodeRef} style={style} className={`pm-course-question-card${expanded ? ' is-open' : ''}`}>
      <div className="pm-course-question-head">
        {canEdit && (
          <i
            className="fas fa-grip-vertical pm-course-rail-grip"
            aria-hidden="true"
            {...attributes}
            {...listeners}
          />
        )}
        <button type="button" className="pm-course-question-toggle" onClick={onToggle} aria-expanded={expanded}>
          <span className="pm-course-question-num">{index + 1}</span>
          <span className="pm-course-question-summary">
            {(question.prompt ?? '').trim() || <em>Untitled question</em>}
          </span>
          <span className="cpm-course-kind-badge" title={meta.label}>
            <i className={meta.icon} aria-hidden="true" />
          </span>
          <i className={`fas ${expanded ? 'fa-chevron-up' : 'fa-chevron-down'}`} aria-hidden="true" />
        </button>
        {canEdit && (
          <button
            type="button"
            className="pm-course-rail-del"
            onClick={onDelete}
            title="Delete question"
            aria-label={`Delete question ${index + 1}`}
          >
            <i className="fas fa-trash" aria-hidden="true" />
          </button>
        )}
      </div>
      {expanded && <QuestionForm question={question} onChange={onChange} disabled={!canEdit} />}
    </div>
  );
}

/**
 * The main-column authoring surface for a QUIZ section: pass mark, attempt
 * limit, and the ordered question set.
 *
 * A quiz section has no document — CoursePlayerPage never renders `contentJson`
 * for this kind — so unlike CONTENT and VIDEO this surface is the whole column.
 *
 * @param {object}   section
 * @param {boolean}  canEdit
 * @param {Function} onUpdateSection (sectionId, patch) => Promise — passThreshold / maxAttempts
 * @param {Function} onDirtyChange   (isDirty) => void — lets the page guard section switches
 */
export default function CourseQuizBuilder({ section, canEdit = false, onUpdateSection, onDirtyChange }) {
  const [questions, setQuestions] = useState([]);
  const [expandedKey, setExpandedKey] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [passThreshold, setPassThreshold] = useState(section?.passThreshold ?? DEFAULT_PASS_THRESHOLD);
  // Blank = unlimited attempts, which is a distinct value from 0 — keep it as a
  // string so an empty input round-trips to null rather than to NaN.
  const [maxAttempts, setMaxAttempts] = useState(
    section?.maxAttempts == null ? '' : String(section.maxAttempts)
  );

  const sectionId = section?.id;

  // The page needs to know about unsaved questions: its own `dirty` flag only
  // covers the autosaved title fields, so without this, switching sections
  // would drop question edits silently.
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

  useEffect(() => {
    setPassThreshold(section?.passThreshold ?? DEFAULT_PASS_THRESHOLD);
    setMaxAttempts(section?.maxAttempts == null ? '' : String(section.maxAttempts));
  }, [section?.id, section?.passThreshold, section?.maxAttempts]);

  useEffect(() => {
    if (!sectionId) return undefined;
    let cancelled = false;
    setLoading(true);
    listCourseQuestions(sectionId)
      .then((rows) => {
        if (cancelled) return;
        // Pop-up questions belong to the video workbench; a quiz section shows
        // only the untimed ones.
        const list = (Array.isArray(rows) ? rows : [])
          .filter((q) => q.videoTimestampSec == null)
          .map(hydrate);
        setQuestions(list);
        setExpandedKey(list[0]?._key ?? null);
        setDirty(false);
      })
      .catch(() => { if (!cancelled) toast.error('Could not load questions'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [sectionId]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const keys = useMemo(() => questions.map((q) => q._key), [questions]);

  const totalPoints = useMemo(
    () => questions.reduce((sum, q) => sum + (Number(q.points) || 1), 0),
    [questions]
  );

  const handleDragEnd = useCallback((event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setQuestions((prev) => {
      const from = prev.findIndex((q) => q._key === active.id);
      const to = prev.findIndex((q) => q._key === over.id);
      if (from < 0 || to < 0) return prev;
      const next = prev.slice();
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
    setDirty(true);
  }, []);

  const handleAdd = () => {
    const q = blankQuestion();
    setQuestions((prev) => [...prev, q]);
    setExpandedKey(q._key);
    setDirty(true);
  };

  const handleChange = (key, next) => {
    setQuestions((prev) => prev.map((q) => (q._key === key ? next : q)));
    setDirty(true);
  };

  const handleDelete = (key) => {
    setQuestions((prev) => prev.filter((q) => q._key !== key));
    setDirty(true);
  };

  const persistSectionField = async (patch) => {
    try {
      await onUpdateSection?.(sectionId, patch);
    } catch {
      toast.error('Could not save quiz settings');
    }
  };

  // PUT replaces the whole set, so the payload must carry every question the
  // section should still have after the write. `serializeQuestion` forwards each
  // saved question's `id`, which is what lets the server update it in place —
  // recreating it would cascade its response rows away and reset the admin item
  // analysis. Scope 'quiz' keeps the delete off this section's in-video pop-ups,
  // which this surface never loads.
  const handleSave = async () => {
    for (const q of questions) {
      const problem = validateQuestion(q);
      if (problem) { toast.error(problem); return; }
    }
    setSaving(true);
    try {
      const saved = await replaceCourseQuestions(sectionId, questions.map(serializeQuestion), 'quiz');
      const list = (Array.isArray(saved) ? saved : [])
        .filter((q) => q.videoTimestampSec == null)
        .map(hydrate);
      setQuestions(list);
      setDirty(false);
      toast.success('Questions saved');
    } catch (err) {
      toast.error(err.message ?? 'Could not save questions');
    } finally {
      setSaving(false);
    }
  };

  if (!section) return null;

  return (
    <div className="pm-course-workbench pm-course-quiz-builder">
      <section className="pm-course-workbench-section">
        <h3 className="pm-course-workbench-title">
          <i className="fas fa-list-check" aria-hidden="true" /> Grading
        </h3>
        <div className="pm-course-question-row">
          <div className="cpm-blog-meta-field">
            <label className="cpm-form-label">Pass mark (%)</label>
            <input
              type="number"
              min={0}
              max={100}
              className="cpm-form-input"
              value={passThreshold}
              onChange={(e) => setPassThreshold(e.target.value)}
              onBlur={() => {
                const clamped = Math.min(100, Math.max(0, Number(passThreshold) || 0));
                setPassThreshold(clamped);
                persistSectionField({ passThreshold: clamped });
              }}
              disabled={!canEdit}
            />
          </div>
          <div className="cpm-blog-meta-field">
            <label className="cpm-form-label">Max attempts</label>
            <input
              type="number"
              min={1}
              className="cpm-form-input"
              value={maxAttempts}
              onChange={(e) => setMaxAttempts(e.target.value)}
              onBlur={() => {
                const raw = maxAttempts.trim?.() ?? String(maxAttempts);
                const value = raw === '' ? null : Math.max(1, Number(raw) || 1);
                setMaxAttempts(value == null ? '' : String(value));
                persistSectionField({ maxAttempts: value });
              }}
              placeholder="Unlimited"
              disabled={!canEdit}
            />
            <span className="cpm-blog-meta-hint">Leave blank for unlimited retries.</span>
          </div>
        </div>
      </section>

      <section className="pm-course-workbench-section">
        <h3 className="pm-course-workbench-title">
          <i className="fas fa-circle-question" aria-hidden="true" /> Questions
          <span className="pm-course-workbench-count">
            {questions.length === 0
              ? 'none yet'
              : `${questions.length} question${questions.length === 1 ? '' : 's'} · ${totalPoints} point${totalPoints === 1 ? '' : 's'} · pass at ${Number(passThreshold) || 0}%`}
          </span>
        </h3>

        {loading ? (
          <p className="cpm-blog-meta-hint">Loading questions…</p>
        ) : questions.length === 0 ? (
          <p className="pm-course-workbench-empty">
            No questions yet. A quiz section with no questions cannot be completed by a learner.
          </p>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={keys} strategy={verticalListSortingStrategy}>
              <div className="pm-course-question-list">
                {questions.map((question, index) => (
                  <SortableQuestion
                    key={question._key}
                    question={question}
                    index={index}
                    canEdit={canEdit}
                    expanded={expandedKey === question._key}
                    onToggle={() => setExpandedKey((k) => (k === question._key ? null : question._key))}
                    onChange={(next) => handleChange(question._key, next)}
                    onDelete={() => handleDelete(question._key)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}

        {canEdit && (
          <div className="pm-course-question-actions">
            <button type="button" className="clubpm-btn-secondary" onClick={handleAdd} disabled={saving}>
              <i className="fas fa-plus" aria-hidden="true" /> Add question
            </button>
            <button type="button" className="clubpm-btn-primary" onClick={handleSave} disabled={saving || !dirty}>
              {saving ? 'Saving…' : 'Save quiz'}
            </button>
            {dirty && <span className="cpm-blog-dirty">Unsaved questions</span>}
          </div>
        )}
      </section>
    </div>
  );
}
