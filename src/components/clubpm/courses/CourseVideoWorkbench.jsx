import React, { useState, useEffect, useRef, useCallback } from 'react';
import toast from 'react-hot-toast';
import {
  listCourseQuestions, saveCourseQuestion, deleteCourseQuestion,
} from '../../../api/clubPmClient';
import QuestionForm from './QuestionForm';
import { blankQuestion, serializeQuestion, validateQuestion } from './questionModel';
import LockedVideoPlayer from './LockedVideoPlayer';
import {
  PLAYBACK_RATES, DEFAULT_RATES, parseYouTubeId, formatTimestamp, parseTimestamp,
} from './videoConfig';

function TimestampField({ label, value, hint, onCommit, disabled }) {
  const [text, setText] = useState(value == null ? '' : formatTimestamp(value));

  useEffect(() => { setText(value == null ? '' : formatTimestamp(value)); }, [value]);

  const commit = () => {
    if (text.trim() === '') { onCommit(null); return; }
    const parsed = parseTimestamp(text);
    if (parsed == null) {
      toast.error('Use a mm:ss timestamp, e.g. 1:30');
      setText(value == null ? '' : formatTimestamp(value));
      return;
    }
    setText(formatTimestamp(parsed));
    onCommit(parsed);
  };

  return (
    <div className="cpm-blog-meta-field">
      <label className="cpm-form-label">{label}</label>
      <input
        className="cpm-form-input"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        placeholder="0:00"
        disabled={disabled}
      />
      {hint && <span className="cpm-blog-meta-hint">{hint}</span>}
    </div>
  );
}

