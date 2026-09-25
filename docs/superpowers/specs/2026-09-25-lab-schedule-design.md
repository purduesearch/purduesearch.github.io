# Lab Schedule — Design

Date: 2026-09-25
Status: Approved in brainstorming, awaiting spec review

## 1. Purpose

Research teams need people working in the lab during the week, and many members avoid working
alone. The Lab Schedule lets members publish when they plan to be in a lab or work space, see who
from their own team and other teams will be there, and ask for company. Admins define the spaces,
their requirements, and which projects use them. Calendar events can be held in a space.

Success criteria:

- A member can set a semester-long weekly pattern in one drag and never re-enter it weekly.
- Anyone logged in can see, for any space and week, who will be there and when.
- A member who is scheduled alone can ask for company, and teammates learn about it.
- Missing or expired required trainings are visible, but never block scheduling.

## 2. Decisions

| # | Decision |
|---|----------|
| D1 | Schedules are weekly recurring patterns plus one-off changes. Patterns end at the space's term end by default; members may choose an earlier end date. |
| D2 | Requirements are a **soft gate**. A space may require registry trainings (`Training`, satisfied by an approved, unexpired `TrainingCertificate`) and/or courses (satisfied by `CourseEnrollment.completedAt`). Unmet requirements show as warnings; the server never rejects a shift for them. |
| D3 | Members of projects assigned to a space may schedule in it. Admins may schedule in any space. Every logged-in member may view every space. |
| D4 | Solo blocks are highlighted. Members can flag a shift "looking for company". Teammates are notified of new buddy requests, and a buddy-requester is notified when someone schedules overlapping time. No Slack channel posts. |
| D5 | Capacity is optional and advisory: over-capacity blocks are highlighted, never rejected. |
| D6 | An event assigned to a space renders as its own band on that space's grid. Its attendees count toward headcount. It never blocks shifts. |
| D7 | Main view is a week grid with merged presence blocks (avatar stack, colour depth by headcount). |
| D8 | Editing reuses the meeting-poll board's rectangle marquee: drag a box across days and times, then confirm in a popover. Dragging from your own cells erases. |
| D9 | Storage is rules plus skips, expanded on read (not materialised occurrences, and not the `Event` model). |

## 3. Data Model (one Prisma migration)

```prisma
model Workspace {
  id            String    @id @default(cuid())
  name          String
  slug          String    @unique
  description   String?
  location      String?
  color         String    @default("#00e5cc")
  capacity      Int?                       // advisory only (D5)
  timezone      String    @default("America/New_York")
  openStartMin  Int       @default(480)    // grid start, minutes past local midnight
  openEndMin    Int       @default(1320)   // grid end
  defaultEndsOn DateTime? @db.Date         // term end; default end of new weekly shifts
  archivedAt    DateTime?                  // soft delete; shifts are kept
  createdById   String
  createdBy     Member    @relation("WorkspaceCreator", fields: [createdById], references: [id])
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  projects     WorkspaceProject[]
  requirements WorkspaceRequirement[]
  shifts       LabShift[]
  events       Event[]
}

model WorkspaceProject {
  workspaceId String
  workspace   Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  projectId   String
  project     Project   @relation(fields: [projectId], references: [id], onDelete: Cascade)
  @@id([workspaceId, projectId])
  @@index([projectId])
}

model WorkspaceRequirement {
  id          String    @id @default(cuid())
  workspaceId String
  workspace   Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  trainingId  String?   // exactly one of trainingId / courseId is set (service-enforced)
  training    Training? @relation(fields: [trainingId], references: [id])
  courseId    String?
  course      Course?   @relation(fields: [courseId], references: [id], onDelete: Cascade)
  @@unique([workspaceId, trainingId])
  @@unique([workspaceId, courseId])
}

model LabShift {
  id          String    @id @default(cuid())
  memberId    String
  member      Member    @relation("MemberLabShifts", fields: [memberId], references: [id], onDelete: Cascade)
  workspaceId String
  workspace   Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  weekday     Int                  // 0 = Sunday … 6 = Saturday, in the workspace timezone
  startMin    Int                  // local minutes, multiple of 30
  endMin      Int                  // exclusive, > startMin
  startsOn    DateTime  @db.Date   // first local date the shift applies
  endsOn      DateTime  @db.Date   // last local date; startsOn == endsOn means one-off
  buddyWanted Boolean   @default(false)
  note        String?
  skips       LabShiftSkip[]
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  @@index([workspaceId, startsOn, endsOn])
  @@index([memberId])
}

model LabShiftSkip {
  shiftId String
  shift   LabShift @relation(fields: [shiftId], references: [id], onDelete: Cascade)
  date    DateTime @db.Date
  @@id([shiftId, date])
}
```

