// Sponsor portal client. Sponsor sessions are Bearer tokens kept in sessionStorage (never localStorage) and
// are unrelated to member auth. Errors carry `status` and `code` from the API so the UI can word them.
import { apiBaseUrl } from './clubPmClient';

const KEY = 'sponsor_auth_token';

export function getSponsorToken() {
  try { return window.sessionStorage.getItem(KEY); } catch { return null; }
}
export function setSponsorToken(token) {
  try { window.sessionStorage.setItem(KEY, token); } catch { /* storage unavailable */ }
}
export function clearSponsorToken() {
  try { window.sessionStorage.removeItem(KEY); } catch { /* storage unavailable */ }
}

export class SponsorApiError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code || null;
  }
}

async function call(method, path, { body, auth = true, params } = {}) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth) {
    const token = getSponsorToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  let url = `${apiBaseUrl}/api/sponsor${path}`;
  if (params) {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v) qs.set(k, v); });
    const s = qs.toString();
    if (s) url += `?${s}`;
  }
  let res;
  try {
    res = await fetch(url, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  } catch {
    throw new SponsorApiError(0, 'Could not reach the server.', 'NETWORK');
  }
  let data = null;
  try { data = await res.json(); } catch { /* empty body */ }
  if (!res.ok) throw new SponsorApiError(res.status, data?.error || `HTTP ${res.status}`, data?.code);
  return data;
}

export const requestLogin = email => call('POST', '/login', { body: { email }, auth: false });
export const exchangeToken = token => call('POST', '/session', { body: { token }, auth: false });
export const getMe = () => call('GET', '/me');
export const logout = () => call('POST', '/logout', { body: {} });
export const getDirectory = filters => call('GET', '/directory', { params: filters });
export const getIntros = () => call('GET', '/intros');
export const requestIntro = (memberId, message, opportunityId) =>
  call('POST', '/intros', { body: { memberId, message, ...(opportunityId ? { opportunityId } : {}) } });
export const createPosting = posting => call('POST', '/postings', { body: posting });
