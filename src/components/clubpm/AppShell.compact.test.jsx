/* eslint-disable testing-library/no-node-access, testing-library/no-container --
   These tests assert on things no accessible query reaches: `inert` on the app
   root and on portalled overlay layers, where focus lands, and that every
   data-tour-id is mounted once across the page and its portals. */
import React, { useState } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { installCompactMedia } from '../../clubpm/layout/compactMediaTestUtils';
import { requestShellReveal } from '../../clubpm/layout/shellOverlay';
import { ProjectNavProvider, useProjectNav } from '../../clubpm/ProjectNavContext';
import { getCompactHeader } from './MobileHeader';
import { currentBottomItem } from './MobileBottomNav';

// ── Boundaries: auth, API, and the decorative/animated pieces of the shell ──
let mockMember;
jest.mock('../../clubpm/ClubPmAuth', () => ({
  useClubPmAuth: () => ({ member: mockMember, loading: false, logout: jest.fn() }),
}));

const mockGet = jest.fn();
jest.mock('../../api/clubPmClient', () => ({
  get: (...a) => mockGet(...a),
  post: jest.fn(() => Promise.resolve({})),
  patch: jest.fn(() => Promise.resolve({})),
  del: jest.fn(() => Promise.resolve({})),
  getCrPendingCount: () => Promise.resolve({ count: 2 }),
  listPendingCertificates: () => Promise.resolve({ count: 0 }),
  apiBaseUrl: '',
  getStoredToken: () => null,
}));
jest.mock('../../clubpm/anim/motion', () => ({ tweenNumber: () => {}, tweenWidthPercent: () => {} }));
jest.mock('../../hooks/useRankWatcher', () => () => ({ pendingRank: null, dismissRank: () => {} }));
jest.mock('../../hooks/useCelebrationCheck', () => () => ({ celebration: null, clearCelebration: () => {} }));
jest.mock('../../clubpm/cosmetics/CosmeticStylesContext', () => ({ children }) => children);
jest.mock('./StreakBadge', () => () => <div className="streak-stub">3</div>);
jest.mock('./RankIcon', () => () => <i className="rank-stub" />);
jest.mock('./avatar/AvatarPortrait', () => () => <i className="avatar-stub" />);
jest.mock('./anim/LottieBell', () => () => null);
jest.mock('./celebrate/RankUpModal', () => () => null);
jest.mock('./celebrate/StreakMilestoneModal', () => () => null);
jest.mock('./RewardFlux', () => () => null);
jest.mock('./CosmeticUnlockModal', () => () => null);
jest.mock('./QuestCompleteToast', () => () => null);
jest.mock('./RewardQueuedToast', () => () => null);
jest.mock('./AchievementUnlockListener', () => () => null);
jest.mock('../OrbitLoader', () => () => null);

// eslint-disable-next-line import/first
import AppShell from './AppShell';

const PROJECTS = [
  { id: 'p1', name: 'Lunar Rover', status: 'ACTIVE' },
  { id: 'p2', name: 'Habitat', status: 'PAUSED' },
];

let eventSources = 0;
beforeAll(() => {
  global.EventSource = class {
    constructor() { eventSources += 1; }
    addEventListener() {}
    close() {}
  };
});

let media;
let rootEl;
beforeEach(() => {
  eventSources = 0;
  mockMember = { id: 'm1', displayName: 'Ada', slackHandle: 'ada', xp: 120, doubloons: 7, isAdmin: false };
  mockGet.mockReset();
  mockGet.mockImplementation((path) => {
    if (path === '/api/projects') return Promise.resolve(PROJECTS);
    if (path.startsWith('/api/notifications')) return Promise.resolve({ notifications: [{ id: 'n1', read: false }], nextCursor: null });
    if (path === '/api/rewards/pending/count') return Promise.resolve({ count: 1 });
    return Promise.resolve({});
  });
  rootEl = document.createElement('div');
  rootEl.id = 'root';
  document.body.appendChild(rootEl);
});
afterEach(() => {
  media?.restore();
  media = null;
  requestShellReveal(null);
  rootEl.remove();
  window.localStorage.clear();
});

let probe;
function Probe() {
  probe = { location: useLocation(), navigate: useNavigate() };
  return null;
}

/** A page with a draft field, to prove a breakpoint crossing doesn't remount it. */
function DraftPage() {
  const [draft, setDraft] = useState('');
  return <input aria-label="Draft" value={draft} onChange={e => setDraft(e.target.value)} />;
}

