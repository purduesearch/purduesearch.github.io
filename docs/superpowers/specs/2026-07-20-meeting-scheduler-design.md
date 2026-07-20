# When2Meet-style Meeting Scheduler for ClubPM — Design

**Date:** 2026-07-20
**Branch:** `feat/meeting-scheduler`
**Status:** Approved, implementing

## Summary

A when2meet-style availability polling system integrated into the ClubPM
subsystem. An organizer creates a **meeting poll** defining candidate date/time
slots; members and (optionally) guests submit their availability on a
click-drag grid; the organizer reads a live heatmap and **finalizes** a slot,
which produces a real `Event` on the existing club Calendar (poll and Event stay
linked). Integrates with the club's project/task linking, calendar, notification
(in-app + Slack DM), reward, and access-control systems.

## Key decisions (locked)

- **Participation:** Members + guest link. Members respond as themselves; guests
  respond by name — but **only** when the poll's audience is `ANYONE`. For
  `INVITED`/`PROJECT` polls, login is required and every response maps to a `Member`.
- **Access control:** Organizer chooses audience per poll: `INVITED` (invitee list),
  `PROJECT` (whole project team), or `ANYONE` (link-holders, guests allowed).
- **Finalize:** Both — create a real `Event` AND keep the poll linked to it for
  history / rescheduling.
- **Placement:** Calendar page only for management (create/list/finalize). The
  shareable respond page (`/schedule/:token`) is a separate standalone route
  because guests are unauthenticated.
- **Extras in scope:** reminder nudges to non-responders (cron), calendar export
  (.ics + Google Calendar URL), XP/doubloon reward for responding.
- **Extras out of scope:** days-of-week (recurring) poll mode. Specific-date polls only.
- **Who creates/manages:** any logged-in member can create a poll (they become the
  organizer). Only the organizer or an admin can edit/finalize/delete. Anyone who
  `canRespond` may view the heatmap.

## Data model (Prisma)

```prisma
enum MeetingPollStatus   { OPEN  FINALIZED  CANCELED }
enum MeetingPollAudience { INVITED  PROJECT  ANYONE }

model MeetingPoll {
  id               String   @id @default(cuid())
  publicToken      String   @unique @default(cuid())
  title            String
  description      String?
  timezone         String   @default("America/New_York")
  slotMinutes      Int      @default(30)
  slotStarts       DateTime[]            // canonical candidate slot starts (UTC)
  responseDeadline DateTime?             // soft: reminders + display only
  audience         MeetingPollAudience @default(INVITED)
  status           MeetingPollStatus   @default(OPEN)

  organizer     Member?  @relation("PollOrganizer", fields: [organizerId], references: [id], onDelete: SetNull)
  organizerId   String?
  project       Project? @relation(fields: [projectId], references: [id], onDelete: SetNull)
  projectId     String?
  priorityTasks Task[]   @relation("PollPriorityTasks")
  invitedMembers Member[] @relation("PollInvitees")

  finalStart  DateTime?
  finalEnd    DateTime?
  event       Event?    @relation("PollEvent", fields: [eventId], references: [id], onDelete: SetNull)
  eventId     String?   @unique

  reminderSentAt DateTime?
  responses      MeetingResponse[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([status])
  @@index([projectId])
}

model MeetingResponse {
  id        String   @id @default(cuid())
  poll      MeetingPoll @relation(fields: [pollId], references: [id], onDelete: Cascade)
  pollId    String
  member    Member?  @relation("MemberPollResponses", fields: [memberId], references: [id], onDelete: SetNull)
  memberId  String?
  guestName String?
  slots     DateTime[]              // subset of poll.slotStarts
  rewarded  Boolean  @default(false)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([pollId, memberId])
  @@index([pollId])
}
```

Additional schema changes:
- `RewardEventType.MEETING_AVAILABILITY_SUBMITTED`
- `NotificationType.MEETING_POLL_INVITE`, `MEETING_POLL_FINALIZED`, `MEETING_POLL_REMINDER`
- Back-relations on `Member` (`PollOrganizer`, `PollInvitees`, `MemberPollResponses`),
  `Project`, `Task` (`PollPriorityTasks`), and `Event` (`PollEvent`, `pollLink MeetingPoll?`).

**Rationale for `DateTime[]` slot storage:** aggregation is a flatten-and-count;
survives grid edits without index drift; matches repo's `String[]` array convention;
guest reuse mirrors `EventRsvp.guestName/guestEmail`. Store UTC, render in `poll.timezone`.

