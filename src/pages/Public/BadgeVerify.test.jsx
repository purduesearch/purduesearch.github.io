import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import BadgeVerify from './BadgeVerify';
import { getPublicBadge } from '../../api/clubPmClient';

jest.mock('../../components/SEOHead', () => () => null);
jest.mock('../../components/Navbar', () => () => null);
jest.mock('../../components/Footer', () => () => null);
jest.mock('../../api/clubPmClient', () => ({ getPublicBadge: jest.fn() }));

const fixture = (o = {}) => ({
  id: 'aw1', jwt: 'eyJhbGciOiJFZERTQSJ9.eyJzdWIiOiJ4In0.c2ln', credential: { credentialSubject: { identifier: [{ identityHash: 'sha256$abc' }] } },
  verified: true, verifyError: null, revoked: false, revokedAt: null, issuedAt: '2026-10-01T00:00:00Z',
  issuer: { name: 'Purdue SEARCH', url: 'https://site.test' },
  achievement: { id: 'trainer', name: 'Trainer', description: 'Trained 5 or more members.', metricId: 'members_trained', threshold: 5 },
  value: 14, resultText: 'Trained 14 members', ...o,
});
const renderAt = (id = 'aw1') => render(
  <MemoryRouter initialEntries={[`/badges/${id}`]}><Routes><Route path="/badges/:id" element={<BadgeVerify />} /></Routes></MemoryRouter>,
);

beforeEach(() => { jest.clearAllMocks(); });

test('verified badge shows issuer, achievement, value, date and status, with no email-like text', async () => {
  getPublicBadge.mockResolvedValue(fixture());
  renderAt();
  expect(await screen.findByRole('heading', { name: 'Trainer' })).toBeTruthy();
  expect(getPublicBadge).toHaveBeenCalledWith('aw1');
  expect(screen.getByRole('link', { name: 'Purdue SEARCH' }).getAttribute('href')).toBe('https://site.test');
  expect(screen.getByText('Trained 14 members')).toBeTruthy();
  expect(screen.getByText('October 1, 2026')).toBeTruthy();
  expect(screen.getByText('Active')).toBeTruthy();
  expect(screen.getByText(/Signature verified by the server/)).toBeTruthy();
  expect(screen.getByRole('main').textContent.includes('@')).toBe(false);
});

test('not verified under a previous key explains it plainly', async () => {
  getPublicBadge.mockResolvedValue(fixture({ verified: false, verifyError: 'KEY_MISMATCH' }));
  renderAt();
  expect(await screen.findByText(/Signature not verified/)).toBeTruthy();
  expect(screen.getByText(/issued under a previous signing key; the server could not check it against the current key/)).toBeTruthy();
});

test('revoked badge shows a banner and status', async () => {
  getPublicBadge.mockResolvedValue(fixture({ revoked: true, revokedAt: '2026-11-02T00:00:00Z' }));
  renderAt();
  expect(await screen.findByRole('alert')).toBeTruthy();
  expect(screen.getByText(/revoked by its holder on November 2, 2026/)).toBeTruthy();
  expect(screen.getByText('Revoked')).toBeTruthy();
});

test('unknown id shows not found', async () => {
  getPublicBadge.mockResolvedValue(null);
  renderAt('nope');
  expect(await screen.findByRole('heading', { name: 'No badge with this id' })).toBeTruthy();
});

test('a failed request shows an error', async () => {
  getPublicBadge.mockRejectedValue(new Error('x'));
  renderAt();
  expect(await screen.findByText(/could not be loaded right now/)).toBeTruthy();
});
