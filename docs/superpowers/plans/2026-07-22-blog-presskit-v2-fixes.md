# Blog / Press Kit v2 — Fixes & Exports Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the contained blog/press-kit fixes and additions — Font Awesome icons, the expand-to-blog button, delete for blogs + press kits, a Google-Drive image proxy, richer auto-generated press-kit content, and downloadable press-kit exports (PDF/Word/Markdown/HTML).

**Architecture:** Small, independent changes across the existing blog/press-kit stack. No new realtime or editor architecture — that's the separate Section Builder plan. The image fix adds an unauthenticated proxy route that streams Drive bytes and rewrites legacy `drive.google.com/uc` URLs. Exports reuse the existing `buildPressKitHtml` print shell, rendered to PDF by Puppeteer and to `.docx` by `html-to-docx`, with a new pure JSON→Markdown util.

**Tech Stack:** Express (ESM, `.js` import suffixes), Prisma/PostgreSQL, Google Drive API (`googleapis`), Puppeteer, `html-to-docx`, React 19, React Router 7. Backend pure-logic tests use the repo's dependency-free inline harness run with `npx tsx` (no Jest).

**Spec:** `docs/superpowers/specs/2026-07-22-blog-presskit-v2-design.md`

**Conventions to honor:**
- Backend is ESM: **all relative imports end in `.js`** even for `.ts` files.
- In API handlers, always read `req.memberId` (never `req.session.memberId`).
- Append new CSS to the bottom of `public/search-theme.css` (reuse `cpm-blog-`/`presskit-` prefixes).
- After every phase: `cd backend && npx tsc --noEmit` AND (repo root) `npm run build` must pass.
- Do not remove/replace the `mxgraph` dependency; do not touch unrelated code.

---

## File Structure

**Backend — created:**
- `backend/src/services/docToMarkdown.ts` — pure TipTap-JSON → Markdown (for the `md` export).
- `backend/src/services/docToMarkdown.test.ts` — inline-harness tests (excluded from build).

**Backend — modified:**
- `backend/src/services/driveService.ts` — add `streamDriveFile(fileId)`.
- `backend/src/api/public.ts` — add unauthenticated `GET /blog-image/:fileId` proxy.
- `backend/src/api/blog.ts` — upload returns the absolute proxy URL, not the dead `uc` URL.
- `backend/src/services/blogRender.ts` — `proxyImageSrc()` rewrite of legacy Drive URLs in `image`/`gallery`; optional `baseUrl` on `renderJsonToHtml`.
- `backend/src/services/blogRender.test.ts` — **created** — pure tests for `proxyImageSrc`.
- `backend/src/services/pressKitService.ts` — richer `gatherPressKitData` + `buildPressKitMarkdown` (per-member contributions, dated timeline, comment count).
- `backend/src/services/pressKitService.test.ts` — extend for the new markdown sections.
- `backend/src/api/pressKit.ts` — add `DELETE …/press-kit` and `GET …/press-kit/export`.
- `backend/package.json` — add `puppeteer`, `html-to-docx`.

**Frontend — modified:**
- `public/index.html` — Font Awesome 5 → 6 CDN link.
- `src/pages/ClubPM/OutreachHub.jsx` — expand-to-blog button gating.
- `src/components/clubpm/BlogTab.jsx` — delete affordance on list rows.
- `src/pages/ClubPM/BlogEditorPage.jsx` — Delete button in the editor header.
- `src/components/clubpm/blog/BlogImage.jsx` — client-side proxy rewrite for legacy image `src`.
- `src/components/clubpm/PressKitPanel.jsx` — Delete + Export menu.
- `src/api/clubPmClient.js` — `deletePressKit`, `downloadPressKitExport`; `proxyImageSrc` helper.

---

## Shared name contract (used across tasks — keep identical)

- Backend: `streamDriveFile(fileId): Promise<{ stream: Readable; mimeType: string } | null>`; `proxyImageSrc(src: string, baseUrl?: string): string`; `pmDocToMarkdown(doc: PMDoc | null): string`.
- Image proxy path: **`/api/public/blog-image/:fileId`** (unauthenticated).
- Env var (optional, for healing legacy cross-origin images at render time): **`PUBLIC_API_BASE_URL`** — the backend's own public origin, e.g. `https://clubpm-api.example.com`. New uploads embed an absolute URL from the request and don't need it.
- Client: `deletePressKit(projectId)`; `downloadPressKitExport(projectId, format, projectName)`; `proxyImageSrc(src)`.

---

## Phase 1 — Font Awesome 6 upgrade

### Task 1.1: Upgrade the CDN link and verify site-wide icons

**Files:**
- Modify: `public/index.html:95`

- [ ] **Step 1: Swap the stylesheet.** Replace line 95:

```html
    <!-- Font Awesome 6 (FA5 names remain valid; renamed icons are aliased) -->
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css" />
```

- [ ] **Step 2: Inventory every icon name used in the app.**

Run: `git grep -hoE "fa-[a-z0-9-]+" -- src public | sort -u`
Expected: a list of `fa-*` names. Scan it for any Font Awesome **Pro-only in v6** or **removed** names. The names this codebase relies on that are FA6-valid include: `fa-square-check`, `fa-magnifying-glass`, `fa-rotate-left`, `fa-rotate-right`, `fa-bars-staggered`, `fa-photo-film`, `fa-users-viewfinder`, `fa-clock-rotate-left`, `fa-pen-fancy`, `fa-blog`, `fa-newspaper`, `fa-image`, `fa-external-link-alt` (aliased), `fa-sliders-h` (aliased). If any name in the output is not resolvable in FA6 Free, add its FA6 replacement at the call site in that step's commit and note it.

- [ ] **Step 3: Smoke-test in the browser.**

Run (repo root): `npm start`, open `http://localhost:3000`.
Expected: Navbar, Home, Contact, Footer icons render (no empty squares); then open a ClubPM blog editor and confirm the toolbar checklist, embed, TOC, find & replace, and undo/redo icons now render. Stop the dev server.

