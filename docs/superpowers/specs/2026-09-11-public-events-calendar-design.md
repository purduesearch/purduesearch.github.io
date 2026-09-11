# Public Events Calendar on the Home Page — Design

**Date:** 2026-09-11
**Status:** Approved (brainstorming)
**Branch:** `feat/public-events-calendar`

## Goal

Add a calendar section to the public Home page, directly below "Presenting our Subteams", that shows
Constellation (ClubPM) club events — meetings, workshops, socials, other — but never tasks or
deadlines. Visitors can add single events to their calendar or subscribe to a live feed in Google,
Outlook, or Apple Calendar.

## Decisions

| Question | Decision |
|---|---|
| Which events are public? | Opt-in per event via a new `Event.isPublic` flag. |
| Default for new events | Public (`true`) in the ClubPM event form and the Slack `/event` modal. |
| Publish safeguard | Saving an event with `isPublic` on shows an in-modal confirmation warning — on **every** save, create or edit. |
| Constellation indicator | Public events carry a small `fa-eye` icon wherever events render in ClubPM. |
| Existing events | **No backfill.** Migration adds the column as `false` for every existing row. |
| Poll-finalized / iCal-imported events | Private (`false`). Neither path has a UI surface for the warning. |
| `DEADLINE` events | Never public, regardless of the flag. |
| Tasks | Never included (they are a different table; nothing reads `Task` here). |
| Sync mechanism | Live backend-served `.ics` feed (subscribe) + per-event add links. Not a mirrored Google Calendar, not a build-time snapshot. |
| Display timezone | Purdue time, `America/Indiana/Indianapolis`, labelled "ET". |

## 1. Data model

`backend/prisma/schema.prisma`, model `Event`:

```prisma
isPublic Boolean @default(false)
```

plus `@@index([isPublic, startTime])`. One migration. The column default is `false` so every write
path that does not explicitly opt in (poll finalize, iCal import, any future creator) stays private.
"Public by default" is a UI/entry-point default, not a DB default.

Write paths:

- `eventService.createEvent` / `updateEvent` accept `isPublic?: boolean`. Recurring child rows
  spawned by `createEvent` inherit the parent's `isPublic`.
- `POST /api/events` and `PATCH /api/events/:id` pass `isPublic` through.
- Slack `event_create_submit` (`backend/src/slack/actions.ts`) passes `isPublic: true`.
- `pollService` finalize and `api/eventImport.ts` are untouched (inherit `false`).

## 2. Public API (`backend/src/api/public.ts`, no auth)

Pure helpers live in a new `backend/src/services/publicEventService.ts`:

- `PUBLIC_EVENT_WHERE` — `{ isPublic: true, type: { not: "DEADLINE" } }`.
- `serializePublicEvent(e)` → `{ id, title, description, type, startTime, endTime, location, isVirtual }`.
  Built by construction from those keys; notes, attendees, organizer, project, RSVPs are never sent.
  When `isVirtual` is true, `location` is `null`.
- `buildPublicIcsFeed(events, now)` → RFC 5545 `VCALENDAR` string with one `VEVENT` per event:
  `UID:evt-<id>@purduesearch.org`, `DTSTAMP`, `DTSTART`, `DTEND` (start + 1 h when `endTime` is
  null), `SUMMARY`, optional `DESCRIPTION` / `LOCATION` ("Online" for virtual), `CATEGORIES:<type>`,
  and `URL:<SITE>/#events`. Calendar-level `X-WR-CALNAME:Purdue SEARCH Events`,
  `X-WR-TIMEZONE:America/Indiana/Indianapolis`, `REFRESH-INTERVAL;VALUE=DURATION:PT6H`,
  `X-PUBLISHED-TTL:PT6H`. Text is escaped and lines folded at 75 octets. Times are UTC (`Z`).
  The new UID domain is `purduesearch.org`; this is a new feed, so the do-not-migrate rule for the
  poll `.ics` UID does not apply.

Routes:

- `GET /api/public/events?from=ISO&to=ISO` — defaults `from = now - 1 day`, `to = now + 120 days`;
  range clamped to 366 days; invalid dates → 400. Ordered by `startTime`, max 500 rows.
  `Cache-Control: public, max-age=300`.
- `GET /api/public/events.ics` — window `now - 60 days` → `now + 365 days`.
  `Content-Type: text/calendar; charset=utf-8`, `Content-Disposition: inline; filename="purdue-search-events.ics"`,
  `Cache-Control: public, max-age=900`. Its path cannot collide with `/events/:eventId/rsvp-info`
  (different segment count); it is placed above the RSVP routes for readability.

## 3. Constellation UI

