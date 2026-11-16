import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Sponsors from './Sponsors';

jest.mock('../../components/SEOHead', () => () => null);
jest.mock('../../components/Navbar', () => () => null);
jest.mock('../../components/Footer', () => () => null);
jest.mock('../../api/clubPmClient', () => ({ apiBaseUrl: '' }));

const sponsor = { id: 's1', name: 'Pat Lee', email: 'pat@acme.test', org: { id: 'o1', name: 'Acme Aerospace' } };
const card = (over = {}) => ({
  memberId: 'm1', name: 'Ada L.', major: 'ME', gradTerm: '2028-05', openTo: ['INTERNSHIP'], availableFrom: null,
  headline: 'Builds rovers', targets: [{ code: '17-2141.00', title: 'Mechanical Engineers' }],
  bullets: ['Released 6 CAD items'], certifications: [{ name: 'CSWA', provider: 'Dassault' }],
  badges: [{ name: 'Builder', verifyUrl: 'https://purduesearch.org/badges/b1' }], ...over,
});
const intro = (over = {}) => ({
  id: 'i1', status: 'PENDING', message: 'Hello', createdAt: '2026-11-01T00:00:00Z',
  member: { id: 'm1', name: 'Ada L.', sharing: true }, ...over,
});

// Routes mocked fetch by "METHOD /path" and records calls.
function mockApi(routes) {
  global.fetch = jest.fn(async (url, init = {}) => {
    const path = String(url).replace(/\?.*$/, '');
    const key = `${init.method || 'GET'} ${path}`;
    const r = routes[key];
    if (!r) throw new Error(`unmocked ${key}`);
    const { status = 200, body = {} } = typeof r === 'function' ? r(url, init) : r;
    return { ok: status < 400, status, json: async () => body };
  });
}
const calls = key => global.fetch.mock.calls.filter(([u, i]) => `${i?.method || 'GET'} ${String(u).replace(/\?.*$/, '')}` === key);
const renderPage = () => render(<MemoryRouter><Sponsors /></MemoryRouter>);
const base = {
  'GET /api/sponsor/me': { body: { sponsor } },
  'GET /api/sponsor/directory': { body: { members: [card()] } },
  'GET /api/sponsor/intros': { body: { intros: [] } },
};

beforeEach(() => { window.history.replaceState({}, '', '/sponsors'); });
afterEach(() => { delete global.fetch; window.sessionStorage.clear(); });

test('login shows the same confirmation on success and on failure', async () => {
  for (const status of [202, 500]) {
    mockApi({ 'POST /api/sponsor/login': { status, body: {} } });
    const { unmount } = renderPage();
    fireEvent.change(await screen.findByLabelText('Work email'), { target: { value: 'pat@acme.test' } });
    fireEvent.click(screen.getByRole('button', { name: /sign-in link/i }));
    expect(await screen.findByText(/a sign-in link is on its way/i)).toBeTruthy();
    unmount();
    delete global.fetch;
  }
});

test('exchanges ?t=, strips it from the URL, stores the token in sessionStorage and sends Bearer', async () => {
  window.history.replaceState({}, '', '/sponsors?t=magic123&x=1');
  mockApi({
    ...base,
    'POST /api/sponsor/session': { body: { token: 'bearer-1', expiresAt: 'x', sponsor } },
  });
  renderPage();
  expect(await screen.findByText('Ada L.')).toBeTruthy();
  expect(window.location.search).toBe('?x=1');
  expect(JSON.parse(calls('POST /api/sponsor/session')[0][1].body)).toEqual({ token: 'magic123' });
  expect(window.sessionStorage.getItem('sponsor_auth_token')).toBe('bearer-1');
  expect(window.localStorage.getItem('sponsor_auth_token')).toBeNull();
  expect(calls('GET /api/sponsor/directory')[0][1].headers.Authorization).toBe('Bearer bearer-1');
  expect(screen.getByText('Acme Aerospace')).toBeTruthy();
});

test('an invalid link still removes the token from the URL and returns to login', async () => {
  window.history.replaceState({}, '', '/sponsors?t=bad');
  mockApi({ 'POST /api/sponsor/session': { status: 401, body: { error: 'nope' } } });
  renderPage();
  expect(await screen.findByText(/invalid or has expired/i)).toBeTruthy();
  expect(window.location.search).toBe('');
});

test('503 on exchange says sign-in is temporarily unavailable', async () => {
  window.history.replaceState({}, '', '/sponsors?t=x');
  mockApi({ 'POST /api/sponsor/session': { status: 503, body: {} } });
  renderPage();
  expect(await screen.findByText(/temporarily unavailable/i)).toBeTruthy();
});

test('a 401 clears the token and shows the session-ended message', async () => {
  window.sessionStorage.setItem('sponsor_auth_token', 'old');
  mockApi({ 'GET /api/sponsor/me': { status: 401, body: { error: 'Not authenticated' } } });
  renderPage();
  expect(await screen.findByText(/your session ended/i)).toBeTruthy();
  expect(window.sessionStorage.getItem('sponsor_auth_token')).toBeNull();
});

