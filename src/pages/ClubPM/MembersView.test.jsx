import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import MembersView from './MembersView';
import { get, listConversations, importMyDms, setProjectLead } from '../../api/clubPmClient';

let mockIsAdmin = false;

jest.mock('../../api/clubPmClient', () => ({
  get: jest.fn(), post: jest.fn(), listProjectRepos: jest.fn(), openDm: jest.fn(),
  setProjectLead: jest.fn(), listConversations: jest.fn(), importMyDms: jest.fn(),
}));
jest.mock('../../clubpm/ClubPmAuth', () => ({
  useClubPmAuth: () => ({ member: { id: 'me', slackId: 'UME', isAdmin: mockIsAdmin, slackCapabilities: { read: true, dm: true } } }),
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
  mockIsAdmin = false;
  jest.clearAllMocks();
  sessionStorage.clear();
  get.mockResolvedValue(roster);
  listConversations.mockResolvedValue({ dms: [] });
  importMyDms.mockResolvedValue({ started: true, conversations: 0 });
});

function roleMember({ isAdmin = false, isLead = false, leadTitle = null } = {}) {
  return { ...roster[99], isAdmin, projects: [{ project: { id: 'p1' }, isLead, leadTitle }] };
}

test('make sublead opens the shared title editor, saves the title and refreshes assignees', async () => {
  mockIsAdmin = true;
  get.mockResolvedValue([roleMember()]);
  setProjectLead.mockResolvedValue({ projectId: 'p1', memberId: 'm99', isLead: true, leadTitle: 'Microgreens lead' });
  const onLeadsChanged = jest.fn();
  render(<MemoryRouter><MembersView projectId="p1" onLeadsChanged={onLeadsChanged} /></MemoryRouter>);
  fireEvent.click(await screen.findByRole('button', { name: 'Make sublead' }));
  expect(setProjectLead).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Sublead role (optional)'), { target: { value: 'Microgreens lead' } });
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Make sublead' }));
  await waitFor(() => expect(setProjectLead).toHaveBeenCalledWith('p1', 'm99', true, 'Microgreens lead'));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(screen.getByText('Microgreens lead')).toBeVisible();
  expect(screen.getByRole('button', { name: /^Zelda Last/ })).toHaveClass('pm-member-card--sublead');
  expect(onLeadsChanged).toHaveBeenCalledTimes(1);
});

test('an existing sublead title can be edited and removed', async () => {
  mockIsAdmin = true;
  get.mockResolvedValue([roleMember({ isLead: true, leadTitle: 'Old title' })]);
  setProjectLead.mockResolvedValueOnce({ projectId: 'p1', memberId: 'm99', isLead: true, leadTitle: 'New title' })
    .mockResolvedValueOnce({ projectId: 'p1', memberId: 'm99', isLead: false, leadTitle: null });
  render(<MemoryRouter><MembersView projectId="p1" /></MemoryRouter>);
  fireEvent.click(await screen.findByRole('button', { name: 'Edit role' }));
  expect(screen.getByLabelText('Sublead role (optional)')).toHaveValue('Old title');
  fireEvent.change(screen.getByLabelText('Sublead role (optional)'), { target: { value: 'New title' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save role' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(screen.getByText('New title')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Edit role' }));
  fireEvent.click(screen.getByRole('button', { name: 'Remove sublead' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(setProjectLead).toHaveBeenLastCalledWith('p1', 'm99', false, null);
  expect(screen.queryByText('New title')).toBeNull();
  expect(screen.getByRole('button', { name: /^Zelda Last/ })).not.toHaveClass('pm-member-card--sublead');
});

test('admins keep gold styling and edit only their role title', async () => {
  mockIsAdmin = true;
  get.mockResolvedValue([roleMember({ isAdmin: true, isLead: true, leadTitle: 'Director' })]);
  setProjectLead.mockResolvedValue({ projectId: 'p1', memberId: 'm99', isLead: false, leadTitle: 'President' });
  render(<MemoryRouter><MembersView projectId="p1" /></MemoryRouter>);
  fireEvent.click(await screen.findByRole('button', { name: 'Edit title' }));
  expect(screen.getByRole('button', { name: /^Zelda Last/ })).toHaveClass('pm-member-card--admin');
  expect(screen.queryByRole('button', { name: 'Remove sublead' })).toBeNull();
  fireEvent.change(screen.getByLabelText('Admin role title (optional)'), { target: { value: 'President' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save title' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(setProjectLead).toHaveBeenCalledWith('p1', 'm99', false, 'President');
  expect(screen.getByText('President')).toBeVisible();
});

test('members can see sublead titles without role editing permissions', async () => {
  get.mockResolvedValue([roleMember({ isLead: true, leadTitle: 'Microgreens lead' })]);
  render(<MemoryRouter><MembersView projectId="p1" /></MemoryRouter>);
  expect(await screen.findByText('Microgreens lead')).toBeVisible();
  expect(screen.queryByRole('button', { name: /Make sublead|Edit role|Edit title/ })).toBeNull();
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
