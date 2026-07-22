# Blog / Press Kit v2 — Design Spec

- **Date:** 2026-07-22
- **Status:** Approved (design); ready for implementation planning
- **Area:** ClubPM — frontend (`src/components/clubpm/blog/`, `src/pages/ClubPM/`, `src/pages/Blog*.jsx`) and backend (`backend/src/`)
- **Model for implementation:** Opus for the section-builder + multi-file phases (spans frontend + backend, 5+ files); Sonnet is fine for the contained phases (icons, delete, expand button).

## Overview

A reworked blog + press-kit system. Seven workstreams, sharing one editor stack (TipTap + Yjs/Hocuspocus collab + a server-side ProseMirror-JSON→HTML renderer). The centerpiece is a **Section Page Builder** that turns both blog posts and press kits from a single flowing document into a vertical stack of designed, full-width **sections** — Framer/Notion-like, but responsive and SEO-safe by construction. The rest are targeted fixes and additions: a Google-Drive image fix, delete affordances, press-kit exports, richer auto-generated press-kit content, an expand-to-blog availability fix, and a Font Awesome version fix.

### Goals

- Give blog posts and press kits real "designed page" capability via stacked, styleable sections and a per-post theme — **without** breaking real-time co-editing, mobile responsiveness, SEO, or the server-side renderer.
- Fix broken blog/press-kit images permanently (including already-published ones).
- Let users delete blog posts and press kits from the UI.
- Add downloadable press-kit exports: polished PDF, Word (`.docx`), and Markdown/HTML.
- Auto-generate substantially more press-kit content from live project data (tasks, dates, hours, milestones, GitHub, members).
- Make the existing "Expand to blog" action available on Approved and Published submissions everywhere.
- Fix the missing toolbar icons.

### Non-goals

- **No free-canvas / absolute-positioning editor.** Sections stack vertically; layout within a section is constrained (columns, media+text) so output stays responsive. (Considered and rejected as Direction C during brainstorming.)
- No change to the blog taxonomy/RSS/feed model. Press kits remain project artifacts, not blog-feed entries.
- No migration off Google Drive for image *storage* — only how images are *served* (proxy).
- No new realtime protocol — sections are ordinary TipTap nodes carried by the existing Yjs doc.

## Decisions locked during brainstorming

- **Design direction:** Section Page Builder (stacked designed sections), applied to **both** blog posts and press kits (shared editor).
- **Image fix:** backend image proxy.
- **Press-kit exports:** PDF (polished, server-rendered), Word `.docx`, and Markdown/HTML — all three.
- **PDF engine:** Puppeteer (headless Chrome) renders the print-shell HTML → PDF. Accepted as a heavy backend dependency. Fallback if it proves impractical to deploy: a one-click browser print-to-PDF (no new dep).
- **Icons:** upgrade the Font Awesome CDN link to v6 (with a site-wide `fa-*` verification pass), not a surgical rename.
- **Expand-to-blog:** small availability fix (button on Approved + Published submissions), not a new feature.

## Current state (verified in code)

- **Editor:** `src/components/clubpm/blog/BlogEditor.jsx` — TipTap; `blogExtensions(collab)` lists all node types; toolbar uses FA6 names. Used by both `BlogEditorPage.jsx` (blog) and `PressKitPanel.jsx` (press kit, via `collabWsUrl`).
- **Renderer:** `backend/src/services/blogRender.ts` — `renderJsonToHtml(doc)` walks PM JSON → HTML; `markdownToTiptapJson(md)` seeds docs from markdown. One `renderNode` branch per node type.
- **Collab schema mirror:** `backend/src/collab/blogSchema.ts` — `blogCollabExtensions()` mirrors the client node set for the Hocuspocus transformer; **must stay in sync** with `blogExtensions()`.
- **Images:** `POST /api/blog/upload` (`backend/src/api/blog.ts`) recompresses to webp and calls `uploadImageToDrive`, which returns `https://drive.google.com/uc?export=view&id=<id>` (`backend/src/services/driveService.ts:60`) — an endpoint Google no longer serves to `<img>`. This is the root cause of "links present but images blank."
- **Blog delete:** `DELETE /api/blog/posts/:id` exists (creator/admin) and `deleteBlogPost` client helper exists (`clubPmClient.js:384`), but **no UI** calls it.
- **Press kit:** `backend/src/api/pressKit.ts` has get/generate/patch/content/publish/revisions/restore — **no delete, no export**. Content rendered by `renderPressKitInnerHtml`; public view at `GET /api/public/press-kit/:projectId/:token`. `getOrCreateKit` upserts a row lazily.
- **Expand to blog:** `src/pages/ClubPM/OutreachHub.jsx` — `SubmissionCard` shows the button when `['APPROVED','PUBLISHED','IN_REVIEW'].includes(status) && submission.content` **and** an `onExpandBlog` prop is passed. At least one submission view renders the card without wiring `onExpandBlog`, so the button is missing there → `POST /api/outreach/submissions/:id/ai/expand-blog`.
- **Icons:** `public/index.html:95` loads Font Awesome **5.15.4**. ClubPM UI uses FA6 names (`fa-square-check`, `fa-magnifying-glass`, `fa-rotate-left/right`, `fa-bars-staggered`, `fa-photo-film`, `fa-users-viewfinder`, `fa-clock-rotate-left`, …), several FA6-only.

