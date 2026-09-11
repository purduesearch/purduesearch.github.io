# Public Events Calendar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show public Constellation club events (meetings, workshops, socials, other — never tasks or deadlines) in a new calendar section on the Home page, with per-event "Add to calendar" links and a live subscribable `.ics` feed for Google / Outlook / Apple.

**Architecture:** A new `Event.isPublic` flag (DB default `false`, UI default `true`) gates what the backend exposes through three unauthenticated routes in `backend/src/api/public.ts` (JSON list, full `.ics` feed, single-event `.ics`), all built on pure helpers in a new `publicEventService.ts`. ClubPM's event form gains a public toggle, a public Description field, and a publish confirmation; public events show an eye icon across ClubPM. The Home page renders a new `src/components/events/` component tree driven by two pure, unit-tested libs (`src/lib/publicEvents.js`, `src/lib/calendarLinks.js`).

**Tech Stack:** Prisma/PostgreSQL, Express 4 + TypeScript (tsx test harness), React 19 (CRA / Jest), plain CSS in `public/search-theme.css` and `public/clubpm-theme.css`, Font Awesome subset.

**Spec:** `docs/superpowers/specs/2026-09-11-public-events-calendar-design.md` (read §"Decisions" before starting any phase).

---

## Locked decisions — do NOT re-litigate

