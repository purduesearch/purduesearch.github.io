# Lab Schedule Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let members publish when they will be in a lab/work space, see who else will be there, and ask for company; let admins define spaces, requirements and project assignments; let calendar events be held in a space.

**Architecture:** Weekly shift *rules* (`LabShift`) plus per-date skips (`LabShiftSkip`) are stored in local wall-clock terms and expanded on read by a pure core module (`labScheduleCore.ts`). A thin service layer wraps Prisma, a new `/api/workspaces` router exposes it, and a React modal (`LabScheduleModal`) renders a week grid with poll-board-style rectangle drag editing.

**Tech Stack:** Prisma 6 / PostgreSQL, Express, TypeScript (backend, `tsx` standalone tests), React 19 + plain CSS (`public/clubpm-theme.css`), Jest + Testing Library (frontend).

**Spec:** `docs/superpowers/specs/2026-09-25-lab-schedule-design.md` (read it once; it is short).

**Branch:** `feat/lab-schedule` (already created; the spec is committed there).

---

## Locked decisions — do not re-litigate

1. Weekly patterns + one-off changes. Default end = space's `defaultEndsOn`; if unset or in the past, 16 weeks after the first selected day.
2. Requirements are a **soft gate**: warnings only, never a 4xx.
3. Members of projects assigned to a space may schedule there; admins anywhere; everyone may view.
4. `add` = erase-then-insert over the same rectangle. No row merging.
5. Buddy notifications: `LAB_BUDDY_JOINED` (to buddy-requesters you overlap, next 14 days) and `LAB_BUDDY_WANTED` (to your teammates on projects assigned to that space, max once per actor per space per 24 h). Both via `createNotification` with `slackText`. No crons, no channel posts.
6. Events can carry `workspaceId`; they render as a violet band and their attendees count toward headcount. They never block.
7. UI: week grid with merged presence blocks (Everyone) + 30-min cell grid with rectangle marquee (Edit my time), popover on release.
8. Tour anchors: `calendar.lab`, `project.lab`. No `NAV_TABS` change.
9. CSS prefix `pm-lab-`, appended to `public/clubpm-theme.css`.

## Guards for every phase

- **Never read these in full** — search with `rg` and read only the matching region: `public/clubpm-theme.css`, `public/search-theme.css`, `src/pages/ClubPM/ProjectDetail.jsx`, `src/pages/ClubPM/CalendarPage.jsx`, `backend/prisma/schema.prisma`, `backend/src/services/eventService.ts`, `src/api/clubPmClient.js`.
- Use the **Bash** tool (not PowerShell) for any command that redirects output to a file — PowerShell `>` writes UTF-16 and corrupts SQL.
- Read identity from `req.memberId`, never `req.session`.
- Icons: Font Awesome only. No emoji in JSX.
- Commit after every task with a Conventional Commit message ending in the `Co-Authored-By` trailer your harness gives you.

## Gate commands (run at the end of every phase)

```bash
cd backend && npm run typecheck && npm test        # backend
cd .. && npm run build                              # root (runs tour-anchor check too)
```

Frontend phases also run the phase's Jest files:

```bash
npm run test:ci -- <paths>
```

## Phase map

| Phase | Scope | Files |
|------|-------|-------|
| 1 | Prisma schema + migration + event `workspaceId` | `schema.prisma`, migration SQL, `eventService.ts`, `api/events.ts` |
| 2 | Pure core (`labScheduleCore.ts`) + tests | 2 new |
| 3 | `workspaceService.ts` + tests | 2 new |
| 4 | `labScheduleService.ts`, `api/workspaces.ts`, mount, route test | 3 new, `app.ts` |
| 5 | Frontend client + utils + marquee hook + tests | `clubPmClient.js`, 4 new |
| 6 | Grid, popover, avatar + CSS | 3 new, `clubpm-theme.css` |
| 7 | Modal, header, buddy list + test | 4 new |
| 8 | Entry points + tour anchors | `CalendarPage.jsx`, `ProjectDetail.jsx`, 1 new, `tourAnchors.js`, `ANCHORS.md` |
| 9 | Admin panel + event form workspace select | 1 new, `AdminView.jsx`, `EventFormModal.jsx` |
| 10 | Docs (AGENTS files) | 4 docs |
| 11 (optional) | Move `MeetingPollBoard` onto `useRectMarquee` | 1 file |

---

## Phase 1 — Schema, migration, event workspace link

### Task 1.1: Prisma models

**Files:**
- Modify: `backend/prisma/schema.prisma`

- [ ] **Step 1: Snapshot the current schema (needed for the migration diff)**

```bash
mkdir -p .superpowers && git show HEAD:backend/prisma/schema.prisma > .superpowers/schema.before.prisma
```

- [ ] **Step 2: Add the new enum values.** Find the enum with `rg -n "^enum NotificationType" backend/prisma/schema.prisma`. Add two lines directly after `TRAINING_EXPIRING`:

```prisma
  LAB_BUDDY_JOINED
  LAB_BUDDY_WANTED
```