---

## Workstream 1 — Section Page Builder (blog + press kit)

### Node model (TipTap + `blogSchema.ts` + `blogRender.ts`, kept in sync)

New nodes, all `group: "block"` unless noted:

- **`section`** — top-level container. `content: "block+"` (holds any existing block nodes, including `column`). Attrs:
  - `layout`: `"single" | "mediaText" | "cols2" | "cols3"`
  - `background`: `{ kind: "none" | "color" | "image", value: string }` (value = hex or image URL)
  - `padding`: `"s" | "m" | "l" | "xl"` (default `"m"`)
  - `width`: `"contained" | "fullBleed"` (default `"contained"`)
  - `theme`: `"inherit" | "light" | "dark"` (default `"inherit"`) — flips text/border colors for that band
- **`column`** — child of a `mediaText`/`cols2`/`cols3` section. `content: "block+"`. Rendered as a flex/grid track that collapses to full width on mobile.
- **`hero`** — `atom`-ish cover block. Attrs: `heading`, `subheading`, `bgImage`, `align`, `overlay` (bool). Rendered as a tall banner.
- **`statBand`** — the "by the numbers" tiles. Attrs: `stats: [{ label, value }]`. Rendered as a responsive tile grid.
- **`ctaButton`** — Attrs: `label`, `href`, `style` (`solid|outline`), `align`. Rendered as a styled anchor.

Existing nodes (`image`, `gallery`, `embed`, `callout`, `table`, `tableOfContents`, lists, headings…) are reused **inside** sections. A document is valid whether or not it uses sections: `section` is optional, so legacy posts (loose top-level blocks) keep rendering. When a post uses the builder, the doc's top level is a list of `section` nodes.

### Post-level theme

- New nullable column **`theme Json?`** on `BlogPost` **and** `ProjectPressKit` (one Prisma migration). Shape: `{ accent: string, fontPair: "syne-dmsans" | "oswald-lato" | ..., width: "narrow" | "wide" }`.
- Applied by the renderer as CSS custom properties on the article wrapper (`--post-accent`, `--post-max-width`, font-family vars); the editor mirrors them live via inline style on the editor surface.

### Editor UX (`BlogEditor.jsx` + new components)

- **Insert-between affordances:** a "+ Add section" control rendered in the gaps between sections (ProseMirror decoration / gap widget) → opens the **section-library popover**.
- **Section library popover** (`BlogSectionLibrary.jsx`): Hero · Rich text · Media + text · Columns (2/3) · Image gallery · Stat band · Quote/pull-quote · CTA · Callout · Embed · Table · Divider/spacer. Each entry inserts a `section` pre-filled with the right `layout` + starter content.
- **Per-section floating toolbar** (in the `section` NodeView): move up / move down / duplicate / style / delete.
- **Section Settings panel** (`BlogSectionSettings.jsx`): layout, background (none/color/image + swatch), padding, width, theme — edits the selected section's attrs.
- **Theme bar** (`BlogThemeBar.jsx`): accent color, font pair, page width — edits the post `theme`.
- Sections get NodeViews (`BlogSection.jsx`, `BlogColumn.jsx`, `BlogHero.jsx`, `BlogStatBand.jsx`, `BlogCta.jsx`) via `ReactNodeViewRenderer`, matching the existing `BlogImage`/`BlogCallout` pattern.