function ProjectPage() {
  const { setProjectNav } = useProjectNav();
  React.useEffect(() => {
    setProjectNav({
      projectId: 'p1', projectName: 'Lunar Rover', activeTab: 'tasks', onTabChange: () => {},
      tabs: [
        { id: 'tasks', label: 'Tasks', tourId: 'project.tab.tasks' },
        { id: 'files', label: 'Files', tourId: 'project.tab.files' },
        { id: 'chat', label: 'Chat', tourId: 'project.tab.chat' },
        { id: 'insights', label: 'Insights', tourId: 'project.tab.insights' },
      ],
      actions: [{ id: 'timeline', label: 'Timeline (Gantt)', icon: 'fa-chart-gantt', to: '/clubpm/projects/p1/gantt' }],
    });
  }, [setProjectNav]);
  return <div>project body</div>;
}

function renderShell(path = '/clubpm', { compact = true, page = <DraftPage /> } = {}) {
  media = installCompactMedia(compact);
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ProjectNavProvider>
        <Probe />
        <AppShell>{page}</AppShell>
      </ProjectNavProvider>
    </MemoryRouter>,
    { container: rootEl }
  );
}

function tourIds() {
  return [...document.querySelectorAll('[data-tour-id]')].map(n => n.getAttribute('data-tour-id'));
}
function expectUniqueTourIds() {
  const ids = tourIds();
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  expect(dupes).toEqual([]);
}
const bottomNav = () => screen.getByRole('navigation', { name: 'Primary' });

describe('route → current item and header (pure)', () => {
  it.each([
    ['/clubpm', 'home'], ['/clubpm/projects/p1', 'projects'], ['/clubpm/projects/p1/gantt', 'projects'],
    ['/clubpm/chat', 'chat'], ['/clubpm/chat/C1', 'chat'], ['/clubpm/members', 'chat'],
    ['/clubpm/calendar', 'calendar'], ['/clubpm/notifications', 'more'], ['/clubpm/admin', 'more'],
    ['/clubpm/outreach', 'more'], ['/clubpm/courses/x/learn', 'more'],
  ])('%s → %s', (path, item) => {
    expect(currentBottomItem(path)).toBe(item);
  });

  it('gives top-level screens no Back and everything else a deterministic parent', () => {
    expect(getCompactHeader('/clubpm').back).toBeNull();
    expect(getCompactHeader('/clubpm/calendar').back).toBeNull();
    expect(getCompactHeader('/clubpm/chat').back).toBeNull();
    expect(getCompactHeader('/clubpm/projects/p1', '', 'Rover')).toMatchObject({ title: 'Rover', back: null, projectSwitch: true });
    expect(getCompactHeader('/clubpm/projects/p1/gantt').back).toBe('/clubpm/projects/p1');
    expect(getCompactHeader('/clubpm/members').back).toBe('/clubpm/chat');
    expect(getCompactHeader('/clubpm/members', '?dm=D1').back).toBe('/clubpm/members?view=dms');
    expect(getCompactHeader('/clubpm/notifications/preferences').back).toBe('/clubpm/notifications');
    expect(getCompactHeader('/clubpm/outreach', '?tab=blog').title).toBe('Blog');
  });
});

describe('desktop shell (compact off)', () => {
  it('renders the sidebar and topbar and none of the phone chrome', async () => {
    renderShell('/clubpm', { compact: false });
    await waitFor(() => expect(mockGet).toHaveBeenCalledWith('/api/projects'));
    expect(document.querySelector('.pm-sidebar')).not.toBeNull();
    expect(document.querySelector('.pm-topbar')).not.toBeNull();
    expect(document.querySelector('.pm-shell--compact')).toBeNull();
    expect(document.querySelector('[data-tour-id="nav.bar"]')).toBeNull();
    expect(screen.queryByRole('navigation', { name: 'Primary' })).toBeNull();
    expectUniqueTourIds();
  });

  it('keeps Cmd+K opening the desktop palette box', () => {
    renderShell('/clubpm', { compact: false });
    fireEvent.keyDown(document, { key: 'k', ctrlKey: true });
    expect(document.querySelector('.pm-palette-box')).not.toBeNull();
    expect(screen.queryByRole('dialog', { name: 'Search' })).toBeNull();
  });
});

