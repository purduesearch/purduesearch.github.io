import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import CalendarPage from './CalendarPage';
import { get, post } from '../../api/clubPmClient';

jest.mock('../../clubpm/layout/compactLayout', () => ({ useCompactLayout: () => true }));
jest.mock('../../clubpm/ClubPmAuth', () => ({
  useClubPmAuth: () => ({ member: { id: 'M1', role: 'MEMBER', isAdmin: false } }),
}));
jest.mock('../../clubpm/anim/motion', () => ({ revealStagger: jest.fn() }));
jest.mock('../../api/clubPmClient', () => ({
  get: jest.fn(), post: jest.fn(), patch: jest.fn(),
  listMeetingPolls: jest.fn().mockResolvedValue([]),
  createMeetingPoll: jest.fn(), updateMeetingPoll: jest.fn(), deleteMeetingPoll: jest.fn(),
  getMeetingPoll: jest.fn(), submitAvailability: jest.fn(), finalizeMeetingPoll: jest.fn(),
  remindMeetingPoll: jest.fn(), getAvailabilitySuggestion: jest.fn(),
  downloadMeetingPollIcs: jest.fn(), googleCalendarUrl: jest.fn(), deleteEvent: jest.fn(),
}));
jest.mock('../../components/clubpm/CalendarView', () => function CalendarProbe(props) {
  return (
    <div>
      <output data-testid="view-mode">{props.viewMode}</output>
      <button type="button" onClick={() => props.onViewModeChange('month')}>Month</button>
      <button type="button" onClick={() => props.onEventClick(props.events[0])}>Open fixture event</button>
      {props.toolbarActions}
    </div>
  );
});
jest.mock('../../components/clubpm/CalendarFilters', () => function FiltersProbe({ projects }) {
  return <div data-testid="project-filters">{projects.length}</div>;
});
jest.mock('../../components/clubpm/EventFormModal', () => () => null);
jest.mock('../../components/clubpm/MeetingPollModal', () => () => null);
jest.mock('../../components/clubpm/MeetingPollBoard', () => () => null);
jest.mock('../../components/clubpm/CalendarImportModal', () => () => null);

const event = {
  id: 'E1', title: 'Design review', type: 'MEETING', startTime: new Date().toISOString(),
  attendees: [], organizer: { id: 'M2', displayName: 'Organizer' },
};

beforeEach(() => {
  jest.clearAllMocks();
  get.mockImplementation(path => {
    if (path.startsWith('/api/events?')) return Promise.resolve([event]);
    if (path === '/api/projects') return Promise.resolve([{ id: 'P1', name: 'ARES' }]);
    if (path === '/api/members/me') return Promise.resolve({ tasks: [] });
    if (path === '/api/members') return Promise.resolve([]);
    return Promise.resolve([]);
  });
  post.mockResolvedValue({ ...event, attendees: [{ id: 'M1', displayName: 'Member' }] });
});

test('phone Calendar starts agenda-first and retains Month and project filters', async () => {
  render(<MemoryRouter initialEntries={['/clubpm/calendar']}><CalendarPage /></MemoryRouter>);
  expect(await screen.findByTestId('view-mode')).toHaveTextContent('agenda');
  await waitFor(() => expect(screen.getByTestId('project-filters')).toHaveTextContent('1'));
  fireEvent.click(screen.getByText('Month'));
  expect(screen.getByTestId('view-mode')).toHaveTextContent('month');
  await waitFor(() => expect(screen.queryByText('Loading events…')).not.toBeInTheDocument());
});

test('event detail exposes member RSVP and updates through the existing attendee endpoint', async () => {
  render(<MemoryRouter initialEntries={['/clubpm/calendar']}><CalendarPage /></MemoryRouter>);
  fireEvent.click(await screen.findByText('Open fixture event'));
  fireEvent.click(await screen.findByText('RSVP'));
  await waitFor(() => expect(post).toHaveBeenCalledWith('/api/events/E1/attendees', { action: 'join' }));
  expect(await screen.findByText('Not attending')).toBeInTheDocument();
});

test('a same-tick double tap on RSVP sends one request and shows "Saving…" while it is in flight', async () => {
  let settle;
  post.mockImplementation(() => new Promise(resolve => { settle = resolve; }));
  render(<MemoryRouter initialEntries={['/clubpm/calendar']}><CalendarPage /></MemoryRouter>);
  fireEvent.click(await screen.findByText('Open fixture event'));
  const rsvp = await screen.findByRole('button', { name: 'RSVP' });
  // Both taps must land before React re-renders the button as disabled, which
  // is exactly what the outer act() arranges.
  // eslint-disable-next-line testing-library/no-unnecessary-act
  act(() => { fireEvent.click(rsvp); fireEvent.click(rsvp); });
  expect(post.mock.calls.filter(([url]) => url === '/api/events/E1/attendees')).toHaveLength(1);
  expect(await screen.findByText('Saving…')).toBeInTheDocument();
  await act(async () => { settle({ ...event, attendees: [{ id: 'M1', displayName: 'Member' }] }); });
  expect(await screen.findByText('Not attending')).toBeInTheDocument();
});
