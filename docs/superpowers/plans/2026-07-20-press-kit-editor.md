# Press Kit Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the static generated press-kit PDF with a per-project, collaboratively-editable press-kit document — generated from live data + AI (audience-aware), edited like a blog post, and served at the existing public tokenized URL.

**Architecture:** Blog-style single document. A new `ProjectPressKit` row stores a TipTap `contentJson` (+ Yjs binary for realtime collab) and a `config` JSON. "Generate" gathers live project data, runs an AI prose pass, assembles markdown, converts to TipTap JSON, and stores it (snapshotting the prior doc to `PressKitRevision`). Editing reuses the existing blog `BlogEditor` (TipTap + Hocuspocus) pointed at a new `/collab/presskit` namespace. The public route renders the stored doc to print-styled HTML. The UI lives inside the project **Reports** tab as a new **Press Kit** sub-tab (alongside **Charts** and **Activity**).

**Tech Stack:** Prisma/PostgreSQL, Express (ESM, `.js` import suffixes), Hocuspocus/Yjs, `@tiptap`, React 19, React Router 7. Backend pure-logic tests use the repo's dependency-free inline harness run with `npx tsx` (no Jest).

**Spec:** `docs/superpowers/specs/2026-07-20-press-kit-editor-design.md`

**Conventions to honor:**
- Backend is ESM: **all relative imports end in `.js`** even for `.ts` files.
- In API handlers, always read `req.memberId` (never `req.session.memberId`).
- Append new CSS to the bottom of `public/search-theme.css`; use a `presskit-` prefix.
- After every phase: `cd backend && npx tsc --noEmit` AND (repo root) `npm run build` must pass.

---

## File Structure

**Backend — created:**
- `backend/src/api/pressKit.ts` — REST router (get/generate/patch/publish/revisions/restore).
- `backend/src/collab/pressKitCollab.ts` — Hocuspocus WS namespace `/collab/presskit`.
- `backend/src/services/pressKitService.test.ts` — inline-harness unit tests (excluded from build).

**Backend — modified:**
- `backend/prisma/schema.prisma` — `PressKitStatus` enum, `ProjectPressKit` + `PressKitRevision` models, relations on `Project` and `Member`.
- `backend/src/services/pressKitService.ts` — rewrite: config normalization, data gathering, markdown assembly, TipTap generation, HTML render (drop imagery grid + live task/milestone dump).
- `backend/src/services/aiService.ts` — replace `generatePressKitSynopsis` with `generatePressKitSections`.
- `backend/src/app.ts` — mount `pressKitRouter`; `attachPressKitCollab(server)`.

**Frontend — created:**
- `src/components/clubpm/PressKitPanel.jsx` — the embedded Press Kit sub-tab (generate panel + editor + toolbar).

**Frontend — modified:**
- `src/components/clubpm/blog/BlogEditor.jsx` — add optional `collabWsUrl` prop.
- `src/api/clubPmClient.js` — `getPressKitCollabWsUrl()` + press-kit fetch helpers.
- `src/pages/ClubPM/ProjectDetail.jsx` — Reports sub-tab bar (Charts/Activity/Press Kit); remove hero PDF button.
- `public/search-theme.css` — `presskit-` styles.

---

## Shared type & name contract (used across tasks — keep identical)

```ts
// Press kit config (stored as ProjectPressKit.config JSON)
type PressKitAudience = "SPONSORS" | "PRESS" | "RECRUITING" | "GENERAL";
interface PressKitConfig {
  audience: PressKitAudience;
  includedSections: string[]; // subset of SECTION_IDS
  accentColor: string;        // hex, e.g. "#00e5cc"
  contactEmail: string;       // may be ""
  showContact: boolean;
}
// Section ids (order = document order)
const SECTION_IDS = [
  "masthead", "about", "aboutSearch", "stats", "building",
  "timeline", "tech", "team", "highlights", "links", "contact", "sponsorship",
] as const;

// Data snapshot gathered from the DB (pure input to markdown assembly)
interface PressKitContext {
  project: { name: string; type: string; status: string; description: string | null;
             startDate: Date | null; targetDate: Date | null; programTag: string | null;
             githubRepo: string | null; driveLink: string | null };
  stats: { teamSize: number; tasksDone: number; tasksTotal: number;
           milestonesHit: number; hoursLogged: number; durationDays: number | null };
  milestones: { title: string; description: string | null; completedAt: Date | null }[]; // completed
  team: { displayName: string; title: string | null; role: string | null;
          avatarUrl: string | null; isLead: boolean }[];
  tags: string[];
  links: { label: string; url: string }[];
}

// AI-written prose blocks (markdown strings), passed into assembly
interface PressKitProse { about: string; aboutSearch: string; building: string; sponsorship: string }
```

Client REST helper names: `getPressKit`, `generatePressKit`, `updatePressKitConfig`, `publishPressKit`, `getPressKitRevisions`, `restorePressKitRevision`, `getPressKitCollabWsUrl`.

Service function names: `ensurePressKitToken`, `DEFAULT_PRESS_KIT_CONFIG`, `normalizePressKitConfig`, `gatherPressKitData`, `buildPressKitMarkdown`, `generatePressKitContent`, `buildPressKitHtml`.

---

## Phase 1 — Schema + migration

### Task 1.1: Add press-kit models

**Files:**
- Modify: `backend/prisma/schema.prisma` (Project model ~237-277; Member model ~125; append new models near `BlogRevision` ~950)

- [ ] **Step 1: Add the enum and models.** Append to `backend/prisma/schema.prisma` (after the `BlogSnippet` model is a good spot):

```prisma
enum PressKitStatus {
  DRAFT
  PUBLISHED
}

model ProjectPressKit {
  id           String         @id @default(cuid())
  projectId    String         @unique
  project      Project        @relation(fields: [projectId], references: [id], onDelete: Cascade)
  contentJson  Json?          // TipTap document — source of truth for editing
  contentYjs   Bytes?         // Yjs/CRDT binary state for realtime collaboration
  renderedHtml String?        // inner HTML snapshot written on publish (served to public)
  config       Json           // PressKitConfig
  status       PressKitStatus @default(DRAFT)
  generatedAt  DateTime?
  createdById  String
  createdBy    Member         @relation("PressKitCreator", fields: [createdById], references: [id])
  createdAt    DateTime       @default(now())
  updatedAt    DateTime       @updatedAt
  revisions    PressKitRevision[]
}

model PressKitRevision {
  id          String          @id @default(cuid())
  pressKitId  String
  pressKit    ProjectPressKit @relation(fields: [pressKitId], references: [id], onDelete: Cascade)
  contentJson Json
  authorId    String
  author      Member          @relation("PressKitRevisionAuthor", fields: [authorId], references: [id])
  createdAt   DateTime        @default(now())

  @@index([pressKitId])
}
```

- [ ] **Step 2: Add the back-relations.** In `model Project { ... }` add (near `submissions OutreachSubmission[]`):

```prisma
  pressKit ProjectPressKit?
```

In `model Member { ... }` add (alongside the other Blog* back-relations):

```prisma
  pressKitsCreated  ProjectPressKit[]  @relation("PressKitCreator")
  pressKitRevisions PressKitRevision[] @relation("PressKitRevisionAuthor")
```

- [ ] **Step 3: Validate + generate the client.**

Run: `cd backend && npx prisma validate && npx prisma generate`
Expected: "The schema at prisma/schema.prisma is valid" and "Generated Prisma Client".

- [ ] **Step 4: Create the migration.**

Run: `cd backend && npx prisma migrate dev --name add_project_press_kit`
Expected: a new folder under `backend/prisma/migrations/` and "Your database is now in sync".
If no database is reachable locally, `migrate dev` will fail to connect — that's fine: the schema is already validated and the client generated in Step 3, and deploy auto-runs `prisma migrate` (per the meeting-scheduler precedent). Note in the commit message that the migration folder must be generated in an environment with DB access before deploy.

- [ ] **Step 5: Typecheck.**

Run: `cd backend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit.**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations
git commit -m "feat(presskit): add ProjectPressKit + PressKitRevision models"
```

---

## Phase 2 — Content generation + render service

### Task 2.1: AI section generator

