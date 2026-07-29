import React from 'react';
import { QUESTION_KINDS, blankAnswer, applyKindChange } from './questionModel';

/**
 * The per-question authoring body: prompt, kind, answer rows with an isCorrect
 * toggle, explanation and points.
 *
 * Shared verbatim by CourseQuizBuilder and by CourseVideoWorkbench's pop-up
 * questions. The timing fields (`videoTimestampSec` / `rewindToSec`) are
 * deliberately *not* rendered here — they only exist for pop-ups, so the video
 * workbench renders them itself above this form rather than this form growing a
 * mode flag.
 *
 * @param {object}   question  the authoring-shape question (see questionModel)
 * @param {Function} onChange  (nextQuestion) => void — fully controlled
 * @param {boolean}  disabled
 */
export default function QuestionForm({ question, onChange, disabled = false }) {
  const answers = question.answers ?? [];

  const patch = (fields) => onChange({ ...question, ...fields });
  const setAnswers = (next) => patch({ answers: next });

  const toggleCorrect = (key) => {
    if (question.kind === 'MULTI') {
      setAnswers(answers.map((a) => (a._key === key ? { ...a, isCorrect: !a.isCorrect } : a)));
    } else {
      // SINGLE and TRUE_FALSE are radio semantics: exactly one correct.
      setAnswers(answers.map((a) => ({ ...a, isCorrect: a._key === key })));
    }
  };

  // TRUE_FALSE owns its answer text — the pair is fixed, only which one is
  // correct is editable.
  const isFixedAnswers = question.kind === 'TRUE_FALSE';

  return (
    <div className="pm-course-question-form">
      <div className="cpm-blog-meta-field">
        <label className="cpm-form-label">Prompt</label>
        <textarea
          className="cpm-form-input cpm-blog-meta-textarea"
          rows={2}
          value={question.prompt ?? ''}
          onChange={(e) => patch({ prompt: e.target.value })}
          placeholder="What do you want to ask?"
          disabled={disabled}
        />
      </div>

      <div className="pm-course-question-row">
        <div className="cpm-blog-meta-field">
          <label className="cpm-form-label">Type</label>
          <select
            className="cpm-form-input"
            value={question.kind ?? 'SINGLE'}
            onChange={(e) => onChange(applyKindChange(question, e.target.value))}
            disabled={disabled}
          >
            {Object.entries(QUESTION_KINDS).map(([kind, meta]) => (
              <option key={kind} value={kind}>{meta.label}</option>
            ))}
          </select>
        </div>
        <div className="cpm-blog-meta-field">
          <label className="cpm-form-label">Points</label>
          <input
            type="number"
            min={1}
            className="cpm-form-input"
            value={question.points ?? 1}
            onChange={(e) => patch({ points: Math.max(1, Number(e.target.value) || 1) })}
            disabled={disabled}
          />
        </div>
      </div>

      <div className="cpm-blog-meta-field">
        <label className="cpm-form-label">
          Answers
          <span className="cpm-blog-meta-hint">
            {question.kind === 'MULTI' ? ' — tick every correct option' : ' — tick the correct option'}
          </span>
        </label>
        <div className="pm-course-answer-list">
          {answers.map((answer) => (
            <div key={answer._key} className="pm-course-answer-row">
              <button
                type="button"
                className={`pm-course-answer-correct${answer.isCorrect ? ' is-on' : ''}`}
                onClick={() => toggleCorrect(answer._key)}
                disabled={disabled}
                aria-pressed={!!answer.isCorrect}
                title={answer.isCorrect ? 'Correct answer' : 'Mark correct'}
                aria-label={answer.isCorrect ? 'Correct answer' : 'Mark correct'}
              >
                <i className={`fas ${answer.isCorrect ? 'fa-circle-check' : 'fa-circle'}`} aria-hidden="true" />
              </button>
              <input
                className="cpm-form-input"
                value={answer.text ?? ''}
                onChange={(e) => setAnswers(
                  answers.map((a) => (a._key === answer._key ? { ...a, text: e.target.value } : a))
                )}
                placeholder="Answer option"
                disabled={disabled || isFixedAnswers}
              />
              {!isFixedAnswers && (
                <button
                  type="button"
                  className="pm-course-answer-del"
                  onClick={() => setAnswers(answers.filter((a) => a._key !== answer._key))}
                  disabled={disabled || answers.length <= 2}
                  title={answers.length <= 2 ? 'A question needs at least two answers' : 'Remove this answer'}
                  aria-label="Remove answer"
                >
                  <i className="fas fa-xmark" aria-hidden="true" />
                </button>
              )}
            </div>
          ))}
        </div>
        {!isFixedAnswers && (
          <button
            type="button"
            className="clubpm-btn-secondary pm-course-answer-add"
            onClick={() => setAnswers([...answers, blankAnswer()])}
            disabled={disabled}
          >
            <i className="fas fa-plus" aria-hidden="true" /> Add answer
          </button>
        )}
      </div>

      <div className="cpm-blog-meta-field">
        <label className="cpm-form-label">Explanation</label>
        <textarea
          className="cpm-form-input cpm-blog-meta-textarea"
          rows={2}
          value={question.explanation ?? ''}
          onChange={(e) => patch({ explanation: e.target.value })}
          placeholder="Shown after grading — never sent with the question itself"
          disabled={disabled}
        />
      </div>
    </div>
  );
}