- [ ] **Step 3: Add back-relations.**
  - In `model Member` (find `trainingsCreated      Training[]            @relation("TrainingCreator")`), add below it:
    ```prisma
      workspacesCreated     Workspace[]           @relation("WorkspaceCreator")
      labShifts             LabShift[]            @relation("MemberLabShifts")
    ```
  - In `model Project` (find `changeRequests   ChangeRequest[]` — the last line before the model's closing brace), add below it:
    ```prisma
      workspaces       WorkspaceProject[]
    ```
  - In `model Training` (find `certificates TrainingCertificate[]`), add below it:
    ```prisma
      workspaceRequirements WorkspaceRequirement[]
    ```
  - In `model Course` (find `enrollments CourseEnrollment[]` inside `model Course`), add below it:
    ```prisma
      workspaceRequirements WorkspaceRequirement[]
    ```
  - In `model Event`: after the `projectId String?` line add
    ```prisma
      // Lab schedule: the space this event is held in. Shows on that space's grid.
      workspace   Workspace? @relation(fields: [workspaceId], references: [id], onDelete: SetNull)
      workspaceId String?
    ```
    and add `@@index([workspaceId])` next to the other `@@index` lines of `model Event`.

- [ ] **Step 4: Append the new models** at the end of `schema.prisma`:

```prisma
// ── Lab schedule ─────────────────────────────────────────────
// A lab or work space members can say they will be in. Shifts are weekly
// rules in the space's local wall-clock time, expanded on read by
// services/labScheduleCore.ts. See docs/superpowers/specs/2026-09-25-lab-schedule-design.md.

model Workspace {
  id            String    @id @default(cuid())
  name          String
  slug          String    @unique
  description   String?
  location      String?
  color         String    @default("#00e5cc")
  /// Advisory only: over-capacity blocks are highlighted, never rejected.
  capacity      Int?
  timezone      String    @default("America/New_York")
  /// Grid window, minutes past local midnight, multiples of 30.
  openStartMin  Int       @default(480)
  openEndMin    Int       @default(1320)
  /// Term end: default end date of new weekly shifts.
  defaultEndsOn DateTime? @db.Date
  /// Soft delete. Shifts are kept.
  archivedAt    DateTime?
  createdById   String
  createdBy     Member    @relation("WorkspaceCreator", fields: [createdById], references: [id])
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  projects     WorkspaceProject[]
  requirements WorkspaceRequirement[]
  shifts       LabShift[]
  events       Event[]

  @@index([archivedAt])
}

model WorkspaceProject {
  workspaceId String
  workspace   Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  projectId   String
  project     Project   @relation(fields: [projectId], references: [id], onDelete: Cascade)

  @@id([workspaceId, projectId])
  @@index([projectId])
}

/// Exactly one of trainingId / courseId is set (enforced by workspaceService).
model WorkspaceRequirement {
  id          String    @id @default(cuid())
  workspaceId String
  workspace   Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  trainingId  String?
  training    Training? @relation(fields: [trainingId], references: [id])
  courseId    String?
  course      Course?   @relation(fields: [courseId], references: [id], onDelete: Cascade)

  @@unique([workspaceId, trainingId])
  @@unique([workspaceId, courseId])
}

model LabShift {
  id          String         @id @default(cuid())
  memberId    String
  member      Member         @relation("MemberLabShifts", fields: [memberId], references: [id], onDelete: Cascade)
  workspaceId String
  workspace   Workspace      @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  /// 0 = Sunday … 6 = Saturday, in the workspace timezone.
  weekday     Int
  /// Local minutes past midnight, multiples of 30; endMin is exclusive.
  startMin    Int
  endMin      Int
  /// First and last local dates the rule applies. Equal = one-off.
  startsOn    DateTime       @db.Date
  endsOn      DateTime       @db.Date
  buddyWanted Boolean        @default(false)
  note        String?
  skips       LabShiftSkip[]
  createdAt   DateTime       @default(now())
  updatedAt   DateTime       @updatedAt

  @@index([workspaceId, startsOn, endsOn])
  @@index([memberId])
}

/// "Not this week": one occurrence of a weekly LabShift is cancelled.
model LabShiftSkip {
  shiftId String
  shift   LabShift @relation(fields: [shiftId], references: [id], onDelete: Cascade)
  date    DateTime @db.Date

  @@id([shiftId, date])
}
```

- [ ] **Step 5: Validate and generate**

```bash
cd backend && npx prisma format && npx prisma validate && npx prisma generate
```
Expected: `The schema at prisma/schema.prisma is valid`, then `Generated Prisma Client`.

### Task 1.2: Migration SQL (no database needed)

**Files:**
- Create: `backend/prisma/migrations/20260925120000_lab_schedule/migration.sql`

- [ ] **Step 1: Generate the SQL from the schema diff (Bash tool)**

```bash
cd backend && mkdir -p prisma/migrations/20260925120000_lab_schedule && \
npx prisma migrate diff \
  --from-schema-datamodel ../.superpowers/schema.before.prisma \
  --to-schema-datamodel prisma/schema.prisma \
  --script > prisma/migrations/20260925120000_lab_schedule/migration.sql
```

- [ ] **Step 2: Check the SQL.** Run `rg -n "CREATE TABLE|ADD VALUE|ADD COLUMN|DROP" backend/prisma/migrations/20260925120000_lab_schedule/migration.sql`.
Expected: `ALTER TYPE "NotificationType" ADD VALUE 'LAB_BUDDY_JOINED'` and `'LAB_BUDDY_WANTED'`, `CREATE TABLE` for `Workspace`, `WorkspaceProject`, `WorkspaceRequirement`, `LabShift`, `LabShiftSkip`, `ALTER TABLE "Event" ADD COLUMN "workspaceId" TEXT`. **No `DROP` lines.** If any `DROP` appears, the snapshot in Task 1.1 Step 1 was taken after editing — redo it from `git show HEAD:`.
Confirm the file is UTF-8: `file backend/prisma/migrations/20260925120000_lab_schedule/migration.sql` must not say UTF-16.

- [ ] **Step 3: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/20260925120000_lab_schedule
git commit -m "feat(lab): workspace, lab shift and requirement models"
```

### Task 1.3: `workspaceId` on events

**Files:**
- Modify: `backend/src/services/eventService.ts`
- Modify: `backend/src/api/events.ts`

- [ ] **Step 1: Input types.** In `eventService.ts`, add `workspaceId?: string | null;` to both `interface CreateEventInput` and `interface UpdateEventInput` (after `projectId?: string;`), and to `interface SeriesBase` (after `projectId?: string | null;`).

- [ ] **Step 2: Include the workspace on every event read.** Find `const eventInclude` (`rg -n "project:   \{ select: \{ id: true, name: true \} \}," backend/src/services/eventService.ts`) and add below that line:

```ts
  workspace: { select: { id: true, name: true, color: true, location: true } },
```

- [ ] **Step 3: Create path.** In `createEvent`'s `prisma.event.create({ data: { … } })`, directly after the `...(data.projectId ? { project: … } : {}),` spread, add:

```ts
      ...(data.workspaceId
        ? { workspace: { connect: { id: data.workspaceId } } }
        : {}),
```

Add the identical spread (using `base.workspaceId`) in `spawnOccurrences` after its `...(base.projectId ? …)` spread.

- [ ] **Step 4: Every `spawnOccurrences({` call passes the workspace.** Run `rg -n "spawnOccurrences\(\{" backend/src/services/eventService.ts`. For each call site, find where it passes `projectId` (or spreads `...data`). If it spreads `...data`, nothing to do. Otherwise add `workspaceId: <same source>.workspaceId,` beside the `projectId` entry (e.g. `workspaceId: updated.workspaceId,`).

- [ ] **Step 5: Update path.** In `buildUpdateData`, after the `if (data.projectId !== undefined) { … }` block, add:

```ts
  if (data.workspaceId !== undefined) {
    updateData.workspace = data.workspaceId
      ? { connect: { id: data.workspaceId } }
      : { disconnect: true };
  }
```

In the series diff function (the block with `if (data.projectId !== undefined && norm(data.projectId) !== before.projectId) {`), add after that `if`:

```ts
  if (data.workspaceId !== undefined && norm(data.workspaceId) !== before.workspaceId) {
    out.workspace = updateData.workspace;
  }
```

- [ ] **Step 6: Route plumbing.** In `backend/src/api/events.ts`:
  - Make sure `import { prisma } from "../db/prisma.js";` is present (add it if not).
  - Add this helper below the imports:

```ts
// A lab-space link must point at a live workspace. Returns an error message or null.
async function checkWorkspace(workspaceId: string | null | undefined): Promise<string | null> {
  if (!workspaceId) return null;
  const ws = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { archivedAt: true } });
  return !ws || ws.archivedAt ? "Unknown or archived lab space" : null;
}
```

  - In the POST handler's destructure and its `req.body as { … }` type add `workspaceId` / `workspaceId?: string | null;`. Before `eventService.createEvent(`, add:

```ts
    const wsError = await checkWorkspace(workspaceId);
    if (wsError) { res.status(400).json({ error: wsError }); return; }
```

    and pass `workspaceId: workspaceId || undefined,` to `createEvent`.
  - In the PATCH handler do the same, passing `workspaceId: workspaceId === undefined ? undefined : (workspaceId || null),` to `updateEvent`.

- [ ] **Step 7: Gate**

```bash
cd backend && npm run typecheck && npm test
```
Expected: typecheck exits 0; test runner ends with every file passing.

- [ ] **Step 8: Commit**

```bash
git add backend/src/services/eventService.ts backend/src/api/events.ts
git commit -m "feat(lab): events can be held in a lab space"
```

---

## Phase 2 — Pure core

### Task 2.1: `labScheduleCore.ts` tests first

**Files:**
- Create: `backend/src/services/labScheduleCore.test.ts`

- [ ] **Step 1: Write the test file**

```ts
// Unit tests for labScheduleCore. No DB.
// Run: cd backend && npx tsx src/services/labScheduleCore.test.ts
import {
  addDays, weekdayOf, mondayOf, weekDates, isYmd, localDateMinutes,
  expandShifts, mergePresence, eventToBand, validateApply, rectToShifts, planErase,
  overlapsFor, formatRange, describeDrafts, describeOverlaps,
  type ShiftRow, type Occurrence,
} from "./labScheduleCore.js";

let passed = 0, failed = 0;
function check(name: string, cond: boolean) {
  if (cond) passed++; else { failed++; console.error(`  ✗ ${name}`); }
}
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

const MON = "2026-09-28";
const WEEK = weekDates(MON);
const TZ = "America/New_York";

console.log("date helpers");
{
  check("addDays across months", addDays("2026-09-28", 7) === "2026-10-05");
  check("addDays negative", addDays("2026-10-01", -1) === "2026-09-30");
  check("weekdayOf Monday", weekdayOf(MON) === 1);
  check("mondayOf Sunday goes back", mondayOf("2026-10-04") === MON);
  check("mondayOf Monday is itself", mondayOf(MON) === MON);
  check("weekDates has 7 days ending Sunday", WEEK.length === 7 && WEEK[6] === "2026-10-04");
  check("isYmd accepts a date", isYmd("2026-09-28"));
  check("isYmd rejects junk", !isYmd("2026-9-28") && !isYmd(42) && !isYmd("2026-13-40"));
  check("localDateMinutes EDT", eq(localDateMinutes(new Date("2026-09-28T18:00:00Z"), TZ), { date: MON, minutes: 840 }));
  check("localDateMinutes EST after DST", eq(localDateMinutes(new Date("2026-11-02T19:00:00Z"), TZ), { date: "2026-11-02", minutes: 840 }));
}

const shift = (over: Partial<ShiftRow>): ShiftRow => ({
  id: "s1", memberId: "A", weekday: 1, startMin: 840, endMin: 1020,
  startsOn: "2026-09-14", endsOn: "2026-12-13", buddyWanted: false, ...over,
});

console.log("expandShifts");
{
  const weekly = shift({});
  check("weekly rule appears on its weekday", eq(expandShifts([weekly], [], WEEK).map(o => o.date), [MON]));
  check("skip removes the occurrence", expandShifts([weekly], [{ shiftId: "s1", date: MON }], WEEK).length === 0);
  const oneOff = shift({ id: "o1", weekday: 3, startsOn: "2026-09-30", endsOn: "2026-09-30" });
  check("one-off inside the week appears", expandShifts([oneOff], [], WEEK).length === 1);
  check("one-off next week does not", expandShifts([shift({ id: "o2", weekday: 3, startsOn: "2026-10-07", endsOn: "2026-10-07" })], [], WEEK).length === 0);
  check("rule starting later does not", expandShifts([shift({ startsOn: "2026-10-05" })], [], WEEK).length === 0);
  check("rule ended earlier does not", expandShifts([shift({ endsOn: "2026-09-27" })], [], WEEK).length === 0);
}

const occ = (memberId: string, startMin: number, endMin: number, buddyWanted = false, date = MON): Occurrence =>
  ({ shiftId: `x-${memberId}-${startMin}`, memberId, date, startMin, endMin, buddyWanted });

console.log("mergePresence");
{
  const blocks = mergePresence(MON, [occ("A", 840, 1020, true), occ("B", 900, 1080)], []);
  check("three segments", blocks.length === 3);
  check("first is A alone", eq(blocks[0].memberIds, ["A"]) && blocks[0].solo && blocks[0].startMin === 840 && blocks[0].endMin === 900);
  check("middle has both", eq(blocks[1].memberIds, ["A", "B"]) && blocks[1].headcount === 2 && !blocks[1].solo);
  check("buddy flag carried", eq(blocks[1].buddyMemberIds, ["A"]));
  check("last is B alone", eq(blocks[2].memberIds, ["B"]) && blocks[2].endMin === 1080);

  const adjacent = mergePresence(MON, [occ("A", 840, 900), occ("A", 900, 960)], []);
  check("adjacent identical segments merge", adjacent.length === 1 && adjacent[0].endMin === 960);

  const withEvent = mergePresence(MON, [occ("A", 840, 1020)], [
    { eventId: "e1", title: "Run experiment", date: MON, startMin: 960, endMin: 1020, attendeeIds: ["C"] },
  ]);
  check("event splits the block", withEvent.length === 2);
  check("event attendees count", eq(withEvent[1].memberIds, ["A", "C"]) && eq(withEvent[1].eventIds, ["e1"]));
  check("other dates ignored", mergePresence("2026-09-29", [occ("A", 840, 1020)], []).length === 0);
}

console.log("eventToBand");
{
  const ev = (startTime: string, endTime: string | null) =>
    eventToBand({ id: "e", title: "T", startTime: new Date(startTime), endTime: endTime ? new Date(endTime) : null, attendeeIds: [] }, TZ);
  const b = ev("2026-09-30T18:00:00Z", "2026-09-30T20:00:00Z");
  check("band local times", b.date === "2026-09-30" && b.startMin === 840 && b.endMin === 960);
  check("no end means one hour", ev("2026-09-30T18:00:00Z", null).endMin === 900);
  check("past midnight clips to end of day", ev("2026-09-30T18:00:00Z", "2026-10-01T05:00:00Z").endMin === 1440);
}

console.log("validateApply");
{
  const ws = { openStartMin: 480, openEndMin: 1320, defaultEndsOn: "2026-12-13" as string | null };
  const today = "2026-09-25";
  const base = { op: "add", scope: "weekly", dates: ["2026-09-30", MON], startMin: 840, endMin: 1020 };
  const ok = validateApply(base, ws, today);
  check("valid weekly add", ok.ok && eq(ok.value.dates, [MON, "2026-09-30"]) && ok.value.endsOn === "2026-12-13" && ok.value.buddyWanted === false);
  const noTerm = validateApply(base, { ...ws, defaultEndsOn: null }, today);
  check("no term end → 16 weeks", noTerm.ok && noTerm.value.endsOn === "2027-01-18");
  const pastTerm = validateApply(base, { ...ws, defaultEndsOn: "2026-09-01" }, today);
  check("past term end → 16 weeks", pastTerm.ok && pastTerm.value.endsOn === "2027-01-18");
  const erase = validateApply({ ...base, op: "erase" }, ws, today);
  check("erase has no endsOn", erase.ok && erase.value.endsOn === null);
  const bad = (body: Record<string, unknown>) => !validateApply({ ...base, ...body }, ws, today).ok;
  check("rejects bad op", bad({ op: "nope" }));
  check("rejects bad scope", bad({ scope: "monthly" }));
  check("rejects off-grid time", bad({ startMin: 845 }));
  check("rejects start after end", bad({ startMin: 1020, endMin: 840 }));
  check("rejects outside open hours", bad({ startMin: 420 }));
  check("rejects two weeks", bad({ dates: ["2026-09-27", MON] }));
  check("rejects more than 7 days", bad({ dates: [...WEEK, "2026-10-05"] }));
  check("rejects no days", bad({ dates: [] }));
  check("rejects endsOn before start", bad({ endsOn: "2026-09-01" }));
  check("rejects endsOn > 1 year", bad({ endsOn: "2027-12-01" }));
  const buddy = validateApply({ ...base, buddyWanted: true }, ws, today);
  check("buddy flag parsed", buddy.ok && buddy.value.buddyWanted);
}

console.log("rectToShifts");
{
  const input = { op: "add" as const, scope: "weekly" as const, dates: [MON, "2026-09-29"], startMin: 840, endMin: 1020, endsOn: "2026-12-13", buddyWanted: true };
  const weekly = rectToShifts(input);
  check("one weekly row per day", weekly.length === 2 && weekly[0].weekday === 1 && weekly[1].weekday === 2);
  check("weekly rows run to endsOn", weekly.every(d => d.endsOn === "2026-12-13") && weekly[1].startsOn === "2026-09-29");
  check("buddy flag copied", weekly.every(d => d.buddyWanted));
  const dates = rectToShifts({ ...input, scope: "dates", endsOn: null });
  check("dates scope makes one-offs", dates.every(d => d.startsOn === d.endsOn));
  check("days after endsOn are dropped", rectToShifts({ ...input, endsOn: MON }).length === 1);
}

console.log("planErase");
{
  const s1 = shift({});
  const mid = { dates: [MON], startMin: 900, endMin: 960 };

  const a = planErase([s1], [], { ...mid, scope: "weekly" });
  check("weekly erase ends the old rule the day before", eq(a.updates, [{ id: "s1", data: { endsOn: "2026-09-27" } }]));
  check("weekly erase recreates both remaining pieces from that day", a.creates.length === 2
    && a.creates[0].startMin === 840 && a.creates[0].endMin === 900 && a.creates[0].startsOn === MON && a.creates[0].endsOn === "2026-12-13"
    && a.creates[1].startMin === 960 && a.creates[1].endMin === 1020);

  const s2 = shift({ id: "s2", startsOn: MON });
  check("full weekly erase deletes a rule starting that day",
    eq(planErase([s2], [], { dates: [MON], startMin: 840, endMin: 1020, scope: "weekly" }).deletes, ["s2"]));
  const trim = planErase([s2], [], { dates: [MON], startMin: 840, endMin: 900, scope: "weekly" });
  check("trim moves the start", eq(trim.updates, [{ id: "s2", data: { startMin: 900, endMin: 1020 } }]) && trim.creates.length === 0);
  const split = planErase([s2], [], { ...mid, scope: "weekly" });
  check("split keeps the first piece and creates the second",
    eq(split.updates, [{ id: "s2", data: { startMin: 840, endMin: 900 } }]) && split.creates.length === 1 && split.creates[0].startMin === 960);

  const e = planErase([s1], [], { ...mid, scope: "dates" });
  check("dates erase skips the occurrence", eq(e.skips, [{ shiftId: "s1", date: MON }]));
  check("dates erase keeps the remainder as one-offs", e.creates.length === 2 && e.creates.every(c => c.startsOn === MON && c.endsOn === MON));
  check("dates erase leaves the rule alone", e.updates.length === 0 && e.deletes.length === 0);

  const o = shift({ id: "o", weekday: 3, startsOn: "2026-09-30", endsOn: "2026-09-30" });
  check("dates erase deletes a covered one-off",
    eq(planErase([o], [], { dates: ["2026-09-30"], startMin: 840, endMin: 1020, scope: "dates" }).deletes, ["o"]));

  const none = planErase([s1], [], { dates: [MON], startMin: 480, endMin: 600, scope: "weekly" });
  check("non-overlapping erase is empty", none.updates.length + none.creates.length + none.deletes.length + none.skips.length === 0);
  const later = planErase([shift({ startsOn: "2026-10-05" })], [], { ...mid, scope: "dates" });
  check("dates erase ignores a rule that has not started", later.skips.length === 0 && later.creates.length === 0);
  const already = planErase([s1], [{ shiftId: "s1", date: MON }], { ...mid, scope: "dates" });
  check("dates erase ignores an already-skipped day", already.skips.length === 0 && already.creates.length === 0);
}

console.log("overlapsFor");
{
  const mine = [occ("A", 840, 1020)];
  const hits = overlapsFor(mine, [occ("B", 900, 1080), occ("C", 1020, 1080), occ("A", 840, 900)]);
  check("B overlaps 900–1020", eq(hits.get("B"), [{ date: MON, startMin: 900, endMin: 1020 }]));
  check("touching end is not overlap", !hits.has("C"));
  check("self excluded", !hits.has("A"));
}

console.log("formatting");
{
  check("same meridiem", formatRange(840, 1020) === "2:00–5:00 PM");
  check("cross meridiem", formatRange(660, 780) === "11:00 AM–1:00 PM");
  const weekly = { weekday: 1, startMin: 840, endMin: 1020, startsOn: MON, endsOn: "2026-12-13", buddyWanted: false };
  check("weekly description", describeDrafts([weekly]) === "Mondays 2:00–5:00 PM");
  check("one-off description", describeDrafts([{ ...weekly, endsOn: MON }]) === "Mon Sep 28, 2:00–5:00 PM");
  check("more count", describeDrafts([weekly, { ...weekly, weekday: 2, startsOn: "2026-09-29" }]) === "Mondays 2:00–5:00 PM (+1 more)");
  check("overlap description", describeOverlaps([{ date: MON, startMin: 900, endMin: 1020 }]) === "Mon Sep 28, 3:00–5:00 PM");
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
```

- [ ] **Step 2: Run it — expect failure**

Run: `cd backend && npx tsx src/services/labScheduleCore.test.ts`
Expected: FAIL — `Cannot find module './labScheduleCore.js'`.

### Task 2.2: `labScheduleCore.ts`

**Files:**
- Create: `backend/src/services/labScheduleCore.ts`

- [ ] **Step 1: Write the module**

```ts
/**
 * Lab schedule — pure logic. No Prisma, no clock reads.
 *
 * Shifts are stored as weekly rules in the workspace's LOCAL wall-clock time:
 * a weekday, start/end minutes past local midnight, and a local date range.
 * Because nothing here is a UTC instant, expansion needs no timezone and a
 * 2 PM shift stays 2 PM across DST. Only calendar events (real instants) are
 * converted, in eventToBand().
 *
 * Dates are "YYYY-MM-DD" strings throughout. They compare correctly as strings.
 */

export type Ymd = string;
export const SLOT_MINUTES = 30;
export const DAY_MINUTES = 1440;
/** Weekly shifts end this many weeks out when the space has no term end. */
export const DEFAULT_WEEKS = 16;

export interface ShiftDraft {
  weekday: number;
  startMin: number;
  endMin: number;
  startsOn: Ymd;
  endsOn: Ymd;
  buddyWanted: boolean;
}
export interface ShiftRow extends ShiftDraft { id: string; memberId: string; }
export interface SkipRow { shiftId: string; date: Ymd; }
export interface Occurrence {
  shiftId: string; memberId: string; date: Ymd;
  startMin: number; endMin: number; buddyWanted: boolean;
}
export interface EventBand {
  eventId: string; title: string; date: Ymd;
  startMin: number; endMin: number; attendeeIds: string[];
}
export interface PresenceBlock {
  date: Ymd; startMin: number; endMin: number;
  memberIds: string[]; headcount: number; solo: boolean;
  buddyMemberIds: string[]; eventIds: string[];
}
export interface Interval { date: Ymd; startMin: number; endMin: number; }

// ── Dates ────────────────────────────────────────────────────

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;
const noon = (ymd: Ymd) => new Date(`${ymd}T12:00:00Z`);

export function isYmd(v: unknown): v is Ymd {
  if (typeof v !== "string" || !YMD_RE.test(v)) return false;
  const d = noon(v);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}
export function addDays(ymd: Ymd, n: number): Ymd {
  const d = noon(ymd);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function weekdayOf(ymd: Ymd): number { return noon(ymd).getUTCDay(); }
export function mondayOf(ymd: Ymd): Ymd { return addDays(ymd, -((weekdayOf(ymd) + 6) % 7)); }
export function weekDates(monday: Ymd): Ymd[] { return Array.from({ length: 7 }, (_, i) => addDays(monday, i)); }
/** Prisma @db.Date columns round-trip as UTC midnight. */
export function toDbDate(ymd: Ymd): Date { return new Date(`${ymd}T00:00:00Z`); }
export function fromDbDate(d: Date): Ymd { return d.toISOString().slice(0, 10); }

export function localDateMinutes(instant: Date, timeZone: string): { date: Ymd; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).formatToParts(instant);
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? "00";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, minutes: Number(get("hour")) * 60 + Number(get("minute")) };
}
export function todayIn(timeZone: string, now: Date = new Date()): Ymd {
  return localDateMinutes(now, timeZone).date;
}

// ── Expansion + presence ─────────────────────────────────────

export function expandShifts(shifts: ShiftRow[], skips: SkipRow[], dates: Ymd[]): Occurrence[] {
  const skipped = new Set(skips.map(s => `${s.shiftId}|${s.date}`));
  const out: Occurrence[] = [];
  for (const date of dates) {
    const wd = weekdayOf(date);
    for (const s of shifts) {
      if (s.weekday !== wd || s.startsOn > date || s.endsOn < date) continue;
      if (skipped.has(`${s.id}|${date}`)) continue;
      out.push({ shiftId: s.id, memberId: s.memberId, date, startMin: s.startMin, endMin: s.endMin, buddyWanted: s.buddyWanted });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.startMin - b.startMin);
}

export function eventToBand(
  ev: { id: string; title: string; startTime: Date; endTime: Date | null; attendeeIds: string[] },
  timeZone: string,
): EventBand {
  const start = localDateMinutes(ev.startTime, timeZone);
  let endMin: number;
  if (!ev.endTime) endMin = Math.min(DAY_MINUTES, start.minutes + 60);
  else {
    const end = localDateMinutes(ev.endTime, timeZone);
    endMin = end.date === start.date ? end.minutes : DAY_MINUTES;
  }
  if (endMin <= start.minutes) endMin = Math.min(DAY_MINUTES, start.minutes + SLOT_MINUTES);
  return { eventId: ev.id, title: ev.title, date: start.date, startMin: start.minutes, endMin, attendeeIds: ev.attendeeIds };
}

const blockKey = (b: PresenceBlock) => `${b.memberIds.join(",")}|${b.buddyMemberIds.join(",")}|${b.eventIds.join(",")}`;

/** Maximal intervals on one date during which the set of people present is constant. */
export function mergePresence(date: Ymd, occurrences: Occurrence[], bands: EventBand[]): PresenceBlock[] {
  const occ = occurrences.filter(o => o.date === date);
  const evs = bands.filter(b => b.date === date);
  const cuts = new Set<number>();
  for (const x of [...occ, ...evs]) { cuts.add(x.startMin); cuts.add(x.endMin); }
  const points = [...cuts].sort((a, b) => a - b);

  const out: PresenceBlock[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    const members = new Set<string>(), buddies = new Set<string>(), events = new Set<string>();
    for (const o of occ) {
      if (o.startMin <= a && o.endMin >= b) { members.add(o.memberId); if (o.buddyWanted) buddies.add(o.memberId); }
    }
    for (const e of evs) {
      if (e.startMin <= a && e.endMin >= b) { events.add(e.eventId); for (const id of e.attendeeIds) members.add(id); }
    }
    if (members.size === 0 && events.size === 0) continue;
    const block: PresenceBlock = {
      date, startMin: a, endMin: b,
      memberIds: [...members].sort(), headcount: members.size, solo: members.size === 1,
      buddyMemberIds: [...buddies].sort(), eventIds: [...events].sort(),
    };
    const prev = out[out.length - 1];
    if (prev && prev.endMin === a && blockKey(prev) === blockKey(block)) prev.endMin = b;
    else out.push(block);
  }
  return out;
}

// ── Apply (add / erase a rectangle) ──────────────────────────

export type ApplyOp = "add" | "erase";
export type ApplyScope = "weekly" | "dates";
export interface ApplyInput {
  op: ApplyOp; scope: ApplyScope; dates: Ymd[];
  startMin: number; endMin: number;
  /** Only for weekly adds; null otherwise. */
  endsOn: Ymd | null;
  buddyWanted: boolean;
}
export interface OpenHours { openStartMin: number; openEndMin: number; defaultEndsOn: Ymd | null; }

export function validateApply(body: unknown, ws: OpenHours, today: Ymd):
  { ok: true; value: ApplyInput } | { ok: false; error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const fail = (error: string) => ({ ok: false as const, error });

  if (b.op !== "add" && b.op !== "erase") return fail('op must be "add" or "erase".');
  if (b.scope !== "weekly" && b.scope !== "dates") return fail('scope must be "weekly" or "dates".');
  if (!Array.isArray(b.dates) || b.dates.length === 0) return fail("Select at least one day.");
  if (!b.dates.every(isYmd)) return fail("Dates must be YYYY-MM-DD.");
  const dates = [...new Set(b.dates as Ymd[])].sort();
  if (dates.length > 7) return fail("Select at most one week of days.");
  if (new Set(dates.map(mondayOf)).size !== 1) return fail("Select days from a single week.");

  const startMin = b.startMin, endMin = b.endMin;
  if (!Number.isInteger(startMin) || !Number.isInteger(endMin)) return fail("Times must be whole minutes.");
  const s = startMin as number, e = endMin as number;
  if (s % SLOT_MINUTES !== 0 || e % SLOT_MINUTES !== 0) return fail("Times must be on the half hour.");
  if (s >= e) return fail("End time must be after start time.");
  if (s < ws.openStartMin || e > ws.openEndMin) return fail(`This space is open ${formatRange(ws.openStartMin, ws.openEndMin)}.`);

  let endsOn: Ymd | null = null;
  if (b.op === "add" && b.scope === "weekly") {
    if (b.endsOn != null && b.endsOn !== "") {
      if (!isYmd(b.endsOn)) return fail("Until date must be YYYY-MM-DD.");
      endsOn = b.endsOn;
    } else {
      endsOn = ws.defaultEndsOn && ws.defaultEndsOn >= dates[0] ? ws.defaultEndsOn : addDays(dates[0], DEFAULT_WEEKS * 7);
    }
    if (endsOn < dates[0]) return fail("Until date must be on or after the first selected day.");
    if (endsOn > addDays(today, 366)) return fail("Until date can be at most a year away.");
  }

  return { ok: true, value: { op: b.op, scope: b.scope, dates, startMin: s, endMin: e, endsOn, buddyWanted: b.buddyWanted === true } };
}

export function rectToShifts(v: ApplyInput): ShiftDraft[] {
  return v.dates
    .map(d => ({
      weekday: weekdayOf(d), startMin: v.startMin, endMin: v.endMin,
      startsOn: d, endsOn: v.scope === "weekly" && v.endsOn ? v.endsOn : d,
      buddyWanted: v.buddyWanted,
    }))
    .filter(d => d.endsOn >= d.startsOn);
}

export interface ErasePlan {
  deletes: string[];
  updates: { id: string; data: Partial<ShiftDraft> }[];
  creates: ShiftDraft[];
  skips: SkipRow[];
}

/** [s0,e0) minus [s1,e1): zero, one or two pieces. */
function subtract(s0: number, e0: number, s1: number, e1: number): [number, number][] {
  const out: [number, number][] = [];
  if (s1 > s0) out.push([s0, Math.min(e0, s1)]);
  if (e1 < e0) out.push([Math.max(s0, e1), e0]);
  return out.filter(([a, b]) => b > a);
}

/**
 * How to remove the rectangle from one member's own shifts.
 * weekly: from each selected date onward (earlier weeks keep their history).
 * dates:  only those dates — recurring rules get a skip plus one-off remainders.
 */
export function planErase(
  own: ShiftRow[], skips: SkipRow[],
  rect: { dates: Ymd[]; startMin: number; endMin: number; scope: ApplyScope },
): ErasePlan {
  const plan: ErasePlan = { deletes: [], updates: [], creates: [], skips: [] };
  const skipped = new Set(skips.map(s => `${s.shiftId}|${s.date}`));

  for (const d of [...rect.dates].sort()) {
    const wd = weekdayOf(d);
    for (const s of own) {
      if (s.weekday !== wd || s.endsOn < d) continue;
      if (rect.scope === "dates" && s.startsOn > d) continue;
      if (s.startMin >= rect.endMin || s.endMin <= rect.startMin) continue;

      const rest = subtract(s.startMin, s.endMin, rect.startMin, rect.endMin);
      const piece = ([a, b]: [number, number], startsOn: Ymd, endsOn: Ymd): ShiftDraft =>
        ({ weekday: s.weekday, startMin: a, endMin: b, startsOn, endsOn, buddyWanted: s.buddyWanted });
      const oneOff = s.startsOn === s.endsOn;

      if (rect.scope === "dates" && !oneOff) {
        if (skipped.has(`${s.id}|${d}`)) continue;
        plan.skips.push({ shiftId: s.id, date: d });
        for (const p of rest) plan.creates.push(piece(p, d, d));
        continue;
      }
      if (s.startsOn < d) {
        plan.updates.push({ id: s.id, data: { endsOn: addDays(d, -1) } });
        for (const p of rest) plan.creates.push(piece(p, d, s.endsOn));
      } else if (rest.length === 0) {
        plan.deletes.push(s.id);
      } else {
        plan.updates.push({ id: s.id, data: { startMin: rest[0][0], endMin: rest[0][1] } });
        if (rest[1]) plan.creates.push(piece(rest[1], s.startsOn, s.endsOn));
      }
    }
  }
  return plan;
}

/** Per other member: the intervals where their occurrences overlap mine. */
export function overlapsFor(mine: Occurrence[], others: Occurrence[]): Map<string, Interval[]> {
  const out = new Map<string, Interval[]>();
  for (const o of others) {
    for (const m of mine) {
      if (o.memberId === m.memberId || o.date !== m.date) continue;
      const lo = Math.max(o.startMin, m.startMin), hi = Math.min(o.endMin, m.endMin);
      if (lo >= hi) continue;
      const list = out.get(o.memberId) ?? [];
      list.push({ date: o.date, startMin: lo, endMin: hi });
      out.set(o.memberId, list);
    }
  }
  return out;
}

// ── Formatting (notification text) ───────────────────────────

const WEEKDAY_PLURAL = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"];
const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatMinutes(min: number): string {
  const m = ((min % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
  const h24 = Math.floor(m / 60);
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m % 60).padStart(2, "0")} ${h24 < 12 ? "AM" : "PM"}`;
}
export function formatRange(startMin: number, endMin: number): string {
  const [at, am] = formatMinutes(startMin).split(" ");
  const [bt, bm] = formatMinutes(endMin).split(" ");
  return am === bm ? `${at}–${bt} ${bm}` : `${at} ${am}–${bt} ${bm}`;
}
export function formatDate(ymd: Ymd): string {
  const d = noon(ymd);
  return `${WEEKDAY_SHORT[d.getUTCDay()]} ${MONTH_SHORT[d.getUTCMonth()]} ${d.getUTCDate()}`;
}
export function describeDrafts(drafts: ShiftDraft[]): string {
  if (drafts.length === 0) return "";
  const first = [...drafts].sort((a, b) => a.startsOn.localeCompare(b.startsOn) || a.startMin - b.startMin)[0];
  const range = formatRange(first.startMin, first.endMin);
  const head = first.startsOn === first.endsOn ? `${formatDate(first.startsOn)}, ${range}` : `${WEEKDAY_PLURAL[first.weekday]} ${range}`;
  return drafts.length > 1 ? `${head} (+${drafts.length - 1} more)` : head;
}
export function describeOverlaps(list: Interval[]): string {
  if (list.length === 0) return "";
  const first = [...list].sort((a, b) => a.date.localeCompare(b.date) || a.startMin - b.startMin)[0];
  const head = `${formatDate(first.date)}, ${formatRange(first.startMin, first.endMin)}`;
  return list.length > 1 ? `${head} (+${list.length - 1} more)` : head;
}
```

- [ ] **Step 2: Run the test — expect pass**

Run: `cd backend && npx tsx src/services/labScheduleCore.test.ts`
Expected: last line `N passed, 0 failed`.

- [ ] **Step 3: Gate + commit**

```bash
cd backend && npm run typecheck && npm test
git add backend/src/services/labScheduleCore.ts backend/src/services/labScheduleCore.test.ts
git commit -m "feat(lab): pure shift expansion, presence merge and erase planning"
```

---

## Phase 3 — Workspace service

### Task 3.1: Tests first

**Files:**
- Create: `backend/src/services/workspaceService.test.ts`

- [ ] **Step 1: Confirm field names you rely on**

Run: `rg -n "^model TrainingCertificate" -A40 backend/prisma/schema.prisma | rg "status|expiresOn|createdAt|trainingId|memberId"` and `rg -n "^model CourseEnrollment" -A12 backend/prisma/schema.prisma | rg "completedAt|courseId|memberId"`. All must exist.

- [ ] **Step 2: Write the test**

```ts
// Unit tests for workspaceService's pure helpers. No DB.
// Run: cd backend && npx tsx src/services/workspaceService.test.ts
import { trainingState, courseState, sanitizeWorkspaceInput, slugify } from "./workspaceService.js";

let passed = 0, failed = 0;
function check(name: string, cond: boolean) {
  if (cond) passed++; else { failed++; console.error(`  ✗ ${name}`); }
}

const now = new Date("2026-09-25T12:00:00Z");
const cert = (status: "PENDING" | "APPROVED" | "REJECTED", expiresOn: string | null) =>
  ({ status, expiresOn: expiresOn ? new Date(expiresOn) : null, createdAt: new Date("2026-01-01T00:00:00Z") });

console.log("requirement states");
{
  check("no certificate → missing", trainingState([], now) === "missing");
  check("approved, no expiry → ok", trainingState([cert("APPROVED", null)], now) === "ok");
  check("approved, expired → expired", trainingState([cert("APPROVED", "2026-01-01T00:00:00Z")], now) === "expired");
  check("pending → pending", trainingState([cert("PENDING", null)], now) === "pending");
  check("rejected only → missing", trainingState([cert("REJECTED", null)], now) === "missing");
  check("course not completed → missing", courseState(null) === "missing" && courseState(undefined) === "missing");
  check("course completed → ok", courseState(new Date()) === "ok");
}

console.log("sanitizeWorkspaceInput");
{
  const ok = (body: unknown, partial = false) => sanitizeWorkspaceInput(body, partial);
  check("create needs a name", !ok({}).ok);
  const named = ok({ name: "  Propulsion Lab  " });
  check("name trimmed", named.ok && named.value.name === "Propulsion Lab");
  check("bad colour", !ok({ name: "x", color: "red" }).ok);
  const colour = ok({ name: "x", color: "#00E5CC" });
  check("colour lower-cased", colour.ok && colour.value.color === "#00e5cc");
  check("capacity 0 rejected", !ok({ name: "x", capacity: 0 }).ok);
  const cap = ok({ name: "x", capacity: null });
  check("capacity null clears", cap.ok && cap.value.capacity === null);
  check("off-grid open time rejected", !ok({ name: "x", openStartMin: 45 }).ok);
  check("open after close rejected", !ok({ name: "x", openStartMin: 600, openEndMin: 540 }).ok);
  check("unknown timezone rejected", !ok({ name: "x", timezone: "Mars/Base" }).ok);
  const partial = ok({}, true);
  check("empty partial ok", partial.ok && Object.keys(partial.value).length === 0);
  const desc = ok({ description: "" }, true);
  check("empty description → null", desc.ok && desc.value.description === null);
  const term = ok({ defaultEndsOn: "2026-12-13" }, true);
  check("term end accepted", term.ok && term.value.defaultEndsOn === "2026-12-13");
  check("bad term end rejected", !ok({ defaultEndsOn: "12/13/2026" }, true).ok);
}

console.log("slugify");
{
  check("slug", slugify("Propulsion Lab (ARMS 1010)") === "propulsion-lab-arms-1010");
  check("empty falls back", slugify("!!!") === "space");
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
```

- [ ] **Step 3: Run — expect failure** (`Cannot find module './workspaceService.js'`).

### Task 3.2: `workspaceService.ts`

**Files:**
- Create: `backend/src/services/workspaceService.ts`

- [ ] **Step 1: Write the module**

```ts
/**
 * Lab spaces: CRUD, project assignment, requirements, and who may schedule.
 * Everything above the `── Persistence ──` divider is pure and unit-tested in
 * workspaceService.test.ts.
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { deriveStatus, type CertLike } from "./trainingService.js";
import { isYmd, toDbDate, fromDbDate, SLOT_MINUTES, DAY_MINUTES, type Ymd } from "./labScheduleCore.js";

export type RequirementState = "ok" | "missing" | "expired" | "pending";

export function trainingState(certs: CertLike[], now: Date): RequirementState {
  const s = deriveStatus(certs, now);
  if (s === "UP_TO_DATE") return "ok";
  if (s === "PENDING_REVIEW") return "pending";
  if (s === "EXPIRED") return "expired";
  return "missing";
}
export function courseState(completedAt: Date | null | undefined): RequirementState {
  return completedAt ? "ok" : "missing";
}

export interface WorkspaceInput {
  name?: string;
  description?: string | null;
  location?: string | null;
  color?: string;
  capacity?: number | null;
  timezone?: string;
  openStartMin?: number;
  openEndMin?: number;
  defaultEndsOn?: Ymd | null;
}

function validTimeZone(tz: string): boolean {
  try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return true; } catch { return false; }
}

export function slugify(name: string): string {
  const s = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  return s || "space";
}

export function sanitizeWorkspaceInput(body: unknown, partial: boolean):
  { ok: true; value: WorkspaceInput } | { ok: false; error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const has = (k: string) => b[k] !== undefined;
  const fail = (error: string) => ({ ok: false as const, error });
  const out: WorkspaceInput = {};

  if (!partial || has("name")) {
    const name = typeof b.name === "string" ? b.name.trim() : "";
    if (!name || name.length > 80) return fail("Name is required (up to 80 characters).");
    out.name = name;
  }
  for (const [k, max] of [["description", 2000], ["location", 200]] as const) {
    if (!has(k)) continue;
    const v = b[k];
    if (v === null || v === "") { out[k] = null; continue; }
    if (typeof v !== "string" || v.trim().length > max) return fail(`${k} must be text up to ${max} characters.`);
    out[k] = v.trim();
  }
  if (has("color")) {
    if (typeof b.color !== "string" || !/^#[0-9a-fA-F]{6}$/.test(b.color)) return fail("Colour must be a hex value like #00e5cc.");
    out.color = b.color.toLowerCase();
  }
  if (has("capacity")) {
    const c = b.capacity;
    if (c === null || c === "") out.capacity = null;
    else if (!Number.isInteger(c) || (c as number) < 1 || (c as number) > 500) return fail("Capacity must be a whole number from 1 to 500.");
    else out.capacity = c as number;
  }
  if (has("timezone")) {
    if (typeof b.timezone !== "string" || !validTimeZone(b.timezone)) return fail("Unknown time zone.");
    out.timezone = b.timezone;
  }
  for (const k of ["openStartMin", "openEndMin"] as const) {
    if (!has(k)) continue;
    const v = b[k];
    if (!Number.isInteger(v) || (v as number) < 0 || (v as number) > DAY_MINUTES || (v as number) % SLOT_MINUTES !== 0) {
      return fail("Open hours must be on the half hour.");
    }
    out[k] = v as number;
  }
  if (out.openStartMin !== undefined && out.openEndMin !== undefined && out.openStartMin >= out.openEndMin) {
    return fail("Opening time must be before closing time.");
  }
  if (has("defaultEndsOn")) {
    const v = b.defaultEndsOn;
    if (v === null || v === "") out.defaultEndsOn = null;
    else if (!isYmd(v)) return fail("Term end must be YYYY-MM-DD.");
    else out.defaultEndsOn = v;
  }
  return { ok: true, value: out };
}

// ── Persistence ──────────────────────────────────────────────

const workspaceInclude = {
  projects: { include: { project: { select: { id: true, name: true } } } },
  requirements: {
    include: {
      training: { select: { id: true, name: true, courseUrl: true, registrationUrl: true } },
      course: { select: { id: true, title: true, slug: true } },
    },
  },
} satisfies Prisma.WorkspaceInclude;
type WorkspaceRow = Prisma.WorkspaceGetPayload<{ include: typeof workspaceInclude }>;

export interface RequirementRef { id: string; kind: "training" | "course"; refId: string; name: string; url: string | null; }
export interface WorkspaceDto {
  id: string; name: string; slug: string; description: string | null; location: string | null;
  color: string; capacity: number | null; timezone: string;
  openStartMin: number; openEndMin: number; defaultEndsOn: Ymd | null; archived: boolean;
  projects: { id: string; name: string }[];
  requirements: RequirementRef[];
}

function toDto(w: WorkspaceRow): WorkspaceDto {
  return {
    id: w.id, name: w.name, slug: w.slug, description: w.description, location: w.location,
    color: w.color, capacity: w.capacity, timezone: w.timezone,
    openStartMin: w.openStartMin, openEndMin: w.openEndMin,
    defaultEndsOn: w.defaultEndsOn ? fromDbDate(w.defaultEndsOn) : null,
    archived: !!w.archivedAt,
    projects: w.projects.map(p => p.project).sort((a, b) => a.name.localeCompare(b.name)),
    requirements: w.requirements.flatMap((r): RequirementRef[] => {
      if (r.training) return [{ id: r.id, kind: "training", refId: r.training.id, name: r.training.name, url: r.training.courseUrl ?? r.training.registrationUrl ?? null }];
      if (r.course) return [{ id: r.id, kind: "course", refId: r.course.id, name: r.course.title, url: `/clubpm/courses/${r.course.slug}/learn` }];
      return [];
    }),
  };
}

export async function listWorkspaces(opts: { projectId?: string; includeArchived?: boolean } = {}): Promise<WorkspaceDto[]> {
  const rows = await prisma.workspace.findMany({
    where: {
      ...(opts.includeArchived ? {} : { archivedAt: null }),
      ...(opts.projectId ? { projects: { some: { projectId: opts.projectId } } } : {}),
    },
    include: workspaceInclude,
    orderBy: { name: "asc" },
  });
  return rows.map(toDto);
}

export async function getWorkspace(id: string): Promise<WorkspaceDto | null> {
  const w = await prisma.workspace.findUnique({ where: { id }, include: workspaceInclude });
  return w ? toDto(w) : null;
}

async function uniqueSlug(name: string): Promise<string> {
  const base = slugify(name);
  let slug = base;
  for (let i = 2; await prisma.workspace.findUnique({ where: { slug }, select: { id: true } }); i++) slug = `${base}-${i}`;
  return slug;
}

export async function createWorkspace(input: WorkspaceInput, createdById: string): Promise<WorkspaceDto> {
  const w = await prisma.workspace.create({
    data: {
      name: input.name!,
      slug: await uniqueSlug(input.name!),
      description: input.description ?? null,
      location: input.location ?? null,
      ...(input.color ? { color: input.color } : {}),
      capacity: input.capacity ?? null,
      ...(input.timezone ? { timezone: input.timezone } : {}),
      ...(input.openStartMin !== undefined ? { openStartMin: input.openStartMin } : {}),
      ...(input.openEndMin !== undefined ? { openEndMin: input.openEndMin } : {}),
      defaultEndsOn: input.defaultEndsOn ? toDbDate(input.defaultEndsOn) : null,
      createdById,
    },
    include: workspaceInclude,
  });
  return toDto(w);
}

/** Returns null when not found; throws Error with a user message on invalid hours. */
export async function updateWorkspace(id: string, input: WorkspaceInput): Promise<WorkspaceDto | null> {
  const existing = await prisma.workspace.findUnique({ where: { id }, select: { openStartMin: true, openEndMin: true } });
  if (!existing) return null;
  const start = input.openStartMin ?? existing.openStartMin;
  const end = input.openEndMin ?? existing.openEndMin;
  if (start >= end) throw new Error("Opening time must be before closing time.");
  const { defaultEndsOn, ...rest } = input;
  const w = await prisma.workspace.update({
    where: { id },
    data: {
      ...rest,
      ...(defaultEndsOn !== undefined ? { defaultEndsOn: defaultEndsOn ? toDbDate(defaultEndsOn) : null } : {}),
    },
    include: workspaceInclude,
  });
  return toDto(w);
}

export async function archiveWorkspace(id: string): Promise<boolean> {
  const r = await prisma.workspace.updateMany({ where: { id, archivedAt: null }, data: { archivedAt: new Date() } });
  return r.count > 0;
}

export async function setWorkspaceProjects(id: string, projectIds: string[]): Promise<void> {
  const ids = [...new Set(projectIds)];
  await prisma.$transaction([
    prisma.workspaceProject.deleteMany({ where: { workspaceId: id } }),
    prisma.workspaceProject.createMany({ data: ids.map(projectId => ({ workspaceId: id, projectId })), skipDuplicates: true }),
  ]);
}

export async function setWorkspaceRequirements(id: string, trainingIds: string[], courseIds: string[]): Promise<void> {
  await prisma.$transaction([
    prisma.workspaceRequirement.deleteMany({ where: { workspaceId: id } }),
    prisma.workspaceRequirement.createMany({
      data: [
        ...[...new Set(trainingIds)].map(trainingId => ({ workspaceId: id, trainingId })),
        ...[...new Set(courseIds)].map(courseId => ({ workspaceId: id, courseId })),
      ],
      skipDuplicates: true,
    }),
  ]);
}

export async function isAdminMember(memberId: string): Promise<boolean> {
  const m = await prisma.member.findUnique({ where: { id: memberId }, select: { isAdmin: true, role: true } });
  return !!m && (m.isAdmin || m.role === "ADMIN");
}

export async function canSchedule(memberId: string, workspaceId: string, isAdmin: boolean): Promise<boolean> {
  if (isAdmin) return true;
  const n = await prisma.projectMember.count({
    where: { memberId, project: { workspaces: { some: { workspaceId } } } },
  });
  return n > 0;
}

/** memberId → requirementId → state. */
export async function requirementStatus(
  ws: WorkspaceDto, memberIds: string[], now: Date = new Date(),
): Promise<Record<string, Record<string, RequirementState>>> {
  const ids = [...new Set(memberIds)];
  const out: Record<string, Record<string, RequirementState>> = Object.fromEntries(ids.map(id => [id, {}]));
  if (ids.length === 0 || ws.requirements.length === 0) return out;

  const trainingReqs = ws.requirements.filter(r => r.kind === "training");
  const courseReqs = ws.requirements.filter(r => r.kind === "course");
  const [certs, enrollments] = await Promise.all([
    trainingReqs.length
      ? prisma.trainingCertificate.findMany({
          where: { memberId: { in: ids }, trainingId: { in: trainingReqs.map(r => r.refId) } },
          select: { memberId: true, trainingId: true, status: true, expiresOn: true, createdAt: true },
        })
      : Promise.resolve([]),
    courseReqs.length
      ? prisma.courseEnrollment.findMany({
          where: { memberId: { in: ids }, courseId: { in: courseReqs.map(r => r.refId) } },
          select: { memberId: true, courseId: true, completedAt: true },
        })
      : Promise.resolve([]),
  ]);

  for (const id of ids) {
    for (const r of trainingReqs) {
      out[id][r.id] = trainingState(certs.filter(c => c.memberId === id && c.trainingId === r.refId), now);
    }
    for (const r of courseReqs) {
      out[id][r.id] = courseState(enrollments.find(e => e.memberId === id && e.courseId === r.refId)?.completedAt);
    }
  }
  return out;
}
```

If `Member.role` is not a field (check with `rg -n "^  role " backend/prisma/schema.prisma`), drop `role` from `isAdminMember` and use `m.isAdmin` only.

- [ ] **Step 2: Run the test — expect pass**

Run: `cd backend && npx tsx src/services/workspaceService.test.ts`
Expected: `N passed, 0 failed`.

- [ ] **Step 3: Gate + commit**

```bash
cd backend && npm run typecheck && npm test
git add backend/src/services/workspaceService.ts backend/src/services/workspaceService.test.ts
git commit -m "feat(lab): workspace service with requirement status"
```

---

## Phase 4 — Schedule service + API

### Task 4.1: `labScheduleService.ts`

**Files:**
- Create: `backend/src/services/labScheduleService.ts`

- [ ] **Step 1: Write the module**

```ts
/**
 * Lab schedule persistence + notifications. Pure logic lives in labScheduleCore.ts.
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { createNotification } from "./notificationCrud.js";
import {
  addDays, weekDates, mondayOf, toDbDate, fromDbDate, todayIn, isYmd,
  expandShifts, eventToBand, mergePresence, validateApply, planErase, rectToShifts,
  overlapsFor, describeDrafts, describeOverlaps,
  type ShiftRow, type SkipRow, type ShiftDraft, type Ymd,
} from "./labScheduleCore.js";
import { getWorkspace, canSchedule, isAdminMember, requirementStatus, type WorkspaceDto } from "./workspaceService.js";

export class LabScheduleError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

const BUDDY_WINDOW_DAYS = 14;
const DAY_MS = 86_400_000;

type DbShift = {
  id: string; memberId: string; weekday: number; startMin: number; endMin: number;
  startsOn: Date; endsOn: Date; buddyWanted: boolean; skips?: { date: Date }[];
};

function toRow(s: DbShift): ShiftRow {
  return {
    id: s.id, memberId: s.memberId, weekday: s.weekday, startMin: s.startMin, endMin: s.endMin,
    startsOn: fromDbDate(s.startsOn), endsOn: fromDbDate(s.endsOn), buddyWanted: s.buddyWanted,
  };
}
function toSkips(s: DbShift): SkipRow[] {
  return (s.skips ?? []).map(k => ({ shiftId: s.id, date: fromDbDate(k.date) }));
}
function draftToData(d: ShiftDraft) {
  return {
    weekday: d.weekday, startMin: d.startMin, endMin: d.endMin,
    startsOn: toDbDate(d.startsOn), endsOn: toDbDate(d.endsOn), buddyWanted: d.buddyWanted,
  };
}
function partialToData(p: Partial<ShiftDraft>): Prisma.LabShiftUpdateInput {
  const out: Prisma.LabShiftUpdateInput = {};
  if (p.startMin !== undefined) out.startMin = p.startMin;
  if (p.endMin !== undefined) out.endMin = p.endMin;
  if (p.startsOn !== undefined) out.startsOn = toDbDate(p.startsOn);
  if (p.endsOn !== undefined) out.endsOn = toDbDate(p.endsOn);
  if (p.buddyWanted !== undefined) out.buddyWanted = p.buddyWanted;
  return out;
}
function windowDates(today: Ymd): Ymd[] {
  return Array.from({ length: BUDDY_WINDOW_DAYS }, (_, i) => addDays(today, i));
}
async function actorName(memberId: string): Promise<string> {
  const m = await prisma.member.findUnique({ where: { id: memberId }, select: { displayName: true } });
  return m?.displayName ?? "A teammate";
}
const labLink = (workspaceId: string) => `/clubpm/calendar?lab=${workspaceId}`;

// ── Read ─────────────────────────────────────────────────────

export async function getWeek(workspaceId: string, anyDayInWeek: Ymd, viewerId: string) {
  const ws = await getWorkspace(workspaceId);
  if (!ws) throw new LabScheduleError(404, "Lab space not found");
  const dates = weekDates(mondayOf(anyDayInWeek));
  const first = dates[0], last = dates[6];

  const [shifts, events, viewerIsAdmin] = await Promise.all([
    prisma.labShift.findMany({
      where: { workspaceId, startsOn: { lte: toDbDate(last) }, endsOn: { gte: toDbDate(first) } },
      include: { skips: true, member: { select: { id: true, displayName: true, avatarUrl: true } } },
    }),
    prisma.event.findMany({
      where: {
        workspaceId,
        startTime: { gte: new Date(toDbDate(first).getTime() - DAY_MS), lt: new Date(toDbDate(last).getTime() + 2 * DAY_MS) },
      },
      select: { id: true, title: true, startTime: true, endTime: true, attendees: { select: { id: true, displayName: true, avatarUrl: true } } },
      orderBy: { startTime: "asc" },
    }),
    isAdminMember(viewerId),
  ]);

  const rows = shifts.map(toRow);
  const occurrences = expandShifts(rows, shifts.flatMap(toSkips), dates);
  const bands = events
    .map(e => eventToBand({ id: e.id, title: e.title, startTime: e.startTime, endTime: e.endTime, attendeeIds: e.attendees.map(a => a.id) }, ws.timezone))
    .filter(b => dates.includes(b.date));
  const blocks = dates.flatMap(d => mergePresence(d, occurrences, bands));

  const people = new Map<string, { id: string; displayName: string; avatarUrl: string | null }>();
  for (const s of shifts) people.set(s.member.id, s.member);
  for (const e of events) for (const a of e.attendees) people.set(a.id, a);
  const ids = [...people.keys()];

  const [memberships, reqStatus, mayEdit] = await Promise.all([
    prisma.projectMember.findMany({
      where: { memberId: { in: ids }, project: { workspaces: { some: { workspaceId } } } },
      select: { memberId: true, project: { select: { id: true, name: true } } },
    }),
    requirementStatus(ws, [...ids, viewerId]),
    canSchedule(viewerId, workspaceId, viewerIsAdmin),
  ]);

  return {
    workspace: ws,
    dates,
    blocks,
    events: bands,
    occurrences,
    myShifts: rows.filter(r => r.memberId === viewerId),
    members: ids.map(id => ({ ...people.get(id)!, projects: memberships.filter(m => m.memberId === id).map(m => m.project) })),
    requirementStatus: reqStatus,
    canSchedule: mayEdit && !ws.archived,
  };
}

// ── Write ────────────────────────────────────────────────────

export async function applyRect(memberId: string, workspaceId: string, body: unknown) {
  const ws = await getWorkspace(workspaceId);
  if (!ws) throw new LabScheduleError(404, "Lab space not found");
  if (ws.archived) throw new LabScheduleError(400, "This space is archived.");
  const admin = await isAdminMember(memberId);
  if (!(await canSchedule(memberId, workspaceId, admin))) {
    throw new LabScheduleError(403, "Only members of projects assigned to this space can schedule here.");
  }
  const today = todayIn(ws.timezone);
  const parsed = validateApply(body, ws, today);
  if (!parsed.ok) throw new LabScheduleError(400, parsed.error);
  const v = parsed.value;

  // `add` is erase-then-insert over the same rectangle, so repeated drags never stack.
  const own = await prisma.labShift.findMany({
    where: { workspaceId, memberId, endsOn: { gte: toDbDate(v.dates[0]) } },
    include: { skips: true },
  });
  const plan = planErase(own.map(toRow), own.flatMap(toSkips), v);
  const drafts = v.op === "add" ? rectToShifts(v) : [];
  const creates = [...plan.creates, ...drafts];

  await prisma.$transaction([
    ...(plan.deletes.length ? [prisma.labShift.deleteMany({ where: { id: { in: plan.deletes }, memberId } })] : []),
    ...plan.updates.map(u => prisma.labShift.update({ where: { id: u.id }, data: partialToData(u.data) })),
    ...(creates.length ? [prisma.labShift.createMany({ data: creates.map(d => ({ ...draftToData(d), memberId, workspaceId })) })] : []),
    ...(plan.skips.length
      ? [prisma.labShiftSkip.createMany({ data: plan.skips.map(s => ({ shiftId: s.shiftId, date: toDbDate(s.date) })), skipDuplicates: true })]
      : []),
  ]);

  if (drafts.length) {
    await notifyBuddyJoined(memberId, ws, drafts, today)
      .catch(err => console.error("[labSchedule] buddy-joined notify failed:", err));
    if (v.buddyWanted) {
      await notifyBuddyWanted(memberId, ws, drafts)
        .catch(err => console.error("[labSchedule] buddy-wanted notify failed:", err));
    }
  }
  return getWeek(workspaceId, v.dates[0], memberId);
}

export async function updateShift(shiftId: string, actorId: string, body: unknown) {
  const shift = await prisma.labShift.findUnique({ where: { id: shiftId } });
  if (!shift) throw new LabScheduleError(404, "Lab time not found");
  if (shift.memberId !== actorId && !(await isAdminMember(actorId))) {
    throw new LabScheduleError(403, "You can only change your own lab time.");
  }
  const b = (body ?? {}) as Record<string, unknown>;
  const data: Prisma.LabShiftUpdateInput = {};
  if (b.buddyWanted !== undefined) {
    if (typeof b.buddyWanted !== "boolean") throw new LabScheduleError(400, "buddyWanted must be true or false.");
    data.buddyWanted = b.buddyWanted;
  }
  if (b.note !== undefined) {
    if (b.note !== null && (typeof b.note !== "string" || b.note.length > 280)) throw new LabScheduleError(400, "Note must be up to 280 characters.");
    data.note = typeof b.note === "string" && b.note.trim() ? b.note.trim() : null;
  }
  if (b.endsOn !== undefined) {
    if (!isYmd(b.endsOn) || b.endsOn < fromDbDate(shift.startsOn)) throw new LabScheduleError(400, "Until date must be on or after the start date.");
    data.endsOn = toDbDate(b.endsOn);
  }
  const updated = await prisma.labShift.update({ where: { id: shiftId }, data });
  if (data.buddyWanted === true && !shift.buddyWanted) {
    const ws = await getWorkspace(shift.workspaceId);
    if (ws) {
      await notifyBuddyWanted(shift.memberId, ws, [toRow(updated)])
        .catch(err => console.error("[labSchedule] buddy-wanted notify failed:", err));
    }
  }
  return toRow(updated);
}

export async function deleteShift(shiftId: string, actorId: string): Promise<void> {
  const shift = await prisma.labShift.findUnique({ where: { id: shiftId }, select: { memberId: true } });
  if (!shift) throw new LabScheduleError(404, "Lab time not found");
  if (shift.memberId !== actorId && !(await isAdminMember(actorId))) {
    throw new LabScheduleError(403, "You can only remove your own lab time.");
  }
  await prisma.labShift.delete({ where: { id: shiftId } });
}

export async function listBuddyRequests(viewerId: string, projectId?: string) {
  const projectIds = projectId
    ? [projectId]
    : (await prisma.projectMember.findMany({ where: { memberId: viewerId }, select: { projectId: true } })).map(p => p.projectId);
  if (projectIds.length === 0) return [];
  const spaces = await prisma.workspace.findMany({
    where: { archivedAt: null, projects: { some: { projectId: { in: projectIds } } } },
    select: { id: true, name: true, color: true, timezone: true },
  });

  const out: {
    workspaceId: string; workspaceName: string; color: string; shiftId: string;
    date: Ymd; startMin: number; endMin: number;
    member: { id: string; displayName: string; avatarUrl: string | null };
  }[] = [];
  for (const ws of spaces) {
    const dates = windowDates(todayIn(ws.timezone));
    const shifts = await prisma.labShift.findMany({
      where: {
        workspaceId: ws.id, buddyWanted: true, memberId: { not: viewerId },
        startsOn: { lte: toDbDate(dates[dates.length - 1]) }, endsOn: { gte: toDbDate(dates[0]) },
      },
      include: { skips: true, member: { select: { id: true, displayName: true, avatarUrl: true } } },
    });
    const memberOf = new Map(shifts.map(s => [s.id, s.member]));
    for (const o of expandShifts(shifts.map(toRow), shifts.flatMap(toSkips), dates)) {
      out.push({
        workspaceId: ws.id, workspaceName: ws.name, color: ws.color, shiftId: o.shiftId,
        date: o.date, startMin: o.startMin, endMin: o.endMin, member: memberOf.get(o.shiftId)!,
      });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.startMin - b.startMin).slice(0, 50);
}

// ── Notifications ────────────────────────────────────────────

async function notifyBuddyJoined(actorId: string, ws: WorkspaceDto, drafts: ShiftDraft[], today: Ymd) {
  const dates = windowDates(today);
  const mine = expandShifts(drafts.map((d, i) => ({ ...d, id: `new-${i}`, memberId: actorId })), [], dates);
  if (mine.length === 0) return;
  const others = await prisma.labShift.findMany({
    where: {
      workspaceId: ws.id, buddyWanted: true, memberId: { not: actorId },
      startsOn: { lte: toDbDate(dates[dates.length - 1]) }, endsOn: { gte: toDbDate(today) },
    },
    include: { skips: true },
  });
  const hits = overlapsFor(mine, expandShifts(others.map(toRow), others.flatMap(toSkips), dates));
  if (hits.size === 0) return;
  const name = await actorName(actorId);
  for (const [recipientId, list] of hits) {
    const message = `${name} will join you in ${ws.name} — ${describeOverlaps(list)}`;
    await createNotification({
      type: "LAB_BUDDY_JOINED", recipientId, actorId, message,
      metadata: { link: labLink(ws.id), workspaceId: ws.id },
      slackText: `🧪 ${message}`,
    });
  }
}

async function notifyBuddyWanted(actorId: string, ws: WorkspaceDto, drafts: ShiftDraft[]) {
  // Throttle: one per actor per space per 24 h. Reads in-app rows, so a
  // recipient set to Slack-only does not count — acceptable, it fails open.
  const recent = await prisma.notification.findFirst({
    where: {
      type: "LAB_BUDDY_WANTED", actorId, createdAt: { gte: new Date(Date.now() - DAY_MS) },
      metadata: { path: ["workspaceId"], equals: ws.id },
    },
    select: { id: true },
  });
  if (recent) return;
  const mine = await prisma.projectMember.findMany({
    where: { memberId: actorId, project: { workspaces: { some: { workspaceId: ws.id } } } },
    select: { projectId: true },
  });
  if (mine.length === 0) return;
  const teammates = await prisma.projectMember.findMany({
    where: { projectId: { in: mine.map(m => m.projectId) }, memberId: { not: actorId } },
    select: { memberId: true },
    distinct: ["memberId"],
  });
  const name = await actorName(actorId);
  const message = `${name} is looking for company in ${ws.name} — ${describeDrafts(drafts)}`;
  for (const t of teammates) {
    await createNotification({
      type: "LAB_BUDDY_WANTED", recipientId: t.memberId, actorId, projectId: mine[0].projectId, message,
      metadata: { link: labLink(ws.id), workspaceId: ws.id },
      slackText: `🧪 ${message}`,
    });
  }
}
```

- [ ] **Step 2: Typecheck** — `cd backend && npm run typecheck` → exit 0.

### Task 4.2: Router, mount, route test

**Files:**
- Create: `backend/src/api/workspaces.ts`
- Create: `backend/src/api/workspaces.test.ts`
- Modify: `backend/src/app.ts`

- [ ] **Step 1: Write the route test first**

```ts
// Source-inspection test for the workspaces router. No DB.
// Run: cd backend && npx tsx src/api/workspaces.test.ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

let passed = 0, failed = 0;
function check(name: string, cond: boolean) {
  if (cond) passed++; else { failed++; console.error(`  ✗ ${name}`); }
}

const src = readFileSync(fileURLToPath(new URL("./workspaces.ts", import.meta.url)), "utf8");
const firstParam = src.indexOf('"/:id');

check("never reads req.session", !/req\.session/.test(src));
check("has a /:id route", firstParam > -1);
for (const path of ['"/buddy-requests"', '"/shifts/:shiftId"']) {
  const at = src.indexOf(path);
  check(`${path} registered above /:id`, at > -1 && at < firstParam);
}
check("create is admin-only", /workspacesRouter\.post\("\/", requireAdmin/.test(src));
check("archive is admin-only", /workspacesRouter\.delete\("\/:id", requireAdmin/.test(src));

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
```

Run: `cd backend && npx tsx src/api/workspaces.test.ts` → FAIL (`ENOENT … workspaces.ts`).

- [ ] **Step 2: Write the router**

```ts
// Lab spaces + lab schedule. Spec: docs/superpowers/specs/2026-09-25-lab-schedule-design.md
import { Router, type Request, type Response } from "express";
import { requireAuth, requireAdmin } from "./auth.js";
import * as workspaceService from "../services/workspaceService.js";
import * as labSchedule from "../services/labScheduleService.js";
import { isYmd } from "../services/labScheduleCore.js";

export const workspacesRouter = Router();
workspacesRouter.use(requireAuth);

function sendError(res: Response, err: unknown, label: string) {
  if (err instanceof labSchedule.LabScheduleError) { res.status(err.status).json({ error: err.message }); return; }
  console.error(`[workspaces] ${label}:`, err);
  res.status(500).json({ error: "Something went wrong" });
}
const idList = (v: unknown): string[] | null =>
  Array.isArray(v) && v.every(x => typeof x === "string") ? [...new Set(v as string[])] : null;

// ROUTE ORDER: static paths MUST stay above "/:id" (workspaces.test.ts checks).

workspacesRouter.get("/buddy-requests", async (req: Request, res: Response) => {
  try {
    const projectId = typeof req.query.projectId === "string" && req.query.projectId ? req.query.projectId : undefined;
    res.json(await labSchedule.listBuddyRequests(req.memberId!, projectId));
  } catch (err) { sendError(res, err, "buddy requests"); }
});

workspacesRouter.patch("/shifts/:shiftId", async (req: Request, res: Response) => {
  try { res.json(await labSchedule.updateShift(req.params.shiftId as string, req.memberId!, req.body)); }
  catch (err) { sendError(res, err, "update shift"); }
});

workspacesRouter.delete("/shifts/:shiftId", async (req: Request, res: Response) => {
  try { await labSchedule.deleteShift(req.params.shiftId as string, req.memberId!); res.status(204).end(); }
  catch (err) { sendError(res, err, "delete shift"); }
});

workspacesRouter.get("/", async (req: Request, res: Response) => {
  try {
    const includeArchived = req.query.includeArchived === "1" && await workspaceService.isAdminMember(req.memberId!);
    const projectId = typeof req.query.projectId === "string" && req.query.projectId ? req.query.projectId : undefined;
    res.json(await workspaceService.listWorkspaces({ projectId, includeArchived }));
  } catch (err) { sendError(res, err, "list"); }
});

workspacesRouter.post("/", requireAdmin, async (req: Request, res: Response) => {
  try {
    const parsed = workspaceService.sanitizeWorkspaceInput(req.body, false);
    if (!parsed.ok) { res.status(400).json({ error: parsed.error }); return; }
    const ws = await workspaceService.createWorkspace(parsed.value, req.memberId!);
    const projectIds = idList(req.body?.projectIds);
    if (projectIds) await workspaceService.setWorkspaceProjects(ws.id, projectIds);
    const trainingIds = idList(req.body?.trainingIds) ?? [];
    const courseIds = idList(req.body?.courseIds) ?? [];
    if (trainingIds.length || courseIds.length) await workspaceService.setWorkspaceRequirements(ws.id, trainingIds, courseIds);
    res.status(201).json(await workspaceService.getWorkspace(ws.id));
  } catch (err) { sendError(res, err, "create"); }
});

workspacesRouter.patch("/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const parsed = workspaceService.sanitizeWorkspaceInput(req.body, true);
    if (!parsed.ok) { res.status(400).json({ error: parsed.error }); return; }
    const ws = await workspaceService.updateWorkspace(req.params.id as string, parsed.value);
    if (!ws) { res.status(404).json({ error: "Lab space not found" }); return; }
    res.json(ws);
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("Opening time")) { res.status(400).json({ error: err.message }); return; }
    sendError(res, err, "update");
  }
});

workspacesRouter.delete("/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const ok = await workspaceService.archiveWorkspace(req.params.id as string);
    if (!ok) { res.status(404).json({ error: "Lab space not found" }); return; }
    res.status(204).end();
  } catch (err) { sendError(res, err, "archive"); }
});

workspacesRouter.put("/:id/projects", requireAdmin, async (req: Request, res: Response) => {
  try {
    const projectIds = idList(req.body?.projectIds);
    if (!projectIds) { res.status(400).json({ error: "projectIds must be a list of ids" }); return; }
    await workspaceService.setWorkspaceProjects(req.params.id as string, projectIds);
    res.json(await workspaceService.getWorkspace(req.params.id as string));
  } catch (err) { sendError(res, err, "set projects"); }
});

workspacesRouter.put("/:id/requirements", requireAdmin, async (req: Request, res: Response) => {
  try {
    const trainingIds = idList(req.body?.trainingIds);
    const courseIds = idList(req.body?.courseIds);
    if (!trainingIds || !courseIds) { res.status(400).json({ error: "trainingIds and courseIds must be lists of ids" }); return; }
    await workspaceService.setWorkspaceRequirements(req.params.id as string, trainingIds, courseIds);
    res.json(await workspaceService.getWorkspace(req.params.id as string));
  } catch (err) { sendError(res, err, "set requirements"); }
});

workspacesRouter.get("/:id/week", async (req: Request, res: Response) => {
  try {
    const start = isYmd(req.query.start) ? req.query.start : new Date().toISOString().slice(0, 10);
    res.json(await labSchedule.getWeek(req.params.id as string, start, req.memberId!));
  } catch (err) { sendError(res, err, "week"); }
});

workspacesRouter.post("/:id/shifts/apply", async (req: Request, res: Response) => {
  try { res.json(await labSchedule.applyRect(req.memberId!, req.params.id as string, req.body)); }
  catch (err) { sendError(res, err, "apply"); }
});
```

- [ ] **Step 3: Mount it.** In `backend/src/app.ts` add `import { workspacesRouter } from "./api/workspaces.js";` beside the `meetingPollsRouter` import, and directly below `app.use("/api/meeting-polls", meetingPollsRouter);` add:

```ts
app.use("/api/workspaces", workspacesRouter);
```

- [ ] **Step 4: Run the route test** — `cd backend && npx tsx src/api/workspaces.test.ts` → `N passed, 0 failed`.

- [ ] **Step 5: Gate + commit**

```bash
cd backend && npm run typecheck && npm test
git add backend/src/services/labScheduleService.ts backend/src/api/workspaces.ts backend/src/api/workspaces.test.ts backend/src/app.ts
git commit -m "feat(lab): workspaces API with week view, rectangle apply and buddy notifications"
```

---

## Phase 5 — Frontend client, utils, marquee hook

### Task 5.1: API client helpers

**Files:**
- Modify: `src/api/clubPmClient.js`

- [ ] **Step 1:** Find `// ── Meeting scheduler (when2meet availability polls)` with `rg -n "Meeting scheduler" src/api/clubPmClient.js`. Insert **above** that comment:

```js
// ── Lab schedule (workspaces) ────────────────────────────────

export const listWorkspaces = (params = {}) => {
  const q = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v != null && v !== '')
  ).toString();
  return get(`/api/workspaces${q ? `?${q}` : ''}`);
};
export const createWorkspace          = (data)                    => post('/api/workspaces', data);
export const updateWorkspace          = (id, data)                => patch(`/api/workspaces/${id}`, data);
export const archiveWorkspace         = (id)                      => del(`/api/workspaces/${id}`);
export const setWorkspaceProjects     = (id, projectIds)          => put(`/api/workspaces/${id}/projects`, { projectIds });
export const setWorkspaceRequirements = (id, trainingIds, courseIds) => put(`/api/workspaces/${id}/requirements`, { trainingIds, courseIds });
export const getWorkspaceWeek         = (id, start)               => get(`/api/workspaces/${id}/week?start=${encodeURIComponent(start)}`);
export const applyLabRect             = (id, body)                => post(`/api/workspaces/${id}/shifts/apply`, body);
export const updateLabShift           = (shiftId, data)           => patch(`/api/workspaces/shifts/${shiftId}`, data);
export const deleteLabShift           = (shiftId)                 => del(`/api/workspaces/shifts/${shiftId}`);
export const listLabBuddyRequests     = (projectId)               =>
  get(`/api/workspaces/buddy-requests${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`);

```

### Task 5.2: `labScheduleUtils.js` (test first)

**Files:**
- Create: `src/components/clubpm/labschedule/labScheduleUtils.test.js`
- Create: `src/components/clubpm/labschedule/labScheduleUtils.js`

- [ ] **Step 1: Write the test**

```js
import {
  addDays, mondayOf, weekdayOf, fmtMin, fmtMinShort, fmtRange, dayHeader, weekLabel, rowStarts,
  blockBox, heatLevel, rectFromIndices, ownCells, othersHeat, overlapNames, describeRect,
  collapsedDays, unmetRequirements, ROW_PX,
} from './labScheduleUtils';

const MON = '2026-09-28';
const WEEK = Array.from({ length: 7 }, (_, i) => addDays(MON, i));
const occ = (memberId, date, startMin, endMin) => ({ shiftId: `s-${memberId}`, memberId, date, startMin, endMin, buddyWanted: false });

test('date helpers', () => {
  expect(addDays('2026-09-30', 1)).toBe('2026-10-01');
  expect(weekdayOf(MON)).toBe(1);
  expect(mondayOf('2026-10-04')).toBe(MON);
  expect(dayHeader(MON)).toEqual({ dow: 'Mon', dom: 28, month: 'Sep' });
  expect(weekLabel(WEEK)).toBe('Sep 28 – Oct 4');
});

test('time formatting', () => {
  expect(fmtMin(840)).toBe('2:00 PM');
  expect(fmtMin(0)).toBe('12:00 AM');
  expect(fmtMinShort(840)).toBe('2 PM');
  expect(fmtMinShort(870)).toBe('2:30');
  expect(fmtRange(840, 1020)).toBe('2:00–5:00 PM');
  expect(fmtRange(660, 780)).toBe('11:00 AM–1:00 PM');
});

test('grid geometry', () => {
  expect(rowStarts(480, 600)).toEqual([480, 510, 540, 570]);
  expect(blockBox(540, 600, 480)).toEqual({ top: 2 * ROW_PX, height: 2 * ROW_PX });
  expect([0, 1, 2, 3, 9].map(heatLevel)).toEqual([0, 1, 2, 3, 4]);
  expect(rectFromIndices({ d0: 1, d1: 2, t0: 0, t1: 1 }, WEEK, rowStarts(480, 600)))
    .toEqual({ dates: ['2026-09-29', '2026-09-30'], startMin: 480, endMin: 540 });
});

test('cells and heat', () => {
  const occurrences = [occ('me', MON, 480, 540), occ('b', MON, 510, 570), occ('c', MON, 510, 540)];
  const mine = ownCells(occurrences, 'me');
  expect([...mine].sort()).toEqual([`${MON}|480`, `${MON}|510`]);
  const heat = othersHeat(occurrences, 'me');
  expect(heat.get(`${MON}|510`)).toBe(2);
  expect(heat.get(`${MON}|540`)).toBe(1);
  expect(heat.has(`${MON}|480`)).toBe(false);
});

test('overlap names in a rectangle', () => {
  const members = new Map([['b', { id: 'b', displayName: 'Sam' }]]);
  const rect = { dates: [MON, '2026-09-30'], startMin: 840, endMin: 1020 };
  const names = overlapNames(rect, [occ('b', MON, 900, 960), occ('b', '2026-09-30', 1000, 1100), occ('me', MON, 840, 1020)], 'me', members);
  expect(names).toEqual([{ id: 'b', name: 'Sam', days: ['Mon', 'Wed'] }]);
  expect(describeRect(rect)).toBe('Mon–Wed · 2:00–5:00 PM');
  expect(describeRect({ ...rect, dates: [MON] })).toBe('Mon · 2:00–5:00 PM');
});

test('weekend columns collapse only when empty', () => {
  const blocks = [{ date: '2026-10-03', startMin: 600, endMin: 660 }];
  expect([...collapsedDays(WEEK, blocks, [])]).toEqual([6]);
  expect([...collapsedDays(WEEK, [], [])].sort()).toEqual([5, 6]);
});

test('unmet requirements', () => {
  const ws = { requirements: [{ id: 'r1', name: 'Lab Safety' }, { id: 'r2', name: 'Chem' }] };
  expect(unmetRequirements(ws, { r1: 'ok', r2: 'expired' })).toEqual([{ id: 'r2', name: 'Chem', state: 'expired' }]);
  expect(unmetRequirements(ws, undefined).map(r => r.state)).toEqual(['missing', 'missing']);
});
```

Run: `npm run test:ci -- src/components/clubpm/labschedule/labScheduleUtils.test.js` → FAIL (module not found).

- [ ] **Step 2: Write the module**

```js
// Pure helpers for the lab schedule UI. Dates are local "YYYY-MM-DD" strings in
// the workspace's timezone and times are minutes past local midnight — the same
// model as backend/src/services/labScheduleCore.ts.

export const SLOT = 30;
export const ROW_PX = 22;

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const noon = (ymd) => new Date(`${ymd}T12:00:00Z`);

export function addDays(ymd, n) {
  const d = noon(ymd);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export const weekdayOf = (ymd) => noon(ymd).getUTCDay();
export const mondayOf = (ymd) => addDays(ymd, -((weekdayOf(ymd) + 6) % 7));

export function todayInZone(timeZone, now = new Date()) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const g = (t) => p.find(x => x.type === t)?.value;
  return `${g('year')}-${g('month')}-${g('day')}`;
}

export function fmtMin(min) {
  const m = ((min % 1440) + 1440) % 1440;
  const h24 = Math.floor(m / 60);
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m % 60).padStart(2, '0')} ${h24 < 12 ? 'AM' : 'PM'}`;
}
/** Gutter label: "2 PM" on the hour, "2:30" on the half hour. */
export function fmtMinShort(min) {
  const [t, ap] = fmtMin(min).split(' ');
  return t.endsWith(':00') ? `${t.slice(0, -3)} ${ap}` : t;
}
export function fmtRange(a, b) {
  const [at, am] = fmtMin(a).split(' ');
  const [bt, bm] = fmtMin(b).split(' ');
  return am === bm ? `${at}–${bt} ${bm}` : `${at} ${am}–${bt} ${bm}`;
}
export function dayHeader(ymd) {
  const d = noon(ymd);
  return { dow: DOW[d.getUTCDay()], dom: d.getUTCDate(), month: MON[d.getUTCMonth()] };
}
export function weekLabel(dates) {
  const a = dayHeader(dates[0]), b = dayHeader(dates[dates.length - 1]);
  return `${a.month} ${a.dom} – ${b.month} ${b.dom}`;
}

export function rowStarts(openStartMin, openEndMin) {
  const out = [];
  for (let m = openStartMin; m < openEndMin; m += SLOT) out.push(m);
  return out;
}
export function blockBox(startMin, endMin, openStartMin) {
  return { top: ((startMin - openStartMin) / SLOT) * ROW_PX, height: ((endMin - startMin) / SLOT) * ROW_PX };
}
export const heatLevel = (n) => (n <= 0 ? 0 : Math.min(n, 4));

export function rectFromIndices({ d0, d1, t0, t1 }, dates, rows) {
  return { dates: dates.slice(d0, d1 + 1), startMin: rows[t0], endMin: rows[t1] + SLOT };
}

export const cellKey = (date, min) => `${date}|${min}`;
function eachCell(o, fn) { for (let m = o.startMin; m < o.endMin; m += SLOT) fn(cellKey(o.date, m)); }

export function ownCells(occurrences, memberId) {
  const out = new Set();
  for (const o of occurrences) if (o.memberId === memberId) eachCell(o, k => out.add(k));
  return out;
}
export function othersHeat(occurrences, memberId) {
  const out = new Map();
  for (const o of occurrences) if (o.memberId !== memberId) eachCell(o, k => out.set(k, (out.get(k) ?? 0) + 1));
  return out;
}

export function overlapNames(rect, occurrences, memberId, membersById) {
  const hits = new Map();
  for (const o of occurrences) {
    if (o.memberId === memberId || !rect.dates.includes(o.date)) continue;
    if (o.startMin >= rect.endMin || o.endMin <= rect.startMin) continue;
    const days = hits.get(o.memberId) ?? [];
    const dow = dayHeader(o.date).dow;
    if (!days.includes(dow)) days.push(dow);
    hits.set(o.memberId, days);
  }
  return [...hits].map(([id, days]) => ({ id, name: membersById.get(id)?.displayName ?? 'Someone', days }));
}

export function describeRect(rect) {
  const a = dayHeader(rect.dates[0]).dow, b = dayHeader(rect.dates[rect.dates.length - 1]).dow;
  return `${a === b ? a : `${a}–${b}`} · ${fmtRange(rect.startMin, rect.endMin)}`;
}

/** Indices of Sat/Sun columns with nothing on them (Everyone view only). */
export function collapsedDays(dates, blocks, events) {
  const out = new Set();
  dates.forEach((d, i) => {
    if (weekdayOf(d) % 6 !== 0) return;
    if (blocks.some(b => b.date === d) || events.some(e => e.date === d)) return;
    out.add(i);
  });
  return out;
}

export function unmetRequirements(workspace, statusForMe) {
  return workspace.requirements
    .map(r => ({ ...r, state: statusForMe?.[r.id] ?? 'missing' }))
    .filter(r => r.state !== 'ok');
}
```

- [ ] **Step 3: Run** — `npm run test:ci -- src/components/clubpm/labschedule/labScheduleUtils.test.js` → all pass.

### Task 5.3: `useRectMarquee` hook (test first)

**Files:**
- Create: `src/hooks/useRectMarquee.test.jsx`
- Create: `src/hooks/useRectMarquee.js`

- [ ] **Step 1: Write the test**

```jsx
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import useRectMarquee from './useRectMarquee';

function Harness({ onChange, onEnd }) {
  const begin = useRectMarquee({ onChange, onEnd });
  return (
    <div>
      {[0, 1, 2].map(di => [0, 1, 2].map(ti => (
        <div key={`${di}${ti}`} data-testid={`c${di}${ti}`} data-mq="1" data-di={di} data-ti={ti}
          onPointerDown={(e) => begin(di, ti, e)} />
      )))}
    </div>
  );
}

let original;
beforeEach(() => { original = document.elementFromPoint; });
afterEach(() => { document.elementFromPoint = original; });

test('reports the rectangle from the anchor to the cell under the pointer', () => {
  const onChange = jest.fn(), onEnd = jest.fn();
  render(<Harness onChange={onChange} onEnd={onEnd} />);
  fireEvent.pointerDown(screen.getByTestId('c21'));
  expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ d0: 2, d1: 2, t0: 1, t1: 1 }));
  document.elementFromPoint = jest.fn(() => screen.getByTestId('c02'));
  fireEvent.pointerMove(window);
  expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ d0: 0, d1: 2, t0: 1, t1: 2 }));
  fireEvent.pointerUp(window);
  expect(onEnd).toHaveBeenCalledWith(expect.objectContaining({ d0: 0, d1: 2, t0: 1, t1: 2 }), expect.objectContaining({ cancelled: false }));
});

