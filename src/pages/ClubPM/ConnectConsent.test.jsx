import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ConnectConsent, { oauthCallbackUrl } from './ConnectConsent';
import { getOAuthPendingRequest, submitOAuthConsent } from '../../api/clubPmClient';

jest.mock('../../api/clubPmClient', () => ({ getOAuthPendingRequest: jest.fn(), submitOAuthConsent: jest.fn() }));

const callback = 'https://claude.ai/api/mcp/auth_callback?code=opaque&state=original';
const allScopes = ['constellation.read', 'constellation.plan', 'constellation.plan.delete'];
function pending(overrides = {}) {
  return {
    id: 'pending123', client: { name: 'Claude personal connector' }, requestedScopes: allScopes, scopes: allScopes,
    member: { id: 'admin', isAdmin: true }, expiresAt: new Date(Date.now() + 600000).toISOString(),
    projects: [{ id: 'p1', name: 'AstroUSA', isLead: true, status: 'ACTIVE' }, { id: 'p2', name: 'Software', isLead: false, status: 'ACTIVE' }],
    ...overrides,
  };
}
function renderAt(search = '?req=pending123', onRedirect = jest.fn()) {
  const result = render(<MemoryRouter initialEntries={[`/clubpm/connect${search}`]}><ConnectConsent onRedirect={onRedirect} /></MemoryRouter>);
  return { ...result, onRedirect };
}

beforeEach(() => {
  jest.resetAllMocks();
  getOAuthPendingRequest.mockResolvedValue(pending());
  submitOAuthConsent.mockResolvedValue({ redirectUrl: callback });
});
afterEach(() => jest.useRealTimers());

test('requires manual project selection, including for project leads', async () => {
  renderAt();
  expect(await screen.findByText('Claude personal connector')).toBeInTheDocument();
  expect(screen.getByLabelText('Share AstroUSA')).not.toBeChecked();
  expect(screen.getByLabelText('Share Software')).not.toBeChecked();
  expect(screen.getByRole('button', { name: 'Connect selected projects' })).toBeDisabled();
  expect(screen.getByText('Profile → Customize → Connected apps')).toBeInTheDocument();
  expect(submitOAuthConsent).not.toHaveBeenCalled();
});

test('admin approval submits only selected projects; task deletion starts off', async () => {
  const { onRedirect } = renderAt();
  fireEvent.click(await screen.findByLabelText('Share Software'));
  expect(screen.getByRole('checkbox', { name: /allow task deletion/i })).not.toBeChecked();
  fireEvent.click(screen.getByRole('button', { name: 'Connect selected projects' }));
  await waitFor(() => expect(onRedirect).toHaveBeenCalledWith(callback));
  expect(submitOAuthConsent).toHaveBeenCalledWith({ pendingId: 'pending123', approve: true, scopes: allScopes.slice(0, 2), projectIds: ['p2'] });
});

test('task deletion requires explicit opt-in and planning stays a prerequisite', async () => {
  renderAt();
  const project = await screen.findByLabelText('Share AstroUSA');
  const remove = screen.getByRole('checkbox', { name: /allow task deletion/i });
  const plan = screen.getByRole('checkbox', { name: /allow project changes/i });
  fireEvent.click(remove);
  expect(remove).toBeChecked();
  fireEvent.click(plan);
  expect(remove).not.toBeChecked();
  expect(remove).toBeDisabled();
  fireEvent.click(plan);
  expect(remove).not.toBeChecked();
  fireEvent.click(remove);
  fireEvent.click(project);
  fireEvent.click(screen.getByRole('button', { name: 'Connect selected projects' }));
  await waitFor(() => expect(submitOAuthConsent).toHaveBeenCalledWith({ pendingId: 'pending123', approve: true, scopes: allScopes, projectIds: ['p1'] }));
});

test('admins can choose a read-only connection', async () => {
  renderAt();
  fireEvent.click(await screen.findByLabelText('Share AstroUSA'));
  fireEvent.click(screen.getByRole('checkbox', { name: /allow project changes/i }));
  fireEvent.click(screen.getByRole('button', { name: 'Connect selected projects' }));
  await waitFor(() => expect(submitOAuthConsent).toHaveBeenCalledWith(expect.objectContaining({ scopes: ['constellation.read'] })));
});

