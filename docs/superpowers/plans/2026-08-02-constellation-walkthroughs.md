# Constellation Walkthroughs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `WALKTHROUGH` course-section kind that drives the real Constellation UI with a spotlight overlay, and install the Constellation 101 curriculum that uses it.

**Architecture:** Tour steps live in repo files under `docs/courses/` and are validated against a frozen anchor registry by a CI script, so renaming a UI element fails the build instead of silently breaking a live tour. A React context mounted above the router owns tour state so a tour survives navigation; an SVG `evenodd` path dims and blocks everything except the spotlit target. Hands-on steps run real API calls against a per-member seeded training project that is excluded from every real view in the product.

**Tech Stack:** React 19 + React Router 7 (frontend), Express + Prisma + PostgreSQL (backend), `tsx` for backend tests, plain CSS custom properties. **No new npm dependencies.**

## Global Constraints

- **No new npm dependencies.** The overlay is SVG + CSS; the runtime is React context.
- **Backend is ESM** (`"type": "module"`). All relative imports need the `.js` extension, including from `.ts` files.
- **Always read `req.memberId`, never `req.session.memberId`** in API handlers. Session reads are `undefined` for Bearer-token users and silently break them.
- **`express.json()` is capped at 100 kb.** No endpoint added here accepts a body near that.
- **ClubPM CSS goes in `public/clubpm-theme.css`**, appended at the bottom. Never `public/search-theme.css` — walkthroughs are `/clubpm/*` only.
- **Font Awesome for icons** (`<i className="fas fa-..." aria-hidden="true" />`). Never emoji.
- **Anchor ids are `surface.element[.variant]`**, lowercase dotted, except the four board columns which carry the uppercase `TaskStatus` enum value (`board.column.IN_PROGRESS`).
- **Anchors must never be used as CSS selectors.** They are targeting hooks only; a stylesheet dependency turns removing a dead anchor into a visual risk.
- **After every task:** `npm run build` at repo root and `npx tsc --noEmit` in `backend/` (after `npx prisma generate`). Fix all errors before the next task.
- **Spec:** `docs/superpowers/specs/2026-08-02-constellation-walkthrough-course-design.md`
- **Content, already written:** `docs/courses/` — 5 `course.json`, 10 video scripts, 11 quiz banks, 6 `.steps.json`, 98 anchors in `ANCHORS.md`.

---

## File Structure

| File | Responsibility |
|---|---|
| `backend/prisma/schema.prisma` | `WALKTHROUGH` enum value, `tourConfig`, `maxStepIndex`, `trainingForMemberId` |
| `backend/src/services/tourStepService.ts` | Load + validate step files from `docs/courses/`; clamp progress; completion predicate |
| `backend/src/services/trainingSandboxService.ts` | `ensureTrainingProject`, fixture seeding, archive |
| `backend/src/api/courses.ts` | 3 new routes: tour-progress, tour-breakage, tour-breakages |
| `backend/scripts/seedCourses.ts` | Idempotent installer reading `docs/courses/` |
| `src/clubpm/tour/tourAnchors.js` | Frozen anchor registry — the vocabulary |
| `src/clubpm/tour/TourProvider.jsx` | Tour state, navigation, advance modes, progress pings |
| `src/clubpm/tour/useAnchorRect.js` | Resolve an anchor to a live rect |
| `src/clubpm/tour/TourOverlay.jsx` | Scrim, spotlight path, coach card |
| `scripts/check-tour-anchors.js` | CI gate: registry ↔ components ↔ step files |

---

## Task 1: Schema and migration

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260802000000_walkthroughs/migration.sql`

**Interfaces:**
- Produces: `CourseSectionKind.WALKTHROUGH`; `CourseSection.tourConfig Json?`; `CourseSectionProgress.maxStepIndex Int`; `Project.trainingForMemberId String? @unique`

- [ ] **Step 1: Add the enum value**

In `schema.prisma`, find `enum CourseSectionKind` (~line 1899) and add the new value last:

```prisma
enum CourseSectionKind {
  CONTENT
  VIDEO
  QUIZ
  SLIDES
  WALKTHROUGH
}
```

- [ ] **Step 2: Add `tourConfig` to CourseSection**

In `model CourseSection`, directly after the `slideConfig Json?` line:

```prisma
  // WALKTHROUGH: { tourId, entryRoute, requiresTrainingProject, stepCount }
  // One JSON column, same idiom as videoConfig / slideConfig — every writer
  // spreads the previous value so a partial save cannot drop keys it does not own.
  tourConfig    Json?
```

- [ ] **Step 3: Add `maxStepIndex` to CourseSectionProgress**

Directly after the `maxSlideIndex` line:

```prisma
  // Server-clamped high-water mark for WALKTHROUGH sections.
  maxStepIndex     Int                  @default(0)
```

- [ ] **Step 4: Add `trainingForMemberId` to Project**

In `model Project`, after `pressKitToken`:

```prisma
  // Non-null means this is that member's private training project for the
  // onboarding course. The @unique is what makes ensureTrainingProject
  // idempotent by construction rather than by convention. Training projects are
  // excluded from every real listing — see Task 10.
  trainingForMemberId String? @unique
```

- [ ] **Step 5: Write the migration by hand**

Create `backend/prisma/migrations/20260802000000_walkthroughs/migration.sql`:

```sql
-- Additive only. No backfill, no existing row changes meaning.
ALTER TYPE "CourseSectionKind" ADD VALUE 'WALKTHROUGH';

ALTER TABLE "CourseSection" ADD COLUMN "tourConfig" JSONB;

ALTER TABLE "CourseSectionProgress" ADD COLUMN "maxStepIndex" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Project" ADD COLUMN "trainingForMemberId" TEXT;
CREATE UNIQUE INDEX "Project_trainingForMemberId_key" ON "Project"("trainingForMemberId");
```

- [ ] **Step 6: Apply and regenerate**

```bash
cd backend && npx prisma migrate dev --name walkthroughs && npx prisma generate
```

Expected: migration applies, client regenerates. **If `tsc` later reports unknown fields, you skipped `prisma generate`** — that is a known trap in this repo, not a real type error.

- [ ] **Step 7: Verify**

```bash
cd backend && npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations
git commit -m "feat(courses): WALKTHROUGH kind, tour progress, training project column"
```

---

## Task 2: Anchor registry and the CI gate

**Files:**
- Create: `src/clubpm/tour/tourAnchors.js`
- Create: `scripts/check-tour-anchors.js`
- Modify: `package.json` (add to the `test` script)

**Interfaces:**
- Produces: `TOUR_ANCHORS` — frozen `{ [id]: { label, route, note } }`; `isKnownAnchor(id) → boolean`

- [ ] **Step 1: Write the registry**

Create `src/clubpm/tour/tourAnchors.js`. Transcribe **all 98 anchors** from `docs/courses/ANCHORS.md`, in the same order. The shape:

```js
/**
 * The tour anchor vocabulary.
 *
 * Every id here must be rendered by exactly one component as `data-tour-id`,
 * and every `anchor` in a *.steps.json file must appear here.
 * `scripts/check-tour-anchors.js` enforces all three directions on every build.
 *
 * `route` is where the anchor is reachable — the runtime navigates there before
 * hunting for the element, so a wrong route means a step that degrades for no
 * reason. "*" means it is present on every ClubPM screen.
 *
 * These ids are targeting hooks, NOT styling hooks. Never select one in CSS.
 */
export const TOUR_ANCHORS = Object.freeze({
  "nav.sidebar":   { label: "Sidebar",        route: "*", note: "Whole rail, for coarse dimming" },
  "nav.dashboard": { label: "Dashboard link", route: "*", note: "" },
  // … all 98, grouped with the same comment headers ANCHORS.md uses
});

