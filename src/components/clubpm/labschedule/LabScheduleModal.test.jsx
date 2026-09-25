import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import LabScheduleModal from './LabScheduleModal';
import { listWorkspaces, getWorkspaceWeek, listLabBuddyRequests, getMyLabVisits, labCheckIn } from '../../../api/clubPmClient';

jest.mock('../../../api/clubPmClient', () => ({
  listWorkspaces: jest.fn(),
  getWorkspaceWeek: jest.fn(),
  applyLabRect: jest.fn(),
  listLabBuddyRequests: jest.fn(),
  getChatChannels: jest.fn(),
  openDm: jest.fn(),
  getMyLabVisits: jest.fn(),
  labCheckIn: jest.fn(),
  labCheckOut: jest.fn(),
  labConfirm: jest.fn(),
  labAllocate: jest.fn(),
}));
jest.mock('../../../clubpm/ClubPmAuth', () => ({ useClubPmAuth: () => ({ member: { id: 'me' } }) }));

const SPACE = {
  id: 'ws1', name: 'Propulsion Lab', slug: 'propulsion-lab', color: '#00e5cc', timezone: 'America/New_York',
  openStartMin: 480, openEndMin: 1320, capacity: 6, location: 'ARMS 1010', description: null,
  defaultEndsOn: '2026-12-13', archived: false, projects: [],
  requirements: [{ id: 'r1', kind: 'training', refId: 't1', name: 'Lab Safety', url: null }],
};
const DATES = ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'];
const week = (over = {}) => ({
  workspace: SPACE, dates: DATES,
  blocks: [{ date: '2026-09-28', startMin: 720, endMin: 900, memberIds: ['a', 'b', 'c'], headcount: 3, solo: false, buddyMemberIds: [], eventIds: [] }],
  events: [], occurrences: [], myShifts: [],
  members: ['a', 'b', 'c'].map(id => ({ id, displayName: `Member ${id}`, avatarUrl: null, projects: [] })),
  requirementStatus: { me: { r1: 'missing' } },
  canSchedule: true,
  ...over,
});

function renderModal() {
  return render(<MemoryRouter><LabScheduleModal isOpen onClose={() => {}} /></MemoryRouter>);
}

beforeEach(() => {
  listWorkspaces.mockResolvedValue([SPACE]);
  listLabBuddyRequests.mockResolvedValue([]);
  getMyLabVisits.mockResolvedValue({ open: null, pending: [], unallocated: [], todoTasks: [] });
});

test('renders the space, a presence block and my requirement status', async () => {
  getWorkspaceWeek.mockResolvedValue(week());
  renderModal();
  expect(await screen.findByText('3 here')).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: /Propulsion Lab/ })).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByText('Lab Safety')).toBeInTheDocument();
  expect(screen.getByRole('radio', { name: /Edit my time/ })).toBeInTheDocument();
});

test('view-only members see no edit toggle', async () => {
  getWorkspaceWeek.mockResolvedValue(week({ canSchedule: false }));
  renderModal();
  expect(await screen.findByText(/View only/)).toBeInTheDocument();
  expect(screen.queryByRole('radio', { name: /Edit my time/ })).not.toBeInTheDocument();
});

test('empty week shows the empty state', async () => {
  getWorkspaceWeek.mockResolvedValue(week({ blocks: [] }));
  renderModal();
  expect(await screen.findByText(/No one scheduled here this week yet/)).toBeInTheDocument();
});

test('no spaces shows guidance', async () => {
  listWorkspaces.mockResolvedValue([]);
  renderModal();
  expect(await screen.findByText('No lab spaces yet')).toBeInTheDocument();
});

test('find overlap lists shared windows for the chosen people', async () => {
  const o = (memberId, startMin, endMin) => ({ shiftId: `s-${memberId}`, memberId, date: '2026-09-29', startMin, endMin, buddyWanted: false, weekly: true });
  getWorkspaceWeek.mockResolvedValue(week({ occurrences: [o('me', 780, 900), o('a', 840, 960)] }));
  renderModal();
  fireEvent.click(await screen.findByRole('radio', { name: /Find overlap/ }));
  expect(screen.getByText('Pick at least two people.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Member/ }));
  expect(screen.getByText(/Tue 2:00–3:00 PM/)).toBeInTheDocument();
  expect(screen.getByText('weekly')).toBeInTheDocument();
});

test('choosing a window drafts a Slack invite without sending it', async () => {
  const o = (memberId, startMin, endMin) => ({ shiftId: `s-${memberId}`, memberId, date: '2026-09-29', startMin, endMin, buddyWanted: false, weekly: false });
  getWorkspaceWeek.mockResolvedValue(week({
    occurrences: [o('me', 780, 900), o('a', 840, 960)],
    members: [{ id: 'a', displayName: 'Lily Chen', avatarUrl: null, slackId: 'U1', projects: [] }],
  }));
  renderModal();
  fireEvent.click(await screen.findByRole('radio', { name: /Find overlap/ }));
  fireEvent.click(screen.getByRole('button', { name: /Lily/ }));
  fireEvent.click(screen.getByText(/Tue 2:00–3:00 PM/));
  expect(screen.getByRole('textbox', { name: 'Message' }))
    .toHaveValue('Hey @Lily Chen, would you like to meet in the lab Tuesday 2:00–3:00 PM this week?');
  expect(screen.getByRole('option', { name: /Group DM/ })).toBeInTheDocument();
  expect(screen.queryByRole('radio', { name: /Every Tuesday/ })).not.toBeInTheDocument();
});

test('check in here calls the API for the current space', async () => {
  getWorkspaceWeek.mockResolvedValue(week());
  labCheckIn.mockResolvedValue({ visit: { id: 'v1' }, closedPrevious: null });
  renderModal();
  fireEvent.click(await screen.findByRole('button', { name: /Check in here/ }));
  expect(labCheckIn).toHaveBeenCalledWith('ws1');
});

test('an open visit offers check out, a pending one offers confirm', async () => {
  getWorkspaceWeek.mockResolvedValue(week());
  const ws = { id: 'ws1', name: 'Propulsion Lab', color: '#00e5cc', timezone: 'America/New_York' };
  getMyLabVisits.mockResolvedValue({
    open: { id: 'v1', checkedInAt: new Date(Date.now() - 72 * 60000).toISOString(), workspace: ws },
    pending: [{ id: 'v2', checkedInAt: '2026-09-24T18:00:00Z', checkedOutAt: '2026-09-24T21:00:00Z', workspace: ws }],
    unallocated: [], todoTasks: [],
  });
  renderModal();
  expect(await screen.findByRole('button', { name: /Check out/ })).toBeInTheDocument();
  expect(screen.getByText('1h 12m')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Check in here/ })).not.toBeInTheDocument();
});

test('admins can toggle the coverage overlay', async () => {
  getWorkspaceWeek.mockResolvedValue(week({ coverage: [{ date: '2026-09-28', startMin: 720, endMin: 780, kind: 'solo' }] }));
  renderModal();
  const toggle = await screen.findByRole('button', { name: /Coverage/ });
  fireEvent.click(toggle);
  expect(screen.getByText('Scheduled alone')).toBeInTheDocument();
  expect(screen.getByRole('img', { name: /12:00–1:00 PM: someone is scheduled alone/ })).toBeInTheDocument();
});

test('members without coverage data see no toggle', async () => {
  getWorkspaceWeek.mockResolvedValue(week());
  renderModal();
  await screen.findByText('3 here');
  expect(screen.queryByRole('button', { name: /Coverage/ })).not.toBeInTheDocument();
});