- [ ] **Step 4: Production build.**

Run (repo root): `npm run build`
Expected: "Compiled successfully".

- [ ] **Step 5: Commit.**

```bash
git add public/index.html
git commit -m "fix(icons): upgrade Font Awesome 5.15 -> 6.5 so FA6-named ClubPM icons render"
```

---

## Phase 2 — Expand-to-blog availability

### Task 2.1: Show the expand button on Approved + Published submissions

**Files:**
- Modify: `src/pages/ClubPM/OutreachHub.jsx:240`

**Context:** The button currently requires `submission.content` to be truthy, which hides it on Approved/Published submissions that were never AI-drafted. The fix: Approved and Published always show it; In-Review keeps needing content.

- [ ] **Step 1: Relax the gate.** Replace the condition on line 240:

```jsx
          {(['APPROVED', 'PUBLISHED'].includes(submission.status)
            || (submission.status === 'IN_REVIEW' && submission.content)) && (
```

- [ ] **Step 2: Build.**

Run (repo root): `npm run build`
Expected: "Compiled successfully".

- [ ] **Step 3: Commit.**

```bash
git add src/pages/ClubPM/OutreachHub.jsx
git commit -m "fix(outreach): show Expand-to-blog on Approved + Published submissions"
```

---

## Phase 3 — Delete blogs + press kits

### Task 3.1: Delete a blog post from the list and the editor

**Files:**
- Modify: `src/components/clubpm/BlogTab.jsx`
- Modify: `src/pages/ClubPM/BlogEditorPage.jsx`

- [ ] **Step 1: Import the delete helper + toast in `BlogTab.jsx`.** The top import already has `listBlogPosts, createBlogPost`; extend it:

```jsx
import { listBlogPosts, createBlogPost, deleteBlogPost } from '../../api/clubPmClient';
```

- [ ] **Step 2: Add a delete handler** inside `BlogTab` (after `handleNew`):

```jsx
  const handleDelete = async (e, postId, title) => {
    e.stopPropagation();
    if (!window.confirm(`Delete "${title}"? This cannot be undone.`)) return;
    try {
      await deleteBlogPost(postId);
      setPosts((prev) => prev.filter((p) => p.id !== postId));
      toast.success('Post deleted');
    } catch {
      toast.error('Could not delete post (only the author or an admin can).');
    }
  };
```

- [ ] **Step 3: Add a delete button to each row.** In the `posts.map(...)` row, immediately before the closing `</li>` (after the published-view `<a>` block ~line 101), add:

```jsx
              <button
                type="button"
                className="cpm-blog-list-delete"
                title="Delete post"
                aria-label="Delete post"
                onClick={(e) => handleDelete(e, p.id, p.title)}
              >
                <i className="fas fa-trash" aria-hidden="true" />
              </button>
```

- [ ] **Step 4: Add the row-delete style.** Append to the bottom of `public/search-theme.css`:

```css
/* Blog list row delete */
.cpm-blog-list-delete {
  background: none; border: none; color: var(--color-text-muted, #8a95a5);
  cursor: pointer; padding: 6px; border-radius: 6px; opacity: 0; transition: opacity .15s, color .15s;
}
.cpm-blog-list-row:hover .cpm-blog-list-delete { opacity: 1; }
.cpm-blog-list-delete:hover { color: var(--pm-accent-coral, #ff6b6b); }
```

- [ ] **Step 5: Add a Delete button to the editor header.** In `src/pages/ClubPM/BlogEditorPage.jsx`, extend the import (line ~11-14) to include `deleteBlogPost`:

```jsx
import {
  getBlogPost, updateBlogPost, publishBlogPost,
  scheduleBlogPost, unpublishBlogPost, archiveBlogPost, get, deleteBlogPost,
} from '../../api/clubPmClient';
```

- [ ] **Step 6: Add `useNavigate` + a delete handler.** Change the router import (line 2) to add `useNavigate`:

```jsx
import { useParams, Link, useNavigate } from 'react-router-dom';
```

Inside the component, after `const { member } = useClubPmAuth();` (~line 25) add:

```jsx
  const navigate = useNavigate();
```

After `handleArchive` (~line 206) add:

```jsx
  const handleDelete = useCallback(async () => {
    if (!window.confirm('Delete this post permanently? This cannot be undone.')) return;
    setBusyAction(true);
    try {
      await deleteBlogPost(id);
      toast.success('Post deleted');
      navigate('/clubpm/outreach');
    } catch {
      toast.error('Delete failed (only the author or an admin can).');
      setBusyAction(false);
    }
  }, [id, navigate]);
```

- [ ] **Step 7: Render the Delete button** in the header actions, immediately before the closing `</div>` of `cpm-blog-editor-header-actions` (after the Publish block ~line 322):

```jsx
          <button
            type="button"
            className="clubpm-btn-secondary cpm-blog-delete-btn"
            onClick={handleDelete}
            disabled={busyAction}
            title="Delete post"
          >
            <i className="fas fa-trash" aria-hidden="true" style={{ marginRight: 6 }} />
            Delete
          </button>
```

- [ ] **Step 8: Build.**

Run (repo root): `npm run build`
Expected: "Compiled successfully".

- [ ] **Step 9: Commit.**

```bash
git add src/components/clubpm/BlogTab.jsx src/pages/ClubPM/BlogEditorPage.jsx public/search-theme.css
git commit -m "feat(blog): delete posts from the list and the editor header"
```

### Task 3.2: Press-kit delete route + client helper

