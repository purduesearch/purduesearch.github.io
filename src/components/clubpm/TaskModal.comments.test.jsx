import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import TaskModal from './TaskModal';
import { get, post } from '../../api/clubPmClient';
import { useCompactLayout } from '../../clubpm/layout/compactLayout';

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
jest.mock('../../clubpm/layout/compactLayout', () => ({
  useCompactLayout: jest.fn(),
}));
jest.mock('./github/GitHubTaskSection', () => () => null);

const TASK = { id: 't1', title: 'Comment target', projectId: 'proj1', status: 'TODO', priority: 'MEDIUM', assignees: [], tags: [] };

beforeEach(() => {
  jest.clearAllMocks();
  useCompactLayout.mockReturnValue(false);
  get.mockImplementation((url) => {
    if (url === '/api/tasks/t1') return Promise.resolve(TASK);
    if (url === '/api/projects/proj1') return Promise.resolve({ id: 'proj1', members: [], tasks: [] });
    return Promise.resolve([]);
  });
});

describe('TaskModal comment submission', () => {
  it('posts once when the send control is activated twice before the first request settles', async () => {
    let settle;
    post.mockImplementation(() => new Promise((resolve) => { settle = resolve; }));
    render(<TaskModal task={TASK} onClose={jest.fn()} onUpdate={jest.fn()} />);

    const input = await screen.findByPlaceholderText('Write a comment here…');
    fireEvent.change(input, { target: { value: 'Only once please' } });
    const send = screen.getByRole('button', { name: 'Post comment' });

    // Two activations in the same tick: the disabled state has not rendered yet.
    act(() => {
      send.click();
      send.click();
    });
    fireEvent.keyDown(input, { key: 'Enter' });

    const commentPosts = () => post.mock.calls.filter(([url]) => url === '/api/tasks/t1/comments');
    expect(commentPosts()).toHaveLength(1);

    await act(async () => { settle({ id: 'c1', content: 'Only once please', author: { id: 'm1' } }); });
    await waitFor(() => expect(input).toHaveValue(''));

    // The guard is released afterwards, so a new comment can still be sent.
    fireEvent.change(input, { target: { value: 'Second comment' } });
    post.mockResolvedValueOnce({ id: 'c2', content: 'Second comment', author: { id: 'm1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Post comment' }));
    await waitFor(() => expect(commentPosts()).toHaveLength(2));
  });
});