function PopupCard({ question, index, canEdit, expanded, busy, onToggle, onChange, onSave, onDelete }) {
  return (
    <div className={`pm-course-question-card${expanded ? ' is-open' : ''}`}>
      <div className="pm-course-question-head">
        <button type="button" className="pm-course-question-toggle" onClick={onToggle} aria-expanded={expanded}>
          <span className="pm-course-question-num">{formatTimestamp(question.videoTimestampSec)}</span>
          <span className="pm-course-question-summary">
            {(question.prompt ?? '').trim() || <em>Untitled pop-up</em>}
          </span>
          {!question.id && <span className="cpm-blog-dirty">Unsaved</span>}
          <i className={`fas ${expanded ? 'fa-chevron-up' : 'fa-chevron-down'}`} aria-hidden="true" />
        </button>
        {canEdit && (
          <button
            type="button"
            className="pm-course-rail-del"
            onClick={onDelete}
            disabled={busy}
            title="Delete pop-up"
            aria-label={`Delete pop-up ${index + 1}`}
          >
            <i className="fas fa-trash" aria-hidden="true" />
          </button>
        )}
      </div>

      {expanded && (
        <>
          <div className="pm-course-question-row">
            <TimestampField
              label="Fires at"
              value={question.videoTimestampSec}
              onCommit={(sec) => onChange({ ...question, videoTimestampSec: sec ?? 0 })}
              disabled={!canEdit}
            />
            <TimestampField
              label="Rewind to"
              value={question.rewindToSec}
              hint="Offered after a wrong answer. Blank = no rewind."
              onCommit={(sec) => onChange({ ...question, rewindToSec: sec })}
              disabled={!canEdit}
            />
          </div>

          {/* Same authoring body as the quiz builder — one form, two hosts. */}
          <QuestionForm question={question} onChange={onChange} disabled={!canEdit} />

          {canEdit && (
            <div className="pm-course-question-actions">
              <button type="button" className="clubpm-btn-primary" onClick={onSave} disabled={busy}>
                {busy ? 'Saving…' : 'Save pop-up'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/**
 * The main-column authoring surface for a VIDEO section: YouTube source, the
 * player itself, playback rules, and the timestamped pop-up questions.
 *
 * `videoConfig` is saved through PATCH /sections/:sid; the pop-ups are
 * CourseQuestion rows saved one at a time (POST /sections/:sid/questions) so a
 * half-edited sibling can't wipe the rest, which the whole-set PUT would.
 *
 * The section's prose body is *not* rendered here — the editor page keeps that,
 * collapsed, beneath this component, because it is a collaborative document and
 * belongs to the page's autosave rather than to this surface's explicit saves.
 *
 * @param {object}   section
 * @param {boolean}  canEdit
 * @param {Function} onUpdateSection (sectionId, patch) => Promise
 */
export default function CourseVideoWorkbench({ section, canEdit = false, onUpdateSection }) {
  const sectionId = section?.id;
  const config = section?.videoConfig ?? {};

  const [urlInput, setUrlInput] = useState(config.youtubeId ?? '');
  const [rates, setRates] = useState(
    Array.isArray(config.allowedRates) && config.allowedRates.length ? config.allowedRates : DEFAULT_RATES
  );
  const [lockSeek, setLockSeek] = useState(config.lockSeek !== false);
  const [popups, setPopups] = useState([]);
  const [expandedKey, setExpandedKey] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busyKey, setBusyKey] = useState(null);

  // Live playback position, so "add pop-up here" can seed a timestamp. Kept in a
  // ref because it changes four times a second and nothing renders from it.
  const playheadRef = useRef(0);
  const handleTimeUpdate = useCallback((sec) => { playheadRef.current = sec; }, []);

  useEffect(() => {
    const cfg = section?.videoConfig ?? {};
    setUrlInput(cfg.youtubeId ?? '');
    setRates(Array.isArray(cfg.allowedRates) && cfg.allowedRates.length ? cfg.allowedRates : DEFAULT_RATES);
    setLockSeek(cfg.lockSeek !== false);
  }, [section?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!sectionId) return undefined;
    let cancelled = false;
    setLoading(true);
    listCourseQuestions(sectionId)
      .then((rows) => {
        if (cancelled) return;
        // Only timed questions are pop-ups; untimed ones belong to a quiz.
        setPopups(
          (Array.isArray(rows) ? rows : [])
            .filter((q) => q.videoTimestampSec != null)
            .sort((a, b) => a.videoTimestampSec - b.videoTimestampSec)
            .map((q) => ({
              ...q,
              _key: q.id,
              prompt: q.prompt ?? '',
              explanation: q.explanation ?? '',
              answers: (q.answers ?? []).map((a, i) => ({ ...a, _key: a.id ?? `a-${i}` })),
            }))
        );
      })
      .catch(() => { if (!cancelled) toast.error('Could not load pop-up questions'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [sectionId]);

  // `videoConfig` is one JSON column, so every write must carry the keys this
  // surface does not edit — `durationSec` above all. Rebuilding the object from
  // the three local fields silently dropped it, and the server's "watched to the
  // end" check reads exactly that key.
  const configRef = useRef(config);
  configRef.current = config;

  const saveConfig = useCallback(async (patch) => {
    const next = {
      ...(configRef.current ?? {}),
      youtubeId: parseYouTubeId(urlInput),
      allowedRates: rates,
      lockSeek,
      ...patch,
    };
    try {
      await onUpdateSection?.(sectionId, { videoConfig: next });
    } catch {
      toast.error('Could not save video settings');
    }
  }, [sectionId, urlInput, rates, lockSeek, onUpdateSection]);

  const handleUrlBlur = () => {
    const trimmed = urlInput.trim();
    if (!trimmed) { setUrlInput(''); saveConfig({ youtubeId: null, durationSec: null }); return; }
    const id = parseYouTubeId(trimmed);
    if (!id) { toast.error('That is not a YouTube URL or video id'); return; }
    if (id === config.youtubeId) { setUrlInput(id); return; }
    setUrlInput(id);
    // A different video means the recorded length no longer describes it; the
    // player below re-detects and re-saves it on load.
    saveConfig({ youtubeId: id, durationSec: null });
  };

  // The player is what records `durationSec`. Without one mounted here nothing
  // ever learns how long the video is, and the server-side completion check has
  // nothing to compare a watch mark against.
  const handleDurationDetected = useCallback((sec) => {
    if (!canEdit || !(sec > 0)) return;
    saveConfig({ durationSec: sec });
  }, [canEdit, saveConfig]);

  const toggleRate = (rate) => {
    // An empty rate list would leave the player with no speed at all, so the
    // author cannot remove the last one.
    const next = rates.includes(rate) ? rates.filter((r) => r !== rate) : [...rates, rate].sort((a, b) => a - b);
    if (!next.length) return;
    setRates(next);
    saveConfig({ allowedRates: next });
  };

  const handleLockSeek = () => {
    const next = !lockSeek;
    setLockSeek(next);
    saveConfig({ lockSeek: next });
  };

  const addPopupAt = (sec) => {
    const q = blankQuestion('SINGLE', { videoTimestampSec: Math.max(0, Math.floor(sec)) });
    setPopups((prev) => [...prev, q].sort((a, b) => (a.videoTimestampSec ?? 0) - (b.videoTimestampSec ?? 0)));
    setExpandedKey(q._key);
  };

  const handleSavePopup = async (key) => {
    const question = popups.find((q) => q._key === key);
    if (!question) return;
    const problem = validateQuestion(question);
    if (problem) { toast.error(problem); return; }
    if (question.videoTimestampSec == null) { toast.error('A pop-up needs a timestamp.'); return; }
    setBusyKey(key);
    try {
      const index = popups.findIndex((q) => q._key === key);
      const saved = await saveCourseQuestion(sectionId, serializeQuestion(question, index));
      setPopups((prev) => prev
        .map((q) => (q._key === key
          ? {
            ...saved,
            _key: saved.id ?? key,
            prompt: saved.prompt ?? '',
            explanation: saved.explanation ?? '',
            answers: (saved.answers ?? []).map((a, i) => ({ ...a, _key: a.id ?? `a-${i}` })),
          }
          : q))
        .sort((a, b) => (a.videoTimestampSec ?? 0) - (b.videoTimestampSec ?? 0)));
      setExpandedKey(saved.id ?? key);
      toast.success('Pop-up saved');
    } catch (err) {
      toast.error(err.message ?? 'Could not save pop-up');
    } finally {
      setBusyKey(null);
    }
  };

  const handleDeletePopup = async (question) => {
    // Never persisted → drop it locally; the server has nothing to delete.
    if (!question.id) { setPopups((prev) => prev.filter((q) => q._key !== question._key)); return; }
    if (!window.confirm('Delete this pop-up question?')) return;
    setBusyKey(question._key);
    try {
      await deleteCourseQuestion(sectionId, question.id);
      setPopups((prev) => prev.filter((q) => q._key !== question._key));
    } catch {
      toast.error('Delete failed');
    } finally {
      setBusyKey(null);
    }
  };

  if (!section) return null;

  const parsedId = parseYouTubeId(urlInput);

  return (
    <div className="pm-course-workbench pm-course-video-workbench">
      <section className="pm-course-workbench-section">
        <h3 className="pm-course-workbench-title">
          <i className="fas fa-video" aria-hidden="true" /> Source
        </h3>
        <div className="pm-course-source-row">
          <div className="cpm-blog-meta-field">
            <label className="cpm-form-label">YouTube URL or video id</label>
            <input
              className="cpm-form-input"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onBlur={handleUrlBlur}
              placeholder="https://youtu.be/dQw4w9WgXcQ"
              disabled={!canEdit}
            />
            <span className="cpm-blog-meta-hint">
              {parsedId ? `Video id: ${parsedId}` : 'Paste any YouTube link — unlisted is recommended.'}
            </span>
          </div>
        </div>

        {parsedId ? (
          <div className="pm-course-video-stage">
            <LockedVideoPlayer
              // Keyed on the id so pasting a different video rebuilds the player
              // instead of leaving the previous one's duration on screen.
              key={parsedId}
              videoConfig={{ ...config, youtubeId: parsedId, allowedRates: rates }}
              questions={popups.filter((q) => q.id)}
              preview
              onDurationDetected={handleDurationDetected}
              onTimeUpdate={handleTimeUpdate}
            />
            <span className="cpm-blog-meta-hint">
              {config.durationSec > 0
                ? `Length ${formatTimestamp(config.durationSec)} — recorded, so completion can be checked server-side.`
                : 'Detecting length… a learner cannot complete this section until it is recorded.'}
            </span>
          </div>
        ) : (
          <p className="pm-course-workbench-empty">
            Paste a YouTube link above to preview the video and place pop-up questions on its timeline.
          </p>
        )}
      </section>

      <section className="pm-course-workbench-section">
        <h3 className="pm-course-workbench-title">
          <i className="fas fa-gauge-high" aria-hidden="true" /> Playback rules
        </h3>
        <div className="pm-course-rules-grid">
          <div className="cpm-blog-meta-field">
            <label className="cpm-form-label">Allowed playback speeds</label>
            <div className="cpm-blog-meta-chips">
              {PLAYBACK_RATES.map((rate) => (
                <button
                  key={rate}
                  type="button"
                  className={`cpm-blog-meta-chip${rates.includes(rate) ? ' is-selected' : ''}`}
                  onClick={() => toggleRate(rate)}
                  disabled={!canEdit}
                  aria-pressed={rates.includes(rate)}
                >
                  {rate}×
                </button>
              ))}
            </div>
          </div>

          <div className="cpm-blog-meta-field">
            <label className="cpm-form-label">Seeking</label>
            <button
              type="button"
              className={`pm-course-rail-req${lockSeek ? ' is-on' : ''}`}
              onClick={handleLockSeek}
              disabled={!canEdit}
              aria-pressed={lockSeek}
            >
              <i className={`fas ${lockSeek ? 'fa-lock' : 'fa-lock-open'}`} aria-hidden="true" />
              <span>{lockSeek ? 'Locked — no skipping ahead' : 'Unlocked — free scrubbing'}</span>
            </button>
            <span className="cpm-blog-meta-hint">
              Rewinding is always allowed. The server clamps reported positions either way.
            </span>
          </div>
        </div>
      </section>

      <section className="pm-course-workbench-section">
        <h3 className="pm-course-workbench-title">
          <i className="fas fa-circle-question" aria-hidden="true" /> Pop-up questions
          <span className="pm-course-workbench-count">
            {popups.length === 0 ? 'none — the video plays straight through' : `${popups.length} on the timeline`}
          </span>
        </h3>

        {loading ? (
          <p className="cpm-blog-meta-hint">Loading pop-ups…</p>
        ) : popups.length === 0 ? (
          <p className="pm-course-workbench-empty">
            No pop-ups yet. Saved ones appear as markers on the scrub bar above.
          </p>
        ) : (
          <div className="pm-course-question-list">
            {popups.map((question, index) => (
              <PopupCard
                key={question._key}
                question={question}
                index={index}
                canEdit={canEdit}
                busy={busyKey === question._key}
                expanded={expandedKey === question._key}
                onToggle={() => setExpandedKey((k) => (k === question._key ? null : question._key))}
                onChange={(next) => setPopups((prev) => prev.map((q) => (q._key === question._key ? next : q)))}
                onSave={() => handleSavePopup(question._key)}
                onDelete={() => handleDeletePopup(question)}
              />
            ))}
          </div>
        )}

        {canEdit && (
          <div className="pm-course-question-actions">
            <button
              type="button"
              className="clubpm-btn-secondary"
              onClick={() => addPopupAt(playheadRef.current)}
              disabled={!parsedId}
              title={parsedId ? 'Uses the preview player’s current position' : 'Set a video first'}
            >
              <i className="fas fa-crosshairs" aria-hidden="true" /> Add pop-up at current time
            </button>
            <button type="button" className="clubpm-btn-secondary" onClick={() => addPopupAt(0)}>
              <i className="fas fa-plus" aria-hidden="true" /> Add pop-up
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