### Renderer (`blogRender.ts`) + CSS

- Add `renderNode` branches for `section`, `column`, `hero`, `statBand`, `ctaButton` → semantic, responsive HTML with `presskit`/`cpm-blog`-prefixed classes and per-section inline styles (background, padding). Columns → CSS grid that collapses at a mobile breakpoint.
- Append section CSS to `public/search-theme.css` (and mirror the needed subset into the press-kit **print shell** so exports match). Theme variables resolved on the article wrapper.
- `renderJsonToHtml` and `renderPressKitInnerHtml` both benefit automatically.

### Collab

- `blogCollabExtensions()` in `blogSchema.ts` gains schema-only mirrors of the new nodes (name + `addAttributes` only). No CRDT/protocol change; sections are ordinary nodes in the shared Yjs doc.

---

## Workstream 2 — Image fix (backend proxy)

- **New route** `GET /api/blog/image/:fileId` (public — blog/press-kit images are public): streams the Drive file via `drive.files.get({ fileId, alt: "media" }, { responseType: "stream" })`, sets `Content-Type` + long `Cache-Control` (immutable; Drive ids are stable). Reuses the existing OAuth drive client in `driveService.ts` (new `streamDriveFile(fileId)` helper).
- **Upload change:** `POST /api/blog/upload` returns `{ url: "/api/blog/image/<fileId>", ... }` instead of the `uc?export=view` URL. `uploadImageToDrive` returns `fileId` already.
- **Heal existing content:** in `blogRender.ts`'s `image` (and `gallery`) branch, rewrite any `src` matching `drive.google.com/uc?...id=<id>` or `lh3.googleusercontent.com/d/<id>` to `/api/blog/image/<id>` (using `extractFileId`). No data migration needed — every already-published post heals on next render. The editor NodeView displays the proxied URL too.
- Same node serves press-kit images (shared `image` node).

---

## Workstream 3 — Delete blogs + press kits

- **Blog:** add a delete affordance to the list row (kebab menu in `BlogTab.jsx`) and the editor header (`BlogEditorPage.jsx`) → `deleteBlogPost(id)` (already exists). Confirm modal; navigate back to the list on success. Server already restricts to creator/admin.
- **Press kit:** new **`DELETE /api/projects/:projectId/press-kit`** — deletes the `ProjectPressKit` row (cascades `PressKitRevision`) and clears `Project.pressKitToken`; a later visit lazily re-creates an empty DRAFT via `getOrCreateKit`. Gated to project lead/admin. New `deletePressKit(projectId)` client helper; a **Delete** button in `PressKitPanel` toolbar with a confirm.

---

## Workstream 4 — Press-kit exports (PDF · Word · Markdown/HTML)

- **New route** `GET /api/projects/:projectId/press-kit/export?format=pdf|docx|md|html` (auth: project member/lead/admin), built from stored `contentJson`/`renderedHtml` wrapped in the existing print shell (`buildPressKitHtml`-style):
  - **html** — the standalone print-styled document, `Content-Disposition: attachment`.
  - **pdf** — Puppeteer launches headless Chrome, `page.setContent(html)`, `page.pdf({ format: "A4", printBackground: true })`. New dep: `puppeteer` (bundled Chromium) — document the deploy footprint; a single shared browser instance is reused across requests.
  - **docx** — `html-to-docx` converts the print HTML → `.docx` buffer.
  - **md** — a backend `docToMarkdown(doc)` util (port of the client `blogMarkdown.js` `docToMarkdown`, extended for the new section/hero/statBand/cta nodes) → `.md`.
- **Frontend:** an **Export** menu in `PressKitPanel` (PDF / Word / Markdown / HTML) → triggers an authenticated download (fetch → blob → save; sends the Bearer token like other `clubPmClient` calls).

---

## Workstream 5 — Richer press-kit auto-content (`pressKitService.ts`)

`generatePressKitContent(projectId, config)` pulls far more live data and seeds it as **sections** (leveraging Workstream 1):

