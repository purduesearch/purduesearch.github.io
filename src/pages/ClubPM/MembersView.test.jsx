import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import MembersView from './MembersView';
import { get, listConversations, importMyDms } from '../../api/clubPmClient';

jest.mock('../../api/clubPmClient', () => ({
  get: jest.fn(), post: jest.fn(), listProjectRepos: jest.fn(), openDm: jest.fn(),
  setProjectLead: jest.fn(), listConversations: jest.fn(), importMyDms: jest.fn(),
}));
jest.mock('../../clubpm/ClubPmAuth', () => ({
  useClubPmAuth: () => ({ member: { id: 'me', slackId: 'UME', slackCapabilities: { read: true, dm: true } } }),
}));
jest.mock('../../clubpm/layout/compactLayout', () => ({ useCompactLayout: () => false }));
jest.mock('../../components/OrbitLoader', () => () => <div>Loading roster</div>);
jest.mock('../../components/clubpm/KudosButton', () => () => null);
jest.mock('../../components/clubpm/avatar/AvatarPortrait', () => () => null);
jest.mock('../../components/clubpm/RankIcon', () => () => null);
jest.mock('../../components/clubpm/LeaderboardPanel', () => () => null);
jest.mock('../../components/clubpm/members/DmPanel', () => () => null);
jest.mock('../../components/clubpm/chat/ChatComposer', () => ({ SlackReconnectNotice: () => null }));
jest.mock('../../clubpm/cosmetics/CosmeticStylesContext', () => ({ MemberName: ({ children }) => <b>{children}</b> }));

const roster = Array.from({ length: 100 }, (_, i) => ({
  id: `m${i}`, slackId: `U${i}`, displayName: i === 99 ? 'Zelda Last' : `Alpha ${i}`,
  role: 'MEMBER', projects: [],
}));

beforeEach(() => {
  jest.clearAllMocks();
  sessionStorage.clear();
  get.mockResolvedValue(roster);
  listConversations.mockResolvedValue({ dms: [] });
  importMyDms.mockResolvedValue({ started: true, conversations: 0 });
});

test('project requests scope the roster, inbox and history import before loading', async () => {
  render(<MemoryRouter><MembersView projectId="p1" /></MemoryRouter>);
  expect(await screen.findByText('Zelda Last')).toBeVisible();
  expect(get).toHaveBeenCalledWith('/api/members?projectId=p1');
  expect(listConversations).toHaveBeenCalledWith('p1');
  expect(importMyDms).toHaveBeenCalledWith('p1');
  // Channel members need not have an existing ProjectMember row.
  expect(screen.getAllByRole('button', { name: /Message Zelda/ })).toHaveLength(1);
  const search = screen.getByPlaceholderText(/Search by name/);
  fireEvent.change(search, { target: { value: 'Alpha 0' } });
  expect(screen.queryByText('Zelda Last')).toBeNull();
  fireEvent.change(search, { target: { value: ' zelda ' } });
  expect(screen.getByText('Zelda Last')).toBeVisible();
  const card = screen.getByRole('button', { name: /^Zelda Last/ });
  expect(card.style.opacity).not.toBe('0');
});

test('a late response from a previous project cannot replace the new roster', async () => {
  let resolveOld;
  get.mockImplementation(url => url.endsWith('p1') ? new Promise(resolve => { resolveOld = resolve; }) : Promise.resolve([roster[99]]));
  const view = render(<MemoryRouter><MembersView projectId="p1" /></MemoryRouter>);
  view.rerender(<MemoryRouter><MembersView projectId="p2" /></MemoryRouter>);
  expect(await screen.findByText('Zelda Last')).toBeVisible();
  resolveOld([roster[0]]);
  await waitFor(() => expect(screen.queryByText('Alpha 0')).toBeNull());
});

test('failed rosters show an error and allow retry', async () => {
  get.mockRejectedValueOnce(new Error('unavailable'));
  render(<MemoryRouter><MembersView projectId="p1" /></MemoryRouter>);
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not load members');
  fireEvent.click(screen.getByText('Retry'));
  expect(await screen.findByText('Zelda Last')).toBeVisible();
});

test('club-wide roster remains available without a project', async () => {
  render(<MemoryRouter><MembersView /></MemoryRouter>);
  expect(await screen.findByText('Zelda Last')).toBeVisible();
  expect(get).toHaveBeenCalledWith('/api/members');
  expect(listConversations).toHaveBeenCalledWith(null);
});
