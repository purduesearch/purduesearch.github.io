# Collaborative editing upgrade — access control, comment rail, presence

**Date:** 2026-08-05
**Status:** Approved, ready for implementation

## Goal

Bring the Constellation document editor closer to Google Docs on the axes that matter for
real co-authoring:

1. A **per-document access model** — default none, three levels (view / comment / edit),
   managed by the owner or anyone with edit access.
2. **Comments in a right-hand rail**, positioned against their anchor in the text, and
   anchored by CRDT-relative positions rather than marks stored in the document.
3. **Visible presence** — collaborator avatars, styled remote carets with name labels,
   remote selections, and click-to-follow.
4. Four missing Docs features: **suggesting mode**, **@-mentions in comments**,
   **follow a collaborator**, **named versions**.

This governs the *editor* only. Published posts at `/blog/:slug` serve `renderedHtml` and
are unaffected.

## Prerequisite

Realtime collaboration must actually work. `@hocuspocus/server` v4's `handleConnection()`
attaches no socket listeners; the integration must pump `handleMessage` / `handleClose`.
Fixed in `backend/src/collab/collabUpgrade.ts`, covered by `collabUpgrade.test.ts`. Every
feature below assumes a working Yjs session.

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Scope | One combined spec, phased plan | User preference; phases stay independently shippable |
| Sharing model | Per-member grants + one club-wide tier | "Let the club read this draft" shouldn't need 40 grants |
| Doc types | All three (blog post, press kit, course section) | One editor, one thread system, one collab server |
| Polymorphism | Three nullable FKs, like `BlogThread` | Matches existing convention; cascade delete kills orphans |
| Comment anchoring | Yjs relative positions (`Bytes`) | Comments are metadata, not content — they must not enter `contentJson` |
| Suggestion anchoring | Stays as marks | Suggestions *are* proposed content; they belong in the CRDT |
| Read-only enforcement | `connectionConfig.readOnly` in `onAuthenticate` | Server-side at the CRDT layer; a hostile client can't skip it |
| Admins | Implicit `OWNER` | Consistent with every other ClubPM surface |

## Access model

### Schema

```prisma
enum DocAccessLevel { VIEW COMMENT EDIT OWNER }

model DocAccessGrant {
  id              String @id @default(cuid())
  postId          String?
  post            BlogPost?        @relation(fields: [postId],          references: [id], onDelete: Cascade)
  pressKitId      String?
  pressKit        ProjectPressKit? @relation(fields: [pressKitId],      references: [id], onDelete: Cascade)
  courseSectionId String?
  courseSection   CourseSection?   @relation(fields: [courseSectionId], references: [id], onDelete: Cascade)

  memberId    String
  member      Member @relation("DocAccessMember",  fields: [memberId],    references: [id], onDelete: Cascade)
  level       DocAccessLevel
  grantedById String
  grantedBy   Member @relation("DocAccessGranter", fields: [grantedById], references: [id])
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@unique([postId, memberId])
  @@unique([pressKitId, memberId])
  @@unique([courseSectionId, memberId])
  @@index([memberId])
}

model DocShareSettings {
  id              String  @id @default(cuid())
  postId          String? @unique
  pressKitId      String? @unique
  courseSectionId String? @unique
  // …same three relations, all onDelete: Cascade
  clubLevel DocAccessLevel   // VIEW | COMMENT | EDIT — never OWNER
  setById   String
  setBy     Member  @relation("DocShareSetter", fields: [setById], references: [id])
  updatedAt DateTime @updatedAt
}
```

An absent `DocShareSettings` row means the club tier is off. `OWNER` is rejected by the
resolver as a club level, so "the whole club owns this" is unrepresentable rather than
merely discouraged.

**Exactly one of the three FK columns must be set** on both models. Prisma cannot express
this, and the polymorphic `BlogThread` it copies has the same gap. Both write paths
therefore go through a single constructor helper in `docAccessService.ts` that takes a
`DocRef` and expands it to the one column — no handler builds the `where`/`data` object by
hand. A CHECK constraint (`num_nonnulls(postId, pressKitId, courseSectionId) = 1`) is added
in the same migration as a backstop.