test('ignores moves when no drag is active', () => {
  const onChange = jest.fn(), onEnd = jest.fn();
  render(<Harness onChange={onChange} onEnd={onEnd} />);
  document.elementFromPoint = jest.fn(() => screen.getByTestId('c00'));
  fireEvent.pointerMove(window);
  fireEvent.pointerUp(window);
  expect(onChange).not.toHaveBeenCalled();
  expect(onEnd).not.toHaveBeenCalled();
});

test('pointercancel ends the drag as cancelled', () => {
  const onEnd = jest.fn();
  render(<Harness onChange={() => {}} onEnd={onEnd} />);
  fireEvent.pointerDown(screen.getByTestId('c11'));
  fireEvent.pointerCancel(window);
  expect(onEnd).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ cancelled: true }));
});
```

Run: `npm run test:ci -- src/hooks/useRectMarquee.test.jsx` → FAIL (module not found).

- [ ] **Step 2: Write the hook**

```js
import { useCallback, useEffect, useRef } from 'react';

// Rectangle-marquee drag across a grid of cells, for mouse and touch.
// Cells opt in with data-mq="1" data-di={dayIndex} data-ti={timeIndex}.
// While dragging, the cell under the pointer is resolved with
// elementFromPoint because a touch pointer stays captured by the cell the
// drag started on. Same mechanics as MeetingPollBoard's availability grid.

