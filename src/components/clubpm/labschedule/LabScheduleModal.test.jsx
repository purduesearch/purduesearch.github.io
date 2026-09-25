import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import LabScheduleModal from './LabScheduleModal';
import { listWorkspaces, getWorkspaceWeek, listLabBuddyRequests } from '../../../api/clubPmClient';

jest.mock('../../../api/clubPmClient', () => ({
  listWorkspaces: jest.fn(),
  getWorkspaceWeek: jest.fn(),
  applyLabRect: jest.fn(),
  listLabBuddyRequests: jest.fn(),
  getChatChannels: jest.fn(),
  openDm: jest.fn(),
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