### Resolution

`backend/src/services/docAccessService.ts`:

```ts
type DocRef = { postId: string } | { pressKitId: string } | { courseSectionId: string };
resolveDocAccess(memberId: string, ref: DocRef): Promise<DocAccessLevel | null>
```

Effective level is the **maximum** over four independent sources, ranked
`VIEW(1) < COMMENT(2) < EDIT(3) < OWNER(4)`:

| Source | Yields |
|---|---|
| `Member.isAdmin` | `OWNER` |
| Inherited — `BLOG_POST` | creator (`BlogPost.createdById`) → `OWNER` |
| Inherited — `PRESS_KIT` | `ProjectMember` of the owning project → `EDIT` |
| Inherited — `COURSE_SECTION` | `Course.createdById` → `OWNER` |
| `DocAccessGrant` for this member | the stored level |
| `DocShareSettings.clubLevel` | the stored level |

`null` means no access at all.

The inherited row is what makes default-none safe. It preserves exactly today's
reachability for press kits and course sections, so the migration cannot strip a project
member of their press kit. For blog posts it grants nothing beyond the creator — the
default-none behavior requested.

**Who may change access:** `OWNER` or `EDIT` (and therefore admins). `EDIT` holders may
not grant `OWNER`; only an existing `OWNER` or an admin can.

### Enforcement, in descending order of trust

1. **Collab handshake.** `onAuthenticate` in all three of `blogCollab.ts`,
   `pressKitCollab.ts`, `courseCollab.ts` resolves the level. `null` throws (closes with
   `Unauthorized`). Anything below `EDIT` sets `connectionConfig.readOnly = true`, which
   `MessageReceiver` honors by dropping inbound sync updates. This is the only enforcement
   a hostile client cannot bypass.
2. **REST.** A `requireDocAccess(level)` middleware replaces the ad-hoc
   `createdById !== req.memberId && !isAdmin` checks in `blog.ts`. Handlers read
   `req.memberId` per the project convention, never `req.session.memberId`.
3. **Frontend.** Gates UI affordances only. Treated as cosmetic.

This also resolves a live divergence: `blog.ts` currently allows *creator or admin only*
while `blogCollab.ts`'s `canAccessPost` also honors `BlogAuthor` rows. After this change
there is one resolver and one answer.

### Migration

- `BlogAuthor` rows → `DocAccessGrant` at `EDIT`.
- `BlogPost.createdById` → `DocAccessGrant` at `OWNER`.
- `BlogAuthor` **remains** as the byline concept its name describes, no longer overloaded
  as an ACL. Its unused freeform `role String?` is dropped.

**This is a breaking access change for existing blog posts.** Anyone who could previously
reach a draft only because they were an admin or a `BlogAuthor` keeps access; anyone who
reached it another way does not.

## Comment anchoring

### Why not marks

`commentMark` lives in the TipTap document, so comment state travels into `contentJson`,
into revision diffs, into markdown export, and has to be explicitly stripped by
`blogRender.ts` at publish. Comments are metadata *about* content, not content.

There is also a permission consequence: creating a comment is currently a document write,
so a `COMMENT`-level user on a `readOnly` connection could not comment at all. Validating
"this CRDT delta only added a mark" server-side is not practical against opaque Yjs
updates.

Relative positions solve both. Creating a comment becomes a pure REST write plus a local
decoration — **zero Yjs writes**.

### Mechanism

`BlogThread` gains `anchorStart Bytes?` and `anchorEnd Bytes?`.

Creation (client):

```js
const { binding } = ySyncPluginKey.getState(editor.state);
const rel = absolutePositionToRelativePosition(from, binding.type, binding.mapping);
const bytes = Y.encodeRelativePosition(rel);   // → base64 over JSON → Bytes
```

Resolution — a new `ThreadDecorations` TipTap extension:

