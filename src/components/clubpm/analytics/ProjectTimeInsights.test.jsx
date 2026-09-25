import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ProjectTimeInsights from './ProjectTimeInsights';
import { getProjectTimeInsights } from '../../../api/clubPmClient';

jest.mock('../../../api/clubPmClient', () => ({ getProjectTimeInsights: jest.fn() }));
// recharts needs layout measurements jsdom does not provide.
jest.mock('./AnalyticsCard', () => ({ title }) => <section><h3>{title}</h3></section>);

const DATA = {
  totals: { minutes: 330, manualMinutes: 90, labMinutes: 240, unallocatedLabMinutes: 42 },
  byWeek: [{ weekStart: '2026-09-21', manualMinutes: 90, labMinutes: 240 }],
  byMember: [{ memberId: 'a', displayName: 'Ana', avatarUrl: null, minutes: 330, labMinutes: 240 }],
  tasks: [
    { id: 't1', title: 'Weld frame', status: 'DONE', minutes: 300, labMinutes: 240, activeDays: 4, assignees: [] },
    { id: 't2', title: 'Order bolts', status: 'IN_PROGRESS', minutes: 30, labMinutes: 0, activeDays: 2, assignees: [] },
  ],
};

test('shows totals, slowest tasks and filters to open tasks', async () => {
  getProjectTimeInsights.mockResolvedValue(DATA);
  const onOpenTask = jest.fn();
  render(<ProjectTimeInsights project={{ id: 'p1' }} onOpenTask={onOpenTask} />);
  expect(await screen.findByText('5.5h')).toBeInTheDocument();
  expect(screen.getByText('42m')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Weld frame' }));
  expect(onOpenTask).toHaveBeenCalledWith('t1');
  fireEvent.click(screen.getByRole('checkbox', { name: /Open tasks only/ }));
  expect(screen.queryByRole('button', { name: 'Weld frame' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Order bolts' })).toBeInTheDocument();
});

test('range buttons refetch', async () => {
  getProjectTimeInsights.mockResolvedValue(DATA);
  render(<ProjectTimeInsights project={{ id: 'p1' }} />);
  fireEvent.click(await screen.findByRole('button', { name: '4 weeks' }));
  expect(getProjectTimeInsights).toHaveBeenCalledTimes(2);
});
