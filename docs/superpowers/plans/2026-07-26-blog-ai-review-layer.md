# Blog AI + Review Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add anchored comments, tracked suggestions, an AI editing panel, and manually-triggered inline autocomplete to the ClubPM blog/press-kit editor, where every AI-proposed change lands as a reviewable suggestion rather than a direct write.

**Architecture:** A suggestion layer is the substrate: anchors are ProseMirror marks living in the shared Y.Doc (so they drift correctly under concurrent editing), while thread and comment bodies are Postgres rows (so they are queryable and notifiable). The AI panel is a producer on top of that layer — it returns quote-and-replace edits which the client locates in the live document and converts into suggestion marks. Inline autocomplete deliberately bypasses the layer (accepting with Tab *is* the review step) and gets its own cheap-model rate-limit lane.

**Tech Stack:** React 19, TipTap 3.27 (`@tiptap/core`, `@tiptap/react`, `@tiptap/react/menus`, `@tiptap/pm`), Yjs + `@hocuspocus/provider`, Express, Prisma/PostgreSQL, `@google/generative-ai` (Gemini), jest (frontend), `npx tsx` script-style tests (backend).

**Spec:** [`docs/superpowers/specs/2026-07-26-blog-ai-review-layer-design.md`](../specs/2026-07-26-blog-ai-review-layer-design.md)

## Global Constraints

- **No new runtime dependencies.** BubbleMenu comes from `@tiptap/react/menus`, already present in the installed `@tiptap/react@3.27`. TipTap Pro Comments/AI extensions are explicitly rejected.
- **All new CSS goes in `public/clubpm-theme.css`**, appended at the bottom, never `public/search-theme.css`. The review marks are stripped at publish, so none of these classes can reach a public page.
- **Backend handlers read `req.memberId`, never `req.session.memberId`.** Session reads are `undefined` for Bearer-token users and silently break them.
- **Three files must stay in lockstep** for every mark added: `blogExtensions()` in `src/components/clubpm/blog/BlogEditor.jsx`, `backend/src/collab/blogSchema.ts`, and `backend/src/services/blogRender.ts`. Every failure mode here is silent.
- **After every task:** `npm run build` at the repo root and `npx tsc --noEmit` in `backend/`. Fix all errors before moving on.
- **After any `schema.prisma` edit, run `npx prisma generate`** before `npx tsc --noEmit`. A stale Prisma client produces phantom type errors on fields that do exist.
- Icons are Font Awesome classes only (`<i className="fas fa-..." aria-hidden="true" />`). Never emoji.
- ClubPM design tokens: `--pm-accent-teal` (#00e5cc), `--pm-accent-amber` (#f5a623), `--pm-accent-coral`, `--pm-surface`, `--pm-elevated`, `--pm-font-body`.
- Commit messages are conventional-commit style, e.g. `feat(blog): add suggestion marks`.
- `docType` is always the string `BLOG_POST` or `PRESS_KIT`.

---

## File Structure

**Created:**

| File | Responsibility |
|---|---|
| `src/components/clubpm/blog/suggestionMarks.js` | The three marks, the commands that apply/accept/reject them, `findMarkRanges`, and the thread-position plugin |
| `src/components/clubpm/blog/suggestionMarks.test.js` | Unit tests for `findMarkRanges` against a minimal ProseMirror schema |
| `src/components/clubpm/blog/aiQuoteMatch.js` | Locate an AI-supplied quote in a TipTap doc; pure |
| `src/components/clubpm/blog/aiQuoteMatch.test.js` | All four matching tiers plus the give-up case |
| `src/components/clubpm/blog/BlogSelectionBubble.jsx` | BubbleMenu: Comment / Suggest edit / Ask AI |
| `src/components/clubpm/blog/BlogThreadCard.jsx` | One thread: anchor quote, proposed diff, replies, accept/reject |
| `src/components/clubpm/blog/BlogThreadList.jsx` | Filterable thread list, fetch + mutation orchestration |
| `src/components/clubpm/blog/BlogAiPanel.jsx` | Ask / Improve selection / Improve whole post |
| `src/components/clubpm/blog/blogAutocomplete.js` | Ghost-text TipTap extension |
| `backend/src/services/blogThreadService.ts` | Thread persistence + the pure permission predicates |
| `backend/src/services/blogThreadService.test.ts` | Permission predicate tests (pure, no DB) |
| `backend/src/api/blogThreads.ts` | Thread REST routes |
| `backend/src/services/blogAiService.ts` | Doc flattening, prompts, Gemini calls for ask/edit/complete |
| `backend/src/api/blogAi.ts` | AI REST routes |

**Modified:** `backend/prisma/schema.prisma`, `backend/src/app.ts`, `backend/src/collab/blogSchema.ts`, `backend/src/services/blogRender.ts`, `backend/src/services/blogRender.test.ts`, `backend/src/services/blogSchemaContract.test.ts`, `backend/src/services/geminiService.ts`, `src/components/clubpm/blog/BlogEditor.jsx`, `src/components/clubpm/blog/BlogAnnotationsPanel.jsx`, `src/api/clubPmClient.js`, `public/clubpm-theme.css`.

---

## Task 1: Prisma schema — threads, comments, enums

**Files:**
- Modify: `backend/prisma/schema.prisma`

**Interfaces:**
- Consumes: nothing.
- Produces: Prisma models `BlogThread`, `BlogThreadComment`; enums `BlogThreadKind` (`COMMENT | SUGGESTION`), `BlogThreadStatus` (`OPEN | RESOLVED | ACCEPTED | REJECTED`), `BlogThreadOrigin` (`HUMAN | AI`); a new `NotificationType` value `BLOG_COMMENTED`.

- [ ] **Step 1: Add the three enums**

Add next to the other enums (near `enum NotificationType` at line 98):

```prisma
enum BlogThreadKind {
  COMMENT
  SUGGESTION
}

enum BlogThreadStatus {
  OPEN
  RESOLVED
  ACCEPTED
  REJECTED
}

enum BlogThreadOrigin {
  HUMAN
  AI
}
```

- [ ] **Step 2: Add `BLOG_COMMENTED` to `NotificationType`**

Append it as the last value of `enum NotificationType` (after `MEETING_POLL_REMINDER`). Task 16 uses it; adding it now means only one migration.

```prisma
  MEETING_POLL_REMINDER
  BLOG_COMMENTED
}
```

- [ ] **Step 3: Add the two models**

Place after `model BlogSnippet`:

```prisma
model BlogThread {
  id           String           @id @default(cuid())
  // Exactly one of postId / pressKitId is set — enforced in blogThreadService.
  postId       String?
  post         BlogPost?        @relation(fields: [postId], references: [id], onDelete: Cascade)
  pressKitId   String?
  pressKit     ProjectPressKit? @relation(fields: [pressKitId], references: [id], onDelete: Cascade)
  kind         BlogThreadKind
  status       BlogThreadStatus @default(OPEN)
  origin       BlogThreadOrigin @default(HUMAN)
  // Snapshot of the quoted text. The marks in the Y.Doc are the live anchor;
  // this lets an orphaned thread still show what it referred to.
  anchorText   String
  replaceWith  String? // SUGGESTION only: the proposal, denormalised for panel display
  rationale    String? // AI's stated reason, shown on the card
  createdById  String
  createdBy    Member           @relation("BlogThreadCreator", fields: [createdById], references: [id])
  resolvedById String?
  resolvedAt   DateTime?
  createdAt    DateTime         @default(now())
  updatedAt    DateTime         @updatedAt
  comments     BlogThreadComment[]

  @@index([postId, status])
  @@index([pressKitId, status])
}

model BlogThreadComment {
  id        String     @id @default(cuid())
  threadId  String
  thread    BlogThread @relation(fields: [threadId], references: [id], onDelete: Cascade)
  authorId  String
  author    Member     @relation("BlogThreadCommenter", fields: [authorId], references: [id])
  body      String
  createdAt DateTime   @default(now())
  updatedAt DateTime   @updatedAt

  @@index([threadId, createdAt])
}
```

- [ ] **Step 4: Add the back-relations**

Prisma requires the other side of every relation. Add to `model Member`:

```prisma
  blogThreadsCreated  BlogThread[]        @relation("BlogThreadCreator")
  blogThreadComments  BlogThreadComment[] @relation("BlogThreadCommenter")
```

Add to `model BlogPost`:

```prisma
  threads     BlogThread[]
```

Add to `model ProjectPressKit`:

```prisma
  threads      BlogThread[]
```

- [ ] **Step 5: Run the migration**

```bash
cd backend && npx prisma migrate dev --name blog_threads
```

Expected: a new folder under `backend/prisma/migrations/` and "Your database is now in sync with your schema."

- [ ] **Step 6: Regenerate the client and typecheck**

```bash
cd backend && npx prisma generate && npx tsc --noEmit
```

Expected: no output from `tsc`. If `tsc` reports that `blogThread` does not exist on `PrismaClient`, `prisma generate` did not run — run it again.

- [ ] **Step 7: Commit**

```bash
git add backend/prisma
git commit -m "feat(blog): add BlogThread + BlogThreadComment schema"
```

---

## Task 2: Thread service with pure permission predicates

**Files:**
- Create: `backend/src/services/blogThreadService.ts`
- Create: `backend/src/services/blogThreadService.test.ts`

**Interfaces:**
- Consumes: Prisma models from Task 1.
- Produces:
  - `type DocType = "BLOG_POST" | "PRESS_KIT"`
  - `type DocRef = { docType: DocType; docId: string }`
  - `canSetThreadStatus(args: { status: string; isDocEditor: boolean; isThreadCreator: boolean }): boolean`
  - `canDeleteComment(args: { isDocEditor: boolean; isCommentAuthor: boolean }): boolean`
  - `isDocEditor(ref: DocRef, memberId: string): Promise<boolean>`
  - `docExists(ref: DocRef): Promise<boolean>`
  - `listThreads(ref: DocRef): Promise<ThreadDto[]>`
  - `createThread(ref: DocRef, memberId: string, input: CreateThreadInput): Promise<ThreadDto>`
  - `addComment(threadId: string, memberId: string, body: string): Promise<ThreadDto>`
  - `updateComment(commentId: string, memberId: string, body: string): Promise<ThreadDto>`
  - `deleteComment(commentId: string, memberId: string, docEditor: boolean): Promise<ThreadDto>`
  - `setThreadStatus(threadId: string, memberId: string, status: BlogThreadStatus, docEditor: boolean): Promise<ThreadDto>`
  - `getThreadDocRef(threadId: string): Promise<DocRef | null>`
  - `CreateThreadInput = { kind: "COMMENT" | "SUGGESTION"; anchorText: string; body: string; replaceWith?: string; rationale?: string; origin?: "HUMAN" | "AI" }`

- [ ] **Step 1: Write the failing test**

Create `backend/src/services/blogThreadService.test.ts`. This tests only the pure predicates — the existing backend tests are script-style with no DB, and this follows that pattern.

```ts
// Pure permission-predicate tests for blog review threads.
// Run: cd backend && npx tsx src/services/blogThreadService.test.ts
import { canSetThreadStatus, canDeleteComment } from "./blogThreadService.js";

let passed = 0, failed = 0;
const check = (n: string, c: boolean) => { if (c) passed++; else { failed++; console.error(`  ✗ ${n}`); } };

// Accepting or rejecting a suggestion changes the document — editors only.
check("editor may accept",
  canSetThreadStatus({ status: "ACCEPTED", isDocEditor: true, isThreadCreator: false }) === true);
check("editor may reject",
  canSetThreadStatus({ status: "REJECTED", isDocEditor: true, isThreadCreator: false }) === true);
check("non-editor may NOT accept",
  canSetThreadStatus({ status: "ACCEPTED", isDocEditor: false, isThreadCreator: true }) === false);
check("non-editor may NOT reject",
  canSetThreadStatus({ status: "REJECTED", isDocEditor: false, isThreadCreator: true }) === false);

// Resolving is bookkeeping — editors on any thread, others on their own.
check("editor may resolve anyone's thread",
  canSetThreadStatus({ status: "RESOLVED", isDocEditor: true, isThreadCreator: false }) === true);
check("author may resolve their own thread",
  canSetThreadStatus({ status: "RESOLVED", isDocEditor: false, isThreadCreator: true }) === true);
check("non-editor may NOT resolve someone else's thread",
  canSetThreadStatus({ status: "RESOLVED", isDocEditor: false, isThreadCreator: false }) === false);
check("thread creator may reopen their own",
  canSetThreadStatus({ status: "OPEN", isDocEditor: false, isThreadCreator: true }) === true);
check("unknown status is refused",
  canSetThreadStatus({ status: "BANANA", isDocEditor: true, isThreadCreator: true }) === false);

check("author may delete own comment",
  canDeleteComment({ isDocEditor: false, isCommentAuthor: true }) === true);
check("editor may delete another's comment",
  canDeleteComment({ isDocEditor: true, isCommentAuthor: false }) === true);
check("outsider may not delete another's comment",
  canDeleteComment({ isDocEditor: false, isCommentAuthor: false }) === false);

console.log(`\nblogThreadService: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd backend && npx tsx src/services/blogThreadService.test.ts
```

Expected: FAIL — cannot resolve `./blogThreadService.js`.

- [ ] **Step 3: Write the service**

Create `backend/src/services/blogThreadService.ts`:

```ts
import { prisma } from "../db/prisma.js";
import type { BlogThreadStatus } from "@prisma/client";

export type DocType = "BLOG_POST" | "PRESS_KIT";
export type DocRef = { docType: DocType; docId: string };

export type CreateThreadInput = {
  kind: "COMMENT" | "SUGGESTION";
  anchorText: string;
  body: string;
  replaceWith?: string;
  rationale?: string;
  origin?: "HUMAN" | "AI";
};

// ── Pure permission predicates ───────────────────────────────
// Kept pure and separately tested: these encode the whole review
// permission model, and getting them wrong is the failure that matters.

/**
 * ACCEPTED / REJECTED mutate the document, so only document editors
 * (creator, co-author, admin) may set them. RESOLVED / OPEN are bookkeeping:
 * editors on any thread, everyone else only on threads they started.
 */
export function canSetThreadStatus(args: {
  status: string;
  isDocEditor: boolean;
  isThreadCreator: boolean;
}): boolean {
  const { status, isDocEditor, isThreadCreator } = args;
  if (status === "ACCEPTED" || status === "REJECTED") return isDocEditor;
  if (status === "RESOLVED" || status === "OPEN") return isDocEditor || isThreadCreator;
  return false;
}

export function canDeleteComment(args: {
  isDocEditor: boolean;
  isCommentAuthor: boolean;
}): boolean {
  return args.isDocEditor || args.isCommentAuthor;
}

// ── Document access ──────────────────────────────────────────

const THREAD_INCLUDE = {
  createdBy: { select: { id: true, displayName: true, avatarUrl: true } },
  comments: {
    orderBy: { createdAt: "asc" as const },
    include: { author: { select: { id: true, displayName: true, avatarUrl: true } } },
  },
};

export async function docExists(ref: DocRef): Promise<boolean> {
  if (ref.docType === "BLOG_POST") {
    return !!(await prisma.blogPost.findUnique({ where: { id: ref.docId }, select: { id: true } }));
  }
  return !!(await prisma.projectPressKit.findUnique({ where: { id: ref.docId }, select: { id: true } }));
}

/** Creator, co-author, or admin. Press kits have no co-authors — creator or admin. */
export async function isDocEditor(ref: DocRef, memberId: string): Promise<boolean> {
  const member = await prisma.member.findUnique({ where: { id: memberId }, select: { isAdmin: true } });
  if (member?.isAdmin) return true;

  if (ref.docType === "BLOG_POST") {
    const post = await prisma.blogPost.findUnique({
      where: { id: ref.docId },
      select: { createdById: true },
    });
    if (!post) return false;
    if (post.createdById === memberId) return true;
    const coAuthor = await prisma.blogAuthor.findUnique({
      where: { postId_memberId: { postId: ref.docId, memberId } },
      select: { id: true },
    });
    return !!coAuthor;
  }

  const kit = await prisma.projectPressKit.findUnique({
    where: { id: ref.docId },
    select: { createdById: true },
  });
  return kit?.createdById === memberId;
}

function whereForRef(ref: DocRef) {
  return ref.docType === "BLOG_POST" ? { postId: ref.docId } : { pressKitId: ref.docId };
}

export async function getThreadDocRef(threadId: string): Promise<DocRef | null> {
  const thread = await prisma.blogThread.findUnique({
    where: { id: threadId },
    select: { postId: true, pressKitId: true },
  });
  if (!thread) return null;
  if (thread.postId) return { docType: "BLOG_POST", docId: thread.postId };
  if (thread.pressKitId) return { docType: "PRESS_KIT", docId: thread.pressKitId };
  return null;
}

// ── Reads / writes ───────────────────────────────────────────

export async function listThreads(ref: DocRef) {
  return prisma.blogThread.findMany({
    where: whereForRef(ref),
    include: THREAD_INCLUDE,
    orderBy: { createdAt: "asc" },
  });
}

function threadById(id: string) {
  return prisma.blogThread.findUnique({ where: { id }, include: THREAD_INCLUDE });
}

export async function createThread(ref: DocRef, memberId: string, input: CreateThreadInput) {
  const thread = await prisma.blogThread.create({
    data: {
      ...whereForRef(ref),
      kind: input.kind,
      origin: input.origin ?? "HUMAN",
      anchorText: input.anchorText.slice(0, 2000),
      replaceWith: input.replaceWith ?? null,
      rationale: input.rationale ?? null,
      createdById: memberId,
      // The opening comment is optional for AI suggestions, whose explanation
      // lives in `rationale` instead.
      ...(input.body.trim()
        ? { comments: { create: { authorId: memberId, body: input.body.trim() } } }
        : {}),
    },
    include: THREAD_INCLUDE,
  });
  return thread;
}

export async function addComment(threadId: string, memberId: string, body: string) {
  await prisma.blogThreadComment.create({ data: { threadId, authorId: memberId, body: body.trim() } });
  return threadById(threadId);
}

export async function updateComment(commentId: string, memberId: string, body: string) {
  const comment = await prisma.blogThreadComment.findUnique({ where: { id: commentId } });
  if (!comment) return null;
  if (comment.authorId !== memberId) return null; // only the author edits their own text
  await prisma.blogThreadComment.update({ where: { id: commentId }, data: { body: body.trim() } });
  return threadById(comment.threadId);
}

export async function deleteComment(commentId: string, memberId: string, docEditor: boolean) {
  const comment = await prisma.blogThreadComment.findUnique({ where: { id: commentId } });
  if (!comment) return null;
  if (!canDeleteComment({ isDocEditor: docEditor, isCommentAuthor: comment.authorId === memberId })) {
    return null;
  }
  await prisma.blogThreadComment.delete({ where: { id: commentId } });
  return threadById(comment.threadId);
}

/**
 * Idempotent on terminal status: if the thread is already ACCEPTED/REJECTED,
 * the current state is returned unchanged. This is what makes two co-editors
 * racing on the same suggestion safe — the second caller learns the outcome
 * rather than overwriting it.
 */
export async function setThreadStatus(
  threadId: string,
  memberId: string,
  status: BlogThreadStatus,
  docEditor: boolean,
) {
  const thread = await prisma.blogThread.findUnique({ where: { id: threadId } });
  if (!thread) return null;

  if (thread.status === "ACCEPTED" || thread.status === "REJECTED") {
    return threadById(threadId);
  }
  if (!canSetThreadStatus({
    status,
    isDocEditor: docEditor,
    isThreadCreator: thread.createdById === memberId,
  })) {
    return null;
  }

  const terminal = status !== "OPEN";
  await prisma.blogThread.update({
    where: { id: threadId },
    data: {
      status,
      resolvedById: terminal ? memberId : null,
      resolvedAt: terminal ? new Date() : null,
    },
  });
  return threadById(threadId);
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd backend && npx tsx src/services/blogThreadService.test.ts
```

Expected: `blogThreadService: 12 passed, 0 failed`

- [ ] **Step 5: Typecheck**

```bash
cd backend && npx tsc --noEmit
```

Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/blogThreadService.ts backend/src/services/blogThreadService.test.ts
git commit -m "feat(blog): add thread service with pure permission predicates"
```

---

## Task 3: Thread REST routes

**Files:**
- Create: `backend/src/api/blogThreads.ts`
- Modify: `backend/src/app.ts`

**Interfaces:**
- Consumes: everything `blogThreadService` produces in Task 2.
- Produces: these endpoints, all mounted under `/api/blog`:
  - `GET /api/blog/docs/:docType/:docId/threads` → `ThreadDto[]`
  - `POST /api/blog/docs/:docType/:docId/threads` → `ThreadDto`
  - `PATCH /api/blog/threads/:id` `{ status }` → `ThreadDto`
  - `POST /api/blog/threads/:id/comments` `{ body }` → `ThreadDto`
  - `PATCH /api/blog/threads/:id/comments/:cid` `{ body }` → `ThreadDto`
  - `DELETE /api/blog/threads/:id/comments/:cid` → `ThreadDto`

- [ ] **Step 1: Write the router**

Create `backend/src/api/blogThreads.ts`:

```ts
import { Router, type Request, type Response } from "express";
import { requireAuth } from "./auth.js";
import * as threads from "../services/blogThreadService.js";
import type { DocRef, DocType } from "../services/blogThreadService.js";
import type { BlogThreadStatus } from "@prisma/client";

export const blogThreadsRouter = Router();
blogThreadsRouter.use(requireAuth);

const DOC_TYPES: DocType[] = ["BLOG_POST", "PRESS_KIT"];

/**
 * Any authenticated member may read and comment on a draft — that is what makes
 * review useful. Resolves the doc and returns whether this member is also an
 * editor (which gates accept/reject), or null after sending an error response.
 */
async function resolveDoc(req: Request, res: Response): Promise<{ ref: DocRef; editor: boolean } | null> {
  const docType = req.params.docType as DocType;
  if (!DOC_TYPES.includes(docType)) {
    res.status(400).json({ error: "Unknown docType" });
    return null;
  }
  const ref: DocRef = { docType, docId: req.params.docId as string };
  if (!(await threads.docExists(ref))) {
    res.status(404).json({ error: "Document not found" });
    return null;
  }
  return { ref, editor: await threads.isDocEditor(ref, req.memberId!) };
}

/** Same, for routes addressed by thread id rather than doc. */
async function resolveThreadDoc(req: Request, res: Response): Promise<{ ref: DocRef; editor: boolean } | null> {
  const ref = await threads.getThreadDocRef(req.params.id as string);
  if (!ref) {
    res.status(404).json({ error: "Thread not found" });
    return null;
  }
  return { ref, editor: await threads.isDocEditor(ref, req.memberId!) };
}

blogThreadsRouter.get("/docs/:docType/:docId/threads", async (req: Request, res: Response) => {
  try {
    const ctx = await resolveDoc(req, res);
    if (!ctx) return;
    res.json(await threads.listThreads(ctx.ref));
  } catch (err) {
    console.error("[blogThreads] list error:", err);
    res.status(500).json({ error: "Failed to load threads" });
  }
});

blogThreadsRouter.post("/docs/:docType/:docId/threads", async (req: Request, res: Response) => {
  try {
    const ctx = await resolveDoc(req, res);
    if (!ctx) return;
    const { kind, anchorText, body, replaceWith, rationale, origin } = req.body ?? {};
    if (kind !== "COMMENT" && kind !== "SUGGESTION") {
      res.status(400).json({ error: "kind must be COMMENT or SUGGESTION" });
      return;
    }
    if (typeof anchorText !== "string" || !anchorText.trim()) {
      res.status(400).json({ error: "anchorText is required" });
      return;
    }
    if (kind === "COMMENT" && (typeof body !== "string" || !body.trim())) {
      res.status(400).json({ error: "A comment needs a body" });
      return;
    }
    // AI-origin threads are only creatable by document editors, since the AI
    // panel itself is editor-only.
    if (origin === "AI" && !ctx.editor) {
      res.status(403).json({ error: "Only authors can record AI suggestions" });
      return;
    }
    const thread = await threads.createThread(ctx.ref, req.memberId!, {
      kind,
      anchorText,
      body: typeof body === "string" ? body : "",
      replaceWith: typeof replaceWith === "string" ? replaceWith : undefined,
      rationale: typeof rationale === "string" ? rationale : undefined,
      origin: origin === "AI" ? "AI" : "HUMAN",
    });
    res.status(201).json(thread);
  } catch (err) {
    console.error("[blogThreads] create error:", err);
    res.status(500).json({ error: "Failed to create thread" });
  }
});

blogThreadsRouter.patch("/threads/:id", async (req: Request, res: Response) => {
  try {
    const ctx = await resolveThreadDoc(req, res);
    if (!ctx) return;
    const status = req.body?.status as BlogThreadStatus;
    const updated = await threads.setThreadStatus(
      req.params.id as string, req.memberId!, status, ctx.editor,
    );
    if (!updated) {
      res.status(403).json({ error: "Not allowed to set that status" });
      return;
    }
    res.json(updated);
  } catch (err) {
    console.error("[blogThreads] status error:", err);
    res.status(500).json({ error: "Failed to update thread" });
  }
});

blogThreadsRouter.post("/threads/:id/comments", async (req: Request, res: Response) => {
  try {
    const ctx = await resolveThreadDoc(req, res);
    if (!ctx) return;
    const body = req.body?.body;
    if (typeof body !== "string" || !body.trim()) {
      res.status(400).json({ error: "body is required" });
      return;
    }
    res.status(201).json(await threads.addComment(req.params.id as string, req.memberId!, body));
  } catch (err) {
    console.error("[blogThreads] comment error:", err);
    res.status(500).json({ error: "Failed to add comment" });
  }
});

blogThreadsRouter.patch("/threads/:id/comments/:cid", async (req: Request, res: Response) => {
  try {
    const ctx = await resolveThreadDoc(req, res);
    if (!ctx) return;
    const body = req.body?.body;
    if (typeof body !== "string" || !body.trim()) {
      res.status(400).json({ error: "body is required" });
      return;
    }
    const updated = await threads.updateComment(req.params.cid as string, req.memberId!, body);
    if (!updated) {
      res.status(403).json({ error: "Only the author can edit a comment" });
      return;
    }
    res.json(updated);
  } catch (err) {
    console.error("[blogThreads] comment edit error:", err);
    res.status(500).json({ error: "Failed to edit comment" });
  }
});

blogThreadsRouter.delete("/threads/:id/comments/:cid", async (req: Request, res: Response) => {
  try {
    const ctx = await resolveThreadDoc(req, res);
    if (!ctx) return;
    const updated = await threads.deleteComment(req.params.cid as string, req.memberId!, ctx.editor);
    if (!updated) {
      res.status(403).json({ error: "Not allowed to delete that comment" });
      return;
    }
    res.json(updated);
  } catch (err) {
    console.error("[blogThreads] comment delete error:", err);
    res.status(500).json({ error: "Failed to delete comment" });
  }
});
```

- [ ] **Step 2: Mount it**

In `backend/src/app.ts`, add the import next to the existing `blogRouter` import (line 50):

```ts
import { blogThreadsRouter } from "./api/blogThreads.js";
```

And mount it immediately after the existing blog mount (line 134). It must come **after** `blogRouter` so `blogRouter`'s `/posts/*` routes are unaffected; the two share the `/api/blog` prefix but have disjoint paths.

```ts
app.use("/api/blog", blogRouter);
app.use("/api/blog", blogThreadsRouter);
```

- [ ] **Step 3: Typecheck**

```bash
cd backend && npx tsc --noEmit
```

Expected: no output.

- [ ] **Step 4: Verify the routes answer**

Start the backend (`cd backend && npm run dev`), then with a real post id and a valid session:

```bash
curl -s -b cookies.txt http://localhost:4000/api/blog/docs/BLOG_POST/<postId>/threads
```

Expected: `[]`. And an unknown docType 400s:

```bash
curl -s -o /dev/null -w "%{http_code}\n" -b cookies.txt http://localhost:4000/api/blog/docs/NOPE/x/threads
```

Expected: `400`.

- [ ] **Step 5: Commit**

```bash
git add backend/src/api/blogThreads.ts backend/src/app.ts
git commit -m "feat(blog): add review thread REST routes"
```

---

## Task 4: Suggestion marks + commands

**Files:**
- Create: `src/components/clubpm/blog/suggestionMarks.js`
- Create: `src/components/clubpm/blog/suggestionMarks.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `CommentMark`, `SuggestInsert`, `SuggestDelete` — TipTap `Mark` objects, mark names `commentMark`, `suggestInsert`, `suggestDelete`, each with a single `threadId` attribute.
  - `SuggestionCommands` — TipTap `Extension` adding commands:
    - `setCommentThread(threadId)` — marks the current selection
    - `applySuggestion({ threadId, from, to, replace })`
    - `acceptSuggestion(threadId)`
    - `rejectSuggestion(threadId)`
    - `removeCommentThread(threadId)`
  - `findMarkRanges(doc, markName, threadId)` → `Array<{ from, to }>` — pure, exported for tests and for the panel.
  - `ThreadPositions` — TipTap `Extension` maintaining `editor.storage.blogThreads.positions`, a `Map<threadId, { from, to, markName }>`.
  - `suggestionExtensions()` → array of all of the above, for splicing into `blogExtensions()`.

- [ ] **Step 1: Write the failing test**

Create `src/components/clubpm/blog/suggestionMarks.test.js`. It builds a minimal ProseMirror schema directly so `findMarkRanges` is tested against real documents without booting an editor.

```js
import { Schema } from '@tiptap/pm/model';
import { findMarkRanges } from './suggestionMarks';

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { content: 'inline*', group: 'block', toDOM: () => ['p', 0] },
    text: { group: 'inline' },
  },
  marks: {
    suggestDelete: { attrs: { threadId: {} } },
    suggestInsert: { attrs: { threadId: {} } },
    commentMark: { attrs: { threadId: {} } },
  },
});

