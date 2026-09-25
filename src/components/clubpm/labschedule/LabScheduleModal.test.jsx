import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import LabScheduleModal from './LabScheduleModal';
import { listWorkspaces, getWorkspaceWeek, listLabBuddyRequests } from '../../../api/clubPmClient';

jest.mock('../../../api/clubPmClient', () => ({
  listWorkspaces: jest.fn(),
  getWorkspaceWeek: jest.fn(),
  applyLabRect: jest.fn(),
  listLabBuddyRequests: jest.fn(),
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
