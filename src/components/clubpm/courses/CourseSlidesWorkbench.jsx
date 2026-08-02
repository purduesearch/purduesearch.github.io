import React, { useState, useEffect, useRef, useCallback } from 'react';
import toast from 'react-hot-toast';
import {
  listCourseSlides, saveCourseSlideMeta, clearCourseDeck, getSlideCapabilities,
  uploadCourseAudio, clearCourseAudio,
  listCourseQuestions, saveCourseQuestion, deleteCourseQuestion,
  proxyImageSrc,
} from '../../../api/clubPmClient';
import QuestionForm from './QuestionForm';
import { blankQuestion, serializeQuestion, validateQuestion } from './questionModel';
import { importDeck } from './deckImport';

const SOURCE_TABS = [
  { key: 'PDF',     label: 'Upload PDF',        icon: 'fas fa-file-pdf',        accept: 'application/pdf' },
  { key: 'PPTX',    label: 'Upload PowerPoint', icon: 'fas fa-file-powerpoint', accept: '.pptx,.ppt,application/vnd.openxmlformats-officedocument.presentationml.presentation' },
  { key: 'GSLIDES', label: 'Google Slides link', icon: 'fas fa-link' },
];

function formatClock(sec) {
  if (sec == null || !Number.isFinite(sec)) return '—';
  const whole = Math.max(0, Math.floor(sec));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

function SlideQuestionCard({
  question, canEdit, expanded, busy, stray, slideCount,
  onToggle, onChange, onSave, onDelete,
}) {
  return (
    <div className={`pm-course-question-card${expanded ? ' is-open' : ''}`}>
      <div className="pm-course-question-head">
        <button type="button" className="pm-course-question-toggle" onClick={onToggle} aria-expanded={expanded}>
          <span className="pm-course-question-num">Slide {(question.slideIndex ?? 0) + 1}</span>
          <span className="pm-course-question-summary">
            {(question.prompt ?? '').trim() || <em>Untitled question</em>}
          </span>
          {stray && (
            <span
              className="pm-course-question-stray"
              title={`This deck only has ${slideCount} slide${slideCount === 1 ? '' : 's'} — the learner sees this on the last one.`}
            >
              <i className="fas fa-triangle-exclamation" aria-hidden="true" /> past the end of the deck
            </span>
          )}
          {!question.id && <span className="cpm-blog-dirty">Unsaved</span>}
          <i className={`fas ${expanded ? 'fa-chevron-up' : 'fa-chevron-down'}`} aria-hidden="true" />
        </button>
        {canEdit && (
          <button
            type="button"
            className="pm-course-rail-del"
            onClick={onDelete}
            disabled={busy}
            title="Delete question"
            aria-label={`Delete the question on slide ${(question.slideIndex ?? 0) + 1}`}
          >
            <i className="fas fa-trash" aria-hidden="true" />
          </button>
        )}
      </div>

      {expanded && (
        <>
          <div className="cpm-blog-meta-field">
            <label className="cpm-form-label">Shows on slide</label>
            <input
              type="number"
              className="cpm-form-input"
              min={1}
              max={Math.max(1, slideCount)}
              value={(question.slideIndex ?? 0) + 1}
              onChange={(e) => {
                const n = Number.parseInt(e.target.value, 10);
                onChange({ ...question, slideIndex: Number.isFinite(n) ? Math.max(0, n - 1) : 0 });
              }}
              disabled={!canEdit}
            />
            <span className="cpm-blog-meta-hint">
              The learner cannot move past this slide until the question is answered.
            </span>
          </div>

          {/* Same authoring body as the quiz builder and video pop-ups. */}
          <QuestionForm question={question} onChange={onChange} disabled={!canEdit} />

          {canEdit && (
            <div className="pm-course-question-actions">
              <button type="button" className="clubpm-btn-primary" onClick={onSave} disabled={busy}>
                {busy ? 'Saving…' : 'Save question'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/**
 * The main-column authoring surface for a SLIDES section: deck import, per-slide
 * notes, a narration track the author syncs by tapping, and overlay questions.
 *
 * Contract matches CourseVideoWorkbench exactly — `{ section, canEdit,
 * onUpdateSection }` — and, like it, the section's prose body is NOT rendered
 * here; the editor page keeps that, collapsed, beneath this component.
 *
 * @param {object}   section
 * @param {boolean}  canEdit
 * @param {Function} onUpdateSection (sectionId, patch) => Promise
 */
export default function CourseSlidesWorkbench({ section, canEdit = false, onUpdateSection }) {
  const sectionId = section?.id;
  const config = section?.slideConfig ?? {};

  const [slides, setSlides] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(false);

  const [sourceTab, setSourceTab] = useState('PDF');
  const [linkUrl, setLinkUrl] = useState('');
  const [caps, setCaps] = useState({ canImportLink: false, botEmail: null });
  const [progress, setProgress] = useState(null); // { done, total, label }
  const abortRef = useRef(null);

  const [audioPct, setAudioPct] = useState(null);
  const audioRef = useRef(null);

  const [questions, setQuestions] = useState([]);
  const [expandedKey, setExpandedKey] = useState(null);
  const [busyKey, setBusyKey] = useState(null);

  // `slideConfig` is one JSON column written by both the source row and the
  // audio row, so every write must spread whatever the other one put there.
  const configRef = useRef(config);
  configRef.current = config;

  const patchConfig = useCallback(async (patch) => {
    try {
      await onUpdateSection?.(sectionId, {
        slideConfig: { ...(configRef.current ?? {}), ...patch },
      });
    } catch {
      toast.error('Could not save slide settings');
    }
  }, [sectionId, onUpdateSection]);

  // ── Load ───────────────────────────────────────────────────

  useEffect(() => {
    if (!sectionId) return undefined;
    let cancelled = false;
    setLoading(true);
    Promise.all([listCourseSlides(sectionId), listCourseQuestions(sectionId)])
      .then(([slideRows, questionRows]) => {
        if (cancelled) return;
        const list = Array.isArray(slideRows) ? slideRows : [];
        setSlides(list);
        setSelectedId(list[0]?.id ?? null);
        // Only slide-anchored questions belong here; untimed ones are a quiz.
        setQuestions(
          (Array.isArray(questionRows) ? questionRows : [])
            .filter((q) => q.slideIndex != null)
            .sort((a, b) => a.slideIndex - b.slideIndex)
            .map((q) => ({
              ...q,
              _key: q.id,
              prompt: q.prompt ?? '',
              explanation: q.explanation ?? '',
              answers: (q.answers ?? []).map((a, i) => ({ ...a, _key: a.id ?? `a-${i}` })),
            }))
        );
      })
      .catch(() => { if (!cancelled) toast.error('Could not load this deck'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [sectionId]);

  useEffect(() => {
    let cancelled = false;
    getSlideCapabilities()
      .then((c) => { if (!cancelled) setCaps(c ?? { canImportLink: false, botEmail: null }); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Abort an import still running when the author navigates away, so its upload
  // loop stops instead of writing pages into a section nobody is looking at.
  useEffect(() => () => { abortRef.current?.abort(); }, []);

  // ── Import ─────────────────────────────────────────────────

  const runImport = useCallback(async ({ file, url }) => {
    if (!canEdit || !sectionId || progress) return;
    if (slides.length && !window.confirm(
      `Replace the current ${slides.length}-slide deck? The existing slides are removed once the new deck finishes importing.`
    )) return;

    const controller = new AbortController();
    abortRef.current = controller;
    setProgress({ done: 0, total: 0, label: 'Converting…' });

    // Old rows are deleted by id AFTER the import succeeds. A section-wide clear
    // would delete the pages this import just stored.
    const previousIds = slides.map((s) => s.id);
    try {
      const result = await importDeck({
        sectionId, file, url, signal: controller.signal, onProgress: setProgress,
      });
      if (previousIds.length) await clearCourseDeck(sectionId, previousIds);
      setSlides(result.slides);
      setSelectedId(result.slides[0]?.id ?? null);
      await patchConfig({ sourceKind: result.sourceKind, sourceName: result.sourceName });
      toast.success(`Imported ${result.slides.length} slide${result.slides.length === 1 ? '' : 's'}`);
    } catch (err) {
      // The previous deck is untouched on every failure path, including cancel —
      // the delete above only runs after a complete import.
      toast.error(err?.name === 'AbortError' ? 'Import cancelled' : (err?.message || 'Import failed'));
      // A cancelled run may still have stored some pages; re-read rather than
      // guess at what landed.
      listCourseSlides(sectionId).then((rows) => setSlides(Array.isArray(rows) ? rows : [])).catch(() => {});
    } finally {
      abortRef.current = null;
      setProgress(null);
    }
  }, [canEdit, sectionId, progress, slides, patchConfig]);

  const handleFilePick = (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // so re-picking the same file fires change again
    if (file) runImport({ file });
  };

  const handleLinkImport = () => {
    const url = linkUrl.trim();
    if (!url) { toast.error('Paste a Google Slides link first'); return; }
    runImport({ url });
  };

  // ── Slide meta ─────────────────────────────────────────────

  const selected = slides.find((s) => s.id === selectedId) ?? null;
  const saveTimer = useRef(null);
  const slidesRef = useRef(slides);
  slidesRef.current = slides;

  // Debounced whole-set write: the PUT takes every row, so batching edits keeps
  // a burst of taps from becoming a burst of requests.
  const queueMetaSave = useCallback(() => {
    if (!canEdit || !sectionId) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveCourseSlideMeta(
        sectionId,
        slidesRef.current.map((s) => ({ id: s.id, notes: s.notes ?? null, startSec: s.startSec ?? null }))
      ).catch(() => toast.error('Could not save slide details'));
    }, 600);
  }, [canEdit, sectionId]);

  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);

  const patchSlide = useCallback((id, patch) => {
    setSlides((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
    queueMetaSave();
  }, [queueMetaSave]);

  // ── Narration ──────────────────────────────────────────────

  const handleAudioPick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setAudioPct(0);
    try {
      const saved = await uploadCourseAudio(sectionId, file, setAudioPct);
      // The route returns the merged section row; mirror it locally through the
      // page so `section.slideConfig` and this surface stay in step.
      await patchConfig(saved?.slideConfig ?? {});
      toast.success('Narration uploaded');
    } catch (err) {
      toast.error(err?.message || 'Could not upload that audio');
    } finally {
      setAudioPct(null);
    }
  };

  const handleClearAudio = async () => {
    if (!window.confirm('Remove the narration track? Recorded slide times are kept.')) return;
    try {
      await clearCourseAudio(sectionId);
      await patchConfig({ audioUrl: null, audioFileId: null, audioDurationSec: null });
    } catch {
      toast.error('Could not remove that audio');
    }
  };

  /** Stamp the playhead onto the selected slide, then move to the next one. */
  const syncHere = useCallback(() => {
    if (!canEdit || !audioRef.current || !selected) return;
    const at = Math.max(0, Math.round(audioRef.current.currentTime));
    patchSlide(selected.id, { startSec: at });
    const i = slides.findIndex((s) => s.id === selected.id);
    if (i >= 0 && i + 1 < slides.length) setSelectedId(slides[i + 1].id);
  }, [canEdit, selected, slides, patchSlide]);

  // Space taps the current slide's start time in while the panel has focus.
  // Scoped to the panel so it cannot steal the spacebar from a notes textarea.
  const syncPanelRef = useRef(null);
  const onSyncKeyDown = (e) => {
    if (e.key !== ' ' && e.key !== 'Spacebar') return;
    if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;
    e.preventDefault();
    syncHere();
  };

  // ── Questions ──────────────────────────────────────────────

  const addQuestionHere = () => {
    const i = Math.max(0, slides.findIndex((s) => s.id === selectedId));
    const q = blankQuestion('SINGLE', { slideIndex: i });
    setQuestions((prev) => [...prev, q].sort((a, b) => (a.slideIndex ?? 0) - (b.slideIndex ?? 0)));
    setExpandedKey(q._key);
  };

  const handleSaveQuestion = async (key) => {
    const question = questions.find((q) => q._key === key);
    if (!question) return;
    const problem = validateQuestion(question);
    if (problem) { toast.error(problem); return; }
    if (question.slideIndex == null) { toast.error('An overlay question needs a slide.'); return; }
    setBusyKey(key);
    try {
      const index = questions.findIndex((q) => q._key === key);
      const saved = await saveCourseQuestion(sectionId, serializeQuestion(question, index));
      setQuestions((prev) => prev
        .map((q) => (q._key === key
          ? {
            ...saved,
            _key: saved.id ?? key,
            prompt: saved.prompt ?? '',
            explanation: saved.explanation ?? '',
            answers: (saved.answers ?? []).map((a, i) => ({ ...a, _key: a.id ?? `a-${i}` })),
          }
          : q))
        .sort((a, b) => (a.slideIndex ?? 0) - (b.slideIndex ?? 0)));
      setExpandedKey(saved.id ?? key);
      toast.success('Question saved');
    } catch (err) {
      toast.error(err.message ?? 'Could not save question');
    } finally {
      setBusyKey(null);
    }
  };

  const handleDeleteQuestion = async (question) => {
    if (!question.id) { setQuestions((prev) => prev.filter((q) => q._key !== question._key)); return; }
    if (!window.confirm('Delete this question?')) return;
    setBusyKey(question._key);
    try {
      await deleteCourseQuestion(sectionId, question.id);
      setQuestions((prev) => prev.filter((q) => q._key !== question._key));
    } catch {
      toast.error('Delete failed');
    } finally {
      setBusyKey(null);
    }
  };

  if (!section) return null;

  const linkDisabledTitle = caps.canImportLink
    ? undefined
    : `Ask an admin to reconnect Google Drive — ${caps.botEmail ?? 'the SEARCH bot account'} needs read access`;
  const pct = progress?.total ? Math.round((progress.done / progress.total) * 100) : 0;
  const importing = !!progress;

  return (
    <div className="pm-course-workbench pm-course-slides-workbench">
      {/* ── Source ─────────────────────────────────────────── */}
      <section className="pm-course-workbench-section">
        <h3 className="pm-course-workbench-title">
          <i className="fas fa-file-powerpoint" aria-hidden="true" /> Source
          {slides.length > 0 && (
            <span className="pm-course-workbench-count">
              {config.sourceName ? `${config.sourceName} — ` : ''}
              {slides.length} slide{slides.length === 1 ? '' : 's'}
            </span>
          )}
        </h3>

        <div className="pm-course-slides-source" role="tablist" aria-label="Deck source">
          {SOURCE_TABS.map((tab) => {
            const disabled = tab.key === 'GSLIDES' && !caps.canImportLink;
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={sourceTab === tab.key}
                className={`pm-course-slides-tab${sourceTab === tab.key ? ' is-selected' : ''}${disabled ? ' is-disabled' : ''}`}
                onClick={() => !disabled && setSourceTab(tab.key)}
                disabled={disabled}
                title={disabled ? linkDisabledTitle : undefined}
              >
                <i className={tab.icon} aria-hidden="true" /> {tab.label}
              </button>
            );
          })}
        </div>

        {sourceTab === 'GSLIDES' ? (
          <div className="pm-course-source-row">
            <div className="cpm-blog-meta-field">
              <label className="cpm-form-label">Google Slides link</label>
              <input
                className="cpm-form-input"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="https://docs.google.com/presentation/d/…"
                disabled={!canEdit || importing || !caps.canImportLink}
              />
              <span className="cpm-blog-meta-hint">
                Share the deck with {caps.botEmail ?? 'the SEARCH bot account'} — view access is enough.
              </span>
            </div>
            <button
              type="button"
              className="clubpm-btn-primary"
              onClick={handleLinkImport}
              disabled={!canEdit || importing || !caps.canImportLink}
            >
              <i className="fas fa-file-import" aria-hidden="true" /> Import deck
            </button>
          </div>
        ) : (
          <div className="pm-course-source-row">
            <label className={`clubpm-btn-secondary pm-course-slides-pick${!canEdit || importing ? ' is-disabled' : ''}`}>
              <i className="fas fa-upload" aria-hidden="true" />
              {slides.length ? ' Replace deck' : ' Choose a file'}
              <input
                type="file"
                accept={SOURCE_TABS.find((t) => t.key === sourceTab)?.accept}
                onChange={handleFilePick}
                disabled={!canEdit || importing}
                hidden
              />
            </label>
            <span className="cpm-blog-meta-hint">
              {sourceTab === 'PDF'
                ? 'Each page becomes one slide. Text is captured for search and screen readers.'
                : 'Converted through Google Drive, then paged the same way a PDF is.'}
            </span>
          </div>
        )}

        {importing && (
          <div className="pm-course-slides-progress">
            <div className="cpm-progress-bar">
              <div className="cpm-progress-bar-fill" style={{ width: `${pct}%` }} />
            </div>
            <span className="cpm-blog-meta-hint">{progress.label}</span>
            <button type="button" className="clubpm-btn-secondary" onClick={() => abortRef.current?.abort()}>
              <i className="fas fa-xmark" aria-hidden="true" /> Cancel
            </button>
          </div>
        )}
      </section>

      {/* ── Slides ─────────────────────────────────────────── */}
      <section className="pm-course-workbench-section">
        <h3 className="pm-course-workbench-title">
          <i className="fas fa-images" aria-hidden="true" /> Slides
        </h3>

        {loading ? (
          <p className="cpm-blog-meta-hint">Loading slides…</p>
        ) : slides.length === 0 ? (
          <p className="pm-course-workbench-empty">
            No deck yet. Import a PDF, a PowerPoint file, or a Google Slides link above.
          </p>
        ) : (
          <>
            <div className="pm-course-slide-grid">
              {slides.map((slide, i) => (
                <button
                  key={slide.id}
                  type="button"
                  className={`pm-course-slide-thumb${slide.id === selectedId ? ' is-selected' : ''}`}
                  onClick={() => setSelectedId(slide.id)}
                  aria-pressed={slide.id === selectedId}
                >
                  <img src={proxyImageSrc(slide.imageUrl)} alt={`Slide ${i + 1}`} loading="lazy" />
                  <span className="pm-course-slide-thumb-num">
                    {i + 1}
                    {slide.startSec != null && (
                      <em title="Narration start time"> · {formatClock(slide.startSec)}</em>
                    )}
                  </span>
                </button>
              ))}
            </div>

            {selected && (
              <div className="pm-course-slide-notes">
                <div className="cpm-blog-meta-field">
                  <label className="cpm-form-label">
                    Notes for slide {slides.findIndex((s) => s.id === selected.id) + 1}
                  </label>
                  <textarea
                    className="cpm-form-input"
                    rows={4}
                    value={selected.notes ?? ''}
                    onChange={(e) => patchSlide(selected.id, { notes: e.target.value })}
                    placeholder="Shown to the learner beneath this slide."
                    disabled={!canEdit}
                  />
                </div>
                <div className="cpm-blog-meta-field">
                  <label className="cpm-form-label">Narration start (seconds)</label>
                  <input
                    type="number"
                    className="cpm-form-input"
                    min={0}
                    value={selected.startSec ?? ''}
                    onChange={(e) => {
                      const raw = e.target.value;
                      patchSlide(selected.id, {
                        startSec: raw === '' ? null : Math.max(0, Number.parseInt(raw, 10) || 0),
                      });
                    }}
                    placeholder="—"
                    disabled={!canEdit}
                  />
                  <span className="cpm-blog-meta-hint">
                    Blank means this slide is never auto-selected by the narration.
                  </span>
                </div>
              </div>
            )}
          </>
        )}
      </section>

      {/* ── Narration ──────────────────────────────────────── */}
      <section
        className="pm-course-workbench-section pm-course-slide-sync"
        ref={syncPanelRef}
        onKeyDown={onSyncKeyDown}
        tabIndex={-1}
      >
        <h3 className="pm-course-workbench-title">
          <i className="fas fa-microphone-lines" aria-hidden="true" /> Narration
        </h3>

        {config.audioUrl ? (
          <>
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <audio
              ref={audioRef}
              src={config.audioUrl}
              controls
              preload="metadata"
              onLoadedMetadata={(e) => {
                // Guarded on canEdit: a read-only viewer's PATCH is refused, and
                // without this every load hands them a failure toast.
                if (!canEdit) return;
                const d = e.currentTarget.duration;
                if (Number.isFinite(d) && Math.round(d) !== config.audioDurationSec) {
                  patchConfig({ audioDurationSec: Math.round(d) });
                }
              }}
            />
            <div className="pm-course-question-actions">
              <button
                type="button"
                className="clubpm-btn-primary"
                onClick={syncHere}
                disabled={!canEdit || !selected}
                title="Records the playhead as this slide's start time, then selects the next slide (Space)"
              >
                <i className="fas fa-thumbtack" aria-hidden="true" /> Slide starts here
              </button>
              {canEdit && (
                <button type="button" className="clubpm-btn-secondary" onClick={handleClearAudio}>
                  <i className="fas fa-trash" aria-hidden="true" /> Remove narration
                </button>
              )}
            </div>
            <span className="cpm-blog-meta-hint">
              Play the track and tap “Slide starts here” as each slide comes up — Space does the same
              while this panel has focus. {slides.filter((s) => s.startSec != null).length} of{' '}
              {slides.length} slides synced.
            </span>
          </>
        ) : (
          <div className="pm-course-source-row">
            <label className={`clubpm-btn-secondary pm-course-slides-pick${!canEdit || audioPct != null ? ' is-disabled' : ''}`}>
              <i className="fas fa-upload" aria-hidden="true" /> Upload narration
              <input type="file" accept="audio/*" onChange={handleAudioPick} disabled={!canEdit || audioPct != null} hidden />
            </label>
            <span className="cpm-blog-meta-hint">
              Optional. One audio file for the whole deck; slides advance on the times you record.
            </span>
          </div>
        )}

        {audioPct != null && (
          <div className="cpm-progress-bar">
            <div className="cpm-progress-bar-fill" style={{ width: `${audioPct}%` }} />
          </div>
        )}
      </section>

      {/* ── Overlay questions ──────────────────────────────── */}
      <section className="pm-course-workbench-section">
        <h3 className="pm-course-workbench-title">
          <i className="fas fa-circle-question" aria-hidden="true" /> Overlay questions
          <span className="pm-course-workbench-count">
            {questions.length === 0 ? 'none — the deck pages straight through' : `${questions.length} in the deck`}
          </span>
        </h3>

        {questions.length === 0 ? (
          <p className="pm-course-workbench-empty">
            No questions yet. One placed on a slide blocks the learner there until it is answered.
          </p>
        ) : (
          <div className="pm-course-question-list">
            {questions.map((question) => (
              <SlideQuestionCard
                key={question._key}
                question={question}
                canEdit={canEdit}
                busy={busyKey === question._key}
                slideCount={slides.length}
                // A re-import can shorten the deck. The server clamps rather than
                // deletes, so flag it here instead of losing the author's work.
                stray={slides.length > 0 && (question.slideIndex ?? 0) >= slides.length}
                expanded={expandedKey === question._key}
                onToggle={() => setExpandedKey((k) => (k === question._key ? null : question._key))}
                onChange={(next) => setQuestions((prev) => prev.map((q) => (q._key === question._key ? next : q)))}
                onSave={() => handleSaveQuestion(question._key)}
                onDelete={() => handleDeleteQuestion(question)}
              />
            ))}
          </div>
        )}

        {canEdit && (
          <div className="pm-course-question-actions">
            <button
              type="button"
              className="clubpm-btn-secondary"
              onClick={addQuestionHere}
              disabled={!slides.length}
              title={slides.length ? 'Seeds the slide from your current selection' : 'Import a deck first'}
            >
              <i className="fas fa-plus" aria-hidden="true" /> Add question on this slide
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
