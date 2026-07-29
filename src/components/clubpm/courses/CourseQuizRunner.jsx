import React, { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { listCourseQuestions, submitCourseQuiz } from '../../../api/clubPmClient';

// Mirrors courseProgressService.DEFAULT_PASS_THRESHOLD — used only for the
// "you need X%" hint before an attempt; the grade in the response is the truth.
const DEFAULT_PASS_THRESHOLD = 80;

/**
 * The learner-side quiz. Questions come from
 * `GET /sections/:sid/questions`, which strips `isCorrect` and `explanation`
 * for non-editors — so nothing here can grade. Correctness and explanations
 * exist only in the `POST /quiz/attempts` response.
 *
 * @param {object}   section       learner section row (passThreshold, maxAttempts, attemptsUsed…)
 * @param {boolean}  preview       author preview: questions are shown, nothing is submitted
 * @param {Function} onPassed      fired after a passing attempt so the host can advance + refetch
 * @param {Function} onAttemptUsed fired after any graded attempt so the host can refresh counts
 */
export default function CourseQuizRunner({ section, preview = false, onPassed, onAttemptUsed }) {
  const sectionId = section?.id ?? null;
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [selected, setSelected] = useState({});   // questionId → answerId[]
  const [result, setResult] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  // Counts the attempts made in this mounted session on top of what the learner
  // payload reported, so "attempts remaining" is right without a full refetch.
  const [extraAttempts, setExtraAttempts] = useState(0);

  useEffect(() => {
    if (!sectionId) return undefined;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    setSelected({});
    setResult(null);
    setExtraAttempts(0);
    listCourseQuestions(sectionId)
      .then((rows) => {
        if (cancelled) return;
        // Timestamped rows are in-video pop-ups, not quiz questions.
        setQuestions((Array.isArray(rows) ? rows : []).filter((q) => q.videoTimestampSec == null));
      })
      .catch((err) => { if (!cancelled) setLoadError(err.message ?? 'Could not load this quiz'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [sectionId]);

  const passThreshold = section?.passThreshold ?? DEFAULT_PASS_THRESHOLD;
  const maxAttempts = section?.maxAttempts ?? null;
  const attemptsUsed = (section?.attemptsUsed ?? 0) + extraAttempts;
  const attemptsLeft = maxAttempts == null ? null : Math.max(0, maxAttempts - attemptsUsed);
  const exhausted = attemptsLeft === 0;
  const alreadyPassed = Boolean(section?.passed) && !result;
  // Re-submitting a quiz you have already passed cannot improve anything (the
  // section is COMPLETED and the reward gate has fired) but it does consume an
  // attempt, so the only way to lose ground is to take it again.
  const locked = preview || alreadyPassed || exhausted;

  const resultByQuestion = useMemo(() => {
    const map = new Map();
    for (const row of result?.perQuestion ?? []) map.set(row.questionId, row);
    return map;
  }, [result]);

  const answered = questions.every((q) => (selected[q.id] ?? []).length > 0);

  const toggle = useCallback((question, answerId) => {
    setSelected((prev) => {
      const current = prev[question.id] ?? [];
      if (question.kind === 'MULTI') {
        return {
          ...prev,
          [question.id]: current.includes(answerId)
            ? current.filter((id) => id !== answerId)
            : [...current, answerId],
        };
      }
      return { ...prev, [question.id]: [answerId] };
    });
  }, []);

  const submit = async () => {
    if (!sectionId || submitting || locked) return;
    setSubmitting(true);
    try {
      const responses = questions.map((q) => ({
        questionId: q.id,
        answerIds: selected[q.id] ?? [],
      }));
      // clubPmClient dispatches the reward / quest / rank events off this
      // response body — nothing to fire by hand here.
      const graded = await submitCourseQuiz(sectionId, responses);
      setResult(graded);
      setExtraAttempts((n) => n + 1);
      onAttemptUsed?.(graded);
      if (graded.passed) {
        toast.success(`Passed — ${Math.round(graded.scorePct)}%`);
        onPassed?.(graded);
      }
    } catch (err) {
      toast.error(err.message ?? 'Could not submit this attempt');
    } finally {
      setSubmitting(false);
    }
  };

  const retry = () => { setResult(null); setSelected({}); };

  if (loading) return <p className="pm-course-quiz-status">Loading quiz…</p>;
  if (loadError) {
    return (
      <p className="pm-course-quiz-status pm-course-quiz-status--error">
        <i className="fas fa-triangle-exclamation" aria-hidden="true" /> {loadError}
      </p>
    );
  }
  if (!questions.length) {
    return <p className="pm-course-quiz-status">This quiz has no questions yet.</p>;
  }

  return (
    <div className="pm-course-quiz">
      <div className="pm-course-quiz-head">
        <span className="cpm-tag">Pass mark {passThreshold}%</span>
        {maxAttempts != null && (
          <span className="cpm-tag">
            {attemptsLeft} of {maxAttempts} attempt{maxAttempts === 1 ? '' : 's'} remaining
          </span>
        )}
        {alreadyPassed && (
          <span className="cpm-tag">
            <i className="fas fa-check" aria-hidden="true" /> Already passed
          </span>
        )}
      </div>

      <ol className="pm-course-quiz-list">
        {questions.map((question, index) => {
          const multi = question.kind === 'MULTI';
          const graded = resultByQuestion.get(question.id);
          const chosen = selected[question.id] ?? [];
          return (
            <li
              key={question.id}
              className={`pm-course-quiz-item${graded ? (graded.isCorrect ? ' is-correct' : ' is-wrong') : ''}`}
            >
              <p className="pm-course-quiz-prompt">
                <span className="pm-course-quiz-index">{index + 1}.</span>
                {question.prompt}
                {multi && <span className="pm-course-quiz-hint"> (select all that apply)</span>}
              </p>

              <ul className="pm-course-quiz-answers">
                {(question.answers ?? []).map((answer) => (
                  <li key={answer.id}>
                    <label className="pm-course-quiz-answer">
                      <input
                        type={multi ? 'checkbox' : 'radio'}
                        name={`q-${question.id}`}
                        checked={chosen.includes(answer.id)}
                        onChange={() => toggle(question, answer.id)}
                        disabled={submitting || Boolean(result) || locked}
                      />
                      <span>{answer.text}</span>
                    </label>
                  </li>
                ))}
              </ul>

              {graded && (
                <div className={`pm-course-quiz-feedback${graded.isCorrect ? ' is-correct' : ' is-wrong'}`}>
                  <strong>
                    <i className={`fas ${graded.isCorrect ? 'fa-check' : 'fa-xmark'}`} aria-hidden="true" />
                    {graded.isCorrect ? ' Correct' : ' Incorrect'}
                  </strong>
                  {graded.explanation && <p>{graded.explanation}</p>}
                </div>
              )}
            </li>
          );
        })}
      </ol>

      {result && (
        <div className={`pm-course-quiz-score${result.passed ? ' is-pass' : ' is-fail'}`} role="status">
          <strong>{Math.round(result.scorePct)}%</strong>
          <span>
            {result.passed
              ? 'Passed — the next section is unlocked.'
              : `Below the ${result.passThreshold}% pass mark.`}
          </span>
        </div>
      )}

      <div className="pm-course-quiz-actions">
        {!result && (
          <button
            type="button"
            className="clubpm-btn-primary"
            onClick={submit}
            disabled={submitting || !answered || locked}
            title={
              preview ? 'Preview only — attempts are not recorded'
                : alreadyPassed ? 'You have already passed this quiz'
                  : exhausted ? 'No attempts remaining'
                    : undefined
            }
          >
            {submitting ? 'Submitting…' : 'Submit answers'}
          </button>
        )}
        {result && !result.passed && !exhausted && (
          <button type="button" className="clubpm-btn-secondary" onClick={retry}>
            <i className="fas fa-rotate-left" aria-hidden="true" /> Try again
          </button>
        )}
        {preview && (
          <p className="pm-course-quiz-status">
            Author preview — answers are not graded and no attempt is recorded.
          </p>
        )}
        {!preview && alreadyPassed && (
          <p className="pm-course-quiz-status">
            You have already passed this quiz, so there is nothing left to attempt.
          </p>
        )}
        {!preview && exhausted && !result?.passed && !alreadyPassed && (
          <p className="pm-course-quiz-status">
            You have used every attempt on this quiz. Ask an admin to reset it.
          </p>
        )}
      </div>
    </div>
  );
}
