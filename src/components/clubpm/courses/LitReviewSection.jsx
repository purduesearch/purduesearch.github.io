import React, { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { submitWork, listWorkSubmissions } from '../../../api/clubPmClient';

const wordsIn = (text) => String(text ?? '').trim().split(/\s+/).filter(Boolean).length;

const VERDICT_META = {
  caught:  { label: 'Caught it', icon: 'fas fa-circle-check' },
  partial: { label: 'Partly',    icon: 'fas fa-circle-half-stroke' },
  missed:  { label: 'Missed',    icon: 'fas fa-circle-xmark' },
};

/**
 * A paper, a composer, and the feedback on what the learner wrote.
 *
 * The score is rendered ONLY when the section is gated (`passThreshold` is set).
 * On an ungated section it stays hidden, because completion is gated on effort
 * and a visible number would re-establish a gate the design deliberately does
 * not have — a member who saw "48%" would read it as a fail no matter what the
 * copy said. Under a real gate the opposite is true: withholding the number
 * leaves a learner told "not yet" with no way to know how far off they are.
 * Officers see the score for both cases in the course progress view.
 */
export default function LitReviewSection({ section, preview, onSubmitted }) {
  const config = section.litConfig ?? {};
  const minWords = config.minWords ?? 150;
  const gated = section.passThreshold != null;

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
  const short = words < minWords;

  const handleSubmit = async () => {
    if (short || saving) return;
    setSaving(true);
    try {
      const res = await submitWork(section.id, { text });
      setText('');
      await load();
      if (res?.outcome === 'BLOCKED') {
        // Neutral, never toast.error — the learner did the work, it just did not
        // clear the bar yet, and there are unlimited revisions.
        toast('Not quite yet — read the feedback below and submit a revision.');
      } else if (res?.outcome === 'COMPLETE_UNGRADED') {
        toast('Summary saved. Feedback is still pending — this section is complete either way.');
      } else if (gated) {
        toast.success('Summary saved — you have passed this section.');
      } else {
        toast.success('Summary saved — feedback below.');
      }
      onSubmitted?.();
    } catch (err) {
      toast.error(err?.message ?? 'Could not save your summary');
    } finally {
      setSaving(false);
    }
  };

  const latest = submissions[0] ?? null;
  const score = latest?.feedback?.scorePct ?? null;
  const passed = gated && typeof score === 'number' && score >= section.passThreshold;

  return (
    <div className="pm-lit">
      {config.pdfDriveFileId ? (
        <div className="pm-lit-paper">
          <iframe
            title={config.pdfTitle || 'Paper'}
            src={`https://drive.google.com/file/d/${config.pdfDriveFileId}/preview`}
            allow="autoplay"
          />
          <p className="pm-lit-citation">
            {config.citation}
            {' '}
            <a
              href={`https://drive.google.com/file/d/${config.pdfDriveFileId}/view`}
              target="_blank"
              rel="noreferrer"
            >
              Open in a new tab <i className="fas fa-arrow-up-right-from-square" aria-hidden="true" />
            </a>
          </p>
        </div>
      ) : (
        <p className="pm-lit-empty">
          <i className="fas fa-triangle-exclamation" aria-hidden="true" />
          {' '}No paper has been attached to this section yet.
        </p>
      )}

      {config.promptText && <p className="pm-lit-prompt">{config.promptText}</p>}

      {gated && (
        <p className="pm-lit-gate">
          <i className="fas fa-lock" aria-hidden="true" />
          {' '}You need {section.passThreshold}% to continue. Revise and resubmit as many times as
          you like — every attempt is kept.
        </p>
      )}

      {preview ? (
        <p className="pm-lit-empty">
          <i className="fas fa-eye" aria-hidden="true" /> Author preview — submissions are not recorded.
        </p>
      ) : (
        <>
          <div className="pm-lit-composer">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={14}
              placeholder="Write your summary here."
              aria-label="Your summary"
            />
            <div className="pm-lit-composer-foot">
              <span className={short ? 'pm-lit-count is-short' : 'pm-lit-count'}>
                {words} / {minWords} words
              </span>
              <button
                type="button"
                className="clubpm-btn-primary"
                onClick={handleSubmit}
                disabled={short || saving}
                title={short ? `Write at least ${minWords} words` : undefined}
              >
                {saving ? 'Sending…' : latest ? 'Submit a revision' : 'Submit summary'}
              </button>
            </div>
          </div>

          {loading && <p className="pm-lit-empty">Loading your submissions…</p>}

          {!loading && latest && (
            <div className="pm-lit-feedback">
              <h3>
                <i className="fas fa-comment-dots" aria-hidden="true" /> Feedback on your latest summary
              </h3>

              {gated && typeof score === 'number' && (
                <p className={passed ? 'pm-lit-score is-pass' : 'pm-lit-score is-short'}>
                  <strong>{score}%</strong> · {section.passThreshold}% to pass
                  {!passed && ' — not yet. The points below are where the marks are.'}
                </p>
              )}

              {!latest.feedback ? (
                <p className="pm-lit-empty">
                  Feedback is still pending. This section is already complete — submit a
                  revision later to try again.
                </p>
              ) : (
                <>
                  {latest.feedback.overall && (
                    <p className="pm-lit-overall">{latest.feedback.overall}</p>
                  )}
                  <ul className="pm-lit-points">
                    {latest.feedback.points.map((p) => {
                      const meta = VERDICT_META[p.verdict] ?? VERDICT_META.missed;
                      return (
                        <li key={p.id} className={`pm-lit-point is-${p.verdict}`}>
                          <span className="pm-lit-point-verdict">
                            <i className={meta.icon} aria-hidden="true" /> {meta.label}
                          </span>
                          <span className="pm-lit-point-comment">{p.comment}</span>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
            </div>
          )}

          {!loading && submissions.length > 1 && (
            <details className="pm-lit-history">
              <summary>{submissions.length - 1} earlier submission{submissions.length === 2 ? '' : 's'}</summary>
              {submissions.slice(1).map((s) => (
                <article key={s.id}>
                  <h4>{new Date(s.createdAt).toLocaleString()} · {s.wordCount} words</h4>
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
