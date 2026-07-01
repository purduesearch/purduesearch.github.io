# Constellation Blog Editor — Implementation Plan (per-section Sonnet 5 prompts)

> **For agentic workers:** Each Epic below is a self-contained prompt for a fresh Sonnet 5 session. Run them in order (Epic 1 → 8); phases within an epic run top-to-bottom. Spec: [`docs/superpowers/specs/2026-07-01-constellation-blog-editor-design.md`](../specs/2026-07-01-constellation-blog-editor-design.md).

**Goal:** A full Ghost/Notion-class blog editor in Constellation's Outreach section — rich WYSIWYG, media, blocks, publishing workflow, SEO, and realtime co-editing.

**Tech Stack:** React 19, TipTap v2 (ProseMirror), Hocuspocus + Yjs, Express/Prisma/PostgreSQL, `sharp`, Google Drive (`driveService`).

## Global Constraints (apply to EVERY phase)

- **Free / OSS only.** No paid services. Realtime WebSocket runs **embedded on the existing Express HTTP server**. Media reuses `driveService` (Google Drive).
- **Phase sizing:** ≤4 files touched, ≤2 new components, and **never a Prisma migration + frontend in the same phase**.
- **Gate after every phase:** `npm run build` (repo root) AND `cd backend && npx tsc --noEmit`. Fix all errors before continuing. Commit at the end of each phase.
- **Conventions:** `.jsx` PascalCase components, hooks only, Font Awesome icons (no emoji), kebab-case CSS appended to `public/search-theme.css`, ClubPM tokens on `.clubpm-app` (`--pm-accent-teal` etc.). API client via `src/api/clubPmClient.js` (`get/post/patch/del`), session cookie auth (no headers).
- **AI expand-to-blog must keep working** — see spec §3.7.

---

## EPIC 1 — Backend foundation

**Prompt for Sonnet 5:**

> You are adding a dedicated blog subsystem to a Node/Express/Prisma backend. Read the spec §3, §3.7, §4 first. Do these phases in order, committing after each. Gate: `cd backend && npx tsc --noEmit` after backend phases; `npm run build` (root) after the frontend phase (1.4).
>
> **Phase 1.1 — Schema + migration (migration only, no app code).**
> - In `backend/prisma/schema.prisma`, add enum `BlogStatus { DRAFT SCHEDULED PUBLISHED ARCHIVED }` and models `BlogPost`, `BlogRevision`, `BlogAuthor`, `BlogTag`, `BlogCategory`, `BlogSnippet` exactly as in spec §4 (include `contentJson Json`, `contentYjs Bytes?`, `renderedHtml String?`, SEO fields, `sourceSubmissionId String?`).
> - Add a nullable `blogPostId String?` + relation to `OutreachComment` (for draft annotations later); keep existing fields.
> - Run `cd backend && npx prisma migrate dev --name blog_editor_foundation`.
> - **Back-compat data migration:** in the same migration or a follow-up script `backend/scripts/backfill-blogposts.ts`, port every `OutreachSubmission` with `blogMarkdown` + `blogSlug` set into a `BlogPost` (status `PUBLISHED`, `slug` = existing `blogSlug`, `contentJson` = markdown→TipTap JSON via the helper from 1.2 — if 1.2 not yet done, store markdown in a temporary `renderedHtml` and revisit). Preserve `publishedAt`.
> - Verify: `npx prisma validate` and `npx tsc --noEmit`.
>
> **Phase 1.2 — `backend/src/services/blogService.ts` (backend service only).**
> - Export: `createPost`, `getPost`, `getPostBySlug`, `listPosts(filters)`, `updatePost`, `deletePost`, `publishPost`, `schedulePost`, `archivePost`, `unpublishPost`, `snapshotRevision(postId)`, `listRevisions(postId)`, `rollbackRevision(postId, revisionId)`, tag/category/snippet CRUD.
> - Helpers: `slugify(title)` with unique-collision suffix; `computeReadingTime(json)`; `renderJsonToHtml(json)` using `generateHTML` from `@tiptap/html` + the same extension set the editor uses (share a `backend/src/services/blogTiptapSchema.ts` extension list); `markdownToTiptapJson(md)` (use `marked` → HTML → `generateJSON`, or a markdown TipTap extension).
> - `publishPost` writes `renderedHtml` (snapshot) + `publishedAt` and snapshots a revision.
> - Gate: `npx tsc --noEmit`.
>
> **Phase 1.3 — `backend/src/api/blog.ts` routes + mount + repoint expand-blog (backend routes).**
> - Routes (mirror outreach patterns, `requireAuth`, author/admin checks): `GET/POST /api/blog/posts`, `GET/PATCH/DELETE /api/blog/posts/:id`, `POST /api/blog/posts/:id/publish|schedule|archive|unpublish`, `GET /api/blog/posts/:id/revisions`, `POST /api/blog/posts/:id/revisions/:revId/rollback`, `GET/POST/PATCH/DELETE` for `/api/blog/tags`, `/api/blog/categories`, `/api/blog/snippets`. Mount in `backend/src/app.ts`.
> - **Repoint** `POST /submissions/:id/ai/expand-blog` in `backend/src/api/outreach.ts`: keep calling `aiOutreachService.expandToBlog`, but instead of writing `blogMarkdown`/`blogSlug` on the submission, create (or update) a `BlogPost` **draft** via `blogService.createPost` using `markdownToTiptapJson`, set `sourceSubmissionId`, and return `{ blogPostId, slug }`. Keep the submission's `blogSlug` in sync so the board affordance can link to the editor.
> - Gate: `npx tsc --noEmit`.
>
> **Phase 1.4 — Public read path (public API + public frontend).**
> - `backend/src/api/public.ts`: repoint `GET /api/public/blog` and `/api/public/blog/:slug` to `BlogPost` where `status = PUBLISHED`; return `renderedHtml`, `title`, `slug`, `excerpt`, `coverImageUrl`, `publishedAt`, `readingTimeMin`, `tags`, `categories`, author names, OG fields.
> - `src/pages/BlogPost.jsx`: render `renderedHtml` via `dangerouslySetInnerHTML` (into `.pm-blog-post-body`) instead of `<ReactMarkdown>`; wire `SEOHead` to OG fields + reading time. `src/pages/Blog.jsx`: adapt card fields (cover, excerpt, tags, author) to the new shape.
> - Gate: `npm run build` (root). **Acceptance (spec §3.7):** existing published posts still resolve at `/blog/:slug`; expand-blog on a submission produces a draft `BlogPost`.