export function isKnownAnchor(id) {
  return Object.prototype.hasOwnProperty.call(TOUR_ANCHORS, id);
}
```

- [ ] **Step 2: Write the check script**

Create `scripts/check-tour-anchors.js`:

```js
#!/usr/bin/env node
/**
 * Fails the build when the anchor registry, the components, and the tour step
 * files disagree. This script is the entire justification for keeping tour
 * steps in the repo instead of the database: without it, renaming a nav link
 * produces a clean diff and a tour that breaks silently in production.
 *
 * Run: node scripts/check-tour-anchors.js
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "src");
const COURSES = path.join(ROOT, "docs", "courses");

function walk(dir, test, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, test, out);
    else if (test(p)) out.push(p);
  }
  return out;
}

// 1. Registry — parsed as text so this script needs no ESM loader.
const registrySrc = fs.readFileSync(
  path.join(SRC, "clubpm", "tour", "tourAnchors.js"), "utf8"
);
const declared = new Set(
  [...registrySrc.matchAll(/^\s*"([A-Za-z0-9._]+)":\s*\{/gm)].map((m) => m[1])
);

// 2. Anchors actually rendered by components.
const rendered = new Map(); // id -> [files]
for (const file of walk(SRC, (p) => /\.jsx?$/.test(p))) {
  const src = fs.readFileSync(file, "utf8");
  for (const m of src.matchAll(/data-tour-id=["'{]{1,2}\s*["']?([A-Za-z0-9._]+)["']?/g)) {
    const rel = path.relative(ROOT, file);
    rendered.set(m[1], [...(rendered.get(m[1]) ?? []), rel]);
  }
}

// 3. Anchors referenced by step files.
const used = new Map(); // id -> [tourId:stepId]
for (const file of walk(COURSES, (p) => p.endsWith(".steps.json"))) {
  const doc = JSON.parse(fs.readFileSync(file, "utf8"));
  for (const step of doc.steps) {
    const where = `${doc.tourId}:${step.id}`;
    for (const id of [step.anchor, ...(step.dim ?? [])]) {
      used.set(id, [...(used.get(id) ?? []), where]);
    }
  }
}

const errors = [];
for (const [id, where] of used) {
  if (!declared.has(id)) {
    errors.push(`step "${where[0]}" targets "${id}", which is not in tourAnchors.js`);
  }
}
for (const [id, files] of rendered) {
  if (!declared.has(id)) {
    errors.push(`${files[0]} renders data-tour-id="${id}", which is not in tourAnchors.js`);
  }
  if (files.length > 1) {
    errors.push(`"${id}" is rendered by ${files.length} components (${files.join(", ")}) — ids must be unique`);
  }
}
for (const id of declared) {
  if (!rendered.has(id)) {
    errors.push(`tourAnchors.js declares "${id}", but no component renders it`);
  }
}

if (errors.length) {
  console.error(`\ncheck-tour-anchors: ${errors.length} problem(s)\n`);
  for (const e of errors) console.error(`  ✗ ${e}`);
  console.error(
    "\nIf you renamed a UI element, update src/clubpm/tour/tourAnchors.js,\n" +
    "docs/courses/ANCHORS.md, and the step file that targets it — in one commit.\n"
  );
  process.exit(1);
}
console.log(
  `check-tour-anchors: OK — ${declared.size} anchors, ` +
  `${rendered.size} rendered, ${used.size} used by steps`
);
```

- [ ] **Step 3: Run it and confirm it FAILS**

```bash
node scripts/check-tour-anchors.js
```

Expected: **exit 1**, with 98 "declares X, but no component renders it" errors. No component carries an anchor yet — that is Tasks 3 and 4. **This failure is the test passing.**

- [ ] **Step 4: Verify it catches a bad step reference**

Temporarily change one `anchor` in `docs/courses/constellation-101/walkthroughs/first-look.steps.json` to `"nav.bogus"`, re-run, and confirm the output names `first-look:` and `nav.bogus`. Revert the edit.

- [ ] **Step 5: Wire into `npm test`**

In root `package.json`, change the `test` script to run the check first:

```json
"test": "node scripts/check-tour-anchors.js && react-scripts test"
```

- [ ] **Step 6: Commit**

```bash
git add src/clubpm/tour/tourAnchors.js scripts/check-tour-anchors.js package.json
git commit -m "feat(tour): anchor registry and CI consistency check"
```

---

## Task 3: Instrument shell, dashboard, and project detail

**Files:**
- Modify: `src/components/clubpm/AppShell.jsx` (13 anchors)
- Modify: `src/pages/ClubPM/Dashboard.jsx` (9 anchors)
- Modify: `src/pages/ClubPM/ProjectDetail.jsx` (20 anchors)

**Interfaces:**
- Consumes: anchor ids from `tourAnchors.js` (Task 2)
- Produces: 42 of the 98 anchors rendered

- [ ] **Step 1: Add the 13 shell anchors**

In `AppShell.jsx`, add `data-tour-id` to each element named in the "Shell and navigation" table of `docs/courses/ANCHORS.md`. Attribute only — **change nothing else**:

```jsx
<nav className="pm-sidebar" data-tour-id="nav.sidebar">
  …
  <Link to="/clubpm" className="pm-sidebar-link" data-tour-id="nav.dashboard">
```

- [ ] **Step 2: Add the 9 dashboard anchors**

Same treatment in `Dashboard.jsx` for the "Dashboard" table. `dash.project.card` goes on the **first** card only — index the map and apply it at `index === 0`:

```jsx
{projects.map((p, index) => (
  <ProjectCard key={p.id} project={p} data-tour-id={index === 0 ? "dash.project.card" : undefined} />
))}
```

If `ProjectCard` does not spread extra props onto its root element, wrap instead:

```jsx
<div key={p.id} data-tour-id={index === 0 ? "dash.project.card" : undefined}>
  <ProjectCard project={p} />
</div>
```

- [ ] **Step 3: Add the 20 project-detail anchors**

Same for `ProjectDetail.jsx`. Two need care:

- `board.column.*` — the four columns are rendered from a status list. Derive the id so it cannot drift from the enum:
  ```jsx
  <div className="cpm-kanban-column" data-tour-id={`board.column.${status}`}>
  ```
- `board.card.first` — first card of the **TODO** column only:
  ```jsx
  data-tour-id={status === "TODO" && index === 0 ? "board.card.first" : undefined}
  ```

- [ ] **Step 4: Run the check**

```bash
node scripts/check-tour-anchors.js
```

Expected: still exit 1, but now ~56 remaining (98 − 42). **Confirm no error mentions a file you just edited** — that would mean a typo'd id.

- [ ] **Step 5: Build**

```bash
npm run build
```

Expected: succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/components/clubpm/AppShell.jsx src/pages/ClubPM/Dashboard.jsx src/pages/ClubPM/ProjectDetail.jsx
git commit -m "feat(tour): anchor shell, dashboard and project detail"
```

---

## Task 4: Instrument the remaining surfaces

**Files:**
- Modify: `src/components/clubpm/TaskModal.jsx` (13), `src/pages/ClubPM/ChallengesPage.jsx` (3), `Shop.jsx` (2), `Profile.jsx` (3), `src/components/clubpm/NotificationCenter.jsx` (2), `NotificationPreferences.jsx` (1), `src/pages/ClubPM/CalendarPage.jsx` (2), `src/components/clubpm/vault/VaultTab.jsx` (9), `src/pages/ClubPM/OutreachHub.jsx` (10), `src/pages/ClubPM/BlogEditorPage.jsx` (4), `src/pages/ClubPM/CourseEditorPage.jsx` (4), `src/pages/ClubPM/AdminView.jsx` (4)

**Interfaces:**
- Produces: the remaining 56 anchors — registry now fully satisfied

- [ ] **Step 1: Add every remaining anchor**

Work through `docs/courses/ANCHORS.md` table by table. Attributes only. `calendar.event` and `vault.item` go on the first item in their list, same `index === 0` idiom as Task 3.

- [ ] **Step 2: Run the check — it must now PASS**

```bash
node scripts/check-tour-anchors.js
```

Expected: `check-tour-anchors: OK — 98 anchors, 98 rendered, 46 used by steps`

**This is the moment the contract becomes real.** If any "declares X, but no component renders it" remains, the id is missing or misspelled — do not delete it from the registry to silence the error, because the elective step outlines reference some of these.

- [ ] **Step 3: Prove the gate bites**

Rename one `data-tour-id="nav.projects"` to `nav.projectz`, run `npm test`, and confirm it fails naming both the unrendered registry entry and the step that targets it. Revert.

- [ ] **Step 4: Build**

```bash
npm run build
```

- [ ] **Step 5: Commit**

```bash
git add src/
git commit -m "feat(tour): anchor remaining ClubPM surfaces; check now passes"
```

---

## Task 5: Tour runtime

**Files:**
- Create: `src/clubpm/tour/useAnchorRect.js`
- Create: `src/clubpm/tour/TourProvider.jsx`
- Modify: `src/App.js`
- Modify: `src/api/clubPmClient.js`

**Interfaces:**
- Consumes: `TOUR_ANCHORS` (Task 2)
- Produces: `useTour() → { tour, step, stepIndex, stepCount, status, startTour(config), next(), skipStep(), pause(), resume(), stop() }`; `useAnchorRect(anchorId, { timeoutMs }) → { rect, state }` where `state` is `"resolving" | "found" | "missing"`; the `clubpm:api-success` event

- [ ] **Step 1: Write `useAnchorRect.js`**

```js
import { useEffect, useState } from "react";

/**
 * Resolve a data-tour-id to a live viewport rect.
 *
 * Returns state "missing" after timeoutMs so the overlay can degrade the step
 * rather than hanging on a renamed element. A learner must never be trapped by
 * a stale selector — that rule outranks step ordering.
 */