function rectOf(dr) {
  return {
    d0: Math.min(dr.anchorDi, dr.di), d1: Math.max(dr.anchorDi, dr.di),
    t0: Math.min(dr.anchorTi, dr.ti), t1: Math.max(dr.anchorTi, dr.ti),
    anchorDi: dr.anchorDi, anchorTi: dr.anchorTi,
  };
}

/**
 * @param {{ onChange?: (rect) => void, onEnd?: (rect, info: { clientX, clientY, cancelled }) => void }} callbacks
 * @returns {(di: number, ti: number, event?: PointerEvent) => void} begin — call from a cell's onPointerDown
 */
export default function useRectMarquee({ onChange, onEnd }) {
  const dragRef = useRef(null);
  const cbRef = useRef({ onChange, onEnd });
  useEffect(() => { cbRef.current = { onChange, onEnd }; }, [onChange, onEnd]);

  useEffect(() => {
    function move(e) {
      const dr = dragRef.current;
      if (!dr) return;
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const cell = el?.closest ? el.closest('[data-mq="1"]') : null;
      if (!cell) return;
      const di = Number(cell.getAttribute('data-di'));
      const ti = Number(cell.getAttribute('data-ti'));
      if (Number.isNaN(di) || Number.isNaN(ti) || (di === dr.di && ti === dr.ti)) return;
      dr.di = di; dr.ti = ti;
      if (typeof e.clientX === 'number') { dr.x = e.clientX; dr.y = e.clientY; }
      cbRef.current.onChange?.(rectOf(dr));
    }
    function finish(e, cancelled) {
      const dr = dragRef.current;
      if (!dr) return;
      dragRef.current = null;
      const clientX = typeof e.clientX === 'number' ? e.clientX : dr.x;
      const clientY = typeof e.clientY === 'number' ? e.clientY : dr.y;
      cbRef.current.onEnd?.(rectOf(dr), { clientX, clientY, cancelled });
    }
    const up = (e) => finish(e, false);
    const cancel = (e) => finish(e, true);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
    };
  }, []);

  return useCallback((di, ti, e) => {
    dragRef.current = { anchorDi: di, anchorTi: ti, di, ti, x: e?.clientX ?? 0, y: e?.clientY ?? 0 };
    cbRef.current.onChange?.(rectOf(dragRef.current));
  }, []);
}
```

- [ ] **Step 3: Run tests + gate + commit**

```bash
npm run test:ci -- src/hooks/useRectMarquee.test.jsx src/components/clubpm/labschedule/labScheduleUtils.test.js
npm run build
git add src/api/clubPmClient.js src/components/clubpm/labschedule/labScheduleUtils.js src/components/clubpm/labschedule/labScheduleUtils.test.js src/hooks/useRectMarquee.js src/hooks/useRectMarquee.test.jsx
git commit -m "feat(lab): client helpers, grid utils and rectangle marquee hook"
```

---

## Phase 6 — Grid, popover, CSS

### Task 6.1: `LabAvatar.jsx`

**Files:**
- Create: `src/components/clubpm/labschedule/LabAvatar.jsx`

- [ ] **Step 1:**

```jsx
export default function LabAvatar({ member, size = 20 }) {
  const name = member?.displayName ?? '?';
  const style = { width: size, height: size };
  if (member?.avatarUrl) {
    return <img className="pm-lab-avatar" src={member.avatarUrl} alt="" title={name} style={style} />;
  }
  return <span className="pm-lab-avatar" title={name} style={style} aria-hidden="true">{name[0].toUpperCase()}</span>;
}
```

### Task 6.2: `LabWeekGrid.jsx`

**Files:**
- Create: `src/components/clubpm/labschedule/LabWeekGrid.jsx`

- [ ] **Step 1:**

```jsx
import { useMemo, useRef, useState } from 'react';
import useRectMarquee from '../../../hooks/useRectMarquee';
import LabAvatar from './LabAvatar';
import {
  ROW_PX, SLOT, rowStarts, blockBox, heatLevel, dayHeader, fmtMin, fmtMinShort, fmtRange,
  cellKey, ownCells, othersHeat, rectFromIndices, collapsedDays, todayInZone,
} from './labScheduleUtils';

