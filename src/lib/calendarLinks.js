// "Add to calendar" and "Subscribe" link builders for the public events
// calendar. Pure string work — no React, no clubPmClient (the Home bundle
// must stay free of ClubPM code). `origin` params exist for tests and for
// local dev, where REACT_APP_API_URL is empty and the CRA proxy serves /api.

import { PURDUE_TZ } from './publicEvents';

const API_BASE = process.env.REACT_APP_API_URL || '';
const DEFAULT_DURATION_MS = 60 * 60 * 1000;
export const FEED_NAME = 'Purdue SEARCH Events';

function currentOrigin() {
  return typeof window !== 'undefined' ? window.location.origin : '';
}

function apiUrl(path, origin) {
  return `${API_BASE || origin || currentOrigin()}${path}`;
}

export function feedHttpsUrl(origin) {
  return apiUrl('/api/public/events.ics', origin);
}

export function feedWebcalUrl(origin) {
  return feedHttpsUrl(origin).replace(/^https?:\/\//, 'webcal://');
}

export function eventIcsUrl(id, origin) {
  return apiUrl(`/api/public/events/${encodeURIComponent(id)}/ics`, origin);
}

function endOf(ev) {
  const start = new Date(ev.startTime);
  const end = ev.endTime ? new Date(ev.endTime) : null;
  return end && end > start ? end : new Date(start.getTime() + DEFAULT_DURATION_MS);
}

function utcStamp(d) {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function locationOf(ev) {
  return ev.isVirtual ? 'Online' : (ev.location || '');
}

export function googleAddUrl(ev) {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: ev.title,
    dates: `${utcStamp(new Date(ev.startTime))}/${utcStamp(endOf(ev))}`,
    ctz: PURDUE_TZ,
  });
  if (ev.description) params.set('details', ev.description);
  const loc = locationOf(ev);
  if (loc) params.set('location', loc);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function outlookHost(host) {
  return host === 'office' ? 'https://outlook.office.com' : 'https://outlook.live.com';
}

/** host: 'live' (Outlook.com / personal) or 'office' (Microsoft 365 / Purdue). */
export function outlookAddUrl(ev, host = 'live') {
  const params = new URLSearchParams({
    path: '/calendar/action/compose',
    rru: 'addevent',
    subject: ev.title,
    startdt: new Date(ev.startTime).toISOString(),
    enddt: endOf(ev).toISOString(),
  });
  if (ev.description) params.set('body', ev.description);
  const loc = locationOf(ev);
  if (loc) params.set('location', loc);
  return `${outlookHost(host)}/calendar/0/deeplink/compose?${params.toString()}`;
}

export function googleSubscribeUrl(origin) {
  return `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(feedWebcalUrl(origin))}`;
}

export function outlookSubscribeUrl(host = 'live', origin) {
  const params = new URLSearchParams({ url: feedHttpsUrl(origin), name: FEED_NAME });
  return `${outlookHost(host)}/calendar/0/addfromweb?${params.toString()}`;
}
