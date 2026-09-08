# Calendar Tab Refinement + iCal Feed Import — Design

**Date:** 2026-09-08
**Status:** Approved
**Scope:** `/clubpm/calendar` UI rework, event deletion, admin one-shot ICS import into the club
calendar, and per-member iCal feeds driving meeting-poll availability.

---

## 1. Problem

Three separate gaps, all reachable from the Calendar tab:

1. **No way to delete an event.** `DELETE /api/events/:id` has existed and been admin-gated since the
   events API was written (`backend/src/api/events.ts:215`), but no client ever calls it. An admin who
   creates an event by mistake is stuck with it.
2. **The page has outgrown its layout.** Actions are split between a page header, a floating FAB that
   duplicates "New Event", and CalendarView's own internal control row. The scheduling-poll strip sits
   above the grid and pushes it down. ~650 lines of inline style objects make any of it hard to adjust.
3. **Availability is entered entirely by hand.** Filling a when2meet-style poll means clicking every
   free slot, even though the member's real schedule already exists in Google Calendar.

### 1.1 A latent bug this uncovered

`CalendarPage` holds a `cursor` used *only* to compute the API fetch range
(`src/pages/ClubPM/CalendarPage.jsx:404-424`), while `CalendarView` holds its own independent `cursor`
and `viewMode` (`src/components/clubpm/CalendarView.jsx:119-120`). Navigating to another month
re-renders the grid from the new cursor but **never refetches** — so events outside the mount month
silently do not appear. The comment block at the bottom of `CalendarPage` documents this deferral.

Fixing it is in scope: the toolbar rework lifts `cursor` and `viewMode` into `CalendarPage`, which is
the same change the toolbar needs anyway.

---

## 2. Decisions

| Question | Decision | Why |
|---|---|---|
| How calendar data reaches us | **Secret iCal URL, per member** | No OAuth, no Google verification review, works for Outlook/Apple too. The existing `GoogleDriveCredential` is a singleton bot row — per-member OAuth would be entirely new credential plumbing plus a sensitive-scope review. |
| Who populates the club calendar | **Admin-only, one-shot, with preview** | Personal feeds must never be able to write to the shared calendar. One-shot avoids a sync engine; `externalUid` still gets stored so a re-import dedupes rather than doubling. |
| Poll availability behavior | **Preview conflicts, then apply** | Nothing is auto-submitted. The member sees what conflicts, then chooses "select all free slots". An auto-fill would silently overwrite a selection already in progress. |
| Feed storage | **On the member's profile, busy intervals only** | Encrypted at rest; titles are fetched for the preview but never persisted. |
| All-day events | **Not busy by default**, with a toggle | "Spring Break" or a birthday would otherwise black out entire days of a poll. |

---

## 3. Data model

```prisma
model Member {
  // ... existing fields
  icsFeedUrl       String?    // AES-GCM via encryptSecret, same handling as slackUserToken
  icsFeedLabel     String?    // human label, e.g. "Purdue schedule"
  icsFeedCheckedAt DateTime?
  icsFeedStatus    String?    // OK | UNREACHABLE | INVALID
}

model Event {
  // ... existing fields
  externalUid    String?   // ICS UID of the source event
  externalSource String?   // feed host, for display

  @@index([externalUid])
}
```

`Event.externalUid` is stored even though the club import is one-shot: it is what lets a second import
of the same feed show "already imported" instead of creating duplicates.

There is no model for the admin's club-feed URL — the admin pastes it per import.

---

## 4. Backend

### 4.1 `backend/src/services/icsFeedService.ts`

One module so the risky network path lives in exactly one place. Four units:

**`assertSafeFeedUrl(url): URL`** — the SSRF gate. Normalizes `webcal://` → `https://`; rejects any
scheme but https; DNS-resolves the host and rejects loopback, private (10/8, 172.16/12, 192.168/16),
link-local (169.254/16), CGNAT (100.64/10), and IPv6 equivalents. Throws a typed
`IcsFeedError('UNSAFE_URL')`.

**`fetchIcs(url): Promise<string>`** — 10 s timeout, 5 MB response cap, follows redirects only within
the same host (each hop re-checked by `assertSafeFeedUrl`). Typed failures, never a raw throw:
`UNREACHABLE`, `TOO_LARGE`, `TIMEOUT`.

**`parseIcs(text, { from, to }): IcsEvent[]`** — `ical.js`. Expands `RRULE` inside the window via
`ICAL.RecurExpansion`, honors `EXDATE`, drops `STATUS:CANCELLED`. Returns
`{ uid, title, location, start, end, allDay }[]`. RRULE expansion is the reason for the dependency: a
student's calendar is mostly weekly-recurring classes, and a parser that ignored RRULE would report
them free every week but the first.