// Week grid for one lab space.
//  - Everyone: merged presence blocks (avatar stack, depth = headcount, amber =
//    solo, coral ring = over capacity) plus violet event bands.
//  - Edit: 30-minute cells; drag a rectangle (useRectMarquee). Starting on your
//    own time erases instead of adds. Release hands the rectangle to onRect.
export default function LabWeekGrid({ week, meId, mode, canEdit, pending, onRect, onBlockClick, membersById }) {
  const { workspace, dates, blocks, events, occurrences } = week;
  const rows = useMemo(() => rowStarts(workspace.openStartMin, workspace.openEndMin), [workspace.openStartMin, workspace.openEndMin]);
  const editing = mode === 'edit' && canEdit;
  const collapsed = useMemo(() => (editing ? new Set() : collapsedDays(dates, blocks, events)), [editing, dates, blocks, events]);
  const mine = useMemo(() => ownCells(occurrences, meId), [occurrences, meId]);
  const heat = useMemo(() => othersHeat(occurrences, meId), [occurrences, meId]);
  const today = todayInZone(workspace.timezone);
  const height = rows.length * ROW_PX;

  const opRef = useRef('add');
  const [live, setLive] = useState(null);
  const begin = useRectMarquee({
    onChange: (r) => setLive(r ? { ...r, op: opRef.current } : null),
    onEnd: (r, info) => {
      setLive(null);
      if (!info.cancelled) onRect(rectFromIndices(r, dates, rows), opRef.current, info);
    },
  });

  function cellDown(e, di, ti, key) {
    e.preventDefault();
    opRef.current = mine.has(key) ? 'erase' : 'add';
    begin(di, ti, e);
  }

  function selectionOp(date, di, min, ti) {
    if (live) return di >= live.d0 && di <= live.d1 && ti >= live.t0 && ti <= live.t1 ? live.op : null;
    if (pending && pending.rect.dates.includes(date) && min >= pending.rect.startMin && min < pending.rect.endMin) return pending.op;
    return null;
  }

  const cols = `52px ${dates.map((_, i) => (collapsed.has(i) ? '28px' : 'minmax(0, 1fr)')).join(' ')}`;
  const hourLines = rows.filter(m => m % 60 === 0);

  function renderCells(date, di) {
    return rows.map((m, ti) => {
      const key = cellKey(date, m);
      const own = mine.has(key);
      const sel = selectionOp(date, di, m, ti);
      const cls = [
        'pm-lab-cell', `pm-lab-heat-${heatLevel(heat.get(key) ?? 0)}`,
        own && 'is-mine', m % 60 === 0 && 'is-hour',
        sel && `is-sel is-sel-${sel}`, pending?.saving && sel && 'is-saving',
      ].filter(Boolean).join(' ');
      return (
        <div key={m} className={cls} data-mq="1" data-di={di} data-ti={ti}
          aria-label={`${dayHeader(date).dow} ${fmtMin(m)}${own ? ', your time' : ''}`}
          onPointerDown={(e) => cellDown(e, di, ti, key)} />
      );
    });
  }

  function renderBlocks(date) {
    const dayEvents = events.filter(ev => ev.date === date);
    const right = dayEvents.length ? '38%' : '4px';
    return (
      <>
        {hourLines.map(m => (
          <div key={`h${m}`} className="pm-lab-hour-line" style={{ top: ((m - workspace.openStartMin) / SLOT) * ROW_PX }} />
        ))}
        {blocks.filter(b => b.date === date).map(b => {
          const { top, height: h } = blockBox(b.startMin, b.endMin, workspace.openStartMin);
          const n = b.memberIds.length;
          const over = workspace.capacity && n > workspace.capacity;
          const soloName = membersById.get(b.memberIds[0])?.displayName?.split(' ')[0] ?? 'Someone';
          const label = b.solo ? (b.memberIds[0] === meId ? 'Just you' : `${soloName} alone`) : `${n} here`;
          const cls = ['pm-lab-block', `pm-lab-heat-${heatLevel(n)}`, b.solo && 'is-solo', over && 'is-over', b.memberIds.includes(meId) && 'is-with-me']
            .filter(Boolean).join(' ');
          return (
            <button key={`${b.startMin}-${b.endMin}`} type="button" className={cls} style={{ top, height: h, right }}
              aria-label={`${fmtRange(b.startMin, b.endMin)}: ${n === 0 ? 'event' : `${n} ${n === 1 ? 'person' : 'people'}`}`}
              onClick={(e) => onBlockClick(b, e.currentTarget.getBoundingClientRect())}>
              {n > 0 && (
                <span className="pm-lab-avatars">
                  {b.memberIds.slice(0, 4).map(id => <LabAvatar key={id} member={membersById.get(id)} />)}
                  {n > 4 && <span className="pm-lab-avatar-more">+{n - 4}</span>}
                </span>
              )}
              {h >= 40 && n > 0 && <span className="pm-lab-block-label">{label}</span>}
              {h >= 62 && <span className="pm-lab-block-time">{fmtRange(b.startMin, b.endMin)}</span>}
              {b.buddyMemberIds.length > 0 && h >= 40 && (
                <span className="pm-lab-buddy-tag"><i className="fas fa-user-group" aria-hidden="true" /> wants company</span>
              )}
            </button>
          );
        })}
        {dayEvents.map(ev => {
          const { top, height: h } = blockBox(ev.startMin, ev.endMin, workspace.openStartMin);
          return (
            <div key={ev.eventId} className="pm-lab-event" style={{ top, height: h }} title={ev.title}>
              <span className="pm-lab-event-title"><i className="fas fa-flask" aria-hidden="true" /> {ev.title}</span>
              {h >= 40 && <span className="pm-lab-block-time">{fmtRange(ev.startMin, ev.endMin)} · {ev.attendeeIds.length} going</span>}
            </div>
          );
        })}
      </>
    );
  }

  return (
    <div className={`pm-lab-grid${editing ? ' is-editing' : ''}`} style={{ '--pm-lab-row': `${ROW_PX}px` }}>
      <div className="pm-lab-grid-head" style={{ gridTemplateColumns: cols }}>
        <div />
        {dates.map((d, i) => {
          const h = dayHeader(d);
          return (
            <div key={d} className={`pm-lab-day-head${d === today ? ' is-today' : ''}${collapsed.has(i) ? ' is-collapsed' : ''}`}>
              <span className="pm-lab-dow">{collapsed.has(i) ? h.dow[0] : h.dow}</span>
              {!collapsed.has(i) && <span className="pm-lab-dom">{h.dom}</span>}
            </div>
          );
        })}
      </div>
      <div className="pm-lab-grid-body" style={{ gridTemplateColumns: cols }}>
        <div className="pm-lab-gutter" style={{ height }}>
          {hourLines.map(m => (
            <span key={m} className="pm-lab-gutter-label" style={{ top: ((m - workspace.openStartMin) / SLOT) * ROW_PX }}>{fmtMinShort(m)}</span>
          ))}
        </div>
        {dates.map((d, di) => (
          <div key={d} className={`pm-lab-col${collapsed.has(di) ? ' is-collapsed' : ''}`} style={{ height }}>
            {editing ? renderCells(d, di) : !collapsed.has(di) && renderBlocks(d)}
          </div>
        ))}
      </div>
    </div>
  );
}
```

### Task 6.3: `LabShiftPopover.jsx`

**Files:**
- Create: `src/components/clubpm/labschedule/LabShiftPopover.jsx`

- [ ] **Step 1:**

```jsx
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import MobileSheet from '../MobileSheet';
import { describeRect } from './labScheduleUtils';

const STATE_LABEL = { missing: 'needed', expired: 'expired', pending: 'in review' };