test('directory renders results as given and sends filter params', async () => {
  window.sessionStorage.setItem('sponsor_auth_token', 't');
  mockApi({
    ...base,
    'GET /api/sponsor/directory': { body: { members: [card(), card({ memberId: 'm2', name: 'Bo Z.' })] } },
  });
  renderPage();
  const names = await screen.findAllByRole('heading', { level: 3 });
  expect(names.map(n => n.textContent)).toEqual(['Ada L.', 'Bo Z.']);
  expect(document.body.textContent).not.toMatch(/score|rank|best match|%/i);

  fireEvent.change(screen.getByLabelText('Tool or skill'), { target: { value: 'SolidWorks' } });
  fireEvent.change(screen.getByLabelText('Open to'), { target: { value: 'COOP' } });
  fireEvent.change(screen.getByLabelText('Sort by'), { target: { value: 'gradTerm' } });
  fireEvent.click(screen.getByRole('button', { name: /apply filters/i }));
  await waitFor(() => expect(calls('GET /api/sponsor/directory').length).toBe(2));
  const url = String(calls('GET /api/sponsor/directory')[1][0]);
  expect(url).toContain('tool=SolidWorks');
  expect(url).toContain('openTo=COOP');
  expect(url).toContain('sort=gradTerm');
});

test('card detail shows bullets, certifications and badges with safe verify links', async () => {
  window.sessionStorage.setItem('sponsor_auth_token', 't');
  mockApi(base);
  renderPage();
  fireEvent.click(await screen.findByRole('button', { name: /show details/i }));
  expect(screen.getByText('Released 6 CAD items')).toBeTruthy();
  expect(screen.getByText(/CSWA/)).toBeTruthy();
  const link = screen.getByRole('link', { name: 'Verify' });
  expect(link.getAttribute('rel')).toBe('noopener noreferrer');
});

test('intro form validates length and shows the rate-limit error', async () => {
  window.sessionStorage.setItem('sponsor_auth_token', 't');
  mockApi({
    ...base,
    'POST /api/sponsor/intros': { status: 429, body: { error: 'x', code: 'RATE_LIMITED' } },
  });
  renderPage();
  fireEvent.click(await screen.findByRole('button', { name: /request an introduction/i }));
  fireEvent.click(screen.getByRole('button', { name: /send request/i }));
  expect((await screen.findByRole('alert')).textContent).toMatch(/short message/i);

  fireEvent.change(screen.getByLabelText(/message to ada/i), { target: { value: 'a'.repeat(1001) } });
  expect(screen.getByText('1001 / 1000')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /send request/i }));
  expect((await screen.findByRole('alert')).textContent).toMatch(/1000 characters/);
  expect(calls('POST /api/sponsor/intros').length).toBe(0);

  fireEvent.change(screen.getByLabelText(/message to ada/i), { target: { value: 'Hello' } });
  fireEvent.click(screen.getByRole('button', { name: /send request/i }));
  expect((await screen.findByRole('alert')).textContent).toMatch(/20 introduction requests per 7 days/);
  expect(JSON.parse(calls('POST /api/sponsor/intros')[0][1].body)).toEqual({ memberId: 'm1', message: 'Hello' });
});

test('intro list shows email only for ACCEPTED and a no-longer-sharing row', async () => {
  window.sessionStorage.setItem('sponsor_auth_token', 't');
  mockApi({
    ...base,
    'GET /api/sponsor/intros': {
      body: {
        intros: [
          intro({ id: 'a', status: 'ACCEPTED', memberEmail: 'ada@purdue.test' }),
          intro({ id: 'b', status: 'PENDING', message: 'Pending one' }),
          intro({ id: 'c', status: 'DECLINED', member: { id: null, name: 'Member no longer sharing', sharing: false } }),
        ],
      },
    },
  });
  renderPage();
  expect(await screen.findByText('ada@purdue.test')).toBeTruthy();
  expect(screen.getAllByText('ada@purdue.test').length).toBe(1);
  expect(screen.getByText('Member no longer sharing')).toBeTruthy();
});

test('posting form is hidden without features.postings and shown with it', async () => {
  window.sessionStorage.setItem('sponsor_auth_token', 't');
  mockApi(base);
  const first = renderPage();
  await screen.findByText('Ada L.');
  expect(screen.queryByText('Post an opportunity')).toBeNull();
  first.unmount();

  mockApi({ ...base, 'GET /api/sponsor/me': { body: { sponsor, features: { postings: true } } } });
  renderPage();
  expect(await screen.findByText('Post an opportunity')).toBeTruthy();
});

test('sign out calls /logout and clears the token', async () => {
  window.sessionStorage.setItem('sponsor_auth_token', 't');
  mockApi({ ...base, 'POST /api/sponsor/logout': { body: { ok: true } } });
  renderPage();
  fireEvent.click(await screen.findByRole('button', { name: /sign out/i }));
  expect(await screen.findByText('Sponsor sign-in')).toBeTruthy();
  expect(window.sessionStorage.getItem('sponsor_auth_token')).toBeNull();
});
