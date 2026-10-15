import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import LabCheckout from './LabCheckout';
import { get, labCheckOut, suggestActions, executePlan } from '../../../api/clubPmClient';

jest.mock('../../../api/clubPmClient', () => ({ get: jest.fn(), labCheckOut: jest.fn(), suggestActions: jest.fn(), executePlan: jest.fn() }));

const visit = { id: 'v1', memberId: 'me', checkedInAt: new Date(Date.now() - 90 * 60000).toISOString(), workspace: { name: 'Design lab' } };
const tasks = [
  { id: 'todo', title: 'Design bracket', status: 'TODO', projectId: 'p1', project: { name: 'ARES' } },
  { id: 'blocked', title: 'Test sensor', status: 'BLOCKED', projectId: 'p2', project: { name: 'AstroUSA' } },
  { id: 'active', title: 'Wire pod', status: 'IN_PROGRESS', projectId: 'p1', project: { name: 'ARES' } },
  { id: 'done', title: 'Old work', status: 'DONE', projectId: 'p1' },
];
const saved = { allocations: [{ taskId: 'todo', title: 'Design bracket', minutes: 90 }], unallocatedMinutes: 0 };
const renderCheckout = () => {
  const onComplete = jest.fn(); const onClose = jest.fn();
  render(<LabCheckout visit={visit} tasks={tasks} onComplete={onComplete} onClose={onClose} />);
  return { onComplete, onClose };
};
beforeEach(() => {
  jest.resetAllMocks();
  get.mockResolvedValue([{ id: 'p1', name: 'ARES' }, { id: 'p2', name: 'AstroUSA' }]);
  labCheckOut.mockResolvedValue(saved);
});

test('all non-done assigned tasks are selectable and searching preserves selections across projects', async () => {
  renderCheckout();
  fireEvent.click(screen.getByRole('checkbox', { name: /Design bracket/ }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Search assigned tasks' }), { target: { value: 'AstroUSA' } });
  fireEvent.click(screen.getByRole('checkbox', { name: /Test sensor/ }));
  expect(screen.getByText('2 selected')).toBeInTheDocument();
  fireEvent.change(screen.getByRole('textbox', { name: 'Search assigned tasks' }), { target: { value: '' } });
  expect(screen.getByRole('checkbox', { name: /Design bracket/ })).toBeChecked();
  expect(screen.getByRole('checkbox', { name: /Wire pod/ })).not.toBeChecked();
  expect(screen.queryByText('Old work')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Save & check out/ }));
  await screen.findByText('Good work. You’re checked out.');
  expect(labCheckOut).toHaveBeenCalledWith(expect.any(String), { visitId: 'v1', taskIds: ['todo', 'blocked'], recap: '' });
});

test('a TODO task can move to in progress only after check-out and explicit plan approval', async () => {
  executePlan.mockResolvedValue({ results: [{ index: 0, ok: true }] });
  const { onComplete } = renderCheckout();
  fireEvent.click(screen.getByRole('checkbox', { name: /Design bracket/ }));
  fireEvent.change(screen.getByLabelText('Status for Design bracket'), { target: { value: 'IN_PROGRESS' } });
  expect(executePlan).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: /Save & check out/ }));
  fireEvent.click(await screen.findByRole('button', { name: 'Apply 1 change' }));
  await screen.findByText('1 task change applied.');
  expect(executePlan).toHaveBeenCalledWith('p1', [expect.objectContaining({ type: 'SET_STATUS', targetTaskId: 'todo', params: { status: 'IN_PROGRESS' } })]);
  fireEvent.click(screen.getByRole('button', { name: 'Finish' }));
  expect(onComplete).toHaveBeenCalledWith(saved);
});

test('recap can be saved with no task selection; an AI failure does not block checkout', async () => {
  suggestActions.mockRejectedValue(new Error('AI unavailable'));
  renderCheckout();
  await screen.findByRole('option', { name: 'ARES' });
  fireEvent.change(screen.getByLabelText('What you worked on'), { target: { value: 'Organized the lab' } });
  fireEvent.click(screen.getByRole('button', { name: 'Build action plan' }));
  await screen.findByText('AI unavailable');
  fireEvent.click(screen.getByRole('button', { name: /Save & check out/ }));
  await screen.findByText('Good work. You’re checked out.');
  expect(labCheckOut).toHaveBeenCalledWith(expect.any(String), { visitId: 'v1', taskIds: [], recap: 'Organized the lab' });
});