// Confirmation after a rectangle drag. Desktop: a floating card near the
// pointer. Phone: a bottom sheet.
export default function LabShiftPopover({ rect, op, point, defaultEndsOn, overlaps, unmet, busy, compact, onConfirm, onCancel }) {
  const adding = op === 'add';
  const initialEnds = defaultEndsOn && defaultEndsOn >= rect.dates[0] ? defaultEndsOn : '';
  const [scope, setScope] = useState('weekly');
  const [endsOn, setEndsOn] = useState(initialEnds);
  const [buddy, setBuddy] = useState(false);
  const inFlight = useRef(false);

  useEffect(() => { setScope('weekly'); setEndsOn(initialEnds); setBuddy(false); }, [rect, initialEnds]);

  useEffect(() => {
    if (compact) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [compact, onCancel]);

  async function submit() {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      await onConfirm({
        scope,
        endsOn: adding && scope === 'weekly' ? (endsOn || null) : null,
        buddyWanted: adding && buddy,
      });
    } finally {
      inFlight.current = false;
    }
  }

  const body = (
    <div className="pm-lab-pop-body">
      <div className="pm-lab-pop-title">
        <i className={adding ? 'fas fa-plus' : 'fas fa-eraser'} aria-hidden="true" /> {adding ? 'Add' : 'Remove'} · {describeRect(rect)}
      </div>
      <div className="pm-lab-seg" role="radiogroup" aria-label="Repeat">
        <button type="button" role="radio" aria-checked={scope === 'weekly'} className={scope === 'weekly' ? 'is-on' : ''} onClick={() => setScope('weekly')}>
          Every week
        </button>
        <button type="button" role="radio" aria-checked={scope === 'dates'} className={scope === 'dates' ? 'is-on' : ''} onClick={() => setScope('dates')}>
          {adding ? 'Just these days' : 'Just this week'}
        </button>
      </div>
      {adding && scope === 'weekly' && (
        <label className="pm-lab-pop-field">
          <span>Until</span>
          <input type="date" className="cpm-form-input" value={endsOn} min={rect.dates[0]} onChange={e => setEndsOn(e.target.value)} />
          {!endsOn && <small>term end</small>}
        </label>
      )}
      {adding && (
        <label className="pm-lab-buddy-toggle">
          <input type="checkbox" checked={buddy} onChange={e => setBuddy(e.target.checked)} />
          <span><i className="fas fa-user-group" aria-hidden="true" /> Looking for company</span>
          <small>Teammates get a heads-up, and you hear when someone joins.</small>
        </label>
      )}
      {adding && overlaps.length > 0 && (
        <div className="pm-lab-pop-overlap">
          <i className="fas fa-circle" aria-hidden="true" /> You&apos;ll overlap {overlaps.map(o => `${o.name} (${o.days.join(', ')})`).join(', ')}
        </div>
      )}
      {adding && overlaps.length === 0 && (
        <div className="pm-lab-pop-alone"><i className="fas fa-moon" aria-hidden="true" /> No one else here yet this week.</div>
      )}
      {adding && unmet.length > 0 && (
        <div className="pm-lab-pop-warn">
          <i className="fas fa-triangle-exclamation" aria-hidden="true" /> {unmet.map(r => `${r.name} (${STATE_LABEL[r.state] ?? r.state})`).join(', ')} — you can still schedule.
        </div>
      )}
    </div>
  );
  const actions = (
    <div className="pm-lab-pop-actions">
      <button type="button" className="cpm-btn cpm-btn-ghost" onClick={onCancel} disabled={busy}>Cancel</button>
      <button type="button" className={adding ? 'cpm-btn cpm-btn-primary' : 'cpm-btn pm-lab-btn-danger'} onClick={submit} disabled={busy}>
        {busy ? 'Saving…' : adding ? 'Add' : 'Remove'}
      </button>
    </div>
  );

  if (compact) {
    return (
      <MobileSheet title={adding ? 'Add lab time' : 'Remove lab time'} onClose={onCancel} footer={actions} className="pm-m-calendar-layer">
        {body}
      </MobileSheet>
    );
  }
  const W = 290;
  const left = Math.min(Math.max(12, (point?.clientX ?? 0) + 14), window.innerWidth - W - 12);
  const top = Math.min(Math.max(12, (point?.clientY ?? 0) - 40), window.innerHeight - 380);
  return createPortal(
    <div className="pm-lab-pop" role="dialog" aria-label={adding ? 'Add lab time' : 'Remove lab time'} style={{ left, top, width: W }}>
      {body}
      {actions}
    </div>,
    document.body,
  );
}
```

### Task 6.4: CSS

**Files:**
- Modify: `public/clubpm-theme.css` (append only — never read the whole file)

- [ ] **Step 1: Find the exact compact media query string** (you will reuse it verbatim):

```bash
rg -n "^@media \(max-width: 767.98px\)" public/clubpm-theme.css
```

Copy the full `@media …` line exactly as printed.

- [ ] **Step 2: Append this block to the end of the file** (replace `<COMPACT MEDIA QUERY>` with the line from Step 1, keeping the `{`):

```css
/* === Lab schedule (workspaces) ============================================= */
.pm-lab-modal {
  background: var(--pm-bg-elevated);
  border: 1px solid var(--pm-border);
  border-top: 3px solid var(--pm-accent-teal);
  border-radius: 14px;
  width: min(1180px, 100%);
  max-height: 92vh;
  display: flex; flex-direction: column;
  overflow: hidden;
  box-shadow: 0 24px 70px rgba(0, 0, 0, 0.5);
}
.pm-lab {
  display: flex; flex-direction: column; gap: 12px;
  padding: 0 20px 20px;
  min-height: 0; overflow: auto;
  color: var(--pm-text-primary);
  font-family: var(--pm-font-body, 'DM Sans', sans-serif);
}
.pm-lab-head {
  display: flex; flex-direction: column; gap: 10px;
  position: sticky; top: 0; z-index: 3;
  padding-top: 4px; padding-bottom: 6px;
  background: var(--pm-bg-elevated);
}
.pm-lab-spaces { display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; }
.pm-lab-space-pill {
  --pm-lab-space: var(--pm-accent-teal);
  display: inline-flex; align-items: center; gap: 7px;
  padding: 6px 12px; border-radius: 999px;
  border: 1px solid var(--pm-border); background: transparent;
  color: var(--pm-text-secondary); font: inherit; font-size: 13px; font-weight: 600;
  white-space: nowrap; cursor: pointer;
  transition: border-color 0.15s, background 0.15s, color 0.15s;
}
.pm-lab-space-pill:hover { color: var(--pm-text-primary); }
.pm-lab-space-pill.is-on {
  color: var(--pm-text-primary);
  border-color: var(--pm-lab-space);
  background: color-mix(in srgb, var(--pm-lab-space) 14%, transparent);
}
.pm-lab-space-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--pm-lab-space); box-shadow: 0 0 8px var(--pm-lab-space); }
.pm-lab-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
.pm-lab-weeknav { display: flex; align-items: center; gap: 4px; }
.pm-lab-weeklabel { margin-left: 8px; font-family: var(--pm-font-display, 'Syne', sans-serif); font-weight: 700; font-size: 15px; }
.pm-lab-mode { display: inline-flex; padding: 3px; border-radius: 10px; background: var(--pm-bg-surface); border: 1px solid var(--pm-border); }
.pm-lab-mode button {
  border: 0; background: transparent; color: var(--pm-text-secondary);
  padding: 6px 12px; border-radius: 8px; font: inherit; font-size: 13px; font-weight: 600;
  display: inline-flex; align-items: center; gap: 6px; cursor: pointer;
}
.pm-lab-mode button.is-on { background: var(--pm-accent-teal); color: #04211f; }
.pm-lab-viewonly { font-size: 12px; color: var(--pm-accent-amber); display: inline-flex; align-items: center; gap: 6px; }
.pm-lab-info { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 14px; font-size: 12px; color: var(--pm-text-secondary); }
.pm-lab-info > span { display: inline-flex; align-items: center; gap: 6px; }
.pm-lab-desc { flex-basis: 100%; }
.pm-lab-req {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 3px 9px; border-radius: 999px; border: 1px solid;
  font-size: 12px; text-decoration: none;
}
.pm-lab-req--ok { color: var(--pm-accent-teal); border-color: rgba(0, 229, 204, 0.35); background: rgba(0, 229, 204, 0.08); }
.pm-lab-req--pending { color: var(--pm-text-secondary); border-color: var(--pm-border); }
.pm-lab-req--missing, .pm-lab-req--expired { color: var(--pm-accent-amber); border-color: rgba(245, 166, 35, 0.4); background: rgba(245, 166, 35, 0.08); }
.pm-lab-req-state { opacity: 0.75; font-size: 11px; }

.pm-lab-main { display: grid; grid-template-columns: minmax(0, 1fr) 260px; gap: 16px; align-items: start; }
.pm-lab-grid-wrap { position: relative; min-width: 0; }
.pm-lab-grid { user-select: none; -webkit-user-select: none; }
.pm-lab-grid-head, .pm-lab-grid-body { display: grid; gap: 4px; }
.pm-lab-grid-head { margin-bottom: 4px; }
.pm-lab-day-head { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 4px 0; }
.pm-lab-dow { font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--pm-text-secondary); }
.pm-lab-dom { font-family: var(--pm-font-display, 'Syne', sans-serif); font-size: 18px; font-weight: 700; width: 30px; height: 30px; display: grid; place-items: center; border-radius: 50%; }
.pm-lab-day-head.is-today .pm-lab-dom { background: var(--pm-accent-teal); color: #04211f; }
.pm-lab-gutter { position: relative; }
.pm-lab-gutter-label {
  position: absolute; right: 6px; transform: translateY(-50%);
  font-family: var(--pm-font-mono, monospace); font-size: 10.5px;
  color: var(--pm-text-secondary); white-space: nowrap;
}
.pm-lab-gutter-label:first-child { transform: none; }
.pm-lab-col { position: relative; background: var(--pm-bg-surface); border: 1px solid var(--pm-border); border-radius: 10px; overflow: hidden; }
.pm-lab-col.is-collapsed { background: repeating-linear-gradient(135deg, transparent 0 6px, rgba(255, 255, 255, 0.025) 6px 12px), var(--pm-bg-surface); }
.pm-lab-hour-line { position: absolute; left: 0; right: 0; border-top: 1px dashed rgba(255, 255, 255, 0.05); pointer-events: none; }

.pm-lab-block {
  position: absolute; left: 4px;
  display: flex; flex-direction: column; align-items: flex-start; gap: 3px;
  padding: 5px 7px; overflow: hidden;
  border: 0; border-left: 3px solid var(--pm-accent-teal); border-radius: 8px;
  color: var(--pm-text-primary); font: inherit; font-size: 11.5px; text-align: left;
  cursor: pointer; transition: transform 0.12s, box-shadow 0.12s;
}
.pm-lab-block:hover, .pm-lab-block:focus-visible { transform: translateY(-1px); box-shadow: 0 6px 18px rgba(0, 0, 0, 0.35); z-index: 2; }
.pm-lab-block.pm-lab-heat-0 { background: rgba(139, 124, 248, 0.08); }
.pm-lab-block.pm-lab-heat-1 { background: rgba(0, 229, 204, 0.14); }
.pm-lab-block.pm-lab-heat-2 { background: rgba(0, 229, 204, 0.24); }
.pm-lab-block.pm-lab-heat-3 { background: rgba(0, 229, 204, 0.34); }
.pm-lab-block.pm-lab-heat-4 { background: rgba(0, 229, 204, 0.46); }
.pm-lab-block.is-solo { background: rgba(245, 166, 35, 0.16); border-left-color: var(--pm-accent-amber); }
.pm-lab-block.is-over { box-shadow: inset 0 0 0 1.5px var(--pm-accent-coral); }
.pm-lab-block.is-with-me { outline: 1px solid rgba(255, 255, 255, 0.18); outline-offset: -1px; }
.pm-lab-avatars { display: flex; align-items: center; }
.pm-lab-avatar {
  display: inline-grid; place-items: center; flex: none;
  width: 20px; height: 20px; margin-right: -6px;
  border-radius: 50%; border: 2px solid var(--pm-bg-surface);
  background: var(--pm-bg-overlay); object-fit: cover;
  font-size: 10px; font-weight: 700; color: var(--pm-text-primary);
}
.pm-lab-avatar-more { margin-left: 10px; font-size: 10px; color: var(--pm-text-secondary); }
.pm-lab-block-label { font-weight: 700; }
.pm-lab-block-time { font-size: 10.5px; color: var(--pm-text-secondary); }
.pm-lab-buddy-tag {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 1px 7px; border-radius: 999px;
  background: var(--pm-accent-amber); color: #2b1a00;
  font-size: 10px; font-weight: 700;
}
.pm-lab-event {
  position: absolute; left: 63%; right: 4px;
  display: flex; flex-direction: column; gap: 2px;
  padding: 5px 7px; overflow: hidden;
  border-left: 3px solid var(--pm-accent-violet); border-radius: 8px;
  background: rgba(139, 124, 248, 0.2); font-size: 11px;
}
.pm-lab-event-title { font-weight: 700; }
.pm-lab-event-title i { color: var(--pm-accent-violet); }

.pm-lab-cell { height: var(--pm-lab-row); border-top: 1px solid rgba(255, 255, 255, 0.03); cursor: crosshair; touch-action: none; }
.pm-lab-cell.is-hour { border-top-color: rgba(255, 255, 255, 0.08); }
.pm-lab-cell.pm-lab-heat-1 { background: rgba(0, 229, 204, 0.05); }
.pm-lab-cell.pm-lab-heat-2 { background: rgba(0, 229, 204, 0.09); }
.pm-lab-cell.pm-lab-heat-3 { background: rgba(0, 229, 204, 0.13); }
.pm-lab-cell.pm-lab-heat-4 { background: rgba(0, 229, 204, 0.18); }
.pm-lab-cell.is-mine { background: var(--pm-accent-teal); box-shadow: inset 0 1px 0 rgba(4, 33, 31, 0.25); }
.pm-lab-cell.is-sel-add { background: rgba(0, 229, 204, 0.3); box-shadow: inset 0 0 0 1px rgba(0, 229, 204, 0.65); }
.pm-lab-cell.is-sel-erase { background: rgba(255, 107, 107, 0.14); }
.pm-lab-cell.is-mine.is-sel-erase { background: rgba(255, 107, 107, 0.55); }
.pm-lab-cell.is-saving { animation: pm-lab-pulse 1s ease-in-out infinite; }
@keyframes pm-lab-pulse { 50% { opacity: 0.55; } }
.pm-lab-hint { margin: 8px 0 0; font-size: 12px; color: var(--pm-text-secondary); display: flex; align-items: center; gap: 6px; }

.pm-lab-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; padding: 48px 16px; text-align: center; color: var(--pm-text-secondary); }
.pm-lab-empty > i { font-size: 28px; color: var(--pm-accent-teal); }
.pm-lab-empty strong { color: var(--pm-text-primary); font-family: var(--pm-font-display, 'Syne', sans-serif); font-size: 16px; }
.pm-lab-empty-overlay {
  position: absolute; left: 72px; right: 20px; top: 90px;
  display: flex; flex-direction: column; align-items: center; gap: 10px;
  padding: 18px; text-align: center; font-size: 13px; color: var(--pm-text-secondary);
  background: rgba(19, 22, 30, 0.88); border: 1px dashed var(--pm-border-active); border-radius: 12px;
  backdrop-filter: blur(4px);
}

.pm-lab-buddies { position: sticky; top: 130px; padding: 12px; background: var(--pm-bg-surface); border: 1px solid var(--pm-border); border-radius: 12px; }
.pm-lab-buddies h3 { margin: 0 0 8px; display: flex; align-items: center; gap: 8px; font-family: var(--pm-font-display, 'Syne', sans-serif); font-size: 13px; color: var(--pm-accent-amber); }
.pm-lab-buddies ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.pm-lab-buddy {
  display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 8px;
  padding: 8px; border-radius: 10px; background: var(--pm-bg-elevated);
  border-left: 3px solid var(--pm-lab-space, var(--pm-accent-amber));
}
.pm-lab-buddy-text { display: flex; flex-direction: column; min-width: 0; font-size: 12px; }
.pm-lab-buddy-text span { font-size: 11px; color: var(--pm-text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pm-lab-buddies-empty { margin: 0; font-size: 12px; color: var(--pm-text-secondary); }

.pm-lab-pop {
  position: fixed; z-index: 5100;
  padding: 14px; border-radius: 12px;
  background: var(--pm-bg-overlay); border: 1px solid var(--pm-border-active);
  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.55);
  color: var(--pm-text-primary); font-family: var(--pm-font-body, 'DM Sans', sans-serif); font-size: 13px;
  animation: pm-lab-pop-in 0.14s ease-out;
}
@keyframes pm-lab-pop-in { from { opacity: 0; transform: translateY(4px) scale(0.98); } to { opacity: 1; transform: none; } }
.pm-lab-pop-body { display: flex; flex-direction: column; gap: 10px; }
.pm-lab-pop-title { font-family: var(--pm-font-display, 'Syne', sans-serif); font-weight: 700; display: flex; align-items: center; gap: 6px; }
.pm-lab-seg { display: flex; overflow: hidden; border: 1px solid var(--pm-border); border-radius: 8px; }
.pm-lab-seg button { flex: 1; padding: 7px 0; border: 0; background: transparent; color: var(--pm-text-secondary); font: inherit; font-size: 12.5px; font-weight: 600; cursor: pointer; }
.pm-lab-seg button.is-on { background: rgba(0, 229, 204, 0.15); color: var(--pm-accent-teal); }
.pm-lab-pop-field { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--pm-text-secondary); }
.pm-lab-pop-field input { flex: 1; }
.pm-lab-buddy-toggle {
  display: grid; grid-template-columns: auto 1fr; column-gap: 8px; align-items: center;
  padding: 8px 10px; border-radius: 10px; cursor: pointer;
  border: 1px solid rgba(245, 166, 35, 0.35); background: rgba(245, 166, 35, 0.07);
}
.pm-lab-buddy-toggle input { accent-color: var(--pm-accent-amber); }
.pm-lab-buddy-toggle small { grid-column: 2; font-size: 11px; color: var(--pm-text-secondary); }
.pm-lab-pop-overlap { font-size: 12px; color: var(--pm-accent-teal); }
.pm-lab-pop-overlap i { font-size: 7px; vertical-align: middle; }
.pm-lab-pop-alone { font-size: 12px; color: var(--pm-text-secondary); }
.pm-lab-pop-warn { font-size: 12px; color: var(--pm-accent-amber); }
.pm-lab-pop-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; }
.pm-lab-btn-danger { background: var(--pm-accent-coral); color: #2a0707; border: 0; }
.pm-lab-detail-list { list-style: none; margin: 8px 0 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.pm-lab-detail-list li { display: grid; grid-template-columns: auto 1fr; gap: 8px; align-items: start; }
.pm-lab-detail-list li > div { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.pm-lab-detail-list li span { font-size: 11px; color: var(--pm-text-secondary); }
.pm-lab-detail-list .pm-lab-buddy-tag { color: #2b1a00; align-self: flex-start; }
.pm-lab-detail-warn { color: var(--pm-accent-amber) !important; }
.pm-lab-detail-events { margin-top: 10px; padding-top: 8px; border-top: 1px solid var(--pm-border); display: flex; flex-direction: column; gap: 4px; font-size: 12px; }
.pm-lab-detail-events i { color: var(--pm-accent-violet); }

.pm-lab-open-btn {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 6px 12px; border-radius: 999px;
  border: 1px solid rgba(0, 229, 204, 0.35); background: rgba(0, 229, 204, 0.08);
  color: var(--pm-accent-teal); font: inherit; font-size: 13px; font-weight: 600; cursor: pointer;
}
.pm-lab-open-btn:hover { background: rgba(0, 229, 204, 0.16); }
.pm-lab-open-badge {
  display: inline-grid; place-items: center; min-width: 18px; height: 18px; padding: 0 5px;
  border-radius: 9px; background: var(--pm-accent-amber); color: #2b1a00; font-size: 11px; font-weight: 800;
}
.pm-lab-event-chip {
  --pm-lab-space: var(--pm-accent-teal);
  padding: 2px 10px; border-radius: 999px; cursor: pointer;
  border: 1px solid var(--pm-lab-space); background: color-mix(in srgb, var(--pm-lab-space) 12%, transparent);
  color: var(--pm-text-primary); font: inherit;
}
.pm-lab-form-hint { font-size: 11px; color: var(--pm-text-secondary); }

.pm-lab-admin-list { display: flex; flex-direction: column; gap: 8px; margin: 12px 0; }
.pm-lab-admin-row {
  --pm-lab-space: var(--pm-accent-teal);
  display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 10px;
  padding: 10px 12px; border-radius: 10px; text-align: left; cursor: pointer;
  background: var(--pm-bg-surface); border: 1px solid var(--pm-border); border-left: 3px solid var(--pm-lab-space);
  color: var(--pm-text-primary); font: inherit;
}
.pm-lab-admin-row.is-archived { opacity: 0.55; }
.pm-lab-admin-row small { display: block; color: var(--pm-text-secondary); font-size: 11.5px; }
.pm-lab-admin-form { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px 16px; margin-top: 12px; }
.pm-lab-admin-form .is-wide { grid-column: 1 / -1; }
.pm-lab-chip-picker { display: flex; flex-wrap: wrap; gap: 6px; max-height: 150px; overflow: auto; padding: 2px; }
.pm-lab-chip {
  padding: 4px 10px; border-radius: 999px; cursor: pointer;
  border: 1px solid var(--pm-border); background: transparent; color: var(--pm-text-secondary);
  font: inherit; font-size: 12px;
}
.pm-lab-chip.is-on { border-color: var(--pm-accent-teal); color: var(--pm-accent-teal); background: rgba(0, 229, 204, 0.1); }
.pm-lab-admin-actions { grid-column: 1 / -1; display: flex; justify-content: flex-end; gap: 8px; }
.pm-lab-admin-error { grid-column: 1 / -1; color: var(--pm-accent-coral); font-size: 12px; }

@media (max-width: 900px) {
  .pm-lab-main { grid-template-columns: 1fr; }
  .pm-lab-buddies { position: static; }
  .pm-lab-admin-form { grid-template-columns: 1fr; }
}
@media (prefers-reduced-motion: reduce) {
  .pm-lab-block, .pm-lab-pop, .pm-lab-cell.is-saving { transition: none; animation: none; }
}

/* Lab schedule — phone shell. The modal is a MobileSheet portalled to <body>,
   so it is reached through the body.pm-m-compact marker, not .pm-shell--compact. */
<COMPACT MEDIA QUERY> {
  body.pm-m-compact .pm-lab { padding: 0 0 16px; }
  body.pm-m-compact .pm-lab-head { position: static; }
  body.pm-m-compact .pm-lab-grid-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
  body.pm-m-compact .pm-lab-grid { min-width: 560px; }
  body.pm-m-compact .pm-lab-grid-head,
  body.pm-m-compact .pm-lab-grid-body { gap: 2px; }
  body.pm-m-compact .pm-lab-dom { font-size: 15px; width: 26px; height: 26px; }
  body.pm-m-compact .pm-lab-block { padding: 3px 4px; }
  body.pm-m-compact .pm-lab-block-time { display: none; }
  body.pm-m-compact .pm-lab-empty-overlay { left: 12px; right: 12px; }
}
```

- [ ] **Step 3: Gate + commit**

```bash
npm run build
git add src/components/clubpm/labschedule/LabAvatar.jsx src/components/clubpm/labschedule/LabWeekGrid.jsx src/components/clubpm/labschedule/LabShiftPopover.jsx public/clubpm-theme.css
git commit -m "feat(lab): week grid, shift popover and lab schedule styles"
```

---

## Phase 7 — Modal, header, buddy list

### Task 7.1: Modal test first

**Files:**
- Create: `src/components/clubpm/labschedule/LabScheduleModal.test.jsx`

- [ ] **Step 1:**

```jsx
import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import LabScheduleModal from './LabScheduleModal';
import { listWorkspaces, getWorkspaceWeek, listLabBuddyRequests } from '../../../api/clubPmClient';

jest.mock('../../../api/clubPmClient', () => ({
  listWorkspaces: jest.fn(),
  getWorkspaceWeek: jest.fn(),
  applyLabRect: jest.fn(),
  listLabBuddyRequests: jest.fn(),
}));
jest.mock('../../../clubpm/ClubPmAuth', () => ({ useClubPmAuth: () => ({ member: { id: 'me' } }) }));

const SPACE = {
  id: 'ws1', name: 'Propulsion Lab', slug: 'propulsion-lab', color: '#00e5cc', timezone: 'America/New_York',
  openStartMin: 480, openEndMin: 1320, capacity: 6, location: 'ARMS 1010', description: null,
  defaultEndsOn: '2026-12-13', archived: false, projects: [],
  requirements: [{ id: 'r1', kind: 'training', refId: 't1', name: 'Lab Safety', url: null }],
};
const DATES = ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'];
const week = (over = {}) => ({
  workspace: SPACE, dates: DATES,
  blocks: [{ date: '2026-09-28', startMin: 720, endMin: 900, memberIds: ['a', 'b', 'c'], headcount: 3, solo: false, buddyMemberIds: [], eventIds: [] }],
  events: [], occurrences: [], myShifts: [],
  members: ['a', 'b', 'c'].map(id => ({ id, displayName: `Member ${id}`, avatarUrl: null, projects: [] })),
  requirementStatus: { me: { r1: 'missing' } },
  canSchedule: true,
  ...over,
});

function renderModal() {
  return render(<MemoryRouter><LabScheduleModal isOpen onClose={() => {}} /></MemoryRouter>);
}

beforeEach(() => {
  listWorkspaces.mockResolvedValue([SPACE]);
  listLabBuddyRequests.mockResolvedValue([]);
});

test('renders the space, a presence block and my requirement status', async () => {
  getWorkspaceWeek.mockResolvedValue(week());
  renderModal();
  expect(await screen.findByText('3 here')).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: /Propulsion Lab/ })).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByText('Lab Safety')).toBeInTheDocument();
  expect(screen.getByRole('radio', { name: /Edit my time/ })).toBeInTheDocument();
});

