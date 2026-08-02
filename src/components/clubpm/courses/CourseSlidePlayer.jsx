import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { recordCourseSlideProgress, answerCoursePopup, proxyImageSrc } from '../../../api/clubPmClient';

// The learner's deck. Structurally parallel to LockedVideoPlayer: a stage, a
// progress ping, and question overlays that block forward movement — but with
// slide indices where that component has timestamps.
//
// There is no seek lock. A deck has no watch time to fabricate, so the server's
// clamp is monotonic-and-in-range and nothing here needs to police scrubbing.

function formatClock(sec) {
  const whole = Math.max(0, Math.floor(Number(sec) || 0));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

/**
 * The overlay question. Same markup family as the video pop-up — answers arrive
 * already stripped of `isCorrect`, and the explanation only exists in the grade
 * response — but anchored over the slide stage rather than the player.
 */
function SlideQuestionOverlay({
  question, result, busy, selected, onToggle, onSubmit, onRetry, onContinue,
}) {
  const multi = question.kind === 'MULTI';
  return (
    <div className="pm-course-slide-overlay" role="dialog" aria-modal="true" aria-label="Question">
      <div className={`pm-course-popup${result ? ' is-answered' : ''}`}>
        <div className="pm-course-popup-head">
          <i className="fas fa-circle-question" aria-hidden="true" />
          <span>{multi ? 'Select all that apply' : 'Question'}</span>
        </div>
        <p className="pm-course-popup-prompt">{question.prompt}</p>

        <ul className="pm-course-popup-answers">
          {(question.answers ?? []).map((answer) => (
            <li key={answer.id}>
              <label className="pm-course-popup-answer">
                <input
                  type={multi ? 'checkbox' : 'radio'}
                  name={`slide-q-${question.id}`}
                  checked={selected.includes(answer.id)}
                  onChange={() => onToggle(answer.id)}
                  disabled={busy || Boolean(result)}
                />
                <span>{answer.text}</span>
              </label>
            </li>
          ))}
        </ul>

        {result && (
          <div
            className={`pm-course-popup-result${result.correct ? ' is-correct' : ' is-wrong'}`}
            role="status"
            aria-live="polite"
          >
            <strong>
              <i className={`fas ${result.correct ? 'fa-check' : 'fa-xmark'}`} aria-hidden="true" />
              {result.correct ? ' Correct' : ' Not quite'}
            </strong>
            {result.explanation && <p>{result.explanation}</p>}
          </div>
        )}

        <div className="pm-course-popup-actions">
          {!result && (
            <button
              type="button"
              className="clubpm-btn-primary"
              onClick={onSubmit}
              disabled={busy || selected.length === 0}
            >
              {busy ? 'Checking…' : 'Submit'}
            </button>
          )}
          {result?.correct && (
            <button type="button" className="clubpm-btn-primary" onClick={onContinue} autoFocus>
              Continue
              <i className="fas fa-arrow-right" aria-hidden="true" style={{ marginLeft: 6 }} />
            </button>
          )}
          {result && !result.correct && (
            <button type="button" className="clubpm-btn-secondary" onClick={onRetry}>
              Try again
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * @param {string}   sectionId            CourseSection id — omit (or set preview) to skip server calls
 * @param {Array}    slides               [{ id, index, imageUrl, text, notes, startSec, width, height }]
 * @param {object}   slideConfig          { audioUrl, audioDurationSec, autoAdvance, … }
 * @param {number}   initialMaxSlideIndex persisted high-water mark
 * @param {Array}    questions            overlay questions (learner-safe shape, `slideIndex` set)
 * @param {string[]} answeredPopupIds     questions already answered correctly
 * @param {boolean}  preview              author preview: no persistence, no completion
 * @param {Function} onComplete           fired once when the deck's requirements are met
 */
export default function CourseSlidePlayer({
  sectionId,
  slides = [],
  slideConfig,
  initialMaxSlideIndex = 0,
  questions = [],
  answeredPopupIds = [],
  preview = false,
  onComplete,
}) {
  const config = slideConfig ?? {};
  const audioUrl = config.audioUrl ?? null;
  const total = slides.length;

  const [index, setIndex] = useState(() => (
    Math.max(0, Math.min(Number(initialMaxSlideIndex) || 0, Math.max(0, total - 1)))
  ));
  const [maxIndex, setMaxIndex] = useState(() => Math.max(0, Number(initialMaxSlideIndex) || 0));
  const [answered, setAnswered] = useState(() => (Array.isArray(answeredPopupIds) ? answeredPopupIds : []));
  const [autoAdvance, setAutoAdvance] = useState(config.autoAdvance !== false);

  const [selected, setSelected] = useState([]);
  const [result, setResult] = useState(null);
  const [grading, setGrading] = useState(false);

  const audioRef = useRef(null);
  // The timeupdate handler must read the live index without re-arming itself on
  // every slide change.
  const indexRef = useRef(index);
  indexRef.current = index;

  const persist = !preview && Boolean(sectionId);

  const overlays = useMemo(() => (
    (Array.isArray(questions) ? questions : []).filter((q) => q.slideIndex != null)
  ), [questions]);

  // The question standing in front of the learner right now, if any. A slide can
  // hold more than one; they are cleared in order.
  const blocker = useMemo(
    () => overlays.find((q) => q.slideIndex === index && !answered.includes(q.id)) ?? null,
    [overlays, index, answered]
  );
  const blockerRef = useRef(blocker);
  blockerRef.current = blocker;

  const slide = slides[index] ?? null;

  // ── Progress ───────────────────────────────────────────────
  useEffect(() => {
    if (index <= maxIndex) return;
    setMaxIndex(index);
    if (!persist) return;
    recordCourseSlideProgress(sectionId, index).catch(() => {
      /* a dropped ping is recoverable; the next slide carries a higher mark */
    });
  }, [index, maxIndex, persist, sectionId]);

  // ── Preload ────────────────────────────────────────────────
  // A deck whose next slide starts loading on click feels broken.
  useEffect(() => {
    const next = slides[index + 1];
    if (!next?.imageUrl) return;
    const img = new Image();
    // Same proxy the <img> below uses, or the preload warms a URL the stage
    // never requests and every slide still loads cold.
    img.src = proxyImageSrc(next.imageUrl);
  }, [index, slides]);

  // ── Audio-driven advance ───────────────────────────────────
  // Only setIndex when the target CHANGES — assigning the same index on every
  // timeupdate re-renders ~4x a second and makes manual paging impossible,
  // because each tick snaps the learner back.
  const onTimeUpdate = useCallback(() => {
    if (!autoAdvance || !audioRef.current) return;
    // A question owns the stage while it is open; advancing under it would carry
    // the learner past the thing they are being stopped on.
    if (blockerRef.current) return;
    const t = audioRef.current.currentTime;
    let target = -1;
    for (let i = 0; i < slides.length; i += 1) {
      const start = slides[i].startSec;
      // Unsynced slides are never auto-selected, so a partially-synced deck
      // degrades to manual paging rather than jumping to slide 0.
      if (start != null && start <= t) target = i;
    }
    if (target >= 0 && target !== indexRef.current) setIndex(target);
  }, [autoAdvance, slides]);

  // Pause narration while a question is open, and pick it back up afterwards —
  // but only if the learner had it playing.
  const resumeAudioRef = useRef(false);
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    if (blocker) {
      resumeAudioRef.current = !el.paused;
      el.pause();
    } else if (resumeAudioRef.current) {
      resumeAudioRef.current = false;
      const played = el.play();
      if (played?.catch) played.catch(() => { /* autoplay refused; the learner can press play */ });
    }
  }, [blocker]);

  // ── Paging ─────────────────────────────────────────────────
  const goPrev = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);
  const goNext = useCallback(() => {
    if (blockerRef.current) return;
    setIndex((i) => Math.min(total - 1, i + 1));
  }, [total]);

  const onStageKeyDown = (e) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); goPrev(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); goNext(); }
  };

  // ── Answering ──────────────────────────────────────────────
  const toggleAnswer = (answerId) => {
    setSelected((prev) => {
      if (blocker?.kind === 'MULTI') {
        return prev.includes(answerId) ? prev.filter((id) => id !== answerId) : [...prev, answerId];
      }
      return [answerId];
    });
  };

  const submitAnswer = async () => {
    if (!blocker) return;
    setGrading(true);
    try {
      const graded = persist
        ? await answerCoursePopup(sectionId, blocker.id, selected)
        // Author preview has no grader: acknowledge and move on.
        : { correct: true, explanation: blocker.explanation ?? null };
      // Deliberately leaves the overlay open on a correct answer — the
      // explanation only exists in this response, and closing here would clear
      // it in the same batch that set it.
      setResult(graded);
    } catch (err) {
      toast.error(err.message ?? 'Could not check that answer');
    } finally {
      setGrading(false);
    }
  };

  const continueAfterCorrect = () => {
    const id = blocker?.id;
    setResult(null);
    setSelected([]);
    if (id) setAnswered((prev) => (prev.includes(id) ? prev : [...prev, id]));
  };

  const retry = () => { setResult(null); setSelected([]); };

  // ── Completion ─────────────────────────────────────────────
  // Fire completion exactly once. Without the ref this re-fires on every render
  // after the last slide, and each call is a POST that grants XP-adjacent side
  // effects server-side.
  const completedRef = useRef(false);
  useEffect(() => {
    if (preview || completedRef.current || !slides.length) return;
    const atEnd = maxIndex >= slides.length - 1;
    const allAnswered = overlays.every((q) => answered.includes(q.id));
    if (atEnd && allAnswered) {
      completedRef.current = true;
      onComplete?.();
    }
  }, [maxIndex, slides.length, overlays, answered, preview, onComplete]);

  if (!total) {
    return (
      <div className="pm-course-video-empty">
        <i className="fas fa-file-powerpoint" aria-hidden="true" />
        <p>No deck has been imported for this section yet.</p>
      </div>
    );
  }

  // Reserving the box from the stored page size keeps the stage from jumping
  // while each image loads.
  const ratio = slide?.width && slide?.height ? `${slide.width} / ${slide.height}` : '4 / 3';

  return (
    <div className="pm-course-slides-player">
      <div
        className="pm-course-slide-stage"
        style={{ aspectRatio: ratio }}
        tabIndex={0}
        role="group"
        aria-label={`Slide ${index + 1} of ${total}`}
        onKeyDown={onStageKeyDown}
      >
        {slide && (
          <img
            src={proxyImageSrc(slide.imageUrl)}
            alt={`Slide ${index + 1}`}
            draggable={false}
          />
        )}
        {/* The slide's words, for screen readers and in-page search — the image
            itself carries none. */}
        {slide?.text && <p className="cpm-sr-only">{slide.text}</p>}

        {blocker && (
          <SlideQuestionOverlay
            question={blocker}
            result={result}
            busy={grading}
            selected={selected}
            onToggle={toggleAnswer}
            onSubmit={submitAnswer}
            onRetry={retry}
            onContinue={continueAfterCorrect}
          />
        )}
      </div>

      <div className="pm-course-slide-bar">
        <button
          type="button"
          className="pm-course-player-btn"
          onClick={goPrev}
          disabled={index === 0}
          aria-label="Previous slide"
        >
          <i className="fas fa-chevron-left" aria-hidden="true" />
        </button>

        <span className="pm-course-slide-count">{index + 1} / {total}</span>

        <button
          type="button"
          className="pm-course-player-btn"
          onClick={goNext}
          disabled={index >= total - 1 || Boolean(blocker)}
          aria-label="Next slide"
          title={blocker ? 'Answer the question to continue' : undefined}
        >
          <i className="fas fa-chevron-right" aria-hidden="true" />
        </button>

        <div className="cpm-progress-bar pm-course-slide-track">
          <div
            className="cpm-progress-bar-fill"
            style={{ width: `${total > 1 ? ((index + 1) / total) * 100 : 100}%` }}
          />
        </div>

        {blocker && (
          <span className="pm-course-slide-blocked">
            <i className="fas fa-lock" aria-hidden="true" /> Answer to continue
          </span>
        )}
      </div>

      {audioUrl && (
        <div className="pm-course-slide-audio">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <audio ref={audioRef} src={audioUrl} controls preload="metadata" onTimeUpdate={onTimeUpdate} />
          <label className="pm-course-slide-autoadvance">
            <input
              type="checkbox"
              checked={autoAdvance}
              onChange={(e) => setAutoAdvance(e.target.checked)}
            />
            <span>Follow the narration</span>
          </label>
          {config.audioDurationSec ? (
            <span className="pm-course-slide-audio-len">{formatClock(config.audioDurationSec)}</span>
          ) : null}
        </div>
      )}

      {slide?.notes && (
        <div className="pm-course-slide-notes-read">
          <h4><i className="fas fa-note-sticky" aria-hidden="true" /> Notes</h4>
          <p>{slide.notes}</p>
        </div>
      )}
    </div>
  );
}