export function useAnchorRect(anchorId, { timeoutMs = 8000 } = {}) {
  const [rect, setRect] = useState(null);
  const [state, setState] = useState("resolving");

  useEffect(() => {
    if (!anchorId) { setRect(null); setState("missing"); return undefined; }
    setState("resolving");
    setRect(null);

    let el = null;
    let ro = null;
    let raf = 0;
    let giveUpTimer = 0;
    let cancelled = false;

    const measure = () => {
      if (cancelled || !el) return;
      const r = el.getBoundingClientRect();
      // Zero-size means it is present but not laid out yet (lazy chunk, collapsed
      // parent). Keep waiting rather than spotlighting a 0x0 box.
      if (r.width === 0 && r.height === 0) return;
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
      setState("found");
    };

    const attach = () => {
      if (cancelled) return;
      el = document.querySelector(`[data-tour-id="${anchorId}"]`);
      if (!el) { raf = requestAnimationFrame(attach); return; }
      el.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
      ro = new ResizeObserver(measure);
      ro.observe(el);
      measure();
      raf = requestAnimationFrame(measure); // once more after the smooth scroll starts
    };

    attach();
    giveUpTimer = setTimeout(() => {
      if (!cancelled && !el) setState("missing");
    }, timeoutMs);

    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      clearTimeout(giveUpTimer);
      ro?.disconnect();
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [anchorId, timeoutMs]);

  return { rect, state };
}
```

- [ ] **Step 2: Add the `clubpm:api-success` dispatch**

In `src/api/clubPmClient.js`, change `handleResponse` to take the method and path, and dispatch on success. Modify the signature at line ~115:

```js
async function handleResponse(response, method = "GET", requestPath = "") {
```

and insert immediately before `return body;` (after the existing `dispatchRewardSignals(body)` call):

```js
  // Lets a walkthrough step advance on a real successful write rather than on a
  // click that may or may not have done anything. One dispatch here covers every
  // endpoint, because every call in this client funnels through handleResponse.
  window.dispatchEvent(new CustomEvent("clubpm:api-success", {
    detail: { method, path: requestPath },
  }));
```

Then update all five verb wrappers to pass them: `return handleResponse(response, "GET", path);` in `get`, `"POST"` in `post`, `"PUT"` in `put`, `"PATCH"` in `patch`, `"DELETE"` in `del`.

- [ ] **Step 3: Write `TourProvider.jsx`**

```jsx
import React, {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { recordTourProgress, reportTourBreakage } from "../../api/clubPmClient";

const TourContext = createContext(null);
export const useTour = () => useContext(TourContext);

const RESUME_KEY = "clubpm_tour_resume";

/** "/clubpm/projects/:id" matches "/clubpm/projects/abc123". */
function routeMatches(pattern, pathname) {
  if (!pattern || pattern === "*") return true;
  const p = pattern.split("/").filter(Boolean);
  const a = pathname.split("/").filter(Boolean);
  if (p.length !== a.length) return false;
  return p.every((seg, i) => seg.startsWith(":") || seg === a[i]);
}

export function TourProvider({ children }) {
  const navigate = useNavigate();
  const location = useLocation();

  const [tour, setTour] = useState(null);     // { sectionId, tourId, steps, returnTo, projectId, preview }
  const [stepIndex, setStepIndex] = useState(0);
  const [status, setStatus] = useState("idle"); // idle | running | paused

  const stepIndexRef = useRef(0);
  stepIndexRef.current = stepIndex;

  const step = tour?.steps[stepIndex] ?? null;
  const stepCount = tour?.steps.length ?? 0;

  // Resume a tour the learner paused or that survived a reload.
  useEffect(() => {
    const raw = sessionStorage.getItem(RESUME_KEY);
    if (!raw) return;
    try {
      const saved = JSON.parse(raw);
      setTour(saved.tour);
      setStepIndex(saved.stepIndex);
      setStatus("paused");
    } catch { sessionStorage.removeItem(RESUME_KEY); }
  }, []);

  useEffect(() => {
    if (!tour) { sessionStorage.removeItem(RESUME_KEY); return; }
    sessionStorage.setItem(RESUME_KEY, JSON.stringify({ tour, stepIndex }));
  }, [tour, stepIndex]);

  const startTour = useCallback((config) => {
    // config.steps already has :trainingProjectId substituted by the caller.
    setTour(config);
    setStepIndex(config.resumeAt ?? 0);
    setStatus("running");
    if (config.entryRoute && !routeMatches(config.entryRoute, window.location.pathname)) {
      navigate(config.entryRoute);
    }
  }, [navigate]);

  const finish = useCallback(() => {
    const done = tour;
    sessionStorage.removeItem(RESUME_KEY);
    setTour(null); setStepIndex(0); setStatus("idle");
    if (done?.returnTo) navigate(done.returnTo, { state: { tourCompleted: done.sectionId } });
  }, [navigate, tour]);

  const goTo = useCallback((index) => {
    if (!tour) return;
    if (index >= tour.steps.length) { finish(); return; }
    setStepIndex(index);
    if (!tour.preview) {
      recordTourProgress(tour.sectionId, index).catch(() => {});
    }
  }, [tour, finish]);

  const next = useCallback(() => goTo(stepIndexRef.current + 1), [goTo]);

  const skipStep = useCallback(() => {
    // A skipped step still counts toward maxStepIndex. Refusing to let someone
    // finish a course over our own broken selector is the worse failure.
    next();
  }, [next]);

  const pause = useCallback(() => setStatus("paused"), []);
  const resume = useCallback(() => setStatus("running"), []);
  const stop = useCallback(() => {
    sessionStorage.removeItem(RESUME_KEY);
    setTour(null); setStepIndex(0); setStatus("idle");
  }, []);

  const reportBreakage = useCallback((anchor) => {
    if (!tour || tour.preview) return;
    reportTourBreakage(tour.sectionId, {
      stepId: step?.id ?? null, anchor, pathname: location.pathname,
    }).catch(() => {});
  }, [tour, step, location.pathname]);

  // Navigate to the step's declared route before the overlay hunts for it.
  useEffect(() => {
    if (status !== "running" || !step?.route) return;
    if (!routeMatches(step.route, location.pathname)) {
      navigate(step.route.replace(":id", tour.projectId ?? ""));
    }
  }, [status, step, location.pathname, navigate, tour]);

  // advance.on === "route"
  useEffect(() => {
    if (status !== "running" || step?.advance?.on !== "route") return;
    if (routeMatches(step.advance.match, location.pathname)) next();
  }, [status, step, location.pathname, next]);

  // advance.on === "api"
  useEffect(() => {
    if (status !== "running" || step?.advance?.on !== "api") return undefined;
    const onApi = (e) => {
      const { method, path } = e.detail ?? {};
      if (method !== step.advance.method) return;
      if (!routeMatches(step.advance.path, path)) return;
      next();
    };
    window.addEventListener("clubpm:api-success", onApi);
    return () => window.removeEventListener("clubpm:api-success", onApi);
  }, [status, step, next]);

  const value = useMemo(() => ({
    tour, step, stepIndex, stepCount, status,
    startTour, next, skipStep, pause, resume, stop, reportBreakage,
  }), [tour, step, stepIndex, stepCount, status,
       startTour, next, skipStep, pause, resume, stop, reportBreakage]);

  return <TourContext.Provider value={value}>{children}</TourContext.Provider>;
}
```

- [ ] **Step 4: Add the client methods**

Append to `src/api/clubPmClient.js`:

```js
export const recordTourProgress = (sectionId, stepIndex) =>
  post(`/api/outreach/courses/sections/${sectionId}/tour-progress`, { stepIndex });

export const reportTourBreakage = (sectionId, payload) =>
  post(`/api/outreach/courses/sections/${sectionId}/tour-breakage`, payload);

export const listTourBreakages = (sectionId) =>
  get(`/api/outreach/courses/sections/${sectionId}/tour-breakages`);

export const ensureTrainingProject = () => post(`/api/training-project`, {});
```

- [ ] **Step 5: Mount the provider**

In `src/App.js`, wrap the route tree — **inside** `ClubPmAuthProvider` (it needs auth) and **inside** the Router (it uses `useNavigate`):

```jsx
import { TourProvider } from './clubpm/tour/TourProvider';
…
<ClubPmAuthProvider>
  <ShortcutsProvider>
    <ProjectNavProvider>
      <TourProvider>
        <ScrollToTop />
        …existing route tree…
      </TourProvider>
    </ProjectNavProvider>
  </ShortcutsProvider>
</ClubPmAuthProvider>
```

- [ ] **Step 6: Build**

```bash
npm run build
```

Expected: succeeds. Nothing renders yet — the overlay is Task 6.

- [ ] **Step 7: Commit**

```bash
git add src/clubpm/tour src/App.js src/api/clubPmClient.js
git commit -m "feat(tour): tour provider, anchor resolution, api-success signal"
```

---

## Task 6: The overlay

**Files:**
- Create: `src/clubpm/tour/TourOverlay.jsx`
- Modify: `src/clubpm/tour/TourProvider.jsx` (render the overlay)
- Modify: `public/clubpm-theme.css` (append)

**Interfaces:**
- Consumes: `useTour()`, `useAnchorRect()` (Task 5)
- Produces: the rendered scrim, spotlight, and coach card

- [ ] **Step 1: Write `TourOverlay.jsx`**

```jsx
import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTour } from "./TourProvider";
import { useAnchorRect } from "./useAnchorRect";

const PAD = 8;      // breathing room around the spotlit element
const RADIUS = 10;  // matches the product's card radius

/** A rounded-rect subpath, reversed so evenodd cuts a hole in the outer rect. */
function holePath(r) {
  const x = r.left - PAD, y = r.top - PAD;
  const w = r.width + PAD * 2, h = r.height + PAD * 2;
  const rad = Math.min(RADIUS, w / 2, h / 2);
  return `M${x + rad},${y} H${x + w - rad} A${rad},${rad} 0 0 1 ${x + w},${y + rad} ` +
         `V${y + h - rad} A${rad},${rad} 0 0 1 ${x + w - rad},${y + h} ` +
         `H${x + rad} A${rad},${rad} 0 0 1 ${x},${y + h - rad} ` +
         `V${y + rad} A${rad},${rad} 0 0 1 ${x + rad},${y} Z`;
}

function cardPosition(rect, placement) {
  if (!rect || placement === "center") {
    return { top: "50%", left: "50%", transform: "translate(-50%, -50%)" };
  }
  const GAP = 16;
  switch (placement) {
    case "right":  return { top: rect.top, left: rect.left + rect.width + GAP };
    case "left":   return { top: rect.top, left: Math.max(GAP, rect.left - 340 - GAP) };
    case "top":    return { top: Math.max(GAP, rect.top - GAP), left: rect.left, transform: "translateY(-100%)" };
    default:       return { top: rect.top + rect.height + GAP, left: rect.left };
  }
}

export default function TourOverlay() {
  const { tour, step, stepIndex, stepCount, status, next, skipStep, pause, resume, stop, reportBreakage } = useTour();
  const active = Boolean(tour) && status === "running";
  const { rect, state } = useAnchorRect(active ? step?.anchor : null);
  const [vp, setVp] = useState({ w: window.innerWidth, h: window.innerHeight });
  const degraded = state === "missing";

  useEffect(() => {
    const onResize = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => { if (degraded && step) reportBreakage(step.anchor); }, [degraded, step, reportBreakage]);

  // Esc pauses rather than quits — quitting mid-tour loses the learner's place.
  useEffect(() => {
    if (!active) return undefined;
    const onKey = (e) => { if (e.key === "Escape") pause(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, pause]);

  if (!tour) return null;

  if (status === "paused") {
    return createPortal(
      <div className="pm-tour-pill" role="status">
        <i className="fas fa-graduation-cap" aria-hidden="true" />
        <span>Tour paused — step {stepIndex + 1} of {stepCount}</span>
        <button type="button" className="clubpm-btn-primary" onClick={resume}>Resume</button>
        <button type="button" className="clubpm-btn-secondary" onClick={stop}>Exit</button>
      </div>,
      document.body
    );
  }

  if (!active) return null;

  const outer = `M0,0 H${vp.w} V${vp.h} H0 Z`;
  const holes = rect && !degraded ? holePath(rect) : "";
  const canClickThrough = rect && !degraded && step.advance?.on === "click";

  return createPortal(
    <div className="pm-tour-root">
      <svg className="pm-tour-scrim" width={vp.w} height={vp.h} aria-hidden="true">
        <path
          d={`${outer} ${holes}`}
          fillRule="evenodd"
          className="pm-tour-scrim-path"
          // The hole is a genuine absence of geometry, so clicks over the target
          // land on the real app element beneath. No click-forwarding needed.
          style={{ pointerEvents: canClickThrough ? "auto" : "auto" }}
        />
      </svg>

      {rect && !degraded && <div className="pm-tour-ring" style={{
        top: rect.top - PAD, left: rect.left - PAD,
        width: rect.width + PAD * 2, height: rect.height + PAD * 2,
      }} />}

      <div
        className={`pm-tour-card${degraded ? " is-degraded" : ""}`}
        style={cardPosition(rect, step.placement)}
        role="dialog"
        aria-live="polite"
        aria-label={step.title}
      >
        <div className="pm-tour-card-meta">
          <span className="cpm-tag">Step {stepIndex + 1} of {stepCount}</span>
          <button type="button" className="pm-tour-card-pause" onClick={pause} title="Pause tour">
            <i className="fas fa-pause" aria-hidden="true" />
          </button>
        </div>

        <h3>{step.title}</h3>
        <p>{step.body}</p>

        {degraded && (
          <p className="pm-tour-card-degraded">
            <i className="fas fa-triangle-exclamation" aria-hidden="true" />{" "}
            We couldn&apos;t find this on your screen. That&apos;s our bug, not yours — it&apos;s
            been reported.
          </p>
        )}

        <div className="pm-tour-card-actions">
          {step.advance?.on === "next" && !degraded && (
            <button type="button" className="clubpm-btn-primary" onClick={next}>
              Next <i className="fas fa-arrow-right" aria-hidden="true" />
            </button>
          )}
          {step.advance?.on !== "next" && !degraded && (
            <span className="pm-tour-card-waiting">
              <i className="fas fa-circle-notch fa-spin" aria-hidden="true" />{" "}
              {step.advance?.on === "click" ? "Click the highlighted item" : "Waiting for you…"}
            </span>
          )}
          {(degraded || step.optional) && (
            <button type="button" className="clubpm-btn-secondary" onClick={skipStep}>
              Skip this step
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
```

- [ ] **Step 2: Render it from the provider**

In `TourProvider.jsx`, import the overlay and render it inside the context provider, after `{children}`:

```jsx
import TourOverlay from "./TourOverlay";
…
    <TourContext.Provider value={value}>
      {children}
      <TourOverlay />
    </TourContext.Provider>
```

- [ ] **Step 3: Append the CSS**

At the **bottom** of `public/clubpm-theme.css`:

```css
/* === Guided walkthroughs ================================================= */

.pm-tour-root { position: fixed; inset: 0; z-index: 9000; pointer-events: none; }

.pm-tour-scrim { position: fixed; inset: 0; pointer-events: none; }
/* The path absorbs every click. The spotlight hole has no geometry, so clicks
   there fall through to the real app underneath. This is what "greys out areas
   not to go to yet" means mechanically. */
.pm-tour-scrim-path { fill: rgba(4, 8, 16, 0.72); pointer-events: auto; }

.pm-tour-ring {
  position: fixed; border-radius: 10px; pointer-events: none;
  box-shadow: 0 0 0 2px var(--pm-accent-teal), 0 0 24px rgba(0, 229, 204, 0.45);
  transition: top .28s ease, left .28s ease, width .28s ease, height .28s ease;
}

.pm-tour-card {
  position: fixed; width: 340px; max-width: calc(100vw - 32px);
  background: var(--pm-elevated); border: 1px solid var(--pm-accent-teal);
  border-radius: 12px; padding: 16px; pointer-events: auto;
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.55);
  font-family: var(--pm-font-body);
}
.pm-tour-card.is-degraded { border-color: var(--pm-accent-amber); }
.pm-tour-card h3 { font-family: var(--pm-font-display); font-size: 1.05rem; margin: 8px 0 6px; }
.pm-tour-card p { font-size: .9rem; line-height: 1.5; color: var(--pm-text, #d7dde8); margin: 0 0 12px; }
.pm-tour-card-meta { display: flex; justify-content: space-between; align-items: center; }
.pm-tour-card-pause {
  background: none; border: none; color: var(--pm-accent-teal); cursor: pointer; padding: 4px;
}
.pm-tour-card-degraded { color: var(--pm-accent-amber); font-size: .82rem; }
.pm-tour-card-actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.pm-tour-card-waiting { font-size: .82rem; color: var(--pm-accent-teal); }

.pm-tour-pill {
  position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
  z-index: 9000; display: flex; gap: 12px; align-items: center;
  background: var(--pm-elevated); border: 1px solid var(--pm-accent-teal);
  border-radius: 999px; padding: 10px 18px; pointer-events: auto;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5); font-family: var(--pm-font-body); font-size: .86rem;
}

@media (prefers-reduced-motion: reduce) {
  .pm-tour-ring { transition: none; }
}
```

- [ ] **Step 4: Build**

```bash
npm run build
```

- [ ] **Step 5: Commit**

```bash
git add src/clubpm/tour/TourOverlay.jsx src/clubpm/tour/TourProvider.jsx public/clubpm-theme.css
git commit -m "feat(tour): spotlight overlay, coach card, paused pill"
```

---

## Task 7: Backend — step resolution, clamp, completion

**Files:**
- Create: `backend/src/services/tourStepService.ts`
- Create: `backend/src/services/tourStepService.test.ts`
- Modify: `backend/src/services/courseProgressService.ts`
- Modify: `backend/src/api/courses.ts`

**Interfaces:**
- Consumes: `CourseSection.tourConfig`, `CourseSectionProgress.maxStepIndex` (Task 1)
- Produces: `clampStepIndex({ prevMaxIndex, stepIndex, stepCount }) → number`; `isTourComplete({ maxStepIndex, stepCount }) → boolean`; `loadTourSteps(tourId) → TourStep[]`; `TourStep` type

- [ ] **Step 1: Write the failing test**

Create `backend/src/services/tourStepService.test.ts`:

```ts
// Pure-logic tests for tourStepService. No DB required.
// Run: cd backend && npx tsx src/services/tourStepService.test.ts
import { clampStepIndex, isTourComplete } from "./tourStepService.js";

let passed = 0, failed = 0;
function eq(name: string, a: unknown, b: unknown) {
  if (JSON.stringify(a) === JSON.stringify(b)) passed++;
  else { failed++; console.error(`  ✗ ${name}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); }
}

console.log("clampStepIndex");
{
  eq("accepts a forward step", clampStepIndex({ prevMaxIndex: 2, stepIndex: 3, stepCount: 8 }), 3);
  eq("accepts a jump forward — a skipped step still counts",
    clampStepIndex({ prevMaxIndex: 1, stepIndex: 5, stepCount: 8 }), 5);
  eq("never rolls back", clampStepIndex({ prevMaxIndex: 5, stepIndex: 2, stepCount: 8 }), 5);
  eq("clamps past the end", clampStepIndex({ prevMaxIndex: 2, stepIndex: 99, stepCount: 8 }), 7);
  eq("a negative index is ignored", clampStepIndex({ prevMaxIndex: 3, stepIndex: -2, stepCount: 8 }), 3);
  eq("an empty tour stays at 0", clampStepIndex({ prevMaxIndex: 0, stepIndex: 4, stepCount: 0 }), 0);
}

console.log("isTourComplete");
{
  eq("false below the last step", isTourComplete({ maxStepIndex: 6, stepCount: 8 }), false);
  eq("true at the last step", isTourComplete({ maxStepIndex: 7, stepCount: 8 }), true);
  eq("a zero-step tour is never complete", isTourComplete({ maxStepIndex: 0, stepCount: 0 }), false);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
```

- [ ] **Step 2: Run it and verify it fails**

```bash
cd backend && npx tsx src/services/tourStepService.test.ts
```

Expected: FAIL — `Cannot find module './tourStepService.js'`

- [ ] **Step 3: Write the service**

Create `backend/src/services/tourStepService.ts`:

```ts
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type TourAdvance =
  | { on: "next" }
  | { on: "click" }
  | { on: "route"; match: string }
  | { on: "api"; method: string; path: string };

export type TourStep = {
  id: string;
  anchor: string;
  route?: string;
  title: string;
  body: string;
  placement?: "top" | "right" | "bottom" | "left" | "center";
  advance: TourAdvance;
  dim?: string[];
  optional?: boolean;
};

export type TourConfig = {
  tourId: string;
  entryRoute: string;
  requiresTrainingProject: boolean;
  stepCount: number;
};

/**
 * Monotonic, bounded by the tour length, and nothing more.
 *
 * There is deliberately no wall-clock rule. Moving through a tour quickly is
 * moving through it quickly; a time gate would punish that and stop no one.
 */
export function clampStepIndex(opts: {
  prevMaxIndex: number; stepIndex: number; stepCount: number;
}): number {
  const { prevMaxIndex, stepIndex, stepCount } = opts;
  if (stepCount <= 0) return 0;
  const bounded = Math.min(Math.max(stepIndex, 0), stepCount - 1);
  return Math.max(prevMaxIndex, bounded);
}

export function isTourComplete(opts: { maxStepIndex: number; stepCount: number }): boolean {
  if (opts.stepCount <= 0) return false;
  return opts.maxStepIndex >= opts.stepCount - 1;
}

// docs/ lives in the repo working tree, not in a deployed dist. Resolving from
// import.meta.url keeps that explicit: step files are repo content, and a
// deployed backend that cannot see them will fail loudly here rather than
// serving a tour with no steps.
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const COURSES_DIR = path.join(REPO_ROOT, "docs", "courses");

const cache = new Map<string, TourStep[]>();

export function loadTourSteps(tourId: string): TourStep[] {
  const cached = cache.get(tourId);
  if (cached) return cached;

  const matches: string[] = [];
  for (const course of fs.readdirSync(COURSES_DIR, { withFileTypes: true })) {
    if (!course.isDirectory()) continue;
    const p = path.join(COURSES_DIR, course.name, "walkthroughs", `${tourId}.steps.json`);
    if (fs.existsSync(p)) matches.push(p);
  }
  if (matches.length === 0) throw new Error(`tour "${tourId}" has no steps file`);
  if (matches.length > 1) throw new Error(`tour "${tourId}" is defined in ${matches.length} courses`);

  const doc = JSON.parse(fs.readFileSync(matches[0], "utf8"));
  const steps = validateSteps(doc.steps, matches[0]);
  cache.set(tourId, steps);
  return steps;
}

function validateSteps(steps: unknown, file: string): TourStep[] {
  if (!Array.isArray(steps) || steps.length === 0) {
    throw new Error(`${file}: "steps" must be a non-empty array`);
  }
  const seen = new Set<string>();
  return steps.map((s, i) => {
    const where = `${file} step ${i}`;
    if (!s?.id || typeof s.id !== "string") throw new Error(`${where}: missing "id"`);
    if (seen.has(s.id)) throw new Error(`${where}: duplicate id "${s.id}"`);
    seen.add(s.id);
    if (!s.anchor) throw new Error(`${where} (${s.id}): missing "anchor"`);
    if (!s.title || !s.body) throw new Error(`${where} (${s.id}): needs both title and body`);
    const on = s.advance?.on;
    if (!["next", "click", "route", "api"].includes(on)) {
      throw new Error(`${where} (${s.id}): advance.on must be next|click|route|api`);
    }
    if (on === "route" && !s.advance.match) throw new Error(`${where} (${s.id}): route advance needs "match"`);
    if (on === "api" && (!s.advance.method || !s.advance.path)) {
      throw new Error(`${where} (${s.id}): api advance needs "method" and "path"`);
    }
    return s as TourStep;
  });
}
```

- [ ] **Step 4: Run the test and verify it passes**

```bash
cd backend && npx tsx src/services/tourStepService.test.ts
```

Expected: `9 passed, 0 failed`

- [ ] **Step 5: Attach steps to the learner payload**

Add the import at the top of `courseProgressService.ts`:

```ts
import {
  clampStepIndex, isTourComplete, loadTourSteps, type TourConfig,
} from "./tourStepService.js";
```


In `courseProgressService.ts`'s `getLearnerCourse`, in the per-section mapping where `slides` is attached when unlocked (~line 462), add the sibling branch:

```ts
      if (s.kind === "WALKTHROUGH") {
        const cfg = s.tourConfig as TourConfig | null;
        // Same omission rule as contentJson / videoConfig / slides: a locked
        // section carries no config and no steps, so a learner cannot read
        // ahead into a tour they have not unlocked.
        if (cfg?.tourId) {
          out.tourConfig = cfg;
          out.tourSteps = loadTourSteps(cfg.tourId);
        }
      }
```

and add `maxStepIndex: progress?.maxStepIndex ?? 0,` alongside the existing `maxSlideIndex` line.

- [ ] **Step 6: Add `recordTourProgress` and the completion guard**

Append to `courseProgressService.ts`, modelled on `recordSlideProgress`:

```ts
export async function recordTourProgress(
  sectionId: string, memberId: string, stepIndex: number
) {
  const { section, progress } = await loadSectionProgress(sectionId, memberId);
  const cfg = section.tourConfig as TourConfig | null;
  const next = clampStepIndex({
    prevMaxIndex: progress.maxStepIndex,
    stepIndex,
    stepCount: cfg?.stepCount ?? 0,
  });
  const updated = await prisma.courseSectionProgress.update({
    where: { id: progress.id },
    data: { maxStepIndex: next, status: "IN_PROGRESS" },
  });
  return { maxStepIndex: updated.maxStepIndex };
}
```

> Use whatever the file's existing helper for "load section + progress for member" is called; `recordSlideProgress` right above shows the pattern. Do not introduce a second loader.

In `completeSection`, beside the existing `if (section.kind === "SLIDES")` guard (~line 844):

```ts
  if (section.kind === "WALKTHROUGH") {
    const cfg = section.tourConfig as TourConfig | null;
    if (!isTourComplete({ maxStepIndex: progress.maxStepIndex, stepCount: cfg?.stepCount ?? 0 })) {
      throw new Error("Finish every step of the walkthrough first");
    }
  }
```

- [ ] **Step 7: Add the three routes**

In `backend/src/api/courses.ts`, beside the `slide-progress` route:

```ts
router.post("/sections/:sid/tour-progress", requireAuth, async (req, res) => {
  try {
    const stepIndex = Number(req.body?.stepIndex);
    if (!Number.isFinite(stepIndex)) return res.status(400).json({ error: "stepIndex required" });
    // CONVENTION: req.memberId, never req.session.memberId — session reads are
    // undefined for Bearer-token users and silently break them.
    const out = await recordTourProgress(req.params.sid, req.memberId!, stepIndex);
    res.json(out);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

router.post("/sections/:sid/tour-breakage", requireAuth, async (req, res) => {
  const { stepId, anchor, pathname } = req.body ?? {};
  await logAuditEvent({
    eventType: "TOUR_STEP_BROKEN",
    memberId: req.memberId!,
    payload: { sectionId: req.params.sid, stepId, anchor, pathname },
  });
  res.json({ ok: true });
});

router.get("/sections/:sid/tour-breakages", requireAuth, async (req, res) => {
  const rows = await prisma.activityLog.findMany({
    where: { eventType: "TOUR_STEP_BROKEN" },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  res.json(rows.filter((r) => (r.payload as any)?.sectionId === req.params.sid));
});
```

Add `TOUR_STEP_BROKEN` to the `ActivityEventType` enum in `schema.prisma` and to Task 1's migration file **as an additional `ALTER TYPE`**; re-run `npx prisma migrate dev --name tour_breakage_event`.

- [ ] **Step 8: Verify**

```bash
cd backend && npx prisma generate && npx tsc --noEmit && npx tsx src/services/tourStepService.test.ts
```

Expected: clean typecheck, `9 passed, 0 failed`.

- [ ] **Step 9: Commit**

```bash
git add backend/src
git commit -m "feat(courses): walkthrough step resolution, progress clamp, completion gate"
```

---

## Task 8: Player integration

**Files:**
- Modify: `src/pages/ClubPM/CoursePlayerPage.jsx`
- Modify: `src/components/clubpm/courses/CourseSectionRail.jsx`
- Create: `src/components/clubpm/courses/WalkthroughLaunchCard.jsx`

**Interfaces:**
- Consumes: `useTour().startTour` (Task 5); `tourConfig` + `tourSteps` on the learner payload (Task 7)
- Produces: a launchable WALKTHROUGH section

- [ ] **Step 1: Register the kind**

In `CourseSectionRail.jsx`, add to `SECTION_KINDS`:

```js
  WALKTHROUGH: { label: "Walkthrough", icon: "fas fa-hand-pointer" },
```

- [ ] **Step 2: Write the launch card**

Create `src/components/clubpm/courses/WalkthroughLaunchCard.jsx`:

```jsx
import React, { useState } from "react";
import toast from "react-hot-toast";
import { useTour } from "../../../clubpm/tour/TourProvider";
import { ensureTrainingProject } from "../../../api/clubPmClient";

export default function WalkthroughLaunchCard({ section, courseSlug, preview, isAdmin }) {
  const { startTour } = useTour();
  const [busy, setBusy] = useState(false);
  const cfg = section.tourConfig;
  const steps = section.tourSteps ?? [];
  const done = section.status === "COMPLETED";

  // Admin-gated tours (constellation-admin-tools) must not start and then
  // dead-end on a route the learner cannot reach.
  if (cfg?.requiresAdmin && !isAdmin) {
    return (
      <div className="pm-tour-launch is-locked">
        <h3><i className="fas fa-lock" aria-hidden="true" /> Officers only</h3>
        <p>This walkthrough visits admin screens your account can&apos;t open. Ask an officer if you think that&apos;s wrong.</p>
      </div>
    );
  }

  const launch = async () => {
    setBusy(true);
    try {
      let projectId = null;
      if (cfg.requiresTrainingProject) {
        const { projectId: id } = await ensureTrainingProject();
        projectId = id;
      }
      const entryRoute = cfg.entryRoute.replace(":trainingProjectId", projectId ?? "");
      startTour({
        sectionId: section.id,
        tourId: cfg.tourId,
        steps,
        entryRoute,
        projectId,
        preview,
        returnTo: `/clubpm/outreach/courses/${courseSlug}/learn`,
        resumeAt: section.maxStepIndex ?? 0,
      });
    } catch (err) {
      toast.error(err.message ?? "Could not start that walkthrough");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pm-tour-launch">
      <h3><i className="fas fa-hand-pointer" aria-hidden="true" /> {steps.length} steps</h3>
      <p>
        You&apos;re about to leave this page and drive Constellation itself. We&apos;ll dim everything
        that isn&apos;t relevant and point at exactly where to go — and bring you back here at the end.
      </p>
      {cfg.requiresTrainingProject && (
        <p className="pm-tour-launch-sandbox">
          <i className="fas fa-shield-halved" aria-hidden="true" /> Anything you do happens in your own
          private training project. It touches no real club data and earns no XP.
        </p>
      )}
      <button type="button" className="clubpm-btn-primary" onClick={launch} disabled={busy}>
        {busy ? "Setting up…" : done ? "Run it again" : "Start walkthrough"}
      </button>
      {done && <span className="cpm-tag"><i className="fas fa-circle-check" aria-hidden="true" /> Completed</span>}
    </div>
  );
}
```

- [ ] **Step 3: Render it in the player**

In `CoursePlayerPage.jsx`, import the card and add a branch beside the `SLIDES` one:

```jsx
{selected.kind === 'WALKTHROUGH' && (
  <WalkthroughLaunchCard
    key={selected.id}
    section={selected}
    courseSlug={slug}
    preview={course.preview}
    isAdmin={course.viewerIsAdmin ?? false}
  />
)}
```

- [ ] **Step 4: Complete the section on return**

The provider navigates back with `state.tourCompleted`. In `CoursePlayerPage`, add:

```jsx
const locationState = useLocation().state;
useEffect(() => {
  if (locationState?.tourCompleted) {
    handleComplete(locationState.tourCompleted);
    window.history.replaceState({}, "");   // so a refresh doesn't re-complete
  }
}, [locationState, handleComplete]);
```

Import `useLocation` from `react-router-dom`.

- [ ] **Step 5: Style the launch card**

Append to `public/clubpm-theme.css`:

```css
.pm-tour-launch {
  background: var(--pm-surface); border: 1px solid var(--pm-accent-teal);
  border-radius: 12px; padding: 20px; display: flex; flex-direction: column;
  gap: 12px; align-items: flex-start; max-width: 620px;
}
.pm-tour-launch.is-locked { border-color: var(--pm-border, #2a3346); opacity: .8; }
.pm-tour-launch h3 { font-family: var(--pm-font-display); margin: 0; }
.pm-tour-launch p { margin: 0; font-size: .92rem; line-height: 1.55; }
.pm-tour-launch-sandbox { color: var(--pm-accent-teal); font-size: .85rem; }
```

- [ ] **Step 6: Build**

```bash
npm run build && node scripts/check-tour-anchors.js
```

- [ ] **Step 7: Commit**

```bash
git add src/
git commit -m "feat(courses): walkthrough launch card and player integration"
```

---

## Task 9: Training sandbox service

**Files:**
- Create: `backend/src/services/trainingSandboxService.ts`
- Create: `backend/src/services/trainingSandboxService.test.ts`
- Modify: `backend/src/api/projects.ts`
- Modify: `backend/src/services/rewardService.ts`

**Interfaces:**
- Consumes: `Project.trainingForMemberId` (Task 1)
- Produces: `ensureTrainingProject(memberId) → { projectId }`; `archiveTrainingProject(memberId)`; `isTrainingProject(projectId) → Promise<boolean>`; `TRAINING_FIXTURE`

- [ ] **Step 1: Write the failing test**

Create `backend/src/services/trainingSandboxService.test.ts`:

```ts
// Pure-logic tests for the training fixture. No DB required.
// Run: cd backend && npx tsx src/services/trainingSandboxService.test.ts
import { TRAINING_FIXTURE, TRAINING_PROJECT_NAME } from "./trainingSandboxService.js";

let passed = 0, failed = 0;
function eq(name: string, a: unknown, b: unknown) {
  if (JSON.stringify(a) === JSON.stringify(b)) passed++;
  else { failed++; console.error(`  ✗ ${name}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); }
}
function ok(name: string, cond: boolean) {
  if (cond) passed++; else { failed++; console.error(`  ✗ ${name}`); }
}

console.log("TRAINING_FIXTURE");
{
  eq("seeds six tasks", TRAINING_FIXTURE.tasks.length, 6);
  const statuses = new Set(TRAINING_FIXTURE.tasks.map((t) => t.status));
  ok("covers all four statuses",
    ["TODO", "IN_PROGRESS", "BLOCKED", "DONE"].every((s) => statuses.has(s)));
  eq("seeds two milestones", TRAINING_FIXTURE.milestones.length, 2);
  ok("one milestone is deliberately at risk",
    TRAINING_FIXTURE.milestones.some((m) => m.dueInDays < 0));
  eq("seeds one blocker", TRAINING_FIXTURE.blockers.length, 1);
  ok("the name is recognisable to a human scanning a project list",
    TRAINING_PROJECT_NAME.includes("Training"));
  ok("every task has a title that says what done means",
    TRAINING_FIXTURE.tasks.every((t) => t.title.split(" ").length >= 3));
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
```

- [ ] **Step 2: Run it and verify it fails**

```bash
cd backend && npx tsx src/services/trainingSandboxService.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the service**

Create `backend/src/services/trainingSandboxService.ts`:

```ts
import { prisma } from "../db/prisma.js";

export const TRAINING_PROJECT_NAME = "Constellation 101 — Training";

export const TRAINING_FIXTURE = {
  tasks: [
    { title: "Draft the agenda for the design review", status: "TODO",        priority: "MEDIUM" },
    { title: "Collect part numbers for the bracket order", status: "TODO",     priority: "LOW" },
    { title: "Route the harness through bay two", status: "IN_PROGRESS",       priority: "HIGH" },
    { title: "Machine the mounting plate", status: "BLOCKED",                  priority: "HIGH" },
    { title: "Update the wiring diagram", status: "IN_PROGRESS",               priority: "MEDIUM" },
    { title: "Photograph the assembly for the blog", status: "DONE",           priority: "LOW" },
  ],
  milestones: [
    { title: "Design review", dueInDays: 14 },
    // Negative on purpose: the learner needs to see a real at-risk badge in
    // module 3, and a fixture where everything is green teaches nothing.
    { title: "Fabrication complete", dueInDays: -3 },
  ],
  blockers: [
    { label: "Waiting on the machine shop", color: "#f5a623" },
  ],
};

/**
 * Idempotent by construction: trainingForMemberId is @unique, so a second call
 * cannot create a second project even under a race.
 */
export async function ensureTrainingProject(memberId: string): Promise<{ projectId: string }> {
  const existing = await prisma.project.findUnique({ where: { trainingForMemberId: memberId } });
  if (existing) {
    if (existing.status === "ARCHIVED") {
      await prisma.project.update({ where: { id: existing.id }, data: { status: "ACTIVE" } });
    }
    return { projectId: existing.id };
  }

  const project = await prisma.project.create({
    data: {
      name: TRAINING_PROJECT_NAME,
      description: "Your private practice space. Nothing here reaches the club's real reporting.",
      // ProjectType is ENGINEERING | RESEARCH | HYBRID — there is no SOFTWARE.
      type: "ENGINEERING",
      status: "ACTIVE",
      trainingForMemberId: memberId,
      members: { create: { memberId } },
    },
  });

  const blocker = await prisma.blocker.create({
    data: { projectId: project.id, ...TRAINING_FIXTURE.blockers[0] },
  });

  for (const m of TRAINING_FIXTURE.milestones) {
    await prisma.milestone.create({
      data: {
        projectId: project.id,
        title: m.title,
        dueDate: new Date(Date.now() + m.dueInDays * 86_400_000),
      },
    });
  }

  for (const t of TRAINING_FIXTURE.tasks) {
    const task = await prisma.task.create({
      data: {
        projectId: project.id,
        title: t.title,
        status: t.status as never,
        priority: t.priority as never,
        createdById: memberId,
      },
    });
    if (t.status === "BLOCKED") {
      await prisma.taskBlocker.create({ data: { taskId: task.id, blockerId: blocker.id } });
    }
  }

  return { projectId: project.id };
}

export async function archiveTrainingProject(memberId: string) {
  await prisma.project.updateMany({
    where: { trainingForMemberId: memberId },
    data: { status: "ARCHIVED" },
  });
}

export async function isTrainingProject(projectId: string): Promise<boolean> {
  const p = await prisma.project.findUnique({
    where: { id: projectId }, select: { trainingForMemberId: true },
  });
  return Boolean(p?.trainingForMemberId);
}
```

> Verified against `schema.prisma`: `ProjectType` is `ENGINEERING | RESEARCH | HYBRID`, `ProjectStatus` includes `ARCHIVED`, and the client is `import { prisma } from "../db/prisma.js"`. **Not** verified — the exact field names on `Blocker`, `Milestone`, `ProjectMember`, and `TaskBlocker`. Grep one existing creator in `projects.ts` / `milestones.ts` / `blockers.ts` before writing those four calls.

- [ ] **Step 4: Run the test and verify it passes**

```bash
cd backend && npx tsx src/services/trainingSandboxService.test.ts
```

Expected: `8 passed, 0 failed`

- [ ] **Step 5: Suppress rewards in training projects**

In `rewardService.ts`, at the top of `handleTaskComplete` and `handleTimeLog`:

```ts
  // Practice work must not pay. A learner who earns real XP for a fake task
  // makes every XP number in the club slightly less meaningful.
  if (task.projectId && await isTrainingProject(task.projectId)) return null;
```

Adjust to each function's actual parameter shape and return type.

- [ ] **Step 6: Add the route**

In `backend/src/api/projects.ts`:

```ts
router.post("/training-project", requireAuth, async (req, res) => {
  const out = await ensureTrainingProject(req.memberId!);
  res.json(out);
});
```

Mount so the path is `/api/training-project` — check how `projects.ts` is mounted in `app.ts` and place the route accordingly.

- [ ] **Step 7: Add the sweep cron**

In `backend/src/slack/scheduler.ts`, alongside the 03:00–03:30 cleanup jobs:

```ts
// 03:45 — drop training projects nobody has touched in 30 days.
cron.schedule("45 3 * * *", async () => {
  const cutoff = new Date(Date.now() - 30 * 86_400_000);
  const stale = await prisma.project.findMany({
    where: { trainingForMemberId: { not: null }, updatedAt: { lt: cutoff } },
    select: { id: true },
  });
  for (const p of stale) await prisma.project.delete({ where: { id: p.id } });
  if (stale.length) console.log(`[cron] removed ${stale.length} stale training projects`);
});
```

- [ ] **Step 8: Archive the training project on course completion**

Without this, `archiveTrainingProject` is dead code and every learner keeps a stale training project forever. In `courseProgressService.ts`'s `applyCourseSideEffects` — the function that already runs when an enrollment completes — add:

```ts
  // The training project has done its job. Archive rather than delete: the
  // learner may want to look back at what they did, and deleting it would
  // cascade their practice tasks away mid-course if they resume a later module.
  if (course.slug === "constellation-101") {
    await archiveTrainingProject(memberId);
  }
```

Match the function's real parameter names — grep its signature before editing.

- [ ] **Step 9: Verify**

```bash
cd backend && npx tsc --noEmit && npx tsx src/services/trainingSandboxService.test.ts
```

- [ ] **Step 10: Commit**

```bash
git add backend/src
git commit -m "feat(courses): training sandbox with seeded fixture and reward suppression"
```

---

## Task 10: The exclusion sweep

> **This is the highest-risk task in the plan.** Miss one site and a fake "Constellation 101 — Training" project appears in the club's real reporting. Work the checklist; do not eyeball it.

**Files:**
- Modify (11 sites): `backend/src/api/projects.ts`, `backend/src/api/leaderboard.ts`, `backend/src/api/reporting.ts`, `backend/src/services/activityService.ts`, `backend/src/services/projectContextService.ts`, `backend/src/services/streakService.ts`, `backend/src/slack/scheduler.ts`, `src/pages/ClubPM/Dashboard.jsx`, `src/pages/ClubPM/GanttView.jsx`, `src/pages/ClubPM/MembersView.jsx`, `src/components/clubpm/courses/CoursesTab.jsx`

**Interfaces:**
- Consumes: `Project.trainingForMemberId` (Task 1)
- Produces: a shared `EXCLUDE_TRAINING` Prisma filter fragment

- [ ] **Step 1: Define the filter once**

In `backend/src/services/trainingSandboxService.ts`:

```ts
/**
 * Spread into any Prisma `where` that lists or aggregates projects.
 *
 * Training projects are real rows with real tasks, so every listing query sees
 * them unless told otherwise. Import this rather than hand-writing the filter —
 * a hand-written one is how a site gets missed.
 */
export const EXCLUDE_TRAINING = { trainingForMemberId: null } as const;
```

- [ ] **Step 2: Apply it to each backend site, one at a time**

For each, add `...EXCLUDE_TRAINING` to the project-level `where`, or `project: { is: EXCLUDE_TRAINING }` when filtering a child model (tasks, activities):

- [ ] `projects.ts` — `GET /api/projects` list
- [ ] `leaderboard.ts` — XP/doubloon aggregation
- [ ] `reporting.ts` — every report query
- [ ] `activityService.ts` — `getProjectActivities` feed and the SSE stream
- [ ] `projectContextService.ts` — `buildProjectContext`, so the AI never reasons about a training project
- [ ] `streakService.ts` — activity credit
- [ ] `scheduler.ts` — Monday digest and standup prompts

- [ ] **Step 3: Apply it frontend-side**

The frontend sites consume the endpoints above, so most need no change once the backend filters. Verify each renders nothing training-related:

- [ ] `Dashboard.jsx` project list and stat tiles
- [ ] `GanttView.jsx`
- [ ] `MembersView.jsx` open-task counts
- [ ] `CoursesTab.jsx` / any project picker

If one calls an endpoint you did not filter, filter that endpoint — **not** the component. A client-side filter leaves the data in the payload.

- [ ] **Step 4: Verify manually — this is the actual test**

Create a training project (call `POST /api/training-project` as a test member), then walk every site and confirm it is absent:

```bash
cd backend && npx tsc --noEmit
```

Then in the running app, check each of the eleven. **Write down which ones you checked.** A task that says "done" without the enumeration is not done.

- [ ] **Step 5: Commit**

```bash
git add backend/src src/
git commit -m "fix(courses): exclude training projects from every real listing"
```

---

## Task 11: Course seed script

**Files:**
- Create: `backend/scripts/seedCourses.ts`
- Modify: `backend/package.json`

**Interfaces:**
- Consumes: `docs/courses/**` (already written); `loadTourSteps` (Task 7)
- Produces: `npm run seed:courses`

- [ ] **Step 1: Write the seeder**

Create `backend/scripts/seedCourses.ts`. It must be **idempotent and non-destructive toward learners** — upsert course/module/section rows, never touch `CourseEnrollment`, `CourseSectionProgress`, or `CourseQuizAttempt`:

```ts
/**
 * Install courses from docs/courses into the database.
 *
 * Reads the repo working tree, so this CANNOT run from a deployed backend build
 * (no docs/ directory there). That is deliberate: installing a course is an
 * authoring act performed from a checkout, not a runtime operation.
 *
 * Run: cd backend && npm run seed:courses
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prisma } from "../src/db.js";
import { loadTourSteps } from "../src/services/tourStepService.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const COURSES = path.join(REPO_ROOT, "docs", "courses");

async function seedCourse(dir: string, authorId: string) {
  const doc = JSON.parse(fs.readFileSync(path.join(dir, "course.json"), "utf8"));

  const course = await prisma.course.upsert({
    where: { slug: doc.slug },
    update: {
      title: doc.title, summary: doc.summary,
      estimatedMinutes: doc.estimatedMinutes,
      xpOverride: doc.xpOverride ?? null, doubloonOverride: doc.doubloonOverride ?? null,
    },
    create: {
      slug: doc.slug, title: doc.title, summary: doc.summary,
      estimatedMinutes: doc.estimatedMinutes, status: "DRAFT",
      xpOverride: doc.xpOverride ?? null, doubloonOverride: doc.doubloonOverride ?? null,
      createdById: authorId,
    },
  });

  const seenSectionIds: string[] = [];

  for (const m of doc.modules) {
    const existingModule = await prisma.courseModule.findFirst({
      where: { courseId: course.id, title: m.title },
    });
    const mod = existingModule
      ? await prisma.courseModule.update({
          where: { id: existingModule.id },
          data: { order: m.order, summary: m.summary, estimatedMinutes: m.estimatedMinutes,
                  isRequired: m.isRequired, sequential: m.sequential },
        })
      : await prisma.courseModule.create({
          data: { courseId: course.id, order: m.order, title: m.title, summary: m.summary,
                  estimatedMinutes: m.estimatedMinutes, isRequired: m.isRequired,
                  sequential: m.sequential },
        });

    for (const s of m.sections) {
      const data: Record<string, unknown> = {
        order: s.order, title: s.title, kind: s.kind, isRequired: s.isRequired,
        contentJson: {}, passThreshold: s.passThreshold ?? null, maxAttempts: s.maxAttempts ?? null,
      };

      if (s.kind === "WALKTHROUGH") {
        // Validate now, not at learn time: a broken step file should fail the
        // seed loudly rather than surface as a dead tour for a learner.
        const steps = loadTourSteps(s.tourConfig.tourId);
        if (steps.length !== s.tourConfig.stepCount) {
          throw new Error(
            `${s.tourConfig.tourId}: course.json says stepCount ${s.tourConfig.stepCount}, ` +
            `file has ${steps.length}`
          );
        }
        data.tourConfig = s.tourConfig;
      }
      if (s.kind === "CONTENT" && s.bodyRef) {
        data.contentJson = { markdownSource: fs.readFileSync(path.join(dir, s.bodyRef), "utf8") };
      }
      if (s.kind === "VIDEO" && s.videoConfig) data.videoConfig = s.videoConfig;
      if (s.kind === "SLIDES" && s.slideConfig) data.slideConfig = s.slideConfig;

      const existing = await prisma.courseSection.findFirst({
        where: { courseId: course.id, moduleId: mod.id, title: s.title },
      });
      const section = existing
        ? await prisma.courseSection.update({ where: { id: existing.id }, data })
        : await prisma.courseSection.create({
            data: { ...data, courseId: course.id, moduleId: mod.id } as never,
          });
      seenSectionIds.push(section.id);

      if (s.kind === "QUIZ" && s.quizRef) {
        await seedQuiz(section.id, path.join(dir, s.quizRef));
      }
    }
  }

  // Sections dropped from course.json are archived, never deleted — deleting a
  // section deletes the progress rows of everyone who completed it.
  await prisma.courseSection.updateMany({
    where: { courseId: course.id, id: { notIn: seenSectionIds } },
    data: { isRequired: false, title: "[archived] " },
  });

  console.log(`  ✓ ${doc.slug}: ${doc.modules.length} modules`);
}

async function seedQuiz(sectionId: string, file: string) {
  const bank = JSON.parse(fs.readFileSync(file, "utf8"));
  for (const q of bank.questions) {
    const existing = await prisma.courseQuestion.findFirst({
      where: { sectionId, prompt: q.prompt },
    });
    if (existing) {
      await prisma.courseQuestion.update({
        where: { id: existing.id },
        data: { order: q.order, kind: q.kind, explanation: q.explanation, points: q.points },
      });
      await prisma.courseAnswer.deleteMany({ where: { questionId: existing.id } });
      await prisma.courseAnswer.createMany({
        data: q.answers.map((a: any) => ({ questionId: existing.id, ...a })),
      });
      continue;
    }
    await prisma.courseQuestion.create({
      data: {
        sectionId, order: q.order, prompt: q.prompt, kind: q.kind,
        explanation: q.explanation, points: q.points,
        answers: { create: q.answers },
      },
    });
  }
}

async function main() {
  const author = await prisma.member.findFirst({ where: { isAdmin: true } });
  if (!author) throw new Error("no admin member to own the seeded courses");

  for (const e of fs.readdirSync(COURSES, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const dir = path.join(COURSES, e.name);
    if (!fs.existsSync(path.join(dir, "course.json"))) continue;
    await seedCourse(dir, author.id);
  }
  console.log("seed:courses done");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
```

> `Member.isAdmin Boolean @default(false)` is the real field — verified, use it as written.

- [ ] **Step 2: Add the script**

In `backend/package.json`:

```json
"seed:courses": "tsx scripts/seedCourses.ts"
```

- [ ] **Step 3: Run it**

```bash
cd backend && npm run seed:courses
```

Expected: five `✓` lines. A `stepCount` mismatch here means `course.json` and the steps file disagree — fix the JSON, not the check.

- [ ] **Step 4: Run it again — idempotency is the test**

```bash
cd backend && npm run seed:courses
```

Expected: identical output, and **zero** new rows. Verify:

```bash
cd backend && npx prisma studio
```

Confirm one `constellation-101`, 5 modules, 19 sections, 27 questions — not doubled.

- [ ] **Step 5: Walk the course end to end**

Visit `/clubpm/outreach/courses/constellation-101/learn` and confirm:
- M1 §2 launches `first-look`, the scrim dims the app, and the spotlight tracks
- the bell step advances only on a real click
- pausing, navigating, reloading, and resuming lands on the same step
- finishing returns to the course page and marks the section complete
- a locked section's payload carries no `tourConfig` and no `tourSteps` (check the Network tab)

- [ ] **Step 6: Commit**

```bash
git add backend/scripts backend/package.json
git commit -m "feat(courses): idempotent course seeder reading docs/courses"
```

---

## Task 12: Editor support and the elective tours

**Files:**
- Modify: `src/pages/ClubPM/CourseEditorPage.jsx`
- Create: `src/components/clubpm/courses/WalkthroughSectionPanel.jsx`
- Create: 6 × `docs/courses/*/walkthroughs/*.steps.json`

**Interfaces:**
- Consumes: `listTourBreakages` (Task 5); the elective outlines in each `walkthroughs/README.md`

- [ ] **Step 1: Write the read-only panel**

Create `src/components/clubpm/courses/WalkthroughSectionPanel.jsx` — a step list plus the breakage report:

```jsx
import React, { useEffect, useState } from "react";
import { listTourBreakages } from "../../../api/clubPmClient";

export default function WalkthroughSectionPanel({ section }) {
  const [breakages, setBreakages] = useState([]);
  const cfg = section.tourConfig ?? {};
  const steps = section.tourSteps ?? [];

  useEffect(() => {
    listTourBreakages(section.id).then(setBreakages).catch(() => setBreakages([]));
  }, [section.id]);

  return (
    <div className="pm-tour-editor">
      <div className="cpm-card">
        <h3><i className="fas fa-code" aria-hidden="true" /> Steps are repo files</h3>
        <p>
          This tour is <code>docs/courses/…/walkthroughs/{cfg.tourId}.steps.json</code>. Steps target
          UI elements by anchor id, so they live beside the code that provides those anchors — a
          rename fails the build instead of silently breaking a live tour. Editing one means a pull
          request.
        </p>
      </div>

      <ol className="pm-tour-editor-steps">
        {steps.map((s, i) => (
          <li key={s.id}>
            <span className="pm-tour-editor-num">{i + 1}</span>
            <div>
              <strong>{s.title}</strong>
              <p>{s.body}</p>
              <span className="cpm-tag">{s.anchor}</span>
              <span className="cpm-tag">{s.advance.on}</span>
              {s.optional && <span className="cpm-tag">optional</span>}
            </div>
          </li>
        ))}
      </ol>

      {breakages.length > 0 && (
        <div className="cpm-card pm-tour-editor-breakages">
          <h3>
            <i className="fas fa-triangle-exclamation" aria-hidden="true" />{" "}
            {breakages.length} step(s) failed to find their anchor
          </h3>
          <ul>
            {breakages.map((b) => (
              <li key={b.id}>
                <code>{b.payload?.anchor}</code> on <code>{b.payload?.pathname}</code>{" "}
                — {new Date(b.createdAt).toLocaleString()}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Render it in the editor**

In `CourseEditorPage.jsx`'s main-column switch, add a `WALKTHROUGH` case rendering `WalkthroughSectionPanel`. Keep the AI panel available — a walkthrough section still has a prose body.

- [ ] **Step 3: Transcribe the six elective step files**

Each course's `walkthroughs/README.md` specifies every step, its anchor, and its advance mode in a table. Transcribe each into `<tourId>.steps.json` using the schema in Task 7's `validateSteps`:

- [ ] `constellation-vault-and-crs/walkthroughs/vault-checkout.steps.json` (9 steps)
- [ ] `constellation-vault-and-crs/walkthroughs/change-request.steps.json` (8)
- [ ] `constellation-outreach-and-blog/walkthroughs/crm-and-campaigns.steps.json` (9)
- [ ] `constellation-outreach-and-blog/walkthroughs/blog-editor.steps.json` (8)
- [ ] `constellation-admin-tools/walkthroughs/admin-tour.steps.json` (8)
- [ ] `constellation-authoring/walkthroughs/course-authoring.steps.json` (7)

- [ ] **Step 4: Add the missing anchors**

Three outlines flag anchors not yet in the registry: contact-detail history and follow-up field (`crm-and-campaigns`), `blog.new` and `blog.editor.ai` (`blog-editor`). For each: add to `docs/courses/ANCHORS.md`, add to `tourAnchors.js`, and add the `data-tour-id` to the component — **in this commit**, or the check fails.

- [ ] **Step 5: Run the gate**

```bash
node scripts/check-tour-anchors.js
```

Expected: OK, with `used by steps` now ~95 rather than 46.

- [ ] **Step 6: Re-seed and verify**

```bash
cd backend && npm run seed:courses
```

Expected: five `✓` lines, no `stepCount` mismatch.

- [ ] **Step 7: Full verification**

```bash
npm run build && npm test
cd backend && npx tsc --noEmit
cd backend && npx tsx src/services/tourStepService.test.ts
cd backend && npx tsx src/services/trainingSandboxService.test.ts
```

All must pass.

- [ ] **Step 8: Commit**

```bash
git add src/ docs/courses backend/
git commit -m "feat(courses): walkthrough editor panel and elective tour steps"
```

---

## Verification Summary

| Gate | Command |
|---|---|
| Anchor contract | `node scripts/check-tour-anchors.js` |
| Frontend build | `npm run build` |
| Frontend tests + anchors | `npm test` |
| Backend types | `cd backend && npx prisma generate && npx tsc --noEmit` |
| Tour logic | `cd backend && npx tsx src/services/tourStepService.test.ts` |
| Sandbox fixture | `cd backend && npx tsx src/services/trainingSandboxService.test.ts` |
| Seed idempotency | `cd backend && npm run seed:courses` twice, row counts unchanged |

**Manual, from the spec — all eleven must be walked before this is called done:**

1. Scrim blocks every click outside the spotlight; the spotlit element is genuinely clickable.
2. A `route` step navigates on its own and finds its anchor after the lazy chunk loads.
3. `your-first-task` end to end; each `api` step advances only on a real 2xx; the task exists in the training project and nowhere else.
4. Rename a `data-tour-id` → `npm test` fails naming the step.
5. Delete an anchor at runtime → step degrades within 8s, offers Skip, files a breakage visible in the editor.
6. Pause mid-tour, navigate away, reload → Resume restores the same step.
7. A locked WALKTHROUGH section's payload carries no `tourConfig` and no steps.
8. The section will not complete before the last step, and does immediately after.
9. **The exclusion checklist — all eleven sites, individually.**
10. Complete Constellation 101 → training project archived, course XP granted exactly once.
11. Re-run `seed:courses` → no enrollment or progress row changes.