1. `Event.isPublic Boolean @default(false)`. **No backfill** — every existing row stays private.
2. "Public by default" is applied by the **ClubPM event form** (toggle starts on for new events) and the **Slack `/event` modal** (`isPublic: true`). Poll-finalized events (`pollService.ts`) and iCal imports (`api/eventImport.ts`) are **not touched** and stay private.
3. `DEADLINE` events are **never** public. `eventService` forces `isPublic = false` whenever the resulting type is `DEADLINE`; the public queries also exclude `DEADLINE`.
4. Saving an event with the toggle on shows an in-modal confirmation **on every save** (create and edit). Drag-to-move on the calendar does not prompt.
5. Public payload = `id, title, description, type, startTime, endTime, location, isVirtual` only. Never notes, attendees, organizer, project, RSVPs.
6. New ICS UIDs are `evt-<id>@purduesearch.org`. (The poll ICS UID `@purduesearch.github.io` rule in CLAUDE.md is about the *poll* feed only — don't touch `pollService.buildIcs`.)
7. Home display timezone is **`America/Indiana/Indianapolis`**, labelled "ET".
8. Per-event `.ics` download is served by the backend (`GET /api/public/events/:eventId/ics`) — **not** a client-side Blob (iOS Safari opens a `text/calendar` response straight into Calendar).
9. Home fetches once, window `now − 30 days … now + 330 days`; month navigation is bounded to that window.
10. Font Awesome classes must appear as **complete string literals** (`'fas fa-users'`, `'fab fa-google'`) — never `fas fa-${x}`. The subset build (`scripts/fa-icon-scan.mjs`) only ships glyphs it can see.

## Spec amendments made while planning (already reflected below)

- ClubPM's `EventFormModal` currently has **no Description field** (only private Notes). A public **Description** textarea is added; Notes is relabelled "members only".
- Single-event `.ics` moved from client Blob to a backend route (decision 8).
- Home component split into four files under `src/components/events/` plus two libs, instead of one file.
- Recurring child events now copy `description`, `location`, `isVirtual`, and `isPublic` from the parent (today they silently drop description/location, which would publish location-less occurrences).

## File map

| File | Phase | Responsibility |
|---|---|---|
| `backend/prisma/schema.prisma` | 1 | `Event.isPublic` + index |
| `backend/prisma/migrations/20260911000000_add_event_is_public/migration.sql` | 1 | DDL |
| `backend/src/services/eventService.ts` | 1 | accept/normalize `isPublic`; recurring copies inherit fields |
| `backend/src/api/events.ts` | 1 | pass `isPublic` through POST/PATCH |
| `backend/src/slack/actions.ts` | 1 | Slack-created events public |
| `backend/src/services/publicEventService.ts` (new) | 2 | pure: where/select, serializer, range parser, ICS builder, filename |
| `backend/src/services/publicEventService.test.ts` (new) | 2 | tsx unit tests |
| `backend/src/api/public.ts` | 2 | 3 public routes |
| `src/components/clubpm/EventFormModal.jsx` | 3 | toggle, Description, publish confirm |
| `public/clubpm-theme.css` | 3 | public badge/eye/confirm styles |
| `src/components/clubpm/CalendarView.jsx` | 4 | eye icon on chips + agenda |
| `src/pages/ClubPM/CalendarPage.jsx` | 4 | Public badge + Description row in detail modal |
| `src/pages/ClubPM/Dashboard.jsx` | 4 | eye icon in UpcomingEventsWidget |
| `src/components/clubpm/CalendarTab.jsx` | 4 | eye icon on EventBand |
| `src/lib/publicEvents.js` (+ `.test.js`) (new) | 5 | pure: types, Purdue-time formatting, month grid, grouping/filtering |
| `src/lib/calendarLinks.js` (+ `.test.js`) (new) | 5 | pure: Google/Outlook/webcal/feed URLs |
| `src/components/events/PublicCalendarMenu.jsx` (new) | 6 | accessible dropdown (outside click, Escape) |
| `src/components/events/PublicEventCard.jsx` (new) | 6 | one event row + Add-to-calendar menu |
| `src/components/events/PublicEventsMonthGrid.jsx` (new) | 6 | mini month grid with dots |
| `public/search-theme.css` | 6, 7 | `home-events-*` styles (appended) |
| `src/components/events/PublicEventsCalendar.jsx` (new) | 7 | section: lazy fetch, filters, states, Subscribe |
| `src/pages/Home.jsx` | 7 | mount the section under `#features` |
| `CLAUDE.md` | 7 | document the new routes/components |

## Global rules for every phase

- **Never Read these in full — Grep first, then Read a narrow range:** `public/search-theme.css` (~6.3k lines), `public/clubpm-theme.css` (~20k lines), `src/pages/ClubPM/Dashboard.jsx`, `backend/prisma/schema.prisma`, `backend/src/slack/actions.ts`.
- Work on branch `feat/public-events-calendar` (already exists; `git checkout feat/public-events-calendar`).
- Phase gate (must be green before committing the phase's last task):
  - Frontend: `npm run build` from repo root.
  - Backend: `cd backend && npx tsc --noEmit`.
- Commit messages end with a blank line then `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>` (use whichever model is actually running).
- Shell note: this is Windows. Use the Bash tool (Git Bash) for the commands below; `CI=true npx react-scripts test ...` works there, not in PowerShell.

---

## Phase 1 — Data model + write paths (backend)

### Task 1.1: Add `isPublic` to the schema + migration

**Files:**
- Modify: `backend/prisma/schema.prisma` (inside `model Event { ... }` — Grep `^model Event \{`)
- Create: `backend/prisma/migrations/20260911000000_add_event_is_public/migration.sql`

- [ ] **Step 1: Edit the schema.** In `model Event`, directly after the line `isVirtual   Boolean   @default(false)`, add:

```prisma
  // Opt-in publication to purduesearch.org + the public .ics feed. The DB
  // default is false on purpose: only the ClubPM event form and the Slack
  // /event modal opt in. Poll-finalized and imported events stay private.
  // DEADLINE events are never public (eventService forces false).
  isPublic    Boolean   @default(false)
```

and next to the existing `@@index([startTime])` add:

```prisma
  @@index([isPublic, startTime])
```

- [ ] **Step 2: Write the migration** `backend/prisma/migrations/20260911000000_add_event_is_public/migration.sql`:

```sql
-- AlterTable
-- No backfill: every existing event stays private (decided 2026-09-11).
ALTER TABLE "Event" ADD COLUMN "isPublic" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Event_isPublic_startTime_idx" ON "Event"("isPublic", "startTime");
```

- [ ] **Step 3: Regenerate the client** (no DB needed): `cd backend && npx prisma generate`
  Expected: `✔ Generated Prisma Client`.
  If a local `DATABASE_URL` is configured and reachable, also run `npx prisma migrate status` and confirm the new migration is listed as pending (do **not** run `migrate dev` — it may try to reset). Production applies it via `prisma migrate deploy` in `deploy-backend.yml`.

### Task 1.2: `eventService` accepts and normalizes `isPublic`

**Files:**
- Modify: `backend/src/services/eventService.ts`

- [ ] **Step 1: Add the field to both input interfaces.** In `interface CreateEventInput` and `interface UpdateEventInput`, after `isVirtual?: boolean;` add:

```ts
  isPublic?: boolean;
```

- [ ] **Step 2: Add a normalizer** just above the `// ── Service ───` banner:

```ts
// DEADLINE events are never published, whatever the caller asked for. The
// public API also filters DEADLINE out, but storing false keeps the eye icon
// in ClubPM honest.
function resolveIsPublic(type: EventType | undefined, requested: boolean | undefined): boolean {
  if (type === "DEADLINE") return false;
  return requested ?? false;
}
```

- [ ] **Step 3: Use it in `createEvent`.** In the `prisma.event.create({ data: { ... } })` for the parent event, after `isVirtual: data.isVirtual,` add:

```ts
      isPublic:           resolveIsPublic(data.type, data.isPublic),
```

- [ ] **Step 4: Recurring copies inherit the public-facing fields.** In the child `prisma.event.create({ data: { ... } })` inside `offsets.map(...)`, after `endTime,` add:

```ts
              description:       data.description,
              location:          data.location,
              isVirtual:         data.isVirtual,
              isPublic:          resolveIsPublic(data.type, data.isPublic),
```

- [ ] **Step 5: Use it in `updateEvent`.** After the line `if (data.isVirtual !== undefined) updateData.isVirtual = data.isVirtual;` add:

```ts
  if (data.isPublic !== undefined) updateData.isPublic = resolveIsPublic(data.type, data.isPublic);
  // Switching an existing event to DEADLINE unpublishes it even if the caller
  // didn't mention isPublic.
  if (data.type === "DEADLINE") updateData.isPublic = false;
```

### Task 1.3: Pass `isPublic` through the REST routes

**Files:**
- Modify: `backend/src/api/events.ts`

- [ ] **Step 1: POST `/`.** In the destructure add `isPublic,` after `isVirtual,`; in the body type add `isPublic?: boolean;` after `isVirtual?: boolean;`; in the `eventService.createEvent({ ... })` call add `isPublic,` after `isVirtual,`.
- [ ] **Step 2: PATCH `/:id`.** Same three edits in the PATCH handler (`isPublic,` in the destructure, `isPublic?: boolean;` in the type, `isPublic,` in `eventService.updateEvent(...)`).

### Task 1.4: Slack-created events are public

**Files:**
- Modify: `backend/src/slack/actions.ts` (Grep `event_create_submit` — the `createEvent({` call ~15 lines below)

- [ ] **Step 1:** In that `await createEvent({ ... })` call add, after `recurrencePattern: recPat,`:

```ts
        // Matches the ClubPM form default. eventService forces DEADLINE → false.
        isPublic: true,
```

### Task 1.5: Gate + commit

- [ ] **Step 1:** `cd backend && npx tsc --noEmit` → expected: no output, exit 0.
- [ ] **Step 2:** From repo root `npm run build` → expected: `Compiled successfully` (or only pre-existing warnings).
- [ ] **Step 3: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/20260911000000_add_event_is_public backend/src/services/eventService.ts backend/src/api/events.ts backend/src/slack/actions.ts
git commit -m "feat(events): add Event.isPublic flag and write-path support"
```

---

## Phase 2 — Public API (backend)

### Task 2.1: Pure helpers — write the failing tests first

**Files:**
- Create: `backend/src/services/publicEventService.test.ts`

- [ ] **Step 1: Write the test file** (same inline harness as `icsFeedService.test.ts`):

```ts
// Unit tests for publicEventService. Pure — no DB.
// Run: cd backend && npx tsx src/services/publicEventService.test.ts
// Excluded from the production build (tsconfig `exclude` covers *.test.ts).

import {
  serializePublicEvent, parsePublicRange, buildPublicIcsFeed, foldIcsLine,
  icsEscape, icsFileName, PUBLIC_EVENT_WHERE, type PublicEventRow,
} from "./publicEventService.js";

let passed = 0, failed = 0;
function check(name: string, cond: boolean) {
  if (cond) passed++; else { failed++; console.error(`  ✗ ${name}`); }
}

const START = new Date("2026-09-16T22:30:00Z");
const END   = new Date("2026-09-16T23:30:00Z");
const NOW   = new Date("2026-09-11T12:00:00Z");

function row(over: Partial<PublicEventRow> = {}): PublicEventRow {
  return {
    id: "ev1", title: "General Meeting", description: "Pizza, provided",
    type: "MEETING", startTime: START, endTime: END,
    location: "ARMS 1010", isVirtual: false, updatedAt: NOW,
    ...over,
  };
}

console.log("PUBLIC_EVENT_WHERE");
{
  check("requires isPublic", (PUBLIC_EVENT_WHERE as any).isPublic === true);
  check("excludes DEADLINE", (PUBLIC_EVENT_WHERE as any).type?.not === "DEADLINE");
}

console.log("serializePublicEvent");
{
  const full = { ...row(), notes: "secret zoom link", attendees: [{ id: "m1" }], organizerId: "m1", projectId: "p1" };
  const out = serializePublicEvent(full);
  check("exact key set", JSON.stringify(Object.keys(out).sort()) ===
    JSON.stringify(["description", "endTime", "id", "isVirtual", "location", "startTime", "title", "type"]));
  check("no notes leak", !("notes" in out));
  check("dates are ISO strings", out.startTime === START.toISOString() && out.endTime === END.toISOString());
  check("virtual → location null", serializePublicEvent(row({ isVirtual: true })).location === null);
  check("blank description → null", serializePublicEvent(row({ description: "   " })).description === null);
  check("null endTime stays null", serializePublicEvent(row({ endTime: null })).endTime === null);
}

console.log("parsePublicRange");
{
  const d = parsePublicRange({}, NOW);
  check("defaults ok", !("error" in d));
  if (!("error" in d)) {
    check("default from = now - 1d", d.from.getTime() === NOW.getTime() - 86_400_000);
    check("default to = now + 120d", d.to.getTime() === NOW.getTime() + 120 * 86_400_000);
  }
  check("bad from → error", "error" in parsePublicRange({ from: "nope" }, NOW));
  check("to before from → error", "error" in parsePublicRange({ from: "2026-10-01", to: "2026-09-01" }, NOW));
  const wide = parsePublicRange({ from: "2026-01-01T00:00:00Z", to: "2030-01-01T00:00:00Z" }, NOW);
  check("clamped to 366 days", !("error" in wide) &&
    wide.to.getTime() - wide.from.getTime() === 366 * 86_400_000);
  check("array query value → error", "error" in parsePublicRange({ from: ["a", "b"] }, NOW));
}

console.log("icsEscape / foldIcsLine");
{
  check("escapes , ; \\ and newline", icsEscape("a,b;c\\d\ne") === "a\\,b\\;c\\\\d\\ne");
  const long = "DESCRIPTION:" + "x".repeat(200);
  const folded = foldIcsLine(long);
  const parts = folded.split("\r\n");
  check("folds long lines", parts.length > 1);
  check("first line ≤ 75 octets", Buffer.byteLength(parts[0], "utf8") <= 75);
  check("continuations start with a space and are ≤ 75 octets",
    parts.slice(1).every(p => p.startsWith(" ") && Buffer.byteLength(p, "utf8") <= 75));
  check("unfolds back to original", parts.map((p, i) => (i === 0 ? p : p.slice(1))).join("") === long);
  const emoji = "SUMMARY:" + "🚀".repeat(40);
  check("never splits a multi-byte char",
    foldIcsLine(emoji).split("\r\n").every(p => !p.includes("\uFFFD") && Buffer.byteLength(p, "utf8") <= 75));
  check("short line untouched", foldIcsLine("SUMMARY:hi") === "SUMMARY:hi");
}

console.log("buildPublicIcsFeed (feed mode)");
{
  const ics = buildPublicIcsFeed([row(), row({ id: "ev2", endTime: null, isVirtual: true, description: null })],
    { now: NOW, siteUrl: "https://purduesearch.org", mode: "feed" });
  check("CRLF line endings", ics.includes("\r\n") && !/[^\r]\n/.test(ics));
  check("starts with VCALENDAR", ics.startsWith("BEGIN:VCALENDAR\r\n"));
  check("ends with END:VCALENDAR + CRLF", ics.endsWith("END:VCALENDAR\r\n"));
  check("calendar name", ics.includes("X-WR-CALNAME:Purdue SEARCH Events"));
  check("refresh interval", ics.includes("REFRESH-INTERVAL;VALUE=DURATION:PT6H"));
  check("two VEVENTs", (ics.match(/BEGIN:VEVENT/g) ?? []).length === 2);
  check("uid domain", ics.includes("UID:evt-ev1@purduesearch.org"));
  check("utc start", ics.includes("DTSTART:20260916T223000Z"));
  check("missing end → +1h", ics.includes("DTEND:20260916T233000Z"));
  check("escaped description", ics.includes("DESCRIPTION:Pizza\\, provided"));
  check("virtual location → Online", ics.includes("LOCATION:Online"));
  check("category", ics.includes("CATEGORIES:MEETING"));
  check("url", ics.includes("URL:https://purduesearch.org/#events"));
  check("last-modified", ics.includes("LAST-MODIFIED:20260911T120000Z"));
}

console.log("buildPublicIcsFeed (single mode)");
{
  const ics = buildPublicIcsFeed([row()], { now: NOW, siteUrl: "https://purduesearch.org", mode: "single" });
  check("no calendar name in single mode", !ics.includes("X-WR-CALNAME"));
  check("no refresh interval in single mode", !ics.includes("REFRESH-INTERVAL"));
  check("one VEVENT", (ics.match(/BEGIN:VEVENT/g) ?? []).length === 1);
}

console.log("icsFileName");
{
  check("slugifies", icsFileName("Fall Kickoff: Pizza & Rockets!") === "fall-kickoff-pizza-rockets.ics");
  check("empty → event.ics", icsFileName("!!!") === "event.ics");
  check("caps length", icsFileName("a".repeat(200)).length <= 64);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
```

- [ ] **Step 2: Run it — expect failure.** `cd backend && npx tsx src/services/publicEventService.test.ts`
  Expected: error `Cannot find module './publicEventService.js'` (or similar).

### Task 2.2: Implement `publicEventService.ts`

**Files:**
- Create: `backend/src/services/publicEventService.ts`

- [ ] **Step 1: Write the module:**

```ts
// Pure helpers behind the unauthenticated /api/public/events* routes.
// No DB access here — public.ts queries with PUBLIC_EVENT_WHERE/SELECT and
// hands rows to these functions, which keeps every rule unit-testable.
import type { EventType, Prisma } from "@prisma/client";

const DAY_MS = 86_400_000;
const DEFAULT_DURATION_MS = 60 * 60 * 1000;
const MAX_RANGE_DAYS = 366;

// Only opted-in, non-deadline events ever leave the building.
export const PUBLIC_EVENT_WHERE: Prisma.EventWhereInput = {
  isPublic: true,
  type: { not: "DEADLINE" },
};

// Selected by construction: adding a column to Event can never leak it.
export const PUBLIC_EVENT_SELECT = {
  id: true, title: true, description: true, type: true,
  startTime: true, endTime: true, location: true, isVirtual: true,
  updatedAt: true,
} as const;

export interface PublicEventRow {
  id: string;
  title: string;
  description: string | null;
  type: EventType;
  startTime: Date;
  endTime: Date | null;
  location: string | null;
  isVirtual: boolean;
  updatedAt: Date;
}

export interface PublicEvent {
  id: string;
  title: string;
  description: string | null;
  type: EventType;
  startTime: string;
  endTime: string | null;
  location: string | null;
  isVirtual: boolean;
}

export function serializePublicEvent(e: PublicEventRow): PublicEvent {
  return {
    id:          e.id,
    title:       e.title,
    description: e.description?.trim() || null,
    type:        e.type,
    startTime:   e.startTime.toISOString(),
    endTime:     e.endTime ? e.endTime.toISOString() : null,
    location:    e.isVirtual ? null : (e.location?.trim() || null),
    isVirtual:   e.isVirtual,
  };
}

export type PublicRange = { from: Date; to: Date } | { error: string };

function parseDateParam(v: unknown): Date | null | "invalid" {
  if (v === undefined || v === "") return null;
  if (typeof v !== "string") return "invalid";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "invalid" : d;
}

export function parsePublicRange(q: { from?: unknown; to?: unknown }, now: Date): PublicRange {
  const from = parseDateParam(q.from);
  const to   = parseDateParam(q.to);
  if (from === "invalid" || to === "invalid") return { error: "from/to must be ISO dates" };
  const f = from ?? new Date(now.getTime() - DAY_MS);
  let t   = to   ?? new Date(now.getTime() + 120 * DAY_MS);
  if (t < f) return { error: "to must be after from" };
  const maxTo = new Date(f.getTime() + MAX_RANGE_DAYS * DAY_MS);
  if (t > maxTo) t = maxTo;
  return { from: f, to: t };
}

export function icsEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

function icsStamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

// RFC 5545 §3.1: lines longer than 75 octets are folded with CRLF + one space.
// Iterates by code point so a multi-byte character is never split.
export function foldIcsLine(line: string): string {
  if (Buffer.byteLength(line, "utf8") <= 75) return line;
  const parts: string[] = [];
  let current = "";
  let bytes = 0;
  let limit = 75;
  for (const ch of line) {
    const b = Buffer.byteLength(ch, "utf8");
    if (bytes + b > limit) {
      parts.push(current);
      current = "";
      bytes = 0;
      limit = 74; // continuation lines spend one octet on the leading space
    }
    current += ch;
    bytes += b;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

export interface IcsBuildOptions {
  now: Date;
  siteUrl: string;
  /** "feed" adds subscription metadata (name, refresh interval); "single" is a one-off download. */
  mode: "feed" | "single";
}

export function buildPublicIcsFeed(events: PublicEventRow[], opts: IcsBuildOptions): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Purdue SEARCH//Public Events//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];
  if (opts.mode === "feed") {
    lines.push(
      "X-WR-CALNAME:Purdue SEARCH Events",
      `X-WR-CALDESC:${icsEscape("Public meetings, workshops, and socials from Purdue SEARCH")}`,
      "X-WR-TIMEZONE:America/Indiana/Indianapolis",
      "REFRESH-INTERVAL;VALUE=DURATION:PT6H",
      "X-PUBLISHED-TTL:PT6H",
    );
  }
  const stamp = icsStamp(opts.now);
  for (const e of events) {
    const end = e.endTime && e.endTime > e.startTime
      ? e.endTime
      : new Date(e.startTime.getTime() + DEFAULT_DURATION_MS);
    const description = e.description?.trim();
    const location = e.isVirtual ? "Online" : e.location?.trim();
    lines.push(
      "BEGIN:VEVENT",
      `UID:evt-${e.id}@purduesearch.org`,
      `DTSTAMP:${stamp}`,
      `LAST-MODIFIED:${icsStamp(e.updatedAt)}`,
      `DTSTART:${icsStamp(e.startTime)}`,
      `DTEND:${icsStamp(end)}`,
      `SUMMARY:${icsEscape(e.title)}`,
      ...(description ? [`DESCRIPTION:${icsEscape(description)}`] : []),
      ...(location ? [`LOCATION:${icsEscape(location)}`] : []),
      `CATEGORIES:${e.type}`,
      `URL:${opts.siteUrl}/#events`,
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldIcsLine).join("\r\n") + "\r\n";
}

export function icsFileName(title: string): string {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  return `${slug || "event"}.ics`;
}
```

- [ ] **Step 2: Run the tests — expect pass.** `cd backend && npx tsx src/services/publicEventService.test.ts`
  Expected last line: `N passed, 0 failed`.

- [ ] **Step 3: Commit**

```bash
git add backend/src/services/publicEventService.ts backend/src/services/publicEventService.test.ts
git commit -m "feat(events): pure helpers for public event list and ICS feed"
```

### Task 2.3: Public routes

**Files:**
- Modify: `backend/src/api/public.ts`

- [ ] **Step 1: Imports.** Below the existing `import { streamDriveFile } ...` line add:

```ts
import {
  PUBLIC_EVENT_WHERE, PUBLIC_EVENT_SELECT, serializePublicEvent,
  parsePublicRange, buildPublicIcsFeed, icsFileName,
} from "../services/publicEventService.js";
```

- [ ] **Step 2: Routes.** Insert this block directly **above** the `// ── RSVP endpoints (no auth required) ───` banner:

```ts
// ── Public events calendar (homepage + subscribable feed) ────
// Only events with isPublic=true and type≠DEADLINE; payload is built by
// construction in publicEventService (never notes/attendees/organizer).

const PUBLIC_SITE_URL = process.env.FRONTEND_URL || "https://purduesearch.org";
const DAY_MS = 86_400_000;

publicRouter.get("/events", async (req: Request, res: Response) => {
  const range = parsePublicRange(req.query as { from?: unknown; to?: unknown }, new Date());
  if ("error" in range) {
    res.status(400).json({ error: range.error });
    return;
  }
  try {
    const rows = await prisma.event.findMany({
      where:   { ...PUBLIC_EVENT_WHERE, startTime: { gte: range.from, lte: range.to } },
      select:  PUBLIC_EVENT_SELECT,
      orderBy: { startTime: "asc" },
      take:    500,
    });
    res.setHeader("Cache-Control", "public, max-age=300");
    res.json(rows.map(serializePublicEvent));
  } catch (error) {
    console.error("GET /public/events error:", error);
    res.status(500).json({ error: "Failed to load events" });
  }
});

// Subscribable feed. Google/Outlook/Apple poll this URL; keep it stable.
publicRouter.get("/events.ics", async (_req: Request, res: Response) => {
  try {
    const now = new Date();
    const rows = await prisma.event.findMany({
      where: {
        ...PUBLIC_EVENT_WHERE,
        startTime: { gte: new Date(now.getTime() - 60 * DAY_MS), lte: new Date(now.getTime() + 365 * DAY_MS) },
      },
      select:  PUBLIC_EVENT_SELECT,
      orderBy: { startTime: "asc" },
      take:    2000,
    });
    const body = buildPublicIcsFeed(rows, { now, siteUrl: PUBLIC_SITE_URL, mode: "feed" });
    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader("Content-Disposition", 'inline; filename="purdue-search-events.ics"');
    res.setHeader("Cache-Control", "public, max-age=900");
    res.send(body);
  } catch (error) {
    console.error("GET /public/events.ics error:", error);
    res.status(500).type("text/plain").send("Failed to build calendar feed");
  }
});

// One-off "Download .ics" for a single public event.
publicRouter.get("/events/:eventId/ics", async (req: Request, res: Response) => {
  try {
    const row = await prisma.event.findFirst({
      where:  { ...PUBLIC_EVENT_WHERE, id: req.params.eventId as string },
      select: PUBLIC_EVENT_SELECT,
    });
    if (!row) {
      res.status(404).type("text/plain").send("Event not found");
      return;
    }
    const body = buildPublicIcsFeed([row], { now: new Date(), siteUrl: PUBLIC_SITE_URL, mode: "single" });
    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${icsFileName(row.title)}"`);
    res.setHeader("Cache-Control", "public, max-age=300");
    res.send(body);
  } catch (error) {
    console.error("GET /public/events/:eventId/ics error:", error);
    res.status(500).type("text/plain").send("Failed to build calendar file");
  }
});
```

Note: `/events.ics`, `/events/:eventId/ics`, and the existing `/events/:eventId/rsvp-info` cannot shadow each other (different literal segments). `app.ts` mounts helmet with `crossOriginResourcePolicy: "cross-origin"` and sets no global `Cache-Control`, so the headers above take effect.

- [ ] **Step 3: Gate.** `cd backend && npx tsc --noEmit` → no output. Re-run `npx tsx src/services/publicEventService.test.ts` → `0 failed`.

- [ ] **Step 4 (optional, only if a local DB + `.env` exist):** `cd backend && npm run dev`, then in another shell `curl -s localhost:3001/api/public/events | head -c 300` → `[]` or JSON array; `curl -si localhost:3001/api/public/events.ics | head -20` → `Content-Type: text/calendar` and `BEGIN:VCALENDAR`. Skip without a DB — do not invent a DB.

- [ ] **Step 5: Commit**

```bash
git add backend/src/api/public.ts
git commit -m "feat(events): public event list, ICS feed, and single-event ICS routes"
```

---

## Phase 3 — ClubPM event form: toggle, Description, publish confirm

### Task 3.1: `EventFormModal.jsx`

**Files:**
- Modify: `src/components/clubpm/EventFormModal.jsx` (459 lines — safe to Read in full)

- [ ] **Step 1: Form state.** Replace the `EMPTY` constant with:

```js
const EMPTY = {
  title: '', type: 'MEETING', description: '',
  startDate: '', startTime: '',
  endDate: '', endTime: '',
  location: '', isVirtual: false,
  projectId: '', notes: '',
  isRecurring: false, recurrencePattern: 'weekly', recurrenceEndDate: '',
  attendeeIds: [],
  // New events are public by default (decided 2026-09-11); saving a public
  // event always goes through the confirmation step below.
  isPublic: true,
};
```

- [ ] **Step 2: Pending-confirmation state.** After `const [search, setSearch] = useState('');` add:

```js
  // Non-null while the "this will be public" confirmation is showing. Holds
  // the exact payload that Publish will send.
  const [pendingPayload, setPendingPayload] = useState(null);
```

- [ ] **Step 3: Load from `editEvent`.** In the `useEffect` `setForm({ ... })` for `editEvent`, add after `type: editEvent.type ?? 'MEETING',`:

```js
        description: editEvent.description ?? '',
        isPublic: editEvent.isPublic ?? false,
```

and after `setSearch('');` (still inside that effect) add `setPendingPayload(null);`.

- [ ] **Step 4: Any edit cancels a pending confirmation.** Replace the `set` function with:

```js
  function set(field, value) {
    setPendingPayload(null);
    setForm(prev => ({ ...prev, [field]: value }));
  }
```

- [ ] **Step 5: Split submit into build / confirm / save.** Replace the whole `async function handleSubmit(e) { ... }` with:

```js
  function buildPayload() {
    return {
      title: form.title.trim(),
      type: form.type,
      // '' (not undefined) on edit so clearing the field actually clears it.
      description: form.description.trim() || (editEvent ? '' : undefined),
      startTime: combineDatetime(form.startDate, form.startTime),
      endTime: form.endDate ? combineDatetime(form.endDate, form.endTime) : undefined,
      location: form.isVirtual ? undefined : (form.location.trim() || undefined),
      isVirtual: form.isVirtual,
      isPublic: form.type !== 'DEADLINE' && form.isPublic,
      projectId: form.projectId || undefined,
      notes: form.notes.trim() || undefined,
      isRecurring: form.isRecurring,
      recurrencePattern: form.isRecurring ? form.recurrencePattern : undefined,
      recurrenceEndDate: form.isRecurring && form.recurrenceEndDate
        ? new Date(form.recurrenceEndDate).toISOString() : undefined,
      attendeeIds: form.attendeeIds,
    };
  }

  async function save(payload) {
    setSaving(true);
    try {
      await onSave(payload);
      setPendingPayload(null);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!form.title.trim() || !form.startDate) return;
    const payload = buildPayload();
    // Every save of a public event is confirmed — create or edit.
    if (payload.isPublic) {
      setPendingPayload(payload);
      return;
    }
    save(payload);
  }
```

- [ ] **Step 6: Public toggle.** Insert directly **after** the closing `</div>` of the `{/* Type */}` field block:

```jsx
          {/* Public visibility — hidden for deadlines, which are never public */}
          {form.type !== 'DEADLINE' && (
            <div>
              <label
                className="cpm-toggle-row"
                onClick={e => { e.preventDefault(); set('isPublic', !form.isPublic); }}
              >
                <span className="cpm-toggle-row-label">
                  <i
                    className={form.isPublic ? 'fas fa-eye' : 'fas fa-eye-slash'}
                    style={{ color: form.isPublic ? 'var(--pm-accent-teal, #00e5cc)' : 'var(--clubpm-text-muted)', fontSize: 12 }}
                    aria-hidden="true"
                  />
                  Show on purduesearch.org
                </span>
                <input
                  type="checkbox"
                  className="cpm-toggle-switch"
                  checked={form.isPublic}
                  onChange={() => {}}
                  aria-label="Show on purduesearch.org"
                />
              </label>
              <span className="cpm-public-hint">
                {form.isPublic
                  ? 'Title, time, location, and description appear on the public site and calendar feed. Notes and attendees stay private.'
                  : 'Only visible inside Constellation.'}
              </span>
            </div>
          )}
```

(`e.preventDefault()` stops the label's synthetic click on the nested checkbox from toggling a second time.)

- [ ] **Step 7: Description field.** Insert directly **after** the closing `</div>` of the `{/* Location + Virtual */}` block (before `{/* Project */}`):

```jsx
          {/* Description — the public-facing blurb (Notes stays members-only) */}
          <div className="cpm-form-field">
            <label className="cpm-form-label">
              Description{' '}
              <span style={{ color: 'var(--clubpm-text-muted)', fontWeight: 400 }}>
                (optional{form.isPublic && form.type !== 'DEADLINE' ? ' · shown publicly' : ''})
              </span>
            </label>
            <textarea
              className="cpm-form-input"
              value={form.description}
              onChange={e => set('description', e.target.value)}
              rows={3}
              placeholder="What should attendees know? Who is it for?"
              style={{ resize: 'vertical', fontFamily: 'inherit' }}
            />
          </div>
```

- [ ] **Step 8: Relabel Notes.** In the `{/* Notes */}` block change the label's `(optional)` span text to `(optional · members only)`.

- [ ] **Step 9: Footer with confirmation.** Replace the whole `{/* Footer */}` `<div className="cpm-event-modal-footer"> ... </div>` with:

```jsx
        {/* Footer */}
        {pendingPayload ? (
          <div className="cpm-event-modal-footer is-confirming">
            <div className="cpm-event-public-confirm" role="alert">
              <i className="fas fa-eye" aria-hidden="true" />
              <span>
                This event will be visible to <strong>anyone</strong> on purduesearch.org and in the
                public calendar feed — its title, time, location, and description. Publish it?
              </span>
            </div>
            <button
              type="button"
              className="cpm-btn-ghost"
              onClick={() => setPendingPayload(null)}
              disabled={saving}
            >
              Back
            </button>
            <button
              type="button"
              className="cpm-btn-primary"
              onClick={() => save(pendingPayload)}
              disabled={saving}
              style={{ padding: '9px 20px', fontSize: 13 }}
              autoFocus
            >
              {saving
                ? <><i className="fas fa-spinner fa-spin" style={{ marginRight: 6 }} />Publishing…</>
                : <><i className="fas fa-globe" style={{ marginRight: 6 }} />Publish</>
              }
            </button>
          </div>
        ) : (
          <div className="cpm-event-modal-footer">
            <button
              type="button"
              className="cpm-btn-ghost"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="submit"
              form="event-form"
              className="cpm-btn-primary"
              disabled={!canSubmit}
              style={{ padding: '9px 20px', fontSize: 13 }}
            >
              {saving
                ? <><i className="fas fa-spinner fa-spin" style={{ marginRight: 6 }} />Saving…</>
                : <><i className="fas fa-check" style={{ marginRight: 6 }} />{editEvent ? 'Save Changes' : 'Create Event'}</>
              }
            </button>
          </div>
        )}
```

### Task 3.2: ClubPM styles

**Files:**
- Modify: `public/clubpm-theme.css` — **append to the end only**; do not Read the file (Grep `cpm-event-modal-footer \{` if you need to confirm the footer is `display:flex`).

- [ ] **Step 1: Append:**

```css

/* ===== Public events (isPublic) — eye icon, badge, EventFormModal publish confirm ===== */
.cpm-public-eye {
  font-size: 9px;
  margin-left: 4px;
  color: var(--pm-accent-teal, #00e5cc);
  opacity: 0.85;
  flex-shrink: 0;
}
.cpm-public-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-left: 8px;
  padding: 1px 7px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  vertical-align: middle;
  color: var(--pm-accent-teal, #00e5cc);
  background: rgba(0, 229, 204, 0.12);
  border: 1px solid rgba(0, 229, 204, 0.35);
}
.cpm-public-hint {
  display: block;
  margin-top: 4px;
  font-size: 11px;
  line-height: 1.4;
  color: var(--clubpm-text-muted, #8b93a7);
}
.cpm-event-modal-footer.is-confirming { flex-wrap: wrap; }
.cpm-event-public-confirm {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  flex: 1 1 100%;
  padding: 10px 12px;
  border-radius: 8px;
  font-size: 12.5px;
  line-height: 1.45;
  color: var(--clubpm-text-secondary, #c8cfdc);
  background: rgba(245, 166, 35, 0.1);
  border: 1px solid rgba(245, 166, 35, 0.4);
}
.cpm-event-public-confirm i { margin-top: 2px; color: var(--pm-accent-amber, #f5a623); }
```

### Task 3.3: Course prose check, gate, commit

- [ ] **Step 1:** Grep `docs/courses` for `New Event` and `Notes` near calendar content: `rg -n "New Event|event form" docs/courses`. If any Markdown page enumerates the event form's fields, add one sentence: *"Toggle **Show on purduesearch.org** to publish the event on the public homepage calendar — you'll be asked to confirm, and only the title, time, location, and description are shown."* If nothing enumerates the fields, change nothing. (No `data-tour-id` changes in this plan, so `check-tour-anchors` is unaffected.)
- [ ] **Step 2:** `npm run build` → compiles. (The `prebuild` icon scan will pick up `fa-eye`, `fa-eye-slash`, `fa-globe`.)
- [ ] **Step 3:** If `git status` shows `public/fa-subset.css` / `public/webfonts/*` changed, include them in the commit.
- [ ] **Step 4: Manual check** (if you can run `npm start` and log in): New Event → toggle is on → Create → confirmation appears → Back returns to form → Publish saves. Switch type to Deadline → toggle disappears and Save does not prompt.
- [ ] **Step 5: Commit**

```bash
git add src/components/clubpm/EventFormModal.jsx public/clubpm-theme.css
git commit -m "feat(clubpm): public toggle, description, and publish confirmation in event form"
```

---

## Phase 4 — Eye icon across ClubPM

Every site uses the exact same element so it reads consistently:

```jsx
<i className="fas fa-eye cpm-public-eye" title="Public on purduesearch.org" aria-label="Public on purduesearch.org" />
```

### Task 4.1: `CalendarView.jsx`

**Files:** Modify `src/components/clubpm/CalendarView.jsx`

- [ ] **Step 1: `EventChip`.** After `<span className="cpm-cal-chip-title">{event.title}</span>` add:

```jsx
      {event.isPublic && (
        <i className="fas fa-eye cpm-public-eye" title="Public on purduesearch.org" aria-label="Public on purduesearch.org" />
      )}
```

- [ ] **Step 2: Agenda event row.** Grep `cpm-cal-agenda-event-row`. After `<span className="cpm-cal-agenda-task-title">{ev.title}</span>` in that row add:

```jsx
                          {ev.isPublic && (
                            <i className="fas fa-eye cpm-public-eye" title="Public on purduesearch.org" aria-label="Public on purduesearch.org" />
                          )}
```

- [ ] **Step 3:** Grep the file for any other place that renders `ev.title` / `event.title` for an *event* (not a task) without going through `EventChip` — e.g. week view. Add the same element after the title there too.

### Task 4.2: `CalendarPage.jsx` detail modal

**Files:** Modify `src/pages/ClubPM/CalendarPage.jsx`

- [ ] **Step 1: Badge.** In `EventDetailModal`, replace

```jsx
              <div className="pm-cal-detail-type" style={{ color: borderColor }}>
                {event.type}
              </div>
```

with

```jsx
              <div className="pm-cal-detail-type" style={{ color: borderColor }}>
                {event.type}
                {event.isPublic && (
                  <span className="cpm-public-badge" title="Visible on purduesearch.org and the public calendar feed">
                    <i className="fas fa-eye" aria-hidden="true" /> Public
                  </span>
                )}
              </div>
```

- [ ] **Step 2: Description row.** Directly before the `{/* Location */}` block add:

```jsx
          {/* Description (public-facing when the event is public) */}
          {event.description && (
            <DetailRow icon="fas fa-align-left" label="Description">
              <span style={{ whiteSpace: 'pre-wrap', color: 'var(--clubpm-text-secondary)' }}>{event.description}</span>
            </DetailRow>
          )}
```

### Task 4.3: Dashboard widget + CalendarTab

**Files:**
- Modify: `src/pages/ClubPM/Dashboard.jsx` (**do not Read in full** — Grep `pm-upcoming-event-title` and Read ±5 lines)
- Modify: `src/components/clubpm/CalendarTab.jsx` (Grep `function EventBand`)

- [ ] **Step 1: Dashboard.** Replace `<div className="pm-upcoming-event-title">{ev.title}</div>` with:

```jsx
                  <div className="pm-upcoming-event-title">
                    {ev.title}
                    {ev.isPublic && (
                      <i className="fas fa-eye cpm-public-eye" title="Public on purduesearch.org" aria-label="Public on purduesearch.org" />
                    )}
                  </div>
```

- [ ] **Step 2: CalendarTab `EventBand`.** After `<span style={{ color, fontSize: 10 }}>{event.title}</span>` add:

```jsx
      {event.isPublic && (
        <i className="fas fa-eye cpm-public-eye" title="Public on purduesearch.org" aria-label="Public on purduesearch.org" />
      )}
```

(`/api/events` and `/api/events/upcoming` return all scalar columns because they use `include`, so `isPublic` is already on every event object — no API change needed.)

### Task 4.4: Gate + commit

- [ ] **Step 1:** `npm run build` → compiles. Include regenerated `public/fa-subset.css`/webfonts if changed (`fa-align-left` is new).
- [ ] **Step 2: Commit**

```bash
git add src/components/clubpm/CalendarView.jsx src/pages/ClubPM/CalendarPage.jsx src/pages/ClubPM/Dashboard.jsx src/components/clubpm/CalendarTab.jsx
git commit -m "feat(clubpm): mark public events with an eye icon"
```

---

## Phase 5 — Frontend pure libs (TDD)

Test command pattern (Git Bash): `CI=true npx react-scripts test --watchAll=false src/lib/<file>.test.js`
(Use `npx react-scripts` directly — `npm test` also runs the tour-anchor check.)

### Task 5.1: `publicEvents.js` — tests first

**Files:**
- Create: `src/lib/publicEvents.test.js`

- [ ] **Step 1: Write tests:**

```js
import {
  PURDUE_TZ, typeConfig, purdueDayKey, formatPurdueTime, formatTimeRange, dateTile,
  formatDayKey, buildMonthGrid, groupByDay, upcomingEvents, filterByType,
  purdueMonthOf, shiftMonth, compareMonth, monthLabel,
} from './publicEvents';

// 2026-09-16 22:30Z = 6:30 PM EDT on Wed Sep 16 (Indianapolis observes DST).
const EV = (over = {}) => ({
  id: 'e1', title: 'GM', description: null, type: 'MEETING',
  startTime: '2026-09-16T22:30:00.000Z', endTime: '2026-09-16T23:30:00.000Z',
  location: 'ARMS 1010', isVirtual: false, ...over,
});

test('timezone constant', () => {
  expect(PURDUE_TZ).toBe('America/Indiana/Indianapolis');
});

test('typeConfig falls back to OTHER and uses literal FA classes', () => {
  expect(typeConfig('MEETING').icon).toBe('fas fa-users');
  expect(typeConfig('NOPE')).toBe(typeConfig('OTHER'));
});

test('purdueDayKey uses Purdue local date, not UTC', () => {
  // 02:00Z on the 17th is still 10 PM on the 16th in Indiana.
  expect(purdueDayKey('2026-09-17T02:00:00Z')).toBe('2026-09-16');
});

test('formatPurdueTime / formatTimeRange', () => {
  expect(formatPurdueTime('2026-09-16T22:30:00Z')).toBe('6:30 PM');
  expect(formatTimeRange(EV().startTime, EV().endTime)).toBe('6:30 PM – 7:30 PM ET');
  expect(formatTimeRange(EV().startTime, null)).toBe('6:30 PM ET');
  expect(formatTimeRange('2026-09-16T22:30:00Z', '2026-09-18T14:00:00Z')).toBe('6:30 PM – Sep 18, 10:00 AM ET');
});

test('dateTile', () => {
  expect(dateTile('2026-09-16T22:30:00Z')).toEqual({ month: 'Sep', day: '16', weekday: 'Wed' });
});

test('formatDayKey', () => {
  expect(formatDayKey('2026-09-16')).toBe('Wednesday, September 16');
});

test('buildMonthGrid pads to whole weeks', () => {
  const cells = buildMonthGrid(2026, 8); // September 2026 starts on a Tuesday
  expect(cells.length % 7).toBe(0);
  expect(cells[0]).toEqual({ key: '2026-08-30', day: 30, inMonth: false });
  expect(cells[2]).toEqual({ key: '2026-09-01', day: 1, inMonth: true });
  expect(cells.filter(c => c.inMonth)).toHaveLength(30);
});

test('groupByDay buckets by Purdue date and sorts', () => {
  const late = EV({ id: 'b', startTime: '2026-09-17T01:00:00Z' }); // 9 PM on the 16th
  const early = EV({ id: 'a' });
  const map = groupByDay([late, early]);
  expect(map.get('2026-09-16').map(e => e.id)).toEqual(['a', 'b']);
});

test('upcomingEvents keeps in-progress events and sorts', () => {
  const now = new Date('2026-09-16T23:00:00Z');
  const past = EV({ id: 'p', startTime: '2026-09-10T22:30:00Z', endTime: '2026-09-10T23:30:00Z' });
  const running = EV({ id: 'r' });
  const next = EV({ id: 'n', startTime: '2026-09-20T22:30:00Z', endTime: null });
  expect(upcomingEvents([next, past, running], now).map(e => e.id)).toEqual(['r', 'n']);
});

test('filterByType treats unknown types as OTHER', () => {
  const list = [EV({ id: 'm' }), EV({ id: 'x', type: 'WEIRD' }), EV({ id: 's', type: 'SOCIAL' })];
  expect(filterByType(list, 'ALL')).toHaveLength(3);
  expect(filterByType(list, 'OTHER').map(e => e.id)).toEqual(['x']);
  expect(filterByType(list, 'SOCIAL').map(e => e.id)).toEqual(['s']);
});

test('month helpers', () => {
  expect(purdueMonthOf('2026-10-01T02:00:00Z')).toEqual({ year: 2026, month: 8 }); // still Sep 30 in Indiana
  expect(shiftMonth({ year: 2026, month: 11 }, 1)).toEqual({ year: 2027, month: 0 });
  expect(shiftMonth({ year: 2026, month: 0 }, -1)).toEqual({ year: 2025, month: 11 });
  expect(compareMonth({ year: 2026, month: 8 }, { year: 2026, month: 9 })).toBeLessThan(0);
  expect(compareMonth({ year: 2026, month: 8 }, { year: 2026, month: 8 })).toBe(0);
  expect(monthLabel({ year: 2026, month: 8 })).toBe('September 2026');
});
```

- [ ] **Step 2: Run — expect FAIL** (`Cannot find module './publicEvents'`).

### Task 5.2: Implement `publicEvents.js`

**Files:**
- Create: `src/lib/publicEvents.js`

- [ ] **Step 1: Write the module:**

```js
// Pure helpers for the public homepage events calendar. Everything is
// rendered in Purdue time so a student reading the site from anywhere sees
// when the meeting actually happens in West Lafayette.

export const PURDUE_TZ = 'America/Indiana/Indianapolis';

// Full literal FA class strings — the icon-subset scanner must see them.
export const PUBLIC_EVENT_TYPES = {
  MEETING:  { label: 'Meeting',  plural: 'Meetings',  icon: 'fas fa-users',              color: '#b83225' },
  WORKSHOP: { label: 'Workshop', plural: 'Workshops', icon: 'fas fa-chalkboard-teacher', color: '#9a5b00' },
  SOCIAL:   { label: 'Social',   plural: 'Socials',   icon: 'fas fa-star',               color: '#5b4bc4' },
  OTHER:    { label: 'Event',    plural: 'Other',     icon: 'fas fa-calendar-day',       color: '#6b5f58' },
};

export function typeConfig(type) {
  return PUBLIC_EVENT_TYPES[type] ?? PUBLIC_EVENT_TYPES.OTHER;
}

const dayPartsFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: PURDUE_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
});
const timeFmt = new Intl.DateTimeFormat('en-US', { timeZone: PURDUE_TZ, hour: 'numeric', minute: '2-digit' });
const shortDateFmt = new Intl.DateTimeFormat('en-US', { timeZone: PURDUE_TZ, month: 'short', day: 'numeric' });
const tileFmt = new Intl.DateTimeFormat('en-US', { timeZone: PURDUE_TZ, month: 'short', day: 'numeric', weekday: 'short' });
// Day keys are calendar dates, so they're formatted as UTC noon to stay put.
const longDayFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric' });
const monthFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'long', year: 'numeric' });

function parts(fmt, date) {
  return Object.fromEntries(fmt.formatToParts(new Date(date)).map(p => [p.type, p.value]));
}

/** 'YYYY-MM-DD' of the given instant in Purdue time. */
export function purdueDayKey(date) {
  const p = parts(dayPartsFmt, date);
  return `${p.year}-${p.month}-${p.day}`;
}

// ICU 72+ (Node 20, current Chrome) puts U+202F NARROW NO-BREAK SPACE before
// AM/PM; normalize so output is identical across engines and tests.
export function formatPurdueTime(date) {
  return timeFmt.format(new Date(date)).replace(/[\u202f\u00a0]/g, ' ');
}

export function formatTimeRange(start, end) {
  const s = formatPurdueTime(start);
  if (!end) return `${s} ET`;
  if (purdueDayKey(start) === purdueDayKey(end)) return `${s} – ${formatPurdueTime(end)} ET`;
  return `${s} – ${shortDateFmt.format(new Date(end))}, ${formatPurdueTime(end)} ET`;
}

export function dateTile(date) {
  const p = parts(tileFmt, date);
  return { month: p.month, day: p.day, weekday: p.weekday };
}

function keyToUtcNoon(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
}

export function formatDayKey(key) {
  return longDayFmt.format(keyToUtcNoon(key));
}

/** Whole-week grid for a month (month is 0-based). Pure calendar math in UTC. */
export function buildMonthGrid(year, month) {
  const lead = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const total = Math.ceil((lead + daysInMonth) / 7) * 7;
  return Array.from({ length: total }, (_, i) => {
    const d = new Date(Date.UTC(year, month, 1 - lead + i));
    return { key: d.toISOString().slice(0, 10), day: d.getUTCDate(), inMonth: d.getUTCMonth() === month };
  });
}

const byStart = (a, b) => new Date(a.startTime) - new Date(b.startTime);

export function groupByDay(events) {
  const map = new Map();
  for (const ev of [...events].sort(byStart)) {
    const key = purdueDayKey(ev.startTime);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(ev);
  }
  return map;
}

/** Events that haven't ended yet (in-progress ones included), soonest first. */
export function upcomingEvents(events, now = new Date()) {
  return events.filter(ev => new Date(ev.endTime ?? ev.startTime) >= now).sort(byStart);
}

export function filterByType(events, type) {
  if (type === 'ALL') return events;
  return events.filter(ev => (PUBLIC_EVENT_TYPES[ev.type] ? ev.type : 'OTHER') === type);
}

export function purdueMonthOf(date) {
  const [y, m] = purdueDayKey(date).split('-').map(Number);
  return { year: y, month: m - 1 };
}

export function shiftMonth({ year, month }, delta) {
  const idx = year * 12 + month + delta;
  return { year: Math.floor(idx / 12), month: ((idx % 12) + 12) % 12 };
}

export function compareMonth(a, b) {
  return (a.year * 12 + a.month) - (b.year * 12 + b.month);
}

export function monthLabel({ year, month }) {
  return monthFmt.format(new Date(Date.UTC(year, month, 1, 12)));
}
```

- [ ] **Step 2: Run — expect PASS.** `CI=true npx react-scripts test --watchAll=false src/lib/publicEvents.test.js`
  If a time assertion still fails on whitespace, print the raw string with `JSON.stringify` to see which Unicode space the engine emitted and extend the `.replace()` in `formatPurdueTime` — do not loosen the test.

### Task 5.3: `calendarLinks.js` — tests first

**Files:**
- Create: `src/lib/calendarLinks.test.js`

- [ ] **Step 1: Write tests:**

```js
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
```

- [ ] **Step 2: Run — expect FAIL** (module missing).

### Task 5.4: Implement `calendarLinks.js`

**Files:**
- Create: `src/lib/calendarLinks.js`

- [ ] **Step 1: Write the module:**

```js
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
```

- [ ] **Step 2: Run both test files — expect PASS.**
  `CI=true npx react-scripts test --watchAll=false src/lib/publicEvents.test.js src/lib/calendarLinks.test.js`
- [ ] **Step 3:** `npm run build` → compiles (the new modules aren't imported yet; this just proves nothing else broke).
- [ ] **Step 4: Commit**

```bash
git add src/lib/publicEvents.js src/lib/publicEvents.test.js src/lib/calendarLinks.js src/lib/calendarLinks.test.js
git commit -m "feat(home): pure helpers for public events calendar and calendar links"
```

---

## Phase 6 — Home presentational components + their CSS

### Task 6.1: `PublicCalendarMenu.jsx`

**Files:**
- Create: `src/components/events/PublicCalendarMenu.jsx`

- [ ] **Step 1: Write:**

```jsx
import { useEffect, useId, useRef, useState } from 'react';

/**
 * Small disclosure dropdown used for "Subscribe" and "Add to calendar".
 * Not an ARIA `menu` (that would require arrow-key roving focus); a button +
 * list of links is fully keyboard-usable as-is. Closes on outside click/tap
 * and Escape (Escape returns focus to the toggle).
 *
 * items: [{ label, icon, href?, external?, onSelect?, keepOpen? }]
 */
export default function PublicCalendarMenu({
  label, icon, items, align = 'left', variant = 'solid', footnote = null, ariaLabel,
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const toggleRef = useRef(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return undefined;
    function onPointer(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    }
    function onKey(e) {
      if (e.key === 'Escape') {
        setOpen(false);
        toggleRef.current?.focus();
      }
    }
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('touchstart', onPointer, { passive: true });
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('touchstart', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className={`home-events-menu${open ? ' is-open' : ''}`} ref={rootRef}>
      <button
        ref={toggleRef}
        type="button"
        className={`home-events-menu-btn${variant === 'ghost' ? ' home-events-menu-btn--ghost' : ''}`}
        aria-expanded={open}
        aria-controls={listId}
        aria-label={ariaLabel}
        onClick={() => setOpen(o => !o)}
      >
        {icon && <i className={icon} aria-hidden="true" />}
        <span>{label}</span>
        <i className="fas fa-chevron-down home-events-menu-caret" aria-hidden="true" />
      </button>
      {open && (
        <ul id={listId} className={`home-events-menu-list home-events-menu-list--${align}`}>
          {items.map(item => (
            <li key={item.label}>
              {item.href ? (
                <a
                  href={item.href}
                  className="home-events-menu-item"
                  target={item.external ? '_blank' : undefined}
                  rel={item.external ? 'noopener noreferrer' : undefined}
                  onClick={() => setOpen(false)}
                >
                  <i className={item.icon} aria-hidden="true" />
                  {item.label}
                </a>
              ) : (
                <button
                  type="button"
                  className="home-events-menu-item"
                  onClick={() => { item.onSelect?.(); if (!item.keepOpen) setOpen(false); }}
                >
                  <i className={item.icon} aria-hidden="true" />
                  {item.label}
                </button>
              )}
            </li>
          ))}
          {footnote && <li className="home-events-menu-note">{footnote}</li>}
        </ul>
      )}
    </div>
  );
}
```

### Task 6.2: `PublicEventCard.jsx`

**Files:**
- Create: `src/components/events/PublicEventCard.jsx`

- [ ] **Step 1: Write:**

```jsx
import PublicCalendarMenu from './PublicCalendarMenu';
import { typeConfig, dateTile, formatTimeRange, formatDayKey, purdueDayKey } from '../../lib/publicEvents';
import { googleAddUrl, outlookAddUrl, eventIcsUrl } from '../../lib/calendarLinks';

export default function PublicEventCard({ event, expanded, onToggle }) {
  const cfg = typeConfig(event.type);
  const tile = dateTile(event.startTime);
  const descId = `home-event-desc-${event.id}`;

  const addItems = [
    { label: 'Google Calendar', icon: 'fab fa-google', href: googleAddUrl(event), external: true },
    { label: 'Outlook.com', icon: 'fab fa-microsoft', href: outlookAddUrl(event, 'live'), external: true },
    { label: 'Microsoft 365 (Purdue)', icon: 'fas fa-building', href: outlookAddUrl(event, 'office'), external: true },
    { label: 'Apple / other (.ics)', icon: 'fas fa-download', href: eventIcsUrl(event.id) },
  ];

  return (
    <article className="home-events-card" style={{ '--event-color': cfg.color }}>
      <div className="home-events-date" aria-hidden="true">
        <span className="home-events-date-month">{tile.month}</span>
        <span className="home-events-date-day">{tile.day}</span>
        <span className="home-events-date-weekday">{tile.weekday}</span>
      </div>

      <div className="home-events-card-body">
        <span className="home-events-type">
          <i className={cfg.icon} aria-hidden="true" />
          {cfg.label}
        </span>
        <h3 className="home-events-card-title">{event.title}</h3>
        <p className="home-events-meta">
          <span>
            <i className="fas fa-clock" aria-hidden="true" />
            <span className="sr-only">{formatDayKey(purdueDayKey(event.startTime))}, </span>
            {formatTimeRange(event.startTime, event.endTime)}
          </span>
          <span>
            <i className={event.isVirtual ? 'fas fa-video' : 'fas fa-map-marker-alt'} aria-hidden="true" />
            {event.isVirtual ? 'Online' : (event.location || 'Location TBA')}
          </span>
        </p>
        {event.description && (
          <>
            <button
              type="button"
              className="home-events-more"
              aria-expanded={expanded}
              aria-controls={descId}
              onClick={onToggle}
            >
              {expanded ? 'Hide details' : 'Details'}
              <i className="fas fa-chevron-down home-events-menu-caret" aria-hidden="true" />
            </button>
            <p id={descId} className="home-events-desc" hidden={!expanded}>{event.description}</p>
          </>
        )}
      </div>

      <div className="home-events-card-actions">
        <PublicCalendarMenu
          label="Add"
          ariaLabel={`Add ${event.title} to your calendar`}
          icon="fas fa-calendar-plus"
          items={addItems}
          align="right"
          variant="ghost"
        />
      </div>
    </article>
  );
}
```

### Task 6.3: `PublicEventsMonthGrid.jsx`

**Files:**
- Create: `src/components/events/PublicEventsMonthGrid.jsx`

- [ ] **Step 1: Write:**

```jsx
import { useMemo } from 'react';
import { buildMonthGrid, monthLabel, formatDayKey, typeConfig, PUBLIC_EVENT_TYPES } from '../../lib/publicEvents';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function PublicEventsMonthGrid({
  month, canPrev, canNext, onPrev, onNext, eventsByDay, selectedKey, onSelectDay, todayKey,
}) {
  const cells = useMemo(() => buildMonthGrid(month.year, month.month), [month]);

  return (
    <div className="home-events-grid-wrap">
      <div className="home-events-grid-head">
        <button type="button" className="home-events-nav" onClick={onPrev} disabled={!canPrev} aria-label="Previous month">
          <i className="fas fa-chevron-left" aria-hidden="true" />
        </button>
        <h3 className="home-events-grid-title" aria-live="polite">{monthLabel(month)}</h3>
        <button type="button" className="home-events-nav" onClick={onNext} disabled={!canNext} aria-label="Next month">
          <i className="fas fa-chevron-right" aria-hidden="true" />
        </button>
      </div>

      <div className="home-events-grid">
        {WEEKDAYS.map((d, i) => (
          <span key={WEEKDAY_NAMES[i]} className="home-events-weekday" aria-hidden="true">{d}</span>
        ))}
        {cells.map(cell => {
          const dayEvents = eventsByDay.get(cell.key) ?? [];
          const classes = [
            'home-events-day',
            cell.inMonth ? '' : 'home-events-day--out',
            cell.key === todayKey ? 'home-events-day--today' : '',
          ].filter(Boolean).join(' ');

          if (dayEvents.length === 0) {
            return (
              <span key={cell.key} className={classes}>
                <span className="home-events-day-num">{cell.day}</span>
              </span>
            );
          }

          const colors = [...new Set(dayEvents.map(ev => typeConfig(ev.type).color))].slice(0, 3);
          const count = dayEvents.length;
          return (
            <button
              key={cell.key}
              type="button"
              className={classes}
              aria-pressed={selectedKey === cell.key}
              aria-label={`${formatDayKey(cell.key)}: ${count} event${count === 1 ? '' : 's'}`}
              onClick={() => onSelectDay(selectedKey === cell.key ? null : cell.key)}
            >
              <span className="home-events-day-num">{cell.day}</span>
              <span className="home-events-dots" aria-hidden="true">
                {colors.map(c => <span key={c} className="home-events-dot" style={{ background: c }} />)}
              </span>
            </button>
          );
        })}
      </div>

      <div className="home-events-legend" aria-hidden="true">
        {Object.entries(PUBLIC_EVENT_TYPES).map(([key, cfg]) => (
          <span key={key}><span className="home-events-dot" style={{ background: cfg.color }} />{cfg.plural}</span>
        ))}
      </div>
    </div>
  );
}
```

### Task 6.4: Home CSS (part 1 — menu, grid, cards)

**Files:**
- Modify: `public/search-theme.css` — **append to the end only; do not Read the file.**

Tokens used all exist in its `:root`: `--color-text`, `--color-muted`, `--color-border`, `--color-accent`, `--color-accent-hover`, `--color-card-bg`, `--color-bg-secondary`, `--font-heading`. (Do **not** use `--color-text-muted` — it is not declared for the public site.)

- [ ] **Step 1: Append:**

```css

/* ===== HOME — Public events calendar (src/components/events/*) ===== */

/* Dropdown (Subscribe / Add to calendar) */
.home-events-menu { position: relative; display: inline-block; }
.home-events-menu-btn {
  display: inline-flex; align-items: center; gap: 0.5rem;
  padding: 0.55rem 1.15rem; border-radius: 999px;
  border: 1px solid var(--color-accent, #b83225);
  background: var(--color-accent, #b83225); color: #fff;
  font-size: 0.9rem; font-weight: 700; cursor: pointer;
  transition: background-color 0.15s ease, border-color 0.15s ease;
}
.home-events-menu-btn:hover {
  background: var(--color-accent-hover, #8f2319);
  border-color: var(--color-accent-hover, #8f2319);
}
.home-events-menu-btn--ghost {
  padding: 0.35rem 0.8rem; font-size: 0.8rem;
  background: #fff; color: var(--color-text, #1a1a1a);
  border-color: var(--color-border, #d4c5b5);
}
.home-events-menu-btn--ghost:hover {
  background: var(--color-bg-secondary, #ede3d8);
  border-color: var(--color-muted, #7a6f68);
}
.home-events-menu-caret { font-size: 0.7em; transition: transform 0.15s ease; }
.home-events-menu.is-open .home-events-menu-caret,
.home-events-more[aria-expanded="true"] .home-events-menu-caret { transform: rotate(180deg); }
.home-events-menu-list {
  position: absolute; top: calc(100% + 6px); z-index: 30;
  min-width: 240px; margin: 0; padding: 0.35rem; list-style: none;
  background: #fff; border: 1px solid var(--color-border, #d4c5b5); border-radius: 10px;
  box-shadow: 0 10px 30px rgba(26, 26, 26, 0.14);
}
.home-events-menu-list--left { left: 0; }
.home-events-menu-list--right { right: 0; }
.home-events-menu-item {
  display: flex; align-items: center; gap: 0.6rem; width: 100%;
  padding: 0.5rem 0.7rem; border: 0; border-radius: 6px; background: none;
  color: var(--color-text, #1a1a1a); font-size: 0.9rem; text-align: left;
  text-decoration: none; cursor: pointer;
}
.home-events-menu-item:hover,
.home-events-menu-item:focus-visible {
  background: var(--color-bg-secondary, #ede3d8);
  color: var(--color-text, #1a1a1a); text-decoration: none;
}
.home-events-menu-item i { width: 1.1em; text-align: center; color: var(--color-muted, #7a6f68); }
.home-events-menu-note {
  margin-top: 0.25rem; padding: 0.45rem 0.7rem 0.3rem;
  border-top: 1px solid var(--color-border, #d4c5b5);
  font-size: 0.75rem; color: var(--color-muted, #7a6f68);
}

/* Month grid */
.home-events-grid-wrap {
  padding: 1.25rem; border-radius: 14px;
  background: var(--color-card-bg, #fff9f4); border: 1px solid var(--color-border, #d4c5b5);
}
.home-events-grid-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem; }
.home-events-grid-title { margin: 0; font-size: 1.15rem; color: var(--color-text, #1a1a1a); }
.home-events-nav {
  width: 34px; height: 34px; border-radius: 50%; cursor: pointer;
  border: 1px solid var(--color-border, #d4c5b5); background: #fff; color: var(--color-text, #1a1a1a);
}
.home-events-nav:disabled { opacity: 0.35; cursor: default; }
.home-events-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; }
.home-events-weekday {
  padding-bottom: 0.25rem; text-align: center;
  font-size: 0.7rem; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase;
  color: var(--color-muted, #7a6f68);
}
.home-events-day {
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px;
  aspect-ratio: 1 / 1; min-height: 36px; padding: 0;
  border: 1px solid transparent; border-radius: 8px; background: none;
  font-size: 0.85rem; color: var(--color-text, #1a1a1a);
}
.home-events-day--out { color: var(--color-muted, #7a6f68); opacity: 0.45; }
.home-events-day-num {
  display: inline-flex; align-items: center; justify-content: center;
  width: 1.8em; height: 1.8em; border-radius: 50%;
}
.home-events-day--today .home-events-day-num { box-shadow: 0 0 0 2px var(--color-accent, #b83225); }
button.home-events-day { cursor: pointer; font-weight: 700; }
button.home-events-day:hover { background: var(--color-bg-secondary, #ede3d8); }
button.home-events-day[aria-pressed="true"] { background: var(--color-accent, #b83225); color: #fff; }
button.home-events-day[aria-pressed="true"] .home-events-dot { background: #fff !important; }
.home-events-dots { display: flex; gap: 3px; height: 5px; }
.home-events-dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; }
.home-events-legend {
  display: flex; flex-wrap: wrap; gap: 0.4rem 1rem; margin-top: 1rem;
  font-size: 0.75rem; color: var(--color-muted, #7a6f68);
}
.home-events-legend > span { display: inline-flex; align-items: center; gap: 0.35rem; }

/* Event cards */
.home-events-list { display: flex; flex-direction: column; gap: 0.75rem; }
.home-events-card {
  display: grid; grid-template-columns: 64px 1fr auto; gap: 1rem; align-items: start;
  padding: 1rem 1.1rem; border-radius: 12px;
  background: var(--color-card-bg, #fff9f4);
  border: 1px solid var(--color-border, #d4c5b5);
  border-left: 4px solid var(--event-color, var(--color-accent, #b83225));
}
.home-events-date {
  display: flex; flex-direction: column; align-items: center; padding: 0.4rem 0; line-height: 1.1;
  border-radius: 8px; background: #fff; border: 1px solid var(--color-border, #d4c5b5);
}
.home-events-date-month {
  font-size: 0.7rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;
  color: var(--event-color, var(--color-accent, #b83225));
}
.home-events-date-day { font-family: var(--font-heading); font-size: 1.6rem; font-weight: 700; color: var(--color-text, #1a1a1a); }
.home-events-date-weekday { font-size: 0.7rem; color: var(--color-muted, #7a6f68); }
.home-events-card-body { min-width: 0; }
.home-events-type {
  display: inline-flex; align-items: center; gap: 0.35rem;
  font-size: 0.7rem; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase;
  color: var(--event-color, var(--color-accent, #b83225));
}
.home-events-card-title {
  margin: 0.2rem 0 0.35rem; font-size: 1.1rem; line-height: 1.3;
  color: var(--color-text, #1a1a1a); overflow-wrap: anywhere;
}
.home-events-meta { display: flex; flex-wrap: wrap; gap: 0.25rem 1rem; margin: 0; font-size: 0.85rem; color: var(--color-muted, #7a6f68); }
.home-events-meta i { margin-right: 0.35rem; }
.home-events-more {
  display: inline-flex; align-items: center; gap: 0.35rem; margin-top: 0.4rem; padding: 0;
  border: 0; background: none; cursor: pointer;
  font-size: 0.8rem; font-weight: 700; color: var(--color-accent, #b83225);
}
.home-events-desc { margin: 0.5rem 0 0; font-size: 0.9rem; white-space: pre-line; color: var(--color-text, #1a1a1a); }

@media (max-width: 575.98px) {
  .home-events-card { grid-template-columns: 52px 1fr; }
  .home-events-card-actions { grid-column: 1 / -1; }
}
@media (prefers-reduced-motion: reduce) {
  .home-events-menu-caret,
  .home-events-menu-btn { transition: none; }
}
```

### Task 6.5: Gate + commit

- [ ] **Step 1:** `npm run build` → compiles. (Components aren't mounted yet; ESLint must still be clean — CRA fails CI builds on lint *errors*.)
- [ ] **Step 2: Commit**

```bash
git add src/components/events public/search-theme.css
git commit -m "feat(home): public events card, month grid, and calendar menu components"
```

---

## Phase 7 — Section container, Home mount, docs, verification

### Task 7.1: `PublicEventsCalendar.jsx`

**Files:**
- Create: `src/components/events/PublicEventsCalendar.jsx`

- [ ] **Step 1: Write:**

```jsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PublicCalendarMenu from './PublicCalendarMenu';
import PublicEventCard from './PublicEventCard';
import PublicEventsMonthGrid from './PublicEventsMonthGrid';
import {
  groupByDay, upcomingEvents, filterByType, purdueDayKey, purdueMonthOf,
  shiftMonth, compareMonth, formatDayKey,
} from '../../lib/publicEvents';
import {
  feedHttpsUrl, feedWebcalUrl, googleSubscribeUrl, outlookSubscribeUrl,
} from '../../lib/calendarLinks';

const API_BASE = process.env.REACT_APP_API_URL || '';
const DAY_MS = 86_400_000;
const PAGE = 6;
const FILTERS = [
  { key: 'ALL', label: 'All' },
  { key: 'MEETING', label: 'Meetings' },
  { key: 'WORKSHOP', label: 'Workshops' },
  { key: 'SOCIAL', label: 'Socials' },
  { key: 'OTHER', label: 'Other' },
];

export default function PublicEventsCalendar() {
  const sectionRef = useRef(null);
  const copiedTimer = useRef(null);

  // One fetch covers the whole navigable window (see plan decision 9).
  const [range] = useState(() => {
    const now = Date.now();
    return { from: new Date(now - 30 * DAY_MS), to: new Date(now + 330 * DAY_MS) };
  });
  const [shouldLoad, setShouldLoad] = useState(false);
  const [status, setStatus] = useState('idle'); // idle | loading | ready | error
  const [events, setEvents] = useState([]);
  const [month, setMonth] = useState(() => purdueMonthOf(new Date()));
  const [selectedKey, setSelectedKey] = useState(null);
  const [filter, setFilter] = useState('ALL');
  const [visible, setVisible] = useState(PAGE);
  const [expandedId, setExpandedId] = useState(null);
  const [copied, setCopied] = useState(false);

  // Don't hit the API for visitors who never scroll this far.
  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return undefined;
    if (typeof IntersectionObserver === 'undefined') { setShouldLoad(true); return undefined; }
    const io = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) { setShouldLoad(true); io.disconnect(); }
    }, { rootMargin: '400px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      const qs = new URLSearchParams({ from: range.from.toISOString(), to: range.to.toISOString() });
      const res = await fetch(`${API_BASE}/api/public/events?${qs.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setEvents(Array.isArray(data) ? data : []);
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, [range]);

  useEffect(() => { if (shouldLoad) load(); }, [shouldLoad, load]);
  useEffect(() => () => clearTimeout(copiedTimer.current), []);
  useEffect(() => { setVisible(PAGE); }, [filter, selectedKey]);

  const filtered = useMemo(() => filterByType(events, filter), [events, filter]);
  const byDay = useMemo(() => groupByDay(filtered), [filtered]);
  const list = useMemo(
    () => (selectedKey ? (byDay.get(selectedKey) ?? []) : upcomingEvents(filtered, new Date())),
    [selectedKey, byDay, filtered],
  );

  const todayKey = purdueDayKey(new Date());
  const minMonth = purdueMonthOf(range.from);
  const maxMonth = purdueMonthOf(range.to);

  async function copyFeed() {
    const url = feedHttpsUrl();
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      window.prompt('Copy this calendar feed URL:', url);
      return;
    }
    setCopied(true);
    clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(false), 2000);
  }

  const subscribeItems = [
    { label: 'Google Calendar', icon: 'fab fa-google', href: googleSubscribeUrl(), external: true },
    { label: 'Apple Calendar', icon: 'fab fa-apple', href: feedWebcalUrl() },
    { label: 'Outlook.com', icon: 'fab fa-microsoft', href: outlookSubscribeUrl('live'), external: true },
    { label: 'Microsoft 365 (Purdue)', icon: 'fas fa-building', href: outlookSubscribeUrl('office'), external: true },
    {
      label: copied ? 'Copied!' : 'Copy feed URL',
      icon: copied ? 'fas fa-check' : 'fas fa-link',
      onSelect: copyFeed,
      keepOpen: true,
    },
  ];

  let body;
  if (status === 'idle' || status === 'loading') {
    body = (
      <div className="home-events-list" aria-busy="true" aria-label="Loading events">
        {[0, 1, 2].map(i => <div key={i} className="home-events-skeleton" />)}
      </div>
    );
  } else if (status === 'error') {
    body = (
      <p className="home-events-state">
        We couldn't load events right now.{' '}
        <button type="button" className="home-events-link-btn" onClick={load}>Try again</button>
      </p>
    );
  } else if (list.length === 0) {
    body = (
      <p className="home-events-state">
        {selectedKey
          ? 'No events on this day.'
          : "No public events scheduled yet — subscribe and they'll show up in your calendar as soon as they're announced."}
      </p>
    );
  } else {
    body = (
      <div className="home-events-list">
        {list.slice(0, visible).map(ev => (
          <PublicEventCard
            key={ev.id}
            event={ev}
            expanded={expandedId === ev.id}
            onToggle={() => setExpandedId(id => (id === ev.id ? null : ev.id))}
          />
        ))}
        {list.length > visible && (
          <button type="button" className="home-events-menu-btn home-events-menu-btn--ghost home-events-show-more" onClick={() => setVisible(v => v + PAGE)}>
            Show more events
          </button>
        )}
      </div>
    );
  }

  return (
    <section id="events" className="home-events" ref={sectionRef} aria-labelledby="home-events-title">
      <div className="container">
        <div className="home-events-header" data-aos="fade-up">
          <div className="home-events-heading">
            <h2 id="home-events-title" className="section-title">Upcoming <b>Events</b></h2>
            <p className="section-sub-title">
              General meetings, workshops, and socials — open to all Purdue students. All times are Eastern.
            </p>
          </div>
          <PublicCalendarMenu
            label="Subscribe"
            icon="fas fa-rss"
            items={subscribeItems}
            align="right"
            footnote="Subscribed calendars update automatically every few hours."
          />
        </div>

        <div className="row">
          <div className="col-lg-5 mb-4 mb-lg-0">
            <PublicEventsMonthGrid
              month={month}
              canPrev={compareMonth(month, minMonth) > 0}
              canNext={compareMonth(month, maxMonth) < 0}
              onPrev={() => setMonth(m => shiftMonth(m, -1))}
              onNext={() => setMonth(m => shiftMonth(m, 1))}
              eventsByDay={byDay}
              selectedKey={selectedKey}
              onSelectDay={setSelectedKey}
              todayKey={todayKey}
            />
          </div>
          <div className="col-lg-7">
            <div className="home-events-filters" role="group" aria-label="Filter events by type">
              {FILTERS.map(f => (
                <button
                  key={f.key}
                  type="button"
                  className="home-events-chip"
                  aria-pressed={filter === f.key}
                  onClick={() => setFilter(f.key)}
                >
                  {f.label}
                </button>
              ))}
            </div>
            {selectedKey && (
              <div className="home-events-day-banner">
                <span>Showing <strong>{formatDayKey(selectedKey)}</strong></span>
                <button type="button" className="home-events-link-btn" onClick={() => setSelectedKey(null)}>
                  Show all upcoming
                </button>
              </div>
            )}
            <div aria-live="polite">{body}</div>
          </div>
        </div>
      </div>
    </section>
  );
}
```

### Task 7.2: Mount on Home

**Files:**
- Modify: `src/pages/Home.jsx` (Grep `id="features"` and `id="about-search"`)

- [ ] **Step 1: Import.** After `import JsonLd from '../components/JsonLd';` add:

```js
import PublicEventsCalendar from '../components/events/PublicEventsCalendar';
```

- [ ] **Step 2: Mount.** Between the closing `</section>` of `<section id="features" ...>` and the `{/* ===== ABOUT SEARCH — 2-column brand story ===== */}` comment, insert:

```jsx
      {/* ===== UPCOMING EVENTS — public Constellation events (isPublic, non-deadline) ===== */}
      <PublicEventsCalendar />
```

### Task 7.3: Home CSS (part 2 — section, header, filters, states)

**Files:**
- Modify: `public/search-theme.css` — **append to the end only.**

- [ ] **Step 1: Append:**

```css

/* HOME — Public events calendar: section shell, header, filters, states */
.home-events { padding: 80px 0; background: var(--color-bg-secondary, #ede3d8); }
.home-events-header {
  display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between;
  gap: 1rem 2rem; margin-bottom: 2rem;
}
.home-events-heading { max-width: 640px; text-align: left; }
.home-events-heading .section-title,
.home-events-heading .section-sub-title { text-align: left; }
.home-events-heading .section-sub-title { margin-bottom: 0; }
.home-events-filters { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 1rem; }
.home-events-chip {
  padding: 0.3rem 0.85rem; border-radius: 999px; cursor: pointer;
  border: 1px solid var(--color-border, #d4c5b5); background: #fff;
  font-size: 0.8rem; font-weight: 700; color: var(--color-text, #1a1a1a);
}
.home-events-chip[aria-pressed="true"] {
  background: var(--color-text, #1a1a1a); border-color: var(--color-text, #1a1a1a); color: #fff;
}
.home-events-day-banner {
  display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.5rem;
  margin-bottom: 1rem; padding: 0.55rem 0.9rem; border-radius: 8px;
  background: rgba(184, 50, 37, 0.08); font-size: 0.85rem; color: var(--color-text, #1a1a1a);
}
.home-events-link-btn {
  padding: 0; border: 0; background: none; cursor: pointer;
  font-weight: 700; color: var(--color-accent, #b83225); text-decoration: underline;
}
.home-events-show-more { align-self: center; margin-top: 0.25rem; }
.home-events-state {
  margin: 0; padding: 2rem 1.25rem; text-align: center;
  border: 1px dashed var(--color-border, #d4c5b5); border-radius: 12px;
  color: var(--color-muted, #7a6f68); background: rgba(255, 255, 255, 0.5);
}
.home-events-skeleton {
  height: 96px; border-radius: 12px;
  background: linear-gradient(90deg, rgba(0, 0, 0, 0.04) 25%, rgba(0, 0, 0, 0.08) 37%, rgba(0, 0, 0, 0.04) 63%);
  background-size: 400% 100%;
  animation: home-events-shimmer 1.4s ease infinite;
}
@keyframes home-events-shimmer {
  0% { background-position: 100% 50%; }
  100% { background-position: 0 50%; }
}
@media (max-width: 767.98px) {
  .home-events { padding: 56px 0; }
  .home-events-header { align-items: flex-start; }
}
@media (prefers-reduced-motion: reduce) {
  .home-events-skeleton { animation: none; }
}
```

### Task 7.4: Docs

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1:** In the **API Routes** list, change the `public.ts` bullet to:

```markdown
- `public.ts` — Unauthenticated endpoints (the public site reads these). Includes the homepage events calendar: `GET /api/public/events` (JSON, `isPublic` + non-DEADLINE only, payload built by construction in `services/publicEventService.ts`), `GET /api/public/events.ics` (subscribable feed; UIDs `evt-<id>@purduesearch.org` — never change them once shipped, same reason as the poll UID), `GET /api/public/events/:eventId/ics` (single-event download).
```

- [ ] **Step 2:** In the **File Structure** tree under `src/components/`, add after the `ares/` entry:

```
│       ├── events/                 # Public homepage events calendar (PublicEventsCalendar + MonthGrid + EventCard + CalendarMenu); pure logic in src/lib/publicEvents.js + calendarLinks.js
```

- [ ] **Step 3:** Under **Workflow Notes & Gotchas → General**, add:

```markdown
- **`Event.isPublic` defaults to `false` in the DB on purpose.** Only the ClubPM event form and the Slack `/event` modal opt in (UI default on, with a confirm step in `EventFormModal`). Any new event-creating path stays private unless it deliberately passes `isPublic`. `eventService` forces `DEADLINE` events to `false`.
```

### Task 7.5: Verification

- [ ] **Step 1: Unit tests.**
  `CI=true npx react-scripts test --watchAll=false src/lib/publicEvents.test.js src/lib/calendarLinks.test.js` → all pass.
  `cd backend && npx tsx src/services/publicEventService.test.ts` → `0 failed`.
- [ ] **Step 2: Gates.** `cd backend && npx tsc --noEmit` → clean. Repo root `npm run build` → compiles; check the `[minify-css]` log lines list `search-theme.css` and `clubpm-theme.css` as minified.
- [ ] **Step 3: Icons.** `npm run check:icons` → no unresolved names. Confirm `fa-google`, `fa-microsoft`, `fa-apple`, `fa-rss`, `fa-calendar-plus`, `fa-building` are in the regenerated `public/fa-subset.css` (Grep). Stage `public/fa-subset.css` + `public/webfonts/*` if changed.
- [ ] **Step 4: Browser check** (`npm start`, http://localhost:3000). Without a backend running the section must show the error state ("We couldn't load events right now. Try again") and **the rest of Home must render normally**. With a backend (`cd backend && npm run dev`) and at least one public event: cards render, times say "ET", dots appear on the grid, clicking a day filters, filter chips work, both dropdowns close on outside click and Escape, "Copy feed URL" shows "Copied!". At a 375px-wide viewport nothing scrolls horizontally.
- [ ] **Step 5: Hit-test.** CLAUDE.md warns that `.section-rail` once swallowed clicks mid-page. In DevTools, scroll the events section to the vertical middle of the viewport and run `document.elementFromPoint(x, y)` over a filter chip and a grid day — it must return the chip/day, not a rail element. (Home may not render the rail at all; if so, note it and move on.)
- [ ] **Step 6: Commit**

```bash
git add src/components/events/PublicEventsCalendar.jsx src/pages/Home.jsx public/search-theme.css CLAUDE.md
git commit -m "feat(home): upcoming events calendar section with add-to-calendar and subscribe"
```

- [ ] **Step 7: Hand-off notes for the user** (report, don't do): deploy the backend first (it runs `prisma migrate deploy`), then the frontend. After deploy, subscribe once via Google using the Subscribe menu and confirm the feed validates (paste the feed URL into https://icalendar.org/validator.html). Existing events are private until an admin opens each and turns on "Show on purduesearch.org".