---

## EPIC 2 — Core editor

**Prompt for Sonnet 5:**

> Read spec §3.2, §3.6. Install TipTap and build the editor shell + save loop. Gate after each phase: `npm run build` (root).
>
> **Phase 2.1 — Editor shell + route + tab.**
> - Install: `npm i @tiptap/react @tiptap/starter-kit @tiptap/extension-underline @tiptap/extension-task-list @tiptap/extension-task-item @tiptap/extension-placeholder`.
> - Create `src/components/clubpm/blog/BlogEditor.jsx` — `useEditor` with StarterKit (headings 1–6, blockquote, code block, ordered/bullet/nested lists, HR, undo/redo), Underline, TaskList/TaskItem (checklists), Placeholder. Build a toolbar (`src/components/clubpm/blog/BlogToolbar.jsx`) with Font Awesome buttons: bold/italic/underline/strike, H1–H6 dropdown, blockquote, code block, lists, checklist, HR, undo/redo. Reflect active marks.
> - Add route `/clubpm/outreach/blog/:id/edit` (full-screen; register where ClubPM routes live) rendering a `BlogEditorPage` wrapper. Add a **"Blog" tab** to `src/pages/ClubPM/OutreachHub.jsx` listing posts by status with an "Edit" action → the route, and "New post".
> - Append editor CSS to `public/search-theme.css` (prefix `cpm-blog-`).
>
> **Phase 2.2 — Save loop.**
> - In `src/api/clubPmClient.js` add `blog` methods (`listPosts`, `getPost`, `createPost`, `updatePost`, `publishPost`, etc.).
> - In `BlogEditorPage`: load `contentJson` into the editor; **debounced autosave** (~1.5s idle) via `updatePost`; explicit "Save draft" vs "Publish" buttons; `beforeunload` + in-app unsaved-changes guard; live word/character count (`@tiptap/extension-character-count`).
>
> **Phase 2.3 — Links, tables, find & replace.**
> - Install `@tiptap/extension-link @tiptap/extension-table @tiptap/extension-table-row @tiptap/extension-table-cell @tiptap/extension-table-header`. Add link insert/edit UI + `autolink`/`linkOnPaste`. Add table insert + add/remove row/column controls. Add find & replace (search extension or a small ProseMirror plugin) with a toolbar popover.

---

## EPIC 3 — Media & embeds

**Prompt for Sonnet 5:**

