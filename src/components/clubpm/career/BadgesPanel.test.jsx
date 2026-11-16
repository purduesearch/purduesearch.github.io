import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import toast from 'react-hot-toast';
import BadgesPanel from './BadgesPanel';
import { careerApi } from '../../../api/clubPmClient';

jest.mock('../../../api/clubPmClient', () => ({ careerApi: { badges: jest.fn(), claimBadge: jest.fn(), revokeBadge: jest.fn() } }));
jest.mock('react-hot-toast', () => ({ success: jest.fn(), error: jest.fn() }));

const award = (o = {}) => ({
  id: 'aw1', value: 6, issuedAt: '2026-10-01T00:00:00Z', revokedAt: null, revokedReason: null,
  verifyUrl: 'https://site.test/badges/aw1', credentialUrl: 'https://api.test/api/public/badges/aw1',
  linkedInUrl: 'https://www.linkedin.com/profile/add?certId=aw1', ...o,
});
const badge = (o = {}) => ({
  id: 'trainer', name: 'Trainer', description: 'Trained 5 or more members.', metricId: 'members_trained', threshold: 5, proof: 'RECORDS',
  value: 6, resultText: 'Trained 6 members', meetsThreshold: true, needsConfirmation: false, eligible: true, award: null, ...o,
});
const payload = (o = {}) => ({
  canIssue: true,
  badges: [
    badge(),
    badge({ id: 'mentor', name: 'Mentor', eligible: false, award: award() }),
    badge({ id: 'builder', name: 'Builder', eligible: false, award: award({ id: 'aw2', revokedAt: '2026-11-01T00:00:00Z', revokedReason: 'Old' }) }),
    badge({ id: 'leader', name: 'Leader', eligible: false, needsConfirmation: true }),
    badge({ id: 'shipper', name: 'Shipper', eligible: false, meetsThreshold: false, value: 2 }),
  ],
  ...o,
});
const item = name => screen.getAllByRole('listitem').find(li => within(li).queryByText(name));

beforeEach(() => {
  jest.clearAllMocks();
  careerApi.badges.mockResolvedValue(payload());
  careerApi.claimBadge.mockResolvedValue({ award: award() });
  careerApi.revokeBadge.mockResolvedValue({ award: award({ revokedAt: '2026-11-16T00:00:00Z' }) });
});

test('lists eligible, claimed, revoked and unconfirmed states with text labels', async () => {
  render(<BadgesPanel />);
  await screen.findByText('Trainer');
  expect(within(item('Trainer')).getByText(/Ready to claim/)).toBeTruthy();
  expect(within(item('Mentor')).getByText(/Claimed/)).toBeTruthy();
  expect(within(item('Builder')).getByText(/^\s*Revoked$/)).toBeTruthy();
  expect(within(item('Builder')).queryByRole('button')).toBeNull();
  expect(within(item('Leader')).getByText(/Needs admin confirmation/)).toBeTruthy();
  expect(within(item('Shipper')).getByText(/2 of 5 needed/)).toBeTruthy();
});

test('claim is disabled when issuing is not set up', async () => {
  careerApi.badges.mockResolvedValue(payload({ canIssue: false }));
  render(<BadgesPanel />);
  expect(await screen.findByText(/Badge issuing is not set up yet/)).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Claim badge' }).disabled).toBe(true);
});

test('claim confirmation explains what is public, then claims and refreshes', async () => {
  render(<BadgesPanel />);
  fireEvent.click(await screen.findByRole('button', { name: 'Claim badge' }));
  const box = screen.getByRole('group', { name: /Confirm claiming Trainer/ });
  expect(within(box).getByText(/anyone with its link can check/)).toBeTruthy();
  expect(within(box).getByText(/salted hash of your email, never the email itself/)).toBeTruthy();
  expect(within(box).getByText(/Trained 6 members/)).toBeTruthy();
  fireEvent.click(within(box).getByRole('button', { name: 'Claim and sign badge' }));
  await waitFor(() => expect(careerApi.claimBadge).toHaveBeenCalledWith('trainer'));
  await waitFor(() => expect(careerApi.badges).toHaveBeenCalledTimes(2));
});

test('claim error shows the server message', async () => {
  careerApi.claimBadge.mockRejectedValue(Object.assign(new Error('You revoked this badge. A revoked badge cannot be issued again.'), { status: 409 }));
  render(<BadgesPanel />);
  fireEvent.click(await screen.findByRole('button', { name: 'Claim badge' }));
  fireEvent.click(screen.getByRole('button', { name: 'Claim and sign badge' }));
  await waitFor(() => expect(toast.error).toHaveBeenCalledWith('You revoked this badge. A revoked badge cannot be issued again.'));
});

test('revoke confirmation warns it is permanent and sends the reason', async () => {
  render(<BadgesPanel />);
  await screen.findByText('Mentor');
  fireEvent.click(within(item('Mentor')).getByRole('button', { name: 'Revoke' }));
  const box = screen.getByRole('group', { name: /Confirm revoking Mentor/ });
  expect(within(box).getByText(/Revoking is permanent/)).toBeTruthy();
  expect(within(box).getByText(/cannot claim it again/)).toBeTruthy();
  fireEvent.change(within(box).getByLabelText(/Reason/), { target: { value: 'No longer accurate' } });
  fireEvent.click(within(box).getByRole('button', { name: 'Revoke permanently' }));
  await waitFor(() => expect(careerApi.revokeBadge).toHaveBeenCalledWith('aw1', 'No longer accurate'));
});

test('LinkedIn link uses the server URL', async () => {
  render(<BadgesPanel />);
  await screen.findByText('Mentor');
  const link = within(item('Mentor')).getByRole('link', { name: /Add to LinkedIn/ });
  expect(link.getAttribute('href')).toBe('https://www.linkedin.com/profile/add?certId=aw1');
});

test('copy verify link writes to the clipboard', async () => {
  const writeText = jest.fn().mockResolvedValue();
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  render(<BadgesPanel />);
  await screen.findByText('Mentor');
  fireEvent.click(within(item('Mentor')).getByRole('button', { name: /Copy verify link/ }));
  await waitFor(() => expect(writeText).toHaveBeenCalledWith('https://site.test/badges/aw1'));
  expect(toast.success).toHaveBeenCalledWith('Verify link copied');
  delete navigator.clipboard;
});

test('copy falls back to showing the link when the clipboard is unavailable', async () => {
  Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
  render(<BadgesPanel />);
  await screen.findByText('Mentor');
  fireEvent.click(within(item('Mentor')).getByRole('button', { name: /Copy verify link/ }));
  expect(await screen.findByText('https://site.test/badges/aw1')).toBeTruthy();
  delete navigator.clipboard;
});