**Files:**
- Modify: `backend/src/services/aiService.ts` (replace `generatePressKitSynopsis` + its `PressKit*` interfaces, ~89-179)

- [ ] **Step 1: Delete the old synopsis export.** Remove `generatePressKitSynopsis` and the `PressKitProject` / `PressKitTask` / `PressKitMilestone` interfaces (lines ~89-179). (Its only caller — the old `pressKitService.buildPressKitHtml` — is rewritten in Task 2.3, so nothing else references it.)

- [ ] **Step 2: Add the new generator** in the same spot. It returns markdown prose blocks; on any failure it returns empty strings so generation still succeeds with the programmatic sections:

```ts
// ── Press Kit prose (audience-aware) ─────────────────────────

export type PressKitAudience = "SPONSORS" | "PRESS" | "RECRUITING" | "GENERAL";

export interface PressKitProseInput {
  name: string;
  type: string;
  status: string;
  description?: string | null;
  milestones: string[];         // completed milestone titles
  taskTitles: string[];         // top-level task titles (for subsystem inference)
  tags: string[];
}

export interface PressKitProse {
  about: string;
  aboutSearch: string;
  building: string;
  sponsorship: string;
}

const AUDIENCE_TONE: Record<PressKitAudience, string> = {
  SPONSORS:   "Emphasize impact, progress, and why the work matters to a funder. Confident, concrete.",
  PRESS:      "Neutral, factual, quotable. Lead with what it is and why it is notable.",
  RECRUITING: "Inviting and energetic; convey what members do and learn.",
  GENERAL:    "Clear, professional overview for a general audience.",
};

export async function generatePressKitSections(
  input: PressKitProseInput,
  audience: PressKitAudience
): Promise<PressKitProse> {
  const empty: PressKitProse = { about: "", aboutSearch: "", building: "", sponsorship: "" };
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return empty;

  const prompt = `You write press-kit copy for a Purdue university engineering club (SEARCH — Students for the Exploration and Research of Space).
Audience: ${audience}. ${AUDIENCE_TONE[audience]}
Return ONLY a JSON object with these string fields (markdown allowed, no headings inside values):
- "about": 2-4 sentences on what this specific project is and its current state.
- "aboutSearch": 2-3 sentences of standard boilerplate about the SEARCH club (space research/engineering student org at Purdue).
- "building": 3-5 sentences summarizing the technical subsystems/areas of work, inferred from the task titles. Name specific subsystems.
- "sponsorship": ${audience === "SPONSORS" ? "2-3 sentences on the impact of support and how a sponsor can help." : "an empty string"}.
Do not invent facts not implied by the data. No filler like "cutting-edge" or "exciting".

Project: ${input.name} (${input.type}, status ${input.status})
${input.description ? `Description: ${input.description}` : ""}
Completed milestones: ${input.milestones.join("; ") || "none"}
Task titles: ${input.taskTitles.slice(0, 40).join("; ") || "none"}
Tags: ${input.tags.join(", ") || "none"}`;

  try {
    const response = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 900,
          responseMimeType: "application/json",
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    });
    if (!response.ok) return empty;
    const data = (await response.json()) as {
      candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[];
    };
    const parts = data.candidates?.[0]?.content?.parts ?? [];
    const raw = (parts.find((p) => !p.thought)?.text ?? parts[parts.length - 1]?.text ?? "").trim();
    const parsed = JSON.parse(raw) as Partial<PressKitProse>;
    return {
      about: String(parsed.about ?? ""),
      aboutSearch: String(parsed.aboutSearch ?? ""),
      building: String(parsed.building ?? ""),
      sponsorship: String(parsed.sponsorship ?? ""),
    };
  } catch {
    return empty;
  }
}
```

- [ ] **Step 3: Typecheck.**