test('view-only members see no edit toggle', async () => {
  getWorkspaceWeek.mockResolvedValue(week({ canSchedule: false }));
  renderModal();
  expect(await screen.findByText(/View only/)).toBeInTheDocument();
  expect(screen.queryByRole('radio', { name: /Edit my time/ })).not.toBeInTheDocument();
});

test('empty week shows the empty state', async () => {
  getWorkspaceWeek.mockResolvedValue(week({ blocks: [] }));
  renderModal();
  expect(await screen.findByText(/No one scheduled here this week yet/)).toBeInTheDocument();
});

test('no spaces shows guidance', async () => {
  listWorkspaces.mockResolvedValue([]);
  renderModal();
  expect(await screen.findByText('No lab spaces yet')).toBeInTheDocument();
});
```

Run: `npm run test:ci -- src/components/clubpm/labschedule/LabScheduleModal.test.jsx` → FAIL (module not found).

### Task 7.2: `LabSpaceHeader.jsx`

**Files:**
- Create: `src/components/clubpm/labschedule/LabSpaceHeader.jsx`

- [ ] **Step 1:**

```jsx
import { Link } from 'react-router-dom';
import { weekLabel } from './labScheduleUtils';

const REQ_ICON = {
  ok: 'fas fa-circle-check', pending: 'fas fa-hourglass-half',
  expired: 'fas fa-clock-rotate-left', missing: 'fas fa-triangle-exclamation',
};
const REQ_LABEL = { ok: 'Done', pending: 'In review', expired: 'Expired', missing: 'Needed' };

function RequirementChip({ req, state }) {
  const inner = (
    <>
      <i className={REQ_ICON[state]} aria-hidden="true" /> {req.name}
      <span className="pm-lab-req-state">{REQ_LABEL[state]}</span>
    </>
  );
  const cls = `pm-lab-req pm-lab-req--${state}`;
  if (req.url?.startsWith('/')) return <Link className={cls} to={req.url}>{inner}</Link>;
  if (req.url) return <a className={cls} href={req.url} target="_blank" rel="noreferrer">{inner}</a>;
  return <span className={cls}>{inner}</span>;
}

export default function LabSpaceHeader({ spaces, spaceId, onSpace, dates, onWeek, mode, onMode, canSchedule, space, myStatus }) {
  return (
    <div className="pm-lab-head">
      <div className="pm-lab-spaces" role="tablist" aria-label="Lab spaces">
        {spaces.map(s => (
          <button key={s.id} type="button" role="tab" aria-selected={s.id === spaceId}
            className={`pm-lab-space-pill${s.id === spaceId ? ' is-on' : ''}`}
            style={{ '--pm-lab-space': s.color }} onClick={() => onSpace(s.id)}>
            <span className="pm-lab-space-dot" aria-hidden="true" />
            {s.name}
          </button>
        ))}
      </div>

      <div className="pm-lab-toolbar">
        <div className="pm-lab-weeknav">
          <button type="button" className="cpm-icon-btn" onClick={() => onWeek(-1)} aria-label="Previous week">
            <i className="fas fa-chevron-left" aria-hidden="true" />
          </button>
          <button type="button" className="cpm-btn cpm-btn-ghost" onClick={() => onWeek(0)}>Today</button>
          <button type="button" className="cpm-icon-btn" onClick={() => onWeek(1)} aria-label="Next week">
            <i className="fas fa-chevron-right" aria-hidden="true" />
          </button>
          {dates && <span className="pm-lab-weeklabel">{weekLabel(dates)}</span>}
        </div>
        {canSchedule ? (
          <div className="pm-lab-mode" role="radiogroup" aria-label="View">
            <button type="button" role="radio" aria-checked={mode === 'everyone'} className={mode === 'everyone' ? 'is-on' : ''} onClick={() => onMode('everyone')}>
              <i className="fas fa-users" aria-hidden="true" /> Everyone
            </button>
            <button type="button" role="radio" aria-checked={mode === 'edit'} className={mode === 'edit' ? 'is-on' : ''} onClick={() => onMode('edit')}>
              <i className="fas fa-pen" aria-hidden="true" /> Edit my time
            </button>
          </div>
        ) : space && dates && (
          <span className="pm-lab-viewonly">
            <i className="fas fa-eye" aria-hidden="true" /> View only — ask an admin to assign this space to your project
          </span>
        )}
      </div>

      {space && (
        <div className="pm-lab-info">
          {space.location && <span><i className="fas fa-location-dot" aria-hidden="true" /> {space.location}</span>}
          {space.capacity && <span><i className="fas fa-user-group" aria-hidden="true" /> Up to {space.capacity}</span>}
          {space.requirements.map(r => <RequirementChip key={r.id} req={r} state={myStatus?.[r.id] ?? 'missing'} />)}
          {space.description && <span className="pm-lab-desc">{space.description}</span>}
        </div>
      )}
    </div>
  );
}
```

### Task 7.3: `BuddyRequestList.jsx`

**Files:**
- Create: `src/components/clubpm/labschedule/BuddyRequestList.jsx`

- [ ] **Step 1:**

```jsx
import LabAvatar from './LabAvatar';
import { dayHeader, fmtRange } from './labScheduleUtils';

