import React, { useState } from 'react';

/**
 * Every attempt a learner has made on a LIT_REVIEW or ASSIGNMENT section, with
 * the feedback each one earned at the time.
 *
 * Shared by LitReviewSection and AssignmentSection, which were near-verbatim
 * duplicates of each other down to a parallel `pm-lit-*` / `pm-assign-*` class
 * pair for identical rules. Everything below the composer now renders from here
 * under a single `pm-work-*` namespace, so a change to the feedback layout
 * happens once instead of twice-and-eventually-diverging.
 *
 * `CourseWorkSubmission` writes one row PER ATTEMPT and never updates in place,
 * so this history is the real revision trail — it was already in the database
 * and already returned by `listWorkSubmissions`; the old UI just dumped the raw
 * text of prior attempts and discarded their scores and feedback entirely.
 */

export const VERDICT_META = {
  caught:  { label: 'Caught it', icon: 'fas fa-circle-check' },
  partial: { label: 'Partly',    icon: 'fas fa-circle-half-stroke' },
  missed:  { label: 'Missed',    icon: 'fas fa-circle-xmark' },
};

const stamp = (iso) =>
  new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });

/**
 * The score line, rendered ONLY under a gate.
 *
 * On an ungated section a visible number would re-establish a pass/fail the
 * design deliberately does not have — a member who saw "48%" would read it as a
 * failure no matter what the surrounding copy said. Under a real gate the
 * opposite holds: withholding it leaves a learner told "not yet" with no way to
 * know how far off they are. Officers see the score either way in the course
 * progress view. Callers enforce this by passing `passThreshold={null}` when
 * ungated; do not add a fallback that renders a bare score without one.
 */
function ScoreLine({ scorePct, passThreshold }) {
  if (passThreshold == null || typeof scorePct !== 'number') return null;
  const passed = scorePct >= passThreshold;
  return (
    <p className={passed ? 'pm-work-score is-pass' : 'pm-work-score is-short'}>
      <strong>{scorePct}%</strong> · {passThreshold}% to pass
      {!passed && ' — not yet. The points below are where the marks are.'}
    </p>
  );
}

/** Overall comment plus the per-rubric-point verdict chips. */
export function FeedbackBody({ feedback }) {
  if (!feedback) return null;
  return (
    <>
      {feedback.overall && <p className="pm-work-overall">{feedback.overall}</p>}
      <ul className="pm-work-points">
        {(feedback.points ?? []).map((p) => {
          const meta = VERDICT_META[p.verdict] ?? VERDICT_META.missed;
          return (
            <li key={p.id} className={`pm-work-point is-${p.verdict}`}>
              <span className="pm-work-point-verdict">
                <i className={meta.icon} aria-hidden="true" /> {meta.label}
              </span>
              <span className="pm-work-point-comment">{p.comment}</span>
            </li>
          );
        })}
      </ul>
    </>
  );
}

/** One earlier attempt: a summary row that expands to its feedback and text. */
function AttemptRow({ submission, attemptNo, passThreshold, expanded, onToggle, onRestore, noun }) {
  const score = submission.feedback?.scorePct ?? null;
  const showScore = passThreshold != null && typeof score === 'number';
  const bodyId = `pm-work-attempt-${submission.id}`;

  return (
    <li className="pm-work-attempt">
      <div className="pm-work-attempt-head">
        <button
          type="button"
          className="pm-work-attempt-toggle"
          aria-expanded={expanded}
          aria-controls={bodyId}
          onClick={onToggle}
        >
          <i
            className={expanded ? 'fas fa-chevron-down' : 'fas fa-chevron-right'}
            aria-hidden="true"
          />
          <span className="pm-work-attempt-no">Attempt {attemptNo}</span>
          <span className="pm-work-attempt-meta">
            {stamp(submission.createdAt)} · {submission.wordCount} words
            {submission.fileName ? ` · ${submission.fileName}` : ''}
          </span>
          {showScore && (
            <span
              className={
                score >= passThreshold
                  ? 'pm-work-attempt-score is-pass'
                  : 'pm-work-attempt-score is-short'
              }
            >
              {score}%
            </span>
          )}
          {!submission.feedback && (
            <span className="pm-work-attempt-score is-pending">Ungraded</span>
          )}
        </button>
        {onRestore && (
          <button
            type="button"
            className="pm-work-restore"
            onClick={() => onRestore(submission)}
            title={`Load this ${noun} back into the editor to revise it`}
          >
            <i className="fas fa-rotate-left" aria-hidden="true" /> Revise from this
          </button>
        )}
      </div>

      {expanded && (
        <div className="pm-work-attempt-body" id={bodyId}>
          {submission.feedback ? (
            <FeedbackBody feedback={submission.feedback} />
          ) : (
            <p className="pm-work-empty">
              This attempt was never graded — feedback did not come back for it.
            </p>
          )}
          <details className="pm-work-text">
            <summary>Show what you wrote</summary>
            <p>{submission.text}</p>
          </details>
        </div>
      )}
    </li>
  );
}

export default function WorkSubmissionHistory({
  submissions,
  passThreshold,
  loading,
  onRestore,
  noun = 'summary',
}) {
  const [expanded, setExpanded] = useState(() => new Set());

  const toggle = (id) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  if (loading) return <p className="pm-work-empty">Loading your submissions…</p>;

  const latest = submissions[0] ?? null;
  if (!latest) return null;

  const earlier = submissions.slice(1);
  const total = submissions.length;

  return (
    <div className="pm-work-history">
      <div className="pm-work-feedback">
        <div className="pm-work-feedback-head">
          <h3>
            <i className="fas fa-comment-dots" aria-hidden="true" />
            {' '}Feedback on your latest {noun}
          </h3>
          {onRestore && (
            <button
              type="button"
              className="pm-work-restore"
              onClick={() => onRestore(latest)}
              title={`Load this ${noun} back into the editor to revise it`}
            >
              <i className="fas fa-rotate-left" aria-hidden="true" /> Revise from this
            </button>
          )}
        </div>

        <ScoreLine scorePct={latest.feedback?.scorePct ?? null} passThreshold={passThreshold} />

        {!latest.feedback ? (
          <p className="pm-work-empty">
            Feedback is still pending. This section is already complete — submit a
            revision later to try again.
          </p>
        ) : (
          <FeedbackBody feedback={latest.feedback} />
        )}

        <details className="pm-work-text">
          <summary>Show what you wrote</summary>
          <p>{latest.text}</p>
        </details>
      </div>

      {earlier.length > 0 && (
        <div className="pm-work-earlier">
          <h4>
            <i className="fas fa-clock-rotate-left" aria-hidden="true" />
            {' '}Earlier attempts ({earlier.length})
          </h4>
          <ul className="pm-work-attempts">
            {earlier.map((s, i) => (
              <AttemptRow
                key={s.id}
                submission={s}
                // submissions arrive newest-first, so the first EARLIER row is
                // one below the total and they count down from there.
                attemptNo={total - 1 - i}
                passThreshold={passThreshold}
                expanded={expanded.has(s.id)}
                onToggle={() => toggle(s.id)}
                onRestore={onRestore}
                noun={noun}
              />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