Run: `cd backend && npx tsc --noEmit`
Expected: no errors (note: `buildPressKitHtml`'s old body still references the removed function until Task 2.3; if you do this task standalone, expect a temporary error there — do Task 2.3 in the same commit, or comment the old call. Recommended: do 2.1–2.3 together, commit once at end of 2.3.)

### Task 2.2: Config normalization + markdown assembly (pure, TDD)

**Files:**
- Modify: `backend/src/services/pressKitService.ts` (replace file contents; keep `ensurePressKitToken`)
- Create: `backend/src/services/pressKitService.test.ts`

- [ ] **Step 1: Write the failing test** at `backend/src/services/pressKitService.test.ts`:

```ts
// Pure-logic tests for pressKitService. No DB required.
// Run: cd backend && npx tsx src/services/pressKitService.test.ts
// Excluded from the production build (tsconfig `exclude` covers *.test.ts).

import {
  DEFAULT_PRESS_KIT_CONFIG, normalizePressKitConfig, buildPressKitMarkdown,
} from "./pressKitService.js";
import type { PressKitContext } from "./pressKitService.js";

let passed = 0, failed = 0;
function check(name: string, cond: boolean) {
  if (cond) passed++; else { failed++; console.error(`  ✗ ${name}`); }
}

// normalizePressKitConfig: fills defaults, clamps unknown audience + sections
{
  const c = normalizePressKitConfig({ audience: "NOPE", includedSections: ["about", "bogus"] });
  check("audience falls back to GENERAL", c.audience === "GENERAL");
  check("drops unknown sections", !c.includedSections.includes("bogus"));
  check("keeps known section", c.includedSections.includes("about"));
  check("accentColor default", c.accentColor === DEFAULT_PRESS_KIT_CONFIG.accentColor);
  check("showContact boolean", typeof c.showContact === "boolean");
}

// buildPressKitMarkdown: includes only configured sections, renders stats table
{
  const ctx: PressKitContext = {
    project: { name: "AstroUSA", type: "HARDWARE", status: "ACTIVE", description: "High-altitude platform",
      startDate: new Date("2026-01-01"), targetDate: new Date("2026-09-01"), programTag: "astrousa",
      githubRepo: "purduesearch/astrousa", driveLink: null },
    stats: { teamSize: 12, tasksDone: 30, tasksTotal: 47, milestonesHit: 6, hoursLogged: 210, durationDays: 200 },
    milestones: [{ title: "First flight", description: null, completedAt: new Date("2026-05-01") }],
    team: [{ displayName: "Ana Lee", title: "Lead", role: null, avatarUrl: null, isLead: true }],
    tags: ["Avionics", "Structures"],
    links: [{ label: "GitHub", url: "https://github.com/purduesearch/astrousa" }],
  };
  const prose = { about: "About body.", aboutSearch: "About SEARCH body.", building: "Building body.", sponsorship: "Sponsor body." };

  const md = buildPressKitMarkdown(ctx, normalizePressKitConfig({
    audience: "SPONSORS",
    includedSections: ["masthead", "about", "stats", "team", "sponsorship"],
    contactEmail: "leads@example.com",
  }), prose);

  check("has masthead title", md.includes("# AstroUSA"));
  check("has About heading", md.includes("## About This Project") && md.includes("About body."));
  check("has stats numbers", md.includes("12") && md.includes("210"));
  check("has team member", md.includes("Ana Lee"));
  check("sponsorship shown for SPONSORS", md.includes("Sponsor body."));
  check("excludes timeline (not selected)", !md.includes("## Timeline"));
}

console.log(`\npressKitService: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
```

- [ ] **Step 2: Run it to confirm it fails** (module has no such exports yet).

Run: `cd backend && npx tsx src/services/pressKitService.test.ts`
Expected: FAIL — import/type errors or `is not a function`.

- [ ] **Step 3: Rewrite `pressKitService.ts`** with the pure helpers + `ensurePressKitToken` (data gathering & full generation added in Task 2.3; keep imports minimal for now). Replace the whole file:

```ts
import { randomBytes } from "node:crypto";
import { prisma } from "../db/prisma.js";

// ── Config ───────────────────────────────────────────────────

export type PressKitAudience = "SPONSORS" | "PRESS" | "RECRUITING" | "GENERAL";

export interface PressKitConfig {
  audience: PressKitAudience;
  includedSections: string[];
  accentColor: string;
  contactEmail: string;
  showContact: boolean;
}

export const SECTION_IDS = [
  "masthead", "about", "aboutSearch", "stats", "building",
  "timeline", "tech", "team", "highlights", "links", "contact", "sponsorship",
] as const;

const AUDIENCES: PressKitAudience[] = ["SPONSORS", "PRESS", "RECRUITING", "GENERAL"];

export const DEFAULT_PRESS_KIT_CONFIG: PressKitConfig = {
  audience: "GENERAL",
  includedSections: [...SECTION_IDS].filter((s) => s !== "sponsorship"),
  accentColor: "#00e5cc",
  contactEmail: "",
  showContact: true,
};

export function normalizePressKitConfig(raw: unknown): PressKitConfig {
  const r = (raw ?? {}) as Record<string, unknown>;
  const audience = AUDIENCES.includes(r.audience as PressKitAudience)
    ? (r.audience as PressKitAudience) : DEFAULT_PRESS_KIT_CONFIG.audience;
  const sections = Array.isArray(r.includedSections)
    ? (r.includedSections as unknown[]).filter((s): s is string => typeof s === "string"
        && (SECTION_IDS as readonly string[]).includes(s))
    : DEFAULT_PRESS_KIT_CONFIG.includedSections;
  const accentColor = typeof r.accentColor === "string" && /^#[0-9a-fA-F]{3,8}$/.test(r.accentColor)
    ? r.accentColor : DEFAULT_PRESS_KIT_CONFIG.accentColor;
  const contactEmail = typeof r.contactEmail === "string" ? r.contactEmail : "";
  const showContact = typeof r.showContact === "boolean" ? r.showContact : true;
  return {
    audience,
    includedSections: sections.length ? sections : DEFAULT_PRESS_KIT_CONFIG.includedSections,
    accentColor, contactEmail, showContact,
  };
}

// ── Data snapshot ────────────────────────────────────────────

export interface PressKitContext {
  project: { name: string; type: string; status: string; description: string | null;
             startDate: Date | null; targetDate: Date | null; programTag: string | null;
             githubRepo: string | null; driveLink: string | null };
  stats: { teamSize: number; tasksDone: number; tasksTotal: number;
           milestonesHit: number; hoursLogged: number; durationDays: number | null };
  milestones: { title: string; description: string | null; completedAt: Date | null }[];
  team: { displayName: string; title: string | null; role: string | null;
          avatarUrl: string | null; isLead: boolean }[];
  tags: string[];
  links: { label: string; url: string }[];
}

export interface PressKitProse { about: string; aboutSearch: string; building: string; sponsorship: string }

// ── Markdown assembly (pure) ─────────────────────────────────

function fmtDate(d: Date | null | undefined): string {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

export function buildPressKitMarkdown(
  ctx: PressKitContext, config: PressKitConfig, prose: PressKitProse,
): string {
  const has = (id: string) => config.includedSections.includes(id);
  const out: string[] = [];
  const p = ctx.project;

  if (has("masthead")) {
    out.push(`# ${p.name}`);
    const meta = [p.type, p.status, p.programTag ? `Program: ${p.programTag}` : ""]
      .filter(Boolean).join(" · ");
    if (meta) out.push(`*${meta}*`);
    out.push("");
  }
  if (has("about") && prose.about) { out.push("## About This Project", prose.about, ""); }
  if (has("aboutSearch") && prose.aboutSearch) { out.push("## About Purdue SEARCH", prose.aboutSearch, ""); }

  if (has("stats")) {
    out.push("## By the Numbers", "");
    out.push("| Metric | Value |", "| --- | --- |");
    out.push(`| Team members | ${ctx.stats.teamSize} |`);
    out.push(`| Tasks completed | ${ctx.stats.tasksDone} of ${ctx.stats.tasksTotal} |`);
    out.push(`| Milestones reached | ${ctx.stats.milestonesHit} |`);
    out.push(`| Hours logged | ${ctx.stats.hoursLogged} |`);
    if (ctx.stats.durationDays != null) out.push(`| Days active | ${ctx.stats.durationDays} |`);
    out.push("");
  }
  if (has("building") && prose.building) { out.push("## What We're Building", prose.building, ""); }

  if (has("timeline") && (ctx.milestones.length || p.targetDate)) {
    out.push("## Timeline & Milestones", "");
    for (const m of ctx.milestones) {
      const when = m.completedAt ? ` — ${fmtDate(m.completedAt)}` : "";
      out.push(`- **${m.title}**${when}${m.description ? `: ${m.description}` : ""}`);
    }
    if (p.targetDate) out.push(`- **Target completion** — ${fmtDate(p.targetDate)}`);
    out.push("");
  }
  if (has("tech") && ctx.tags.length) {
    out.push("## Tech & Tools", ctx.tags.join(" · "), "");
  }
  if (has("team") && ctx.team.length) {
    out.push("## Team & Leadership", "");
    for (const t of ctx.team) {
      const lead = t.isLead ? " *(Lead)*" : "";
      const title = t.title ? ` — ${t.title}` : "";
      out.push(`- **${t.displayName}**${title}${lead}`);
    }
    out.push("");
  }
  if (has("highlights") && ctx.milestones.length) {
    out.push("## Highlights", "");
    for (const m of ctx.milestones.slice(0, 5)) out.push(`- ${m.title}`);
    out.push("");
  }
  if (has("links") && ctx.links.length) {
    out.push("## Links", "");
    for (const l of ctx.links) out.push(`- [${l.label}](${l.url})`);
    out.push("");
  }
  if (has("contact") && config.showContact && config.contactEmail) {
    out.push("## Contact", `For press or partnership inquiries: ${config.contactEmail}`, "");
  }
  if (has("sponsorship") && config.audience === "SPONSORS" && prose.sponsorship) {
    out.push("## Support This Project", prose.sponsorship, "");
  }

  return out.join("\n");
}

// ── Token ────────────────────────────────────────────────────

export async function ensurePressKitToken(projectId: string): Promise<string> {
  const project = await prisma.project.findUnique({
    where: { id: projectId }, select: { pressKitToken: true },
  });
  if (!project) throw new Error("Project not found");
  if (project.pressKitToken) return project.pressKitToken;
  const token = randomBytes(16).toString("hex");
  await prisma.project.update({ where: { id: projectId }, data: { pressKitToken: token } });
  return token;
}
```

- [ ] **Step 4: Run the test — expect PASS.**

Run: `cd backend && npx tsx src/services/pressKitService.test.ts`
Expected: `pressKitService: N passed, 0 failed`.

### Task 2.3: Data gathering + full generation + HTML render

**Files:**
- Modify: `backend/src/services/pressKitService.ts` (append functions)

- [ ] **Step 1a: Add imports at the TOP of `pressKitService.ts`** (import declarations must be top-level — add them next to the existing `node:crypto` / `prisma` imports, not before the appended functions):

```ts
import { generatePressKitSections } from "./aiService.js";
import { renderJsonToHtml, markdownToTiptapJson, type PMDoc } from "./blogRender.js";
```

- [ ] **Step 1b: Append data gathering + generation + render** to the END of `pressKitService.ts`:

```ts
// ── Gather live project data into a PressKitContext ──────────

export async function gatherPressKitData(projectId: string): Promise<PressKitContext | null> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      tags: true,
      members: { include: { member: { select: {
        id: true, displayName: true, title: true, role: true, avatarUrl: true,
      } } } },
      milestones: { where: { status: "COMPLETED" }, orderBy: { completedAt: "desc" }, take: 8 },
    },
  });
  if (!project) return null;

  const [tasksTotal, tasksDone, hoursAgg] = await Promise.all([
    prisma.task.count({ where: { projectId } }),
    prisma.task.count({ where: { projectId, status: "DONE" } }),
    prisma.timeLog.aggregate({ where: { task: { projectId } }, _sum: { minutes: true } }),
  ]);

  const durationDays = project.startDate
    ? Math.max(0, Math.round((Date.now() - new Date(project.startDate).getTime()) / 86_400_000))
    : null;

  const team = project.members.map((pm) => ({
    displayName: pm.member.displayName,
    title: pm.member.title,
    role: pm.member.role,
    avatarUrl: pm.member.avatarUrl,
    isLead: (pm.projectRole ?? "").toUpperCase() === "LEAD",
  }));

  const links: { label: string; url: string }[] = [];
  if (project.githubRepo) links.push({ label: "GitHub", url: `https://github.com/${project.githubRepo}` });
  if (project.driveLink) links.push({ label: "Drive", url: project.driveLink });
  if (project.programTag) links.push({ label: "Program page", url: `https://purduesearch.github.io/${project.programTag}` });
  links.push({ label: "Purdue SEARCH", url: "https://purduesearch.github.io" });

  return {
    project: {
      name: project.name, type: project.type, status: project.status,
      description: project.description, startDate: project.startDate, targetDate: project.targetDate,
      programTag: project.programTag, githubRepo: project.githubRepo, driveLink: project.driveLink,
    },
    stats: {
      teamSize: project.members.length,
      tasksDone, tasksTotal,
      milestonesHit: project.milestones.length,
      hoursLogged: Math.round((hoursAgg._sum.minutes ?? 0) / 60),
      durationDays,
    },
    milestones: project.milestones.map((m) => ({
      title: m.title, description: m.description, completedAt: m.completedAt,
    })),
    team,
    tags: project.tags.map((t) => t.name),
    links,
  };
}

