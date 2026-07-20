# Press Kit Editor — Design Spec

- **Date:** 2026-07-20
- **Status:** Approved (design); ready for implementation planning
- **Area:** ClubPM (frontend `src/pages/ClubPM/`, `src/components/clubpm/`; backend `backend/src/`)
- **Model for implementation:** Opus (multi-file frontend + backend feature, per CLAUDE.md)

## Overview

Replace the current auto-generated, static press-kit PDF with a **collaboratively-editable,
configurable press-kit document** — one per project. A "Generate" step seeds a single rich-text
document from live project data plus an AI pass (honoring a chosen audience and section toggles),
then the user edits it exactly like a blog post, with real-time co-editing. The finished document
is served at the existing public tokenized URL and printed to PDF via the browser.

### Goals

- Turn the press kit into an **editable document** the team can polish, not a fixed generated page.
- Add a **configuration UI**: choose audience, toggle which sections are included, set accent color
  and contact email — applied at generation time.
- **Add substantially more information** (stats/by-the-numbers, tech & tools, links, sponsorship ask,
  richer team + timeline).
- **Remove the AI imagery grid** (the section that auto-pulls OutreachHub image assets).
- **Reuse the existing blog editor stack** (TipTap + Yjs/Hocuspocus collab, server-side renderer)
  rather than build a new editor.

### Non-goals

- No new image-generation or auto-imagery. Users insert their own images via the editor image tool.
- No downloadable "media kit" (logo/asset bundle) — manual image insertion in the editor is enough.
- Press kits do **not** enter the public blog feed / RSS / taxonomy. They are project artifacts,
  reached only via the project or their tokenized public URL.
- No club-wide central "About Purdue SEARCH" setting — the boilerplate is **seeded per kit** (a default
  paragraph written into each document at generation time, then freely editable).
- No structured "always-live" data sections after generation — this is the blog-style single-document
  model: live data is captured into the doc at generation time, then freely edited (re-run "Generate"
  to refresh from live data).

## Current state (what exists today)

- `src/pages/ClubPM/ProjectDetail.jsx` (~line 3131): a PDF button in the project hero calls
  `POST /api/outreach/press-kit/:projectId`, which mints/returns a token and opens the public URL.
- `backend/src/api/outreach.ts` (~line 1405): `POST /press-kit/:projectId` → `ensurePressKitToken`.
- `backend/src/api/public.ts` (~line 389): `GET /public/press-kit/:projectId/:token` → `buildPressKitHtml`.
- `backend/src/services/pressKitService.ts`: builds a self-contained print-styled HTML document live
  from project data, including an **"Imagery"** grid of up to 4 `outreachAsset` IMAGE rows (the section
  being removed) and an AI synopsis via `generatePressKitSynopsis` (`aiService.ts`).
- `Project.pressKitToken` exists on the schema; there is **no** stored press-kit content or config today.

## User flow

The press kit lives **inside the project's existing "Reports" tab**, which gains an internal sub-tab bar:
**Charts · Activity · Press Kit**. (Charts = the current `ProjectAnalytics`; Activity = the
`ActivityFeed`, previously imported but unrendered; Press Kit = the new panel.) No new top-level route.

1. Open a project → **Reports** tab → **Press Kit** sub-tab.
2. **No document yet** → a **Generate panel** shows: Audience (Sponsors / Press / Recruiting / General),
   section include/exclude toggles, accent color, contact email. Click **Generate**.
3. Backend assembles live data + AI prose → seeds the TipTap document → user lands in the editor.
4. **Edit freely**: full blog toolbar (headings, images, tables, callouts, links, embeds), **real-time
   co-editing** with presence cursors, autosaved via Yjs collab.
5. **Preview** (renders exactly as the public page) → **Publish/Share**: writes `renderedHtml`, exposes
   the public tokenized URL and the "Ctrl/Cmd+P → save PDF" affordance.
6. **Regenerate** (behind a confirm): **snapshot-then-replace** — snapshots the current doc to a
   `PressKitRevision`, then overwrites content from a fresh Generate. Nothing is lost; restore via
   revision history.

## Content template (the generated document)

Seeded as editable prose + programmatic tables. Audience-aware; each section toggleable. Live data is
pulled at generation time.