Also:

- `Event.workspaceId String?` with `onDelete: SetNull`, plus `@@index([workspaceId])`.
- `NotificationType` gains `LAB_BUDDY_JOINED` and `LAB_BUDDY_WANTED`.
- Back-relations on `Member`, `Project`, `Training`, `Course`.

Why rules, not occurrences: a semester pattern is one row per weekday, term-end changes touch one
row, and "every week" edits need no bulk rewrite. All times are stored as local minutes and local
dates and expanded in the workspace timezone, so a 2 PM shift stays 2 PM across DST.

## 4. Backend

### 4.1 `services/labScheduleCore.ts` (pure, no Prisma)

- `expandShifts(shifts, skips, dates)` → occurrences (times are already local, so no timezone is needed here; `eventToBand(event, tz)` converts event instants) `{ shiftId, memberId, date, startMin, endMin, buddyWanted }` for the seven local dates from `weekStart`.
- `mergePresence(occurrences, events)` → per-day blocks: maximal intervals where the set of present people is constant, each with `{ startMin, endMin, memberIds, headcount, solo, buddyWanted }`. Event attendees are included in headcount; events are also returned as separate bands.
- `rectToShifts(rect, scope, defaultEndsOn)` → shift rows for an add. `scope: 'weekly'` → one row per selected weekday, `startsOn` = the first date in the rectangle for that weekday, `endsOn` = the chosen end date. `scope: 'dates'` → one one-off row per selected date.
- `planErase(existingShifts, rect, scope)` → `{ updates, creates, deletes, skips }`:
  - `weekly`: for each own shift on a selected weekday whose time range intersects the rectangle, starting from the first selected date: trim (`startMin`/`endMin` change), split (erase inside the block becomes two rows), or delete when fully covered. If the shift started before the first selected date, the old row is ended the day before and the trimmed remainder starts on that date, so past weeks stay intact.
  - `dates`: for each covered occurrence, add a `LabShiftSkip`; if the occurrence is only partly covered, also create one-off rows for the uncovered remainder.
- `intervalsOverlap(a, b)`.
- An `add` is **erase-then-insert** over the same rectangle and scope: your own time inside the rectangle is cleared first, then the new rows are written. Repeated drags never stack duplicates, and re-adding is how the buddy flag changes for a range. Adjacent rows are not merged; presence merging hides the seam.

### 4.2 `services/workspaceService.ts`

CRUD, archive, `setProjects(workspaceId, projectIds)`, `setRequirements(workspaceId, { trainingIds, courseIds })`,
`canSchedule(memberId, workspaceId, isAdmin)`, and
`requirementStatus(memberIds, workspaceId)` → per member, per requirement: `ok | missing | expired | pending`
(training status via the existing `trainingService.deriveStatus`; course status via `CourseEnrollment.completedAt`).

### 4.3 `services/labScheduleService.ts`

`getWeek(workspaceId, weekStart, viewerId)`, `applyRect(memberId, workspaceId, input)` (validates, runs
`planErase`/`rectToShifts` in one transaction, then fires notifications), `updateShift`, `deleteShift`,
`listBuddyRequests(memberId, projectId?)`.

### 4.4 Routes — `api/workspaces.ts`, mounted at `/api/workspaces`, all `requireAuth`

