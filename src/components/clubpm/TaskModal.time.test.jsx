import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import TaskModal from './TaskModal';
import { get, post, getSlackLinks } from '../../api/clubPmClient';
import { useCompactLayout } from '../../clubpm/layout/compactLayout';

jest.mock('../../api/clubPmClient', () => ({
  get: jest.fn(),
  getSlackLinks: jest.fn(() => Promise.resolve([])),
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
jest.mock('../../clubpm/layout/compactLayout', () => ({
  useCompactLayout: jest.fn(),
}));
jest.mock('./github/GitHubTaskSection', () => () => null);

const TASK = { id: 't1', title: 'Comment target', projectId: 'proj1', status: 'TODO', priority: 'MEDIUM', assignees: [], tags: [] };

beforeEach(() => {
  jest.clearAllMocks();
  getSlackLinks.mockResolvedValue([]);
  useCompactLayout.mockReturnValue(false);
  get.mockImplementation((url) => {
    if (url === '/api/tasks/t1') return Promise.resolve(TASK);
    if (url === '/api/projects/proj1') return Promise.resolve({ id: 'proj1', members: [], tasks: [] });
    return Promise.resolve([]);
  });
});


describe('TaskModal manual time entry', () => {
  it('logs typed minutes and a note once while the request is pending', async () => {
    let settle;
    post.mockImplementation(() => new Promise(resolve => { settle = resolve; }));
    render(<TaskModal task={TASK} onClose={jest.fn()} onUpdate={jest.fn()} />);
    const input = await screen.findByRole('spinbutton', { name: 'Minutes to log' });
    fireEvent.change(input, { target: { value: '30' } });
    fireEvent.change(screen.getByPlaceholderText('Note (optional)'), { target: { value: 'Sensor calibration' } });
    const log = screen.getByRole('button', { name: 'Log time', exact: true });
    act(() => { log.click(); log.click(); });
    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith('/api/tasks/t1/time-logs', { minutes: 30, note: 'Sensor calibration' });
    await act(async () => settle({ id: 'log1', minutes: 30, note: 'Sensor calibration' }));
    expect(await screen.findByText('Logged: 30 min')).toBeInTheDocument();
    expect(input).toHaveValue(null);
  });

  it('keeps the typed entry after failure so it can be retried', async () => {
    post.mockRejectedValueOnce(new Error('Offline'));
    render(<TaskModal task={TASK} onClose={jest.fn()} onUpdate={jest.fn()} />);
    const input = await screen.findByRole('spinbutton', { name: 'Minutes to log' });
    fireEvent.change(input, { target: { value: '45' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log time', exact: true }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Log time', exact: true })).toBeEnabled());
    expect(input).toHaveValue(45);
    post.mockResolvedValueOnce({ id: 'log2', minutes: 45 });
    fireEvent.click(screen.getByRole('button', { name: 'Log time', exact: true }));
    expect(await screen.findByText('Logged: 45 min')).toBeInTheDocument();
  });
});