// Builds a one-paragraph doc from [text, markName|null, threadId|null] triples.
function docFrom(...pieces) {
  const inline = pieces.map(([text, markName, threadId]) =>
    schema.text(text, markName ? [schema.marks[markName].create({ threadId })] : []));
  return schema.node('doc', null, [schema.node('paragraph', null, inline)]);
}

test('finds a single marked range', () => {
  const doc = docFrom(['keep ', null, null], ['struck', 'suggestDelete', 't1'], [' keep', null, null]);
  // Paragraph content starts at position 1, so "struck" spans 6..12.
  expect(findMarkRanges(doc, 'suggestDelete', 't1')).toEqual([{ from: 6, to: 12 }]);
});

test('ignores the same mark belonging to a different thread', () => {
  const doc = docFrom(['a', 'suggestDelete', 't1'], ['b', 'suggestDelete', 't2']);
  expect(findMarkRanges(doc, 'suggestDelete', 't1')).toEqual([{ from: 1, to: 2 }]);
  expect(findMarkRanges(doc, 'suggestDelete', 't2')).toEqual([{ from: 2, to: 3 }]);
});

test('ignores a different mark type on the same thread', () => {
  const doc = docFrom(['x', 'suggestInsert', 't1']);
  expect(findMarkRanges(doc, 'suggestDelete', 't1')).toEqual([]);
});

test('merges adjacent text nodes carrying the same mark', () => {
  // Two separate text nodes, same mark+thread — must come back as ONE range,
  // otherwise accept/reject would delete in pieces and corrupt positions.
  const doc = schema.node('doc', null, [schema.node('paragraph', null, [
    schema.text('ab', [schema.marks.suggestDelete.create({ threadId: 't1' })]),
    schema.text('cd', [schema.marks.suggestDelete.create({ threadId: 't1' })]),
  ])]);
  expect(findMarkRanges(doc, 'suggestDelete', 't1')).toEqual([{ from: 1, to: 5 }]);
});