- **By the numbers (`statBand`):** team size, tasks done/total, milestones hit/total, **hours logged** (`sum(TimeLog.minutes)`), project duration (createdAt→now/target), comment count, file count, GitHub PRs merged (from `GitHubLink`/activity).
- **Timeline (`section` + list/table):** milestones with due/complete dates + notable completed tasks with dates → a dated timeline.
- **What we're building:** AI summary of subsystems from task titles/descriptions/tags (existing Gemini path, richer prompt).
- **Team & leadership (`section`, `cols`):** roster with leads highlighted, titles, avatars, and per-member contribution (tasks done, hours logged).
- **Highlights / Tech & tools / Links / Contact / Sponsorship:** audience-tuned, fuller than today.
- Programmatic tables/stats are assembled deterministically (never model-dependent); only prose sections use AI. Audience selection tunes which sections seed and the AI tone.

---

## Workstream 6 — Expand-to-blog button availability

- Ensure `onExpandBlog` is wired and the button renders for **Approved** and **Published** submissions across every submission view in `OutreachHub.jsx` (identify the view(s) where `SubmissionCard` is rendered without the `onExpandBlog` prop and pass it through). No backend change.

---

## Workstream 7 — Missing icons (Font Awesome upgrade)

- Upgrade `public/index.html`'s Font Awesome `<link>` from `5.15.4` to the latest **6.x** `all.css`. FA6 keeps FA5 solid names valid and aliases renamed ones, fixing all missing ClubPM icons at once (checklist, embed, TOC, find & replace, undo/redo, and the others).
- **Verification pass:** grep every `fa-*` class used across `src/` and `public/`; confirm none is an FA5-only name that FA6 dropped. If any is found, add the FA6 equivalent at the call site. Spot-check marketing pages (Navbar, Home, Contact) after the bump.
- Fallback if the upgrade proves risky: surgically rename only the broken icons to FA5 equivalents where they exist.

---

## Data model summary (Prisma)

- `BlogPost.theme Json?` (nullable) — post-level theme.
- `ProjectPressKit.theme Json?` (nullable) — press-kit theme.
- No new tables. Section content lives inside existing `contentJson`. One migration (`add_blog_presskit_theme`).

## Permissions

- Section editing / theme: same as existing edit gates (blog: creator/author/admin; press kit: project lead/admin — `hasProjectAccess`).
- Image proxy: public (images are public assets).
- Press-kit delete/export: project member for export; lead/admin for delete (mirrors existing kit gating).
- Blog delete: creator/admin (server-enforced already).

## Phasing (high level — detailed plan via writing-plans)

Each phase ends green on `npm run build` (root) + `npx tsc --noEmit` (`backend/`); ≤4 files where practical; never a Prisma migration mixed with frontend in the same phase.

1. **Quick wins** — FA6 upgrade + icon verify; expand-button availability; blog delete UI; press-kit delete route + UI.
2. **Image proxy** — `streamDriveFile` + `GET /api/blog/image/:fileId`; upload returns proxy URL; renderer rewrite of legacy Drive URLs.
3. **Press-kit export** — export endpoint (html/md first, then docx, then pdf) + deps (`puppeteer`, `html-to-docx`) + backend `docToMarkdown` + Export menu.
4. **Richer generation** — expand `generatePressKitContent` data queries + section seeding.
5. **Theme migration + section renderer (backend)** — `theme` columns + migration; `blogRender.ts` + `blogSchema.ts` section/column/hero/statBand/cta nodes; CSS + print-shell CSS.
6. **Section Builder editor (frontend)** — new node NodeViews + `blogExtensions` wiring (6a); insert affordances + section library + settings panel + theme bar (6b).
7. **Polish** — responsive/print CSS, preview parity, empty/error states, tests.

## Testing / verification

- Backend `npx tsc --noEmit` and frontend `npm run build` green after every phase.
- **Icons:** load ClubPM blog editor + marketing pages; confirm every toolbar icon and site icon renders.
- **Images:** upload a photo → renders in editor, preview, and published page; open an already-broken published post → now renders via proxy.
- **Delete:** delete a draft blog post and a press kit; confirm gone + permission-gated.
- **Export:** export a press kit as PDF/docx/md/html; PDF is branded and matches preview; docx opens in Word; md re-imports cleanly.
- **Richer generation:** generate for each audience; confirm stats/timeline/team populate from real data.
- **Section builder:** insert each section type; reorder/duplicate/delete; set backgrounds/columns/theme; co-edit in two tabs (presence + convergence); publish → responsive on mobile; legacy (section-less) posts still render.
- **Expand:** button visible + working on Approved and Published submissions.
