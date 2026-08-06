# Collaborative Editing Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-document access control (view/comment/edit, default none), a Google-Docs-style comment rail anchored by Yjs relative positions, visible collaborator presence, and four missing Docs features to the Constellation editor.

**Architecture:** A single `resolveDocAccess()` resolver returns the max of four independent access sources and is enforced in three places — the Hocuspocus handshake (authoritative, via `connectionConfig.readOnly`), the REST layer, and the UI (cosmetic). Comment anchors move out of the TipTap document into Postgres as encoded Yjs relative positions, rendered as ProseMirror decorations, so commenting requires no CRDT write.

**Tech Stack:** Prisma + PostgreSQL, Express, `@hocuspocus/server` 4.3.0, Yjs 13.6.31, `@tiptap/y-tiptap`, React 19, TipTap 3.

**Spec:** `docs/superpowers/specs/2026-08-05-collaborative-editing-upgrade-design.md`

## Global Constraints

- Handlers read `req.memberId`, **never** `req.session.memberId` — session reads are `undefined` for Bearer-token users. Only `auth.ts` may touch `req.session`.
- Backend tests are standalone `tsx`-runnable files with a manual `check()` helper, run as `npx tsx src/path/x.test.ts`. No test framework, **no database access in tests**.
- After every task: `npx tsc --noEmit` in `backend/`, and `npm run build` at the repo root for any task touching `src/`.
- New ClubPM CSS is appended to `public/clubpm-theme.css`, never `search-theme.css`. No editor renders on a public route.
- After a Prisma schema edit, run `npx prisma generate` before trusting `tsc` — a stale client produces phantom type errors.
- Component files are `.jsx`, PascalCase, hooks only. Icons are Font Awesome `<i className="fas fa-…" aria-hidden="true" />`, never emoji.
- `OWNER` is never a valid club-wide tier. `EDIT` holders may grant up to `EDIT`; only `OWNER`/admin may grant `OWNER`.
- Suggestions stay as marks. Only **comment** anchors move to relative positions.

## File Structure

| File | Responsibility |
|---|---|
| `backend/src/services/docAccessService.ts` | `DocRef` type, pure `combineAccess()`, DB-backed `resolveDocAccess()`, grant/share mutations |
| `backend/src/services/docAccessService.test.ts` | Table-driven tests for the pure combination logic |
| `backend/src/api/docAccess.ts` | REST routes for listing/changing grants and the club tier |
| `backend/src/collab/collabAuth.ts` | Shared `authenticateCollab()` used by all three collab namespaces |
| `src/components/clubpm/blog/ThreadDecorations.js` | TipTap extension resolving relative positions → decorations |
| `src/components/clubpm/blog/threadAnchors.js` | Pure encode/decode + orphan logic for anchors |
| `src/components/clubpm/blog/BlogCommentRail.jsx` | The right-gutter rail |
| `src/components/clubpm/blog/railLayout.js` | Pure collision-avoidance geometry |
| `src/components/clubpm/blog/railLayout.test.js` | Unit tests for the geometry |
| `src/components/clubpm/ShareDialog.jsx` | Share/permissions UI |

---

# Arc A — Access control (Tasks 1–6)

Independently shippable. At the end of Arc A, documents have enforced permissions but the editor UI is otherwise unchanged.

### Task 1: Access level schema

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/<timestamp>_doc_access/migration.sql`

**Interfaces:**
- Produces: Prisma models `DocAccessGrant`, `DocShareSettings`; enum `DocAccessLevel`.

- [ ] **Step 1: Add the enum and models to `schema.prisma`**

```prisma
enum DocAccessLevel {
  VIEW
  COMMENT
  EDIT
  OWNER
}

model DocAccessGrant {
  id              String           @id @default(cuid())
  postId          String?
  post            BlogPost?        @relation(fields: [postId], references: [id], onDelete: Cascade)
  pressKitId      String?
  pressKit        ProjectPressKit? @relation(fields: [pressKitId], references: [id], onDelete: Cascade)
  courseSectionId String?
  courseSection   CourseSection?   @relation(fields: [courseSectionId], references: [id], onDelete: Cascade)

  memberId    String
  member      Member         @relation("DocAccessMember", fields: [memberId], references: [id], onDelete: Cascade)
  level       DocAccessLevel
  grantedById String
  grantedBy   Member         @relation("DocAccessGranter", fields: [grantedById], references: [id])
  createdAt   DateTime       @default(now())
  updatedAt   DateTime       @updatedAt

  @@unique([postId, memberId])
  @@unique([pressKitId, memberId])
  @@unique([courseSectionId, memberId])
  @@index([memberId])
}

model DocShareSettings {
  id              String           @id @default(cuid())
  postId          String?          @unique
  post            BlogPost?        @relation(fields: [postId], references: [id], onDelete: Cascade)
  pressKitId      String?          @unique
  pressKit        ProjectPressKit? @relation(fields: [pressKitId], references: [id], onDelete: Cascade)
  courseSectionId String?          @unique
  courseSection   CourseSection?   @relation(fields: [courseSectionId], references: [id], onDelete: Cascade)

  clubLevel DocAccessLevel
  setById   String
  setBy     Member         @relation("DocShareSetter", fields: [setById], references: [id])
  updatedAt DateTime       @updatedAt
}
```

- [ ] **Step 2: Add the back-relations**

On `Member`, add:
```prisma
  docAccessGrants   DocAccessGrant[]   @relation("DocAccessMember")
  docAccessGranted  DocAccessGrant[]   @relation("DocAccessGranter")
  docShareSet       DocShareSettings[] @relation("DocShareSetter")
```

On `BlogPost`, `ProjectPressKit`, and `CourseSection`, add:
```prisma
  docAccessGrants  DocAccessGrant[]
  docShareSettings DocShareSettings?
```

- [ ] **Step 3: Generate the migration**

Run: `cd backend && npx prisma migrate dev --name doc_access --create-only`
Expected: a new folder under `prisma/migrations/` containing `migration.sql`.

- [ ] **Step 4: Append the CHECK constraints and the backfill to `migration.sql`**

Prisma cannot express "exactly one FK set", so add it by hand at the end of the generated file:

```sql
ALTER TABLE "DocAccessGrant" ADD CONSTRAINT "DocAccessGrant_one_target"
  CHECK (num_nonnulls("postId", "pressKitId", "courseSectionId") = 1);
ALTER TABLE "DocShareSettings" ADD CONSTRAINT "DocShareSettings_one_target"
  CHECK (num_nonnulls("postId", "pressKitId", "courseSectionId") = 1);