test('finds ranges across separate paragraphs', () => {
  const mark = [schema.marks.commentMark.create({ threadId: 't1' })];
  const doc = schema.node('doc', null, [
    schema.node('paragraph', null, [schema.text('aa', mark)]),
    schema.node('paragraph', null, [schema.text('bb', mark)]),
  ]);
  expect(findMarkRanges(doc, 'commentMark', 't1')).toEqual([{ from: 1, to: 3 }, { from: 5, to: 7 }]);
});

test('returns empty for an unknown thread', () => {
  expect(findMarkRanges(docFrom(['a', null, null]), 'commentMark', 'nope')).toEqual([]);
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx react-scripts test --watchAll=false --testPathPattern=suggestionMarks
```

Expected: FAIL — cannot find module `./suggestionMarks`.

- [ ] **Step 3: Write the marks module**

Create `src/components/clubpm/blog/suggestionMarks.js`:

```js
import { Mark, Extension, mergeAttributes } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';

// Every review mark carries only the id of its Postgres thread. Bodies,
// status and rationale live in the DB (see backend/src/services/
// blogThreadService.ts); the mark is purely the anchor, which is what lets
// Yjs drift it correctly as other people edit around it.
const threadIdAttribute = {
  threadId: {
    default: null,
    parseHTML: (el) => el.getAttribute('data-thread-id'),
    renderHTML: (attrs) => (attrs.threadId ? { 'data-thread-id': attrs.threadId } : {}),
  },
};

// excludes: '' lets several instances of the same mark type coexist on one
// range, so two people can comment on overlapping text.
function reviewMark({ name, tagAttr, className }) {
  return Mark.create({
    name,
    inclusive: false,
    excludes: '',
    addAttributes() { return threadIdAttribute; },
    parseHTML() { return [{ tag: `span[${tagAttr}]` }]; },
    renderHTML({ HTMLAttributes }) {
      return ['span', mergeAttributes(HTMLAttributes, { [tagAttr]: '', class: className }), 0];
    },
  });
}

export const CommentMark = reviewMark({
  name: 'commentMark', tagAttr: 'data-comment-thread', className: 'cpm-blog-comment-mark',
});
export const SuggestInsert = reviewMark({
  name: 'suggestInsert', tagAttr: 'data-suggest-insert', className: 'cpm-blog-sugg-ins',
});
export const SuggestDelete = reviewMark({
  name: 'suggestDelete', tagAttr: 'data-suggest-del', className: 'cpm-blog-sugg-del',
});

/**
 * All ranges in `doc` carrying `markName` with the given threadId.
 * Adjacent text nodes sharing the mark are merged into one range — splitting
 * them would make accept/reject delete in pieces and invalidate later positions.
 * @returns {Array<{from: number, to: number}>} in document order
 */
export function findMarkRanges(doc, markName, threadId) {
  const ranges = [];
  doc.descendants((node, pos) => {
    if (!node.isText) return;
    const hit = node.marks.find((m) => m.type.name === markName && m.attrs.threadId === threadId);
    if (!hit) return;
    const from = pos;
    const to = pos + node.nodeSize;
    const last = ranges[ranges.length - 1];
    if (last && last.to === from) last.to = to;
    else ranges.push({ from, to });
  });
  return ranges;
}

export const SuggestionCommands = Extension.create({
  name: 'suggestionCommands',

  addCommands() {
    return {
      setCommentThread: (threadId) => ({ commands }) =>
        commands.setMark('commentMark', { threadId }),

      removeCommentThread: (threadId) => ({ tr, state, dispatch }) => {
        const type = state.schema.marks.commentMark;
        const ranges = findMarkRanges(state.doc, 'commentMark', threadId);
        if (ranges.length === 0) return false;
        ranges.forEach(({ from, to }) => {
          tr.removeMark(from, to, type.create({ threadId }));
        });
        if (dispatch) dispatch(tr);
        return true;
      },

      /**
       * Turns [from,to] into a suggestion: the existing text is struck through
       * with suggestDelete, and `replace` (when non-empty) is inserted straight
       * after it carrying suggestInsert. One transaction, so Yjs ships it to
       * co-editors atomically.
       */
      applySuggestion: ({ threadId, from, to, replace }) => ({ tr, state, dispatch }) => {
        const delType = state.schema.marks.suggestDelete;
        const insType = state.schema.marks.suggestInsert;
        if (!delType || !insType || from >= to) return false;
        tr.addMark(from, to, delType.create({ threadId }));
        if (replace && replace.trim()) {
          tr.insert(to, state.schema.text(replace, [insType.create({ threadId })]));
        }
        if (dispatch) dispatch(tr);
        return true;
      },

      /** Accept: drop the struck text, keep the insertion as plain text. */
      acceptSuggestion: (threadId) => ({ tr, state, dispatch }) => {
        const dels = findMarkRanges(state.doc, 'suggestDelete', threadId);
        const ins  = findMarkRanges(state.doc, 'suggestInsert', threadId);
        if (dels.length === 0 && ins.length === 0) return false;
        // Unwrap the kept insertions first, then delete back-to-front so
        // earlier deletions never invalidate later positions.
        ins.forEach(({ from, to }) => {
          tr.removeMark(from, to, state.schema.marks.suggestInsert.create({ threadId }));
        });
        [...dels].reverse().forEach(({ from, to }) => { tr.delete(from, to); });
        if (dispatch) dispatch(tr);
        return true;
      },

      /** Reject: restore the struck text, drop the insertion. */
      rejectSuggestion: (threadId) => ({ tr, state, dispatch }) => {
        const dels = findMarkRanges(state.doc, 'suggestDelete', threadId);
        const ins  = findMarkRanges(state.doc, 'suggestInsert', threadId);
        if (dels.length === 0 && ins.length === 0) return false;
        dels.forEach(({ from, to }) => {
          tr.removeMark(from, to, state.schema.marks.suggestDelete.create({ threadId }));
        });
        [...ins].reverse().forEach(({ from, to }) => { tr.delete(from, to); });
        if (dispatch) dispatch(tr);
        return true;
      },
    };
  },
});

// Keeps a live threadId → position index so the panel can scroll to a thread
// and tell an orphaned thread (anchor deleted) from a live one.
const threadPositionsKey = new PluginKey('blogThreadPositions');

export const ThreadPositions = Extension.create({
  name: 'blogThreadPositions',

  addStorage() {
    return { positions: new Map() };
  },

  addProseMirrorPlugins() {
    const storage = this.storage;
    const reindex = (doc) => {
      const map = new Map();
      doc.descendants((node, pos) => {
        if (!node.isText) return;
        node.marks.forEach((m) => {
          const name = m.type.name;
          if (name !== 'commentMark' && name !== 'suggestInsert' && name !== 'suggestDelete') return;
          const id = m.attrs.threadId;
          if (!id) return;
          const existing = map.get(id);
          const from = existing ? Math.min(existing.from, pos) : pos;
          const to = existing ? Math.max(existing.to, pos + node.nodeSize) : pos + node.nodeSize;
          map.set(id, { from, to, markName: existing?.markName ?? name });
        });
      });
      storage.positions = map;
    };

    return [new Plugin({
      key: threadPositionsKey,
      view: () => ({ update: (view) => reindex(view.state.doc) }),
      state: {
        init: (_config, state) => { reindex(state.doc); return null; },
        apply: () => null,
      },
    })];
  },
});

/** Everything to splice into blogExtensions(). */
export function suggestionExtensions() {
  return [CommentMark, SuggestInsert, SuggestDelete, SuggestionCommands, ThreadPositions];
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx react-scripts test --watchAll=false --testPathPattern=suggestionMarks
```

Expected: 6 passing tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/clubpm/blog/suggestionMarks.js src/components/clubpm/blog/suggestionMarks.test.js
git commit -m "feat(blog): add comment + suggestion marks and commands"
```

---

## Task 5: Keep the collab schema and renderer in lockstep

This is the task that prevents silent data loss. Without it, the Hocuspocus transformer cannot convert a Y.Doc containing the new marks, and a half-reviewed draft would publish struck-through text to the public site.

**Files:**
- Modify: `backend/src/collab/blogSchema.ts`
- Modify: `backend/src/services/blogRender.ts`
- Modify: `backend/src/services/blogRender.test.ts`
- Modify: `backend/src/services/blogSchemaContract.test.ts`

**Interfaces:**
- Consumes: mark names `commentMark`, `suggestInsert`, `suggestDelete` from Task 4.
- Produces: a renderer that keeps `suggestInsert` text, drops `suggestDelete` text, drops `commentMark` entirely, and emits no `data-thread-id`; a contract test that fails if any of the three definition sites drifts.

- [ ] **Step 1: Write the failing renderer test**

Append to `backend/src/services/blogRender.test.ts`, before the final summary lines:

```ts
{
  // A draft mid-review must publish as if the review never happened:
  // insertions land as plain text, deletions vanish, comments leave no trace.
  const doc = { type: "doc", content: [
    { type: "paragraph", content: [
      { type: "text", text: "We " },
      { type: "text", text: "did testing", marks: [{ type: "suggestDelete", attrs: { threadId: "t1" } }] },
      { type: "text", text: "ran thermal vac", marks: [{ type: "suggestInsert", attrs: { threadId: "t1" } }] },
      { type: "text", text: " last week." },
    ] },
    { type: "paragraph", content: [
      { type: "text", text: "Flagged sentence.", marks: [{ type: "commentMark", attrs: { threadId: "t2" } }] },
    ] },
  ] };
  const html = _render(doc as any);
  check("keeps suggestInsert text", html.includes("ran thermal vac"));
  check("drops suggestDelete text", !html.includes("did testing"));
  check("keeps commented text", html.includes("Flagged sentence."));
  check("leaks no thread ids", !html.includes("data-thread-id"));
  check("leaks no review classes",
    !html.includes("cpm-blog-sugg") && !html.includes("cpm-blog-comment-mark"));
  check("surrounding prose survives intact", html.includes("We ") && html.includes(" last week."));
}
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd backend && npx tsx src/services/blogRender.test.ts
```

Expected: FAIL on `drops suggestDelete text` — `wrapMarks` has a `default: break`, so an unknown mark currently passes its text straight through.

- [ ] **Step 3: Make the renderer strip the marks**

In `backend/src/services/blogRender.ts`, add three explicit cases to the `wrapMarks` switch, immediately before `default:` (currently line 183). Explicit cases (rather than relying on the default) are what the contract test in Step 6 greps for.

```ts
      // ── Review-only marks (see suggestionMarks.js) ──────────
      // These exist for in-editor review and must never reach the public site.
      // commentMark / suggestInsert: keep the text, drop the annotation.
      case "commentMark":
      case "suggestInsert":
        break;
      // suggestDelete: the text itself is dropped in renderNode below, since a
      // mark handler can only wrap text, not remove it.
      case "suggestDelete":
        break;
```

Then change the `text` case of `renderNode` (currently lines 216-217) to drop struck text outright:

```ts
    case "text": {
      // A rejected-but-not-yet-cleaned suggestion must not publish its old text.
      if (node.marks?.some((m) => m.type === "suggestDelete")) return "";
      return wrapMarks(escapeHtml(node.text ?? ""), node.marks);
    }
```

- [ ] **Step 4: Run the renderer test to verify it passes**

```bash
cd backend && npx tsx src/services/blogRender.test.ts
```

Expected: all checks pass, `0 failed`.

- [ ] **Step 5: Mirror the marks in the collab schema**

In `backend/src/collab/blogSchema.ts`, add the `Mark` import and three schema-only mirrors. Add `Mark` to the existing `@tiptap/core` import:

```ts
import { Node, Mark } from "@tiptap/core";
```

Then define the mirrors alongside the node mirrors (before the array that assembles the schema):

```ts
// Schema-only mirrors of the review marks defined for the React editor in
// src/components/clubpm/blog/suggestionMarks.js. @hocuspocus/transformer needs
// every mark present in the Y.Doc to exist here, or converting the shared doc
// to TipTap JSON fails and the derived contentJson snapshot breaks.
// Mark `name` and attributes must stay in sync with the client definitions.
const reviewMarkMirror = (name: string) => Mark.create({
  name,
  inclusive: false,
  excludes: "",
  addAttributes() {
    return { threadId: { default: null } };
  },
});

const CommentMarkMirror  = reviewMarkMirror("commentMark");
const SuggestInsertMirror = reviewMarkMirror("suggestInsert");
const SuggestDeleteMirror = reviewMarkMirror("suggestDelete");
```

Add all three to the exported extension array in the same file (find the array that already lists `StarterKit`, `TaskList`, `BlogImageNode`, … and append them).

- [ ] **Step 6: Extend the contract test to cover marks**

In `backend/src/services/blogSchemaContract.test.ts`, make two changes. First, scan `.js` files too, since `suggestionMarks.js` is not `.jsx` — replace the `readdirSync` filter (line 21):

```ts
for (const file of readdirSync(editorDir).filter((f) => (f.endsWith(".jsx") || f.endsWith(".js")) && !f.endsWith(".test.js"))) {
```

Second, collect mark names and assert on them. Add after the node loop (after line 33):

```ts
// Same guard for marks: a mark missing from the collab mirror breaks the Yjs →
// TipTap JSON conversion, and one missing from the renderer leaks review
// artifacts onto the public site.
const markNames = new Set<string>();
for (const file of readdirSync(editorDir).filter((f) => (f.endsWith(".jsx") || f.endsWith(".js")) && !f.endsWith(".test.js"))) {
  const src = readFileSync(join(editorDir, file), "utf8");
  for (const m of src.matchAll(/reviewMark\(\{\s*\n?\s*name:\s*['"]([A-Za-z][A-Za-z0-9]*)['"]/g)) {
    markNames.add(m[1]!);
  }
}

check("found the editor's review marks", markNames.size === 3);
for (const name of markNames) {
  check(`collab mirror defines mark "${name}"`, new RegExp(`reviewMarkMirror\\("${name}"\\)`).test(mirrorSrc));
  check(`renderer handles mark "${name}"`, new RegExp(`case\\s+["']${name}["']:`).test(rendererSrc));
}
```

Also update the final log line to mention marks:

```ts
console.log(`\nblogSchemaContract: ${passed} passed, ${failed} failed (${nodeNames.size} nodes, ${markNames.size} marks checked)`);
```

- [ ] **Step 7: Run the contract test**

```bash
cd backend && npx tsx src/services/blogSchemaContract.test.ts
```

Expected: `0 failed`, and the summary reports 3 marks checked.

- [ ] **Step 8: Typecheck and commit**

```bash
cd backend && npx tsc --noEmit
```

Expected: no output.

```bash
git add backend/src/collab/blogSchema.ts backend/src/services/blogRender.ts backend/src/services/blogRender.test.ts backend/src/services/blogSchemaContract.test.ts
git commit -m "feat(blog): strip review marks at publish and guard schema drift"
```

---

## Task 6: Client API helpers + register the marks in the editor

**Files:**
- Modify: `src/api/clubPmClient.js`
- Modify: `src/components/clubpm/blog/BlogEditor.jsx`

**Interfaces:**
- Consumes: routes from Task 3; `suggestionExtensions()` from Task 4.
- Produces:
  - `listBlogThreads(docType, docId)`, `createBlogThread(docType, docId, body)`, `setBlogThreadStatus(threadId, status)`, `addBlogThreadComment(threadId, body)`, `editBlogThreadComment(threadId, commentId, body)`, `deleteBlogThreadComment(threadId, commentId)` in `clubPmClient.js`.
  - `BlogEditor` accepting new props `docType` (default `'BLOG_POST'`), `docId`, `canEditDoc` (default `true`), and rendering the review marks.

- [ ] **Step 1: Add the client helpers**

Append to `src/api/clubPmClient.js`, next to the existing blog helpers (around line 380), matching the one-line arrow style used there:

```js
// ── Blog / press-kit review threads ──────────────────────────
export const listBlogThreads        = (docType, docId) => get(`/api/blog/docs/${docType}/${docId}/threads`);
export const createBlogThread       = (docType, docId, body) => post(`/api/blog/docs/${docType}/${docId}/threads`, body);
export const setBlogThreadStatus    = (threadId, status) => patch(`/api/blog/threads/${threadId}`, { status });
export const addBlogThreadComment   = (threadId, body) => post(`/api/blog/threads/${threadId}/comments`, { body });
export const editBlogThreadComment  = (threadId, commentId, body) => patch(`/api/blog/threads/${threadId}/comments/${commentId}`, { body });
export const deleteBlogThreadComment = (threadId, commentId) => del(`/api/blog/threads/${threadId}/comments/${commentId}`);
```

- [ ] **Step 2: Register the marks in `blogExtensions()`**

In `src/components/clubpm/blog/BlogEditor.jsx`, add the import next to the other blog imports:

```js
import { suggestionExtensions } from './suggestionMarks';
```

And splice them into the returned array in `blogExtensions()`, just before the collab block (currently line 81):

```js
    ...suggestionExtensions(),
    ...(collab ? [
```

- [ ] **Step 3: Add the new props to `BlogEditor`**

Extend the signature (currently line 472) and its JSDoc:

```js
/**
 * @param {string}  docType   'BLOG_POST' | 'PRESS_KIT' — which review-thread namespace this editor uses
 * @param {string}  docId     id within that namespace; falls back to postId for blog posts
 * @param {boolean} canEditDoc  false for reviewers — hides Accept/Reject and the AI entry points
 */
export default function BlogEditor({
  content, onChange, editable = true, onEditorReady, postId, collabUser, collabWsUrl,
  theme, onThemeChange, docType = 'BLOG_POST', docId, canEditDoc = true,
}) {
```

Add a resolved id just below the existing state declarations, so callers that only pass `postId` keep working:

```js
  const reviewDocId = docId ?? postId;
```

- [ ] **Step 4: Verify the build**

```bash
npm run build
```

Expected: "Compiled successfully" (warnings about unused `reviewDocId`/`canEditDoc` are expected until Task 8 consumes them).

- [ ] **Step 5: Verify the marks round-trip through collab**

With backend and frontend running, open a post in the editor and in the browser console:

```js
// Selection must be non-empty first — select a few words in the editor.
window.__ed = document.querySelector('.ProseMirror');
```

Then select text and run, from the React DevTools console with the editor instance in scope, or temporarily expose it — simplest check is via the DOM after the next task. For now confirm no console errors on load and that the Presence dot still goes green (marks registered in both schemas means collab still syncs).

Expected: presence dot green, no schema errors in the console. A red "Invalid content" or transformer error means Task 5's collab mirror is out of sync.

- [ ] **Step 6: Commit**

```bash
git add src/api/clubPmClient.js src/components/clubpm/blog/BlogEditor.jsx
git commit -m "feat(blog): register review marks and add thread API helpers"
```

---

## Task 7: Review CSS

**Files:**
- Modify: `public/clubpm-theme.css`

**Interfaces:**
- Consumes: class names from Task 4 (`cpm-blog-comment-mark`, `cpm-blog-sugg-ins`, `cpm-blog-sugg-del`).
- Produces: styles for the marks, the selection bubble (Task 8), and the thread cards (Task 9). Doing all the review CSS at once avoids three separate passes over a 20,500-line file.

- [ ] **Step 1: Append the styles**

Append at the very bottom of `public/clubpm-theme.css`. This file is ClubPM-only and loaded on demand by `/clubpm/*` routes, which is correct here — the marks never reach a public page because Task 5 strips them.

```css
/* === Blog review: marks, selection bubble, thread cards ================= */

.cpm-blog-comment-mark {
  background: color-mix(in srgb, var(--pm-accent-amber) 16%, transparent);
  border-bottom: 2px solid var(--pm-accent-amber);
  cursor: pointer;
}
.cpm-blog-comment-mark.is-active {
  background: color-mix(in srgb, var(--pm-accent-amber) 32%, transparent);
}
.cpm-blog-sugg-ins {
  color: var(--pm-accent-teal);
  background: color-mix(in srgb, var(--pm-accent-teal) 12%, transparent);
  text-decoration: underline;
  text-decoration-thickness: 2px;
}
.cpm-blog-sugg-del {
  color: var(--pm-accent-coral);
  background: color-mix(in srgb, var(--pm-accent-coral) 10%, transparent);
  text-decoration: line-through;
}

/* Selection bubble */
.cpm-blog-bubble {
  display: flex;
  gap: 2px;
  padding: 4px;
  background: var(--pm-elevated);
  border: 1px solid var(--color-border, rgba(255, 255, 255, 0.12));
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
}
.cpm-blog-bubble button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 0.82rem;
  cursor: pointer;
}
.cpm-blog-bubble button:hover { background: rgba(255, 255, 255, 0.08); }

/* Inline composer shown under the bubble when writing a comment/suggestion */
.cpm-blog-bubble-form {
  display: grid;
  gap: 6px;
  width: min(360px, 80vw);
  padding: 10px;
  background: var(--pm-elevated);
  border: 1px solid var(--color-border, rgba(255, 255, 255, 0.12));
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
}
.cpm-blog-bubble-form textarea {
  min-height: 60px;
  resize: vertical;
  padding: 8px;
  border-radius: 7px;
  border: 1px solid var(--color-border, rgba(255, 255, 255, 0.12));
  background: var(--pm-surface);
  color: inherit;
  font: inherit;
  font-size: 0.85rem;
}
.cpm-blog-bubble-form-quote {
  font-size: 0.75rem;
  opacity: 0.7;
  font-style: italic;
  overflow-wrap: anywhere;
}
.cpm-blog-bubble-form-actions { display: flex; gap: 6px; justify-content: flex-end; }

/* Thread list + cards */
.cpm-blog-threads { display: grid; gap: 10px; }
.cpm-blog-threads-filters { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 8px; }
.cpm-blog-threads-filters button {
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid var(--color-border, rgba(255, 255, 255, 0.12));
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 0.76rem;
  cursor: pointer;
}
.cpm-blog-threads-filters button.is-active {
  background: var(--pm-accent-teal);
  border-color: var(--pm-accent-teal);
  color: #04211f;
}
.cpm-blog-thread-card {
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid var(--color-border, rgba(255, 255, 255, 0.12));
  border-left: 3px solid var(--pm-accent-amber);
  background: var(--pm-surface);
}
.cpm-blog-thread-card--suggestion { border-left-color: var(--pm-accent-teal); }
.cpm-blog-thread-card--orphan { opacity: 0.62; }
.cpm-blog-thread-card.is-active { outline: 1px solid var(--pm-accent-teal); }
.cpm-blog-thread-head {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.74rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  opacity: 0.75;
  margin-bottom: 6px;
}
.cpm-blog-thread-badge {
  padding: 1px 7px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.1);
  font-size: 0.68rem;
  letter-spacing: 0.04em;
}
.cpm-blog-thread-badge--ai { background: var(--pm-accent-violet, #a78bfa); color: #150c2b; }
.cpm-blog-thread-quote {
  font-size: 0.8rem;
  font-style: italic;
  opacity: 0.8;
  border-left: 2px solid var(--color-border, rgba(255, 255, 255, 0.12));
  padding-left: 8px;
  margin-bottom: 6px;
  overflow-wrap: anywhere;
}
.cpm-blog-thread-diff { display: grid; gap: 3px; font-size: 0.82rem; margin-bottom: 8px; }
.cpm-blog-thread-diff del { color: var(--pm-accent-coral); }
.cpm-blog-thread-diff ins { color: var(--pm-accent-teal); text-decoration: none; }
.cpm-blog-thread-rationale { font-size: 0.78rem; opacity: 0.72; margin-bottom: 8px; }
.cpm-blog-thread-comments { display: grid; gap: 6px; margin-bottom: 8px; }
.cpm-blog-thread-comment { font-size: 0.83rem; }
.cpm-blog-thread-comment-meta { font-size: 0.72rem; opacity: 0.6; }
.cpm-blog-thread-actions { display: flex; gap: 6px; flex-wrap: wrap; }
.cpm-blog-thread-reply {
  width: 100%;
  padding: 6px 8px;
  border-radius: 7px;
  border: 1px solid var(--color-border, rgba(255, 255, 255, 0.12));
  background: var(--pm-elevated);
  color: inherit;
  font: inherit;
  font-size: 0.82rem;
}
.cpm-blog-thread-empty { font-size: 0.85rem; opacity: 0.65; }

/* AI panel */
.cpm-blog-ai-panel { display: grid; gap: 10px; }
.cpm-blog-ai-tabs { display: flex; gap: 6px; }
.cpm-blog-ai-tabs button {
  flex: 1;
  padding: 6px 8px;
  border-radius: 8px;
  border: 1px solid var(--color-border, rgba(255, 255, 255, 0.12));
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 0.78rem;
  cursor: pointer;
}
.cpm-blog-ai-tabs button.is-active {
  background: var(--pm-accent-teal);
  border-color: var(--pm-accent-teal);
  color: #04211f;
}
.cpm-blog-ai-input {
  width: 100%;
  min-height: 64px;
  resize: vertical;
  padding: 8px;
  border-radius: 8px;
  border: 1px solid var(--color-border, rgba(255, 255, 255, 0.12));
  background: var(--pm-surface);
  color: inherit;
  font: inherit;
  font-size: 0.85rem;
}
.cpm-blog-ai-quick { display: flex; gap: 6px; flex-wrap: wrap; }
.cpm-blog-ai-answer {
  font-size: 0.86rem;
  line-height: 1.55;
  white-space: pre-wrap;
  padding: 10px;
  border-radius: 8px;
  background: var(--pm-surface);
}
.cpm-blog-ai-edit-card {
  padding: 10px;
  border-radius: 9px;
  border: 1px solid var(--color-border, rgba(255, 255, 255, 0.12));
  background: var(--pm-surface);
  display: grid;
  gap: 6px;
}
.cpm-blog-ai-edit-card--unlocatable { border-style: dashed; opacity: 0.7; }

/* Inline autocomplete ghost text */
.cpm-blog-ghost {
  opacity: 0.45;
  pointer-events: none;
  white-space: pre-wrap;
}
```

- [ ] **Step 2: Verify nothing landed in the public stylesheet**

```bash
rg -c "cpm-blog-sugg-ins|cpm-blog-thread-card|cpm-blog-ghost" public/search-theme.css public/clubpm-theme.css
```

Expected: `public/search-theme.css` reports no matches; `public/clubpm-theme.css` reports matches.

- [ ] **Step 3: Commit**

```bash
git add public/clubpm-theme.css
git commit -m "feat(blog): add review, AI panel and ghost-text styles"
```

---

## Task 8: Selection bubble

**Files:**
- Create: `src/components/clubpm/blog/BlogSelectionBubble.jsx`
- Modify: `src/components/clubpm/blog/BlogEditor.jsx`

**Interfaces:**
- Consumes: `applySuggestion` / `setCommentThread` commands (Task 4); `createBlogThread` (Task 6); CSS from Task 7.
- Produces: `<BlogSelectionBubble editor docType docId canEdit onThreadCreated onAskAi />`. `onThreadCreated(thread)` fires after a thread is persisted and its marks applied. `onAskAi(selectedText)` opens the AI panel scoped to the selection.

- [ ] **Step 1: Write the component**

Create `src/components/clubpm/blog/BlogSelectionBubble.jsx`:

```jsx
import React, { useState, useCallback } from 'react';
import { BubbleMenu } from '@tiptap/react/menus';
import toast from 'react-hot-toast';
import { createBlogThread } from '../../../api/clubPmClient';

// Floating actions on a non-empty selection. Comment and Suggest are open to
// any member; Ask AI is author-only (see the permission table in the spec) —
// which also bounds Gemini spend to the people who own the post.
export default function BlogSelectionBubble({ editor, docType, docId, canEdit, onThreadCreated, onAskAi }) {
  const [mode, setMode] = useState(null); // null | 'comment' | 'suggest'
  const [body, setBody] = useState('');
  const [replace, setReplace] = useState('');
  const [busy, setBusy] = useState(false);

  const selectedText = editor
    ? editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to, ' ')
    : '';

  const reset = useCallback(() => { setMode(null); setBody(''); setReplace(''); }, []);

  const openSuggest = () => { setReplace(selectedText); setMode('suggest'); };

  const submit = async () => {
    if (!editor || !docId) return;
    const { from, to } = editor.state.selection;
    const anchorText = editor.state.doc.textBetween(from, to, ' ');
    if (!anchorText.trim()) { toast.error('Select some text first'); return; }
    if (mode === 'comment' && !body.trim()) { toast.error('Write a comment first'); return; }

    setBusy(true);
    try {
      const thread = await createBlogThread(docType, docId, {
        kind: mode === 'suggest' ? 'SUGGESTION' : 'COMMENT',
        anchorText,
        body,
        ...(mode === 'suggest' ? { replaceWith: replace } : {}),
      });
      // Persist first, then anchor: a mark pointing at a thread that failed to
      // save would render as a permanently orphaned annotation.
      if (mode === 'suggest') {
        editor.chain().focus()
          .applySuggestion({ threadId: thread.id, from, to, replace })
          .run();
      } else {
        editor.chain().focus().setCommentThread(thread.id).run();
      }
      onThreadCreated?.(thread);
      reset();
    } catch (err) {
      toast.error(err.message ?? 'Could not save that');
    } finally {
      setBusy(false);
    }
  };

  if (!editor) return null;

  return (
    <BubbleMenu
      editor={editor}
      shouldShow={({ state }) => !state.selection.empty}
      options={{ placement: 'top' }}
    >
      {mode === null ? (
        <div className="cpm-blog-bubble">
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setMode('comment')}>
            <i className="fas fa-comment" aria-hidden="true" /> Comment
          </button>
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={openSuggest}>
            <i className="fas fa-pen-to-square" aria-hidden="true" /> Suggest edit
          </button>
          {canEdit && (
            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => onAskAi?.(selectedText)}>
              <i className="fas fa-wand-magic-sparkles" aria-hidden="true" /> Ask AI
            </button>
          )}
        </div>
      ) : (
        <div className="cpm-blog-bubble-form">
          <p className="cpm-blog-bubble-form-quote">“{selectedText.slice(0, 140)}”</p>
          {mode === 'suggest' && (
            <textarea
              autoFocus
              value={replace}
              onChange={(e) => setReplace(e.target.value)}
              placeholder="Proposed replacement (leave empty to suggest deleting this)"
            />
          )}
          <textarea
            autoFocus={mode === 'comment'}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={mode === 'suggest' ? 'Why? (optional)' : 'Your comment'}
          />
          <div className="cpm-blog-bubble-form-actions">
            <button type="button" className="clubpm-btn-secondary" onClick={reset} disabled={busy}>Cancel</button>
            <button type="button" className="clubpm-btn-primary" onClick={submit} disabled={busy}>
              {busy ? 'Saving…' : mode === 'suggest' ? 'Suggest' : 'Comment'}
            </button>
          </div>
        </div>
      )}
    </BubbleMenu>
  );
}
```

- [ ] **Step 2: Render it from `BlogEditor`**

In `src/components/clubpm/blog/BlogEditor.jsx`, add the import:

```js
import BlogSelectionBubble from './BlogSelectionBubble';
```

Add a state hook for the AI panel request next to the other `useState` calls:

```js
  // Set by the bubble's "Ask AI"; consumed by BlogEditorPage via onAskAi.
  const [aiSelection, setAiSelection] = React.useState(null);
```

Accept two more props on `BlogEditor` — extend the signature from Task 6 with `onAskAi` and `onThreadsChanged`:

```js
  theme, onThemeChange, docType = 'BLOG_POST', docId, canEditDoc = true,
  onAskAi, onThreadsChanged,
}) {
```

Render the bubble inside the editor surface block, immediately after `<EditorContent editor={editor} />`:

```jsx
          <EditorContent editor={editor} />
          {editable && reviewDocId && (
            <BlogSelectionBubble
              editor={editor}
              docType={docType}
              docId={reviewDocId}
              canEdit={canEditDoc}
              onThreadCreated={() => onThreadsChanged?.()}
              onAskAi={(text) => { setAiSelection(text); onAskAi?.(text); }}
            />
          )}
```

Reference `aiSelection` so the linter is satisfied and the value is available for Task 14 — pass it down when the AI panel lands. For now add it to the footer as a no-op guard:

```jsx
        {aiSelection && <span className="cpm-blog-markdown-hint" hidden>{aiSelection.length} chars selected for AI</span>}
```

- [ ] **Step 3: Build**

```bash
npm run build
```

Expected: "Compiled successfully". If `@tiptap/react/menus` fails to resolve, confirm the subpath export exists: `rg '"./menus"' node_modules/@tiptap/react/package.json`.

- [ ] **Step 4: Verify in the browser**

Open a blog post in the editor. Select a few words.

Expected:
1. The bubble appears above the selection with Comment / Suggest edit / Ask AI.
2. Clicking Comment, typing text, and clicking Comment again leaves the selection with an amber underline.
3. Clicking Suggest edit pre-fills the replacement box with the selected text; editing it and submitting leaves the original struck through in coral and the replacement in teal right after it.
4. `GET /api/blog/docs/BLOG_POST/<id>/threads` now returns those threads.
5. In a second browser tab on the same post, both annotations appear without a reload (this is the Yjs anchor working).

- [ ] **Step 5: Commit**

```bash
git add src/components/clubpm/blog/BlogSelectionBubble.jsx src/components/clubpm/blog/BlogEditor.jsx
git commit -m "feat(blog): add selection bubble for comments and suggestions"
```

---

## Task 9: Thread card + thread list, wired into the review panel

**Files:**
- Create: `src/components/clubpm/blog/BlogThreadCard.jsx`
- Create: `src/components/clubpm/blog/BlogThreadList.jsx`
- Modify: `src/components/clubpm/blog/BlogAnnotationsPanel.jsx`
- Modify: `src/pages/ClubPM/BlogEditorPage.jsx`

**Interfaces:**
- Consumes: client helpers from Task 6; `acceptSuggestion` / `rejectSuggestion` / `removeCommentThread` commands and `editor.storage.blogThreads.positions` from Task 4; CSS from Task 7.
- Produces:
  - `<BlogThreadCard thread editor canEdit currentMember onChanged />`
  - `<BlogThreadList docType docId editor canEdit currentMember refreshKey />`

- [ ] **Step 1: Write the thread card**

Create `src/components/clubpm/blog/BlogThreadCard.jsx`:

```jsx
import React, { useState } from 'react';
import toast from 'react-hot-toast';
import {
  setBlogThreadStatus, addBlogThreadComment, deleteBlogThreadComment,
} from '../../../api/clubPmClient';

function when(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/**
 * One review thread. `orphaned` means the marks it anchored to were deleted —
 * the card still renders from the stored anchorText snapshot, but accepting is
 * meaningless because there is nothing left in the document to change.
 */
export default function BlogThreadCard({ thread, editor, canEdit, currentMember, onChanged }) {
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);

  const positions = editor?.storage?.blogThreads?.positions;
  const anchor = positions?.get(thread.id);
  const terminal = thread.status === 'ACCEPTED' || thread.status === 'REJECTED';
  const orphaned = !anchor && !terminal;
  const isSuggestion = thread.kind === 'SUGGESTION';

  const run = async (fn) => {
    setBusy(true);
    try { await fn(); onChanged?.(); }
    catch (err) { toast.error(err.message ?? 'That did not work'); }
    finally { setBusy(false); }
  };

  // Document change first, then status: if the PATCH fails the editor rolls
  // back on the next collab sync, whereas a status set with no document change
  // would leave the thread claiming an edit that never happened.
  const accept = () => run(async () => {
    editor?.chain().focus().acceptSuggestion(thread.id).run();
    await setBlogThreadStatus(thread.id, 'ACCEPTED');
  });

  const reject = () => run(async () => {
    editor?.chain().focus().rejectSuggestion(thread.id).run();
    await setBlogThreadStatus(thread.id, 'REJECTED');
  });

  const resolve = () => run(async () => {
    editor?.chain().focus().removeCommentThread(thread.id).run();
    await setBlogThreadStatus(thread.id, 'RESOLVED');
  });

  const scrollTo = () => {
    if (!editor || !anchor) return;
    editor.chain().focus().setTextSelection({ from: anchor.from, to: anchor.to }).scrollIntoView().run();
  };

  const send = () => {
    if (!reply.trim()) return;
    run(async () => { await addBlogThreadComment(thread.id, reply); setReply(''); });
  };

  return (
    <div
      className={[
        'cpm-blog-thread-card',
        isSuggestion ? 'cpm-blog-thread-card--suggestion' : '',
        orphaned ? 'cpm-blog-thread-card--orphan' : '',
      ].filter(Boolean).join(' ')}
    >
      <div className="cpm-blog-thread-head">
        <i className={`fas ${isSuggestion ? 'fa-pen-to-square' : 'fa-comment'}`} aria-hidden="true" />
        <span>{isSuggestion ? 'Suggestion' : 'Comment'}</span>
        {thread.origin === 'AI' && <span className="cpm-blog-thread-badge cpm-blog-thread-badge--ai">AI</span>}
        {thread.status !== 'OPEN' && <span className="cpm-blog-thread-badge">{thread.status.toLowerCase()}</span>}
        {orphaned && <span className="cpm-blog-thread-badge">anchor removed</span>}
        <span style={{ marginLeft: 'auto' }}>{thread.createdBy?.displayName ?? 'Someone'}</span>
      </div>

      <button
        type="button"
        className="cpm-blog-thread-quote"
        onClick={scrollTo}
        disabled={!anchor}
        style={{ display: 'block', textAlign: 'left', background: 'none', border: 0, color: 'inherit', cursor: anchor ? 'pointer' : 'default', font: 'inherit' }}
      >
        “{thread.anchorText}”
      </button>

      {isSuggestion && (
        <div className="cpm-blog-thread-diff">
          <del>{thread.anchorText}</del>
          {thread.replaceWith ? <ins>{thread.replaceWith}</ins> : <ins><em>(delete)</em></ins>}
        </div>
      )}
      {thread.rationale && <p className="cpm-blog-thread-rationale">{thread.rationale}</p>}

      <div className="cpm-blog-thread-comments">
        {(thread.comments ?? []).map((c) => (
          <div key={c.id} className="cpm-blog-thread-comment">
            <div className="cpm-blog-thread-comment-meta">
              {c.author?.displayName ?? 'Someone'} · {when(c.createdAt)}
              {(canEdit || c.authorId === currentMember?.id) && (
                <button
                  type="button"
                  style={{ marginLeft: 6, background: 'none', border: 0, color: 'inherit', cursor: 'pointer', opacity: 0.7 }}
                  aria-label="Delete comment"
                  onClick={() => run(() => deleteBlogThreadComment(thread.id, c.id))}
                >
                  <i className="fas fa-times" aria-hidden="true" />
                </button>
              )}
            </div>
            {c.body}
          </div>
        ))}
      </div>

      {!terminal && (
        <>
          <input
            className="cpm-blog-thread-reply"
            value={reply}
            placeholder="Reply…"
            onChange={(e) => setReply(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); send(); } }}
          />
          <div className="cpm-blog-thread-actions">
            {isSuggestion && canEdit && (
              <>
                <button type="button" className="clubpm-btn-primary" disabled={busy || orphaned} onClick={accept}>
                  <i className="fas fa-check" aria-hidden="true" /> Accept
                </button>
                <button type="button" className="clubpm-btn-secondary" disabled={busy} onClick={reject}>
                  <i className="fas fa-xmark" aria-hidden="true" /> Reject
                </button>
              </>
            )}
            {!isSuggestion && (canEdit || thread.createdById === currentMember?.id) && (
              <button type="button" className="clubpm-btn-secondary" disabled={busy} onClick={resolve}>
                <i className="fas fa-check-double" aria-hidden="true" /> Resolve
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Write the thread list**

Create `src/components/clubpm/blog/BlogThreadList.jsx`:

```jsx
import React, { useState, useEffect, useCallback } from 'react';
import BlogThreadCard from './BlogThreadCard';
import { listBlogThreads } from '../../../api/clubPmClient';

const FILTERS = [
  { id: 'open', label: 'Open' },
  { id: 'suggestions', label: 'Suggestions' },
  { id: 'resolved', label: 'Closed' },
  { id: 'all', label: 'All' },
];

function matches(thread, filter) {
  switch (filter) {
    case 'open':        return thread.status === 'OPEN';
    case 'suggestions': return thread.kind === 'SUGGESTION' && thread.status === 'OPEN';
    case 'resolved':    return thread.status !== 'OPEN';
    default:            return true;
  }
}

export default function BlogThreadList({ docType, docId, editor, canEdit, currentMember, refreshKey }) {
  const [threads, setThreads] = useState([]);
  const [filter, setFilter] = useState('open');
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    if (!docId) return;
    setLoading(true);
    listBlogThreads(docType, docId)
      .then(setThreads)
      .catch(() => setThreads([]))
      .finally(() => setLoading(false));
  }, [docType, docId]);

  useEffect(() => { load(); }, [load, refreshKey]);

  const shown = threads.filter((t) => matches(t, filter));

  return (
    <div className="cpm-blog-threads">
      <div className="cpm-blog-threads-filters">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            className={filter === f.id ? 'is-active' : ''}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading && <p className="cpm-blog-thread-empty">Loading review threads…</p>}
      {!loading && shown.length === 0 && (
        <p className="cpm-blog-thread-empty">
          Nothing here. Select text in the post to leave a comment or suggest an edit.
        </p>
      )}
      {shown.map((t) => (
        <BlogThreadCard
          key={t.id}
          thread={t}
          editor={editor}
          canEdit={canEdit}
          currentMember={currentMember}
          onChanged={load}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Put the list in the review panel**

In `src/components/clubpm/blog/BlogAnnotationsPanel.jsx`, add the import:

```jsx
import BlogThreadList from './BlogThreadList';
```

Extend the component signature to take the editor and refresh key:

```jsx
export default function BlogAnnotationsPanel({
  post, currentMember, isOpen, onClose, onAuthorsChanged,
  editor, canEdit = true, threadsRefreshKey,
}) {
```

Insert the list at the top of the panel body, above `AuthorsManager`, so anchored review is the primary content:

```jsx
      <div className="cpm-blog-meta-panel-body">
        <div className="cpm-blog-meta-field">
          <h3 className="cpm-blog-authors-title">
            <i className="fas fa-comments" aria-hidden="true" /> In-text review
          </h3>
          <BlogThreadList
            docType="BLOG_POST"
            docId={post.id}
            editor={editor}
            canEdit={canEdit}
            currentMember={currentMember}
            refreshKey={threadsRefreshKey}
          />
        </div>

        <AuthorsManager post={post} currentMemberId={currentMember?.id} onAuthorsChanged={refreshAuthors} />
```

- [ ] **Step 4: Wire the page**

In `src/pages/ClubPM/BlogEditorPage.jsx`, add a refresh counter and an editor state value. `editorRef` is a ref, so it will not re-render the panel when the editor arrives — a state value is needed.

Add next to the other `useState` calls:

```jsx
  const [editorInstance, setEditorInstance] = useState(null);
  const [threadsRefreshKey, setThreadsRefreshKey] = useState(0);
```

Change the `onEditorReady` prop on `<BlogEditor>` to set both, and pass the new review props:

```jsx
            onEditorReady={(ed) => { editorRef.current = ed; setEditorInstance(ed); }}
            docType="BLOG_POST"
            docId={id}
            canEditDoc
            onThreadsChanged={() => setThreadsRefreshKey((k) => k + 1)}
```

And pass the editor through to the panel:

```jsx
        <BlogAnnotationsPanel
          post={post}
          currentMember={member}
          isOpen={reviewPanelOpen}
          onClose={() => setReviewPanelOpen(false)}
          onAuthorsChanged={() => { getBlogPost(id).then(setPost).catch(() => {}); }}
          editor={editorInstance}
          canEdit
          threadsRefreshKey={threadsRefreshKey}
        />
```

- [ ] **Step 5: Build**

```bash
npm run build
```

Expected: "Compiled successfully".

- [ ] **Step 6: Verify the full review loop in the browser**

1. Open a post, select text, and suggest an edit.
2. Open the review panel (the `fa-users-viewfinder` button). The suggestion appears under **Suggestions** with a `del`/`ins` diff.
3. Click the quote — the editor scrolls to and selects the anchored text.
4. Click **Accept**. The struck text disappears, the replacement becomes plain black text, and the card moves to **Closed** as `accepted`.
5. Make another suggestion and click **Reject**. The original text is restored and the proposal disappears.
6. Leave a comment, then click **Resolve**. The amber underline goes away and the card moves to **Closed**.
7. Delete the anchored text of an open comment directly in the editor, then reopen the panel. The card shows an "anchor removed" badge and Accept is disabled.

- [ ] **Step 7: Commit**

```bash
git add src/components/clubpm/blog/BlogThreadCard.jsx src/components/clubpm/blog/BlogThreadList.jsx src/components/clubpm/blog/BlogAnnotationsPanel.jsx src/pages/ClubPM/BlogEditorPage.jsx
git commit -m "feat(blog): add in-text review thread list with accept/reject"
```

**Phases 1–2 of the spec are now complete: a working human review system with no AI.**

---

## Task 10: Gemini fast lane

**Files:**
- Modify: `backend/src/services/geminiService.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `generateTextFast(prompt: string): Promise<string>` — its own sliding-window lane, its own model, no response cache.

- [ ] **Step 1: Add the lane**

`rateLimitedCall` uses one module-level `requestLog` shared by every standard-model caller, so autocomplete on the standard lane could starve task enrichment and the cron AI reports. Insert after the complex-model block (after line 53) in `backend/src/services/geminiService.ts`:

```ts
// ── Fast model (inline autocomplete) ─────────────────────────
// Its own lane so autocomplete can never eat the standard model's 30 RPM
// budget, which every other AI feature and cron shares. Defaults to
// GEMINI_MODEL when GEMINI_FAST_MODEL is unset, so nothing breaks unconfigured.

function fastModel() {
  return genai.getGenerativeModel({
    model: process.env.GEMINI_FAST_MODEL ?? process.env.GEMINI_MODEL!,
  });
}

const FAST_WINDOW_MS   = 60_000;
const FAST_MAX_REQUESTS = 15;
const fastRequestLog: number[] = [];

async function fastRateLimitedCall<T>(fn: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const windowStart = now - FAST_WINDOW_MS;
  while (fastRequestLog.length && fastRequestLog[0] < windowStart) fastRequestLog.shift();
  if (fastRequestLog.length >= FAST_MAX_REQUESTS) {
    throw new GeminiRateLimitError();
  }
  fastRequestLog.push(Date.now());
  return fn();
}
```

- [ ] **Step 2: Add the helper**

Append at the end of the file. No caching: a completion is specific to one caret position, so a cache hit would be actively wrong.

```ts
/**
 * Short, low-latency completion for inline autocomplete. Deliberately
 * uncached — a completion is specific to one caret position.
 * Returns "" on any failure so the editor simply shows no ghost text.
 */
export async function generateTextFast(prompt: string): Promise<string> {
  try {
    const result = await fastRateLimitedCall(() =>
      fastModel().generateContent({
        contents:         [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 64, temperature: 0.4 },
      })
    );
    return result.response.text().trim();
  } catch (err) {
    if (err instanceof GeminiRateLimitError) throw err;
    console.error("[gemini] generateTextFast error:", err);
    return "";
  }
}
```

- [ ] **Step 3: Typecheck**

```bash
cd backend && npx tsc --noEmit
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add backend/src/services/geminiService.ts
git commit -m "feat(ai): add fast-model lane for inline autocomplete"
```

---

## Task 11: Blog AI service

**Files:**
- Create: `backend/src/services/blogAiService.ts`

**Interfaces:**
- Consumes: `generateTextComplex`, `generateJson`, `generateJsonComplex`, `generateTextFast`, `todayContext` from `geminiService`.
- Produces:
  - `docToPlainText(doc: unknown): string`
  - `askAboutDoc(args: { title: string; doc: unknown; question: string }): Promise<string>`
  - `type AiEdit = { find: string; replace: string; rationale: string }`
  - `suggestEdits(args: { title: string; doc: unknown; instruction: string; scope: "selection" | "document"; selection?: string }): Promise<AiEdit[]>`
  - `completeText(args: { title: string; before: string }): Promise<string>`

- [ ] **Step 1: Write the service**

Create `backend/src/services/blogAiService.ts`:

```ts
import {
  generateTextComplex, generateJson, generateJsonComplex, generateTextFast, todayContext,
} from "./geminiService.js";

export type AiEdit = { find: string; replace: string; rationale: string };

type PMNodeish = { type?: string; text?: string; content?: PMNodeish[]; attrs?: Record<string, unknown> };

const BLOCK_TYPES = new Set([
  "paragraph", "heading", "blockquote", "listItem", "taskItem", "codeBlock", "tableCell", "tableHeader",
]);

/**
 * Flatten a TipTap document to plain text, one line per block. Block-level
 * separation matters: the model needs to see paragraph boundaries to quote a
 * whole sentence, and run-together text produces quotes that span blocks and
 * can never be located in the document.
 */
export function docToPlainText(doc: unknown): string {
  const lines: string[] = [];
  let current = "";

  const walk = (node: PMNodeish | undefined) => {
    if (!node) return;
    if (node.type === "text") { current += node.text ?? ""; return; }
    // Atom nodes with useful prose in their attrs.
    if (node.type === "hero") {
      lines.push(String(node.attrs?.heading ?? ""), String(node.attrs?.subheading ?? ""));
      return;
    }
    if (node.type === "ctaButton") { lines.push(String(node.attrs?.label ?? "")); return; }

    const isBlock = !!node.type && BLOCK_TYPES.has(node.type);
    if (isBlock) current = "";
    node.content?.forEach(walk);
    if (isBlock) {
      const text = current.trim();
      if (text) lines.push(text);
      current = "";
    }
  };

  walk(doc as PMNodeish);
  return lines.filter(Boolean).join("\n\n");
}

const MAX_DOC_CHARS = 24_000;

function docContext(title: string, doc: unknown): string {
  const text = docToPlainText(doc);
  const clipped = text.length > MAX_DOC_CHARS
    ? `${text.slice(0, MAX_DOC_CHARS)}\n\n[Post truncated for length]`
    : text;
  return `TITLE: ${title || "(untitled)"}\n\nPOST BODY:\n${clipped}`;
}

export async function askAboutDoc(args: { title: string; doc: unknown; question: string }): Promise<string> {
  const prompt = `${todayContext()}

You are an editorial assistant for the Purdue SEARCH student club's blog. Answer the
question about the draft below. Be concrete and brief — a few sentences unless more is
genuinely needed. If the draft does not contain the answer, say so plainly rather than
inventing facts about the club, its projects, or its people.

${docContext(args.title, args.doc)}

QUESTION: ${args.question}`;

  return generateTextComplex(prompt);
}

const EDIT_RULES = `Return JSON of the form:
{"edits":[{"find":"...","replace":"...","rationale":"..."}]}

Rules, all mandatory:
- "find" MUST be text copied VERBATIM from the post body, character for character.
  Never paraphrase it, never re-punctuate it, never add or remove whitespace.
- "find" must be long enough to occur exactly once — include surrounding words if a
  short phrase would be ambiguous.
- "find" must stay within a single paragraph. Never span a blank line.
- "replace" is the full replacement for "find". Use an empty string to delete it.
- "rationale" is at most 12 words explaining why.
- Return at most 12 edits, the highest-value ones only.
- Do not invent facts, names, dates or numbers that are not already in the post.
- Return {"edits":[]} if nothing needs changing.`;

export async function suggestEdits(args: {
  title: string;
  doc: unknown;
  instruction: string;
  scope: "selection" | "document";
  selection?: string;
}): Promise<AiEdit[]> {
  const isSelection = args.scope === "selection";

  const prompt = isSelection
    ? `${todayContext()}

You are a copy editor for the Purdue SEARCH student club's blog. Apply this instruction
to the SELECTED TEXT only, leaving the rest of the post untouched. The selected text is
quoted from the post body, which is given for context.

INSTRUCTION: ${args.instruction}

SELECTED TEXT:
${args.selection ?? ""}

${docContext(args.title, args.doc)}

${EDIT_RULES}
Every "find" must be inside the SELECTED TEXT above.`
    : `${todayContext()}

You are a copy editor for the Purdue SEARCH student club's blog. Apply this instruction
across the whole draft below, as a set of targeted edits.

INSTRUCTION: ${args.instruction}

${docContext(args.title, args.doc)}

${EDIT_RULES}`;

  // Whole-post edits get the reasoning-class model (it already falls back to the
  // standard model when the daily quota is spent); selection edits are small
  // enough for the standard lane.
  const result = isSelection
    ? await generateJson<{ edits?: AiEdit[] }>(prompt)
    : await generateJsonComplex<{ edits?: AiEdit[] }>(prompt, undefined, { maxOutputTokens: 4096 });

  if (!result || !Array.isArray(result.edits)) return [];

  return result.edits
    .filter((e) => e && typeof e.find === "string" && e.find.trim().length > 0
                && typeof e.replace === "string")
    .slice(0, 12)
    .map((e) => ({
      find: e.find,
      replace: e.replace,
      rationale: typeof e.rationale === "string" ? e.rationale.slice(0, 120) : "",
    }));
}

export async function completeText(args: { title: string; before: string }): Promise<string> {
  const prompt = `Continue this blog draft for the Purdue SEARCH student club.

Write ONLY the continuation — no preamble, no quotes, no markdown, no explanation.
At most 25 words. Match the existing voice and tense. Stop at a natural break.
If the text already ends a complete thought, continue with the next sentence.
Do not invent specific facts, names, dates or numbers.

TITLE: ${args.title || "(untitled)"}

TEXT SO FAR:
${args.before}`;

  const out = await generateTextFast(prompt);
  // Models sometimes wrap the continuation in quotes or restate the prompt tail.
  return out.replace(/^["'“”]+|["'“”]+$/g, "").trim();
}
```

- [ ] **Step 2: Typecheck**

```bash
cd backend && npx tsc --noEmit
```

Expected: no output. If `generateJsonComplex` rejects the third argument, check its signature in `geminiService.ts` — it accepts `(prompt, cacheKey?, opts?)`, so `undefined` must be passed for the cache key.

- [ ] **Step 3: Sanity-check the flattener**

```bash
cd backend && npx tsx -e "import('./src/services/blogAiService.js').then(m => console.log(JSON.stringify(m.docToPlainText({type:'doc',content:[{type:'heading',attrs:{level:2},content:[{type:'text',text:'Crew-1'}]},{type:'paragraph',content:[{type:'text',text:'We '},{type:'text',text:'shipped',marks:[{type:'bold'}]},{type:'text',text:' it.'}]}]}))))"
```

Expected: `"Crew-1\n\nWe shipped it."` — blocks separated by a blank line, marks flattened away.

- [ ] **Step 4: Commit**

```bash
git add backend/src/services/blogAiService.ts
git commit -m "feat(blog): add AI service for ask, edit and complete"
```

---

## Task 12: Blog AI routes

**Files:**
- Create: `backend/src/api/blogAi.ts`
- Modify: `backend/src/app.ts`
- Modify: `src/api/clubPmClient.js`

**Interfaces:**
- Consumes: `blogAiService` (Task 11); `isDocEditor` / `docExists` (Task 2).
- Produces:
  - `POST /api/blog/ai/ask` `{ docType, docId, question }` → `{ answer }`
  - `POST /api/blog/ai/edit` `{ docType, docId, scope, instruction, selection? }` → `{ edits }`
  - `POST /api/blog/ai/complete` `{ docType, docId, before }` → `{ completion }`
  - Client helpers `blogAiAsk`, `blogAiEdit`, `blogAiComplete`.

- [ ] **Step 1: Write the router**

All three endpoints are editor-only, which bounds Gemini spend to the people who own each post. Create `backend/src/api/blogAi.ts`:

```ts
import { Router, type Request, type Response } from "express";
import { requireAuth } from "./auth.js";
import { prisma } from "../db/prisma.js";
import * as ai from "../services/blogAiService.js";
import { isDocEditor, type DocRef, type DocType } from "../services/blogThreadService.js";
import { GeminiRateLimitError } from "../services/geminiService.js";

export const blogAiRouter = Router();
blogAiRouter.use(requireAuth);

const DOC_TYPES: DocType[] = ["BLOG_POST", "PRESS_KIT"];

/** Loads the doc's title + content, but only for members who may edit it. */
async function loadDoc(req: Request, res: Response): Promise<{ title: string; doc: unknown } | null> {
  const docType = req.body?.docType as DocType;
  const docId = req.body?.docId as string;
  if (!DOC_TYPES.includes(docType) || typeof docId !== "string" || !docId) {
    res.status(400).json({ error: "docType and docId are required" });
    return null;
  }
  const ref: DocRef = { docType, docId };
  if (!(await isDocEditor(ref, req.memberId!))) {
    // Covers both "not found" and "not yours" — no reason to distinguish.
    res.status(403).json({ error: "Only the post's authors can use AI here" });
    return null;
  }
  if (docType === "BLOG_POST") {
    const post = await prisma.blogPost.findUnique({
      where: { id: docId }, select: { title: true, contentJson: true },
    });
    if (!post) { res.status(404).json({ error: "Post not found" }); return null; }
    return { title: post.title, doc: post.contentJson };
  }
  const kit = await prisma.projectPressKit.findUnique({
    where: { id: docId },
    select: { contentJson: true, project: { select: { name: true } } },
  });
  if (!kit) { res.status(404).json({ error: "Press kit not found" }); return null; }
  return { title: `${kit.project?.name ?? "Project"} press kit`, doc: kit.contentJson };
}

function handleErr(res: Response, err: unknown, label: string) {
  if (err instanceof GeminiRateLimitError) {
    res.status(429).json({ error: "AI is busy right now — try again in a minute" });
    return;
  }
  console.error(`[blogAi] ${label} error:`, err);
  res.status(500).json({ error: "AI request failed" });
}

blogAiRouter.post("/ai/ask", async (req: Request, res: Response) => {
  try {
    const ctx = await loadDoc(req, res);
    if (!ctx) return;
    const question = req.body?.question;
    if (typeof question !== "string" || !question.trim()) {
      res.status(400).json({ error: "question is required" });
      return;
    }
    const answer = await ai.askAboutDoc({ title: ctx.title, doc: ctx.doc, question });
    res.json({ answer });
  } catch (err) { handleErr(res, err, "ask"); }
});

blogAiRouter.post("/ai/edit", async (req: Request, res: Response) => {
  try {
    const ctx = await loadDoc(req, res);
    if (!ctx) return;
    const { instruction, scope, selection } = req.body ?? {};
    if (typeof instruction !== "string" || !instruction.trim()) {
      res.status(400).json({ error: "instruction is required" });
      return;
    }
    if (scope !== "selection" && scope !== "document") {
      res.status(400).json({ error: "scope must be 'selection' or 'document'" });
      return;
    }
    if (scope === "selection" && (typeof selection !== "string" || !selection.trim())) {
      res.status(400).json({ error: "selection is required when scope is 'selection'" });
      return;
    }
    const edits = await ai.suggestEdits({
      title: ctx.title, doc: ctx.doc, instruction, scope,
      selection: typeof selection === "string" ? selection : undefined,
    });
    res.json({ edits });
  } catch (err) { handleErr(res, err, "edit"); }
});

blogAiRouter.post("/ai/complete", async (req: Request, res: Response) => {
  try {
    const ctx = await loadDoc(req, res);
    if (!ctx) return;
    const before = req.body?.before;
    if (typeof before !== "string" || before.trim().length < 3) {
      res.json({ completion: "" });
      return;
    }
    // Only the tail matters, and a short prompt is what keeps this lane cheap.
    const completion = await ai.completeText({ title: ctx.title, before: before.slice(-1500) });
    res.json({ completion });
  } catch (err) { handleErr(res, err, "complete"); }
});
```

- [ ] **Step 2: Mount it**

In `backend/src/app.ts`, add the import beside the other blog imports:

```ts
import { blogAiRouter } from "./api/blogAi.js";
```

And mount alongside the others:

```ts
app.use("/api/blog", blogAiRouter);
```

- [ ] **Step 3: Add the client helpers**

Append to `src/api/clubPmClient.js` after the thread helpers from Task 6:

```js
export const blogAiAsk      = (docType, docId, question) => post('/api/blog/ai/ask', { docType, docId, question });
export const blogAiEdit     = (docType, docId, body) => post('/api/blog/ai/edit', { docType, docId, ...body });
export const blogAiComplete = (docType, docId, before) => post('/api/blog/ai/complete', { docType, docId, before });
```

- [ ] **Step 4: Typecheck and build**

```bash
cd backend && npx tsc --noEmit && cd .. && npm run build
```

Expected: no `tsc` output, "Compiled successfully".

- [ ] **Step 5: Verify the endpoints**

With the backend running and a post id you own:

```bash
curl -s -b cookies.txt -H 'Content-Type: application/json' \
  -d '{"docType":"BLOG_POST","docId":"<postId>","question":"What is this post about?"}' \
  http://localhost:4000/api/blog/ai/ask
```

Expected: `{"answer":"..."}`. Then check the permission boundary — the same call as a member who is not an author must return 403, and a bad scope must 400:

```bash
curl -s -b cookies.txt -H 'Content-Type: application/json' \
  -d '{"docType":"BLOG_POST","docId":"<postId>","instruction":"tighten","scope":"nope"}' \
  http://localhost:4000/api/blog/ai/edit
```

Expected: `{"error":"scope must be 'selection' or 'document'"}`.

- [ ] **Step 6: Commit**

```bash
git add backend/src/api/blogAi.ts backend/src/app.ts src/api/clubPmClient.js
git commit -m "feat(blog): add AI ask/edit/complete routes"
```

---

## Task 13: Quote matching

**Files:**
- Create: `src/components/clubpm/blog/aiQuoteMatch.js`
- Create: `src/components/clubpm/blog/aiQuoteMatch.test.js`

**Interfaces:**
- Consumes: nothing (pure, operates on a ProseMirror doc via `descendants`).
- Produces:
  - `normalizeQuote(text: string): string`
  - `findQuoteRange(doc, quote): { from: number, to: number, tier: 'exact'|'normalized'|'anchored' } | null`

- [ ] **Step 1: Write the failing test**

Create `src/components/clubpm/blog/aiQuoteMatch.test.js`:

```js
import { Schema } from '@tiptap/pm/model';
import { findQuoteRange, normalizeQuote } from './aiQuoteMatch';

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { content: 'inline*', group: 'block', toDOM: () => ['p', 0] },
    text: { group: 'inline' },
  },
  marks: { bold: {} },
});

function docOf(...paragraphs) {
  return schema.node('doc', null, paragraphs.map((p) =>
    schema.node('paragraph', null, Array.isArray(p)
      ? p.map(([t, m]) => schema.text(t, m ? [schema.marks.bold.create()] : []))
      : [schema.text(p)])));
}

test('normalizeQuote collapses whitespace and smart punctuation', () => {
  expect(normalizeQuote('  we  did\ntesting ')).toBe('we did testing');
  expect(normalizeQuote('don’t “stop”')).toBe(`don't "stop"`);
});

test('tier 1: exact match', () => {
  const doc = docOf('We did testing last week.');
  expect(findQuoteRange(doc, 'did testing')).toEqual({ from: 4, to: 15, tier: 'exact' });
});

test('tier 1: exact match survives marks splitting the text', () => {
  // "did testing" is split across two text nodes by a bold mark — the quote
  // must still match, because AI never sees the mark boundaries.
  const doc = docOf([['We ', false], ['did', true], [' testing here', false]]);
  const hit = findQuoteRange(doc, 'did testing');
  expect(hit.tier).toBe('exact');
  expect(doc.textBetween(hit.from, hit.to)).toBe('did testing');
});

test('tier 2: normalized match when the model re-punctuates', () => {
  const doc = docOf('We don’t ship  untested hardware.');
  const hit = findQuoteRange(doc, `don't ship untested`);
  expect(hit.tier).toBe('normalized');
  expect(doc.textBetween(hit.from, hit.to)).toContain('ship');
});

test('tier 3: anchored match on a long quote with a garbled middle', () => {
  const doc = docOf('The Crew One team completed a full thermal vacuum test campaign in April.');
  const hit = findQuoteRange(doc,
    'The Crew One team completed SOMETHING ENTIRELY WRONG HERE campaign in April.');
  expect(hit.tier).toBe('anchored');
  expect(doc.textBetween(hit.from, hit.to)).toContain('Crew One');
  expect(doc.textBetween(hit.from, hit.to)).toContain('April');
});

test('gives up rather than guessing', () => {
  const doc = docOf('We did testing last week.');
  expect(findQuoteRange(doc, 'a completely unrelated sentence about budgets')).toBeNull();
});

test('gives up on an empty quote', () => {
  expect(findQuoteRange(docOf('anything'), '   ')).toBeNull();
});

test('does not match across a paragraph boundary', () => {
  const doc = docOf('First half', 'second half');
  expect(findQuoteRange(doc, 'First half second half')).toBeNull();
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npx react-scripts test --watchAll=false --testPathPattern=aiQuoteMatch
```

Expected: FAIL — cannot find module `./aiQuoteMatch`.

- [ ] **Step 3: Write the matcher**

Create `src/components/clubpm/blog/aiQuoteMatch.js`:

```js
// Locating an AI-supplied quote in the live document is the one place where the
// AI panel can go wrong in a way that damages the post. So this never guesses:
// it tries four increasingly forgiving tiers and returns null rather than
// anchoring to something the model did not mean.

const SMART_PUNCT = [
  [/[‘’‛]/g, "'"],
  [/[“”‟]/g, '"'],
  [/[–—]/g, '-'],
  [/…/g, '...'],
  [/ /g, ' '],
];

/** Lowercase, straighten punctuation, collapse whitespace. */
export function normalizeQuote(text) {
  let out = String(text ?? '');
  SMART_PUNCT.forEach(([re, to]) => { out = out.replace(re, to); });
  return out.replace(/\s+/g, ' ').trim();
}

// Every block that can hold inline text, as one searchable unit. Quotes must
// stay inside a single block — a range spanning two paragraphs cannot be marked
// as one suggestion.
function textBlocks(doc) {
  const blocks = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    blocks.push({ from: pos + 1, text: node.textContent });
    return false; // don't descend into a textblock's inline children
  });
  return blocks;
}

function exactIn(blocks, quote) {
  for (const block of blocks) {
    const idx = block.text.indexOf(quote);
    if (idx !== -1) return { from: block.from + idx, to: block.from + idx + quote.length, tier: 'exact' };
  }
  return null;
}

// Maps each character of the normalized form back to its offset in the raw
// block text, so a normalized hit can be reported as a real document range.
function normalizedIndex(text) {
  let norm = '';
  const offsets = [];
  let prevWasSpace = true;
  for (let i = 0; i < text.length; i += 1) {
    let ch = text[i];
    SMART_PUNCT.forEach(([re, to]) => { if (re.test(ch)) ch = to; re.lastIndex = 0; });
    if (/\s/.test(ch)) {
      if (prevWasSpace) continue;
      norm += ' '; offsets.push(i); prevWasSpace = true;
      continue;
    }
    norm += ch; offsets.push(i); prevWasSpace = false;
  }
  // Trim leading/trailing space the same way normalizeQuote does.
  let start = 0, end = norm.length;
  while (start < end && norm[start] === ' ') start += 1;
  while (end > start && norm[end - 1] === ' ') end -= 1;
  return { norm: norm.slice(start, end), offsets: offsets.slice(start, end) };
}

function normalizedIn(blocks, quote) {
  const target = normalizeQuote(quote);
  if (!target) return null;
  for (const block of blocks) {
    const { norm, offsets } = normalizedIndex(block.text);
    const idx = norm.indexOf(target);
    if (idx === -1) continue;
    const from = block.from + offsets[idx];
    const lastOffset = offsets[idx + target.length - 1];
    return { from, to: block.from + lastOffset + 1, tier: 'normalized' };
  }
  return null;
}

const ANCHOR_WORDS = 6;
const MIN_ANCHORED_WORDS = 12;

/**
 * Last resort for a long quote whose middle the model garbled: match on its
 * first and last few words within one block, and take everything between.
 * Requires a substantial quote so short phrases can't produce a wild range.
 */
function anchoredIn(blocks, quote) {
  const words = normalizeQuote(quote).split(' ').filter(Boolean);
  if (words.length < MIN_ANCHORED_WORDS) return null;
  const head = words.slice(0, ANCHOR_WORDS).join(' ');
  const tail = words.slice(-ANCHOR_WORDS).join(' ');

  for (const block of blocks) {
    const { norm, offsets } = normalizedIndex(block.text);
    const h = norm.indexOf(head);
    if (h === -1) continue;
    const t = norm.indexOf(tail, h + head.length);
    if (t === -1) continue;
    const endNorm = t + tail.length - 1;
    return { from: block.from + offsets[h], to: block.from + offsets[endNorm] + 1, tier: 'anchored' };
  }
  return null;
}

/**
 * Find `quote` in `doc`.
 * @returns {{from: number, to: number, tier: 'exact'|'normalized'|'anchored'}|null}
 *          null when the quote cannot be located — the caller must surface this
 *          as an unlocatable edit rather than anchoring anywhere.
 */
export function findQuoteRange(doc, quote) {
  const raw = String(quote ?? '');
  if (!raw.trim()) return null;
  const blocks = textBlocks(doc);
  return exactIn(blocks, raw)
      ?? normalizedIn(blocks, raw)
      ?? anchoredIn(blocks, raw)
      ?? null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx react-scripts test --watchAll=false --testPathPattern=aiQuoteMatch
```

Expected: 8 passing tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/clubpm/blog/aiQuoteMatch.js src/components/clubpm/blog/aiQuoteMatch.test.js
git commit -m "feat(blog): add AI quote matcher with graceful give-up"
```

---

## Task 14: AI panel

**Files:**
- Create: `src/components/clubpm/blog/BlogAiPanel.jsx`
- Modify: `src/pages/ClubPM/BlogEditorPage.jsx`
- Modify: `src/components/clubpm/blog/BlogEditor.jsx`

**Interfaces:**
- Consumes: `blogAiAsk` / `blogAiEdit` (Task 12), `findQuoteRange` (Task 13), `applySuggestion` (Task 4), `createBlogThread` (Task 6), CSS from Task 7.
- Produces: `<BlogAiPanel editor docType docId title isOpen onClose initialSelection onThreadsChanged />`.

- [ ] **Step 1: Write the panel**

Create `src/components/clubpm/blog/BlogAiPanel.jsx`:

```jsx
import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { blogAiAsk, blogAiEdit, createBlogThread } from '../../../api/clubPmClient';
import { findQuoteRange } from './aiQuoteMatch';

const QUICK_ACTIONS = [
  { label: 'Tighten', instruction: 'Make this tighter and less wordy without losing meaning.' },
  { label: 'Fix grammar', instruction: 'Fix grammar, spelling and punctuation only. Change nothing else.' },
  { label: 'More formal', instruction: 'Raise the register to formal but still readable prose.' },
  { label: 'Plainer', instruction: 'Rewrite in plainer language a first-year student would follow.' },
  { label: 'Active voice', instruction: 'Convert passive constructions to active voice.' },
];

// One proposed edit. `range` is null when the quote could not be located, in
// which case the card is informational only — anchoring a guess would damage
// the post, so we surface the miss instead.
function EditCard({ edit, onSuggest, busy }) {
  const [replace, setReplace] = useState(edit.replace);
  const locatable = !!edit.range;

  return (
    <div className={`cpm-blog-ai-edit-card${locatable ? '' : ' cpm-blog-ai-edit-card--unlocatable'}`}>
      <div className="cpm-blog-thread-diff">
        <del>{edit.find}</del>
        <ins>{replace || '(delete)'}</ins>
      </div>
      {edit.rationale && <p className="cpm-blog-thread-rationale">{edit.rationale}</p>}
      {locatable ? (
        <>
          <textarea
            className="cpm-blog-ai-input"
            style={{ minHeight: 48 }}
            value={replace}
            onChange={(e) => setReplace(e.target.value)}
          />
          <div className="cpm-blog-thread-actions">
            <button
              type="button"
              className="clubpm-btn-primary"
              disabled={busy}
              onClick={() => onSuggest(edit, replace)}
            >
              <i className="fas fa-pen-to-square" aria-hidden="true" /> Suggest
            </button>
          </div>
        </>
      ) : (
        <p className="cpm-blog-thread-rationale">
          <i className="fas fa-triangle-exclamation" aria-hidden="true" />{' '}
          Couldn’t find this text in the post — it may have changed since. Skipped.
        </p>
      )}
    </div>
  );
}

export default function BlogAiPanel({
  editor, docType, docId, title, isOpen, onClose, initialSelection, onThreadsChanged,
}) {
  const [tab, setTab] = useState('ask'); // 'ask' | 'selection' | 'document'
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [instruction, setInstruction] = useState('');
  const [edits, setEdits] = useState([]);
  const [busy, setBusy] = useState(false);

  // Arriving from the bubble's "Ask AI" means the user already has a selection
  // in mind, so open straight onto the selection tab.
  useEffect(() => {
    if (isOpen && initialSelection) setTab('selection');
  }, [isOpen, initialSelection]);

  if (!isOpen) return null;

  const selectedText = editor && !editor.state.selection.empty
    ? editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to, ' ')
    : '';

  const ask = async () => {
    if (!question.trim()) return;
    setBusy(true); setAnswer('');
    try {
      const { answer: a } = await blogAiAsk(docType, docId, question);
      setAnswer(a || 'No answer came back.');
    } catch (err) {
      toast.error(err.message ?? 'AI request failed');
    } finally { setBusy(false); }
  };

  const requestEdits = async (instructionText) => {
    const text = (instructionText ?? instruction).trim();
    if (!text) { toast.error('Say what you want changed'); return; }
    if (tab === 'selection' && !selectedText) { toast.error('Select some text first'); return; }

    setBusy(true); setEdits([]);
    try {
      const { edits: raw } = await blogAiEdit(docType, docId, {
        scope: tab === 'selection' ? 'selection' : 'document',
        instruction: text,
        ...(tab === 'selection' ? { selection: selectedText } : {}),
      });
      if (!raw?.length) { toast.success('Nothing to change'); return; }
      // Locate every quote against the LIVE doc, not the server's snapshot —
      // co-editors may have moved things since the last save.
      setEdits(raw.map((e) => ({ ...e, range: findQuoteRange(editor.state.doc, e.find) })));
    } catch (err) {
      toast.error(err.message ?? 'AI request failed');
    } finally { setBusy(false); }
  };

  // The AI never writes to the document — it only creates suggestions, which is
  // what keeps this safe while other people are editing the same post.
  const suggestOne = async (edit, replaceText) => {
    const range = findQuoteRange(editor.state.doc, edit.find);
    if (!range) { toast.error('That text is no longer in the post'); return; }
    setBusy(true);
    try {
      const thread = await createBlogThread(docType, docId, {
        kind: 'SUGGESTION',
        origin: 'AI',
        anchorText: edit.find,
        replaceWith: replaceText,
        rationale: edit.rationale,
        body: '',
      });
      editor.chain().focus()
        .applySuggestion({ threadId: thread.id, from: range.from, to: range.to, replace: replaceText })
        .run();
      setEdits((prev) => prev.filter((e) => e !== edit));
      onThreadsChanged?.();
    } catch (err) {
      toast.error(err.message ?? 'Could not record that suggestion');
    } finally { setBusy(false); }
  };

  const suggestAll = async () => {
    for (const edit of edits.filter((e) => e.range)) {
      // Sequential on purpose: each applied suggestion shifts the positions of
      // the ones after it, so every quote is re-located against the fresh doc.
      // eslint-disable-next-line no-await-in-loop
      await suggestOne(edit, edit.replace);
    }
  };

  const locatable = edits.filter((e) => e.range).length;

  return (
    <aside className="cpm-blog-meta-panel" aria-label="AI assistant">
      <div className="cpm-blog-meta-panel-header">
        <h2 className="cpm-blog-meta-panel-title">
          <i className="fas fa-wand-magic-sparkles" aria-hidden="true" /> AI Assistant
        </h2>
        <button type="button" className="cpm-blog-meta-panel-close" onClick={onClose} aria-label="Close AI panel">
          <i className="fas fa-times" aria-hidden="true" />
        </button>
      </div>

      <div className="cpm-blog-meta-panel-body">
        <div className="cpm-blog-ai-panel">
          <div className="cpm-blog-ai-tabs" role="tablist">
            {[
              { id: 'ask', label: 'Ask' },
              { id: 'selection', label: 'Selection' },
              { id: 'document', label: 'Whole post' },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                className={tab === t.id ? 'is-active' : ''}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === 'ask' ? (
            <>
              <textarea
                className="cpm-blog-ai-input"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder={`Ask anything about “${title || 'this post'}” — what's missing, is the tone consistent, does the intro work?`}
              />
              <button type="button" className="clubpm-btn-primary" disabled={busy} onClick={ask}>
                {busy ? 'Thinking…' : 'Ask'}
              </button>
              {answer && <div className="cpm-blog-ai-answer">{answer}</div>}
            </>
          ) : (
            <>
              {tab === 'selection' && (
                <p className="cpm-blog-bubble-form-quote">
                  {selectedText
                    ? `“${selectedText.slice(0, 180)}”`
                    : 'Select text in the post, then choose an action.'}
                </p>
              )}
              <div className="cpm-blog-ai-quick">
                {QUICK_ACTIONS.map((a) => (
                  <button
                    key={a.label}
                    type="button"
                    className="clubpm-btn-secondary"
                    disabled={busy}
                    onClick={() => { setInstruction(a.instruction); requestEdits(a.instruction); }}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
              <textarea
                className="cpm-blog-ai-input"
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                placeholder={tab === 'selection'
                  ? 'Or describe the change you want to this selection…'
                  : 'Describe the change you want across the whole post…'}
              />
              <button type="button" className="clubpm-btn-primary" disabled={busy} onClick={() => requestEdits()}>
                {busy ? 'Working…' : 'Propose edits'}
              </button>

              {edits.length > 0 && (
                <>
                  <p className="cpm-blog-thread-rationale">
                    {locatable} of {edits.length} edits can be applied.
                    Each becomes a suggestion you can accept or reject.
                  </p>
                  {locatable > 1 && (
                    <button type="button" className="clubpm-btn-secondary" disabled={busy} onClick={suggestAll}>
                      Suggest all {locatable}
                    </button>
                  )}
                  {edits.map((e, i) => (
                    <EditCard key={`${e.find}-${i}`} edit={e} busy={busy} onSuggest={suggestOne} />
                  ))}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </aside>
  );
}
```

- [ ] **Step 2: Wire it into the page**

In `src/pages/ClubPM/BlogEditorPage.jsx`, add the import:

```jsx
import BlogAiPanel from '../../components/clubpm/blog/BlogAiPanel';
```

Add state next to the other panel state:

```jsx
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [aiSelection, setAiSelection] = useState('');
```

Add a toolbar button in the `cpm-blog-tool-group`, after the review-panel button:

```jsx
            <button
              type="button"
              className={`cpm-blog-tool-btn${aiPanelOpen ? ' is-active' : ''}`}
              onClick={() => setAiPanelOpen((v) => !v)}
              title="AI assistant"
              aria-label="AI assistant"
            >
              <i className="fas fa-wand-magic-sparkles" aria-hidden="true" />
            </button>
```

Pass `onAskAi` to `<BlogEditor>` (alongside the props added in Task 9):

```jsx
            onAskAi={(text) => { setAiSelection(text); setAiPanelOpen(true); }}
```

And render the panel next to the others, at the end of the component:

```jsx
      <BlogAiPanel
        editor={editorInstance}
        docType="BLOG_POST"
        docId={id}
        title={title}
        isOpen={aiPanelOpen}
        onClose={() => setAiPanelOpen(false)}
        initialSelection={aiSelection}
        onThreadsChanged={() => setThreadsRefreshKey((k) => k + 1)}
      />
```

- [ ] **Step 3: Remove the Task 8 placeholder**

In `src/components/clubpm/blog/BlogEditor.jsx`, delete the hidden `aiSelection` hint span and the `aiSelection` state added in Task 8 — the page owns that value now. Keep passing `onAskAi` straight through:

```jsx
              onAskAi={(text) => onAskAi?.(text)}
```

- [ ] **Step 4: Build**

```bash
npm run build
```

Expected: "Compiled successfully", with no unused-variable warnings for `aiSelection` in `BlogEditor.jsx`.

- [ ] **Step 5: Verify in the browser**

1. Open a post you authored and click the wand button. The panel opens on **Ask**.
2. Ask "what is this post missing?" — an answer appears within a few seconds.
3. Switch to **Whole post**, click **Tighten**. Edit cards appear with `del`/`ins` diffs.
4. Click **Suggest** on one card. The document gains a struck-through original plus a teal replacement, and the review panel shows a new card badged **AI**.
5. Accept that suggestion from the review panel. The text updates cleanly.
6. Select a sentence, click **Ask AI** in the bubble. The panel opens on the **Selection** tab with the sentence quoted.
7. Edit a proposed replacement before clicking Suggest — the suggestion uses your edited text, not the AI's.
8. To confirm graceful degradation: request whole-post edits, then delete one of the quoted sentences in the editor before clicking Suggest on its card. Expect the toast "That text is no longer in the post" and no document change.

- [ ] **Step 6: Commit**

```bash
git add src/components/clubpm/blog/BlogAiPanel.jsx src/pages/ClubPM/BlogEditorPage.jsx src/components/clubpm/blog/BlogEditor.jsx
git commit -m "feat(blog): add AI panel that proposes edits as suggestions"
```

---

## Task 15: Inline autocomplete

**Files:**
- Create: `src/components/clubpm/blog/blogAutocomplete.js`
- Modify: `src/components/clubpm/blog/BlogEditor.jsx`

**Interfaces:**
- Consumes: `blogAiComplete` (Task 12); the `.cpm-blog-ghost` class (Task 7).
- Produces: `BlogAutocomplete` — a TipTap `Extension` configurable with `{ docType, docId, getTitle, enabled }`. `Mod-\` requests a completion, `Tab` accepts, `Escape` dismisses.

- [ ] **Step 1: Write the extension**

Create `src/components/clubpm/blog/blogAutocomplete.js`:

```js
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { blogAiComplete } from '../../../api/clubPmClient';

// Manually triggered ghost-text completion (Ctrl/Cmd + \). Manual rather than
// on-pause because every standard-model Gemini caller shares one 30 RPM window;
// this also gets its own cheap-model lane server-side (generateTextFast).
export const autocompleteKey = new PluginKey('blogAutocomplete');

// How much text before the caret to send. Enough for voice and context,
// small enough to keep the call cheap.
const CONTEXT_CHARS = 1500;

export const BlogAutocomplete = Extension.create({
  name: 'blogAutocomplete',

  addOptions() {
    return { docType: 'BLOG_POST', docId: null, enabled: true };
  },

  addProseMirrorPlugins() {
    return [new Plugin({
      key: autocompleteKey,

      state: {
        init: () => ({ pos: null, text: '' }),
        apply(tr, value) {
          const meta = tr.getMeta(autocompleteKey);
          if (meta) return meta;
          // Any document change or cursor move invalidates the suggestion —
          // ghost text left over from an earlier caret position is worse than none.
          if (tr.docChanged || tr.selectionSet) return { pos: null, text: '' };
          return value;
        },
      },

      props: {
        decorations(state) {
          const { pos, text } = autocompleteKey.getState(state);
          if (pos == null || !text) return null;
          const widget = Decoration.widget(pos, () => {
            const span = document.createElement('span');
            span.className = 'cpm-blog-ghost';
            span.textContent = text;
            return span;
          }, { side: 1 });
          return DecorationSet.create(state.doc, [widget]);
        },

        handleKeyDown(view, event) {
          const { pos, text } = autocompleteKey.getState(view.state);
          if (pos == null || !text) return false;

          if (event.key === 'Tab') {
            event.preventDefault();
            view.dispatch(
              view.state.tr
                .insertText(text, pos)
                .setMeta(autocompleteKey, { pos: null, text: '' }),
            );
            return true;
          }
          if (event.key === 'Escape') {
            event.preventDefault();
            view.dispatch(view.state.tr.setMeta(autocompleteKey, { pos: null, text: '' }));
            return true;
          }
          return false;
        },
      },
    })];
  },

  addKeyboardShortcuts() {
    const options = this.options;

    return {
      'Mod-\\': () => {
        const { editor } = this;
        if (!options.enabled || !options.docId) return false;
        const { state, view } = editor;
        if (!state.selection.empty) return false;

        const pos = state.selection.from;
        const before = state.doc.textBetween(0, pos, '\n\n', ' ').slice(-CONTEXT_CHARS);
        if (before.trim().length < 3) return false;

        blogAiComplete(options.docType, options.docId, before)
          .then(({ completion }) => {
            if (!completion) return;
            // Only show it if the caret has not moved since the request went out.
            if (view.isDestroyed || view.state.selection.from !== pos) return;
            view.dispatch(view.state.tr.setMeta(autocompleteKey, { pos, text: completion }));
          })
          .catch(() => { /* silent: no ghost text is the correct failure mode */ });

        return true;
      },
    };
  },
});

export default BlogAutocomplete;
```

- [ ] **Step 2: Register it and document the shortcut**

In `src/components/clubpm/blog/BlogEditor.jsx`, add the import:

```js
import BlogAutocomplete from './blogAutocomplete';
```

`blogExtensions()` currently takes only `collab`. Add a second parameter for the autocomplete options so the extension can reach the doc id, and keep the existing single-argument call sites working:

```js
export function blogExtensions(collab, autocomplete) {
```

And add to the returned array, right after `...suggestionExtensions()`:

```js
    BlogAutocomplete.configure({
      docType: autocomplete?.docType ?? 'BLOG_POST',
      docId: autocomplete?.docId ?? null,
      enabled: !!autocomplete?.enabled,
    }),
```

In the `useEditor` call, pass the options and add `reviewDocId` / `canEditDoc` to its dependency array so a late-arriving id takes effect:

```js
  const editor = useEditor({
    extensions: blogExtensions(collab ? {
      document: collab.document,
      provider: collab.provider,
      user: { name: collabUser?.name || 'Anonymous', color: colorForMember(collabUser?.id) },
    } : null, {
      docType,
      docId: reviewDocId,
      enabled: canEditDoc,
    }),
    content: collab ? undefined : (content ?? { type: 'doc', content: [{ type: 'paragraph' }] }),
    editable,
    onUpdate: ({ editor: ed }) => { onChange?.(ed.getJSON()); },
  }, [collab, reviewDocId, docType, canEditDoc]);
```

Add it to the documentation-only shortcut registry so it shows up in the "?" modal, alongside the existing entries:

```js
    { id: 'blog.autocomplete', keys: 'Ctrl/⌘+\\', scope: 'page', pageId: 'Blog Editor', description: 'AI autocomplete (Tab to accept)', action: () => {} },
```

- [ ] **Step 3: Build**

```bash
npm run build
```

Expected: "Compiled successfully".

- [ ] **Step 4: Verify in the browser**

1. Open a post you authored, click at the end of a paragraph, and press **Ctrl+\\**.
2. Faded ghost text appears after the caret within a second or two.
3. Press **Tab** — the ghost text becomes real text at the caret.
4. Trigger it again and press **Escape** — the ghost text disappears with no insertion.
5. Trigger it again and type a character — the ghost text disappears (stale suggestion invalidated).
6. Select some text and press Ctrl+\\ — nothing happens (completion only makes sense at a collapsed caret).
7. Confirm the shortcut is listed in the "?" keyboard shortcuts modal.

- [ ] **Step 5: Commit**

```bash
git add src/components/clubpm/blog/blogAutocomplete.js src/components/clubpm/blog/BlogEditor.jsx
git commit -m "feat(blog): add manually triggered inline AI autocomplete"
```

---

## Task 16: Notify authors of review activity

**Files:**
- Modify: `backend/src/api/blogThreads.ts`
- Create: `backend/src/services/blogThreadNotify.ts`

**Interfaces:**
- Consumes: `createNotification` from `notificationCrud`, `queueDm` from `dmBatcher`, `BLOG_COMMENTED` from Task 1.
- Produces: `notifyThreadActivity(args: { docRef, actorId, threadId, kind, snippet }): Promise<void>` — fire-and-forget, never throws.

- [ ] **Step 1: Write the notifier**

Create `backend/src/services/blogThreadNotify.ts`:

```ts
import { prisma } from "../db/prisma.js";
import { createNotification } from "./notificationCrud.js";
import { queueDm } from "./dmBatcher.js";
import type { DocRef } from "./blogThreadService.js";

/**
 * Tell a draft's authors that someone reviewed it. Fire-and-forget: a review
 * comment must still succeed if Slack or the notification write fails, so this
 * never throws and callers do not await it.
 */
export async function notifyThreadActivity(args: {
  docRef: DocRef;
  actorId: string;
  threadId: string;
  kind: "COMMENT" | "SUGGESTION";
  snippet: string;
}): Promise<void> {
  try {
    const { docRef, actorId, kind, snippet } = args;

    let recipientIds: string[] = [];
    let label = "a draft";

    if (docRef.docType === "BLOG_POST") {
      const post = await prisma.blogPost.findUnique({
        where: { id: docRef.docId },
        select: { title: true, createdById: true, authors: { select: { memberId: true } } },
      });
      if (!post) return;
      label = post.title || "a draft";
      recipientIds = [post.createdById, ...post.authors.map((a) => a.memberId)];
    } else {
      const kit = await prisma.projectPressKit.findUnique({
        where: { id: docRef.docId },
        select: { createdById: true, project: { select: { name: true } } },
      });
      if (!kit) return;
      label = `${kit.project?.name ?? "Project"} press kit`;
      recipientIds = [kit.createdById];
    }

    // Never notify the person who just acted.
    const targets = [...new Set(recipientIds)].filter((id) => id && id !== actorId);
    if (targets.length === 0) return;

    const actor = await prisma.member.findUnique({
      where: { id: actorId },
      select: { displayName: true },
    });
    const who = actor?.displayName ?? "Someone";
    const verb = kind === "SUGGESTION" ? "suggested an edit on" : "commented on";
    const message = `${who} ${verb} “${label}”: ${snippet.slice(0, 120)}`;

    const members = await prisma.member.findMany({
      where: { id: { in: targets } },
      select: { id: true, slackId: true },
    });

    await Promise.all(members.map((m) =>
      createNotification({
        type: "BLOG_COMMENTED",
        recipientId: m.id,
        actorId,
        message,
        metadata: { threadId: args.threadId, docType: docRef.docType, docId: docRef.docId },
      })
    ));

    members.forEach((m) => { if (m.slackId) queueDm(m.slackId, message); });
  } catch (err) {
    console.error("[blogThreadNotify] failed:", err);
  }
}
```

- [ ] **Step 2: Call it from the two creation routes**

In `backend/src/api/blogThreads.ts`, add the import:

```ts
import { notifyThreadActivity } from "../services/blogThreadNotify.js";
```

In the `POST /docs/:docType/:docId/threads` handler, immediately before `res.status(201).json(thread)`. AI-origin threads are skipped — the author created those themselves, so notifying them is noise:

```ts
    if (thread.origin !== "AI") {
      void notifyThreadActivity({
        docRef: ctx.ref,
        actorId: req.memberId!,
        threadId: thread.id,
        kind,
        snippet: (typeof body === "string" && body.trim()) ? body : anchorText,
      });
    }
```

In the `POST /threads/:id/comments` handler, replace the single response line with:

```ts
    const updated = await threads.addComment(req.params.id as string, req.memberId!, body);
    void notifyThreadActivity({
      docRef: ctx.ref,
      actorId: req.memberId!,
      threadId: req.params.id as string,
      kind: updated?.kind === "SUGGESTION" ? "SUGGESTION" : "COMMENT",
      snippet: body,
    });
    res.status(201).json(updated);
```

- [ ] **Step 3: Typecheck**

```bash
cd backend && npx tsc --noEmit
```

Expected: no output.

- [ ] **Step 4: Verify**

As member A (not the author), comment on member B's draft.

Expected: B sees a new in-app notification "A commented on …" (the bell/SSE stream picks it up live), and if B has a Slack id, a DM arrives. Commenting on your **own** draft produces no notification and no DM.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/blogThreadNotify.ts backend/src/api/blogThreads.ts
git commit -m "feat(blog): notify authors of review comments and suggestions"
```

---

## Task 17: Full-suite verification

**Files:** none modified.

- [ ] **Step 1: Run every test**

```bash
cd backend && npx tsx src/services/blogThreadService.test.ts \
  && npx tsx src/services/blogRender.test.ts \
  && npx tsx src/services/blogSchemaContract.test.ts \
  && npx tsx src/services/pressKitService.test.ts
cd .. && CI=true npx react-scripts test --watchAll=false
```

Expected: every backend script reports `0 failed`; jest reports all suites passing.

- [ ] **Step 2: Typecheck and build**

```bash
cd backend && npx tsc --noEmit && cd .. && npm run build
```

Expected: no `tsc` output, "Compiled successfully".

- [ ] **Step 3: Verify the publish path is clean**

This is the check that matters most: a mid-review draft must publish as if the review never happened.

1. Open a draft, leave one comment and one **unaccepted** suggestion.
2. Publish it.
3. Visit the public `/blog/<slug>` page and view source.

Expected: the suggested replacement text is absent (it was never accepted), the struck original reads normally, and the page contains no `data-thread-id`, no `cpm-blog-sugg-ins`, no `cpm-blog-sugg-del`, and no `cpm-blog-comment-mark`.

```bash
curl -s http://localhost:3000/blog/<slug> | rg -c "data-thread-id|cpm-blog-sugg|cpm-blog-comment-mark"
```

Expected: no matches.

- [ ] **Step 4: Verify press kits inherit the feature**

Press-kit parity is expected to work by accident because the editor is shared. Open a project press kit, select text, and leave a comment.

Expected: it works. If it does not, note what broke — fixing it is out of this plan's scope by decision.

- [ ] **Step 5: Commit any fixes**

```bash
git add -A
git commit -m "fix(blog): address verification findings"
```

---

## Self-Review Notes

**Spec coverage:** every spec section maps to a task — data model → 1; marks → 4; lockstep/render-strip → 5; components → 4, 8, 9, 13, 14, 15; backend routers/services → 2, 3, 11, 12; permissions → 2 (predicates), 3 (enforcement), 12 (AI editor-only); model routing → 10, 11; interaction flow → 14; error handling → 11 (empty edits), 12 (429/400), 9 (orphan), 2 (idempotent race); testing → 2, 4, 5, 13; CSS → 7; notifications → 16.

**Naming consistency:** `findMarkRanges`, `applySuggestion`, `acceptSuggestion`, `rejectSuggestion`, `removeCommentThread`, `setCommentThread`, `findQuoteRange`, `normalizeQuote`, `docToPlainText`, `suggestEdits`, `askAboutDoc`, `completeText`, `generateTextFast`, `notifyThreadActivity`, `canSetThreadStatus`, `canDeleteComment`, `isDocEditor`, `docExists` are each defined once and used under that exact name throughout.

**Deviations from the spec's phase numbering:** the spec's phases 1a/1b/2–6 became tasks 1–16 plus a verification task, because several spec phases exceeded the ≤4-file rule once the client helpers and page wiring were counted. Task 7 front-loads all review CSS in one pass rather than revisiting a 20,500-line file three times.