## Backend

### `pollService.ts` (pure, unit-tested core)
- `aggregate(poll, responses)` → `{ perSlot: { slotStartISO: responderRef[] }, bestSlots }`.
  Best slot = max available count, earliest-start tiebreak.
- `canRespond(poll, member?)` and `canManage(poll, member)` access rules.
- `finalize(pollId, { start, end })` → create/link `Event` (attendees = available members,
  carry over `project` + `priorityTasks`, `type=MEETING`), set `FINALIZED`.
- Reward-once helper for availability submission.

### `meetingPolls.ts` authed router — `/api/meeting-polls` (uses `req.memberId`)
```
GET   /                    list (projectId/status/mine)
POST  /                    create (organizer = req.memberId)
GET   /:id                 poll + heatmap + myResponse + {canRespond,canManage}
GET   /token/:token        same, by share token (logged-in members)
PATCH /:id                 organizer/admin
DELETE /:id                organizer/admin
PUT   /:id/response        upsert my availability { slots[] } → reward-once
GET   /:id/responses       organizer/admin: responded vs. not roster
POST  /:id/remind          organizer/admin: nudge non-responders now
POST  /:id/finalize        organizer/admin: { start,end } → Event + FINALIZED + notify
GET   /:id/ics             .ics for finalized Event
```

### Public (no-auth) additions to `public.ts` (reuse IP rate-limiter)
```
GET /public/polls/:token           safe fields + heatmap
PUT /public/polls/:token/response  guest upsert { guestName, slots } — only if audience=ANYONE
```

### Notifications / reminders / rewards / export
- Create-with-invitees & finalize → `createNotification()` + `queueDm(slackId, msg)`.
- Reminder cron in `scheduler.ts`: hourly; `OPEN` polls with `responseDeadline`
  within 24h and `reminderSentAt` null → DM invited non-responders; set `reminderSentAt`.
- Reward: first submission per member per poll → `rewardService` + `RewardEventConfig` row.
- `.ics` builder from `finalStart/finalEnd/title/description`; Google Calendar URL built client-side.

## Frontend

- **`CalendarPage.jsx`:** "New poll" button beside "New event"; an "Open polls" list panel.
  Finalized meetings already render as `Event`s on the grid.
- **`MeetingPollModal`** — create/edit: title, description, optional project + priority tasks,
  audience selector (+ invitee multiselect for INVITED), multi-date picker + daily time window
  + slot size, deadline, timezone.
- **`MeetingPollBoard`** — when2meet UI: left = your editable availability grid (click-drag paint);
  right = aggregate heatmap (shaded by count, hover shows available/unavailable names, best slot
  highlighted); organizer controls (Finalize, Remind, Copy link, Edit/Delete). Responsive stack.
- **Public respond page** — standalone route `/schedule/:token` outside the ClubPM protected shell.
  Logged-in members use authed endpoints; guests use public endpoints.
- **`clubPmClient.js`** — wrappers (authed + public + `pollIcsUrl`).

CSS appended to `public/search-theme.css` (ClubPM section), kebab-case, `pm-`/`cpm-` prefixes.

## Testing

Focused unit tests for pure logic: `aggregate`/best-slot, `canRespond`/`canManage`,
guest gating, reward-once idempotency, finalize→Event. UI verified via run/verify.

## Implementation phases (CLAUDE conventions: ≤50 tool calls, ≤4 files, no migration+frontend in one phase)

1. **Schema + migration** — Prisma models, enums, relations, reward/notification enum values; `prisma migrate`.
2. **`pollService.ts`** — CRUD + `aggregate`/best-slot + access rules + finalize + reward-once; unit tests.
3. **Authed routes** — `meetingPolls.ts`, mount in `app.ts`, notifications on create.
4. **Public/guest + finalize + ics** — `public.ts` additions, finalize→Event, `.ics` endpoint.
5. **Reminder cron** — `scheduler.ts`.
6. **Client** — `clubPmClient.js` wrappers.
7. **Frontend: modal + list** — `MeetingPollModal`, "Open polls" panel on `CalendarPage`.
8. **Frontend: poll board** — `MeetingPollBoard` grid/heatmap/finalize.
9. **Frontend: public page** — `/schedule/:token` standalone route in `App.js`.
10. **CSS + polish** — `search-theme.css`, calendar display integration.
11. **Tests + verification** — finalize gate green.

After each phase: `npm run build` (root) + `npx tsc --noEmit` (backend/). Fix all errors before continuing.