// ── Full generation: data + AI + markdown -> TipTap JSON ─────

export async function generatePressKitContent(
  projectId: string, config: PressKitConfig,
): Promise<PMDoc | null> {
  const ctx = await gatherPressKitData(projectId);
  if (!ctx) return null;

  const prose = await generatePressKitSections(
    {
      name: ctx.project.name, type: ctx.project.type, status: ctx.project.status,
      description: ctx.project.description,
      milestones: ctx.milestones.map((m) => m.title),
      taskTitles: [], // titles not needed beyond count; keep prompt lean
      tags: ctx.tags,
    },
    config.audience,
  );

  const md = buildPressKitMarkdown(ctx, config, prose);
  return markdownToTiptapJson(md);
}

// ── Public HTML render (print-styled shell around the doc) ───

const PRINT_STYLES = `
  @page { size: letter; margin: 0.6in; }
  * { box-sizing: border-box; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #1a1d29; line-height: 1.6;
    margin: 0; padding: 40px 52px; max-width: 8.5in; background: #fff; }
  h1 { font-size: 30px; margin: 0 0 4px; color: #0a1929; letter-spacing: -0.5px; }
  h2 { font-size: 12px; text-transform: uppercase; letter-spacing: 1.2px; color: var(--accent);
    border-bottom: 2px solid var(--accent); padding-bottom: 4px; margin: 26px 0 10px; }
  h3 { font-size: 14px; margin: 18px 0 6px; }
  p { font-size: 13.5px; margin: 6px 0; }
  ul, ol { font-size: 13.5px; margin: 6px 0 6px 20px; }
  li { margin: 3px 0; }
  a { color: var(--accent); text-decoration: none; }
  blockquote { border-left: 3px solid var(--accent); margin: 10px 0; padding: 2px 14px; color: #444; background: #f7fbfc; }
  hr { border: none; border-top: 1px solid #ddd; margin: 20px 0; }
  table.cpm-blog-table { border-collapse: collapse; width: 100%; margin: 10px 0; font-size: 13px; }
  table.cpm-blog-table td, table.cpm-blog-table th { border: 1px solid #e2e6ea; padding: 6px 10px; text-align: left; }
  table.cpm-blog-table th { background: #f2f6f8; }
  figure.cpm-blog-figure { margin: 12px 0; text-align: center; }
  figure.cpm-blog-figure img { max-width: 100%; border-radius: 4px; }
  figure.cpm-blog-figure figcaption { font-size: 11px; color: #888; margin-top: 4px; }
  .cpm-blog-callout { border-left: 3px solid var(--accent); background: #f6fbfc; padding: 10px 14px; margin: 12px 0; border-radius: 4px; }
  nav.cpm-blog-toc { display: none; }
  .pk-brand { display: flex; justify-content: space-between; align-items: baseline;
    border-bottom: 3px solid var(--accent); padding-bottom: 10px; margin-bottom: 24px; }
  .pk-brand h2 { border: none; margin: 0; padding: 0; color: var(--accent); }
  .pk-brand .sub { font-size: 11px; color: #666; }
  .pk-footer { margin-top: 40px; padding-top: 14px; border-top: 1px solid #ddd; font-size: 10px; color: #888; text-align: center; }
  @media screen { body { box-shadow: 0 0 24px rgba(0,0,0,0.08); margin: 20px auto; border-radius: 4px; }
    .print-hint { position: fixed; top: 10px; right: 10px; background: var(--accent); color: #062; padding: 8px 14px;
      border-radius: 6px; font-size: 12px; z-index: 1000; } }
  @media print { .print-hint { display: none; } }
`;

/** Build the full public/print HTML for a project's press kit, or null if none/empty. */
export async function buildPressKitHtml(projectId: string): Promise<string | null> {
  const kit = await prisma.projectPressKit.findUnique({ where: { projectId } });
  if (!kit) return null;
  const config = normalizePressKitConfig(kit.config);
  const inner = kit.status === "PUBLISHED" && kit.renderedHtml
    ? kit.renderedHtml
    : renderJsonToHtml(kit.contentJson as unknown as PMDoc | null);
  if (!inner || !inner.trim()) return null;

  const accent = config.accentColor;
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { name: true } });
  const title = project?.name ?? "Press Kit";
  const esc = (s: string) => s.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const generated = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Press Kit — ${esc(title)}</title>
<style>:root{--accent:${esc(accent)};}${PRINT_STYLES}</style></head>
<body>
  <div class="print-hint">Press Ctrl/Cmd + P to save as PDF</div>
  <div class="pk-brand"><h2>Purdue SEARCH · Press Kit</h2><span class="sub">Generated ${generated}</span></div>
  ${inner}
  <div class="pk-footer">Purdue SEARCH · purduesearch.github.io</div>
</body></html>`;
}

/** Render the current doc to the inner HTML snapshot stored on publish. */
export function renderPressKitInnerHtml(doc: PMDoc | null | undefined): string {
  return renderJsonToHtml(doc ?? null);
}
```

- [ ] **Step 2: Confirm `blogRender.ts` exports `PMDoc`** (it does — `export interface PMDoc`). If `markdownToTiptapJson`/`renderJsonToHtml` import errors appear, re-check the import path `./blogRender.js`.

- [ ] **Step 3: Verify the public route still compiles.** `backend/src/api/public.ts` already calls `buildPressKitHtml(projectId)` and 404s on null — no change needed. Confirm by reading ~389-410.

- [ ] **Step 4: Typecheck + run the pure test again.**

Run: `cd backend && npx tsc --noEmit && npx tsx src/services/pressKitService.test.ts`
Expected: no TS errors; `N passed, 0 failed`.

- [ ] **Step 5: Commit (Tasks 2.1–2.3 together).**

```bash
git add backend/src/services/aiService.ts backend/src/services/pressKitService.ts backend/src/services/pressKitService.test.ts
git commit -m "feat(presskit): generation + render service (audience-aware, drops imagery grid)"
```

---

## Phase 3 — REST API + client helpers

### Task 3.1: Press-kit REST router

**Files:**
- Create: `backend/src/api/pressKit.ts`
- Modify: `backend/src/app.ts` (import + mount)

- [ ] **Step 1: Create `backend/src/api/pressKit.ts`:**