export default function BuddyRequestList({ requests, onJoin }) {
  return (
    <aside className="pm-lab-buddies" aria-label="Looking for company">
      <h3><i className="fas fa-user-group" aria-hidden="true" /> Looking for company</h3>
      {requests.length === 0 ? (
        <p className="pm-lab-buddies-empty">No open requests in your spaces for the next two weeks.</p>
      ) : (
        <ul>
          {requests.map(r => {
            const d = dayHeader(r.date);
            return (
              <li key={`${r.shiftId}|${r.date}`} className="pm-lab-buddy" style={{ '--pm-lab-space': r.color }}>
                <LabAvatar member={r.member} size={26} />
                <div className="pm-lab-buddy-text">
                  <strong>{r.member.displayName}</strong>
                  <span>{r.workspaceName} · {d.dow} {d.month} {d.dom} · {fmtRange(r.startMin, r.endMin)}</span>
                </div>
                <button type="button" className="cpm-btn cpm-btn-ghost" onClick={() => onJoin(r)}>Join</button>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}
```

### Task 7.4: `LabScheduleModal.jsx`

**Files:**
- Create: `src/components/clubpm/labschedule/LabScheduleModal.jsx`

- [ ] **Step 1:**

```jsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import toast from 'react-hot-toast';
import MobileSheet from '../MobileSheet';
import { useClubPmAuth } from '../../../clubpm/ClubPmAuth';
import { listWorkspaces, getWorkspaceWeek, applyLabRect, listLabBuddyRequests } from '../../../api/clubPmClient';
import LabSpaceHeader from './LabSpaceHeader';
import LabWeekGrid from './LabWeekGrid';
import LabShiftPopover from './LabShiftPopover';
import BuddyRequestList from './BuddyRequestList';
import LabAvatar from './LabAvatar';
import { addDays, mondayOf, todayInZone, overlapNames, unmetRequirements, dayHeader, fmtRange } from './labScheduleUtils';

function BlockDetails({ block, box, week, meId, membersById, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    const onDown = (e) => { if (!e.target.closest?.('.pm-lab-detail')) onClose(); };
    window.addEventListener('keydown', onKey);
    const t = setTimeout(() => window.addEventListener('pointerdown', onDown), 0);
    return () => { clearTimeout(t); window.removeEventListener('keydown', onKey); window.removeEventListener('pointerdown', onDown); };
  }, [onClose]);

  const W = 300;
  const left = Math.min(Math.max(12, box.right + 8), window.innerWidth - W - 12);
  const top = Math.min(Math.max(12, box.top), window.innerHeight - 320);
  const events = week.events.filter(ev => block.eventIds.includes(ev.eventId));
  const reqs = week.workspace.requirements;

  return createPortal(
    <div className="pm-lab-pop pm-lab-detail" role="dialog" aria-label="Who's here" style={{ left, top, width: W }}>
      <div className="pm-lab-pop-title">{dayHeader(block.date).dow} · {fmtRange(block.startMin, block.endMin)}</div>
      <ul className="pm-lab-detail-list">
        {block.memberIds.map(id => {
          const m = membersById.get(id);
          const missing = reqs.filter(r => (week.requirementStatus?.[id]?.[r.id] ?? 'missing') !== 'ok');
          return (
            <li key={id}>
              <LabAvatar member={m} size={28} />
              <div>
                <strong>{id === meId ? 'You' : (m?.displayName ?? 'Someone')}</strong>
                <span>{m?.projects?.map(p => p.name).join(', ') || 'Event attendee'}</span>
                {block.buddyMemberIds.includes(id) && <span className="pm-lab-buddy-tag"><i className="fas fa-user-group" aria-hidden="true" /> wants company</span>}
                {missing.length > 0 && (
                  <span className="pm-lab-detail-warn"><i className="fas fa-triangle-exclamation" aria-hidden="true" /> Missing {missing.map(r => r.name).join(', ')}</span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {events.length > 0 && (
        <div className="pm-lab-detail-events">
          {events.map(ev => <div key={ev.eventId}><i className="fas fa-flask" aria-hidden="true" /> {ev.title}</div>)}
        </div>
      )}
    </div>,
    document.body,
  );
}

export default function LabScheduleModal({ isOpen, onClose, projectId = null, initialWorkspaceId = null, compact = false }) {
  const { member } = useClubPmAuth();
  const meId = member?.id;
  const [spaces, setSpaces] = useState(null);     // null while loading
  const [spaceId, setSpaceId] = useState(null);
  const [monday, setMonday] = useState(null);
  const [week, setWeek] = useState(null);
  const [weekError, setWeekError] = useState('');
  const [mode, setMode] = useState('everyone');
  const [pending, setPending] = useState(null);   // { rect, op, point, saving }
  const [detail, setDetail] = useState(null);     // { block, box }
  const [buddies, setBuddies] = useState([]);
  const reqId = useRef(0);

  const refreshBuddies = useCallback(() => {
    listLabBuddyRequests(projectId).then(r => setBuddies(Array.isArray(r) ? r : [])).catch(() => {});
  }, [projectId]);

  useEffect(() => {
    if (!isOpen) return undefined;
    let alive = true;
    setSpaces(null); setWeek(null); setPending(null); setDetail(null); setMode('everyone');
    listWorkspaces(projectId ? { projectId } : {})
      .then(list => {
        if (!alive) return;
        const arr = Array.isArray(list) ? list : [];
        setSpaces(arr);
        const first = arr.find(s => s.id === initialWorkspaceId) ?? arr[0];
        setSpaceId(first?.id ?? null);
        setMonday(first ? mondayOf(todayInZone(first.timezone)) : null);
      })
      .catch(() => { if (alive) setSpaces([]); });
    refreshBuddies();
    return () => { alive = false; };
  }, [isOpen, projectId, initialWorkspaceId, refreshBuddies]);

  const loadWeek = useCallback(async () => {
    if (!spaceId || !monday) return;
    const id = ++reqId.current;
    setWeekError('');
    try {
      const w = await getWorkspaceWeek(spaceId, monday);
      if (id === reqId.current) setWeek(w);
    } catch (err) {
      if (id === reqId.current) setWeekError(err?.message ?? 'Could not load this week.');
    }
  }, [spaceId, monday]);
  useEffect(() => { if (isOpen) loadWeek(); }, [isOpen, loadWeek]);

  const membersById = useMemo(() => new Map((week?.members ?? []).map(m => [m.id, m])), [week]);
  const space = week?.workspace ?? spaces?.find(s => s.id === spaceId) ?? null;
  const myStatus = week?.requirementStatus?.[meId];
  const unmet = useMemo(() => (space && week ? unmetRequirements(space, myStatus) : []), [space, week, myStatus]);

  function selectSpace(id) {
    const s = spaces.find(x => x.id === id);
    setSpaceId(id); setWeek(null); setPending(null); setDetail(null);
    setMonday(mondayOf(todayInZone(s.timezone)));
  }
  function moveWeek(delta) {
    setPending(null); setDetail(null); setWeek(null);
    setMonday(m => (delta === 0 ? mondayOf(todayInZone(space.timezone)) : addDays(m, 7 * delta)));
  }
  function changeMode(m) { setPending(null); setDetail(null); setMode(m); }

  async function confirm({ scope, endsOn, buddyWanted }) {
    if (!pending) return;
    const { rect, op } = pending;
    setPending(p => ({ ...p, saving: true }));
    try {
      const next = await applyLabRect(spaceId, {
        op, scope, dates: rect.dates, startMin: rect.startMin, endMin: rect.endMin, endsOn, buddyWanted,
      });
      setWeek(next);
      setPending(null);
      toast.success(op === 'add' ? 'Lab time added' : 'Lab time removed');
      refreshBuddies();
    } catch (err) {
      setPending(null);
      toast.error(err?.message ?? 'Could not save your lab time.');
    }
  }

  function joinBuddy(req) {
    if (req.workspaceId !== spaceId) { setSpaceId(req.workspaceId); setWeek(null); }
    setMonday(mondayOf(req.date));
    setMode('edit');
    setDetail(null);
    setPending({
      rect: { dates: [req.date], startMin: req.startMin, endMin: req.endMin },
      op: 'add',
      point: { clientX: window.innerWidth / 2 - 145, clientY: window.innerHeight / 3 },
      saving: false,
    });
  }

  if (!isOpen) return null;

  let body;
  if (spaces === null) {
    body = <div className="pm-lab-empty"><i className="fas fa-spinner fa-spin" aria-hidden="true" /> Loading spaces…</div>;
  } else if (spaces.length === 0) {
    body = (
      <div className="pm-lab-empty">
        <i className="fas fa-flask" aria-hidden="true" />
        <strong>No lab spaces yet</strong>
        {projectId ? 'No spaces are assigned to this project yet. Ask an admin to add one.' : 'Admins can add spaces from the Admin page.'}
      </div>
    );
  } else {
    body = (
      <>
        <LabSpaceHeader
          spaces={spaces} spaceId={spaceId} onSpace={selectSpace}
          dates={week?.dates} onWeek={moveWeek}
          mode={mode} onMode={changeMode}
          canSchedule={!!week?.canSchedule} space={space} myStatus={myStatus}
        />
        <div className="pm-lab-main">
          <div className="pm-lab-grid-wrap">
            {weekError ? (
              <div className="pm-lab-empty">
                <i className="fas fa-triangle-exclamation" aria-hidden="true" /> {weekError}
                <button type="button" className="cpm-btn cpm-btn-ghost" onClick={loadWeek}>Retry</button>
              </div>
            ) : !week ? (
              <div className="pm-lab-empty"><i className="fas fa-spinner fa-spin" aria-hidden="true" /> Loading week…</div>
            ) : (
              <>
                <LabWeekGrid
                  week={week} meId={meId} mode={mode} canEdit={week.canSchedule} pending={pending}
                  membersById={membersById}
                  onRect={(rect, op, point) => { setDetail(null); setPending({ rect, op, point, saving: false }); }}
                  onBlockClick={(block, box) => setDetail({ block, box })}
                />
                {mode === 'everyone' && week.blocks.length === 0 && week.events.length === 0 && (
                  <div className="pm-lab-empty-overlay">
                    No one scheduled here this week yet.
                    {week.canSchedule && (
                      <button type="button" className="cpm-btn cpm-btn-primary" onClick={() => changeMode('edit')}>
                        <i className="fas fa-plus" aria-hidden="true" /> Add my lab time
                      </button>
                    )}
                  </div>
                )}
                {mode === 'edit' && (
                  <p className="pm-lab-hint">
                    <i className="fas fa-vector-square" aria-hidden="true" /> Drag a box across days &amp; times. Start on your own time to remove it.
                  </p>
                )}
              </>
            )}
          </div>
          <BuddyRequestList requests={buddies} onJoin={joinBuddy} />
        </div>
      </>
    );
  }

  const content = (
    <div className="pm-lab">
      {body}
      {pending && week && (
        <LabShiftPopover
          rect={pending.rect} op={pending.op} point={pending.point}
          defaultEndsOn={space?.defaultEndsOn ?? ''}
          overlaps={overlapNames(pending.rect, week.occurrences, meId, membersById)}
          unmet={unmet} busy={pending.saving} compact={compact}
          onConfirm={confirm} onCancel={() => setPending(null)}
        />
      )}
      {detail && week && (
        <BlockDetails block={detail.block} box={detail.box} week={week} meId={meId} membersById={membersById} onClose={() => setDetail(null)} />
      )}
    </div>
  );

  if (compact) {
    return (
      <MobileSheet title="Lab schedule" onClose={onClose} variant="fullscreen" className="pm-m-calendar-layer">
        {content}
      </MobileSheet>
    );
  }
  return createPortal(
    <div className="cpm-modal-overlay" onClick={e => { if (e.target === e.currentTarget && !pending) onClose(); }}>
      <div className="pm-lab-modal" role="dialog" aria-modal="true" aria-labelledby="pm-lab-title" onClick={e => e.stopPropagation()}>
        <div className="cpm-event-modal-header">
          <h2 id="pm-lab-title" className="cpm-event-modal-title">
            <span className="cpm-event-modal-icon" style={{ background: 'var(--pm-accent-teal)', color: '#04211f' }}>
              <i className="fas fa-flask" aria-hidden="true" />
            </span>
            Lab schedule
          </h2>
          <button type="button" className="cpm-icon-btn" onClick={onClose} aria-label="Close">
            <i className="fas fa-times" aria-hidden="true" />
          </button>
        </div>
        {content}
      </div>
    </div>,
    document.body,
  );
}
```

- [ ] **Step 2: Run tests + gate + commit**

```bash
npm run test:ci -- src/components/clubpm/labschedule
npm run build
git add src/components/clubpm/labschedule
git commit -m "feat(lab): lab schedule modal with space header and buddy list"
```

If a test fails because the `Lab Safety` text is split across elements, use `screen.getByText(/Lab Safety/)` instead — do not change the component's markup to satisfy the test.

---

## Phase 8 — Entry points + tour anchors

### Task 8.1: `LabTimeButton.jsx`

**Files:**
- Create: `src/components/clubpm/labschedule/LabTimeButton.jsx`

- [ ] **Step 1:**

```jsx
import { useEffect, useState } from 'react';
import LabScheduleModal from './LabScheduleModal';
import { listWorkspaces, listLabBuddyRequests } from '../../../api/clubPmClient';

// Project header entry point. Renders nothing when the project has no lab spaces.
export default function LabTimeButton({ projectId, compact = false }) {
  const [hasSpaces, setHasSpaces] = useState(false);
  const [buddyCount, setBuddyCount] = useState(0);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    listWorkspaces({ projectId })
      .then(l => { if (alive) setHasSpaces(Array.isArray(l) && l.length > 0); })
      .catch(() => {});
    listLabBuddyRequests(projectId)
      .then(r => { if (alive) setBuddyCount(Array.isArray(r) ? r.length : 0); })
      .catch(() => {});
    return () => { alive = false; };
  }, [projectId]);

  if (!hasSpaces) return null;
  return (
    <>
      <button type="button" className="pm-lab-open-btn" data-tour-id="project.lab" onClick={() => setOpen(true)} title="Lab schedule">
        <i className="fas fa-flask" aria-hidden="true" /> Lab time
        {buddyCount > 0 && (
          <span className="pm-lab-open-badge" aria-label={`${buddyCount} open requests for company`}>{buddyCount}</span>
        )}
      </button>
      <LabScheduleModal isOpen={open} onClose={() => setOpen(false)} projectId={projectId} compact={compact} />
    </>
  );
}
```

### Task 8.2: Project page

**Files:**
- Modify: `src/pages/ClubPM/ProjectDetail.jsx` (never read in full)

- [ ] **Step 1:** Add the import near the other component imports (find `rg -n "^import .*components/clubpm" src/pages/ClubPM/ProjectDetail.jsx | head -3` and add below the first):

```jsx
import LabTimeButton from "../../components/clubpm/labschedule/LabTimeButton";
```

- [ ] **Step 2:** Find `<div className="pm-proj-hero-actions">` (`rg -n 'className="pm-proj-hero-actions"' src/pages/ClubPM/ProjectDetail.jsx`). Insert directly after that opening tag:

```jsx
              <LabTimeButton projectId={project.id} compact={compact} />
```

### Task 8.3: Calendar page

**Files:**
- Modify: `src/pages/ClubPM/CalendarPage.jsx` (never read in full)

- [ ] **Step 1: Imports.** Below `import MeetingPollBoard from '../../components/clubpm/MeetingPollBoard';` add:

```jsx
import LabScheduleModal from '../../components/clubpm/labschedule/LabScheduleModal';
```

and add `listWorkspaces,` to the existing `import { get, post, patch, … } from '../../api/clubPmClient';` list.

- [ ] **Step 2: State.** Below `const [members, setMembers]   = useState([]);` add:

```jsx
  const [workspaces, setWorkspaces] = useState([]);
  const [showLab, setShowLab] = useState(false);
  const [labSpaceId, setLabSpaceId] = useState(null);
```

- [ ] **Step 3: Load spaces.** In the mount effect that calls `get('/api/members')` (find `// Fetch tasks, projects, members once on mount`), add after the `get('/api/members')…` chain:

```jsx
    listWorkspaces()
      .then(data => setWorkspaces(Array.isArray(data) ? data : []))
      .catch(() => {});
```

- [ ] **Step 4: `?lab=<id>` deep link** (notifications link here). Run `rg -n "searchParams" src/pages/ClubPM/CalendarPage.jsx | head -5` to see how `searchParams`, `navigate` and `location` are already obtained. Below the state from Step 2 — but after those hooks are declared — add:

```jsx
  const labParam = searchParams.get('lab');
  useEffect(() => {
    if (labParam) { setLabSpaceId(labParam); setShowLab(true); }
  }, [labParam]);
  const closeLab = useCallback(() => {
    setShowLab(false);
    if (labParam) {
      const next = new URLSearchParams(searchParams);
      next.delete('lab');
      navigate(`${location.pathname}${next.size ? `?${next}` : ''}`, { replace: true });
    }
  }, [labParam, searchParams, navigate, location.pathname]);
```

Make sure `useCallback` is imported from `react` at the top of the file.

- [ ] **Step 5: Toolbar button.** In `toolbarActions={ <> … </> }`, insert as the first child (before the `New Poll` button):

```jsx
              <button
                type="button"
                className="cpm-btn cpm-btn-ghost"
                data-tour-id="calendar.lab"
                onClick={() => { setLabSpaceId(null); setShowLab(true); }}
              >
                <i className="fas fa-flask" style={{ marginRight: 6 }} aria-hidden="true" />
                Lab schedule
              </button>
```

- [ ] **Step 6: Mount the modal.** Directly above `{/* Event form modal */}` add:

```jsx
      <LabScheduleModal
        isOpen={showLab}
        onClose={closeLab}
        initialWorkspaceId={labSpaceId}
        compact={compact}
      />
```

- [ ] **Step 7: Event detail shows the space.** In `function EventDetailModal({ … })` add `onOpenLab` to the destructured props. After the `{/* Location */}` `DetailRow` block, add:

```jsx
          {event.workspace && (
            <DetailRow icon="fas fa-flask" label="Lab space">
              <button type="button" className="pm-lab-event-chip" style={{ '--pm-lab-space': event.workspace.color }}
                onClick={() => onOpenLab?.(event.workspace.id)}>
                {event.workspace.name}
              </button>
            </DetailRow>
          )}
```

Where `<EventDetailModal` is rendered, add the prop:

```jsx
        onOpenLab={(id) => { closeEvent(); setLabSpaceId(id); setShowLab(true); }}
```

- [ ] **Step 8: Pass spaces to the event form.** On `<EventFormModal`, add `workspaces={workspaces}` (Phase 9 consumes it; an unused prop is harmless until then).

### Task 8.4: Tour anchors

**Files:**
- Modify: `src/clubpm/tour/tourAnchors.js`
- Modify: `docs/courses/ANCHORS.md`

- [ ] **Step 1:** In `tourAnchors.js`, below the `"calendar.event":` line add:

```js
  "calendar.lab":           { label: "Lab schedule button",  route: "/clubpm/calendar", note: "Opens the lab schedule modal" },
```

and below the `"project.header":` line add:

```js
  "project.lab":            { label: "Lab time button",      route: "/clubpm/projects/:id", note: "Only rendered when the project has assigned lab spaces" },
```

- [ ] **Step 2:** In `docs/courses/ANCHORS.md`, below the row starting ``| `calendar.event` `` add:

```md
| `calendar.lab` | Lab schedule button | `/clubpm/calendar` |
```

and below the row starting ``| `project.header` `` add:

```md
| `project.lab` | Lab time button (only when the project has lab spaces) | `/clubpm/projects/:id` |
```

- [ ] **Step 3: Gate + commit**

```bash
node scripts/check-tour-anchors.js
npm run test:ci -- src/components/clubpm/labschedule src/pages/ClubPM/CalendarPage.compact.test.jsx
npm run build
git add src/components/clubpm/labschedule/LabTimeButton.jsx src/pages/ClubPM/ProjectDetail.jsx src/pages/ClubPM/CalendarPage.jsx src/clubpm/tour/tourAnchors.js docs/courses/ANCHORS.md
git commit -m "feat(lab): open the lab schedule from the calendar and project pages"
```

If `check-tour-anchors.js` complains about a missing `layout` for `project.lab`, copy the `layout` key convention of `project.header` only if the script demands it.

---

## Phase 9 — Admin panel + event form

### Task 9.1: `WorkspaceAdminPanel.jsx`

**Files:**
- Create: `src/components/clubpm/admin/WorkspaceAdminPanel.jsx`

- [ ] **Step 1:**

```jsx
import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import ConfirmInline from '../ConfirmInline';
import {
  get, listWorkspaces, createWorkspace, updateWorkspace, archiveWorkspace,
  setWorkspaceProjects, setWorkspaceRequirements, listTrainings, listCourses,
} from '../../../api/clubPmClient';
import { fmtMin } from '../labschedule/labScheduleUtils';

const EMPTY = {
  name: '', description: '', location: '', color: '#00e5cc', capacity: '',
  timezone: 'America/New_York', openStartMin: 480, openEndMin: 1320, defaultEndsOn: '',
  projectIds: [], trainingIds: [], courseIds: [],
};
const TIMES = Array.from({ length: 49 }, (_, i) => i * 30);
const ZONES = ['America/New_York', 'America/Indiana/Indianapolis', 'America/Chicago', 'America/Denver', 'America/Los_Angeles'];
const asList = (d, key) => (Array.isArray(d) ? d : (d?.[key] ?? []));

function ChipPicker({ items, selected, onToggle, label, empty }) {
  return (
    <div className="cpm-form-field is-wide">
      <span className="cpm-form-label">{label}</span>
      {items.length === 0 ? <span className="pm-lab-form-hint">{empty}</span> : (
        <div className="pm-lab-chip-picker">
          {items.map(it => (
            <button key={it.id} type="button" className={`pm-lab-chip${selected.includes(it.id) ? ' is-on' : ''}`}
              aria-pressed={selected.includes(it.id)} onClick={() => onToggle(it.id)}>
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function WorkspaceAdminPanel() {
  const [spaces, setSpaces] = useState([]);
  const [projects, setProjects] = useState([]);
  const [trainings, setTrainings] = useState([]);
  const [courses, setCourses] = useState([]);
  const [editing, setEditing] = useState(null); // null | 'new' | workspace
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef(false);

  const reload = useCallback(() => {
    listWorkspaces({ includeArchived: 1 }).then(l => setSpaces(Array.isArray(l) ? l : [])).catch(() => {});
  }, []);
  useEffect(() => {
    reload();
    get('/api/projects').then(d => setProjects(asList(d, 'projects'))).catch(() => {});
    listTrainings().then(d => setTrainings(asList(d, 'trainings').filter(t => !t.archivedAt))).catch(() => {});
    listCourses().then(d => setCourses(asList(d, 'courses'))).catch(() => {});
  }, [reload]);

  function startEdit(ws) {
    setError('');
    if (ws === 'new') { setForm(EMPTY); setEditing('new'); return; }
    setForm({
      name: ws.name, description: ws.description ?? '', location: ws.location ?? '', color: ws.color,
      capacity: ws.capacity ?? '', timezone: ws.timezone, openStartMin: ws.openStartMin, openEndMin: ws.openEndMin,
      defaultEndsOn: ws.defaultEndsOn ?? '',
      projectIds: ws.projects.map(p => p.id),
      trainingIds: ws.requirements.filter(r => r.kind === 'training').map(r => r.refId),
      courseIds: ws.requirements.filter(r => r.kind === 'course').map(r => r.refId),
    });
    setEditing(ws);
  }
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const toggle = (k, id) => setForm(f => ({ ...f, [k]: f[k].includes(id) ? f[k].filter(x => x !== id) : [...f[k], id] }));

  async function save(e) {
    e.preventDefault();
    if (inFlight.current) return;
    if (!form.name.trim()) { setError('Give the space a name.'); return; }
    if (Number(form.openEndMin) <= Number(form.openStartMin)) { setError('Closing time must be after opening time.'); return; }
    inFlight.current = true;
    setSaving(true);
    setError('');
    const fields = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      location: form.location.trim() || null,
      color: form.color,
      capacity: form.capacity === '' ? null : Number(form.capacity),
      timezone: form.timezone,
      openStartMin: Number(form.openStartMin),
      openEndMin: Number(form.openEndMin),
      defaultEndsOn: form.defaultEndsOn || null,
    };
    try {
      if (editing === 'new') {
        await createWorkspace({ ...fields, projectIds: form.projectIds, trainingIds: form.trainingIds, courseIds: form.courseIds });
      } else {
        await updateWorkspace(editing.id, fields);
        await setWorkspaceProjects(editing.id, form.projectIds);
        await setWorkspaceRequirements(editing.id, form.trainingIds, form.courseIds);
      }
      toast.success('Lab space saved');
      setEditing(null);
      reload();
    } catch (err) {
      setError(err?.message ?? 'Could not save the space.');
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }

  return (
    <div className="cpm-profile-card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <h3 style={{ margin: 0 }}><i className="fas fa-flask" aria-hidden="true" style={{ marginRight: 8, color: 'var(--pm-accent-teal)' }} />Lab spaces</h3>
        {editing === null && (
          <button type="button" className="cpm-btn cpm-btn-primary" onClick={() => startEdit('new')}>
            <i className="fas fa-plus" aria-hidden="true" style={{ marginRight: 6 }} />New space
          </button>
        )}
      </div>

      {editing === null && (
        <div className="pm-lab-admin-list">
          {spaces.length === 0 && <span className="pm-lab-form-hint">No spaces yet. Add the labs and work rooms members book time in.</span>}
          {spaces.map(ws => (
            <button key={ws.id} type="button" className={`pm-lab-admin-row${ws.archived ? ' is-archived' : ''}`}
              style={{ '--pm-lab-space': ws.color }} onClick={() => startEdit(ws)}>
              <span className="pm-lab-space-dot" aria-hidden="true" style={{ '--pm-lab-space': ws.color }} />
              <span>
                <strong>{ws.name}</strong>{ws.archived && ' (archived)'}
                <small>
                  {ws.projects.map(p => p.name).join(', ') || 'No projects assigned'}
                  {ws.requirements.length > 0 && ` · ${ws.requirements.length} requirement${ws.requirements.length === 1 ? '' : 's'}`}
                </small>
              </span>
              <i className="fas fa-chevron-right" aria-hidden="true" />
            </button>
          ))}
        </div>
      )}

      {editing !== null && (
        <form className="pm-lab-admin-form" onSubmit={save}>
          <div className="cpm-form-field">
            <label className="cpm-form-label" htmlFor="ws-name">Name</label>
            <input id="ws-name" className="cpm-form-input" value={form.name} onChange={e => set('name', e.target.value)} placeholder="Propulsion Lab" autoFocus />
          </div>
          <div className="cpm-form-field">
            <label className="cpm-form-label" htmlFor="ws-location">Location</label>
            <input id="ws-location" className="cpm-form-input" value={form.location} onChange={e => set('location', e.target.value)} placeholder="ARMS 1010" />
          </div>
          <div className="cpm-form-field is-wide">
            <label className="cpm-form-label" htmlFor="ws-desc">Description</label>
            <textarea id="ws-desc" className="cpm-form-input" rows={2} value={form.description} onChange={e => set('description', e.target.value)} placeholder="What happens here, access notes, PPE…" />
          </div>
          <div className="cpm-form-field">
            <label className="cpm-form-label" htmlFor="ws-color">Colour</label>
            <input id="ws-color" type="color" className="cpm-form-input" value={form.color} onChange={e => set('color', e.target.value)} />
          </div>
          <div className="cpm-form-field">
            <label className="cpm-form-label" htmlFor="ws-cap">Capacity (optional)</label>
            <input id="ws-cap" type="number" min={1} max={500} className="cpm-form-input" value={form.capacity} onChange={e => set('capacity', e.target.value)} />
          </div>
          <div className="cpm-form-field">
            <label className="cpm-form-label" htmlFor="ws-open">Opens</label>
            <select id="ws-open" className="cpm-form-input" value={form.openStartMin} onChange={e => set('openStartMin', Number(e.target.value))}>
              {TIMES.slice(0, -1).map(m => <option key={m} value={m}>{fmtMin(m)}</option>)}
            </select>
          </div>
          <div className="cpm-form-field">
            <label className="cpm-form-label" htmlFor="ws-close">Closes</label>
            <select id="ws-close" className="cpm-form-input" value={form.openEndMin} onChange={e => set('openEndMin', Number(e.target.value))}>
              {TIMES.slice(1).map(m => <option key={m} value={m}>{m === 1440 ? 'Midnight' : fmtMin(m)}</option>)}
            </select>
          </div>
          <div className="cpm-form-field">
            <label className="cpm-form-label" htmlFor="ws-term">Term end</label>
            <input id="ws-term" type="date" className="cpm-form-input" value={form.defaultEndsOn} onChange={e => set('defaultEndsOn', e.target.value)} />
            <span className="pm-lab-form-hint">Weekly lab time ends here unless members pick an earlier date.</span>
          </div>
          <div className="cpm-form-field">
            <label className="cpm-form-label" htmlFor="ws-tz">Time zone</label>
            <select id="ws-tz" className="cpm-form-input" value={form.timezone} onChange={e => set('timezone', e.target.value)}>
              {[...new Set([form.timezone, ...ZONES])].map(z => <option key={z} value={z}>{z}</option>)}
            </select>
          </div>
          <ChipPicker label="Projects that use this space" empty="No projects found."
            items={projects.map(p => ({ id: p.id, label: p.name }))} selected={form.projectIds} onToggle={id => toggle('projectIds', id)} />
          <ChipPicker label="Required trainings" empty="The training registry is empty."
            items={trainings.map(t => ({ id: t.id, label: t.name }))} selected={form.trainingIds} onToggle={id => toggle('trainingIds', id)} />
          <ChipPicker label="Required courses" empty="No courses found."
            items={courses.map(c => ({ id: c.id, label: c.title }))} selected={form.courseIds} onToggle={id => toggle('courseIds', id)} />
          {error && <div className="pm-lab-admin-error" role="alert">{error}</div>}
          <div className="pm-lab-admin-actions">
            {editing !== 'new' && !editing.archived && (
              <ConfirmInline label="Archive" icon="fas fa-box-archive" prompt="Archive this space?" confirmLabel="Archive"
                onConfirm={async () => { await archiveWorkspace(editing.id); toast.success('Space archived'); setEditing(null); reload(); }} />
            )}
            <button type="button" className="cpm-btn cpm-btn-ghost" onClick={() => setEditing(null)} disabled={saving}>Cancel</button>
            <button type="submit" className="cpm-btn cpm-btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save space'}</button>
          </div>
        </form>
      )}
    </div>
  );
}
```

### Task 9.2: Mount in AdminView

**Files:**
- Modify: `src/pages/ClubPM/AdminView.jsx`

- [ ] **Step 1:** Add `import WorkspaceAdminPanel from "../../components/clubpm/admin/WorkspaceAdminPanel";` below the `SlackArchivePanel` import.
- [ ] **Step 2:** In `ADMIN_SECTIONS`, after the `pm-admin-integrations` entry add `{ id: "pm-admin-workspaces", label: "Lab spaces", icon: "fas fa-flask" },`.
- [ ] **Step 3:** After the `<section id="pm-admin-integrations" …>…</section>` block add:

```jsx
      <section id="pm-admin-workspaces">
        <WorkspaceAdminPanel />
      </section>
```

### Task 9.3: Event form workspace select

**Files:**
- Modify: `src/components/clubpm/EventFormModal.jsx`

- [ ] **Step 1:** Add `workspaces = []` to the component's destructured props (find `export default function EventFormModal(`).
- [ ] **Step 2:** In the empty-form constant (the object containing `isPublic: true,`), add `workspaceId: '',`. In the edit initialiser (the object containing `isPublic: editEvent.isPublic ?? false,`), add `workspaceId: editEvent.workspaceId ?? editEvent.workspace?.id ?? '',`.
- [ ] **Step 3:** In `buildPayload()`, after `projectId: form.projectId || undefined,` add:

```jsx
      // null (not undefined) on edit so clearing the select actually unlinks it.
      workspaceId: form.workspaceId || (editEvent ? null : undefined),
```

- [ ] **Step 4:** After the Location `cpm-form-field` block (find `{/* Location + Virtual */}` and its closing `</div>`), add:

```jsx
          {workspaces.length > 0 && (
            <div className="cpm-form-field">
              <label className="cpm-form-label" htmlFor="event-workspace">Lab space</label>
              <select
                id="event-workspace"
                className="cpm-form-input"
                value={form.workspaceId}
                onChange={e => {
                  const id = e.target.value;
                  const ws = workspaces.find(w => w.id === id);
                  setForm(prev => ({
                    ...prev,
                    workspaceId: id,
                    location: prev.isVirtual || prev.location.trim() ? prev.location : (ws?.location ?? prev.location),
                  }));
                }}
              >
                <option value="">— None —</option>
                {workspaces.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
              <span className="pm-lab-form-hint">Shows this event on the space&apos;s lab schedule.</span>
            </div>
          )}
```

(If the form state setter is not called `setForm`, use whatever `rg -n "useState\(EMPTY" src/components/clubpm/EventFormModal.jsx` shows.)

- [ ] **Step 5: Gate + commit**

```bash
npm run lint
npm run build
git add src/components/clubpm/admin/WorkspaceAdminPanel.jsx src/pages/ClubPM/AdminView.jsx src/components/clubpm/EventFormModal.jsx
git commit -m "feat(lab): admin lab-space editor and event lab-space picker"
```

---

## Phase 10 — Docs

**Files:**
- Modify: `AGENTS.md`, `backend/src/api/AGENTS.md`, `backend/src/services/AGENTS.md`, `backend/prisma/AGENTS.md`

- [ ] **Step 1:** `backend/src/api/AGENTS.md` — add to the route list:

```md
- `workspaces.ts` — Lab spaces + lab schedule (`/api/workspaces`). Admin CRUD/projects/requirements; `GET /:id/week` (presence blocks, event bands, requirement status, `canSchedule`); `POST /:id/shifts/apply` (rectangle add/erase, `weekly` or `dates` scope); `PATCH|DELETE /shifts/:shiftId`; `GET /buddy-requests`. Static paths stay above `/:id` (`workspaces.test.ts`). Requirements are advisory — never return 4xx for a missing training.
```

- [ ] **Step 2:** `backend/src/services/AGENTS.md` — add:

```md
- `labScheduleCore.ts` — Pure. Shifts are weekly rules in the space's **local** wall-clock time (weekday, minutes, local date range) expanded on read; never store lab times as UTC instants. `planErase()` is the only place that splits/trims rules; an `add` is erase-then-insert over the same rectangle.
- `workspaceService.ts` / `labScheduleService.ts` — Lab-space CRUD, requirement status (`trainingService.deriveStatus` + course completion), week read, apply, and the two buddy notifications (`LAB_BUDDY_JOINED`, `LAB_BUDDY_WANTED`, via `createNotification` + `slackText`).
```

- [ ] **Step 3:** `backend/prisma/AGENTS.md` — append `Workspace`, `WorkspaceProject`, `WorkspaceRequirement`, `LabShift`, `LabShiftSkip` to the key-models list and add: "`LabShift` dates are `@db.Date` local dates and minutes are local; `Event.workspaceId` links an event to a lab space (SetNull)."

- [ ] **Step 4:** Root `AGENTS.md` — in the file tree under `components/clubpm/`, add `│           ├── labschedule/        # Lab schedule modal (week grid, rectangle drag, buddy list) — opened from Calendar and the project header` and under `hooks/` add `useRectMarquee.js`.

- [ ] **Step 5: Commit**

```bash
git add AGENTS.md backend/src/api/AGENTS.md backend/src/services/AGENTS.md backend/prisma/AGENTS.md
git commit -m "docs(lab): document lab schedule modules"
```

---

## Phase 11 (optional) — `MeetingPollBoard` on `useRectMarquee`

Only do this if Phases 1–10 are merged and stable. It removes duplicated drag code; it adds no feature.

**Files:**
- Modify: `src/components/clubpm/MeetingPollBoard.jsx`

- [ ] **Step 1:** Import `useRectMarquee from '../../hooks/useRectMarquee'`.
- [ ] **Step 2:** Replace the `useEffect` that registers `pointermove`/`pointerup`/`pointercancel` (find `// Unified pointer marquee (mouse + touch).`) with:

```jsx
  const beginMarquee = useRectMarquee({
    onChange: (r) => { if (r && dragRef.current) applyRectBox(r); },
    onEnd: () => { if (dragRef.current) { dragRef.current = null; doSave(); } },
  });
  const applyRectBox = useCallback(({ d0, d1, t0, t1 }) => {
    const dr = dragRef.current;
    const isos = rectIsos(d0, t0, d1, t1);
    const next = new Set(dr.baseline);
    if (dr.mode === 'add') for (const k of isos) next.add(k);
    else for (const k of isos) next.delete(k);
    setSelected(next);
  }, [rectIsos]);
```

(Declare `applyRectBox` above `beginMarquee`.)
- [ ] **Step 3:** In `cellDown`, replace `applyRect(di, ti);` with `beginMarquee(di, ti);`. Delete the now-unused `applyRect`.
- [ ] **Step 4:** On the editable cells (the ones with `data-mine="1"`), add `data-mq="1"`.
- [ ] **Step 5:** `npm run test:ci -- src/components/clubpm src/pages/ClubPM` and manually drag a rectangle on a poll in `npm start`. Behaviour must be identical (add, remove, save on release, touch drag).
- [ ] **Step 6:** Commit `refactor(polls): share rectangle marquee with the lab schedule`.

---

## Manual verification (after Phase 9)

1. `cd backend && npx prisma migrate deploy` against a dev DB (or let the deploy workflow run it).
2. Admin → Lab spaces → create "Propulsion Lab", assign a project, require one training, set term end.
3. Calendar → Lab schedule → Edit my time → drag Mon–Wed 2–5 PM → Every week + Looking for company → Add. Grid shows teal cells; Everyone view shows amber "Just you" blocks with "wants company".
4. As a teammate: notification "… is looking for company in Propulsion Lab — Mondays 2:00–5:00 PM" links to `/clubpm/calendar?lab=…`, which opens the modal. Join from the buddy list → the requester gets "… will join you …".
5. Drag starting on your own cells → Remove → Just this week: that week clears, next week remains.
6. Create a calendar event with Lab space = Propulsion Lab → violet band on the grid; event detail shows the space chip.
7. Phone width (DevTools, 390px): modal is fullscreen, popover is a bottom sheet, grid scrolls sideways, drag works with touch emulation.
