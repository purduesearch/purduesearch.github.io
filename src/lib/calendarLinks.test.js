import {
  FEED_NAME, feedHttpsUrl, feedWebcalUrl, eventIcsUrl,
  googleAddUrl, outlookAddUrl, googleSubscribeUrl, outlookSubscribeUrl,
} from './calendarLinks';

const ORIGIN = 'https://api.example.org';
const EV = {
  id: 'ev 1', title: 'Fall Kickoff', description: 'Pizza & rockets',
  startTime: '2026-09-16T22:30:00.000Z', endTime: null,
  location: null, isVirtual: true, type: 'SOCIAL',
};

test('feed URLs', () => {
  expect(feedHttpsUrl(ORIGIN)).toBe('https://api.example.org/api/public/events.ics');
  expect(feedWebcalUrl(ORIGIN)).toBe('webcal://api.example.org/api/public/events.ics');
  expect(feedWebcalUrl('http://localhost:3000')).toBe('webcal://localhost:3000/api/public/events.ics');
  expect(eventIcsUrl('ev 1', ORIGIN)).toBe('https://api.example.org/api/public/events/ev%201/ics');
});

test('googleAddUrl', () => {
  const u = new URL(googleAddUrl(EV));
  expect(u.origin + u.pathname).toBe('https://calendar.google.com/calendar/render');
  expect(u.searchParams.get('action')).toBe('TEMPLATE');
  expect(u.searchParams.get('text')).toBe('Fall Kickoff');
  expect(u.searchParams.get('dates')).toBe('20260916T223000Z/20260916T233000Z'); // default +1h
  expect(u.searchParams.get('details')).toBe('Pizza & rockets');
  expect(u.searchParams.get('location')).toBe('Online');
  expect(u.searchParams.get('ctz')).toBe('America/Indiana/Indianapolis');
});

test('outlookAddUrl live vs office', () => {
  const live = new URL(outlookAddUrl(EV, 'live'));
  expect(live.origin).toBe('https://outlook.live.com');
  expect(live.pathname).toBe('/calendar/0/deeplink/compose');
  expect(live.searchParams.get('rru')).toBe('addevent');
  expect(live.searchParams.get('subject')).toBe('Fall Kickoff');
  expect(live.searchParams.get('startdt')).toBe('2026-09-16T22:30:00.000Z');
  expect(live.searchParams.get('enddt')).toBe('2026-09-16T23:30:00.000Z');
  expect(new URL(outlookAddUrl(EV, 'office')).origin).toBe('https://outlook.office.com');
});

test('subscribe URLs', () => {
  const g = new URL(googleSubscribeUrl(ORIGIN));
  expect(g.searchParams.get('cid')).toBe('webcal://api.example.org/api/public/events.ics');
  const o = new URL(outlookSubscribeUrl('live', ORIGIN));
  expect(o.origin + o.pathname).toBe('https://outlook.live.com/calendar/0/addfromweb');
  expect(o.searchParams.get('url')).toBe('https://api.example.org/api/public/events.ics');
  expect(o.searchParams.get('name')).toBe(FEED_NAME);
  expect(new URL(outlookSubscribeUrl('office', ORIGIN)).origin).toBe('https://outlook.office.com');
});