**`busyIntervals(events, { includeAllDay }): Interval[]`** — merges overlapping ranges into a sorted
disjoint set. Skips `TRANSP:TRANSPARENT` (Google's "free" flag) and, unless `includeAllDay`, all-day
events.

Also in this module: a 5-minute in-memory busy-interval cache keyed by member id, and a small
in-memory limiter (10 outbound fetches per member per minute). No new rate-limit dependency — the
backend has none today and one endpoint family does not justify adding one.

### 4.2 `backend/src/services/slotConflicts.ts`

Pure, no I/O: `conflictingSlots(slotStarts, slotMinutes, busy): Set<string>`. A slot
`[start, start + slotMinutes)` conflicts if it overlaps any busy interval. Boundary contact is **not** a
conflict — a slot starting exactly when a class ends is free.

### 4.3 Routes

```
GET    /api/members/me/ics-feed              { connected, label, host, checkedAt, status }
PUT    /api/members/me/ics-feed              { url, label? } → validate + test-fetch → encrypt + store
DELETE /api/members/me/ics-feed
GET    /api/meeting-polls/:id/ics-conflicts  ?includeAllDay= → { slots: {start,busy}[], allDayHits, feedMissing }
POST   /api/events/import/preview            admin; { url } → IcsEvent[] + alreadyImported flag
POST   /api/events/import                    admin; { events: [...] } → creates Events with externalUid
```

`GET /api/members/me/ics-feed` returns the **host**, never the URL — the URL is a bearer secret and is
not echoed back even to its owner. Conflicts are computed server-side for the same reason: the feed URL
never reaches the browser at all.

All handlers read `req.memberId`, never `req.session` (CLAUDE.md convention).

`/api/members/me/ics-feed` must be registered **above** `GET /:id` in `members.ts`, like the existing
`cosmetic-styles` route.

---

## 5. Frontend

### 5.1 Toolbar

One `.pm-cal-toolbar` row replaces the split between the page header, the FAB, and CalendarView's
internal control row:

```
[ ‹  Today  › ]  September 2026        [ Day | Week | Month | Agenda ]        [ Import ▾ ] [ New Poll ] [ New Event ]
```

`cursor` and `viewMode` lift into `CalendarPage`; `CalendarView` becomes controlled via
`cursor` / `viewMode` / `onCursorChange` / `onViewModeChange` props. The fetch range widens to cover
what is actually painted — month view shows leading/trailing days from adjacent months, and agenda
spans three months. This is what fixes §1.1.

The floating FAB is removed: it duplicated New Event, and a `position: fixed` element floating over
page content is exactly the shape of the `SectionProgressRail` incident documented in CLAUDE.md.

### 5.2 Event detail modal

A real footer: **Delete** (admin only, ghost-danger) · **Edit** · **Close**. Delete uses a two-step
inline confirm — the row swaps to "Delete this event? [Cancel] [Delete]" — rather than
`window.confirm`. Optimistic removal from `events`, refetch on failure.

The same inline-confirm component replaces the `window.confirm` in `handleDeletePoll`.

### 5.3 Poll panel

The `pm-poll-strip` becomes a collapsible `.pm-poll-panel`, docked right at ≥1100 px and collapsing to a
one-line summary bar under the toolbar below that, so it stops shoving the grid down. Each card gets a
kebab menu with Open / Delete (organizer or admin), so deleting a poll no longer requires opening its
board first.

### 5.4 `CalendarImportModal.jsx` (admin)

URL field → **Preview** → checkbox table (date, title, location, "already imported" badge, per-row event
type defaulting to `OTHER`) → select-all → **Import N events**. Errors from `icsFeedService` map to
plain sentences ("That address didn't respond", "That doesn't look like a calendar feed").

### 5.5 Poll board conflicts

A "Use my calendar" button calls `/ics-conflicts`, shades conflicting slots, and shows a summary bar:

> 8 of 42 slots conflict with your calendar · **Select all free slots** · **Clear conflicts** · Dismiss

Nothing is submitted until the board's existing Save. The rendering mirrors the `suggestion` ghost
overlay already in `MeetingPollBoard.jsx` — same idiom, different source. With no feed configured, the
button renders an inline prompt linking to Profile → Integrations. Guests on `/schedule/:token` have no
member record and never see the button.

### 5.6 Profile → Integrations

`IcsFeedConnect.jsx`, beside the existing `GitHubConnectButton`: paste URL, save, then shows host +
last-checked + status + Remove, with a one-line hint — *Google Calendar → Settings for my calendars →
your calendar → Secret address in iCal format*.

---

## 6. CSS placement

Calendar-page-only rules (`.pm-cal-toolbar`, `.pm-cal-modal-*`, `.pm-ics-*`, `.pm-poll-panel*`) append to
**`clubpm-theme.css`**.

**Trap:** `MeetingPollBoard` also renders on the **public** `/schedule/:token` route, so any `.pm-poll-cell`
/ conflict-shading rule belongs in **`search-theme.css`** per the CSS conventions in CLAUDE.md — public
routes never fetch `clubpm-theme.css`. The conflict *feature* is member-only; its *CSS* is public-route CSS.

---

## 7. Tests

`backend/src/services/icsFeedService.test.ts`
- weekly `RRULE` expanded correctly inside a window (the core reason for `ical.js`)
- `EXDATE` removes an instance; `STATUS:CANCELLED` dropped
- `TRANSP:TRANSPARENT` not busy; all-day not busy unless `includeAllDay`
- overlapping intervals merge into one
- `assertSafeFeedUrl` rejects `http://`, `127.0.0.1`, `10.0.0.5`, `169.254.169.254`, and a redirect
  whose target resolves to a private address

`backend/src/services/slotConflicts.test.ts`
- a slot overlapping a busy block conflicts
- a slot starting exactly when a busy block ends does **not** conflict
- a slot fully containing a short busy block conflicts

Frontend keeps to the repo's existing minimal Jest coverage; no new component tests.

---

## 8. Privacy & security

- Feed URL encrypted at rest via `encryptSecret`, never returned to any client including its owner.
- Event titles are fetched for the conflict preview, shown only to the owning member, never persisted.
- Member feeds structurally cannot reach the club calendar: only the admin import path writes `Event` rows.
- The SSRF gate is the single control protecting an outbound fetch of user-supplied URLs, and is
  exercised by tests rather than by inspection.

---

## 9. Out of scope

- Recurring sync of the club feed (chosen one-shot; `externalUid` leaves the door open).
- Two-way sync / writing back to Google.
- Per-member Google OAuth.
- Importing attendees or RSVP state from an external feed.