test('generated task edits are reviewable, self assigned, and definite failures can be retried without duplicating successes', async () => {
  suggestActions.mockResolvedValue({ actions: [
    { type: 'CREATE_TASK', params: { title: 'Print bracket', description: 'Use revision B', assigneeIds: ['someone-else'], priority: 'CRITICAL' }, rationale: 'Next step' },
    { type: 'SET_STATUS', targetTaskId: 'todo', params: { status: 'DONE' }, rationale: 'Finished' },
  ] });
  executePlan.mockResolvedValueOnce({ results: [{ index: 0, ok: true }, { index: 1, ok: false, error: 'Completion requires review' }] });
  renderCheckout();
  await screen.findByRole('option', { name: 'ARES' });
  fireEvent.change(screen.getByLabelText('What you worked on'), { target: { value: 'Finished design; print next' } });
  fireEvent.click(screen.getByRole('button', { name: 'Build action plan' }));
  const title = await screen.findByLabelText('Proposed task 1');
  fireEvent.change(title, { target: { value: 'Print revision B' } });
  fireEvent.click(screen.getByRole('button', { name: /Save & check out/ }));
  fireEvent.click(await screen.findByRole('button', { name: 'Apply 2 changes' }));
  await screen.findByText('Completion requires review');
  expect(executePlan.mock.calls[0][1][0].params).toEqual({ title: 'Print revision B', description: 'Use revision B', assigneeIds: ['me'] });
  expect(screen.queryByLabelText('Proposed task 1')).not.toBeInTheDocument();
  expect(labCheckOut).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('checkbox', { name: /Change status/ }));
  executePlan.mockResolvedValueOnce({ results: [{ index: 0, ok: true }] });
  fireEvent.click(screen.getByRole('button', { name: 'Apply 1 change' }));
  await waitFor(() => expect(executePlan).toHaveBeenCalledTimes(2));
  expect(executePlan.mock.calls[1][1]).toHaveLength(1);
  expect(executePlan.mock.calls[1][1][0].type).toBe('SET_STATUS');
});

test('check-out errors retain the selections and recap, and rapid clicks submit once', async () => {
  let reject;
  labCheckOut.mockImplementation(() => new Promise((_, fail) => { reject = fail; }));
  renderCheckout();
  fireEvent.click(screen.getByRole('checkbox', { name: /Design bracket/ }));
  fireEvent.change(screen.getByLabelText('What you worked on'), { target: { value: 'Reviewed dimensions' } });
  const button = screen.getByRole('button', { name: /Save & check out/ });
  fireEvent.click(button); fireEvent.click(button);
  expect(labCheckOut).toHaveBeenCalledTimes(1);
  reject(new Error('Connection lost'));
  await screen.findByText('Connection lost');
  expect(screen.getByRole('checkbox', { name: /Design bracket/ })).toBeChecked();
  expect(screen.getByLabelText('What you worked on')).toHaveValue('Reviewed dimensions');
});

test('uncertain action responses cannot resubmit a task creation', async () => {
  suggestActions.mockResolvedValue({ actions: [{ type: 'CREATE_TASK', params: { title: 'New work' } }] });
  executePlan.mockRejectedValue(new Error('Connection lost'));
  renderCheckout();
  await screen.findByRole('option', { name: 'ARES' });
  fireEvent.change(screen.getByLabelText('What you worked on'), { target: { value: 'Need new work' } });
  fireEvent.click(screen.getByRole('button', { name: 'Build action plan' }));
  await screen.findByLabelText('Proposed task 1');
  fireEvent.click(screen.getByRole('button', { name: /Save & check out/ }));
  fireEvent.click(await screen.findByRole('button', { name: 'Apply 1 change' }));
  await screen.findByText(/Task update results could not be confirmed/);
  expect(screen.queryByRole('button', { name: /Apply/ })).not.toBeInTheDocument();
  expect(labCheckOut).toHaveBeenCalledTimes(1);
});
