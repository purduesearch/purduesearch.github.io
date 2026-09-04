import React, { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { submitWork, listWorkSubmissions } from '../../../api/clubPmClient';
import WorkSubmissionHistory from './WorkSubmissionHistory';

const wordsIn = (text) => String(text ?? '').trim().split(/\s+/).filter(Boolean).length;

const ACCEPT = '.pdf,.docx,.txt,.md';

/**
 * Context, an optional handout, a place to turn work in, and every attempt so
 * far.
 *
 * Feedback rendering and the attempt history live in WorkSubmissionHistory,
 * shared with LitReviewSection — including the rule that the score is shown
 * only when `passThreshold` is set. See that file's ScoreLine comment.
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

  /**
   * Pull an earlier attempt back into the composer to revise from.
   *
   * Always lands in the 'paste' tab, because the restored value is text. For an
   * attempt that was originally uploaded, `text` is what the server extracted
   * out of the file — which is exactly the editable form of it, and the only
   * copy that still exists (the upload itself is discarded after extraction).
   */
  const handleRestore = (submission) => {
    const pending = mode === 'paste' ? text.trim() : '';
    if (pending && pending !== submission.text.trim()) {
      const ok = window.confirm(
        'Replace what is in the editor with this earlier attempt? What you have typed will be lost.'
      );
      if (!ok) return;
    }
    setMode('paste');
    setFile(null);
    setText(submission.text);
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
                  ref={textareaRef}
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

          <WorkSubmissionHistory
            submissions={submissions}
            passThreshold={section.passThreshold}
            loading={loading}
            onRestore={handleRestore}
            noun="submission"
          />
        </>
      )}
    </div>
  );
}
