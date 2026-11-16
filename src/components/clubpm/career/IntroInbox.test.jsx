import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import IntroInbox from './IntroInbox';
import { careerApi } from '../../../api/clubPmClient';

jest.mock('../../../clubpm/ClubPmAuth', () => ({ useClubPmAuth: () => ({ member: { id: 'm1', email: 'ada@purdue.edu' } }) }));
jest.mock('../../../api/clubPmClient', () => ({ careerApi: { intros: jest.fn(), respondIntro: jest.fn() } }));
jest.mock('react-hot-toast', () => ({ success: jest.fn(), error: jest.fn() }));

const row = (o = {}) => ({
  id: 'i1', status: 'PENDING', message: 'Hi <script>alert(1)</script> let us talk', opportunityId: 'intern-26',
  createdAt: '2026-11-01T00:00:00Z', expiresAt: '2026-11-22T00:00:00Z', respondedAt: null,
  sponsor: { name: 'Sam Sponsor', org: 'Acme Aero' }, ...o,
});
const bullets = [
  { key: 'a', text: 'Authored 12 merged pull requests.', shareable: true, pending: false, selected: true, hidden: false },
  { key: 'b', text: 'Pending claim', shareable: false, pending: true, selected: true, hidden: false },
];
const mount = (p = {}) => render(<IntroInbox bullets={bullets} onOpenSettings={jest.fn()} {...p} />);
beforeEach(() => { jest.clearAllMocks(); careerApi.intros.mockResolvedValue({ intros: [row()] }); careerApi.respondIntro.mockResolvedValue({ ok: true }); });

test('renders rows with the message as literal text', async () => {
  const { container } = mount();
  expect(await screen.findByText(/Sam Sponsor, Acme Aero/)).toBeTruthy();
  expect(screen.getByText(/<script>alert\(1\)<\/script>/)).toBeTruthy();
  expect(container.querySelector('script')).toBeNull();
  expect(screen.getByText(/Opportunity: intern-26/)).toBeTruthy();
});

test('accept preview shows email and bullets, then accepts', async () => {
  mount();
  fireEvent.click(await screen.findByRole('button', { name: 'Accept' }));
  expect(screen.getByText(/ada@purdue.edu/)).toBeTruthy();
  expect(screen.getByText('Authored 12 merged pull requests.')).toBeTruthy();
  expect(screen.queryByText('Pending claim')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Send my details and accept' }));
  await waitFor(() => expect(careerApi.respondIntro).toHaveBeenCalledWith('i1', true));
});

test('decline calls respondIntro false', async () => {
  mount();
  fireEvent.click(await screen.findByRole('button', { name: 'Decline' }));
  await waitFor(() => expect(careerApi.respondIntro).toHaveBeenCalledWith('i1', false));
});

test('409 not sharing shows the sharing message', async () => {
  careerApi.respondIntro.mockRejectedValue(Object.assign(new Error('Turn on sharing with sponsors before accepting an introduction.'), { status: 409 }));
  mount();
  fireEvent.click(await screen.findByRole('button', { name: 'Accept' }));
  fireEvent.click(screen.getByRole('button', { name: 'Send my details and accept' }));
  expect(await screen.findByText(/Turn on sharing with sponsors before accepting/)).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Open settings' })).toBeTruthy();
});

test('answered rows are read-only and show sponsor email when accepted', async () => {
  careerApi.intros.mockResolvedValue({ intros: [row({ status: 'ACCEPTED', sponsor: { name: 'Sam', org: 'Acme', email: 's@acme.com' } }), row({ id: 'i2', status: 'EXPIRED' })] });
  mount();
  expect(await screen.findByText(/s@acme.com/)).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Accept' })).toBeNull();
});

test('empty state', async () => {
  careerApi.intros.mockResolvedValue({ intros: [] });
  mount();
  expect(await screen.findByText('No sponsors have asked to meet you.')).toBeTruthy();
});
