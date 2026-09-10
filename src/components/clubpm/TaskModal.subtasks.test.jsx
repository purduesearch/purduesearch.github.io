import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import TaskModal from './TaskModal';
import { get, patch } from '../../api/clubPmClient';

jest.mock('../../api/clubPmClient', () => ({
  get: jest.fn(),
  post: jest.fn(),
  patch: jest.fn(),
  del: jest.fn(),
  archiveTask: jest.fn(),
  unarchiveTask: jest.fn(),
}));
jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: { success: jest.fn(), error: jest.fn(), loading: jest.fn(), dismiss: jest.fn() },
}));
jest.mock('../../clubpm/ClubPmAuth', () => ({
  useClubPmAuth: () => ({ member: { id: 'm1', displayName: 'Me' } }),
}));
jest.mock('./github/GitHubTaskSection', () => () => null);

const ADA = { id: 'm2', displayName: 'Ada Lovelace' };
const PARENT = { id: 'p1', title: 'Parent task', projectId: 'proj1', status: 'TODO', priority: 'MEDIUM', assignees: [], tags: [] };
const SUB = { id: 's1', title: 'Child task', projectId: 'proj1', status: 'TODO', priority: 'LOW', assignees: [], tags: [] };

beforeEach(() => {
  jest.clearAllMocks();
  get.mockImplementation((url) => {
    if (url === '/api/tasks/p1/subtasks') return Promise.resolve([SUB]);
    if (url === '/api/tasks/p1') return Promise.resolve(PARENT);
    if (url === '/api/tasks/s1') return Promise.resolve(SUB);
    if (url === '/api/projects/proj1') return Promise.resolve({ id: 'proj1', members: [{ member: ADA }], tasks: [] });
    if (url === '/api/projects') return Promise.resolve([]);
    return Promise.resolve([]);
  });
});

// Opens the parent task modal, then the nested modal for its subtask.
async function openSubtask() {
  const onUpdate = jest.fn();
  render(<TaskModal task={PARENT} onClose={jest.fn()} onUpdate={onUpdate} />);
  // The subtask title renders twice (subtask list + dependencies list); the
  // clickable row is the first.
  const rows = await screen.findAllByText('Child task');
  fireEvent.click(rows[0]);
  await screen.findByRole('heading', { name: 'Child task' });
  return onUpdate;
}

describe('TaskModal nested subtask edits', () => {
  it('propagates a subtask assignee change to the parent onUpdate handler', async () => {
    patch.mockResolvedValue({ id: 's1', assignees: [ADA] });
    const onUpdate = await openSubtask();

    // The nested modal is the later of the two assignee editors.
    const unassigned = screen.getAllByText('Unassigned');
    fireEvent.click(unassigned[unassigned.length - 1]);
    fireEvent.click(await screen.findByText('Ada Lovelace'));

    await waitFor(() => expect(patch).toHaveBeenCalledWith('/api/tasks/s1', expect.objectContaining({ assigneeIds: ['m2'] })));
    await waitFor(() => {
      expect(onUpdate.mock.calls.some(
        ([t]) => t.id === 's1' && t.assignees?.some(a => a.id === 'm2')
      )).toBe(true);
    });
  });

  it("refreshes the parent's subtask list when the subtask is renamed", async () => {
    patch.mockResolvedValue({ id: 's1', title: 'Renamed child' });
    await openSubtask();

    fireEvent.click(screen.getByRole('heading', { name: 'Child task' }));
    const input = await screen.findByDisplayValue('Child task');
    fireEvent.change(input, { target: { value: 'Renamed child' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    // No stale copy of the old title survives in the parent's subtask list.
    await waitFor(() => expect(screen.queryByText('Child task')).toBeNull());
  });
});