| Method | Path | Who | Purpose |
|--------|------|-----|---------|
| GET | `/` | any | Active spaces with assigned projects and requirements; `?projectId=` filters; `?includeArchived=1` for admins. |
| POST | `/` | admin | Create space. |
| PATCH | `/:id` | admin | Update space fields. |
| DELETE | `/:id` | admin | Archive (sets `archivedAt`). |
| PUT | `/:id/projects` | admin | Replace assigned project set. |
| PUT | `/:id/requirements` | admin | Replace requirement set. |
| GET | `/:id/week?start=YYYY-MM-DD` | any | `{ workspace, days, blocks, events, myShifts, members, requirementStatus, canSchedule }`. |
| POST | `/:id/shifts/apply` | assigned member or admin | `{ op: 'add'\|'erase', dates: string[], startMin, endMin, scope: 'weekly'\|'dates', endsOn?, buddyWanted? }`. |
| PATCH | `/shifts/:shiftId` | owner or admin | Edit `buddyWanted`, `note`, `endsOn`. |
| DELETE | `/shifts/:shiftId` | owner or admin | Delete a whole pattern. |
| GET | `/buddy-requests?projectId=` | any | Upcoming (next 14 days) buddy-wanted occurrences in spaces assigned to the viewer's projects. |

The router reads identity from `req.memberId` only. It registers `/buddy-requests` and `/shifts/*` above `/:id`.
Event create/update in `eventService` accepts `workspaceId`; it rejects archived or unknown spaces.

### 4.5 Validation (400 with a human message)

`startMin < endMin`; both multiples of 30; within `openStartMin..openEndMin`; `dates` non-empty, at most 7,
all within one week; `endsOn ≥` first date and ≤ one year out; space not archived. When the space has no term end and the member picks no date, weekly shifts end 16 weeks after the first selected date.
Unauthorised schedulers get 403.

## 5. Notifications

All go through `createNotification` with `slackText`, so each recipient's `notificationChannels` preference decides in-app vs Slack DM.

- **`LAB_BUDDY_JOINED`** — after an `add`, compute overlaps over the next 14 days between the new occurrences and other members' `buddyWanted` occurrences in the same space. One notification per recipient per apply-op, e.g. "Sam will join you in Propulsion Lab — Mon 3–5 PM (weekly)". Never sent to the actor.
- **`LAB_BUDDY_WANTED`** — when a shift is created with, or switched to, `buddyWanted`, notify members of the actor's own projects that are assigned to that space (excluding the actor). At most one per actor per space per rolling 24 hours (checked against recent `Notification` rows by `metadata.workspaceId`).
- No notification on erase. No new cron jobs.

## 6. Frontend

Notifications deep-link to `/clubpm/calendar?lab=<workspaceId>`, which opens the modal on that space.

### 6.1 Entry points

- **Calendar page** header: "Lab schedule" button (`fas fa-flask`) opens `LabScheduleModal` with all spaces.
- **Project page** header: "Lab time" button opens the modal limited to the project's spaces. An amber count badge shows teammates' open buddy requests for the next 14 days. Hidden when the project has no assigned spaces.
- Neither adds a `NAV_TABS` entry. Both get `data-tour-id` anchors (`calendar.lab`, `project.lab`) registered in `src/clubpm/tour/tourAnchors.js` and `docs/courses/ANCHORS.md` in the same commit.
- **`EventFormModal`**: optional "Workspace" select; picking one fills an empty `location` with the space's location. Events with a space show a coloured space chip in calendar views.
- **`AdminView`**: new "Workspaces" panel.

### 6.2 `LabScheduleModal`

Large `cpm-modal-overlay` on desktop; `MobileSheet variant="fullscreen"` on compact.

