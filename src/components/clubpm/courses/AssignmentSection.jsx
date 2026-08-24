import React, { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { submitWork, listWorkSubmissions } from '../../../api/clubPmClient';

const wordsIn = (text) => String(text ?? '').trim().split(/\s+/).filter(Boolean).length;

const VERDICT_META = {
  caught:  { label: 'Caught it', icon: 'fas fa-circle-check' },
  partial: { label: 'Partly',    icon: 'fas fa-circle-half-stroke' },
  missed:  { label: 'Missed',    icon: 'fas fa-circle-xmark' },
};

const ACCEPT = '.pdf,.docx,.txt,.md';

/**
 * Context, an optional handout, and a place to turn work in.
 *
 * The score is rendered ONLY when the section is gated (`passThreshold` is set),
 * matching LitReviewSection. Ungated, a visible number would invent a pass/fail
 * the design does not have; gated, withholding it would leave a learner told
 * "not yet" with no idea how far off they are.
 */
export default function AssignmentSection({ section, preview, onSubmitted }) {
  const config = section.assignmentConfig ?? {};
  const minWords = config.minWords ?? 150;
  const gated = section.passThreshold != null;

  const [mode, setMode] = useState('upload');   // 'upload' | 'paste'
  const [file, setFile] = useState(null);
  const [text, setText] = useState('');
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(!preview);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (preview) { setLoading(false); return; }
    try {
      const res = await listWorkSubmissions(section.id);
      setSubmissions(res?.submissions ?? []);
    } catch {
      // A history that will not load must not block a first submission.
      setSubmissions([]);
    } finally {
      setLoading(false);
    }
  }, [section.id, preview]);

  useEffect(() => { load(); }, [load]);

  const words = wordsIn(text);
  // A file's word count is unknown until the server extracts it, so the upload
  // path gates on "a file is chosen" rather than on a count.
  const canSubmit = mode === 'upload' ? !!file : words >= minWords;

  const handleSubmit = async () => {
    if (!canSubmit || saving) return;
    setSaving(true);
    try {
      const res = await submitWork(section.id, mode === 'upload' ? { file } : { text });
      setFile(null);
      setText('');
      await load();
      if (res?.outcome === 'BLOCKED') {
        // Neutral, never toast.error — the learner did the work, it just did not
        // clear the bar yet, and there are unlimited revisions.
        toast('Not quite yet — read the feedback below and submit a revision.');
      } else if (res?.outcome === 'COMPLETE_UNGRADED') {
        toast('Submitted. Feedback is still pending — this section is complete either way.');
      } else if (gated) {
        toast.success('Submitted — you have passed this section.');
      } else {
        toast.success('Submitted — feedback below.');
      }
      onSubmitted?.();
    } catch (err) {
      toast.error(err?.message ?? 'Could not save your submission');
    } finally {
      setSaving(false);
    }
  };

  const latest = submissions[0] ?? null;
  const score = latest?.feedback?.scorePct ?? null;
  const passed = gated && typeof score === 'number' && score >= section.passThreshold;

  return (
    <div className="pm-assign">
      {config.handoutDriveFileId && (
        <a
          className="pm-assign-handout"
          href={`https://drive.google.com/uc?export=download&id=${config.handoutDriveFileId}`}
          target="_blank"
          rel="noreferrer"
        >
          <i className="fas fa-file-arrow-down" aria-hidden="true" />
          <span>{config.handoutName || 'Download the handout'}</span>
        </a>
      )}

      {config.promptText && <p className="pm-assign-prompt">{config.promptText}</p>}

      {gated && (
        <p className="pm-assign-gate">
          <i className="fas fa-lock" aria-hidden="true" />
          {' '}You need {section.passThreshold}% to continue. Revise and resubmit as many times as
          you like — every attempt is kept.
        </p>
      )}

      {preview ? (
        <p className="pm-assign-empty">
          <i className="fas fa-eye" aria-hidden="true" /> Author preview — submissions are not recorded.
        </p>
      ) : (
        <>
          <div className="pm-assign-composer">
            <div className="pm-assign-tabs" role="tablist">
              <button
                type="button" role="tab" aria-selected={mode === 'upload'}
                className={mode === 'upload' ? 'is-active' : undefined}
                onClick={() => setMode('upload')}
              >
                <i className="fas fa-paperclip" aria-hidden="true" /> Upload a file
              </button>
              <button
                type="button" role="tab" aria-selected={mode === 'paste'}
                className={mode === 'paste' ? 'is-active' : undefined}
                onClick={() => setMode('paste')}
              >
                <i className="fas fa-keyboard" aria-hidden="true" /> Write it here
              </button>
            </div>

            {mode === 'upload' ? (
              <div className="pm-assign-drop">
                <input
                  type="file"
                  accept={ACCEPT}
                  aria-label="Your submission"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
                <small>PDF, Word .docx, or plain text. We read the text out of it to grade it.</small>
              </div>
            ) : (
              <>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={16}
                  placeholder="Write your answer here."
                  aria-label="Your submission"
                />
                <span className={words < minWords ? 'pm-assign-count is-short' : 'pm-assign-count'}>
                  {words} / {minWords} words
                </span>
              </>
            )}

            <button
              type="button"
              className="clubpm-btn-primary"
              onClick={handleSubmit}
              disabled={!canSubmit || saving}
            >
              {saving ? 'Sending…' : latest ? 'Submit a revision' : 'Submit'}
            </button>
          </div>

          {loading && <p className="pm-assign-empty">Loading your submissions…</p>}

          {!loading && latest && (
            <div className="pm-assign-feedback">
              <h3>
                <i className="fas fa-comment-dots" aria-hidden="true" /> Feedback on your latest submission
              </h3>

              {gated && typeof score === 'number' && (
                <p className={passed ? 'pm-assign-score is-pass' : 'pm-assign-score is-short'}>
                  <strong>{score}%</strong> · {section.passThreshold}% to pass
                  {!passed && ' — not yet. The points below are where the marks are.'}
                </p>
              )}

              {!latest.feedback ? (
                <p className="pm-assign-empty">
                  Feedback is still pending. This section is already complete — submit a
                  revision later to try again.
                </p>
              ) : (
                <>
                  {latest.feedback.overall && (
                    <p className="pm-assign-overall">{latest.feedback.overall}</p>
                  )}
                  <ul className="pm-assign-points">
                    {latest.feedback.points.map((p) => {
                      const meta = VERDICT_META[p.verdict] ?? VERDICT_META.missed;
                      return (
                        <li key={p.id} className={`pm-assign-point is-${p.verdict}`}>
                          <span className="pm-assign-point-verdict">
                            <i className={meta.icon} aria-hidden="true" /> {meta.label}
                          </span>
                          <span className="pm-assign-point-comment">{p.comment}</span>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
            </div>
          )}

          {!loading && submissions.length > 1 && (
            <details className="pm-assign-history">
              <summary>
                {submissions.length - 1} earlier submission{submissions.length === 2 ? '' : 's'}
              </summary>
              {submissions.slice(1).map((s) => (
                <article key={s.id}>
                  <h4>
                    {new Date(s.createdAt).toLocaleString()} · {s.wordCount} words
                    {s.fileName ? ` · ${s.fileName}` : ''}
                  </h4>
                  <p>{s.text}</p>
                </article>
              ))}
            </details>
          )}
        </>
      )}
    </div>
  );
}
