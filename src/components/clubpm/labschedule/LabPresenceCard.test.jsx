import React from 'react';
import { render, screen, act } from '@testing-library/react';
import LabPresenceCard from './LabPresenceCard';
import { getLabPresence } from '../../../api/clubPmClient';

jest.mock('../../../api/clubPmClient', () => ({ getLabPresence: jest.fn() }));
jest.mock('./LabScheduleModal', () => () => null);
jest.mock('../../../clubpm/layout/compactLayout', () => ({ useCompactLayout: () => false }));

const ws = { id: 'ws1', name: 'Propulsion Lab', color: '#00e5cc' };
const person = (id) => ({ id, displayName: `Member ${id}`, avatarUrl: null });

test('card lists who is here and who is expected', async () => {
  getLabPresence.mockResolvedValue([{
    workspace: ws,
    checkedIn: [{ member: person('a'), checkedInAt: '2026-09-25T15:00:00Z' }],
    scheduled: [{ member: person('b'), startMin: 600, endMin: 720 }],
  }]);
  render(<LabPresenceCard />);
  expect(await screen.findByText('1 here · 1 expected')).toBeInTheDocument();
  expect(screen.getByText('Propulsion Lab')).toBeInTheDocument();
});

test('badge hides when nobody is checked in', async () => {
  getLabPresence.mockResolvedValue([{ workspace: ws, checkedIn: [], scheduled: [{ member: person('b'), startMin: 600, endMin: 720 }] }]);
  const { container } = render(<LabPresenceCard projectId="p1" variant="badge" />);
  await act(async () => {});
  expect(getLabPresence).toHaveBeenCalledWith({ projectId: 'p1' });
  expect(container).toBeEmptyDOMElement();
});

test('badge shows the checked-in count', async () => {
  getLabPresence.mockResolvedValue([{ workspace: ws, checkedIn: [{ member: person('a'), checkedInAt: 'x' }, { member: person('c'), checkedInAt: 'x' }], scheduled: [] }]);
  render(<LabPresenceCard projectId="p1" variant="badge" />);
  expect(await screen.findByRole('button', { name: '2 in the lab now' })).toBeInTheDocument();
});