```ts
import { Router, type Request, type Response } from "express";
import { requireAuth } from "./auth.js";
import { prisma } from "../db/prisma.js";
import {
  DEFAULT_PRESS_KIT_CONFIG, normalizePressKitConfig, generatePressKitContent,
  renderPressKitInnerHtml, ensurePressKitToken,
} from "../services/pressKitService.js";
import type { PMDoc } from "../services/blogRender.js";
import type { Prisma } from "@prisma/client";

export const pressKitRouter = Router();
pressKitRouter.use(requireAuth);

// Project access: member of the project, or admin. Leads implicitly satisfy membership.
async function hasProjectAccess(memberId: string, projectId: string): Promise<boolean> {
  const [membership, me] = await Promise.all([
    prisma.projectMember.findUnique({ where: { projectId_memberId: { projectId, memberId } }, select: { memberId: true } }),
    prisma.member.findUnique({ where: { id: memberId }, select: { isAdmin: true } }),
  ]);
  return !!membership || !!me?.isAdmin;
}

async function getOrCreateKit(projectId: string, memberId: string) {
  const existing = await prisma.projectPressKit.findUnique({ where: { projectId } });
  if (existing) return existing;
  return prisma.projectPressKit.create({
    data: { projectId, createdById: memberId, config: DEFAULT_PRESS_KIT_CONFIG as unknown as Prisma.InputJsonValue },
  });
}

// GET /api/projects/:projectId/press-kit — fetch (lazily create) the kit
pressKitRouter.get("/projects/:projectId/press-kit", async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params as { projectId: string };
    if (!(await hasProjectAccess(req.memberId!, projectId))) { res.status(403).json({ error: "Forbidden" }); return; }
    const kit = await getOrCreateKit(projectId, req.memberId!);
    const token = await ensurePressKitToken(projectId);
    res.json({
      id: kit.id, projectId, status: kit.status, config: normalizePressKitConfig(kit.config),
      contentJson: kit.contentJson, generatedAt: kit.generatedAt, token,
    });
  } catch (e) { console.error("GET press-kit error:", e); res.status(500).json({ error: "Failed to load press kit" }); }
});

// POST /api/projects/:projectId/press-kit/generate — snapshot-then-replace
pressKitRouter.post("/projects/:projectId/press-kit/generate", async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params as { projectId: string };
    if (!(await hasProjectAccess(req.memberId!, projectId))) { res.status(403).json({ error: "Forbidden" }); return; }
    const kit = await getOrCreateKit(projectId, req.memberId!);
    const config = normalizePressKitConfig({ ...normalizePressKitConfig(kit.config), ...(req.body ?? {}) });

    // Snapshot the current doc before overwriting (if any real content exists).
    if (kit.contentJson) {
      await prisma.pressKitRevision.create({
        data: { pressKitId: kit.id, contentJson: kit.contentJson as Prisma.InputJsonValue, authorId: req.memberId! },
      });
    }

    const doc = await generatePressKitContent(projectId, config);
    if (!doc) { res.status(404).json({ error: "Project not found" }); return; }

    const updated = await prisma.projectPressKit.update({
      where: { id: kit.id },
      data: {
        contentJson: doc as unknown as Prisma.InputJsonValue,
        contentYjs: null,               // force collab to re-seed from the new contentJson
        config: config as unknown as Prisma.InputJsonValue,
        generatedAt: new Date(),
        status: "DRAFT",
      },
    });
    res.json({ id: updated.id, config, contentJson: updated.contentJson, generatedAt: updated.generatedAt, status: updated.status });
  } catch (e) { console.error("POST press-kit/generate error:", e); res.status(500).json({ error: "Failed to generate press kit" }); }
});

// PATCH /api/projects/:projectId/press-kit — update config only
pressKitRouter.patch("/projects/:projectId/press-kit", async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params as { projectId: string };
    if (!(await hasProjectAccess(req.memberId!, projectId))) { res.status(403).json({ error: "Forbidden" }); return; }
    const kit = await getOrCreateKit(projectId, req.memberId!);
    const config = normalizePressKitConfig({ ...normalizePressKitConfig(kit.config), ...(req.body ?? {}) });
    await prisma.projectPressKit.update({ where: { id: kit.id }, data: { config: config as unknown as Prisma.InputJsonValue } });
    res.json({ config });
  } catch (e) { console.error("PATCH press-kit error:", e); res.status(500).json({ error: "Failed to update press kit" }); }
});

// POST /api/projects/:projectId/press-kit/publish — snapshot rendered HTML, mark PUBLISHED
pressKitRouter.post("/projects/:projectId/press-kit/publish", async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params as { projectId: string };
    if (!(await hasProjectAccess(req.memberId!, projectId))) { res.status(403).json({ error: "Forbidden" }); return; }
    const kit = await prisma.projectPressKit.findUnique({ where: { projectId } });
    if (!kit || !kit.contentJson) { res.status(400).json({ error: "Nothing to publish — generate first" }); return; }
    const html = renderPressKitInnerHtml(kit.contentJson as unknown as PMDoc);
    await prisma.projectPressKit.update({ where: { id: kit.id }, data: { renderedHtml: html, status: "PUBLISHED" } });
    const token = await ensurePressKitToken(projectId);
    const url = `${req.protocol}://${req.get("host")}/api/public/press-kit/${projectId}/${token}`;
    res.json({ status: "PUBLISHED", token, url });
  } catch (e) { console.error("POST press-kit/publish error:", e); res.status(500).json({ error: "Failed to publish press kit" }); }
});

// GET revisions
pressKitRouter.get("/projects/:projectId/press-kit/revisions", async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params as { projectId: string };
    if (!(await hasProjectAccess(req.memberId!, projectId))) { res.status(403).json({ error: "Forbidden" }); return; }
    const kit = await prisma.projectPressKit.findUnique({ where: { projectId }, select: { id: true } });
    if (!kit) { res.json([]); return; }
    const revs = await prisma.pressKitRevision.findMany({
      where: { pressKitId: kit.id }, orderBy: { createdAt: "desc" }, take: 30,
      include: { author: { select: { displayName: true } } },
    });
    res.json(revs.map((r) => ({ id: r.id, createdAt: r.createdAt, author: r.author.displayName })));
  } catch (e) { console.error("GET press-kit/revisions error:", e); res.status(500).json({ error: "Failed to load revisions" }); }
});

// POST restore a revision (snapshots current first)
pressKitRouter.post("/projects/:projectId/press-kit/revisions/:revId/restore", async (req: Request, res: Response) => {
  try {
    const { projectId, revId } = req.params as { projectId: string; revId: string };
    if (!(await hasProjectAccess(req.memberId!, projectId))) { res.status(403).json({ error: "Forbidden" }); return; }
    const kit = await prisma.projectPressKit.findUnique({ where: { projectId } });
    const rev = await prisma.pressKitRevision.findUnique({ where: { id: revId } });
    if (!kit || !rev || rev.pressKitId !== kit.id) { res.status(404).json({ error: "Revision not found" }); return; }
    if (kit.contentJson) {
      await prisma.pressKitRevision.create({
        data: { pressKitId: kit.id, contentJson: kit.contentJson as Prisma.InputJsonValue, authorId: req.memberId! },
      });
    }
    const updated = await prisma.projectPressKit.update({
      where: { id: kit.id },
      data: { contentJson: rev.contentJson as Prisma.InputJsonValue, contentYjs: null, status: "DRAFT" },
    });
    res.json({ contentJson: updated.contentJson });
  } catch (e) { console.error("POST press-kit restore error:", e); res.status(500).json({ error: "Failed to restore revision" }); }
});
```

- [ ] **Step 2: Mount the router** in `backend/src/app.ts`. Add the import near the other route imports (~line 27):

```ts
import { pressKitRouter } from "./api/pressKit.js";
```

And mount it under `/api` alongside the other bare-`/api` routers (after `app.use("/api/outreach", outreachRouter);`, ~line 131):

```ts
app.use("/api", pressKitRouter);
```

> **Why bare `/api` works** for `/api/projects/:projectId/press-kit`: this mirrors `blockersRouter` (mounted at bare `/api`, line ~115, and serving `/api/projects/:projectId/blockers`). `projectsRouter` at `/api/projects` has no matching route for `/:projectId/press-kit`, so Express falls through to `pressKitRouter`. Mount it **after** `projectsRouter`.

- [ ] **Step 3: Typecheck.**

Run: `cd backend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit.**

```bash
git add backend/src/api/pressKit.ts backend/src/app.ts
git commit -m "feat(presskit): REST router (get/generate/patch/publish/revisions)"
```

### Task 3.2: Client fetch helpers

**Files:**
- Modify: `src/api/clubPmClient.js` (add near the blog helpers ~408 and the `getBlogCollabWsUrl` ~416)

- [ ] **Step 1: Add helpers** to `src/api/clubPmClient.js`:

```js
// ── Press Kit ────────────────────────────────────────────────
export const getPressKit            = (projectId)         => get(`/api/projects/${projectId}/press-kit`);
export const generatePressKit       = (projectId, config) => post(`/api/projects/${projectId}/press-kit/generate`, config);
export const updatePressKitConfig   = (projectId, config) => patch(`/api/projects/${projectId}/press-kit`, config);
export const publishPressKit        = (projectId)         => post(`/api/projects/${projectId}/press-kit/publish`, {});
export const getPressKitRevisions   = (projectId)         => get(`/api/projects/${projectId}/press-kit/revisions`);
export const restorePressKitRevision = (projectId, revId) => post(`/api/projects/${projectId}/press-kit/revisions/${revId}/restore`, {});

// ws(s):// base for the press-kit Hocuspocus namespace (backend/src/collab/pressKitCollab.ts).
export function getPressKitCollabWsUrl() {
  const origin = BASE_URL || window.location.origin;
  return `${origin.replace(/^http/, 'ws')}/collab/presskit`;
}
```

- [ ] **Step 2: Build the frontend.**

Run (repo root): `npm run build`
Expected: "Compiled successfully" (or only pre-existing warnings).

- [ ] **Step 3: Commit.**

```bash
git add src/api/clubPmClient.js
git commit -m "feat(presskit): client fetch + collab-ws helpers"
```

---

## Phase 4 — Collab namespace + editor prop

### Task 4.1: Press-kit Hocuspocus namespace

**Files:**
- Create: `backend/src/collab/pressKitCollab.ts`
- Modify: `backend/src/app.ts` (import + attach)

- [ ] **Step 1: Create `backend/src/collab/pressKitCollab.ts`** (mirrors `blogCollab.ts`, keyed on `ProjectPressKit.id`, access = project membership/admin):

```ts
import type { Server as HttpServer, IncomingMessage } from "node:http";
import { WebSocketServer } from "ws";
import { Hocuspocus, type onAuthenticatePayload, type onLoadDocumentPayload, type onStoreDocumentPayload } from "@hocuspocus/server";
import * as Y from "yjs";
import { TiptapTransformer } from "@hocuspocus/transformer";
import { prisma } from "../db/prisma.js";
import { verifyBearerToken } from "../api/auth.js";
import type { PMDoc } from "../services/blogRender.js";
import type { Prisma } from "@prisma/client";
import { blogCollabExtensions } from "./blogSchema.js";

const COLLAB_PATH_PREFIX = "/collab/presskit";
const YJS_FIELD = "default";

async function canAccessPressKit(memberId: string, pressKitId: string): Promise<boolean> {
  const kit = await prisma.projectPressKit.findUnique({ where: { id: pressKitId }, select: { projectId: true } });
  if (!kit) return false;
  const [membership, me] = await Promise.all([
    prisma.projectMember.findUnique({ where: { projectId_memberId: { projectId: kit.projectId, memberId } }, select: { memberId: true } }),
    prisma.member.findUnique({ where: { id: memberId }, select: { isAdmin: true } }),
  ]);
  return !!membership || !!me?.isAdmin;
}

const transformer = TiptapTransformer.extensions(blogCollabExtensions());

const hocuspocus = new Hocuspocus({
  async onAuthenticate({ token, documentName }: onAuthenticatePayload) {
    if (!token) throw new Error("Not authenticated");
    const memberId = await verifyBearerToken(token);
    if (!memberId) throw new Error("Not authenticated");
    if (!(await canAccessPressKit(memberId, documentName))) throw new Error("Forbidden");
    return { memberId };
  },

  async onLoadDocument({ documentName, document }: onLoadDocumentPayload) {
    const kit = await prisma.projectPressKit.findUnique({
      where: { id: documentName }, select: { contentYjs: true, contentJson: true },
    });
    if (!kit) return document;
    if (kit.contentYjs && kit.contentYjs.length > 0) {
      Y.applyUpdate(document, new Uint8Array(kit.contentYjs));
    } else if (kit.contentJson) {
      const seed = transformer.toYdoc(kit.contentJson as unknown as PMDoc, YJS_FIELD);
      Y.applyUpdate(document, Y.encodeStateAsUpdate(seed));
    }
    return document;
  },

  async onStoreDocument({ documentName, document }: onStoreDocumentPayload) {
    const update = Y.encodeStateAsUpdate(document);
    const json = transformer.fromYdoc(document, YJS_FIELD) as unknown as PMDoc;
    await prisma.projectPressKit.update({
      where: { id: documentName },
      data: { contentYjs: Buffer.from(update), contentJson: json as unknown as Prisma.InputJsonValue },
    });
  },
});

export function attachPressKitCollab(httpServer: HttpServer): void {
  const wss = new WebSocketServer({ noServer: true });
  httpServer.on("upgrade", (request: IncomingMessage, socket, head) => {
    const url = request.url ?? "";
    if (!url.startsWith(COLLAB_PATH_PREFIX)) return;
    wss.handleUpgrade(request, socket, head, (ws) => {
      hocuspocus.handleConnection(ws, request as unknown as Request);
    });
  });
}
```

> **Note:** `app.ts` already registers a `server.on("upgrade", …)` for `/collab/blog`. Two independent `upgrade` listeners are fine — each early-returns for paths it doesn't own, so blog and press-kit upgrades don't collide.

- [ ] **Step 2: Attach in `backend/src/app.ts`.** Add the import near `attachBlogCollab` (~line 51):

```ts
import { attachPressKitCollab } from "./collab/pressKitCollab.js";
```

And after the `attachBlogCollab(server)` line (~192):

```ts
    attachPressKitCollab(server);
    console.log("🤝 Press kit collab (Hocuspocus) attached at /collab/presskit");
```

- [ ] **Step 3: Typecheck.**

