import React, { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { submitWork, listWorkSubmissions } from '../../../api/clubPmClient';
import WorkSubmissionHistory from './WorkSubmissionHistory';

const wordsIn = (text) => String(text ?? '').trim().split(/\s+/).filter(Boolean).length;

/**
 * A paper, a composer, and every draft the learner has turned in.
 *
 * Feedback rendering and the attempt history live in WorkSubmissionHistory,
 * shared with AssignmentSection — including the rule that the score is shown
 * only when `passThreshold` is set. See that file's ScoreLine comment.
 */
export default function LitReviewSection({ section, preview, onSubmitted }) {
  const config = section.litConfig ?? {};
  const minWords = config.minWords ?? 150;
  const gated = section.passThreshold != null;

  const [text, setText] = useState('');
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(!preview);
  const [saving, setSaving] = useState(false);
  const textareaRef = useRef(null);

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

  /**
   * Pull an earlier draft back into the composer to revise from.
   *
   * Submitting clears the textarea, so without this the only way to build on
   * what you last wrote is to retype it or copy it out of the history by hand.
   * Confirms first when it would destroy unsaved text.
   */
  const handleRestore = (submission) => {
    const pending = text.trim();
    if (pending && pending !== submission.text.trim()) {
      const ok = window.confirm(
        'Replace what is in the editor with this earlier draft? What you have typed will be lost.'
      );
      if (!ok) return;
    }
    setText(submission.text);
    // After the value lands, put the caret at the end and bring the composer
    // into view — the history can be well below the fold on a long section.
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  };

  const latest = submissions[0] ?? null;

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
              ref={textareaRef}
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

          <WorkSubmissionHistory
            submissions={submissions}
            passThreshold={section.passThreshold}
            loading={loading}
            onRestore={handleRestore}
            noun="summary"
          />
        </>
      )}
    </div>
  );
}
