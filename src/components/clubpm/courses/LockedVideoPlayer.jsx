import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { loadYouTubeApi } from '../../../lib/youtubeApi';
import { recordCourseVideoProgress, answerCoursePopup } from '../../../api/clubPmClient';
import { DEFAULT_RATES, formatTimestamp } from './videoConfig';

// How far past the watch mark a position may drift before we yank it back. One
// tick of slop plus a little: YouTube's clock is not sample-accurate, and a 2×
// rate advances 0.5 s per 250 ms tick.
const DRIFT_TOLERANCE_SEC = 1.5;
const TICK_MS = 250;
const FLUSH_MS = 10000;
// Matches the server's completion check in courseProgressService.completeSection.
const END_SLACK_SEC = 2;

/** Media-query hook — the control bar's transitions honour the OS setting. */
function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(() => (
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false
  ));
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = (e) => setReduced(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

function clockTime(sec) {
  return formatTimestamp(Math.max(0, Math.floor(Number(sec) || 0)));
}

/**
 * The pop-up modal. Answers arrive already stripped of `isCorrect` (the learner
 * payload never carries it); grading is the server's job, and the explanation
 * only exists in the grade response.
 */
function PopupQuestionModal({ question, result, busy, selected, onToggle, onSubmit, onRewind, onRetry, onContinue }) {
  const multi = question.kind === 'MULTI';
  return (
    <div className="pm-course-popup-backdrop" role="dialog" aria-modal="true" aria-label="Question">
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
                  name={`popup-${question.id}`}
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
              <i className="fas fa-play" aria-hidden="true" style={{ marginLeft: 6 }} />
            </button>
          )}
          {result && !result.correct && (
            <>
              {result.rewindToSec != null && (
                <button type="button" className="clubpm-btn-primary" onClick={onRewind}>
                  <i className="fas fa-rotate-left" aria-hidden="true" />
                  {` Rewind to ${clockTime(result.rewindToSec)}`}
                </button>
              )}
              <button type="button" className="clubpm-btn-secondary" onClick={onRetry}>
                Try again
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * The locked YouTube player, shared by the author preview and the learner page.
 *
 * YouTube's own chrome is switched off (`controls: 0, disablekb: 1`) and
 * replaced by the bar below, because the native scrub bar cannot be made
 * one-directional. Two independent guards enforce the lock:
 *
 *  1. the custom scrub bar simply refuses clicks beyond `maxWatchedSec`, and
 *  2. a 250 ms tick seeks back whenever the position exceeds the watch mark by
 *     more than `DRIFT_TOLERANCE_SEC` — this is what catches the API, keyboard
 *     shortcuts and anything else that goes around the bar.
 *
 * Both are UX. The real lock is the server clamp in `recordVideoProgress`;
 * nothing here is trusted.
 *
 * @param {object}   videoConfig          { youtubeId, allowedRates, lockSeek, durationSec }
 * @param {string}   sectionId            CourseSection id — omit (or set preview) to skip server calls
 * @param {number}   initialMaxWatchedSec persisted watch mark; playback resumes here
 * @param {Array}    questions            timed pop-ups (learner-safe shape)
 * @param {string[]} answeredPopupIds     pop-ups already answered correctly
 * @param {boolean}  preview              author preview: no persistence, no gating
 * @param {Function} onComplete           fired once when the section's video requirements are met
 * @param {Function} onDurationDetected   (sec) => void — lets the author panel store durationSec
 * @param {Function} onTimeUpdate         (sec) => void — live position, once per tick; the author
 *                                        workbench uses it to seed a pop-up's timestamp
 */
export default function LockedVideoPlayer({
  videoConfig,
  sectionId,
  initialMaxWatchedSec = 0,
  questions = [],
  answeredPopupIds = [],
  preview = false,
  onComplete,
  onDurationDetected,
  onTimeUpdate,
}) {
  const config = videoConfig ?? {};
  const youtubeId = config.youtubeId ?? null;
  const lockSeek = preview ? false : config.lockSeek !== false;
  const rates = useMemo(() => {
    const list = Array.isArray(config.allowedRates) ? config.allowedRates.map(Number) : [];
    const valid = list.filter((r) => Number.isFinite(r) && r > 0).sort((a, b) => a - b);
    return valid.length ? valid : DEFAULT_RATES;
  }, [config.allowedRates]);

  const popups = useMemo(() => (
    (Array.isArray(questions) ? questions : [])
      .filter((q) => q.videoTimestampSec != null)
      .slice()
      .sort((a, b) => a.videoTimestampSec - b.videoTimestampSec)
  ), [questions]);

  const reducedMotion = usePrefersReducedMotion();

  const hostRef = useRef(null);
  const wrapRef = useRef(null);
  const playerRef = useRef(null);
  const tickRef = useRef(null);
  const flushRef = useRef(null);
  // Refs mirror state the 250 ms tick reads — it must never close over stale values.
  const maxWatchedRef = useRef(Math.max(0, Number(initialMaxWatchedSec) || 0));
  const answeredRef = useRef(new Set(answeredPopupIds));
  const activeQuestionRef = useRef(null);
  const lastFlushedRef = useRef(-1);
  const completedRef = useRef(false);
  // Held in a ref, not read from the closure: putting it in the tick's dep array
  // would re-arm the 250 ms interval every time a caller passed a fresh inline
  // function, restarting the timer instead of letting it run.
  const onTimeUpdateRef = useRef(onTimeUpdate);
  onTimeUpdateRef.current = onTimeUpdate;

  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [currentSec, setCurrentSec] = useState(maxWatchedRef.current);
  const [maxWatchedSec, setMaxWatchedSec] = useState(maxWatchedRef.current);
  const [duration, setDuration] = useState(Number(config.durationSec) || 0);
  const [rate, setRate] = useState(rates.includes(1) ? 1 : rates[0]);
  const [volume, setVolume] = useState(100);
  const [muted, setMuted] = useState(false);
  const [activeQuestion, setActiveQuestion] = useState(null);
  const [selected, setSelected] = useState([]);
  const [popupResult, setPopupResult] = useState(null);
  const [grading, setGrading] = useState(false);

  const persist = !preview && Boolean(sectionId);

  // ── Server flush ───────────────────────────────────────────
  const flush = useCallback((positionSec) => {
    if (!persist) return;
    const pos = Math.floor(Math.max(0, positionSec));
    if (pos === lastFlushedRef.current) return;
    lastFlushedRef.current = pos;
    recordCourseVideoProgress(sectionId, pos)
      .then((res) => {
        // The clamp rejected the claim — trust the server's mark, not ours.
        if (res && res.accepted === false && typeof res.maxWatchedSec === 'number') {
          maxWatchedRef.current = res.maxWatchedSec;
          setMaxWatchedSec(res.maxWatchedSec);
          playerRef.current?.seekTo?.(res.maxWatchedSec, true);
        }
      })
      .catch(() => { /* a dropped ping is recoverable; the next one carries the same mark */ });
  }, [persist, sectionId]);

  // ── Completion ─────────────────────────────────────────────
  const maybeComplete = useCallback(() => {
    if (completedRef.current || preview) return;
    const known = duration > 0 ? duration : Number(config.durationSec) || 0;
    if (!(known > 0) || maxWatchedRef.current < known - END_SLACK_SEC) return;
    const requiredAnswered = popups.every((q) => answeredRef.current.has(q.id));
    if (!requiredAnswered) return;
    completedRef.current = true;
    onComplete?.();
  }, [duration, config.durationSec, popups, preview, onComplete]);

  // ── Pop-up gating ──────────────────────────────────────────
  const openQuestion = useCallback((question) => {
    activeQuestionRef.current = question;
    setActiveQuestion(question);
    setSelected([]);
    setPopupResult(null);
    playerRef.current?.pauseVideo?.();
  }, []);

  const dueQuestion = useCallback((t) => (
    popups.find((q) => q.videoTimestampSec <= t && !answeredRef.current.has(q.id)) ?? null
  ), [popups]);

  // ── The tick: the guard that catches everything the bar doesn't ──
  useEffect(() => {
    if (!ready) return undefined;
    const id = window.setInterval(() => {
      const player = playerRef.current;
      if (!player || typeof player.getCurrentTime !== 'function') return;
      const t = player.getCurrentTime() || 0;

      // getDuration() returns 0 until YouTube has parsed the video's metadata,
      // which is not always done by onReady. Read again until it lands —
      // otherwise a 0 duration is permanent, the scrub bar never fills, and
      // maybeComplete can never fire.
      if (!(duration > 0)) {
        const total = player.getDuration?.() || 0;
        if (total > 0) {
          setDuration(total);
          if (Math.abs(total - (Number(config.durationSec) || 0)) > 1) {
            onDurationDetected?.(Math.round(total));
          }
        }
      }

      if (lockSeek && t > maxWatchedRef.current + DRIFT_TOLERANCE_SEC) {
        player.seekTo(maxWatchedRef.current, true);
        setCurrentSec(maxWatchedRef.current);
        onTimeUpdateRef.current?.(maxWatchedRef.current);
        return;
      }

      if (t > maxWatchedRef.current) {
        maxWatchedRef.current = t;
        setMaxWatchedSec(t);
      }
      setCurrentSec(t);
      onTimeUpdateRef.current?.(t);

      if (!activeQuestionRef.current) {
        const due = dueQuestion(t);
        if (due) openQuestion(due);
      }
      maybeComplete();
    }, TICK_MS);
    tickRef.current = id;
    return () => window.clearInterval(id);
  }, [ready, lockSeek, duration, config.durationSec, onDurationDetected, dueQuestion, openQuestion, maybeComplete]);

  // ── Periodic + unload flush ────────────────────────────────
  useEffect(() => {
    if (!persist) return undefined;
    const id = window.setInterval(() => {
      if (playerRef.current) flush(maxWatchedRef.current);
    }, FLUSH_MS);
    flushRef.current = id;
    const onLeave = () => flush(maxWatchedRef.current);
    window.addEventListener('pagehide', onLeave);
    window.addEventListener('beforeunload', onLeave);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('pagehide', onLeave);
      window.removeEventListener('beforeunload', onLeave);
      onLeave();
    };
  }, [persist, flush]);

  // ── Player lifecycle ───────────────────────────────────────
  useEffect(() => {
    if (!youtubeId) return undefined;
    let cancelled = false;

    loadYouTubeApi()
      .then((YT) => {
        if (cancelled || !hostRef.current) return;
        playerRef.current = new YT.Player(hostRef.current, {
          videoId: youtubeId,
          playerVars: { controls: 0, disablekb: 1, modestbranding: 1, rel: 0, playsinline: 1 },
          events: {
            onReady: (e) => {
              if (cancelled) return;
              const total = e.target.getDuration?.() || 0;
              if (total > 0) {
                setDuration(total);
                if (Math.abs(total - (Number(config.durationSec) || 0)) > 1) onDurationDetected?.(Math.round(total));
              }
              e.target.setPlaybackRate?.(rate);
              e.target.setVolume?.(volume);
              // Resume where the learner left off.
              if (maxWatchedRef.current > 0) e.target.seekTo(maxWatchedRef.current, true);
              setReady(true);
            },
            onStateChange: (e) => {
              if (cancelled) return;
              const isPlaying = e.data === window.YT.PlayerState.PLAYING;
              setPlaying(isPlaying);
              if (e.data === window.YT.PlayerState.PAUSED) flush(maxWatchedRef.current);
              if (e.data === window.YT.PlayerState.ENDED) {
                flush(maxWatchedRef.current);
                maybeComplete();
              }
            },
            onError: () => { if (!cancelled) setFailed(true); },
          },
        });
      })
      .catch(() => { if (!cancelled) setFailed(true); });

    return () => {
      cancelled = true;
      setReady(false);
      try { playerRef.current?.destroy?.(); } catch { /* already torn down */ }
      playerRef.current = null;
    };
    // Rebuilding on anything but the video id would restart playback mid-watch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [youtubeId]);

  // ── Controls ───────────────────────────────────────────────
  const togglePlay = () => {
    const player = playerRef.current;
    if (!player) return;
    if (playing) player.pauseVideo(); else player.playVideo();
  };

  const changeRate = (value) => {
    const next = Number(value);
    if (!rates.includes(next)) return;
    setRate(next);
    playerRef.current?.setPlaybackRate?.(next);
  };

  const changeVolume = (value) => {
    const next = Math.max(0, Math.min(100, Number(value) || 0));
    setVolume(next);
    setMuted(next === 0);
    playerRef.current?.setVolume?.(next);
    if (next === 0) playerRef.current?.mute?.(); else playerRef.current?.unMute?.();
  };

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    if (next) playerRef.current?.mute?.(); else playerRef.current?.unMute?.();
  };

  const toggleFullscreen = () => {
    const el = wrapRef.current;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen?.();
    else el.requestFullscreen?.();
  };

  // The scrub bar: display-only past the watch mark. Rewind is always allowed.
  const seekFromBar = (event) => {
    const player = playerRef.current;
    if (!player || !duration) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width) return;
    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    const target = ratio * duration;
    if (lockSeek && target > maxWatchedRef.current) return; // no-op, deliberately silent
    player.seekTo(target, true);
    setCurrentSec(target);
  };

  // ── Pop-up answering ───────────────────────────────────────
  const toggleAnswer = (answerId) => {
    setSelected((prev) => {
      if (activeQuestion?.kind === 'MULTI') {
        return prev.includes(answerId) ? prev.filter((id) => id !== answerId) : [...prev, answerId];
      }
      return [answerId];
    });
  };

  const closeQuestion = (answeredCorrectly) => {
    if (answeredCorrectly && activeQuestionRef.current) {
      answeredRef.current.add(activeQuestionRef.current.id);
    }
    activeQuestionRef.current = null;
    setActiveQuestion(null);
    setSelected([]);
    setPopupResult(null);
  };

  const submitAnswer = async () => {
    const question = activeQuestion;
    if (!question) return;
    setGrading(true);
    try {
      const result = persist
        ? await answerCoursePopup(sectionId, question.id, selected)
        // Author preview has no grader: acknowledge and move on.
        : { correct: true, explanation: question.explanation ?? null, rewindToSec: null };
      // A correct answer deliberately leaves the modal OPEN. Closing it here
      // (which is what this used to do) reset `popupResult` in the same tick, so
      // React batched the two updates and the result — including the
      // explanation, which only exists in this response — never rendered at all.
      // `resumeAfterCorrect` is now what dismisses it.
      setPopupResult(result);
    } catch (err) {
      toast.error(err.message ?? 'Could not check that answer');
    } finally {
      setGrading(false);
    }
  };

  // Dismiss a correctly-answered pop-up and pick the video back up.
  const resumeAfterCorrect = () => {
    closeQuestion(true);
    playerRef.current?.playVideo?.();
    maybeComplete();
  };

  const rewind = () => {
    const to = Math.max(0, Number(popupResult?.rewindToSec) || 0);
    // Clearing the flag is the point: the question must fire again on the way back.
    if (activeQuestionRef.current) answeredRef.current.delete(activeQuestionRef.current.id);
    closeQuestion(false);
    playerRef.current?.seekTo?.(to, true);
    setCurrentSec(to);
    playerRef.current?.playVideo?.();
  };

  const retry = () => { setPopupResult(null); setSelected([]); };

  if (!youtubeId) {
    return (
      <div className="pm-course-video-empty">
        <i className="fas fa-video-slash" aria-hidden="true" />
        <p>No video has been set for this section yet.</p>
      </div>
    );
  }

  const pct = duration > 0 ? Math.min(100, (currentSec / duration) * 100) : 0;
  const watchedPct = duration > 0 ? Math.min(100, (maxWatchedSec / duration) * 100) : 0;
  const barTransition = reducedMotion ? 'none' : 'width 120ms linear';

  return (
    <div className={`pm-course-player${reducedMotion ? ' is-reduced-motion' : ''}`} ref={wrapRef}>
      <div className="pm-course-player-stage">
        <div ref={hostRef} />
        {/* Swallows clicks on the iframe so YouTube's own overlay controls
            (and its double-click-to-seek) never reach the player. */}
        <button
          type="button"
          className="pm-course-player-shield"
          onClick={togglePlay}
          aria-label={playing ? 'Pause video' : 'Play video'}
        />
        {failed && (
          <div className="pm-course-player-error">
            <i className="fas fa-triangle-exclamation" aria-hidden="true" />
            <p>This video could not be loaded. It may be private or removed.</p>
          </div>
        )}
      </div>

      <div className="pm-course-player-bar">
        <button
          type="button"
          className="pm-course-player-btn"
          onClick={togglePlay}
          disabled={!ready}
          aria-label={playing ? 'Pause' : 'Play'}
        >
          <i className={`fas ${playing ? 'fa-pause' : 'fa-play'}`} aria-hidden="true" />
        </button>

        <span className="pm-course-player-time">{clockTime(currentSec)}</span>

        <div
          className={`pm-course-scrub${lockSeek ? ' is-locked' : ''}`}
          onClick={seekFromBar}
          role="slider"
          tabIndex={0}
          aria-label="Video position"
          aria-valuemin={0}
          aria-valuemax={Math.floor(duration)}
          aria-valuenow={Math.floor(currentSec)}
          aria-valuetext={`${clockTime(currentSec)} of ${clockTime(duration)}`}
          onKeyDown={(e) => {
            // Rewind by keyboard is fine; forward is the thing being locked.
            if (e.key !== 'ArrowLeft') return;
            e.preventDefault();
            const to = Math.max(0, currentSec - 5);
            playerRef.current?.seekTo?.(to, true);
            setCurrentSec(to);
          }}
        >
          <div className="pm-course-scrub-watched" style={{ width: `${watchedPct}%`, transition: barTransition }} />
          <div className="pm-course-scrub-played" style={{ width: `${pct}%`, transition: barTransition }} />
          {popups.map((q) => (
            duration > 0 ? (
              <span
                key={q.id}
                className={`pm-course-scrub-marker${answeredRef.current.has(q.id) ? ' is-answered' : ''}`}
                style={{ left: `${Math.min(100, (q.videoTimestampSec / duration) * 100)}%` }}
                title={`Question at ${clockTime(q.videoTimestampSec)}`}
              />
            ) : null
          ))}
        </div>

        <span className="pm-course-player-time">{clockTime(duration)}</span>

        <label className="pm-course-player-rate">
          <span className="cpm-sr-only">Playback speed</span>
          <select
            className="cpm-form-input"
            value={rate}
            onChange={(e) => changeRate(e.target.value)}
            disabled={!ready}
          >
            {rates.map((r) => <option key={r} value={r}>{r}×</option>)}
          </select>
        </label>

        <div className="pm-course-player-volume">
          <button
            type="button"
            className="pm-course-player-btn"
            onClick={toggleMute}
            aria-label={muted ? 'Unmute' : 'Mute'}
          >
            <i className={`fas ${muted || volume === 0 ? 'fa-volume-xmark' : 'fa-volume-high'}`} aria-hidden="true" />
          </button>
          <input
            type="range"
            min="0"
            max="100"
            value={muted ? 0 : volume}
            onChange={(e) => changeVolume(e.target.value)}
            aria-label="Volume"
          />
        </div>

        <button
          type="button"
          className="pm-course-player-btn"
          onClick={toggleFullscreen}
          aria-label="Toggle fullscreen"
        >
          <i className="fas fa-expand" aria-hidden="true" />
        </button>
      </div>

      {lockSeek && (
        <p className="pm-course-player-hint">
          <i className="fas fa-lock" aria-hidden="true" /> You can rewind freely, but not skip ahead.
        </p>
      )}

      {activeQuestion && (
        <PopupQuestionModal
          question={activeQuestion}
          result={popupResult}
          busy={grading}
          selected={selected}
          onToggle={toggleAnswer}
          onSubmit={submitAnswer}
          onRewind={rewind}
          onRetry={retry}
          onContinue={resumeAfterCorrect}
        />
      )}
    </div>
  );
}