describe('compact shell', () => {
  it('replaces the sidebar with the bottom bar and marks exactly one current item', async () => {
    renderShell('/clubpm/members');
    await waitFor(() => expect(mockGet).toHaveBeenCalledWith('/api/projects'));
    expect(document.querySelector('.pm-sidebar')).toBeNull();
    expect(document.querySelector('.pm-topbar')).toBeNull();
    const current = bottomNav().querySelectorAll('[aria-current="page"]');
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveTextContent('Chat');
    ['Home', 'Projects', 'Chat', 'Calendar', 'More'].forEach(label =>
      expect(within(bottomNav()).getByText(label)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
    expectUniqueTourIds();
  });

  it('links the bell to the Notification Center with the unread count', async () => {
    renderShell('/clubpm');
    const bell = await screen.findByRole('link', { name: 'Notifications, 1 unread' });
    expect(bell).toHaveAttribute('href', '/clubpm/notifications');
  });

  it('opens More as a modal sheet: expanded state, heading focus, inert app, Escape = Back', async () => {
    renderShell('/clubpm');
    const more = within(bottomNav()).getByRole('button', { name: 'More' });
    fireEvent.click(more);

    const sheet = await screen.findByRole('dialog', { name: 'More' });
    expect(more).toHaveAttribute('aria-expanded', 'true');
    expect(within(bottomNav()).getByText('Home').closest('a')).toHaveAttribute('aria-current', 'page');
    expect(document.activeElement).toBe(within(sheet).getByRole('heading', { name: 'More' }));
    expect(rootEl).toHaveAttribute('inert');
    expect(probe.location.state).toEqual({ pmOverlay: 'more' });
    // Non-admins get no Admin row.
    expect(within(sheet).queryByText('Admin')).toBeNull();
    ['Profile', 'Quests & achievements', 'Shop', 'People & DMs', 'Notification Center',
      'Notification preferences', 'Outreach Hub', 'Blog', 'Courses', 'Keyboard shortcuts', 'Main site', 'Sign out']
      .forEach(label => expect(within(sheet).getByText(label)).toBeInTheDocument());
    expectUniqueTourIds();

    fireEvent.keyDown(sheet, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'More' })).toBeNull());
    expect(probe.location.state).toBeNull();
    expect(rootEl).not.toHaveAttribute('inert');
  });

  it('browser Back closes an open sheet and leaves the page unchanged', async () => {
    renderShell('/clubpm/calendar');
    fireEvent.click(within(bottomNav()).getByRole('button', { name: 'More' }));
    await screen.findByRole('dialog', { name: 'More' });
    act(() => probe.navigate(-1));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'More' })).toBeNull());
    expect(probe.location.pathname).toBe('/clubpm/calendar');
    // Forward reopens it (contracts.md §5, Q10: reopen).
    act(() => probe.navigate(1));
    expect(await screen.findByRole('dialog', { name: 'More' })).toBeInTheDocument();
  });

  it('a destination chosen in More replaces the sheet entry, so Back returns to the page under it', async () => {
    renderShell('/clubpm/calendar');
    fireEvent.click(within(bottomNav()).getByRole('button', { name: 'More' }));
    const sheet = await screen.findByRole('dialog', { name: 'More' });
    fireEvent.click(within(sheet).getByText('Shop'));
    await waitFor(() => expect(probe.location.pathname).toBe('/clubpm/shop'));
    expect(screen.queryByRole('dialog', { name: 'More' })).toBeNull();
    act(() => probe.navigate(-1));
    await waitFor(() => expect(probe.location.pathname).toBe('/clubpm/calendar'));
    expect(probe.location.state).toBeNull();
  });

  it('shows Admin with its pending badges only for admins', async () => {
    mockMember = { ...mockMember, isAdmin: true };
    renderShell('/clubpm');
    await waitFor(() => expect(mockGet).toHaveBeenCalledWith('/api/rewards/pending/count'));
    fireEvent.click(within(bottomNav()).getByRole('button', { name: 'More' }));
    const sheet = await screen.findByRole('dialog', { name: 'More' });
    const admin = within(sheet).getByText('Admin').closest('a');
    await waitFor(() => expect(within(admin).getByLabelText('1 pending rewards')).toBeInTheDocument());
    expect(within(admin).getByLabelText('2 open change requests')).toBeInTheDocument();
  });

  it('project picker: failure shows Retry, Retry recovers, and choosing a project replaces the sheet entry', async () => {
    let fail = true;
    mockGet.mockImplementation((path) => {
      if (path === '/api/projects') return fail ? Promise.reject(new Error('Network down')) : Promise.resolve(PROJECTS);
      if (path.startsWith('/api/notifications')) return Promise.resolve({ notifications: [] });
      return Promise.resolve({});
    });
    renderShell('/clubpm');
    fireEvent.click(within(bottomNav()).getByRole('button', { name: 'Projects' }));
    const sheet = await screen.findByRole('dialog', { name: 'Projects' });
    const alert = await within(sheet).findByRole('alert');
    expect(alert).toHaveTextContent('Network down');
    // The search field is present but never auto-focused (it would raise the keyboard).
    expect(document.activeElement).not.toBe(within(sheet).getByLabelText('Find a project'));

    fail = false;
    fireEvent.click(within(alert).getByRole('button', { name: /Retry/ }));
    await within(sheet).findByText('Lunar Rover');
    fireEvent.change(within(sheet).getByLabelText('Find a project'), { target: { value: 'hab' } });
    expect(within(sheet).queryByText('Lunar Rover')).toBeNull();
    fireEvent.change(within(sheet).getByLabelText('Find a project'), { target: { value: '' } });

    fireEvent.click(within(sheet).getByText('Lunar Rover'));
    await waitFor(() => expect(probe.location.pathname).toBe('/clubpm/projects/p1'));
    act(() => probe.navigate(-1));
    await waitFor(() => expect(probe.location.pathname).toBe('/clubpm'));
    expect(probe.location.state).toBeNull();
  });

  it('renders the four project sections from ProjectNavContext, once, and lists project actions in the picker', async () => {
    renderShell('/clubpm/projects/p1', { page: <ProjectPage /> });
    const sections = await screen.findByRole('navigation', { name: 'Lunar Rover sections' });
    expect(within(sections).getAllByRole('button').map(b => b.textContent)).toEqual(['Tasks', 'Files', 'Chat', 'Insights']);
    expect(within(sections).getByText('Tasks')).toHaveAttribute('aria-current', 'page');
    expectUniqueTourIds();

    fireEvent.click(screen.getByRole('button', { name: 'Lunar Rover — switch project' }));
    const sheet = await screen.findByRole('dialog', { name: 'Projects' });
    fireEvent.click(within(sheet).getByText('Timeline (Gantt)'));
    await waitFor(() => expect(probe.location.pathname).toBe('/clubpm/projects/p1/gantt'));
  });

  it('opens Search full-screen from the header and from Cmd+K, focusing the field', async () => {
    renderShell('/clubpm');
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    const dialog = await screen.findByRole('dialog', { name: 'Search' });
    await waitFor(() => expect(document.activeElement).toBe(within(dialog).getByLabelText('Search tasks and projects')));
    expect(document.querySelector('.pm-palette-box')).toBeNull();
    fireEvent.keyDown(document, { key: 'k', ctrlKey: true });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Search' })).toBeNull());
    fireEvent.keyDown(document, { key: 'k', metaKey: true });
    expect(await screen.findByRole('dialog', { name: 'Search' })).toBeInTheDocument();
  });

  it('opens and closes the More sheet for a walkthrough reveal', async () => {
    renderShell('/clubpm');
    act(() => requestShellReveal('more', '/clubpm'));
    const sheet = await screen.findByRole('dialog', { name: 'More' });
    expect(within(sheet).getByText('Shop').closest('[data-tour-id]')).toHaveAttribute('data-tour-id', 'nav.shop');
    act(() => requestShellReveal(null));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'More' })).toBeNull());
  });
});

describe('crossing the breakpoint', () => {
  it('keeps the page mounted (draft intact) and the notification feed single-instance', async () => {
    renderShell('/clubpm', { compact: true });
    await waitFor(() => expect(mockGet).toHaveBeenCalledWith('/api/notifications?limit=10'));
    const field = screen.getByLabelText('Draft');
    fireEvent.change(field, { target: { value: 'half-written task' } });

    act(() => media.set(false));
    expect(document.querySelector('.pm-sidebar')).not.toBeNull();
    expect(screen.getByLabelText('Draft')).toBe(field);
    expect(field).toHaveValue('half-written task');

    act(() => media.set(true));
    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeInTheDocument();
    expect(screen.getByLabelText('Draft')).toBe(field);
    expect(field).toHaveValue('half-written task');

    const feedFetches = mockGet.mock.calls.filter(([p]) => p === '/api/notifications?limit=10');
    expect(feedFetches).toHaveLength(1);
    expect(eventSources).toBe(1);
    expect(mockGet.mock.calls.filter(([p]) => p === '/api/projects')).toHaveLength(1);
    expectUniqueTourIds();
  });
});
