import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import WorkSubmissionHistory from './WorkSubmissionHistory';

/**
 * Newest-first, exactly as `listWorkSubmissions` returns them.
 * The oldest attempt is deliberately ungraded — that is the fail-open path
 * (grading threw, the submission still counted) and it must render as
 * "never graded", never as a zero.
 */
const SUBMISSIONS = [
  {
    id: 's3', text: 'third draft', wordCount: 210, fileName: null,
    createdAt: '2026-09-02T16:12:00.000Z',
    feedback: {
      scorePct: 81, overall: 'Strong on method.',
      points: [{ id: 'p1', verdict: 'caught', comment: 'Nailed the sampling design.' }],
    },
  },
  {
    id: 's2', text: 'second draft', wordCount: 190, fileName: null,
    createdAt: '2026-09-01T21:03:00.000Z',
    feedback: {
      scorePct: 63, overall: 'Closer.',
      points: [{ id: 'p1', verdict: 'partial', comment: 'Method only half described.' }],
    },
  },
  {
    id: 's1', text: 'first draft', wordCount: 168, fileName: 'draft.pdf',
    createdAt: '2026-08-30T14:15:00.000Z',
    feedback: null,
  },
];

const renderHistory = (props = {}) =>
  render(
    <WorkSubmissionHistory
      submissions={SUBMISSIONS}
      passThreshold={70}
      loading={false}
      noun="summary"
      {...props}
    />
  );

test('shows no score anywhere when the section is ungated', () => {
  // The load-bearing rule: on an ungated section a visible number would invent
  // a pass/fail the design does not have.
  renderHistory({ passThreshold: null });

  expect(screen.queryByText(/81%/)).not.toBeInTheDocument();
  expect(screen.queryByText(/63%/)).not.toBeInTheDocument();
  expect(screen.queryByText(/to pass/)).not.toBeInTheDocument();
});

test('shows the latest score against the threshold when gated', () => {
  renderHistory();

  expect(screen.getByText('81%')).toBeInTheDocument();
  expect(screen.getByText(/70% to pass/)).toBeInTheDocument();
});

test('lists prior attempts, newest first, numbered down from the total', () => {
  renderHistory();

  expect(screen.getByText('Earlier attempts (2)')).toBeInTheDocument();
  const attempts = screen.getAllByRole('button', { name: /^Attempt/ });
  expect(attempts).toHaveLength(2);
  expect(attempts[0]).toHaveTextContent('Attempt 2');
  expect(attempts[1]).toHaveTextContent('Attempt 1');
});

test('each prior attempt carries its own score, not the latest one', () => {
  renderHistory();

  const attempt2 = screen.getByRole('button', { name: /Attempt 2/ });
  expect(attempt2).toHaveTextContent('63%');
});

test('an ungraded attempt reads as ungraded rather than as a zero', () => {
  renderHistory();

  const attempt1 = screen.getByRole('button', { name: /Attempt 1/ });
  expect(attempt1).toHaveTextContent('Ungraded');
  expect(attempt1).not.toHaveTextContent('0%');
});

test('a prior attempt expands to reveal its own feedback', () => {
  renderHistory();

  expect(screen.queryByText('Method only half described.')).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /Attempt 2/ }));

  expect(screen.getByText('Method only half described.')).toBeInTheDocument();
});

test('restoring a prior attempt hands its submission back to the composer', () => {
  const onRestore = jest.fn();
  renderHistory({ onRestore });

  const attempt2Row = screen.getByRole('button', { name: /Attempt 2/ }).closest('li');
  fireEvent.click(within(attempt2Row).getByRole('button', { name: /Revise from this/ }));

  expect(onRestore).toHaveBeenCalledTimes(1);
  expect(onRestore).toHaveBeenCalledWith(expect.objectContaining({ id: 's2' }));
});

test('the latest attempt can also be restored — submitting clears the composer', () => {
  const onRestore = jest.fn();
  renderHistory({ onRestore });

  // The first restore button on the page belongs to the latest-feedback panel.
  fireEvent.click(screen.getAllByRole('button', { name: /Revise from this/ })[0]);

  expect(onRestore).toHaveBeenCalledWith(expect.objectContaining({ id: 's3' }));
});

test('offers no restore affordance when the caller passes no handler', () => {
  renderHistory({ onRestore: undefined });

  expect(screen.queryByRole('button', { name: /Revise from this/ })).not.toBeInTheDocument();
});

test('renders nothing at all before a first submission', () => {
  const { container } = renderHistory({ submissions: [] });

  expect(container).toBeEmptyDOMElement();
});
