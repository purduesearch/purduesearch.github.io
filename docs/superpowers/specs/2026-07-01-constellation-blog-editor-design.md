# Constellation Blog Editor — Design Spec

**Date:** 2026-07-01
**Status:** Approved for planning
**Location in product:** Constellation (`/clubpm`) → Outreach section ([OutreachHub.jsx](../../../src/pages/ClubPM/OutreachHub.jsx))

---

## 1. Goal

Replace the current barebones "blog" experience — a single AI action that writes markdown onto an `OutreachSubmission` row — with a full-featured, Ghost/Notion-class blog editor built into the Outreach section of Constellation. It must support rich WYSIWYG editing, media, structured blocks, a real publishing workflow, SEO metadata, and full realtime multi-user co-editing.

**Hard constraints:**
- **Fully free / open-source only.** No paid services. TipTap (MIT), Hocuspocus + Yjs (MIT), `sharp` (MIT), oEmbed public endpoints. Media reuses the existing Google Drive pipeline.
- **Runs on the existing backend server.** The realtime collaboration WebSocket is embedded on the existing Express HTTP server (same process, same host) via the server's `upgrade` handler — no separate service or hosting.

---

## 2. Current State (what exists today)

- **No dedicated blog model.** A "blog post" is an `OutreachSubmission` row with `blogMarkdown` + `blogSlug` set ([schema.prisma:731-763](../../../backend/prisma/schema.prisma#L731-L763)).
- **"Publishing" = one AI action.** `POST /submissions/:id/ai/expand-blog` ([outreach.ts:1063](../../../backend/src/api/outreach.ts#L1063)) expands a short caption to long-form markdown via Gemini (`aiOutreachService.expandToBlog`), auto-generates a slug, writes both fields. That write *is* the publish — no draft gate, scheduling, SEO, cover, tags, revisions, or autosave.
- **Public read path:** `GET /api/public/blog` + `/api/public/blog/:slug` ([public.ts:191-235](../../../backend/src/api/public.ts#L191-L235)) → [Blog.jsx](../../../src/pages/Blog.jsx) (cards) and [BlogPost.jsx](../../../src/pages/BlogPost.jsx) (renders `blogMarkdown` via `<ReactMarkdown>`).
- **No rich-text editor library installed.** Only `react-markdown` (read-only render).
- **Outreach backbone already provides:** comment threads (`OutreachComment`), approval workflow (`Campaign.requiredApprovers` + `ApprovalRecord`), `scheduledAt`, Google Drive media upload (`driveService`), AI drafting, `ai/alt-text`, and the cron host `scheduler.ts`.

---

## 3. Architecture Decisions

### 3.1 Data model — dedicated `BlogPost`
New Prisma models, isolated from outreach concerns. Content is stored three ways for three jobs:

- `contentJson Json` — the TipTap document; **source of truth** for editing and revision diffs.
- `contentYjs Bytes?` — the Yjs/CRDT binary state for realtime collaboration.
- `renderedHtml String?` — an HTML snapshot written **at publish time** so the public page renders with zero client-side editor.

### 3.2 Editor — TipTap v2 (React), block-based
StarterKit + extensions: tables, task lists (checklists), links (paste-autolink), images, code blocks, horizontal rule, character-count, search/replace. **Custom nodes**: embeds (YouTube/X/Instagram/CodePen via oEmbed), gallery/carousel, callout/CTA snippet, and a Table-of-Contents node. Optional markdown toggle for power users via markdown serialize/paste.

### 3.3 Realtime collaboration — Hocuspocus + Yjs, embedded
TipTap's official collaboration stack. A Hocuspocus (or raw `y-websocket`) server is attached to the **existing** Express HTTP server's `upgrade` handler, authenticated with the current session/token, persisting the Yjs doc to `BlogPost.contentYjs`. `Collaboration` + `CollaborationCursor` extensions give live co-editing **and** presence/"who's editing" avatars.

### 3.4 Media — existing Google Drive pipeline + compression
Drag-drop upload → `sharp` compression/resize on the backend → `driveService` → stable URL. Alt-text nudge reuses `ai/alt-text`. Galleries store an ordered URL list on the node.

### 3.5 Public rendering — serve the HTML snapshot
`Blog.jsx`/`BlogPost.jsx` repoint to the new model and render `renderedHtml` (no TipTap in the public GitHub Pages bundle). Scheduled auto-publish rides the existing `scheduler.ts` cron.

### 3.6 Frontend home — "Blog" tab + full-screen editor
A "Blog" tab in `OutreachHub.jsx` lists posts by status. Editing opens a dedicated full-screen route (`/clubpm/outreach/blog/:id/edit`). Publishing reuses the existing approval workflow (`requiredApprovers`) so a post can require sign-off before going live.

### 3.7 AI expand-to-blog — **must keep working**
The existing `expand-blog` flow is a valued entry point and must be preserved end to end:
- `POST /submissions/:id/ai/expand-blog` is **repointed** to create (or update) a `BlogPost` **draft** instead of writing `blogMarkdown`/`blogSlug` on the submission.
- The Gemini output (markdown) is converted into TipTap `contentJson` (markdown→JSON) so the AI-generated post opens cleanly in the new editor for further editing.
- The resulting draft is reachable from the Outreach board (the existing "expand to blog" affordance in [OutreachHub.jsx](../../../src/pages/ClubPM/OutreachHub.jsx) `SubmissionCard`) — clicking it opens the new editor on the created `BlogPost`.
- A migration/back-compat step ports existing `OutreachSubmission` rows that have `blogMarkdown` + `blogSlug` into `BlogPost` rows so already-published posts keep their URLs and keep resolving on the public site.
- **Acceptance:** from an outreach submission, "Expand to blog" produces an editable `BlogPost` draft; the AI content renders in TipTap; publishing it makes it appear on `/blog` and `/blog/:slug` exactly as before (or better).

---

## 4. Data Model (detail)

```
enum BlogStatus { DRAFT SCHEDULED PUBLISHED ARCHIVED }

model BlogPost {
  id             String     @id @default(cuid())
  title          String
  slug           String     @unique
  excerpt        String?
  status         BlogStatus @default(DRAFT)
  contentJson    Json                     // TipTap doc — source of truth
  contentYjs     Bytes?                   // Yjs CRDT state (realtime)
  renderedHtml   String?                  // publish-time HTML snapshot
  coverImageUrl  String?
  readingTimeMin Int?
  // SEO
  metaDescription String?
  canonicalUrl    String?
  ogTitle         String?
  ogDescription   String?
  ogImageUrl      String?
  // workflow
  scheduledAt    DateTime?
  publishedAt    DateTime?
  // provenance / links
  sourceSubmissionId String?              // set when created via expand-blog
  createdById    String
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  authors    BlogAuthor[]
  revisions  BlogRevision[]
  tags       BlogTag[]       @relation("BlogPostTags")
  categories BlogCategory[]  @relation("BlogPostCategories")

  @@index([status])
  @@index([slug])
}

model BlogRevision {
  id          String   @id @default(cuid())
  postId      String
  post        BlogPost @relation(fields: [postId], references: [id], onDelete: Cascade)
  contentJson Json
  title       String
  authorId    String
  createdAt   DateTime @default(now())
  @@index([postId])
}

model BlogAuthor {   // multi-author join
  id       String   @id @default(cuid())
  postId   String
  post     BlogPost @relation(fields: [postId], references: [id], onDelete: Cascade)
  memberId String
  role     String?  // e.g. "author", "editor"
  @@unique([postId, memberId])
}

model BlogTag {
  id    String     @id @default(cuid())
  name  String     @unique
  slug  String     @unique
  posts BlogPost[] @relation("BlogPostTags")
}

model BlogCategory {
  id    String     @id @default(cuid())
  name  String     @unique
  slug  String     @unique
  posts BlogPost[] @relation("BlogPostCategories")
}

model BlogSnippet {  // reusable content blocks (CTA boxes, etc.)
  id          String   @id @default(cuid())
  name        String
  contentJson Json
  createdById String
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
```

Internal draft annotations reuse `OutreachComment` (add a nullable `blogPostId` or a thin reference) rather than a new comment model.

---

## 5. Feature → Phase Coverage

Every feature from the brief is covered:

| Feature area | Phase(s) |
|---|---|
| Rich text formatting, headings, blockquotes, code, lists, checklists, undo/redo | 2.1 |
| Autosave, save-as-draft vs publish, unsaved-changes warning, word/char count | 2.2 |
| Inline links (+paste autolink), tables, find & replace | 2.3 |
| Image upload/compression, resize, alignment, captions, alt text + reminder | 3.1, 3.2 |
| Embeds (YouTube/X/Instagram/CodePen), galleries/carousels | 3.3 |
| Table of contents | 4.1 |
| Reusable snippets / CTA blocks | 4.2 |
| Status indicators, scheduled publish, unpublish/archive, approval | 5.1 |
| Scheduled auto-publish | 5.2 |
| Version history + rollback, preview mode | 5.3 |
| Title/slug, meta description + counter, cover, tags, categories, canonical, OG, reading time | 6.1 |
| Realtime co-editing + "currently editing" presence | 7.1, 7.2 |
| Draft comments/annotations, multi-author | 7.3, (authors in 1.1/6.1) |
| Keyboard shortcuts, responsive editor, markdown toggle | 8.1 |
| **AI expand-to-blog preserved** | 1.3 (repoint) + 1.1 (back-compat migration) |

---

## 6. Phased Plan

Sequenced so **no phase mixes a Prisma migration with frontend work**, each touches ≤4 files / ≤2 new components, and each ends with a green `npm run build` (repo root) + `npx tsc --noEmit` (backend). Optimized for small, self-contained Sonnet-friendly context windows.

### Epic 1 — Backend foundation
- **1.1** Prisma: `BlogPost`, `BlogRevision`, `BlogTag`, `BlogCategory`, `BlogAuthor`, `BlogSnippet`, `BlogStatus` enum; migration; **back-compat data migration** porting existing `blogMarkdown`/`blogSlug` submissions into `BlogPost`. *(migration only)*
- **1.2** `blogService.ts`: CRUD, slug generation (auto + collision suffix), reading-time calc, revision snapshotting, JSON→HTML render (server-side `generateHTML`), markdown→JSON helper (for expand-blog). *(backend service)*
- **1.3** `api/blog.ts`: CRUD + publish/schedule/archive/unpublish, revisions list/rollback, tags/categories/snippets; mount in `app.ts`; **repoint `expand-blog`** to create a `BlogPost` draft from the AI markdown. *(backend routes)*
- **1.4** Repoint public API (`public.ts` → `BlogPost`, serve `renderedHtml`) + update [Blog.jsx](../../../src/pages/Blog.jsx)/[BlogPost.jsx](../../../src/pages/BlogPost.jsx) to render HTML + author/tags/reading-time/cover/OG. *(public read path)*

### Epic 2 — Core editor
- **2.1** Install TipTap; `BlogEditor.jsx` shell + toolbar (bold/italic/underline/strike, H1–H6, blockquote, code block, ordered/unordered/nested lists, checklists, HR, undo/redo); full-screen editor route + "Blog" tab in `OutreachHub.jsx`.
- **2.2** `clubPmClient` blog methods; load/save `contentJson`; debounced autosave; save-as-draft vs publish; unsaved-changes guard; live word/char count.
- **2.3** Links (insert/edit + paste-autolink), tables (add/remove rows & cols), find & replace.

### Epic 3 — Media & embeds
- **3.1** Backend image upload with `sharp` compression/resize via `driveService`; reuse `ai/alt-text`.
- **3.2** Image node: drag-drop upload, resize, alignment (left/center/right/full-width), captions, alt-text field + fill-in reminder.
- **3.3** Embed custom nodes (YouTube/X/Instagram/CodePen via oEmbed) + gallery/carousel block.

### Epic 4 — Structure & organization
- **4.1** Auto-generated Table-of-Contents node from headings.
- **4.2** Reusable snippets (`BlogSnippet` CRUD + insert into editor) and CTA block.

### Epic 5 — Publishing workflow
- **5.1** Status indicators (Draft/Scheduled/Published/Archived), publish/unpublish/archive controls, scheduled datetime picker, approval-workflow reuse.
- **5.2** Scheduled auto-publish cron in `scheduler.ts` (flip `SCHEDULED`→`PUBLISHED`, write HTML snapshot).
- **5.3** Revision history UI (list/view/rollback) + preview mode (renders exactly as public).

### Epic 6 — Metadata & SEO
- **6.1** Metadata panel: title, slug (auto + manual override), meta description w/ counter, cover selector, tags & categories, canonical URL, OG title/description/image, reading-time display.

### Epic 7 — Realtime collaboration
- **7.1** Embed Hocuspocus/`y-websocket` on the existing HTTP server; session auth; persist Yjs → `contentYjs`. *(backend)*
- **7.2** `Collaboration` + `CollaborationCursor` extensions; presence avatars / "currently editing" indicator.
- **7.3** Draft annotations / internal review notes reusing the `OutreachComment` thread; surface multi-author management.

### Epic 8 — UX polish
- **8.1** Keyboard-shortcut map, responsive/mobile editor layout, optional markdown toggle, final CSS pass (append to `public/search-theme.css`).

---

## 7. Testing & Verification

- After **every** phase: `npm run build` (repo root) and `npx tsc --noEmit` (backend/). Fix all errors before proceeding.
- After Phases 1.1, 1.3, and 1.4: verify the **AI expand-to-blog acceptance** (Section 3.7) end to end.
- Phase 5.2: verify a `SCHEDULED` post with a past `scheduledAt` flips to `PUBLISHED` and its `renderedHtml` appears on the public page.
- Phase 7.2: verify two browser sessions editing the same post see each other's cursors and converge without overwrite.

---

## 8. Out of Scope (v1)

- Public-facing reader comments (internal draft annotations only).
- Full-text public blog search (existing card/list is sufficient).
- Non-blog outreach types are untouched — this spec only adds the blog surface.
