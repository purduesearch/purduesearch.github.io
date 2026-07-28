# AI + Review Layer for the Blog / PressKit Editor

**Date:** 2026-07-26
**Status:** Approved, ready for implementation planning

## Goal

Add three capabilities to the ClubPM blog editor:

1. **Inline autocomplete** — manually triggered ghost-text continuation.
2. **An AI panel** — ask questions about the post, edit a selection, or edit the whole
   post. Every AI edit lands as a *suggestion* the author accepts or rejects; the AI
   never writes to the document directly.
3. **A comment and suggestion system** anchored to text ranges, usable by people. The
   AI panel is a producer on top of it, not a parallel mechanism.

The editor ([`src/components/clubpm/blog/BlogEditor.jsx`](../../../src/components/clubpm/blog/BlogEditor.jsx))
is shared with the press kit editor ([`PressKitPanel.jsx`](../../../src/components/clubpm/PressKitPanel.jsx)),
so all of this lands in both surfaces.

## Decisions taken

| Question | Decision | Why |
|---|---|---|
| Scope | One spec, all three, phased plan | The AI panel's accept/reject UX is only possible on top of the suggestion layer |
| How humans suggest | **Explicit suggestions only** — no Google-Docs "Suggesting mode" | No mode confusion, no co-editor silently in the wrong mode, no `appendTransaction` rewriting every keystroke against Yjs and block nodes |
| Suggestion state | **Marks in the Y.Doc + threads in Postgres** | Anchors drift correctly under concurrent edits for free; bodies stay queryable and notifiable |
| AI edit format | **Quote-and-replace** (`{ find, replace, rationale }`) | Cheap in tokens, maps 1:1 onto suggestion marks, degrades to a "couldn't locate" card instead of corrupting the doc |
| Autocomplete trigger | **Manual (Ctrl+\\)**, plus a dedicated cheap-model rate-limit lane | No library reduces the real cost (the inference call); manual + own lane means zero background spend and no starving other features |
| Permissions | Any member may comment and suggest; only creator/co-author/admin may accept, reject, edit directly, or publish | Makes draft review actually useful without loosening write access |
| Press-kit parity | **Works by accident.** The thread table carries a `pressKitId` FK and the API accepts `docType=PRESS_KIT` (cheap now, avoids a later migration), but there is no dedicated parity phase or test pass | The editor is shared, so it should work; verifying it is not worth a phase |

### Rejected: paid dependencies

TipTap sells official Comments and AI Suggestion extensions, but they are TipTap Pro
(paid, cloud-tied). Community ghost-text extensions proxy to your own LLM, so they save
UI work rather than quota, and the ghost-text UI is a ~100-line ProseMirror decoration
plugin. Browser-local models (`transformers.js`, WebLLM) are free per call but need a
300 MB–1 GB download and WebGPU, and produce noticeably worse prose. Everything here is
built on plain ProseMirror marks with no new runtime dependency —
`@tiptap/react/menus` (BubbleMenu) already ships in the installed `@tiptap/react@3.27`.

## Architecture

```
┌─ Selection bubble ──┐   ┌─ AI panel ─────────┐   ┌─ Autocomplete ──┐
│ Comment │ Suggest   │   │ Ask │ Selection    │   │ Ctrl+\ → ghost  │
│         │ Ask AI    │   │     │ Whole post   │   │ Tab accepts     │
└────┬─────────┬──────┘   └──────────┬─────────┘   └────────┬────────┘
     │         │                     │                      │
     │         └─── quote-and-replace edits ─────┐           │
     ▼                                           ▼           ▼
┌──────────────────────────────────────────────────┐  (direct insert —
│  SUGGESTION LAYER                                 │   autocomplete is
│  marks in Y.Doc  +  threads in Postgres           │   your own writing,
│  commentMark / suggestInsert / suggestDelete      │   not a suggestion)
└──────────────────────────────────────────────────┘
```

Autocomplete deliberately bypasses the suggestion layer: accepting a completion with Tab
*is* the review step. Everything the AI panel proposes goes through the layer, so it is
always reviewable and always visible to co-editors.

## Data model

Two tables, three enums, in `backend/prisma/schema.prisma`. A thread belongs to either a
blog post or a press kit; exactly one FK is set, enforced in `blogThreadService`.