- **Header**: space pills (colour dot + name), week navigation (‹ Today ›), and an Everyone / Edit my time toggle. The toggle is replaced by "View only — ask an admin to assign this space to your project" when `canSchedule` is false.
- **Space strip**: description, location, capacity, and requirement chips showing the viewer's own status (ok / missing / expired / pending) with a link to the training or course.
- **Everyone view**: seven day columns (weekend columns collapse to a narrow rail when empty), hours from the space's open window. Merged presence blocks show an avatar stack and "N here"; background depth scales with headcount; solo blocks are amber; buddy-wanted blocks carry a "wants company" tag; event bands are violet with title and attendee count; blocks over capacity get a coral outline. Hover or tap opens a popover listing names, projects, requirement warnings, and event links.
- **Edit view**: 30-minute cells. Other people appear as dim heat shading; the viewer's time is solid teal. Rectangle marquee as in `MeetingPollBoard` (pointer events; touch via `elementFromPoint`). On release a popover (bottom sheet on compact) offers: Every week / Just these days; "Until" date (defaults to term end); Looking for company toggle; a live overlap preview ("Overlaps Sam (Mon), Riley (Wed)"); requirement warnings; Cancel / Add. A drag that starts on the viewer's own cell switches to erase and the popover offers Remove every week / Just this week.
- **Looking for company** list (side rail on desktop, section below the grid on compact): upcoming buddy requests in the viewer's spaces, each with a "Join" button that selects the matching rectangle in Edit view.
- **Empty state**: "No one scheduled here this week yet. Switch to Edit my time and drag to add yours."
- While a save is in flight the selection stays drawn in a "saving" state; the server returns the recomputed week, which replaces local state. On failure the selection clears and a toast shows the error. A `useRef` in-flight guard prevents double submit.

### 6.3 Admin "Workspaces" panel

List of spaces (colour, name, assigned projects, requirement count, archived state). Create/edit form: name, description, location, colour, capacity, timezone, open hours, term end, required trainings (from the training registry), required courses (published courses), assigned projects (multi-select). Archive with `ConfirmInline`.

### 6.4 Files

- `src/components/clubpm/labschedule/LabScheduleModal.jsx`, `LabWeekGrid.jsx`, `LabShiftPopover.jsx`, `LabSpaceHeader.jsx`, `BuddyRequestList.jsx`, `labScheduleUtils.js` (+ test)
- `src/components/clubpm/admin/WorkspaceAdminPanel.jsx`
- `src/hooks/useRectMarquee.js` — marquee logic extracted from `MeetingPollBoard.jsx`, which is refactored to use it with no behaviour change.
- `src/api/clubPmClient.js` — workspace and shift helpers.
- CSS appended to `public/clubpm-theme.css` with the `pm-lab-` prefix, including compact rules inside the existing compact `@media` block.

## 7. Edge Cases

- Archived space: hidden from pickers and the event form; its week view is read-only; shifts are retained.
- Deleted event or project: `SetNull` / cascade on the join row; nothing else changes.
- Member removed from a project: existing shifts stay visible; they can erase them but not add new ones (unless still eligible through another project).
- DST: expansion in the workspace timezone keeps local wall-clock times.
- A week before a shift's `startsOn` or after its `endsOn` shows nothing for it.

## 8. Testing

Backend (standalone `tsx` tests, no network):

- `labScheduleCore.test.ts`: expansion with skips, one-offs, date bounds, and a DST week; presence merging and headcount with events; `rectToShifts` for both scopes; `planErase` trim, split, delete, past-week preservation, and skip-plus-remainder; merge of adjacent own rows.
- `workspaceService.test.ts`: requirement status across training ok/missing/expired/pending and course completion.
- Route source test: `workspaces.ts` never reads `req.session`, and static routes are registered above `/:id`.

Frontend (Jest):

- `labScheduleUtils.test.js`: block positioning and week-date math.
- `useRectMarquee.test.js`: add and erase rectangles.
- `LabScheduleModal.test.jsx`: renders Everyone view from a fixture; Edit toggle hidden when `canSchedule` is false.
- Existing `MeetingPollBoard` behaviour unchanged after the hook extraction.

Gates after each phase: `npm run build` (root), `npm run typecheck` and `npm test` (backend), `node scripts/check-tour-anchors.js`.

## 9. Out of Scope

Hard gating on trainings, capacity enforcement, key-card or check-in integration, Slack channel posts, iCal export of lab shifts, and scheduled digests.
