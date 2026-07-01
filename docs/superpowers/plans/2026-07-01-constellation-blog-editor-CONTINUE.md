# Continuation Prompt — Constellation Blog Editor (resume at Epic 3)

Paste the block below into a fresh session to continue the build.

---

You are continuing the **Constellation Blog Editor** implementation. Read these first:
- Spec: `docs/superpowers/specs/2026-07-01-constellation-blog-editor-design.md`
- Plan (8 epics, per-section Sonnet prompts): `docs/superpowers/plans/2026-07-01-constellation-blog-editor.md`

**Status: Epics 1 & 2 are DONE, verified, and committed. Resume at Epic 3.**

## What already exists (do not rebuild)
- **Backend:** `backend/prisma/schema.prisma` has `BlogPost`, `BlogRevision`, `BlogAuthor`, `BlogTag`, `BlogCategory`, `BlogSnippet`, enum `BlogStatus`; migration `20260701074554_blog_editor_foundation` applied. `OutreachComment` has nullable `blogPostId`.
- `backend/src/services/blogRender.ts` — PM-JSON→HTML renderer (`renderJsonToHtml`), `markdownToTiptapJson`, `slugify`, `computeReadingTime`, `collectHeadings`, `PMDoc` type. **When you add a new editor node type, add a matching branch in `renderNode` here** so the public HTML snapshot renders it.
- `backend/src/services/blogService.ts` — post CRUD, `publishPost`/`schedulePost`/`unpublishPost`/`archivePost`, `publishDueScheduledPosts`, revisions/rollback, tags/categories/snippets, `addAuthor`/`removeAuthor`.
- `backend/src/api/blog.ts` — mounted at `/api/blog` in `app.ts`. Author-or-admin guard `requirePostAccess`.
- `backend/src/api/outreach.ts` — `expand-blog` now creates/updates a `BlogPost` draft (returns `{ blogPostId, blogSlug }`). Keep this working.
- `backend/src/api/public.ts` — `/api/public/blog` + `/blog/:slug` read `BlogPost` (status PUBLISHED), serve `renderedHtml`.
- **Frontend:** `src/api/clubPmClient.js` has `listBlogPosts/getBlogPost/createBlogPost/updateBlogPost/publishBlogPost/scheduleBlogPost/...` (blog section at bottom).
- `src/components/clubpm/blog/BlogEditor.jsx` — TipTap v3 editor. **`blogExtensions()` is the shared extension list — add new nodes/extensions there.** Has toolbar (formatting, link, tables, find&replace) + word/char count.
- `src/pages/ClubPM/BlogEditorPage.jsx` — route `/clubpm/outreach/blog/:id/edit`; title input, status, save/publish, debounced autosave, unsaved-changes guard.
- `src/components/clubpm/BlogTab.jsx` — "Blog" tab in `OutreachHub.jsx` (list by status, New post).
- CSS: `public/search-theme.css` bottom, section `/* === CLUBPM BLOG EDITOR`, prefix `cpm-blog-`.

## Gotchas learned
- **TipTap is v3.** StarterKit v3 ALREADY includes `Link` and `Underline` — do NOT add them separately (configure via `StarterKit.configure`). Tables come from `TableKit` (named export from `@tiptap/extension-table`), not per-table default imports. Search & replace uses MIT `@sereneinserenade/tiptap-search-and-replace` (`SearchAndReplace`).
- **Prisma client regen (`npx prisma generate`) fails with EPERM while the backend dev server holds the query-engine DLL.** Stop `tsx watch src/app.ts` first, regenerate, then restart. After any schema change: `npx prisma migrate dev` then `npx prisma generate`.
- Backend `multer@^2.1.1` is installed; `sharp` and TipTap are NOT on the backend (renderer is custom, by design).
- `SEOHead` prop is `ogImage` (not `image`) and it prepends the site base URL to `canonical` (pass a path).

## Gate after EVERY phase (repo conventions override TDD here)
- Backend phases: `cd backend && npx tsc --noEmit`
- Frontend phases: `npm run build` (repo root) — warnings are fine, errors are not.
- Commit at the end of each phase. Do not commit `build/` artifacts.
- Never mix a Prisma migration with frontend work in one phase.

## Do next: Epic 3 — Media & embeds
- **3.1 (backend):** `POST /api/blog/upload` in `backend/src/api/blog.ts` — multer memory storage → `sharp` (install it; resize max ~1600px, webp) → `driveService.uploadImageToDrive` → `{ url, width, height }`. Reuse `POST /api/outreach/ai/alt-text` for alt suggestions.
- **3.2 (frontend):** image node in `blogExtensions()` (`@tiptap/extension-image` or custom) — drag/drop + paste upload, resize, alignment (left/center/right/full via node attrs), caption, alt-text field + empty-alt reminder. Add render branch already exists in `blogRender.ts` (`image` case).
- **3.3 (frontend):** custom `embed` + `gallery` nodes (YouTube/X/Instagram/CodePen oEmbed). `blogRender.ts` already has `embed`/`gallery` branches — keep them in sync.

Then continue Epics 4→8 per the plan. Announce the writing/executing-plans skill as appropriate and keep committing per phase.