**Files:**
- Modify: `backend/src/api/pressKit.ts` (append a route before the file's end)
- Modify: `src/api/clubPmClient.js` (near the other press-kit helpers ~419)

- [ ] **Step 1: Add the DELETE route** to `backend/src/api/pressKit.ts`, after the restore route (end of file):

```ts
// DELETE /api/projects/:projectId/press-kit — remove the kit + revisions, clear token
pressKitRouter.delete("/projects/:projectId/press-kit", async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params as { projectId: string };
    if (!(await hasProjectAccess(req.memberId!, projectId))) { res.status(403).json({ error: "Forbidden" }); return; }
    const kit = await prisma.projectPressKit.findUnique({ where: { projectId }, select: { id: true } });
    if (kit) await prisma.projectPressKit.delete({ where: { id: kit.id } }); // cascades PressKitRevision
    await prisma.project.update({ where: { id: projectId }, data: { pressKitToken: null } });
    res.json({ ok: true });
  } catch (e) { console.error("DELETE press-kit error:", e); res.status(500).json({ error: "Failed to delete press kit" }); }
});
```

- [ ] **Step 2: Add the client helper** to `src/api/clubPmClient.js`, right after `updatePressKitContent` (~line 421):

```js
export const deletePressKit = (projectId) => del(`/api/projects/${projectId}/press-kit`);
```

- [ ] **Step 3: Typecheck + build.**

Run: `cd backend && npx tsc --noEmit`
Expected: no errors.
Run (repo root): `npm run build`
Expected: "Compiled successfully".

- [ ] **Step 4: Commit.**

```bash
git add backend/src/api/pressKit.ts src/api/clubPmClient.js
git commit -m "feat(presskit): DELETE route + deletePressKit client helper"
```

### Task 3.3: Press-kit Delete button in the panel

**Files:**
- Modify: `src/components/clubpm/PressKitPanel.jsx`

- [ ] **Step 1: Import the helper.** Extend the `clubPmClient` import block (~lines 6-10) to add `deletePressKit`:

```jsx
import {
  getPressKit, generatePressKit, updatePressKitConfig, publishPressKit,
  getPressKitRevisions, restorePressKitRevision, getPressKitCollabWsUrl,
  updatePressKitContent, deletePressKit,
} from '../../api/clubPmClient';
```

- [ ] **Step 2: Add a delete handler** after `handleRestore` (~line 115):

```jsx
  const handleDelete = useCallback(async () => {
    if (!window.confirm('Delete this press kit and all its revisions? This cannot be undone.')) return;
    setBusy(true);
    try {
      await deletePressKit(projectId);
      setKit((prev) => ({ ...prev, contentJson: null, generatedAt: null, status: 'DRAFT' }));
      setShowSettings(false);
      toast.success('Press kit deleted');
    } catch { toast.error('Delete failed'); }
    finally { setBusy(false); }
  }, [projectId]);
```

- [ ] **Step 3: Render the Delete button** in the editor-state toolbar, right after the History button (~line 184):

```jsx
        <button type="button" className="clubpm-btn-secondary" onClick={handleDelete} disabled={busy || !canEdit}
          title="Delete this press kit">Delete</button>
```

- [ ] **Step 4: Build.**

Run (repo root): `npm run build`
Expected: "Compiled successfully".

- [ ] **Step 5: Commit.**

```bash
git add src/components/clubpm/PressKitPanel.jsx
git commit -m "feat(presskit): delete button in the press-kit panel"
```

---

## Phase 4 — Google Drive image proxy

### Task 4.1: Stream helper + unauthenticated proxy route + upload URL

**Files:**
- Modify: `backend/src/services/driveService.ts`
- Modify: `backend/src/api/public.ts`
- Modify: `backend/src/api/blog.ts:154-165`

- [ ] **Step 1: Add `streamDriveFile`** to `backend/src/services/driveService.ts` (append; `Readable` and `getBotDrive` are already in the file):

```ts
/**
 * Stream a Drive file's raw bytes (for the public image proxy). Returns the
 * readable stream + mime type, or null if Drive is unavailable / the id is bad.
 */
export async function streamDriveFile(
  fileId: string
): Promise<{ stream: Readable; mimeType: string } | null> {
  try {
    const drive = await getBotDrive();
    if (!drive) return null;
    const meta = await drive.files.get({ fileId, fields: "mimeType" });
    const resp = await drive.files.get(
      { fileId, alt: "media" },
      { responseType: "stream" }
    );
    return {
      stream: resp.data as unknown as Readable,
      mimeType: meta.data.mimeType ?? "application/octet-stream",
    };
  } catch (err) {
    console.error("[driveService] streamDriveFile error:", err);
    return null;
  }
}
```

- [ ] **Step 2: Add the public proxy route** to `backend/src/api/public.ts`. Add the import near the other service imports at the top:

```ts
import { streamDriveFile } from "../services/driveService.js";
```

And add the route (anywhere among the other `publicRouter.get(...)` handlers):

```ts
// GET /api/public/blog-image/:fileId — proxy Drive image bytes to an <img>-safe URL.
// Public: blog/press-kit images are public assets. Long-cached (Drive ids are stable).
publicRouter.get("/blog-image/:fileId", async (req: Request, res: Response) => {
  const { fileId } = req.params as { fileId: string };
  if (!/^[a-zA-Z0-9_-]{10,}$/.test(fileId)) { res.status(400).end(); return; }
  const file = await streamDriveFile(fileId);
  if (!file) { res.status(404).end(); return; }
  res.setHeader("Content-Type", file.mimeType);
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  file.stream.on("error", () => { if (!res.headersSent) res.status(502).end(); });
  file.stream.pipe(res);
});
```

> If `public.ts` doesn't already import `Request, Response` from express, add them to its existing express import.

- [ ] **Step 3: Return the proxy URL from upload.** In `backend/src/api/blog.ts`, replace the `res.json(...)` on line ~165 with an absolute proxy URL built from the request origin (works cross-origin for new images without any env var):

```ts
      const origin = `${req.protocol}://${req.get("host")}`;
      res.json({
        url: `${origin}/api/public/blog-image/${uploaded.fileId}`,
        width: info.width,
        height: info.height,
      });
```

- [ ] **Step 4: Typecheck.**

Run: `cd backend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit.**

```bash
git add backend/src/services/driveService.ts backend/src/api/public.ts backend/src/api/blog.ts
git commit -m "feat(blog): Drive image proxy route; uploads return proxy URL"
```

### Task 4.2: Heal legacy Drive URLs in the renderer (TDD)

**Files:**
- Create: `backend/src/services/blogRender.test.ts`
- Modify: `backend/src/services/blogRender.ts`

- [ ] **Step 1: Write the failing test** at `backend/src/services/blogRender.test.ts`:

```ts
// Pure tests for the image-proxy URL rewrite.
// Run: cd backend && npx tsx src/services/blogRender.test.ts
import { proxyImageSrc } from "./blogRender.js";

let passed = 0, failed = 0;
const check = (n: string, c: boolean) => { if (c) passed++; else { failed++; console.error(`  ✗ ${n}`); } };

check("rewrites uc?export=view",
  proxyImageSrc("https://drive.google.com/uc?export=view&id=ABC123defGH") === "/api/public/blog-image/ABC123defGH");
check("rewrites file/d/ID/view",
  proxyImageSrc("https://drive.google.com/file/d/ABC123defGH/view") === "/api/public/blog-image/ABC123defGH");
check("rewrites lh3 googleusercontent",
  proxyImageSrc("https://lh3.googleusercontent.com/d/ABC123defGH=w1600") === "/api/public/blog-image/ABC123defGH");
check("prefixes baseUrl when given",
  proxyImageSrc("https://drive.google.com/uc?export=view&id=ABC123defGH", "https://api.example.com")
    === "https://api.example.com/api/public/blog-image/ABC123defGH");
check("passes through an already-proxied URL",
  proxyImageSrc("/api/public/blog-image/ABC123defGH") === "/api/public/blog-image/ABC123defGH");
check("passes through a normal https image",
  proxyImageSrc("https://example.com/pic.png") === "https://example.com/pic.png");

console.log(`\nblogRender: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
```

- [ ] **Step 2: Run it — confirm it fails** (`proxyImageSrc` not exported yet).

Run: `cd backend && npx tsx src/services/blogRender.test.ts`
Expected: FAIL — `proxyImageSrc is not a function` / import error.

- [ ] **Step 3: Implement `proxyImageSrc`** in `backend/src/services/blogRender.ts`. Add near the top (after the `escapeAttr` helpers ~line 47):

```ts
// Rewrite legacy Google-Drive image URLs to the app's image proxy so <img>
// tags actually load (Drive stopped serving uc?export=view to hotlinks).
// `baseUrl` (optional) makes the result absolute for cross-origin public pages.
const DRIVE_ID_RE =
  /(?:drive\.google\.com\/uc\?[^"']*?[?&]id=|drive\.google\.com\/file\/d\/|lh3\.googleusercontent\.com\/d\/)([a-zA-Z0-9_-]{10,})/;
export function proxyImageSrc(src: string, baseUrl = ""): string {
  if (!src) return src;
  const m = src.match(DRIVE_ID_RE);
  if (!m) return src;
  return `${baseUrl}/api/public/blog-image/${m[1]}`;
}
```

- [ ] **Step 4: Thread `baseUrl` through the renderer.** Change `renderJsonToHtml` (~line 264) to accept an optional base and stash it for the node walkers. Replace the function with:

```ts
/** Render a full TipTap doc to the HTML snapshot served on the public site. */
export function renderJsonToHtml(doc: PMDoc | null | undefined, baseUrl = ""): string {
  if (!doc || !doc.content) return "";
  IMAGE_BASE_URL = baseUrl;
  const headingIds = buildHeadingIdMap(doc);
  const body = doc.content.map((n) => renderNode(n, headingIds)).join("\n");
  const toc = renderToc(doc, headingIds);
  return body.replace(/<!--TOC-->/g, toc);
}
```

And add a module-level `let IMAGE_BASE_URL = "";` next to the other top-level declarations (above `renderNode`).

- [ ] **Step 5: Use the rewrite in the `image` and `gallery` branches.** In `renderNode`, change the `image` branch `src` line (~line 201) to:

```ts
      const src = escapeAttr(proxyImageSrc(String(node.attrs?.src ?? ""), IMAGE_BASE_URL));
```

And in the `gallery` branch (~line 220), change the map to:

```ts
        .map((im) => `<img src="${escapeAttr(proxyImageSrc(String(im.src ?? im.url ?? ""), IMAGE_BASE_URL))}" alt="${escapeAttr(String(im.alt ?? ""))}"/>`)
```

- [ ] **Step 6: Pass the base URL from the public blog + press-kit routes.** These are the only cross-origin surfaces, so heal legacy images there.
  - In `backend/src/api/public.ts`, where the public blog post's `renderedHtml` is produced/served, if it calls `renderJsonToHtml(doc)`, change it to `renderJsonToHtml(doc, process.env.PUBLIC_API_BASE_URL ?? "")`. (If the route serves a stored `renderedHtml` string instead, wrap legacy `src` at read time is unnecessary — new content already renders through this path. Leave stored HTML as-is; it will heal on the next publish.)
  - In `backend/src/services/pressKitService.ts` `buildPressKitHtml`, change the `renderJsonToHtml(kit.contentJson ...)` call to pass `process.env.PUBLIC_API_BASE_URL ?? ""` as the second arg.

- [ ] **Step 7: Run the test — expect PASS.**

Run: `cd backend && npx tsx src/services/blogRender.test.ts`
Expected: `blogRender: 6 passed, 0 failed`.

- [ ] **Step 8: Typecheck.**

Run: `cd backend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 9: Commit.**

```bash
git add backend/src/services/blogRender.ts backend/src/services/blogRender.test.ts backend/src/api/public.ts backend/src/services/pressKitService.ts
git commit -m "feat(blog): heal legacy Drive image URLs via proxy at render time"
```

### Task 4.3: Client-side proxy rewrite for the editor NodeView

**Files:**
- Modify: `src/api/clubPmClient.js`
- Modify: `src/components/clubpm/blog/BlogImage.jsx`

- [ ] **Step 1: Add a client `proxyImageSrc`** to `src/api/clubPmClient.js`, right after `uploadBlogImage` (~line 497):

```js
// Mirror of backend proxyImageSrc: rewrite legacy Drive image URLs so already-
// published posts display in the editor too. New uploads are already proxied.
const DRIVE_ID_RE = /(?:drive\.google\.com\/uc\?[^"']*?[?&]id=|drive\.google\.com\/file\/d\/|lh3\.googleusercontent\.com\/d\/)([a-zA-Z0-9_-]{10,})/;
export function proxyImageSrc(src) {
  if (!src) return src;
  const m = String(src).match(DRIVE_ID_RE);
  if (!m) return src;
  return `${BASE_URL}/api/public/blog-image/${m[1]}`;
}
```

- [ ] **Step 2: Use it in the image NodeView.** In `src/components/clubpm/blog/BlogImage.jsx`, add to the client import (line 5):

```jsx
import { uploadBlogImage, suggestBlogAltText, proxyImageSrc } from '../../../api/clubPmClient';
```

Then in `ImageView` change the `<img>` `src` (line ~95) to:

```jsx
        src={proxyImageSrc(src)}
```

- [ ] **Step 3: Build.**

Run (repo root): `npm run build`
Expected: "Compiled successfully".

- [ ] **Step 4: Commit.**

```bash
git add src/api/clubPmClient.js src/components/clubpm/blog/BlogImage.jsx
git commit -m "feat(blog): editor displays legacy Drive images through the proxy"
```

---

## Phase 5 — Richer press-kit auto-content

### Task 5.1: Add per-member contributions, dated timeline, and comment count (TDD)

**Files:**
- Modify: `backend/src/services/pressKitService.ts`
- Modify: `backend/src/services/pressKitService.test.ts`

**Before you start:** confirm the exact Prisma field/relation names this task uses. Run:
`git grep -nE "model (Task|TimeLog|TaskComment|MilestoneTask|ProjectMember)\b|minutes|assignees|completedAt" backend/prisma/schema.prisma`
Adjust the code below only if a field name differs (e.g. `TimeLog.minutes`, `Task.assignees`, `MilestoneTask.completedAt`).

- [ ] **Step 1: Extend the `PressKitContext` type** in `pressKitService.ts`. Add two fields to the interface (after `stats`):

```ts
  contributors: { displayName: string; tasksDone: number; hours: number }[];
  timeline: { title: string; date: Date | null; kind: "milestone" | "task" }[];
```

And add `commentCount: number;` inside the `stats: { ... }` object type.

- [ ] **Step 2: Write the failing test additions** in `pressKitService.test.ts`. Extend the existing `buildPressKitMarkdown` fixture: add to `ctx` the new fields and assert they render. Add this block after the current markdown checks:

```ts
{
  const ctx2 = {
    project: { name: "AstroUSA", type: "HARDWARE", status: "ACTIVE", description: null,
      startDate: new Date("2026-01-01"), targetDate: null, programTag: null, githubRepo: null, driveLink: null },
    stats: { teamSize: 3, tasksDone: 5, tasksTotal: 8, milestonesHit: 1, hoursLogged: 40, durationDays: 100, commentCount: 22 },
    milestones: [{ title: "First flight", description: null, completedAt: new Date("2026-05-01") }],
    contributors: [{ displayName: "Ana Lee", tasksDone: 4, hours: 25 }],
    timeline: [{ title: "First flight", date: new Date("2026-05-01"), kind: "milestone" as const }],
    team: [], tags: [], links: [],
  };
  const md2 = buildPressKitMarkdown(ctx2 as any, normalizePressKitConfig({
    includedSections: ["stats", "timeline", "team", "highlights"],
  }), { about: "", aboutSearch: "", building: "", sponsorship: "" });
  check("stats include comment count", md2.includes("22"));
  check("timeline lists dated milestone", md2.includes("First flight") && md2.includes("2026"));
  check("contributors render under team", md2.includes("Ana Lee") && md2.includes("4"));
}
```

- [ ] **Step 2b: Run it — confirm it fails.**

Run: `cd backend && npx tsx src/services/pressKitService.test.ts`
Expected: FAIL (new assertions fail / type errors).

- [ ] **Step 3: Render the new data in `buildPressKitMarkdown`.**
  - In the `stats` block, add a comment-count row before the closing `out.push("")`:

```ts
    out.push(`| Comments | ${ctx.stats.commentCount} |`);
```

  - Replace the `timeline` block with a dated version driven by `ctx.timeline` (fall back to milestones):

```ts
  if (has("timeline") && (ctx.timeline.length || p.targetDate)) {
    out.push("## Timeline & Milestones", "");
    for (const e of ctx.timeline) {
      const when = e.date ? ` — ${fmtDate(e.date)}` : "";
      out.push(`- **${e.title}**${when}`);
    }
    if (p.targetDate) out.push(`- **Target completion** — ${fmtDate(p.targetDate)}`);
    out.push("");
  }
```

  - In the `team` block, append per-contributor lines after the roster loop:

```ts
    if (ctx.contributors.length) {
      out.push("", "**Top contributors**");
      for (const c of ctx.contributors.slice(0, 6)) {
        out.push(`- ${c.displayName} — ${c.tasksDone} tasks, ${c.hours} h`);
      }
    }
```

- [ ] **Step 4: Populate the new fields in `gatherPressKitData`.** Add these queries alongside the existing `Promise.all` and build the arrays:

```ts
  const [commentCount, contributions, timeLogsByMember] = await Promise.all([
    prisma.taskComment.count({ where: { task: { projectId } } }),
    prisma.task.groupBy({ by: ["id"], where: { projectId, status: "DONE" }, _count: true }).catch(() => []),
    prisma.timeLog.groupBy({ by: ["memberId"], where: { task: { projectId } }, _sum: { minutes: true } }).catch(() => []),
  ]);
```

Then build `contributors` from the project members joined with done-task counts and logged hours (use the already-loaded `project.members`; count done tasks per member via a `prisma.task.count` per assignee is acceptable, or map from `timeLogsByMember`). Concretely:

```ts
  const hoursByMember = new Map<string, number>(
    (timeLogsByMember as { memberId: string; _sum: { minutes: number | null } }[])
      .map((r) => [r.memberId, Math.round((r._sum.minutes ?? 0) / 60)])
  );
  const doneByMember = new Map<string, number>();
  for (const pm of project.members) {
    const n = await prisma.task.count({
      where: { projectId, status: "DONE", assignees: { some: { memberId: pm.member.id } } },
    });
    if (n > 0) doneByMember.set(pm.member.id, n);
  }
  const contributors = project.members
    .map((pm) => ({
      displayName: pm.member.displayName,
      tasksDone: doneByMember.get(pm.member.id) ?? 0,
      hours: hoursByMember.get(pm.member.id) ?? 0,
    }))
    .filter((c) => c.tasksDone > 0 || c.hours > 0)
    .sort((a, b) => (b.tasksDone + b.hours) - (a.tasksDone + a.hours));

  const timeline = project.milestones
    .map((m) => ({ title: m.title, date: m.completedAt, kind: "milestone" as const }))
    .sort((a, b) => (a.date?.getTime() ?? 0) - (b.date?.getTime() ?? 0));
```

Add `commentCount` to the returned `stats`, and `contributors` + `timeline` to the returned object.

> If `task.assignees` is not the correct relation for done-per-member (verify in Step "Before you start"), fall back to `doneByMember` staying empty — the contributors list still renders from hours.

- [ ] **Step 5: Run the test — expect PASS, then typecheck.**

Run: `cd backend && npx tsx src/services/pressKitService.test.ts`
Expected: `N passed, 0 failed`.
Run: `cd backend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit.**

```bash
git add backend/src/services/pressKitService.ts backend/src/services/pressKitService.test.ts
git commit -m "feat(presskit): richer generation — contributors, dated timeline, comment count"
```

---

## Phase 6 — Press-kit exports (PDF · Word · Markdown · HTML)

### Task 6.1: Backend Markdown util (TDD)

**Files:**
- Create: `backend/src/services/docToMarkdown.ts`
- Create: `backend/src/services/docToMarkdown.test.ts`

- [ ] **Step 1: Write the failing test** at `backend/src/services/docToMarkdown.test.ts`:

```ts
// Run: cd backend && npx tsx src/services/docToMarkdown.test.ts
import { pmDocToMarkdown } from "./docToMarkdown.js";

let passed = 0, failed = 0;
const check = (n: string, c: boolean) => { if (c) passed++; else { failed++; console.error(`  ✗ ${n}`); } };

const doc = {
  type: "doc", content: [
    { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Title" }] },
    { type: "paragraph", content: [
      { type: "text", text: "Hello " },
      { type: "text", text: "bold", marks: [{ type: "bold" }] },
    ] },
    { type: "bulletList", content: [
      { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "one" }] }] },
    ] },
    { type: "image", attrs: { src: "https://x/y.png", alt: "pic" } },
  ],
};