Run: `cd backend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit.**

```bash
git add backend/src/collab/pressKitCollab.ts backend/src/app.ts
git commit -m "feat(presskit): Hocuspocus collab namespace at /collab/presskit"
```

### Task 4.2: BlogEditor `collabWsUrl` prop

**Files:**
- Modify: `src/components/clubpm/blog/BlogEditor.jsx` (~266-292)

- [ ] **Step 1: Thread the prop through.** Change the component signature (~266) to accept `collabWsUrl`:

```jsx
export default function BlogEditor({ content, onChange, editable = true, onEditorReady, postId, collabUser, collabWsUrl }) {
```

- [ ] **Step 2: Use it in the provider.** In the `collab` `useMemo` (~281-292), replace the `url:` line so it defaults to the blog URL:

```jsx
  const collab = useMemo(() => {
    if (!postId) return null;
    const document = new Y.Doc();
    const provider = new HocuspocusProvider({
      url: collabWsUrl || getBlogCollabWsUrl(),
      name: postId,
      document,
      token: () => getStoredToken() ?? '',
    });
    return { document, provider };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId, collabWsUrl]);
```

- [ ] **Step 3: Build.**

Run (repo root): `npm run build`
Expected: "Compiled successfully". (Blog editor behavior is unchanged — `collabWsUrl` is undefined for blog callers, so it falls back to `getBlogCollabWsUrl()`.)

- [ ] **Step 4: Commit.**

```bash
git add src/components/clubpm/blog/BlogEditor.jsx
git commit -m "feat(presskit): BlogEditor accepts optional collabWsUrl"
```

---

## Phase 5 — Reports sub-tabs + Press Kit panel

### Task 5.1: PressKitPanel component

**Files:**
- Create: `src/components/clubpm/PressKitPanel.jsx`

- [ ] **Step 1: Create `src/components/clubpm/PressKitPanel.jsx`:**

```jsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import toast from 'react-hot-toast';
import BlogEditor from './blog/BlogEditor';
import OrbitLoader from '../OrbitLoader';
import { useClubPmAuth } from '../../clubpm/ClubPmAuth';
import {
  getPressKit, generatePressKit, updatePressKitConfig, publishPressKit,
  getPressKitRevisions, restorePressKitRevision, getPressKitCollabWsUrl,
} from '../../api/clubPmClient';

const AUDIENCES = [
  { id: 'SPONSORS', label: 'Sponsors' }, { id: 'PRESS', label: 'Press' },
  { id: 'RECRUITING', label: 'Recruiting' }, { id: 'GENERAL', label: 'General' },
];
const SECTIONS = [
  ['masthead', 'Masthead'], ['about', 'About project'], ['aboutSearch', 'About SEARCH'],
  ['stats', 'By the numbers'], ['building', "What we're building"], ['timeline', 'Timeline'],
  ['tech', 'Tech & tools'], ['team', 'Team'], ['highlights', 'Highlights'],
  ['links', 'Links'], ['contact', 'Contact'], ['sponsorship', 'Sponsorship (Sponsors only)'],
];

export default function PressKitPanel({ project, canEdit }) {
  const { member } = useClubPmAuth();
  const projectId = project.id;

  const [kit, setKit] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [config, setConfig] = useState(null);
  const [revisions, setRevisions] = useState([]);
  const [showRevs, setShowRevs] = useState(false);
  const editorRef = useRef(null);
  // Bumped after generate/restore to force a fresh editor mount (new Yjs doc).
  const [editorNonce, setEditorNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getPressKit(projectId)
      .then((k) => { if (!cancelled) { setKit(k); setConfig(k.config); } })
      .catch(() => { if (!cancelled) toast.error('Could not load press kit'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [projectId]);

  const hasDoc = !!kit?.contentJson || (kit?.generatedAt != null);

  const handleGenerate = useCallback(async () => {
    setBusy(true);
    try {
      const updated = await generatePressKit(projectId, config);
      setKit((prev) => ({ ...prev, ...updated }));
      setConfig(updated.config);
      setEditorNonce((n) => n + 1);
      setShowSettings(false);
      toast.success('Press kit generated');
    } catch (e) { toast.error(e.message ?? 'Generation failed'); }
    finally { setBusy(false); }
  }, [projectId, config]);

  const handleSaveConfig = useCallback(async () => {
    try { const r = await updatePressKitConfig(projectId, config); setConfig(r.config); toast.success('Settings saved'); }
    catch { toast.error('Could not save settings'); }
  }, [projectId, config]);

  const handlePublish = useCallback(async () => {
    setBusy(true);
    try {
      const r = await publishPressKit(projectId); // { status, token, url }
      await navigator.clipboard.writeText(r.url).catch(() => {});
      window.open(r.url, '_blank', 'noopener');
      setKit((prev) => ({ ...prev, status: 'PUBLISHED' }));
      toast.success('Published — public link copied');
    } catch (e) { toast.error(e.message ?? 'Publish failed'); }
    finally { setBusy(false); }
  }, [projectId]);

  const openRevisions = useCallback(async () => {
    try { setRevisions(await getPressKitRevisions(projectId)); setShowRevs(true); }
    catch { toast.error('Could not load revisions'); }
  }, [projectId]);

  const handleRestore = useCallback(async (revId) => {
    if (!window.confirm('Restore this version? The current content is snapshotted first.')) return;
    setBusy(true);
    try {
      const r = await restorePressKitRevision(projectId, revId);
      setKit((prev) => ({ ...prev, contentJson: r.contentJson }));
      setEditorNonce((n) => n + 1);
      setShowRevs(false);
      toast.success('Version restored');
    } catch { toast.error('Restore failed'); }
    finally { setBusy(false); }
  }, [projectId]);

  if (loading) return <div style={{ padding: 48, display: 'grid', placeItems: 'center' }}><OrbitLoader /></div>;

  const toggleSection = (id) => setConfig((c) => ({
    ...c,
    includedSections: c.includedSections.includes(id)
      ? c.includedSections.filter((s) => s !== id)
      : [...c.includedSections, id],
  }));

  // ── Empty state / generate panel ──
  if (!hasDoc || showSettings) {
    return (
      <div className="presskit-panel">
        <div className="presskit-generate-card">
          <h3 className="presskit-generate-title">{hasDoc ? 'Press Kit Settings' : 'Generate Press Kit'}</h3>
          <p className="presskit-generate-sub">Pick an audience and the sections to include, then generate a first draft you can edit.</p>

          <label className="presskit-field-label">Audience</label>
          <div className="presskit-audience-row">
            {AUDIENCES.map((a) => (
              <button key={a.id} type="button"
                className={`presskit-chip${config.audience === a.id ? ' is-active' : ''}`}
                onClick={() => setConfig((c) => ({ ...c, audience: a.id }))}>{a.label}</button>
            ))}
          </div>

          <label className="presskit-field-label">Sections</label>
          <div className="presskit-sections-grid">
            {SECTIONS.map(([id, label]) => (
              <label key={id} className="presskit-section-toggle">
                <input type="checkbox" checked={config.includedSections.includes(id)} onChange={() => toggleSection(id)} />
                {label}
              </label>
            ))}
          </div>

          <div className="presskit-settings-row">
            <label className="presskit-field-label">Accent
              <input type="color" value={config.accentColor}
                onChange={(e) => setConfig((c) => ({ ...c, accentColor: e.target.value }))} />
            </label>
            <label className="presskit-field-label">Contact email
              <input type="email" value={config.contactEmail} placeholder="leads@…"
                onChange={(e) => setConfig((c) => ({ ...c, contactEmail: e.target.value }))} />
            </label>
          </div>

          <div className="presskit-generate-actions">
            {hasDoc && <button type="button" className="clubpm-btn-secondary" onClick={() => setShowSettings(false)} disabled={busy}>Cancel</button>}
            {hasDoc && <button type="button" className="clubpm-btn-secondary" onClick={handleSaveConfig} disabled={busy}>Save settings</button>}
            <button type="button" className="clubpm-btn-primary" onClick={handleGenerate} disabled={busy || !canEdit}>
              {busy ? 'Generating…' : hasDoc ? 'Regenerate (replaces content)' : 'Generate'}
            </button>
          </div>
          {!canEdit && <p className="presskit-generate-sub" style={{ marginTop: 8 }}>You have view-only access to this project.</p>}
        </div>
      </div>
    );
  }

  // ── Editor state ──
  return (
    <div className="presskit-panel">
      <div className="presskit-toolbar">
        <span className={`cpm-blog-status cpm-blog-status--${(kit.status ?? 'draft').toLowerCase()}`}>{kit.status ?? 'DRAFT'}</span>
        <div className="presskit-toolbar-spacer" />
        <button type="button" className="clubpm-btn-secondary" onClick={openRevisions} disabled={busy}>History</button>
        <button type="button" className="clubpm-btn-secondary" onClick={() => setShowSettings(true)} disabled={busy}>Settings</button>
        <button type="button" className="clubpm-btn-secondary" onClick={handleGenerate} disabled={busy || !canEdit}
          title="Regenerate from current data (snapshots the current version first)">Regenerate</button>
        <button type="button" className="clubpm-btn-primary" onClick={handlePublish} disabled={busy || !canEdit}>Publish &amp; share</button>
      </div>

      <div className="presskit-editor-wrap">
        <BlogEditor
          key={`${kit.id}:${editorNonce}`}
          postId={kit.id}
          collabWsUrl={getPressKitCollabWsUrl()}
          collabUser={{ id: member?.id, name: member?.displayName }}
          editable={canEdit}
          onEditorReady={(ed) => { editorRef.current = ed; }}
        />
      </div>

      {showRevs && (
        <div className="presskit-revs-drawer">
          <div className="presskit-revs-header">
            <span>Version history</span>
            <button type="button" className="cpm-blog-tb-btn" onClick={() => setShowRevs(false)}><i className="fas fa-xmark" /></button>
          </div>
          {revisions.length === 0 && <p className="presskit-generate-sub">No earlier versions yet.</p>}
          {revisions.map((r) => (
            <div key={r.id} className="presskit-rev-row">
              <span>{new Date(r.createdAt).toLocaleString()}</span>
              <span className="presskit-rev-author">{r.author}</span>
              <button type="button" className="clubpm-btn-secondary" onClick={() => handleRestore(r.id)} disabled={busy || !canEdit}>Restore</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Build.**

Run (repo root): `npm run build`
Expected: "Compiled successfully" (unused-var warnings from `editorRef` are acceptable, but prefer none).

- [ ] **Step 3: Commit.**

```bash
git add src/components/clubpm/PressKitPanel.jsx
git commit -m "feat(presskit): PressKitPanel (generate/config/editor/publish/history)"
```

### Task 5.2: Reports sub-tabs + remove hero PDF button

**Files:**
- Modify: `src/pages/ClubPM/ProjectDetail.jsx` (import ~13-15; hero button ~3131-3145; reports tab ~3475-3479)

- [ ] **Step 1: Import the panel.** Near the other imports (~15, after `ProjectAnalytics`):

```jsx
import PressKitPanel from "../../components/clubpm/PressKitPanel";
```

- [ ] **Step 2: Add reports sub-tab state.** Find where the component's other `useState` hooks live (near `const [sortBy, setSortBy] = useState(...)` or similar top-of-component state) and add:

```jsx
  const [reportTab, setReportTab] = useState("charts"); // "charts" | "activity" | "presskit"
```

- [ ] **Step 3: Replace the reports tab body** (~3475-3479). Change:

```jsx
          {activeTab === "reports" && (
            <div className="cpm-proj-main-body" style={{ padding: "24px" }}>
              <ProjectAnalytics project={project} />
            </div>
          )}
```

to:

```jsx
          {activeTab === "reports" && (
            <div className="cpm-proj-main-body" style={{ padding: "16px 24px 24px" }}>
              <div className="presskit-report-subtabs">
                {[["charts", "Charts"], ["activity", "Activity"], ["presskit", "Press Kit"]].map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    className={`presskit-subtab${reportTab === id ? " is-active" : ""}`}
                    onClick={() => setReportTab(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {reportTab === "charts" && <ProjectAnalytics project={project} />}
              {reportTab === "activity" && (
                <div style={{ paddingTop: 8 }}><ActivityFeed projectId={project.id} /></div>
              )}
              {reportTab === "presskit" && <PressKitPanel project={project} canEdit={canEdit} />}
            </div>
          )}
```

- [ ] **Step 4: Remove the hero PDF button** (~3131-3145). Delete the entire `<button className="pm-pin-btn" title="Generate Press Kit …">…</button>` block (the one wrapping the `fa-file-pdf` icon). Leave the pin button that follows it intact. (`ActivityFeed` is already imported at line 13, so no import churn is needed for it.)

- [ ] **Step 5: Build.**

Run (repo root): `npm run build`
Expected: "Compiled successfully".

- [ ] **Step 6: Commit.**

```bash
git add src/pages/ClubPM/ProjectDetail.jsx
git commit -m "feat(presskit): Reports sub-tabs (Charts/Activity/Press Kit); drop hero PDF button"
```

---

## Phase 6 — Styling + final verification

### Task 6.1: Press-kit CSS

**Files:**
- Modify: `public/search-theme.css` (append at end)

- [ ] **Step 1: Append styles** to the bottom of `public/search-theme.css`:

```css
/* === PRESS KIT (ClubPM Reports sub-tab) ============================== */
.presskit-report-subtabs { display: flex; gap: 4px; margin-bottom: 12px; border-bottom: 1px solid var(--pm-border); }
.presskit-subtab {
  background: none; border: none; cursor: pointer; padding: 8px 14px;
  font-size: 13px; font-weight: 600; color: var(--pm-text-muted);
  border-bottom: 2px solid transparent; margin-bottom: -1px;
}
.presskit-subtab:hover { color: var(--pm-text-secondary); }
.presskit-subtab.is-active { color: var(--pm-accent-teal); border-bottom-color: var(--pm-accent-teal); }

.presskit-panel { position: relative; }
.presskit-generate-card {
  max-width: 640px; margin: 8px auto; padding: 24px;
  background: var(--pm-surface); border: 1px solid var(--pm-border); border-radius: 12px;
}
.presskit-generate-title { font-family: var(--pm-font-display); font-size: 20px; margin: 0 0 4px; color: var(--pm-text-primary); }
.presskit-generate-sub { font-size: 13px; color: var(--pm-text-muted); margin: 0 0 16px; }
.presskit-field-label { display: block; font-size: 12px; font-weight: 600; color: var(--pm-text-secondary); margin: 14px 0 6px; }
.presskit-audience-row { display: flex; flex-wrap: wrap; gap: 8px; }
.presskit-chip {
  padding: 6px 14px; border-radius: 999px; border: 1px solid var(--pm-border);
  background: var(--pm-bg-overlay); color: var(--pm-text-secondary); font-size: 13px; cursor: pointer;
}
.presskit-chip.is-active { background: var(--pm-accent-teal); color: #04211d; border-color: var(--pm-accent-teal); font-weight: 600; }
.presskit-sections-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 8px; }
.presskit-section-toggle { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--pm-text-secondary); cursor: pointer; }
.presskit-settings-row { display: flex; gap: 24px; flex-wrap: wrap; }
.presskit-settings-row input[type="email"] { width: 220px; padding: 6px 8px; border-radius: 6px; border: 1px solid var(--pm-border); background: var(--pm-bg-overlay); color: var(--pm-text-primary); }
.presskit-generate-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 22px; }

.presskit-toolbar { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
.presskit-toolbar-spacer { flex: 1; }
.presskit-editor-wrap { border: 1px solid var(--pm-border); border-radius: 10px; overflow: hidden; }

.presskit-revs-drawer {
  position: absolute; top: 44px; right: 0; width: 320px; max-height: 60vh; overflow-y: auto;
  background: var(--pm-elevated); border: 1px solid var(--pm-border); border-radius: 10px;
  box-shadow: 0 12px 40px rgba(0,0,0,0.4); padding: 12px; z-index: 20;
}
.presskit-revs-header { display: flex; justify-content: space-between; align-items: center; font-weight: 600; font-size: 13px; margin-bottom: 8px; color: var(--pm-text-primary); }
.presskit-rev-row { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--pm-text-secondary); padding: 6px 0; border-top: 1px solid var(--pm-border); }
.presskit-rev-author { flex: 1; color: var(--pm-text-muted); }
```

- [ ] **Step 2: Build.**

Run (repo root): `npm run build`
Expected: "Compiled successfully".

- [ ] **Step 3: Commit.**

```bash
git add public/search-theme.css
git commit -m "feat(presskit): styles for generate panel, sub-tabs, editor, history"
```

### Task 6.2: Full-stack verification

- [ ] **Step 1: Backend typecheck + pure tests.**

Run: `cd backend && npx tsc --noEmit && npx tsx src/services/pressKitService.test.ts`
Expected: no TS errors; `N passed, 0 failed`.

- [ ] **Step 2: Frontend build.**

Run (repo root): `npm run build`
Expected: "Compiled successfully".

- [ ] **Step 3: Manual smoke test** (requires the backend running with a DB + `GEMINI_API_KEY`, and the dev frontend). Confirm each:
  - Open a project → **Reports** tab shows **Charts · Activity · Press Kit** sub-tabs. Charts renders analytics; Activity renders the feed for the project.
  - **Press Kit** empty state shows the generate panel. Pick audience **Sponsors**, toggle a couple of sections, set contact email, click **Generate** → editor appears with seeded content; a **Support This Project** section is present; no imagery grid.
  - Edit text; open the same project's press kit in a second browser/tab → presence cursors appear and edits converge (collab works).
  - **Regenerate** → confirm the prior version appears under **History**; **Restore** brings it back.
  - **Publish & share** → a public URL opens; browser print preview (Ctrl/Cmd+P) shows a clean one-column document with the accent color; the URL is copied to clipboard.
  - Old hero PDF button is gone; press kits do **not** appear in the public blog feed.

- [ ] **Step 4: Final commit (if any manual-fix tweaks were needed).**

```bash
git add -A
git commit -m "chore(presskit): verification fixes"
```

---

## Notes & known limitations

- **Regenerate/restore vs. live collab:** setting `contentYjs = null` plus remounting `BlogEditor` (via `editorNonce` in the key) makes a single editor reload from the new `contentJson`. If multiple editors are connected at the exact moment of regenerate, other clients keep their in-memory Yjs doc until they reconnect; they should refresh. This is acceptable for a rare admin action — do not attempt live multi-client doc replacement in this plan.
- **AI failure is non-fatal:** `generatePressKitSections` returns empty strings on any error/missing key, so generation still produces the programmatic sections (stats, timeline, team, links).
- **Access model:** any project member (or admin) can edit/generate/publish; the public URL is token-gated and unauthenticated. Tighten to leads-only later if desired by swapping `hasProjectAccess` for a lead check.
- **Migration:** deploy auto-runs `prisma migrate` (per the meeting-scheduler precedent). Locally, `prisma migrate dev` needs a reachable DB.
```