-- Backfill: post creators become OWNER.
INSERT INTO "DocAccessGrant" ("id", "postId", "memberId", "level", "grantedById", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, p."id", p."createdById", 'OWNER', p."createdById", NOW(), NOW()
FROM "BlogPost" p
ON CONFLICT DO NOTHING;

-- Backfill: existing BlogAuthor rows become EDIT (creator row above wins on conflict).
INSERT INTO "DocAccessGrant" ("id", "postId", "memberId", "level", "grantedById", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, a."postId", a."memberId", 'EDIT', p."createdById", NOW(), NOW()
FROM "BlogAuthor" a
JOIN "BlogPost" p ON p."id" = a."postId"
ON CONFLICT DO NOTHING;
```

- [ ] **Step 5: Apply the migration and regenerate the client**

Run: `cd backend && npx prisma migrate dev && npx prisma generate`
Expected: migration applies cleanly; `DocAccessLevel` is importable from `@prisma/client`.

- [ ] **Step 6: Typecheck and commit**

```bash
cd backend && npx tsc --noEmit
git add backend/prisma
git commit -m "feat(access): DocAccessGrant + DocShareSettings schema and backfill"
```

---

### Task 2: The pure access-combination logic

The combination rule is pure logic over four inputs. Isolating it here is what lets it be tested exhaustively with no database, per the Global Constraints.

**Files:**
- Create: `backend/src/services/docAccessService.ts`
- Test: `backend/src/services/docAccessService.test.ts`

**Interfaces:**
- Produces:
  - `type DocRef = { postId: string } | { pressKitId: string } | { courseSectionId: string }`
  - `combineAccess(inputs: AccessInputs): DocAccessLevel | null`
  - `atLeast(level: DocAccessLevel | null, required: DocAccessLevel): boolean`
  - `maxLevel(a, b): DocAccessLevel | null`
  - `docRefToWhere(ref: DocRef): { postId: string } | { pressKitId: string } | { courseSectionId: string }`

- [ ] **Step 1: Write the failing test**

Create `backend/src/services/docAccessService.test.ts`:

```ts
// Table-driven tests for access combination. Pure logic, no database — the
// resolver's DB reads are a thin shell around combineAccess().
// Run: cd backend && npx tsx src/services/docAccessService.test.ts
import { combineAccess, atLeast, maxLevel } from "./docAccessService.js";

let passed = 0, failed = 0;
const check = (n: string, c: boolean) => {
  if (c) { passed++; } else { failed++; console.error(`  ✗ ${n}`); }
};

const none = { isAdmin: false, inherited: null, grant: null, club: null };

check("no sources at all -> null", combineAccess(none) === null);
check("admin always wins with OWNER",
  combineAccess({ ...none, isAdmin: true }) === "OWNER");
check("admin outranks a lower explicit grant",
  combineAccess({ ...none, isAdmin: true, grant: "VIEW" }) === "OWNER");
check("a lone grant is used as-is",
  combineAccess({ ...none, grant: "COMMENT" }) === "COMMENT");
check("club tier alone is used as-is",
  combineAccess({ ...none, club: "VIEW" }) === "VIEW");
check("grant beats a weaker club tier",
  combineAccess({ ...none, grant: "EDIT", club: "VIEW" }) === "EDIT");
check("club tier beats a weaker grant",
  combineAccess({ ...none, grant: "VIEW", club: "EDIT" }) === "EDIT");
check("inherited beats a weaker grant",
  combineAccess({ ...none, inherited: "OWNER", grant: "VIEW" }) === "OWNER");
check("inherited combines with club tier by max",
  combineAccess({ ...none, inherited: "EDIT", club: "COMMENT" }) === "EDIT");

check("atLeast: EDIT satisfies COMMENT", atLeast("EDIT", "COMMENT") === true);
check("atLeast: COMMENT does not satisfy EDIT", atLeast("COMMENT", "EDIT") === false);
check("atLeast: null satisfies nothing", atLeast(null, "VIEW") === false);
check("atLeast: exact match passes", atLeast("VIEW", "VIEW") === true);

check("maxLevel handles nulls on either side",
  maxLevel(null, "VIEW") === "VIEW" && maxLevel("VIEW", null) === "VIEW");
check("maxLevel of two nulls is null", maxLevel(null, null) === null);

console.log(`\ndocAccessService: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd backend && npx tsx src/services/docAccessService.test.ts`
Expected: FAIL — cannot find module `./docAccessService.js`.

- [ ] **Step 3: Write the implementation**

Create `backend/src/services/docAccessService.ts`:

```ts
import type { DocAccessLevel } from "@prisma/client";
import { prisma } from "../db/prisma.js";

/** Identifies one collaborative document. Exactly one key is set. */
export type DocRef =
  | { postId: string }
  | { pressKitId: string }
  | { courseSectionId: string };

const RANK: Record<DocAccessLevel, number> = {
  VIEW: 1, COMMENT: 2, EDIT: 3, OWNER: 4,
};

export function maxLevel(
  a: DocAccessLevel | null,
  b: DocAccessLevel | null,
): DocAccessLevel | null {
  if (!a) return b;
  if (!b) return a;
  return RANK[a] >= RANK[b] ? a : b;
}

export function atLeast(
  level: DocAccessLevel | null,
  required: DocAccessLevel,
): boolean {
  return !!level && RANK[level] >= RANK[required];
}

export interface AccessInputs {
  isAdmin: boolean;
  inherited: DocAccessLevel | null;
  grant: DocAccessLevel | null;
  club: DocAccessLevel | null;
}

/**
 * Effective access is the maximum over four independent sources. Admins are
 * modelled as an OWNER source rather than an early return so the rule stays a
 * single max and there is no ordering to get wrong.
 */
export function combineAccess(inputs: AccessInputs): DocAccessLevel | null {
  const admin: DocAccessLevel | null = inputs.isAdmin ? "OWNER" : null;
  return maxLevel(maxLevel(admin, inputs.inherited), maxLevel(inputs.grant, inputs.club));
}

/**
 * Expands a DocRef into the single FK column it targets. Every read and write
 * goes through this so no handler hand-builds a polymorphic where/data object
 * and trips the num_nonnulls CHECK constraint.
 */
export function docRefToWhere(ref: DocRef) {
  if ("postId" in ref) return { postId: ref.postId };
  if ("pressKitId" in ref) return { pressKitId: ref.pressKitId };
  return { courseSectionId: ref.courseSectionId };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && npx tsx src/services/docAccessService.test.ts`
Expected: `docAccessService: 15 passed, 0 failed`

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/docAccessService.ts backend/src/services/docAccessService.test.ts
git commit -m "feat(access): pure access-level combination logic with table tests"
```

---

### Task 3: The DB-backed resolver

**Files:**
- Modify: `backend/src/services/docAccessService.ts`

**Interfaces:**
- Consumes: `combineAccess`, `docRefToWhere`, `DocRef` from Task 2.
- Produces: `resolveDocAccess(memberId: string, ref: DocRef): Promise<DocAccessLevel | null>`

- [ ] **Step 1: Add the inherited-access lookup**

Append to `docAccessService.ts`:

```ts
/**
 * Access implied by owning/participating in the thing the document belongs to.
 * This is what preserves today's reachability: without it, "default none" would
 * strip every project member of their press kit on migration day.
 */
async function inheritedAccess(
  memberId: string,
  ref: DocRef,
): Promise<DocAccessLevel | null> {
  if ("postId" in ref) {
    const post = await prisma.blogPost.findUnique({
      where: { id: ref.postId }, select: { createdById: true },
    });
    return post?.createdById === memberId ? "OWNER" : null;
  }

  if ("pressKitId" in ref) {
    const kit = await prisma.projectPressKit.findUnique({
      where: { id: ref.pressKitId }, select: { projectId: true, createdById: true },
    });
    if (!kit) return null;
    if (kit.createdById === memberId) return "OWNER";
    const membership = await prisma.projectMember.findUnique({
      where: { projectId_memberId: { projectId: kit.projectId, memberId } },
      select: { memberId: true },
    });
    return membership ? "EDIT" : null;
  }

  const section = await prisma.courseSection.findUnique({
    where: { id: ref.courseSectionId },
    select: { course: { select: { createdById: true } } },
  });
  return section?.course.createdById === memberId ? "OWNER" : null;
}
```

- [ ] **Step 2: Add the resolver**

```ts
/**
 * Effective access level for this member on this document, or null for none.
 * The single source of truth — REST, the collab handshake, and the UI all call
 * this. Do not reimplement the rule anywhere else.
 */
export async function resolveDocAccess(
  memberId: string,
  ref: DocRef,
): Promise<DocAccessLevel | null> {
  const where = docRefToWhere(ref);

  const [me, inherited, grant, share] = await Promise.all([
    prisma.member.findUnique({ where: { id: memberId }, select: { isAdmin: true } }),
    inheritedAccess(memberId, ref),
    prisma.docAccessGrant.findFirst({
      where: { ...where, memberId }, select: { level: true },
    }),
    prisma.docShareSettings.findFirst({
      where, select: { clubLevel: true },
    }),
  ]);

  return combineAccess({
    isAdmin: !!me?.isAdmin,
    inherited,
    grant: grant?.level ?? null,
    // OWNER is not a representable club tier; clamp defensively in case a row
    // was written directly against the database.
    club: share?.clubLevel === "OWNER" ? "EDIT" : (share?.clubLevel ?? null),
  });
}
```

- [ ] **Step 3: Typecheck**

Run: `cd backend && npx tsc --noEmit`
Expected: exit 0. If `DocAccessGrant` is not found on `prisma`, run `npx prisma generate` first — a stale client reports phantom errors.

- [ ] **Step 4: Re-run the Task 2 tests to confirm no regression**

Run: `cd backend && npx tsx src/services/docAccessService.test.ts`
Expected: `15 passed, 0 failed`

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/docAccessService.ts
git commit -m "feat(access): DB-backed resolveDocAccess with inherited access"
```

---

### Task 4: REST enforcement in `blog.ts`

`blog.ts` already funnels post routes through one `requirePostAccess(req, res)` helper (`backend/src/api/blog.ts:30-50`), so this is a body swap plus a level argument — not middleware threaded through 28 routes. This also removes the live divergence where `blog.ts` and `blogCollab.ts` disagreed about whether a `BlogAuthor` row grants access.

**Files:**
- Modify: `backend/src/api/blog.ts:30-50` and its call sites

**Interfaces:**
- Consumes: `resolveDocAccess`, `atLeast` from Task 3.
- Produces: `requirePostAccess(req, res, required?: DocAccessLevel)` — same return contract as today (the post, or `null` after sending the response).

- [ ] **Step 1: Replace the helper body**

Replace `requirePostAccess` in `backend/src/api/blog.ts` with:

```ts
// Resolves the caller's access to the post named by :id, sending 404/403 and
// returning null when they may not proceed. `required` defaults to EDIT since
// most routes here mutate.
async function requirePostAccess(
  req: Request,
  res: Response,
  required: DocAccessLevel = "EDIT",
) {
  const post = await prisma.blogPost.findUnique({ where: { id: req.params.id as string } });
  if (!post) {
    res.status(404).json({ error: "Post not found" });
    return null;
  }
  const level = await resolveDocAccess(req.memberId!, { postId: post.id });
  if (!atLeast(level, required)) {
    // 404 rather than 403 when they have no access at all: revealing that a
    // draft exists is itself a leak.
    res.status(level ? 403 : 404).json({ error: level ? "Forbidden" : "Post not found" });
    return null;
  }
  return post;
}
```

- [ ] **Step 2: Add the imports**

At the top of `backend/src/api/blog.ts`:

```ts
import type { DocAccessLevel } from "@prisma/client";
import { resolveDocAccess, atLeast } from "../services/docAccessService.js";
```

- [ ] **Step 3: Set the required level on read-only routes**

These routes read rather than mutate, so they pass `"VIEW"`:

- `blogRouter.get("/posts/:id", …)` → `requirePostAccess(req, res, "VIEW")`
- `blogRouter.get("/posts/:id/revisions", …)` → `requirePostAccess(req, res, "VIEW")`
- `blogRouter.post("/posts/:id/preview", …)` → `requirePostAccess(req, res, "VIEW")`
- `blogRouter.get("/posts/:id/annotations", …)` → `requirePostAccess(req, res, "VIEW")`

And the comment-creating route passes `"COMMENT"`:

- `blogRouter.post("/posts/:id/annotations", …)` → `requirePostAccess(req, res, "COMMENT")`

Every other `requirePostAccess(req, res)` call keeps the `EDIT` default.

- [ ] **Step 4: Restrict the post list to accessible posts**

`blogRouter.get("/posts")` currently lists everything. Replace its `where` clause so a member sees only posts they can reach:

```ts
const me = await prisma.member.findUnique({
  where: { id: req.memberId! }, select: { isAdmin: true },
});
const visibility = me?.isAdmin ? {} : {
  OR: [
    { createdById: req.memberId! },
    { docAccessGrants: { some: { memberId: req.memberId! } } },
    { docShareSettings: { isNot: null } },
  ],
};
```

Merge `visibility` into the existing `where` alongside the current `createdById: mine === "1" ? req.memberId : undefined` filter.

- [ ] **Step 5: Typecheck and verify no stale `isAdmin`/`BlogAuthor` checks remain**

Run: `cd backend && npx tsc --noEmit`
Run: `grep -n "blogAuthor.findUnique" src/api/blog.ts`
Expected: tsc exit 0; the grep returns **no** hit inside `requirePostAccess` (the `/posts/:id/authors` routes legitimately still use `blogAuthor`).

- [ ] **Step 6: Retire `BlogAuthor.role`**

`BlogAuthor` is now purely the byline concept its name describes; its freeform
`role String?` was the half-built ACL that `DocAccessGrant` replaces, and
nothing reads it. Leaving it invites someone to re-implement permissions there.

Remove the field from `model BlogAuthor` in `backend/prisma/schema.prisma`, then:

Run: `cd backend && npx prisma migrate dev --name drop_blog_author_role && npx prisma generate`
Run: `grep -rn "role" src/api/blog.ts | grep -i author`
Expected: no hits. If `POST /posts/:id/authors` still accepts a `role` in its
body, drop it from the handler and from `addBlogAuthor` in
`src/api/clubPmClient.js`.

- [ ] **Step 7: Commit**

```bash
git add backend/src/api/blog.ts backend/prisma src/api/clubPmClient.js
git commit -m "feat(access): enforce resolved doc access across blog REST routes"
```

---

### Task 5: Collab handshake enforcement

**Files:**
- Create: `backend/src/collab/collabAuth.ts`
- Modify: `backend/src/collab/blogCollab.ts`, `pressKitCollab.ts`, `courseCollab.ts`
- Test: `backend/src/collab/collabAuth.test.ts`

**Interfaces:**
- Consumes: `resolveDocAccess`, `atLeast` from Task 3; `verifyBearerToken` from `../api/auth.js`.
- Produces: `authenticateCollab(token: string, ref: DocRef, connectionConfig: { readOnly: boolean }): Promise<{ memberId: string; level: DocAccessLevel }>` — throws on no access.

- [ ] **Step 1: Write the failing test**

Create `backend/src/collab/collabAuth.test.ts`:

```ts
// The readOnly decision is the security boundary for VIEW/COMMENT users, so it
// is tested as pure logic against the level. Run:
//   cd backend && npx tsx src/collab/collabAuth.test.ts
import { shouldBeReadOnly } from "./collabAuth.js";

let passed = 0, failed = 0;
const check = (n: string, c: boolean) => {
  if (c) { passed++; } else { failed++; console.error(`  ✗ ${n}`); }
};

check("VIEW is read-only",    shouldBeReadOnly("VIEW") === true);
check("COMMENT is read-only", shouldBeReadOnly("COMMENT") === true);
check("EDIT can write",       shouldBeReadOnly("EDIT") === false);
check("OWNER can write",      shouldBeReadOnly("OWNER") === false);

console.log(`\ncollabAuth: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd backend && npx tsx src/collab/collabAuth.test.ts`
Expected: FAIL — cannot find module `./collabAuth.js`.

- [ ] **Step 3: Write the implementation**

Create `backend/src/collab/collabAuth.ts`:

```ts
import type { DocAccessLevel } from "@prisma/client";
import { verifyBearerToken } from "../api/auth.js";
import { resolveDocAccess, atLeast, type DocRef } from "../services/docAccessService.js";

/**
 * Anything below EDIT rides a read-only connection. Hocuspocus honours this in
 * MessageReceiver by dropping inbound sync updates, which is the only
 * enforcement a hostile client cannot skip — the editor's `editable` flag is
 * cosmetic.
 */
export function shouldBeReadOnly(level: DocAccessLevel): boolean {
  return !atLeast(level, "EDIT");
}

/**
 * Shared onAuthenticate body for all three collab namespaces. Mutates
 * `connectionConfig.readOnly`, which Hocuspocus reads when it constructs the
 * Connection (see ClientConnection.createConnection).
 */
export async function authenticateCollab(
  token: string,
  ref: DocRef,
  connectionConfig: { readOnly: boolean },
): Promise<{ memberId: string; level: DocAccessLevel }> {
  if (!token) throw new Error("Not authenticated");

  const memberId = await verifyBearerToken(token);
  if (!memberId) throw new Error("Not authenticated");

  const level = await resolveDocAccess(memberId, ref);
  if (!level) throw new Error("Forbidden");

  connectionConfig.readOnly = shouldBeReadOnly(level);
  return { memberId, level };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && npx tsx src/collab/collabAuth.test.ts`
Expected: `collabAuth: 4 passed, 0 failed`

- [ ] **Step 5: Rewrite the three `onAuthenticate` hooks**

In `backend/src/collab/blogCollab.ts`, replace the whole `onAuthenticate` body and delete the now-unused `canAccessPost` and `isAdmin` helpers:

```ts
  async onAuthenticate({ token, documentName, connectionConfig }: onAuthenticatePayload) {
    return authenticateCollab(token, { postId: documentName }, connectionConfig);
  },
```

In `pressKitCollab.ts`, replacing `canAccessPressKit`:

```ts
  async onAuthenticate({ token, documentName, connectionConfig }: onAuthenticatePayload) {
    return authenticateCollab(token, { pressKitId: documentName }, connectionConfig);
  },
```

In `courseCollab.ts`, replacing `canAccessCourseSection`:

```ts
  async onAuthenticate({ token, documentName, connectionConfig }: onAuthenticatePayload) {
    return authenticateCollab(token, { courseSectionId: documentName }, connectionConfig);
  },
```

Add `import { authenticateCollab } from "./collabAuth.js";` to each.

- [ ] **Step 6: Prove read-only is actually enforced**

The spec requires evidence that a below-EDIT connection cannot mutate the
document — the whole permission model rests on it. Add to
`backend/src/collab/collabUpgrade.test.ts` a third case built on the existing
harness, whose `onAuthenticate` sets `connectionConfig.readOnly = true`:

```ts
/**
 * A readOnly connection must not be able to change the document. This is the
 * guarantee VIEW/COMMENT access depends on; if Hocuspocus ever stopped
 * honouring connectionConfig.readOnly, every commenter would silently become
 * an editor.
 */
async function readOnlyCannotWrite(): Promise<boolean> {
  const hocuspocus = new Hocuspocus({
    async onAuthenticate({ connectionConfig }) {
      connectionConfig.readOnly = true;
      return { memberId: "viewer" };
    },
    async onLoadDocument({ document }) {
      document.getText("seed").insert(0, "original");
      return document;
    },
    quiet: true,
  });

  const httpServer = createServer();
  attachCollab(httpServer, "/collab/test", hocuspocus);
  await new Promise<void>((r) => httpServer.listen(0, "127.0.0.1", r));
  const { port } = httpServer.address() as AddressInfo;

  try {
    // Drive a real provider-shaped session: authenticate, then push a sync
    // update, then read the server's copy back.
    const doc = await connectAndPush(port, "test-doc", (text) => text.insert(0, "HACKED"));
    return !doc.includes("HACKED");
  } finally {
    httpServer.closeAllConnections();
    await new Promise<void>((r) => httpServer.close(() => r()));
  }
}

check("a readOnly connection cannot modify the document", await readOnlyCannotWrite());
```

Implement `connectAndPush(port, docName, mutate)` alongside the existing
`handshake()` helper: it opens a `ws` client, sends the same hand-encoded Auth
frame, waits for the Authenticated reply, sends a Yjs sync update produced by
`mutate`, then returns the server-side document text via
`hocuspocus.documents.get(docName)`.

Run: `cd backend && npx tsx src/collab/collabUpgrade.test.ts`
Expected: `3 passed, 0 failed`. The two pre-existing cases must still pass —
they prove the wiring from the earlier fix still works.

- [ ] **Step 7: Typecheck and commit**

```bash
cd backend && npx tsc --noEmit
git add backend/src/collab/
git commit -m "feat(access): enforce doc access in the collab handshake with readOnly connections"
```

---

### Task 6: Grants REST API and the Share dialog

**Files:**
- Create: `backend/src/api/docAccess.ts`
- Modify: `backend/src/app.ts` (mount the router)
- Create: `src/components/clubpm/ShareDialog.jsx`
- Modify: `src/api/clubPmClient.js`, `src/pages/ClubPM/BlogEditorPage.jsx`
- Modify: `public/clubpm-theme.css`

**Interfaces:**
- Consumes: `resolveDocAccess`, `atLeast`, `docRefToWhere`, `DocRef` from Tasks 2–3.
- Produces: client helpers `listDocAccess(docType, docId)`, `setDocAccess(docType, docId, memberId, level)`, `removeDocAccess(docType, docId, memberId)`, `setDocClubAccess(docType, docId, level | null)`.

- [ ] **Step 1: Add the routes**

Create `backend/src/api/docAccess.ts`:

```ts
import { Router, type Request, type Response } from "express";
import type { DocAccessLevel } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { requireAuth } from "./auth.js";
import {
  resolveDocAccess, atLeast, docRefToWhere, type DocRef,
} from "../services/docAccessService.js";

export const docAccessRouter = Router();
docAccessRouter.use(requireAuth);

const LEVELS: DocAccessLevel[] = ["VIEW", "COMMENT", "EDIT", "OWNER"];

// Maps the client's docType/docId pair onto a DocRef. Unknown types are
// rejected rather than defaulted, so a typo cannot silently target a post.
function toRef(docType: string, docId: string): DocRef | null {
  if (docType === "BLOG_POST") return { postId: docId };
  if (docType === "PRESS_KIT") return { pressKitId: docId };
  if (docType === "COURSE_SECTION") return { courseSectionId: docId };
  return null;
}

// Everything here requires EDIT on the document; granting OWNER additionally
// requires OWNER, so an editor cannot promote themselves past their grantor.
async function requireSharer(req: Request, res: Response) {
  const ref = toRef(String(req.params.docType), String(req.params.docId));
  if (!ref) { res.status(400).json({ error: "Unknown document type" }); return null; }
  const level = await resolveDocAccess(req.memberId!, ref);
  if (!atLeast(level, "EDIT")) { res.status(403).json({ error: "Forbidden" }); return null; }
  return { ref, level: level! };
}

docAccessRouter.get("/:docType/:docId/access", async (req, res) => {
  const ctx = await requireSharer(req, res);
  if (!ctx) return;
  const where = docRefToWhere(ctx.ref);
  const [grants, share] = await Promise.all([
    prisma.docAccessGrant.findMany({
      where,
      include: { member: { select: { id: true, displayName: true, avatarUrl: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.docShareSettings.findFirst({ where, select: { clubLevel: true } }),
  ]);
  res.json({ grants, clubLevel: share?.clubLevel ?? null, myLevel: ctx.level });
});

docAccessRouter.put("/:docType/:docId/access/:memberId", async (req, res) => {
  const ctx = await requireSharer(req, res);
  if (!ctx) return;
  const level = req.body?.level as DocAccessLevel;
  if (!LEVELS.includes(level)) { res.status(400).json({ error: "Invalid level" }); return; }
  if (level === "OWNER" && ctx.level !== "OWNER") {
    res.status(403).json({ error: "Only an owner can grant ownership" }); return;
  }
  const where = docRefToWhere(ctx.ref);
  const memberId = String(req.params.memberId);
  const existing = await prisma.docAccessGrant.findFirst({ where: { ...where, memberId } });
  const row = existing
    ? await prisma.docAccessGrant.update({ where: { id: existing.id }, data: { level } })
    : await prisma.docAccessGrant.create({
        data: { ...where, memberId, level, grantedById: req.memberId! },
      });
  res.json(row);
});

docAccessRouter.delete("/:docType/:docId/access/:memberId", async (req, res) => {
  const ctx = await requireSharer(req, res);
  if (!ctx) return;
  const where = docRefToWhere(ctx.ref);
  await prisma.docAccessGrant.deleteMany({
    where: { ...where, memberId: String(req.params.memberId) },
  });
  res.json({ ok: true });
});

docAccessRouter.put("/:docType/:docId/club-access", async (req, res) => {
  const ctx = await requireSharer(req, res);
  if (!ctx) return;
  const where = docRefToWhere(ctx.ref);
  const level = req.body?.level as DocAccessLevel | null;

  if (level === null) {
    await prisma.docShareSettings.deleteMany({ where });
    res.json({ clubLevel: null });
    return;
  }
  if (!level || level === "OWNER" || !LEVELS.includes(level)) {
    res.status(400).json({ error: "Club access must be VIEW, COMMENT or EDIT" });
    return;
  }
  const existing = await prisma.docShareSettings.findFirst({ where });
  const row = existing
    ? await prisma.docShareSettings.update({
        where: { id: existing.id }, data: { clubLevel: level, setById: req.memberId! },
      })
    : await prisma.docShareSettings.create({
        data: { ...where, clubLevel: level, setById: req.memberId! },
      });
  res.json({ clubLevel: row.clubLevel });
});
```

- [ ] **Step 2: Mount the router**

In `backend/src/app.ts`, beside the other route mounts:

```ts
import { docAccessRouter } from "./api/docAccess.js";
app.use("/api/docs", docAccessRouter);
```

- [ ] **Step 3: Add the client helpers**

Append to `src/api/clubPmClient.js`:

```js
// ── Document access (share dialog) ───────────────────────────
export const listDocAccess = (docType, docId) =>
  get(`/api/docs/${docType}/${docId}/access`);
export const setDocAccess = (docType, docId, memberId, level) =>
  put(`/api/docs/${docType}/${docId}/access/${memberId}`, { level });
export const removeDocAccess = (docType, docId, memberId) =>
  del(`/api/docs/${docType}/${docId}/access/${memberId}`);
export const setDocClubAccess = (docType, docId, level) =>
  put(`/api/docs/${docType}/${docId}/club-access`, { level });
```

- [ ] **Step 4: Build the Share dialog**

Create `src/components/clubpm/ShareDialog.jsx`. It renders a modal listing current grants (avatar, name, a level `<select>` of View/Comment/Edit/Owner, and a remove button), a member picker that adds a grant defaulting to `COMMENT`, and a club-tier row with an off/View/Comment/Edit `<select>`. `OWNER` appears in the per-member select only when `myLevel === 'OWNER'`. All mutations call the helpers from Step 3, then re-fetch via `listDocAccess`.

Note: the dialog must render outside any `revealStagger`-transformed ancestor, or it will position itself inside that panel instead of the viewport.

- [ ] **Step 5: Wire it into the editor header**

In `src/pages/ClubPM/BlogEditorPage.jsx`, add a Share button to `.cpm-blog-editor-header-actions`:

```jsx
<button
  type="button"
  className="cpm-blog-tool-btn"
  onClick={() => setShareOpen(true)}
  title="Share"
>
  <i className="fas fa-user-plus" aria-hidden="true" /> Share
</button>
```

and render `{shareOpen && <ShareDialog docType="BLOG_POST" docId={id} onClose={() => setShareOpen(false)} />}`.

- [ ] **Step 6: Add the styles**

Append `.cpm-share-dialog`, `.cpm-share-row`, `.cpm-share-level`, and `.cpm-share-club` rules to the **bottom** of `public/clubpm-theme.css`, using the existing `--pm-surface` / `--pm-elevated` / `--pm-accent-teal` tokens.

- [ ] **Step 7: Verify and commit**

Run: `cd backend && npx tsc --noEmit`
Run: `npm run build` (repo root)
Expected: both exit 0.

```bash
git add backend/src/api/docAccess.ts backend/src/app.ts src/api/clubPmClient.js src/components/clubpm/ShareDialog.jsx src/pages/ClubPM/BlogEditorPage.jsx public/clubpm-theme.css
git commit -m "feat(access): share dialog and document access REST API"
```

---

# Arc B — Comment anchoring and the rail (Tasks 7–9)

Depends on Arc A only through UI gating. At the end of Arc B, comments are anchored by relative positions and displayed in a Docs-style rail.

### Task 7: Anchor encode/decode

**Files:**
- Create: `src/components/clubpm/blog/threadAnchors.js`
- Test: `src/components/clubpm/blog/threadAnchors.test.js`
- Modify: `backend/prisma/schema.prisma` (two columns on `BlogThread`)

**Interfaces:**
- Produces:
  - `encodeAnchor(relPos): string` — base64 of `Y.encodeRelativePosition`
  - `decodeAnchor(b64: string)` — the Yjs relative position, or `null` on malformed input
  - `anchorFromSelection(editor, from, to): { anchorStart, anchorEnd } | null`
  - `resolveAnchor(editor, thread): { from, to } | null` — `null` means orphaned

- [ ] **Step 1: Add the schema columns**

In `backend/prisma/schema.prisma`, on `model BlogThread`:

```prisma
  anchorStart Bytes?
  anchorEnd   Bytes?
```

Run: `cd backend && npx prisma migrate dev --name thread_relative_anchors && npx prisma generate`

- [ ] **Step 2: Write the failing test**

Create `src/components/clubpm/blog/threadAnchors.test.js`:

```js
import * as Y from 'yjs';
import { encodeAnchor, decodeAnchor } from './threadAnchors';

// Round-tripping is the contract the rail depends on: an anchor written by one
// client must decode to the same position in another client's document.
test('encodeAnchor -> decodeAnchor round-trips to the same index', () => {
  const doc = new Y.Doc();
  const text = doc.getText('t');
  text.insert(0, 'hello world');

  const rel = Y.createRelativePositionFromTypeIndex(text, 6);
  const decoded = decodeAnchor(encodeAnchor(rel));
  const abs = Y.createAbsolutePositionFromRelativePosition(decoded, doc);

  expect(abs.index).toBe(6);
});

test('an anchor survives an edit before it, tracking the same character', () => {
  const doc = new Y.Doc();
  const text = doc.getText('t');
  text.insert(0, 'hello world');

  const rel = Y.createRelativePositionFromTypeIndex(text, 6);
  const encoded = encodeAnchor(rel);
  text.insert(0, 'XXX');           // shifts everything right by 3

  const abs = Y.createAbsolutePositionFromRelativePosition(decodeAnchor(encoded), doc);
  expect(abs.index).toBe(9);
});

test('decodeAnchor returns null on malformed input instead of throwing', () => {
  expect(decodeAnchor('not-base64!!')).toBeNull();
  expect(decodeAnchor('')).toBeNull();
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx react-scripts test --watchAll=false threadAnchors` (repo root)
Expected: FAIL — `encodeAnchor` is not exported.

- [ ] **Step 4: Write the implementation**

Create `src/components/clubpm/blog/threadAnchors.js`:

```js
import * as Y from 'yjs';
import {
  absolutePositionToRelativePosition,
  relativePositionToAbsolutePosition,
  ySyncPluginKey,
} from '@tiptap/y-tiptap';

// Anchors travel as base64 in JSON and are stored as Bytes. They deliberately
// do NOT live in the document: a comment is metadata about content, not
// content, so it must not reach contentJson, revisions, or markdown export.

export function encodeAnchor(relPos) {
  const bytes = Y.encodeRelativePosition(relPos);
  let binary = '';
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary);
}

export function decodeAnchor(b64) {
  if (!b64) return null;
  try {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return Y.decodeRelativePosition(bytes);
  } catch {
    // A malformed anchor must degrade to "orphaned", never crash the editor.
    return null;
  }
}

// The Yjs binding the collaboration extension installed. Absent when the editor
// is running without collab (preview, revision view) — callers treat that as
// "cannot resolve anchors" rather than an error.
function binding(editor) {
  return ySyncPluginKey.getState(editor.state)?.binding ?? null;
}

export function anchorFromSelection(editor, from, to) {
  const b = binding(editor);
  if (!b) return null;
  const start = absolutePositionToRelativePosition(from, b.type, b.mapping);
  const end = absolutePositionToRelativePosition(to, b.type, b.mapping);
  return { anchorStart: encodeAnchor(start), anchorEnd: encodeAnchor(end) };
}

/**
 * Absolute range for a thread's anchor, or null when it can no longer be
 * placed — the anchored text was deleted. Null is the orphan signal the rail
 * renders under "No longer in the document".
 */
export function resolveAnchor(editor, thread) {
  const b = binding(editor);
  if (!b) return null;

  const start = decodeAnchor(thread.anchorStart);
  const end = decodeAnchor(thread.anchorEnd);
  if (!start || !end) return null;

  const ydoc = b.doc ?? b.type.doc;
  const from = relativePositionToAbsolutePosition(ydoc, b.type, start, b.mapping);
  const to = relativePositionToAbsolutePosition(ydoc, b.type, end, b.mapping);
  if (from == null || to == null || from >= to) return null;

  return { from, to };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx react-scripts test --watchAll=false threadAnchors`
Expected: 3 passing.

- [ ] **Step 6: Commit**

```bash
git add src/components/clubpm/blog/threadAnchors.js src/components/clubpm/blog/threadAnchors.test.js backend/prisma
git commit -m "feat(comments): Yjs relative-position anchors for comment threads"
```

---

### Task 8: `ThreadDecorations` extension and lazy mark migration

**Files:**
- Create: `src/components/clubpm/blog/ThreadDecorations.js`
- Modify: `src/components/clubpm/blog/BlogEditor.jsx`, `backend/src/api/blog.ts`
- Modify: `public/clubpm-theme.css`

**Interfaces:**
- Consumes: `resolveAnchor`, `anchorFromSelection` from Task 7.
- Produces: `ThreadDecorations` TipTap extension accepting `{ threads, onPositions }`; `PATCH /api/blog/threads/:id/anchor`.

- [ ] **Step 1: Add the anchor PATCH route**

In `backend/src/api/blog.ts`, beside the other thread routes:

```ts
// Writes a thread's relative-position anchor. Used both when a comment is
// created and by the one-shot client-side migration off commentMark.
blogRouter.patch("/threads/:id/anchor", async (req: Request, res: Response) => {
  const thread = await prisma.blogThread.findUnique({
    where: { id: String(req.params.id) }, select: { id: true, postId: true },
  });
  if (!thread?.postId) { res.status(404).json({ error: "Thread not found" }); return; }

  const level = await resolveDocAccess(req.memberId!, { postId: thread.postId });
  if (!atLeast(level, "COMMENT")) { res.status(403).json({ error: "Forbidden" }); return; }

  const { anchorStart, anchorEnd } = req.body ?? {};
  if (typeof anchorStart !== "string" || typeof anchorEnd !== "string") {
    res.status(400).json({ error: "anchorStart and anchorEnd are required" }); return;
  }
  const updated = await prisma.blogThread.update({
    where: { id: thread.id },
    data: {
      anchorStart: Buffer.from(anchorStart, "base64"),
      anchorEnd: Buffer.from(anchorEnd, "base64"),
    },
  });
  res.json({ id: updated.id });
});
```

Add the client helper to `src/api/clubPmClient.js`:

```js
export const setBlogThreadAnchor = (threadId, anchorStart, anchorEnd) =>
  patch(`/api/blog/threads/${threadId}/anchor`, { anchorStart, anchorEnd });
```

- [ ] **Step 2: Write the extension**

Create `src/components/clubpm/blog/ThreadDecorations.js`:

```js
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { resolveAnchor } from './threadAnchors';

export const threadDecorationsKey = new PluginKey('threadDecorations');

/**
 * Renders comment anchors as view-layer decorations resolved from Yjs relative
 * positions. Nothing here touches the document, so a COMMENT-level user on a
 * readOnly connection can still see and create anchors.
 */
export const ThreadDecorations = Extension.create({
  name: 'threadDecorations',

  addOptions() {
    return { threads: [], onPositions: null };
  },

  addProseMirrorPlugins() {
    const extension = this;

    const build = (state) => {
      const decos = [];
      const positions = new Map();
      for (const thread of extension.options.threads) {
        if (thread.status !== 'OPEN') continue;
        const range = resolveAnchor(extension.editor, thread);
        if (!range) continue;                    // orphaned — no decoration
        positions.set(thread.id, range);
        decos.push(Decoration.inline(range.from, range.to, {
          class: 'cpm-blog-comment-hl',
          'data-thread-id': thread.id,
        }));
      }
      extension.options.onPositions?.(positions);
      return DecorationSet.create(state.doc, decos);
    };

    return [
      new Plugin({
        key: threadDecorationsKey,
        state: {
          init: (_, state) => build(state),
          apply(tr, old, _oldState, newState) {
            // A full recompute is only needed when the thread set changes or
            // Yjs syncs; ordinary keystrokes just map the existing set, which
            // keeps typing cheap with many threads open.
            if (tr.getMeta(threadDecorationsKey)?.recompute) return build(newState);
            return tr.docChanged ? old.map(tr.mapping, tr.doc) : old;
          },
        },
        props: {
          decorations(state) { return threadDecorationsKey.getState(state); },
        },
      }),
    ];
  },
});
```

- [ ] **Step 3: Register the extension and force a recompute when threads change**

In `blogExtensions()` in `src/components/clubpm/blog/BlogEditor.jsx`, add `ThreadDecorations.configure({ threads, onPositions })` to the returned array. When the thread list or Yjs sync state changes, dispatch:

```js
editor.view.dispatch(
  editor.state.tr.setMeta(threadDecorationsKey, { recompute: true })
);
```

- [ ] **Step 4: Write anchors on comment creation**

In `src/components/clubpm/blog/BlogSelectionBubble.jsx`, where a `COMMENT`-kind thread is created, capture the selection before the request and PATCH the anchor after it resolves:

```js
const { from, to } = editor.state.selection;
const anchor = anchorFromSelection(editor, from, to);
const thread = await createBlogThread(docType, docId, { /* existing body */ });
if (anchor) {
  await setBlogThreadAnchor(thread.id, anchor.anchorStart, anchor.anchorEnd);
}
```

Stop applying `commentMark` for `COMMENT`-kind threads. `SUGGESTION` threads keep their marks — suggestions are proposed content and must stay in the CRDT.

- [ ] **Step 5: Add the one-shot mark migration**

In `BlogEditor.jsx`, add an effect that runs once per document, only when the user has `EDIT`, the Yjs doc has synced, and the document still contains `commentMark`s:

```js
// Legacy comments anchored via commentMark predate relative positions. Convert
// them on first open by an editor, then strip the marks. Documents only ever
// opened by commenters keep their marks, which is why the commentMark render
// path below stays until every document has converted.
React.useEffect(() => {
  if (!editor || !collab || !synced || !canEditDoc) return;
  const pending = threads.filter((t) => t.kind === 'COMMENT' && !t.anchorStart);
  if (!pending.length) return;

  const tr = editor.state.tr;
  let touched = false;
  for (const thread of pending) {
    const ranges = findMarkRanges(editor.state.doc, 'commentMark', thread.id);
    if (!ranges.length) continue;
    const { from, to } = ranges[0];
    const anchor = anchorFromSelection(editor, from, to);
    if (!anchor) continue;
    setBlogThreadAnchor(thread.id, anchor.anchorStart, anchor.anchorEnd).catch(() => {});
    tr.removeMark(from, to, editor.schema.marks.commentMark);
    touched = true;
  }
  if (touched) editor.view.dispatch(tr);
}, [editor, collab, synced, canEditDoc, threads]);
```

- [ ] **Step 6: Add the highlight style**

Append to `public/clubpm-theme.css`:

```css
/* Comment anchor highlight — a decoration, never a mark in the document. */
.cpm-blog-comment-hl {
  background: color-mix(in srgb, var(--pm-accent-amber) 22%, transparent);
  border-bottom: 2px solid var(--pm-accent-amber);
  cursor: pointer;
}
.cpm-blog-comment-hl.is-focused {
  background: color-mix(in srgb, var(--pm-accent-amber) 38%, transparent);
}
```

- [ ] **Step 7: Verify and commit**

Run: `npm run build` (repo root) and `cd backend && npx tsc --noEmit`
Expected: both exit 0.

```bash
git add src/components/clubpm/blog/ThreadDecorations.js src/components/clubpm/blog/BlogEditor.jsx src/components/clubpm/blog/BlogSelectionBubble.jsx src/api/clubPmClient.js backend/src/api/blog.ts public/clubpm-theme.css
git commit -m "feat(comments): decoration-based anchors with lazy commentMark migration"
```

---

### Task 9: The comment rail

**Files:**
- Create: `src/components/clubpm/blog/railLayout.js`, `railLayout.test.js`, `BlogCommentRail.jsx`
- Modify: `src/pages/ClubPM/BlogEditorPage.jsx`, `public/clubpm-theme.css`

**Interfaces:**
- Consumes: thread positions from `ThreadDecorations`'s `onPositions` (Task 8).
- Produces: `layoutCards(cards, focusedId): Map<id, top>`

- [ ] **Step 1: Write the failing test**

Create `src/components/clubpm/blog/railLayout.test.js`:

```js
import { layoutCards } from './railLayout';

// Pure geometry: ideal tops in, non-overlapping tops out. The focused card is
// the one that keeps its true anchor position; others yield around it.
test('non-overlapping cards keep their ideal tops', () => {
  const out = layoutCards([
    { id: 'a', idealTop: 0,   height: 80 },
    { id: 'b', idealTop: 200, height: 80 },
  ], null);
  expect(out.get('a')).toBe(0);
  expect(out.get('b')).toBe(200);
});

test('overlapping cards are pushed down by height plus gap', () => {
  const out = layoutCards([
    { id: 'a', idealTop: 0,  height: 80 },
    { id: 'b', idealTop: 10, height: 80 },
  ], null);
  expect(out.get('a')).toBe(0);
  expect(out.get('b')).toBe(92);   // 0 + 80 + 12
});

test('the focused card keeps its ideal top and pushes earlier cards up', () => {
  const out = layoutCards([
    { id: 'a', idealTop: 0,  height: 80 },
    { id: 'b', idealTop: 10, height: 80 },
  ], 'b');
  expect(out.get('b')).toBe(10);
  expect(out.get('a')).toBe(-82);  // 10 - 12 - 80
});

test('cards are ordered by ideal top regardless of input order', () => {
  const out = layoutCards([
    { id: 'b', idealTop: 200, height: 50 },
    { id: 'a', idealTop: 0,   height: 50 },
  ], null);
  expect(out.get('a')).toBe(0);
  expect(out.get('b')).toBe(200);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx react-scripts test --watchAll=false railLayout`
Expected: FAIL — `layoutCards` is not exported.

- [ ] **Step 3: Write the implementation**

Create `src/components/clubpm/blog/railLayout.js`:

```js
const GAP = 12;

/**
 * Google-Docs rail placement. Cards want to sit level with their anchor; where
 * that would overlap, later cards slide down. The focused card is pinned to its
 * true anchor and everything above it is pushed up instead, so clicking a
 * comment always lines it up with the text it refers to.
 *
 * @param {{id: string, idealTop: number, height: number}[]} cards
 * @param {string|null} focusedId
 * @returns {Map<string, number>} id -> resolved top
 */
export function layoutCards(cards, focusedId) {
  const sorted = [...cards].sort((a, b) => a.idealTop - b.idealTop);
  const tops = new Map();

  let cursor = -Infinity;
  for (const card of sorted) {
    const top = Math.max(card.idealTop, cursor);
    tops.set(card.id, top);
    cursor = top + card.height + GAP;
  }

  const focusIndex = sorted.findIndex((c) => c.id === focusedId);
  if (focusIndex === -1) return tops;

  // Pin the focused card, then walk backwards pushing predecessors up so the
  // pinned card is never displaced by the cards above it.
  tops.set(focusedId, sorted[focusIndex].idealTop);
  for (let i = focusIndex - 1; i >= 0; i -= 1) {
    const below = sorted[i + 1];
    const limit = tops.get(below.id) - GAP - sorted[i].height;
    tops.set(sorted[i].id, Math.min(tops.get(sorted[i].id), limit));
  }
  return tops;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx react-scripts test --watchAll=false railLayout`
Expected: 4 passing.

- [ ] **Step 5: Build the rail component**

Create `src/components/clubpm/blog/BlogCommentRail.jsx`. It:

- takes `{ threads, positions, editor, focusedThreadId, onFocus, currentMember, canComment }`,
- converts each thread's `positions.get(id).from` to a canvas-relative top with `editor.view.coordsAtPos(from).top - canvasRect.top + scrollTop`,
- measures each card with a ref, feeds `{ id, idealTop, height }` into `layoutCards`, and applies the result as `transform: translateY(...)`,
- recomputes in a `requestAnimationFrame` on doc change, resize, thread-set change, and focus change,
- renders threads absent from `positions` in a collapsed "No longer in the document" group showing `thread.anchorText`,
- reuses `BlogThreadCard` for each card rather than reimplementing comment rendering.

- [ ] **Step 6: Make the editor body a two-column grid**

Append to `public/clubpm-theme.css`:

```css
/* Comment rail — canvas keeps its existing max-width; the rail is a gutter. */
@media (min-width: 1100px) {
  .cpm-blog-editor-body.has-rail {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 300px;
    gap: 24px;
    align-items: start;
  }
}
.cpm-blog-rail { position: relative; }
.cpm-blog-rail-card {
  position: absolute;
  width: 100%;
  transition: transform 160ms ease;
}
```

Below 1100px the grid does not apply, `.cpm-blog-rail` is hidden, and the existing `BlogAnnotationsPanel` overlay remains the narrow-screen path.

- [ ] **Step 7: Render it**

In `src/pages/ClubPM/BlogEditorPage.jsx`, add `has-rail` to `.cpm-blog-editor-body` when not in preview mode, and render `<BlogCommentRail … />` as the grid's second child.

- [ ] **Step 8: Verify and commit**

Run: `npm run build` (repo root)
Expected: exit 0.

```bash
git add src/components/clubpm/blog/railLayout.js src/components/clubpm/blog/railLayout.test.js src/components/clubpm/blog/BlogCommentRail.jsx src/pages/ClubPM/BlogEditorPage.jsx public/clubpm-theme.css
git commit -m "feat(comments): Google-Docs-style anchored comment rail"
```

---

# Arc C — Presence and Docs features (Tasks 10–13)

### Task 10: Caret styling, avatars, and follow

**Files:**
- Modify: `public/clubpm-theme.css`, `src/components/clubpm/blog/BlogEditor.jsx`, `src/pages/ClubPM/BlogEditorPage.jsx`

**Interfaces:**
- Consumes: the existing `peers` awareness state in `BlogEditor.jsx:532`.

- [ ] **Step 1: Add the caret CSS**

`CollaborationCaret` already emits this DOM; the stylesheet has no rules for it, which is the entire reason cursors are invisible. Append to `public/clubpm-theme.css`:

```css
/* Remote collaborator carets. The extension emits these class names; without
   these rules the carets render with zero width and are invisible. */
.collaboration-carets__caret {
  position: relative;
  border-left: 2px solid var(--caret-color, var(--pm-accent-teal));
  margin-left: -1px;
  pointer-events: none;
  word-break: normal;
}
.collaboration-carets__label {
  position: absolute;
  top: -1.4em;
  left: -2px;
  padding: 1px 6px;
  border-radius: 4px 4px 4px 0;
  background: var(--caret-color, var(--pm-accent-teal));
  color: #04121a;
  font: 600 11px/1.5 var(--pm-font-body);
  white-space: nowrap;
  user-select: none;
  opacity: 0;
  transition: opacity 140ms ease;
}
/* Labels appear on movement then fade — permanent labels are unreadable with
   three people in one paragraph. */
.collaboration-carets__caret.is-active .collaboration-carets__label,
.collaboration-carets__caret:hover .collaboration-carets__label { opacity: 1; }

.collaboration-carets__selection {
  background: color-mix(in srgb, var(--caret-color, var(--pm-accent-teal)) 26%, transparent);
  pointer-events: none;
}
```

- [ ] **Step 2: Drive `--caret-color` and the `is-active` fade**

In `BlogEditor.jsx`, extend the `CollaborationCaret.configure({ render })` option to set `el.style.setProperty('--caret-color', user.color)`, add `is-active`, and remove it after 2500ms via a per-clientId timer that resets on each update.

- [ ] **Step 3: Pass avatars into awareness**

In `src/pages/ClubPM/BlogEditorPage.jsx:489`, change:

```jsx
collabUser={{ id: member?.id, name: member?.displayName, avatarUrl: member?.avatarUrl }}
```

In `BlogEditor.jsx`, include `avatarUrl` in the `user` object handed to `CollaborationCaret`.

- [ ] **Step 4: Render avatars in `PresenceBar`**

Replace the initial-letter span with an `<img src={p.user.avatarUrl}>` when present, keeping the existing initial circle as the fallback. Cap at 5 visible with a `+N` chip. Leave the synced-vs-connected dot logic untouched — it exists to avoid claiming a live session that is not syncing.

- [ ] **Step 5: Add follow mode**

Add `followedClientId` state in `BlogEditor.jsx`. Clicking a presence avatar sets it. In the `awarenessUpdate` handler, when a followed peer reports a cursor, resolve it with `editor.view.coordsAtPos()` and `scrollIntoView({ behavior: 'smooth', block: 'center' })`. Clear on Esc, a second click, a manual `wheel`/`touchmove` on the canvas, or that peer disappearing from `states`. Render a "Following {name} — Esc to stop" chip and a ring on the followed avatar.

- [ ] **Step 6: Verify and commit**

Run: `npm run build`
Expected: exit 0.

```bash
git add public/clubpm-theme.css src/components/clubpm/blog/BlogEditor.jsx src/pages/ClubPM/BlogEditorPage.jsx
git commit -m "feat(presence): visible remote carets, avatar presence, follow a collaborator"
```

---

### Task 11: Suggesting mode

**Files:**
- Create: `src/components/clubpm/blog/SuggestingMode.js`
- Modify: `src/components/clubpm/blog/BlogEditor.jsx`, `src/pages/ClubPM/BlogEditorPage.jsx`

- [ ] **Step 1: Write the mode-permission mapping test**

Create `src/components/clubpm/blog/suggestingMode.test.js`:

```js
import { modesFor, defaultMode } from './SuggestingMode';

// COMMENT users ride a readOnly connection, so their suggestions — which are
// marks, and therefore document writes — would be dropped. Suggesting requires
// EDIT. Commenting is orthogonal to the mode, exactly as in Google Docs.
test('VIEW gets viewing only', () => {
  expect(modesFor('VIEW')).toEqual(['viewing']);
  expect(defaultMode('VIEW')).toBe('viewing');
});

test('COMMENT gets viewing only, not suggesting', () => {
  expect(modesFor('COMMENT')).toEqual(['viewing']);
  expect(defaultMode('COMMENT')).toBe('viewing');
});

test('EDIT gets all three modes and defaults to editing', () => {
  expect(modesFor('EDIT')).toEqual(['editing', 'suggesting', 'viewing']);
  expect(defaultMode('EDIT')).toBe('editing');
});

test('OWNER matches EDIT', () => {
  expect(modesFor('OWNER')).toEqual(['editing', 'suggesting', 'viewing']);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx react-scripts test --watchAll=false suggestingMode`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the mapping and the transaction filter**

Create `src/components/clubpm/blog/SuggestingMode.js` exporting `modesFor(level)`, `defaultMode(level)`, and a `SuggestingMode` TipTap extension whose `appendTransaction` converts plain insertions into `suggestInsert`-marked text and plain deletions into `suggestDelete` marks, leaving the original text in place.

```js
export function modesFor(level) {
  if (level === 'EDIT' || level === 'OWNER') return ['editing', 'suggesting', 'viewing'];
  return ['viewing'];
}

export function defaultMode(level) {
  return (level === 'EDIT' || level === 'OWNER') ? 'editing' : 'viewing';
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx react-scripts test --watchAll=false suggestingMode`
Expected: 4 passing.

- [ ] **Step 5: Add the mode control**

Render a three-position control in the editor header, populated from `modesFor(myLevel)` and initialised to `defaultMode(myLevel)`. `viewing` sets `editor.setEditable(false)`; `suggesting` enables the extension; `editing` is today's behavior.

- [ ] **Step 6: Verify and commit**

Run: `npm run build`

```bash
git add src/components/clubpm/blog/SuggestingMode.js src/components/clubpm/blog/suggestingMode.test.js src/components/clubpm/blog/BlogEditor.jsx src/pages/ClubPM/BlogEditorPage.jsx
git commit -m "feat(editor): suggesting mode gated on resolved access level"
```

---

### Task 12: @-mentions in comments

**Files:**
- Modify: `backend/src/api/blog.ts`, `src/components/clubpm/blog/BlogThreadCard.jsx`

- [ ] **Step 1: Parse mentions on comment creation**

In the `POST /threads/:id/comments` handler in `backend/src/api/blog.ts`, after creating the comment, reuse the same mention approach as `tasks.ts`: match `@handle` against `Member.slackHandle`/`displayName`, then for each match call `createNotification()` and `queueDm()`.

- [ ] **Step 2: Offer a grant for mentioned members without access**

For each matched member, call `resolveDocAccess(memberId, { postId })`. Return those resolving to `null` in the response as `mentionedWithoutAccess: [{ id, displayName }]`.

- [ ] **Step 3: Surface the grant offer in the UI**

In `BlogThreadCard.jsx`, when a comment POST returns a non-empty `mentionedWithoutAccess`, show an inline "Alex can't see this document — give access?" row with a one-click button calling `setDocAccess(docType, docId, memberId, 'COMMENT')`.

- [ ] **Step 4: Verify and commit**

Run: `cd backend && npx tsc --noEmit` and `npm run build`

```bash
git add backend/src/api/blog.ts src/components/clubpm/blog/BlogThreadCard.jsx
git commit -m "feat(comments): @-mentions with notification and access offer"
```

---

### Task 13: Named versions

**Files:**
- Modify: `backend/prisma/schema.prisma`, `backend/src/api/blog.ts`, `src/components/clubpm/blog/RevisionHistoryDrawer.jsx`, `src/api/clubPmClient.js`

- [ ] **Step 1: Add the column**

On `model BlogRevision` in `backend/prisma/schema.prisma`:

```prisma
  name String?
```

Run: `cd backend && npx prisma migrate dev --name revision_names && npx prisma generate`

- [ ] **Step 2: Add the rename route**

```ts
blogRouter.patch("/posts/:id/revisions/:revId", async (req: Request, res: Response) => {
  const post = await requirePostAccess(req, res);
  if (!post) return;
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : null;
  const updated = await prisma.blogRevision.update({
    where: { id: String(req.params.revId) },
    data: { name: name || null },
  });
  res.json(updated);
});
```

Client helper:

```js
export const renameBlogRevision = (postId, revId, name) =>
  patch(`/api/blog/posts/${postId}/revisions/${revId}`, { name });
```

- [ ] **Step 3: Add rename-in-place and the named-only filter**

In `RevisionHistoryDrawer.jsx`, render `revision.name` in place of the timestamp when set (timestamp beneath, smaller), add an inline rename input, and add a "Named versions only" checkbox filtering on `r.name`.

- [ ] **Step 4: Verify and commit**

Run: `cd backend && npx tsc --noEmit` and `npm run build`

```bash
git add backend/prisma backend/src/api/blog.ts src/components/clubpm/blog/RevisionHistoryDrawer.jsx src/api/clubPmClient.js
git commit -m "feat(editor): named revisions with rename and filter"
```

---

## Deferred to a follow-up

- Removing `commentMark` from the schema — requires a soak until every document has been opened by an editor and lazily migrated (Task 8, Step 5).
- Applying the access model's UI gating to `PressKitPanel` and `CourseEditorPage`. Enforcement covers all three doc types from Task 5; only the blog editor gets the Share dialog in this plan.
- Secret-link sharing to logged-out visitors — rejected in the spec.