- `relativePositionToAbsolutePosition(ydoc, fragment, relPos, mapping)` per endpoint.
- Both resolve and `start < end` → `Decoration.inline(start, end, { class, data-thread-id })`.
- Either returns `null` → the anchored text is gone. The thread is **orphaned**: no
  decoration, and the rail lists it under "No longer in the document" with its stored
  `anchorText` quote.
- Performance: full recompute only on Yjs sync or a change to the thread set. Between
  those, `DecorationSet.map(tr.mapping, doc)` carries decorations through keystrokes.

`anchorText` is retained but demoted to **display-only** — the quote on an orphaned card.
It is never used to locate anything.

Both helpers come from `@tiptap/y-tiptap`, the same package `@tiptap/extension-collaboration`
peers on, so there is a single `ySyncPluginKey` and none of the plugin-key mismatch trouble
documented for `extension-collaboration-caret`.

### Suggestions stay as marks

`suggestInsert` / `suggestDelete` represent *proposed text*. They are content: they must
live in the CRDT so concurrent edits merge correctly and `blogRender.ts` can decide what to
publish. Only comments move to relative positions.

### Migrating existing comments off marks

Server-side backfill would require rebuilding a ProseMirror binding for every stored Y.Doc
just to translate mark ranges into Yjs indices. Instead, **lazy and client-side**: when a
user with `EDIT` opens a document still containing `commentMark`s, a one-shot effect
converts each range found by the existing `findMarkRanges()` into relative positions,
PATCHes them, then strips the marks in a single transaction. Migrated state is
`anchorStart != null`.

Consequences, accepted:

- A document only ever opened by commenters never migrates, so `commentMark` **rendering
  stays as a fallback path** until every document has converted.
- The `commentMark` node stays in the schema so legacy documents keep parsing, but stops
  being created. Removing it is separate cleanup after a soak, not part of this work.

## Presence, cursors, rail

### Caret CSS (currently absent entirely)

`CollaborationCaret` already emits the DOM; `public/clubpm-theme.css` has no rules for any
of its classes, which is why cursors are invisible today. Appended to the ClubPM
stylesheet — no public route renders an editor.

- `.collaboration-carets__caret` — 2px bar in the peer's color, `position: relative` so the
  label can anchor to it.
- `.collaboration-carets__label` — name chip above the caret. Visible ~2.5s after that peer
  moves, then fades; returns on hover. Permanent labels are unreadable with three people in
  one paragraph.
- `.collaboration-carets__selection` — translucent tint of the same color.

### Presence avatars

`collabUser` gains `avatarUrl`, so awareness carries `{ id, name, color, avatarUrl }`.
`PresenceBar` renders an `<img>` with the existing initial-letter circle as fallback;
overlapping stack with a `+N` overflow chip.

The existing synced-vs-merely-connected dot logic is unchanged. It exists to avoid claiming
a live session that is not syncing — exactly the failure mode of the Hocuspocus bug above.

### Follow a collaborator

Click a presence avatar to follow. On each awareness update from that peer, resolve their
cursor with `editor.view.coordsAtPos()` and smooth-scroll to center it. The followed avatar
gets a ring, plus a "Following <name> — Esc to stop" chip. Unfollows on Esc, a second
click, manual scroll, or that peer disconnecting.

### The rail

`.cpm-blog-editor-body` becomes a two-column grid: canvas (existing max-width, unchanged)
plus a ~300px right gutter.

Card positions come from the `ThreadDecorations` plugin rather than DOM queries — it holds
each thread's absolute ProseMirror positions, so `coordsAtPos(start)` converted to
canvas-relative coordinates gives an ideal `top` per card. Then the collision pass: sort by
ideal top, walk down, `top = max(idealTop, prevBottom + gap)`. The focused thread snaps to
its true anchor and pushes neighbors away rather than being pushed.

Recompute on doc change (rAF-debounced), resize, thread-set change, and focus change.
Scrolling needs no recompute — the rail scrolls with the canvas.