test('non-admins cannot opt into any project changes even if response scopes contain them', async () => {
  getOAuthPendingRequest.mockResolvedValue(pending({ member: { id: 'member', isAdmin: false } }));
  renderAt();
  fireEvent.click(await screen.findByLabelText('Share AstroUSA'));
  expect(screen.queryByRole('checkbox', { name: /allow project changes/i })).not.toBeInTheDocument();
  expect(screen.queryByRole('checkbox', { name: /allow task deletion/i })).not.toBeInTheDocument();
  expect(screen.getByText(/Your connection is read-only/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Connect selected projects' }));
  await waitFor(() => expect(submitOAuthConsent).toHaveBeenCalledWith(expect.objectContaining({ scopes: ['constellation.read'] })));
});

test('unrequested planning and deletion permissions are never offered or submitted', async () => {
  getOAuthPendingRequest.mockResolvedValue(pending({ scopes: ['constellation.read'] }));
  renderAt();
  fireEvent.click(await screen.findByLabelText('Share AstroUSA'));
  expect(screen.queryByRole('checkbox', { name: /allow project changes|allow task deletion/i })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Connect selected projects' }));
  await waitFor(() => expect(submitOAuthConsent).toHaveBeenCalledWith(expect.objectContaining({ scopes: ['constellation.read'] })));
});

test('denial submits an explicit denial without project permissions', async () => {
  const { onRedirect } = renderAt();
  fireEvent.click(await screen.findByRole('button', { name: 'Deny' }));
  await waitFor(() => expect(onRedirect).toHaveBeenCalled());
  expect(submitOAuthConsent).toHaveBeenCalledWith({ pendingId: 'pending123', approve: false, scopes: [], projectIds: [] });
});

test('same-tick repeated approval and denial cannot submit twice', async () => {
  let finish;
  submitOAuthConsent.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const { onRedirect } = renderAt();
  fireEvent.click(await screen.findByLabelText('Share AstroUSA'));
  const approve = screen.getByRole('button', { name: 'Connect selected projects' });
  const deny = screen.getByRole('button', { name: 'Deny' });
  act(() => { approve.click(); approve.click(); deny.click(); });
  expect(submitOAuthConsent).toHaveBeenCalledTimes(1);
  await act(async () => { finish({ redirectUrl: callback }); });
  expect(onRedirect).toHaveBeenCalledTimes(1);
});

test('a failed submission remains on screen and can be retried', async () => {
  submitOAuthConsent.mockRejectedValueOnce(new Error('Authorization request unavailable'));
  const { onRedirect } = renderAt();
  fireEvent.click(await screen.findByLabelText('Share Software'));
  fireEvent.click(screen.getByRole('button', { name: 'Connect selected projects' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Authorization request unavailable');
  expect(onRedirect).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Connect selected projects' }));
  await waitFor(() => expect(onRedirect).toHaveBeenCalledTimes(1));
});

test.each(['', '?req=', '?req=one&req=two', '?req=%2Foutside'])('rejects missing or ambiguous request query %s', async search => {
  renderAt(search);
  expect(await screen.findByRole('alert')).toHaveTextContent('connection link is incomplete');
  expect(getOAuthPendingRequest).not.toHaveBeenCalled();
  expect(submitOAuthConsent).not.toHaveBeenCalled();
});

test('an unavailable request shows an error and supports a fresh load', async () => {
  getOAuthPendingRequest.mockRejectedValueOnce(new Error('Authorization request unavailable'));
  renderAt();
  expect(await screen.findByRole('alert')).toHaveTextContent('Authorization request unavailable');
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByLabelText('Share AstroUSA')).not.toBeChecked();
  expect(getOAuthPendingRequest).toHaveBeenCalledTimes(2);
});

test('protocol error codes become useful recovery guidance', async () => {
  getOAuthPendingRequest.mockRejectedValueOnce(new Error('invalid_request'));
  renderAt();
  expect(await screen.findByRole('alert')).toHaveTextContent('unavailable or has expired');
  expect(screen.getByRole('alert')).not.toHaveTextContent('invalid_request');
});

test('cookie-only members can sign in again and return to the consent request', async () => {
  getOAuthPendingRequest.mockRejectedValueOnce(Object.assign(new Error('invalid_token'), { status: 401 }));
  renderAt();
  expect(await screen.findByRole('alert')).toHaveTextContent('Sign in to Constellation again');
  expect(screen.getByRole('link', { name: 'Sign in again' })).toHaveAttribute('href', '/clubpm/login?returnTo=%2Fclubpm%2Fconnect%3Freq%3Dpending123');
  expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
});

test('expired pending requests cannot be approved', async () => {
  getOAuthPendingRequest.mockResolvedValue(pending({ expiresAt: new Date(Date.now() - 1).toISOString() }));
  renderAt();
  expect(await screen.findByRole('alert')).toHaveTextContent('has expired');
  expect(screen.queryByRole('button', { name: 'Connect selected projects' })).not.toBeInTheDocument();
});

test('a request that expires while open disables both consent actions', async () => {
  jest.useFakeTimers();
  getOAuthPendingRequest.mockResolvedValue(pending({ expiresAt: new Date(Date.now() + 1000).toISOString() }));
  renderAt();
  await act(async () => {});
  fireEvent.click(screen.getByLabelText('Share AstroUSA'));
  act(() => { jest.advanceTimersByTime(1000); });
  expect(screen.getByRole('alert')).toHaveTextContent('has expired');
  expect(screen.getByRole('button', { name: 'Connect selected projects' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Deny' })).toBeDisabled();
});

test('a malformed server callback is displayed as an error instead of navigating', async () => {
  submitOAuthConsent.mockResolvedValue({ redirectUrl: 'javascript:alert(1)' });
  const { onRedirect } = renderAt();
  fireEvent.click(await screen.findByRole('button', { name: 'Deny' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('invalid callback');
  expect(onRedirect).not.toHaveBeenCalled();
});

test('callback navigation accepts only absolute HTTPS URLs without credentials or fragments', () => {
  expect(oauthCallbackUrl(callback)).toBe(callback);
  for (const url of ['javascript:alert(1)', 'http://claude.ai/callback', '/callback', 'https://user@claude.ai/callback', 'https://claude.ai/callback#fragment', undefined]) {
    expect(() => oauthCallbackUrl(url)).toThrow('invalid callback');
  }
});