```prisma
enum BlogThreadKind   { COMMENT SUGGESTION }
enum BlogThreadStatus { OPEN RESOLVED ACCEPTED REJECTED }
enum BlogThreadOrigin { HUMAN AI }

model BlogThread {
  id           String   @id @default(cuid())
  postId       String?
  post         BlogPost?        @relation(fields: [postId], references: [id], onDelete: Cascade)
  pressKitId   String?
  pressKit     ProjectPressKit? @relation(fields: [pressKitId], references: [id], onDelete: Cascade)
  kind         BlogThreadKind
  status       BlogThreadStatus @default(OPEN)
  origin       BlogThreadOrigin @default(HUMAN)
  anchorText   String           // snapshot of the quoted text
  replaceWith  String?          // SUGGESTION only: the proposal, denormalised for display
  rationale    String?          // AI's stated reason, shown on the card
  createdById  String
  createdBy    Member   @relation("BlogThreadCreator", fields: [createdById], references: [id])
  resolvedById String?
  resolvedAt   DateTime?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
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

`anchorText` and `replaceWith` duplicate what the marks already encode in the document.
This is deliberate: if someone deletes the marked range outright the thread orphans, and
the snapshot lets the panel still render *"this referred to '…we did testing…'"* rather
than a blank card.

## Editor layer — marks

New file `src/components/clubpm/blog/suggestionMarks.js`. Three marks, all with
`excludes: ''` so overlapping threads are permitted:

| Mark | Attrs | Rendered class | Visual |
|---|---|---|---|
| `commentMark` | `threadId` | `cpm-blog-comment-mark` | amber underline (`--pm-accent-amber`) |
| `suggestInsert` | `threadId` | `cpm-blog-sugg-ins` | teal, underlined (`--pm-accent-teal`) |
| `suggestDelete` | `threadId` | `cpm-blog-sugg-del` | coral, strikethrough (`--pm-accent-coral`) |

Commands: `setCommentThread(threadId)`, `applySuggestion({ threadId, replace })`,
`acceptSuggestion(threadId)`, `rejectSuggestion(threadId)`,
`removeCommentThread(threadId)`.

Plus a small ProseMirror plugin maintaining a `threadId → { from, to }` index in
`editor.storage.blogThreads`, so the panel can scroll to a thread and highlight the
active one.

**A suggestion uses both suggestion marks at once.** The original text keeps
`suggestDelete`; the proposal is inserted adjacent to it carrying `suggestInsert`. Accept
removes the struck text and unwraps the insert. Reject does the inverse. Each is a single
ProseMirror transaction, so Yjs syncs it atomically to co-editors.

### Three files must stay in lockstep

This is the highest-risk part of the design, because every failure mode is silent:

1. `blogExtensions()` in `BlogEditor.jsx` — the client schema.
2. `backend/src/collab/blogSchema.ts` — the collab server's schema mirror. A mark missing
   here means `@hocuspocus/transformer` cannot convert the shared Y.Doc, which breaks the
   derived `contentJson` snapshot.
3. `backend/src/services/blogRender.ts` — must **strip** all three marks at publish:
   keep `suggestInsert` text, drop `suggestDelete` text, drop `commentMark` entirely,
   emit no `data-thread-id`. A half-reviewed draft must never leak review artifacts to
   the public site.

The existing `backend/src/services/blogSchemaContract.test.ts` is extended to fail if any
of the three drifts out of sync.

## Components

| File | Est. lines | Purpose |
|---|---|---|
| `blog/suggestionMarks.js` | ~200 | marks, commands, thread-position plugin |
| `blog/BlogSelectionBubble.jsx` | ~130 | BubbleMenu on non-empty selection: Comment / Suggest edit / Ask AI (the last hidden for non-authors — see the permission table) |
| `blog/BlogThreadList.jsx` | ~180 | filterable thread list (Open / Suggestions / Resolved) |
| `blog/BlogThreadCard.jsx` | ~200 | one thread: anchor quote, diff, replies, accept/reject |
| `blog/BlogAiPanel.jsx` | ~320 | Ask / Improve selection / Improve whole post |
| `blog/blogAutocomplete.js` | ~150 | ghost-text extension |
| `blog/aiQuoteMatch.js` | ~90 | locate a quote in the doc; pure, unit-tested |

`BlogAnnotationsPanel.jsx` gains the thread list above its existing post-level notes and
keeps its single header button. It becomes a composition of `AuthorsManager` +
`BlogThreadList` + `CommentThread` rather than growing inline.

`aiQuoteMatch.js` is the one piece with real failure modes, so it is isolated and pure.
Four tiers, in order: exact match → whitespace-normalised match → first-and-last-eight-words
anchor match → give up. It never guesses; an unlocatable edit renders as a dismissible
"couldn't find this text" card.

## Backend

Two new routers and two new services, rather than growing `blog.ts` (476 lines) past 800.
Both mounted in `app.ts`. All handlers read `req.memberId`, never `req.session.memberId`.

```
backend/src/api/blogThreads.ts        + services/blogThreadService.ts
GET    /api/blog/docs/:docType/:docId/threads
POST   /api/blog/docs/:docType/:docId/threads
PATCH  /api/blog/threads/:id                   { status }  accept | reject | resolve | reopen
POST   /api/blog/threads/:id/comments
PATCH  /api/blog/threads/:id/comments/:cid
DELETE /api/blog/threads/:id/comments/:cid