- **`EventFormModal.jsx`** — new toggle "Show on purduesearch.org" (`fa-eye` / `fa-eye-slash`),
  default on for new events, loaded from `editEvent.isPublic` when editing. Hidden, and forced off
  in the payload, when type is `DEADLINE`. On submit with `isPublic` on, the modal swaps its footer
  for an inline confirmation: *"This event will be visible to anyone on purduesearch.org and in the
  public calendar feed — its title, time, location, and description. Publish it?"* with
  **Publish** / **Back**. Only **Publish** calls `onSave`.
- **Eye icon** (`fas fa-eye`, `title="Public on purduesearch.org"`, `aria-label` likewise) on:
  `CalendarView.jsx` month/week chips and agenda rows; `CalendarPage.jsx` `EventDetailModal`
  header (as a small "Public" badge); `Dashboard.jsx` `UpcomingEventsWidget` rows;
  `CalendarTab.jsx` if it renders its own event chips.
- Drag-to-move on the ClubPM calendar does not prompt (it changes only the time of an event
  already approved for publication).
- CSS for these additions goes in `public/clubpm-theme.css`.

## 4. Home page section

New `src/components/PublicEventsCalendar.jsx`, rendered in `src/pages/Home.jsx` as
`<section id="events">` immediately after `#features`. Shared, dependency-free helpers in new
`src/lib/calendarLinks.js` (the Home bundle must not import `clubPmClient.js`):

- `googleAddUrl(ev)`, `outlookAddUrl(ev, 'live' | 'office')`, `buildEventIcs(ev)` (single-event
  download via Blob), `feedHttpsUrl()`, `feedWebcalUrl()`, `googleSubscribeUrl()`,
  `outlookSubscribeUrl('live' | 'office')`, `formatPurdueTime(date)`.
- Feed URL = `${process.env.REACT_APP_API_URL || ''}/api/public/events.ics`, made absolute
  against `window.location.origin` when the env var is empty (local dev).

Layout (Bootstrap grid, already on the page):

- **Header** — title "Upcoming <b>Events</b>", sub-title, and a **Subscribe** dropdown: Google
  Calendar, Outlook.com, Microsoft 365, Apple Calendar (`webcal://`), Copy feed URL (clipboard,
  with "Copied" feedback). A one-line note that subscribed calendars refresh every few hours.
- **Left column** — compact month grid (prev/next month, today ring, a coloured dot per event type
  on days with events). Clicking a day filters the list to that day; clicking again clears.
- **Right column** — filter chips (All / Meetings / Workshops / Socials / Other), then up to 6
  upcoming events (or the selected day's events): date tile, type badge (colour + Font Awesome
  icon), time range in ET, location or "Online", expandable description, and an **Add to calendar**
  dropdown (Google, Outlook, Download .ics). "Show more" reveals the next 6.
- **States** — skeleton while loading; empty state ("No public events scheduled yet") that still
  shows Subscribe; error state is a quiet one-liner with Retry, never a thrown error.
- **Loading strategy** — fetch is deferred until the section is within ~400px of the viewport
  (IntersectionObserver), then fetches `from = start of visible month - 7d` to `now + 120d`;
  navigating months refetches only when outside the loaded range.
- Dropdowns close on outside click and `Escape`; all controls are buttons/links with visible focus
  and `aria-expanded`. Icons are Font Awesome only. Respects `prefers-reduced-motion`.
- CSS: appended to `public/search-theme.css`, classes prefixed `home-events-`, using only tokens
  that exist in its `:root` (`--color-text`, `--color-muted`, `--color-border`, `--color-accent`,
  `--color-bg-*`) with literal fallbacks.

## 5. Error handling

- Public list endpoint: 400 on bad dates, 500 with generic message on DB error (logged).
- ICS endpoint: 500 plain text on failure; never returns a partial calendar.
- Frontend: fetch failure → error state with Retry; the rest of Home is unaffected.

## 6. Testing

- `backend/src/services/publicEventService.test.ts` — serializer drops private fields and nulls
  virtual location; ICS builder escapes `, ; \ \n`, folds long lines, emits `evt-<id>@purduesearch.org`
  UIDs, defaults missing end to +1 h, uses CRLF.
- `src/lib/calendarLinks.test.js` — Google/Outlook URL params, webcal conversion, single-event ICS.
- Gates: `npm run build` (repo root), `npx tsc --noEmit` (backend), backend tests for the new file.

## Out of scope

- A Slack-modal public checkbox (Slack creations are public by default, as agreed).
- Per-subteam public feeds, RSVP from the homepage, a dedicated `/events` page.
- Backfilling existing events.