| Section | Source | Notes |
|---|---|---|
| Masthead | project name, tagline, program tag, status, date | |
| About this project | AI synopsis (Gemini) | expanded from today's 2–3 sentences into a fuller overview |
| About Purdue SEARCH | boilerplate (editable default) | standard org paragraph press expects |
| By the numbers | live: team size, tasks done/total, milestones hit, **hours logged (`TimeLog`)**, project duration | stat callouts — new info |
| What we're building | AI-summarized subsystems from tasks + tags | replaces the raw task-by-status dump |
| Timeline & milestones | completed milestones + dates, target date | |
| Tech & tools | project tags + linked GitHub repo(s) | new info |
| Team & leadership | roster w/ leads highlighted, titles, avatars | |
| Highlights | notable completed milestones/tasks | |
| Links | GitHub, Drive, program page, club site | new info |
| Contact | configurable (defaults to a lead's email) | |
| Sponsorship ask | **Sponsors audience only** — impact + how to support | new info |

**Removed:** the "Imagery" grid (auto-pulled `outreachAsset` IMAGE rows) and the raw
"Tasks grouped by status" wall (superseded by the AI "What we're building" summary).

**Generation mechanics:** AI returns **markdown** → `markdownToTiptapJson()` (in `blogRender.ts`) →
TipTap `contentJson`. Factual tables (by-the-numbers, team, links) are assembled programmatically as
markdown before conversion so they never depend on the model. Audience selection changes which sections
seed and the tone/emphasis of the AI prose.

## Data model (Prisma — `backend/prisma/schema.prisma`)

New models parallel to `BlogPost` / `BlogRevision`:

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
  renderedHtml String?        // HTML snapshot written on publish (served to public)
  config       Json           // { audience, includedSections[], accentColor, contactEmail, showContact }
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

- `Project.pressKitToken` **stays** as the public URL key. Add a `pressKit ProjectPressKit?` back-relation
  on `Project` and the two `Member` back-relations for the new relations.
- Deploy runs migrations automatically (see prior meeting-scheduler feature); a normal
  `prisma migrate` is required.

## Backend

Follow the `req.memberId` convention (never `req.session.memberId`).

- **`backend/src/collab/pressKitCollab.ts`** (new) — clone of `blogCollab.ts`:
  - Path prefix `/collab/presskit`; `YJS_FIELD = "default"`; reuse `blogCollabExtensions()` transformer
    (same node schema).
  - `onAuthenticate` → verify bearer token → **project access check** (project member, lead, or admin).
  - `onLoadDocument` → load `ProjectPressKit.contentYjs`, else seed from `contentJson`.
  - `onStoreDocument` → persist `contentYjs` + `contentJson`.
  - Export `attachPressKitCollab(server)`; call it beside `attachBlogCollab(server)` in `app.ts` (~line 192).
- **`backend/src/services/pressKitService.ts`** (rewrite):
  - `generatePressKitContent(projectId, config)` → builds the live-data context, calls AI for prose,
    assembles the markdown, returns TipTap JSON (via `markdownToTiptapJson`).
  - `buildPressKitHtml(projectId)` → render stored `contentJson` with `renderJsonToHtml` (from
    `blogRender.ts`) wrapped in the existing print-styled shell (keep the print CSS; **drop the imagery
    grid and the live task/milestone queries** now that content is stored).
  - Keep `ensurePressKitToken`.
- **`backend/src/api/pressKit.ts`** (new router; mount under `/api`) — or extend `outreach.ts`:
  - `GET  /projects/:projectId/press-kit` — fetch kit + config (creates an empty DRAFT record lazily).
  - `POST /projects/:projectId/press-kit/generate` — create/regenerate; **snapshot current doc to a
    `PressKitRevision` first**, then overwrite `contentJson` (+ reset Yjs state) from `generatePressKitContent`.
  - `PATCH /projects/:projectId/press-kit` — update `config` (audience, toggles, accent, contact).
  - `POST /projects/:projectId/press-kit/publish` — render + store `renderedHtml`, set `status=PUBLISHED`,
    ensure token.
  - `GET  /projects/:projectId/press-kit/revisions` + `POST .../revisions/:id/restore`.
  - All mutating routes gated to project lead/admin.
- **`backend/src/api/public.ts`** — `GET /public/press-kit/:projectId/:token` serves the stored
  `renderedHtml` (fallback: render `contentJson` live) inside the print shell.
- **`backend/src/services/aiService.ts`** — fold `generatePressKitSynopsis` into a richer
  `generatePressKitSections(context, audience)` returning audience-tuned markdown for the prose sections.

## Frontend

- **`src/components/clubpm/PressKitPanel.jsx`** (new) — the embedded Press Kit sub-tab (borrows
  `BlogEditorPage.jsx`'s load/save/preview/regenerate logic, but is a panel, not a route):
  - Toolbar: status/save-state, **Preview** (reuses `editor.getHTML()` like the blog preview),
    **Revision history** drawer, **Publish/Share** (copy public link), **Regenerate** (confirm).
  - Body: reused `<BlogEditor>` pointed at the press-kit collab WS via a new prop (below).
  - **Generate/Settings panel**: audience selector, section include/exclude toggles, accent color,
    contact email. Shown as the empty state and reopenable as settings.
- **`src/pages/ClubPM/ProjectDetail.jsx`** — reorganize the `reports` tab (~line 3475) into an internal
  sub-tab bar with local state (optionally synced to a `?report=` query param):
  `Charts` → existing `<ProjectAnalytics>`; `Activity` → `<ActivityFeed>` (already imported, currently
  unrendered); `Press Kit` → `<PressKitPanel>`. Also **remove the inline PDF-generate button** in the
  project hero (~line 3131) — press-kit access now lives entirely in the Reports sub-tab.
- **`src/components/clubpm/blog/BlogEditor.jsx`** — add an optional `collabWsUrl` prop
  (default: `getBlogCollabWsUrl()`); pass through to the `HocuspocusProvider`. No behavior change for blog.
- **`src/api/clubPmClient.js`** — add `getPressKitCollabWsUrl()` (mirrors `getBlogCollabWsUrl`, path
  `/collab/presskit`) and press-kit fetch helpers (`getPressKit`, `generatePressKit`, `updatePressKitConfig`,
  `publishPressKit`, revisions).
- **CSS** — append to `public/search-theme.css` with a `presskit-` prefix, reusing `cpm-blog-*` editor
  styles where possible.

No new top-level route is added (`src/App.js` is untouched) — the panel renders inside the existing
`/clubpm/projects/:id` reports tab.

## Reuse map (borrowed from the blog stack)

| Need | Reused artifact |
|---|---|
| Rich-text editor + toolbar | `src/components/clubpm/blog/BlogEditor.jsx` (+ `collabWsUrl` prop) |
| Collab server pattern | `backend/src/collab/blogCollab.ts` → `pressKitCollab.ts` |
| Server node schema for transformer | `backend/src/collab/blogSchema.ts` (`blogCollabExtensions`) |
| JSON → HTML render | `renderJsonToHtml` (`backend/src/services/blogRender.ts`) |
| Markdown → JSON seed | `markdownToTiptapJson` (`backend/src/services/blogRender.ts`) |
| Editor panel logic (load/save/preview/regenerate) | `src/pages/ClubPM/BlogEditorPage.jsx` |
| Revision history UI | `src/components/clubpm/blog/RevisionHistoryDrawer.jsx` |
| WS URL helper | `getBlogCollabWsUrl` (`src/api/clubPmClient.js`) |

## Permissions

- Generate / edit / config / publish: project **lead** or **admin** (mirror `ProjectDetail`'s `canEdit`).
- Collab `onAuthenticate`: bearer-verified member with project access (member/lead/admin).
- Public view: tokenized URL only; no auth.

## Regenerate behavior (resolved)

**Snapshot-then-replace.** "Generate" when a document already exists first writes a `PressKitRevision`
of the current `contentJson`, then overwrites content (and resets Yjs state so live editors reload the
new doc). Restore any prior version from the revision-history drawer.

## Phasing (high level — detailed plan via writing-plans)

Each phase ends green on `npm run build` (repo root) and `npx tsc --noEmit` (backend/). Target ≤50 tool
calls / ≤4 files per phase.

1. **Schema + migration**: `ProjectPressKit`, `PressKitRevision`, `PressKitStatus`, relations.
2. **Generation + render service**: `generatePressKitContent`, `generatePressKitSections`, rewrite
   `buildPressKitHtml` (drop imagery grid), public route serves stored content.
3. **REST API**: `pressKit.ts` router (get/generate/patch/publish/revisions) + client helpers.
4. **Collab namespace**: `pressKitCollab.ts` + `attachPressKitCollab`; `BlogEditor` `collabWsUrl` prop.
5. **Reports sub-tabs + panel**: reorganize the reports tab into `Charts · Activity · Press Kit`;
   `PressKitPanel.jsx` + Generate/config UI; remove the hero PDF button.
6. **Polish**: CSS, revision drawer wiring, preview parity, audience-specific copy, empty/error states.

## Testing / verification

- Backend `npx tsc --noEmit` and frontend `npm run build` green after every phase.
- Manual: generate for each audience; toggle sections; co-edit in two tabs (presence + convergence);
  publish → open public URL → print preview; regenerate → confirm snapshot appears in revision history
  and restore works; verify no imagery grid renders.
- Confirm press kits never appear in the public blog feed.