backend/src/api/blogAi.ts             + services/blogAiService.ts
POST   /api/blog/ai/ask               { docType, docId, question }                        → { answer }
POST   /api/blog/ai/edit              { docType, docId, scope, instruction, text }        → { edits: [] }
POST   /api/blog/ai/complete          { docType, docId, before, title }                   → { completion }
```

`docType` is `BLOG_POST | PRESS_KIT`.

### Permissions

`requirePostAccess` in `blog.ts` is an edit guard (creator / co-author / admin). Threads
need a second, looser **read-and-comment** guard alongside it:

| Action | Any member | Creator / co-author / admin |
|---|---|---|
| Read draft + threads | yes | yes |
| Create thread (comment or suggestion) | yes | yes |
| Reply to a thread | yes | yes |
| Edit / delete **own** comment | yes | yes |
| Delete **another member's** comment | no | yes |
| `PATCH` status to `ACCEPTED` / `REJECTED` | no | yes |
| Resolve a thread | own threads only | any |
| Use the AI panel, incl. the bubble's "Ask AI", edit body, publish | no | yes |

Restricting all AI entry points to authors also bounds Gemini spend to the handful of
people who own each post, rather than the whole club.

### Model routing

- `/ask` and whole-post `/edit` → `generateTextComplex` / `generateJsonComplex`
  (25/day, already auto-falls back to the standard model when exhausted).
- Selection-scoped `/edit` → `generateJson` (the shared 30 RPM lane).
- `/complete` → a **new third lane** in `geminiService.ts`: `generateTextFast()` with its
  own `fastRequestLog` and a `GEMINI_FAST_MODEL` env var, defaulting to
  `process.env.GEMINI_MODEL` when unset so nothing breaks without configuration.

The third lane matters because `rateLimitedCall` uses a single module-level `requestLog`
array shared by *every* standard-model caller
([`geminiService.ts:20-27`](../../../backend/src/services/geminiService.ts#L20-L27)).
Without its own lane, someone leaning on Ctrl+\\ would starve task enrichment and the
cron-driven AI reports.

Prompts build from a plain-text flattening of the document plus `todayContext()`. `/ask`
uses the **post** as context, not `buildProjectContext` — different problem, different
snapshot.

## Interaction flow — AI whole-post edit

```
1. Author types a goal: "tighten this and fix passive voice"
2. POST /api/blog/ai/edit  { scope: 'document', instruction }
3. Gemini returns [{ find, replace, rationale }, …]
4. Client runs aiQuoteMatch per edit → located | unlocatable
5. Panel renders one card per edit (the ActionPlanReview idiom):
      "we did testing"  →  "the team completed thermal vacuum testing"
      why: vague → specific        [ Suggest ]  [ Dismiss ]
   Plus [ Suggest all located ]
6. "Suggest" → POST thread (origin: AI) + applySuggestion marks in one transaction
7. The suggestion now appears in the document and in the thread list for ALL
   co-editors, accepted or rejected exactly like a human suggestion
```

The AI never writes to the document. It only creates suggestions, which is what makes
step 7 safe while several people are editing.

## Error handling

| Case | Behaviour |
|---|---|
| Gemini unavailable or rate-limited | Toast; panel stays open with the instruction intact; nothing written |
| Malformed AI JSON | `generateJson` already returns `null`; surfaced as "AI returned an unusable response, try rephrasing" |
| Orphaned thread (anchor deleted) | Card renders from its `anchorText` snapshot with an "anchor removed" badge; accept disabled, resolve still works |
| Accept/reject race between co-editors | Thread `PATCH` is idempotent on terminal status; the second caller gets current state back and the UI reconciles |
| Collab WS down | Threads still load over REST and marks apply to the local doc; the existing `contentJson` autosave fallback persists them |
| Autocomplete request in flight when the user keeps typing | Request is abandoned client-side; ghost text only renders if the caret has not moved |

## Testing

- `aiQuoteMatch.test.js` — all four matching tiers plus the give-up case.
- `blogSchemaContract.test.ts` — extended to fail if any of the three marks is missing
  from the client schema, the collab schema, or the renderer.
- `blogRender.test.ts` — publishing a document containing all three marks yields clean
  HTML: insert text kept, delete text dropped, no `data-thread-id` anywhere.
- `blogThreadService` — the permission matrix above, in particular that a non-author can
  comment but cannot accept.

## Phasing

Sized against the CLAUDE.md rule of ≤50 tool calls and ≤4 files per phase, with the
Prisma migration deliberately separated from frontend work.

| Phase | Scope |
|---|---|
| 1a | Prisma migration + `blogThreadService.ts` + `blogThreads.ts` + `app.ts` mount |
| 1b | `suggestionMarks.js` + `blogSchema.ts` + `blogRender.ts` strip + contract/render tests |
| 2 | `BlogSelectionBubble` + `BlogThreadList` + `BlogThreadCard` + panel wiring + mark/bubble/card CSS in `clubpm-theme.css` |
| 3 | `geminiService` fast lane + `blogAiService.ts` + `blogAi.ts` |
| 4 | `BlogAiPanel` + `aiQuoteMatch.js` + AI panel CSS + tests |
| 5 | `blogAutocomplete.js` + shortcut registration in the shortcuts modal |
| 6 | Author notifications on new comment/suggestion (in-app `createNotification` + Slack `queueDm`) |

Phases 1a–2 ship a complete, useful human review system with zero AI, and stand on their
own if work stops there.

All new CSS goes in `public/clubpm-theme.css`, never `search-theme.css` — the marks are
stripped at publish, so none of these classes can ever reach a public page.

After each phase: `npm run build` at the repo root and `npx tsc --noEmit` in `backend/`.