Below the layout breakpoint the rail collapses into the **existing**
`BlogAnnotationsPanel` overlay rather than a second implementation, so narrow screens keep
today's behavior.

## The four Docs features

### Suggesting mode

A three-way Editing / Suggesting / Viewing control, seeded from the resolved permission:

| Level | Default mode | May switch to | Can comment |
|---|---|---|---|
| `VIEW` | Viewing | — | no |
| `COMMENT` | Viewing | — | yes |
| `EDIT` / `OWNER` | Editing | Editing, Suggesting, Viewing | yes |

This mirrors Google exactly: the mode control has three positions, and commenting is an
orthogonal capability available *within* Viewing mode to anyone holding it — not a fourth
mode. A `COMMENT` user therefore sits in Viewing with the comment affordances live.

In Suggesting mode a ProseMirror `appendTransaction` rewrites plain typing into
`suggestInsert` / `suggestDelete` marks against the existing plumbing, with accept/reject
per change in the rail.

**Limitation, stated deliberately:** suggestions are marks, therefore document writes,
therefore dropped on a `readOnly` connection. So `COMMENT` grants **comments only, not
suggestions**; suggesting requires `EDIT`. Google conflates the two; we cannot, without
giving commenters CRDT write access and losing the server-enforced guarantee.

### @-mentions in comments

Reuses the mention parser in `tasks.ts` → in-app notification plus Slack DM via
`queueDm()`. If the mentioned member has no grant, an author holding `EDIT`/`OWNER` is
offered a one-click grant defaulting to `COMMENT`.

### Named versions

`BlogRevision` gains `name String?`. `RevisionHistoryDrawer` gets rename-in-place and a
named-only filter. Restore already exists.

### Follow a collaborator

Covered under Presence above.

## Testing

| Area | Test |
|---|---|
| Permission resolver | Table-driven over {admin, inherited, grant, club tier} × doc type, asserting the max. Pure logic over four inputs — cheap, and catches the whole class. |
| Read-only enforcement | Extend the `collabUpgrade.test.ts` harness (real server, real socket): a `VIEW`/`COMMENT` connection's Yjs update must not alter the document. |
| Relative positions | Round-trip an encoded position back to the same index; assert `null` after the anchored text is deleted. |
| Rail layout | Collision pass is pure geometry — unit test ideal-tops in, non-overlapping tops out, focused card at its true anchor. |
| REST enforcement | Each `blog.ts` route rejects below its required level. |

Backend tests follow the existing convention: standalone `tsx`-runnable files with a manual
`check()` helper (`npx tsx src/…/x.test.ts`).

## Phasing

Respecting CLAUDE.md's ≤4 files per phase and no-migration-plus-frontend-in-one-phase rules.
`npm run build` (root) and `npx tsc --noEmit` (backend) after each.

| # | Phase | Surface |
|---|---|---|
| 1 | Schema + migration + `docAccessService` + resolver tests | backend |
| 2 | REST enforcement — `requireDocAccess` across `blog.ts` | backend |
| 3 | Collab enforcement — levels + `readOnly`, all three namespaces | backend |
| 4 | Sharing UI — share dialog, member picker, club-tier control | frontend |
| 5 | Anchoring — schema columns, `ThreadDecorations`, lazy mark migration | both |
| 6 | The rail — grid layout, positioning, collision pass | frontend |
| 7 | Presence avatars, caret CSS, follow | frontend |
| 8 | Suggesting mode | frontend |
| 9 | @-mentions, named versions | both |

Phases 1–3 are the security-relevant core and are independently shippable. Phases 5–6
depend on phase 1 only through UI gating.

## Out of scope

- Secret-link sharing to logged-out visitors (considered, rejected — the only option that
  creates an unauthenticated read path into drafts).
- Removing `commentMark` from the schema (needs a soak after lazy migration).
- Changing anything about the published `/blog/:slug` page.
- Suggestions for `COMMENT`-level users (see limitation above).
