// The shape of a CourseQuestion while it is being authored, and the three
// operations every authoring surface needs on it: make a blank one, hydrate a
// server row into one, serialize one back, and validate it.
//
// This is deliberately React-free. Both CourseQuizBuilder (untimed quiz
// questions) and CourseVideoWorkbench (timed pop-ups) author the same row type,
// and before this module existed the video surface imported these helpers out of
// the quiz *component* — a dependency between two sibling screens that had no
// business knowing about each other.

export const QUESTION_KINDS = {
  SINGLE:     { label: 'Single choice', icon: 'fas fa-circle-dot' },
  MULTI:      { label: 'Multi select',  icon: 'fas fa-square-check' },
  TRUE_FALSE: { label: 'True / false',  icon: 'fas fa-toggle-on' },
};

// Local-only key so React (and dnd-kit) can identify a question or answer that
// has never been saved and therefore has no server id yet. Once a row is
// persisted its `_key` becomes the server id, so list identity survives a save
// without remounting the card the author is typing in.
let keySeq = 0;
export const nextKey = () => `new-${++keySeq}`;

export function blankAnswer(text = '', isCorrect = false) {
  return { _key: nextKey(), text, isCorrect };
}

export function blankQuestion(kind = 'SINGLE', extra = {}) {
  return {
    _key: nextKey(),
    id: null,
    prompt: '',
    kind,
    explanation: '',
    points: 1,
    videoTimestampSec: null,
    rewindToSec: null,
    answers: kind === 'TRUE_FALSE'
      ? [blankAnswer('True', true), blankAnswer('False', false)]
      : [blankAnswer(), blankAnswer()],
    ...extra,
  };
}

// Server rows arrive without the local keys the editor needs for list identity,
// and with nullable text columns the form inputs cannot bind to.
export function hydrate(question) {
  return {
    ...question,
    _key: question.id ?? nextKey(),
    prompt: question.prompt ?? '',
    explanation: question.explanation ?? '',
    points: question.points ?? 1,
    answers: (question.answers ?? []).map((a) => ({ ...a, _key: a.id ?? nextKey() })),
  };
}

// Strip the local bookkeeping before it goes over the wire. `order` is assigned
// from array position — the list order *is* the question order. Forwarding a
// saved question's `id` is what lets the server update it in place; recreating
// it would cascade its response rows away and reset the admin item analysis.
export function serializeQuestion(question, index) {
  return {
    id: question.id ?? undefined,
    order: index,
    prompt: (question.prompt ?? '').trim(),
    kind: question.kind ?? 'SINGLE',
    explanation: (question.explanation ?? '').trim() || null,
    points: Number(question.points) || 1,
    videoTimestampSec: question.videoTimestampSec ?? null,
    rewindToSec: question.rewindToSec ?? null,
    answers: (question.answers ?? []).map((a, i) => ({
      order: i,
      text: (a.text ?? '').trim(),
      isCorrect: !!a.isCorrect,
    })),
  };
}

// A question is only savable once it has a prompt, non-empty answer text and at
// least one correct answer — the server rejects the first two and silently
// accepts an ungradeable question for the third.
export function validateQuestion(question) {
  if (!(question.prompt ?? '').trim()) return 'Every question needs a prompt.';
  const answers = question.answers ?? [];
  if (answers.length < 2) return 'Every question needs at least two answers.';
  if (answers.some((a) => !(a.text ?? '').trim())) return 'Answer options cannot be blank.';
  if (!answers.some((a) => a.isCorrect)) return 'Mark at least one answer correct.';
  if (question.kind === 'SINGLE' && answers.filter((a) => a.isCorrect).length > 1) {
    return 'A single-choice question can only have one correct answer.';
  }
  return null;
}

// Switching kind reshapes the answer set: TRUE_FALSE is a fixed pair, and
// leaving SINGLE with two correct answers would be ungradeable. Pure so the
// reshaping rules can be tested without mounting the form.
export function applyKindChange(question, kind) {
  const answers = question.answers ?? [];

  if (kind === 'TRUE_FALSE') {
    const trueIsCorrect = answers.find((a) => /^true$/i.test((a.text ?? '').trim()))?.isCorrect ?? true;
    return {
      ...question,
      kind,
      answers: [blankAnswer('True', !!trueIsCorrect), blankAnswer('False', !trueIsCorrect)],
    };
  }

  if (kind === 'SINGLE') {
    // Keep the first correct answer, drop the rest.
    let seen = false;
    return {
      ...question,
      kind,
      answers: answers.map((a) => {
        const keep = a.isCorrect && !seen;
        if (keep) seen = true;
        return { ...a, isCorrect: keep };
      }),
    };
  }

  return { ...question, kind };
}