> Read spec §3.4. Gate: backend phase `npx tsc --noEmit`; frontend phases `npm run build`.
>
> **Phase 3.1 — Backend upload endpoint (backend only).**
> - Add `POST /api/blog/upload` in `backend/src/api/blog.ts` (multipart, `multer` memory storage). Pipe buffer through `sharp` (resize max width ~1600px, convert to webp, compress) then `driveService.uploadImageToDrive`. Return `{ url, width, height }`. Reuse `POST /ai/alt-text` for alt suggestions.
>
> **Phase 3.2 — Image node.**
> - Install `@tiptap/extension-image` (or a custom node). Drag-drop + paste upload → `/api/blog/upload`; controls for resize, alignment (left/center/right/full-width) stored as node attrs, caption (figure/figcaption), and an **alt-text field with a fill-in reminder** when empty.
>
> **Phase 3.3 — Embeds + gallery.**
> - Custom TipTap nodes: `Embed` (paste a YouTube/X/Instagram/CodePen URL → resolve via each provider's free oEmbed endpoint or a sanitized iframe) and `Gallery`/`Carousel` (ordered list of uploaded image URLs). Ensure `renderJsonToHtml` (Epic 1) knows these nodes — update the shared `blogTiptapSchema.ts`.

---

## EPIC 4 — Structure & organization

**Prompt for Sonnet 5:**

> **Phase 4.1 — Table of contents.** Add a TOC node/extension that scans document headings (with ids/anchors) and renders a nav list; auto-updates on edit. Ensure server render (`renderJsonToHtml`) emits heading anchors + TOC.
>
> **Phase 4.2 — Reusable snippets + CTA.** Build `BlogSnippet` management UI (list/create/update/delete via the Epic 1 endpoints) and an "Insert snippet" command that injects the snippet's `contentJson` at the cursor. Add a styled Callout/CTA block node. Gate: `npm run build`.

---

## EPIC 5 — Publishing workflow

**Prompt for Sonnet 5:**

> Read spec §3.5, §3.6.
>
> **Phase 5.1 — Status & controls (frontend).** Status badges (Draft/Scheduled/Published/Archived) in the Blog tab and editor; publish / unpublish / archive controls; a scheduled-datetime picker that sets `SCHEDULED` + `scheduledAt`; reuse the existing approval workflow (`requiredApprovers`/`ApprovalRecord`) to gate publish when required. Gate: `npm run build`.
>
> **Phase 5.2 — Auto-publish cron (backend).** In `backend/src/slack/scheduler.ts` add a node-cron job (every ~5 min) that finds `BlogPost` where `status = SCHEDULED` and `scheduledAt <= now`, calls `blogService.publishPost` (writes `renderedHtml`, sets `PUBLISHED`, `publishedAt`). Gate: `npx tsc --noEmit`.
>
> **Phase 5.3 — Revisions + preview (frontend).** Revision history drawer (list snapshots, view, rollback via Epic 1 endpoints); a Preview mode that renders the current doc exactly as the public page (reuse the server `renderedHtml` shape or client render into `.pm-blog-post-body`). Gate: `npm run build`.

---

## EPIC 6 — Metadata & SEO

**Prompt for Sonnet 5:**

> **Phase 6.1 — Metadata panel (frontend).** Side panel in the editor: title, slug (auto from title with manual override + uniqueness check), meta description with live character counter (target ≤160), cover image selector (reuse `/api/blog/upload` or existing AssetPicker), tags & categories (create/assign via Epic 1 endpoints), canonical URL, Open Graph title/description/image, and a computed reading-time display. Persist via `updatePost`. Gate: `npm run build`.

---

## EPIC 7 — Realtime collaboration

**Prompt for Sonnet 5:**

> Read spec §3.3. This is the largest infra add. Gate: backend `npx tsc --noEmit`; frontend `npm run build`.
>
> **Phase 7.1 — Embedded collab server (backend).** Add `@hocuspocus/server` (+ `y-protocols`, `yjs`). In `backend/src/app.ts` (or a new `backend/src/collab/blogCollab.ts`), attach a Hocuspocus/`y-websocket` instance to the **existing HTTP server's `upgrade` event** at path `/collab/blog`. Authenticate the WS handshake with the existing session/token. `onLoadDocument`/`onStoreDocument` read/write `BlogPost.contentYjs`; on store, also persist a `contentJson` snapshot.
>
> **Phase 7.2 — Collaboration extensions (frontend).** Install `@tiptap/extension-collaboration @tiptap/extension-collaboration-cursor yjs y-websocket`. Swap the editor's history for `Collaboration` bound to a `Y.Doc` synced via `WebsocketProvider` → `/collab/blog/:id`; add `CollaborationCursor` with the member's name/color. Render presence avatars ("currently editing") in the editor header. Disable the Epic 2 debounced JSON autosave while collab is active (server persists on store).
>
> **Phase 7.3 — Draft annotations + multi-author (frontend).** Reuse the `OutreachComment` thread (now with `blogPostId`) for internal review notes on a post; surface a multi-author manager (add/remove `BlogAuthor`, set role).

---

## EPIC 8 — UX polish

**Prompt for Sonnet 5:**

> **Phase 8.1 — Polish.** Keyboard-shortcut map (bold ⌘/Ctrl+B, italic, underline, save, etc. — reuse `useKeyboardShortcuts`), responsive/mobile editor layout (collapsible toolbar + metadata panel), an optional Markdown power-user toggle (serialize/deserialize the doc), and a final CSS pass appended to `public/search-theme.css`. Gate: `npm run build`.

---

## Self-review notes

- Every spec §5 feature maps to a phase (see spec §5 table).
- Migration-only phases: 1.1, 5.2-adjacent none; migration never shares a phase with frontend. 1.1 is isolated; 1.4/2.x/etc. are frontend/read-path.
- Shared TipTap extension list lives in one place (`blogTiptapSchema.ts`) so server render (Epic 1/3/4) and client editor stay in sync — update it whenever a new node is added.
