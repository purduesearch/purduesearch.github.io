import {
  clearSponsorToken, createPosting, getDirectory, getMe, getSponsorToken, requestIntro, setSponsorToken,
} from './sponsorClient';

jest.mock('./clubPmClient', () => ({ apiBaseUrl: '' }));

const reply = (status, body) => { global.fetch = jest.fn().mockResolvedValue({ ok: status < 400, status, json: async () => body }); };
afterEach(() => { delete global.fetch; window.sessionStorage.clear(); window.localStorage.clear(); });

test('token lives in sessionStorage only and is sent as Bearer', async () => {
  setSponsorToken('abc');
  expect(window.localStorage.length).toBe(0);
  expect(getSponsorToken()).toBe('abc');
  reply(200, { sponsor: {} });
  await getMe();
  expect(global.fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer abc');
  clearSponsorToken();
  expect(getSponsorToken()).toBeNull();
});

test('directory sends only the filters that are set', async () => {
  reply(200, { members: [] });
  await getDirectory({ role: '17-2141.00', tool: '', sort: 'name' });
  expect(global.fetch.mock.calls[0][0]).toBe('/api/sponsor/directory?role=17-2141.00&sort=name');
});

test('errors carry status and code', async () => {
  reply(429, { error: 'slow down', code: 'RATE_LIMITED' });
  await expect(requestIntro('m1', 'hi')).rejects.toMatchObject({ status: 429, code: 'RATE_LIMITED' });
});

test('createPosting posts to /postings', async () => {
  reply(201, {});
  await createPosting({ title: 'Intern' });
  expect(global.fetch.mock.calls[0][0]).toBe('/api/sponsor/postings');
  expect(global.fetch.mock.calls[0][1].method).toBe('POST');
});