const md = pmDocToMarkdown(doc as any);
check("h1", md.includes("# Title"));
check("bold", md.includes("**bold**"));
check("bullet", md.includes("- one"));
check("image", md.includes("![pic](https://x/y.png)"));
check("null doc -> empty string", pmDocToMarkdown(null) === "");

console.log(`\ndocToMarkdown: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
```

- [ ] **Step 2: Run it — confirm it fails.**

Run: `cd backend && npx tsx src/services/docToMarkdown.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `backend/src/services/docToMarkdown.ts`** (a backend port of the client `blogMarkdown.js` `docToMarkdown`, using the `PMDoc`/`PMNode` types):

```ts
import type { PMDoc, PMNode, PMMark } from "./blogRender.js";

function marksWrap(text: string, marks?: PMMark[]): string {
  let out = text;
  const has = (t: string) => marks?.some((m) => m.type === t);
  if (has("code")) out = `\`${text}\``;
  if (has("bold")) out = `**${out}**`;
  if (has("italic")) out = `_${out}_`;
  if (has("strike")) out = `~~${out}~~`;
  const link = marks?.find((m) => m.type === "link");
  if (link) out = `[${out}](${String((link.attrs as { href?: string })?.href ?? "")})`;
  return out;
}

function inlineToMarkdown(content?: PMNode[]): string {
  return (content ?? []).map((n) => {
    if (n.type === "text") return marksWrap(n.text ?? "", n.marks);
    if (n.type === "hardBreak") return "  \n";
    return "";
  }).join("");
}

function firstParagraph(li: PMNode): string {
  const p = (li.content ?? []).find((c) => c.type === "paragraph");
  return p ? inlineToMarkdown(p.content) : "";
}

function tableToMarkdown(node: PMNode): string {
  const rows = (node.content ?? []).map((row) =>
    (row.content ?? []).map((cell) => inlineToMarkdown(cell.content?.[0]?.content).replace(/\|/g, "\\|")));
  if (!rows.length) return "";
  const header = rows[0];
  const sep = header.map(() => "---");
  return [header, sep, ...rows.slice(1)].map((r) => `| ${r.join(" | ")} |`).join("\n");
}

function blockToMarkdown(node: PMNode): string {
  switch (node.type) {
    case "paragraph": return inlineToMarkdown(node.content);
    case "heading": return `${"#".repeat(Number(node.attrs?.level ?? 1))} ${inlineToMarkdown(node.content)}`;
    case "blockquote":
      return (node.content ?? []).map(blockToMarkdown).join("\n\n").split("\n").map((l) => `> ${l}`).join("\n");
    case "codeBlock": {
      const lang = String(node.attrs?.language ?? "");
      const text = (node.content ?? []).map((t) => t.text ?? "").join("");
      return `\`\`\`${lang}\n${text}\n\`\`\``;
    }
    case "horizontalRule": return "---";
    case "bulletList": return (node.content ?? []).map((li) => `- ${firstParagraph(li)}`).join("\n");
    case "orderedList": return (node.content ?? []).map((li, i) => `${i + 1}. ${firstParagraph(li)}`).join("\n");
    case "taskList": return (node.content ?? []).map((li) => `- [${li.attrs?.checked ? "x" : " "}] ${firstParagraph(li)}`).join("\n");
    case "image": return `![${String(node.attrs?.alt ?? "")}](${String(node.attrs?.src ?? "")})`;
    case "gallery":
      return ((node.attrs?.images as { src?: string; url?: string; alt?: string }[]) ?? [])
        .map((im) => `![${im.alt ?? ""}](${im.src ?? im.url ?? ""})`).join("\n");
    case "embed": return `[embed](${String(node.attrs?.url ?? "")})`;
    case "callout":
      return (node.content ?? []).map(blockToMarkdown).join("\n\n").split("\n").map((l) => `> ${l}`).join("\n");
    case "table": return tableToMarkdown(node);
    // Section Builder nodes (present once the section plan lands) — flatten children.
    case "section":
    case "column":
      return (node.content ?? []).map(blockToMarkdown).join("\n\n");
    default:
      return node.content ? (node.content ?? []).map(blockToMarkdown).join("\n\n") : "";
  }
}

/** TipTap JSON doc -> Markdown string. Returns "" for null/empty docs. */
export function pmDocToMarkdown(doc: PMDoc | null | undefined): string {
  if (!doc || !doc.content) return "";
  return doc.content.map(blockToMarkdown).join("\n\n");
}
```

> Ensure `blogRender.ts` exports `PMMark` and `PMNode` (it declares `export interface PMMark`/`PMNode` — it does). If not exported, add `export`.

- [ ] **Step 4: Run the test — expect PASS.**

Run: `cd backend && npx tsx src/services/docToMarkdown.test.ts`
Expected: `docToMarkdown: 5 passed, 0 failed`.

- [ ] **Step 5: Commit.**

```bash
git add backend/src/services/docToMarkdown.ts backend/src/services/docToMarkdown.test.ts
git commit -m "feat(presskit): pure TipTap-JSON -> Markdown util for export"
```

### Task 6.2: Export dependencies + route

**Files:**
- Modify: `backend/package.json` (via `npm install`)
- Modify: `backend/src/api/pressKit.ts`

- [ ] **Step 1: Install the export deps.**

Run: `cd backend && npm install puppeteer html-to-docx`
Expected: both added to `dependencies`. (Puppeteer downloads a Chromium build — this is the accepted footprint. On a headless server it needs `--no-sandbox`, handled below.)

- [ ] **Step 2: Add imports to `backend/src/api/pressKit.ts`** (top of file). Note `html-to-docx` is CommonJS with a default export:

```ts
import puppeteer, { type Browser } from "puppeteer";
import htmlToDocx from "html-to-docx";
import { buildPressKitHtml } from "../services/pressKitService.js";
import { pmDocToMarkdown } from "../services/docToMarkdown.js";
```

> If `esModuleInterop` complains about `html-to-docx`, use `import * as htmlToDocxNS from "html-to-docx";` and `const htmlToDocx = (htmlToDocxNS as any).default ?? htmlToDocxNS;`.

- [ ] **Step 3: Add a lazily-launched shared browser** (module scope, after the imports):

```ts
let browserPromise: Promise<Browser> | null = null;
async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
  }
  return browserPromise;
}
```

- [ ] **Step 4: Add the export route** (before the DELETE route added in Task 3.2):

```ts
// GET /api/projects/:projectId/press-kit/export?format=pdf|docx|md|html
pressKitRouter.get("/projects/:projectId/press-kit/export", async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params as { projectId: string };
    if (!(await hasProjectAccess(req.memberId!, projectId))) { res.status(403).json({ error: "Forbidden" }); return; }
    const format = String((req.query as { format?: string }).format ?? "html");

    const project = await prisma.project.findUnique({ where: { id: projectId }, select: { name: true } });
    const base = (project?.name ?? "press-kit").replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "press-kit";

    if (format === "md") {
      const kit = await prisma.projectPressKit.findUnique({ where: { projectId }, select: { contentJson: true } });
      const md = pmDocToMarkdown(kit?.contentJson as unknown as PMDoc | null);
      if (!md.trim()) { res.status(400).json({ error: "Nothing to export — generate first" }); return; }
      res.setHeader("Content-Type", "text/markdown; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${base}.md"`);
      res.send(md);
      return;
    }

    const html = await buildPressKitHtml(projectId);
    if (!html) { res.status(400).json({ error: "Nothing to export — generate first" }); return; }

    if (format === "html") {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${base}.html"`);
      res.send(html);
      return;
    }
    if (format === "docx") {
      const buffer = (await htmlToDocx(html)) as Buffer | ArrayBuffer;
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
      res.setHeader("Content-Disposition", `attachment; filename="${base}.docx"`);
      res.send(Buffer.from(buffer as ArrayBuffer));
      return;
    }
    if (format === "pdf") {
      const browser = await getBrowser();
      const page = await browser.newPage();
      try {
        await page.setContent(html, { waitUntil: "networkidle0" });
        const pdf = await page.pdf({
          format: "Letter", printBackground: true,
          margin: { top: "0.5in", bottom: "0.5in", left: "0.5in", right: "0.5in" },
        });
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="${base}.pdf"`);
        res.send(Buffer.from(pdf));
      } finally { await page.close(); }
      return;
    }
    res.status(400).json({ error: "Unknown format" });
  } catch (e) { console.error("GET press-kit/export error:", e); res.status(500).json({ error: "Export failed" }); }
});
```

> `PMDoc` is already imported in `pressKit.ts` (`import type { PMDoc } ...`). For PDF/DOCX image fidelity, `buildPressKitHtml` must emit **absolute** image URLs — ensure `PUBLIC_API_BASE_URL` is set in the backend env (Task 4.2 Step 6 wires it into `buildPressKitHtml`). Puppeteer fetches those over the network; the API must be reachable from the server (localhost is fine).

- [ ] **Step 5: Typecheck.**

Run: `cd backend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit.**

```bash
git add backend/package.json backend/package-lock.json backend/src/api/pressKit.ts
git commit -m "feat(presskit): export route (pdf via puppeteer, docx, md, html)"
```

### Task 6.3: Client download helper + Export menu

**Files:**
- Modify: `src/api/clubPmClient.js`
- Modify: `src/components/clubpm/PressKitPanel.jsx`

- [ ] **Step 1: Add the download helper** to `src/api/clubPmClient.js`, right after `deletePressKit` (added in Task 3.2):

```js
// Authenticated file download for press-kit exports (a plain <a href> omits the
// Bearer header). Mirrors downloadMeetingPollIcs.
export async function downloadPressKitExport(projectId, format, projectName = 'press-kit') {
  const ext = ({ pdf: 'pdf', docx: 'docx', md: 'md', html: 'html' })[format] || 'txt';
  const response = await fetch(`${BASE_URL}/api/projects/${projectId}/press-kit/export?format=${format}`, {
    credentials: 'include',
    headers: { ...authHeaders() },
  });
  if (!response.ok) throw new ApiError(response.status, 'Export failed');
  const blob = await response.blob();
  const safe = String(projectName).replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'press-kit';
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `${safe}.${ext}`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}
```

> `authHeaders`, `ApiError`, and `BASE_URL` are already defined in this module (used by `downloadMeetingPollIcs`/`uploadBlogImage`).

- [ ] **Step 2: Wire an Export menu into `PressKitPanel.jsx`.** Add `downloadPressKitExport` to the `clubPmClient` import block. Add local state near the other `useState`s:

```jsx
  const [showExport, setShowExport] = useState(false);
```

Add a handler after `handleDelete`:

```jsx
  const handleExport = useCallback(async (format) => {
    setShowExport(false);
    const t = toast.loading(`Exporting ${format.toUpperCase()}…`);
    try {
      await downloadPressKitExport(projectId, format, project.name);
      toast.dismiss(t); toast.success('Export ready');
    } catch { toast.dismiss(t); toast.error('Export failed'); }
  }, [projectId, project.name]);
```

Render an Export dropdown in the editor-state toolbar, right before the "Publish & share" button (~line 188):

```jsx
        <div className="presskit-export-wrap">
          <button type="button" className="clubpm-btn-secondary" onClick={() => setShowExport((v) => !v)} disabled={busy}>
            <i className="fas fa-file-arrow-down" aria-hidden="true" style={{ marginRight: 6 }} />Export
          </button>
          {showExport && (
            <div className="presskit-export-menu" role="menu">
              <button type="button" role="menuitem" onClick={() => handleExport('pdf')}>PDF</button>
              <button type="button" role="menuitem" onClick={() => handleExport('docx')}>Word (.docx)</button>
              <button type="button" role="menuitem" onClick={() => handleExport('md')}>Markdown</button>
              <button type="button" role="menuitem" onClick={() => handleExport('html')}>HTML</button>
            </div>
          )}
        </div>
```

- [ ] **Step 3: Add menu styles.** Append to the bottom of `public/search-theme.css`:

```css
/* Press-kit export menu */
.presskit-export-wrap { position: relative; display: inline-block; }
.presskit-export-menu {
  position: absolute; top: calc(100% + 4px); right: 0; z-index: 40;
  background: var(--pm-elevated, #1b2130); border: 1px solid var(--pm-overlay, #2a2f3a);
  border-radius: 8px; padding: 4px; display: flex; flex-direction: column; min-width: 150px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.35);
}
.presskit-export-menu button {
  background: none; border: none; text-align: left; color: var(--pm-text, #e6ebf2);
  padding: 8px 10px; border-radius: 6px; cursor: pointer; font: inherit;
}
.presskit-export-menu button:hover { background: var(--pm-overlay, #2a2f3a); color: var(--pm-accent-teal, #00e5cc); }
```

- [ ] **Step 4: Build.**

Run (repo root): `npm run build`
Expected: "Compiled successfully".

- [ ] **Step 5: Commit.**

```bash
git add src/api/clubPmClient.js src/components/clubpm/PressKitPanel.jsx public/search-theme.css
git commit -m "feat(presskit): Export menu (PDF/Word/Markdown/HTML) in the press-kit panel"
```

---

## Self-Review notes (verify before handing off)

- **Spec coverage:** icons (P1), expand (P2), delete blog+presskit (P3), image proxy incl. legacy healing (P4), richer content (P5), exports PDF/docx/md/html (P6). ✅ Section Builder is the separate plan.
- **Type consistency:** `streamDriveFile`, `proxyImageSrc(src, baseUrl)`, `pmDocToMarkdown`, `deletePressKit`, `downloadPressKitExport` names match across backend/frontend.
- **Env:** `PUBLIC_API_BASE_URL` is optional but required for legacy cross-origin image healing and for PDF/DOCX image fidelity — document it in the deploy notes.

## Manual verification (human, needs running backend + DB + GEMINI + Drive)

- Upload an image → renders in editor + preview + published page; open a pre-existing broken post → now renders through the proxy.
- Delete a draft blog post (author) and a press kit (member) → gone; a non-author blog delete is rejected.
- Generate a press kit → stats show hours/comments, timeline is dated, contributors listed.
- Export each format → PDF is branded and shows images; `.docx` opens in Word; `.md` re-imports cleanly; `.html` opens standalone.
- All ClubPM + marketing icons render after the FA6 bump.
