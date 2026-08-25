# Lab Training Certifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Porterfield lab's Word training sheet with a Constellation course backed by a shared training registry and retained, admin-reviewed certificate submissions with expiry tracking.

**Architecture:** A new `TRAINING` course-section kind holds a foreign key to a shared `Training` registry row (name, provider, links, renewal period, example certificate). Members upload a certificate plus the completion date printed on it; the section completes immediately while the certificate sits `PENDING` for admin review. A member's compliance status is *derived* from their certificate rows rather than stored, and a daily cron nags before and after expiry. Certificate files stay private in the bot's Drive and are served only through an authenticated proxy.

**Tech Stack:** Prisma/PostgreSQL, Express (TypeScript, ESM — `.js` import specifiers), `multer` memory storage, `driveService` (Google Drive bot account), `node-cron`, React 19 (plain JSX, no TypeScript), Font Awesome icons, plain CSS in `public/clubpm-theme.css`.

**Design doc:** [`docs/superpowers/specs/2026-08-25-lab-training-certifications-design.md`](../specs/2026-08-25-lab-training-certifications-design.md)

---

## Naming warning — read before Phase 1

The codebase **already** uses the word "training" for something completely different: the
**training project**, a sandbox project the Constellation 101 walkthroughs drive
(`POST /api/training-project`, `tourConfig.requiresTrainingProject`, `EXCLUDE_TRAINING` in
`backend/src/slack/scheduler.ts`).

This feature's `Training` model is a **safety-training catalog entry** and has nothing to do
with it. Do not merge, rename, or "consolidate" the two. Every new schema comment in Phase 1
says so explicitly; keep those comments.

---

## Conventions every phase must follow

These are drawn from `CLAUDE.md` and the existing course code. A fresh session will not know
them, so they are repeated in each phase prompt.

1. **Always read `req.memberId`, never `req.session.memberId`.** Session reads are `undefined`
   for Bearer-token clients and silently break them. Only `backend/src/api/auth.ts` may touch
   `req.session`.
2. **Never clear `rewardGrantedAt`** on `CourseSectionProgress` or `CourseEnrollment`. They are
   idempotency gates like `Task.rewardGrantedAt`. Reopening a section sets `status` and
   `completedAt` only.
3. **Backend is ESM.** Relative imports carry a `.js` extension even from `.ts` files
   (`import { prisma } from "../db/prisma.js"`).
4. **Backend tests are not Jest.** They are `tsx`-run scripts with an inline `check()` harness.
   See `backend/src/services/assignmentService.test.ts` for the exact shape.
5. **Frontend is plain JSX, no TypeScript.** Font Awesome classes only — never emoji as icons.
6. **ClubPM CSS goes at the bottom of `public/clubpm-theme.css`**, never `search-theme.css`
   (these components render only under `/clubpm/*`).
7. **After every phase:** `npm run build` at the repo root and `npx tsc --noEmit` in `backend/`.
   Fix all errors before moving on.

---

## File structure

| File | Phase | Responsibility |
|---|---|---|
| `backend/prisma/schema.prisma` | 1 | `TRAINING` kind, `TrainingCertStatus`, `Training`, `TrainingCertificate`, `CourseSection.trainingId`, two `NotificationType` values |
| `backend/src/services/trainingService.ts` | 2, 3, 4, 5 | All training logic: pure date/status functions, then registry and certificate persistence |
| `backend/src/services/trainingService.test.ts` | 2 | Pure-logic tests |
| `backend/src/api/courses.ts` | 3, 4, 5 | Registry routes, certificate submission, review queue, file proxy |
| `backend/src/services/courseProgressService.ts` | 4, 5 | `TRAINING` in the learner payload; reopen-on-rejection |
| `backend/src/slack/scheduler.ts` | 6 | Daily expiry cron |
| `src/api/clubPmClient.js` | 7 | Fetch wrappers |
| `src/components/clubpm/courses/CourseSectionRail.jsx` | 7 | `SECTION_KINDS.TRAINING` entry |
| `src/components/clubpm/courses/TrainingSection.jsx` | 7 | Learner card: links, example cert, upload form, attempt history |
| `src/pages/ClubPM/CoursePlayerPage.jsx` | 7 | Render `TrainingSection` |
| `src/components/clubpm/courses/TrainingBuilder.jsx` | 8 | Author: registry picker/creator, example-cert upload |
| `src/pages/ClubPM/CourseEditorPage.jsx` | 8 | Render `TrainingBuilder` |
| `src/components/clubpm/courses/CertificateReviewPanel.jsx` | 9 | Admin review queue |
| `src/components/clubpm/courses/CourseProgressDashboard.jsx` | 9 | "Certificates" view tab |
| `src/components/clubpm/AppShell.jsx` | 9 | Pending-certificate admin badge |
| `src/components/clubpm/courses/TrainingStatusStrip.jsx` | 10 | Member's standing, year-round |
| `src/pages/ClubPM/Profile.jsx` | 10 | Render the strip |
| `public/clubpm-theme.css` | 11 | `cpm-training-*` styles |
| `docs/courses/porterfield-lab-trainings/` | 12 | Course + registry source of truth |
| `backend/scripts/seedCourses.ts` | 12 | Upsert `Training` rows, link sections |

---

# Phase 1 — Schema and migration

**Goal:** Every table this feature needs exists. No behaviour yet.

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/<timestamp>_lab_training_certifications/migration.sql` (generated)

- [ ] **Step 1: Add the two new `NotificationType` values**

In `backend/prisma/schema.prisma`, find `enum NotificationType` (~line 98) and add two values
before the closing brace, after `BLOG_COMMENTED`:

```prisma
  BLOG_COMMENTED
  TRAINING_CERT_REVIEWED
  TRAINING_EXPIRING
}
```

- [ ] **Step 2: Add `TRAINING` to `CourseSectionKind`**

Find `enum CourseSectionKind` (~line 1940). Add `TRAINING` as the last value:

```prisma
enum CourseSectionKind {
  CONTENT
  VIDEO
  QUIZ
  SLIDES
  WALKTHROUGH
  LIT_REVIEW
  ASSIGNMENT
  /// An externally-hosted training (CITI, Purdue EHS/HSI). Constellation cannot
  /// host these, so the section explains the training, links out to it, and
  /// collects the certificate as proof.
  TRAINING
}
```

- [ ] **Step 3: Add the `TrainingCertStatus` enum**

Add immediately after `enum CourseSectionKind`:

```prisma
enum TrainingCertStatus {
  PENDING
  APPROVED
  REJECTED
}
```

- [ ] **Step 4: Add the `Training` model**

Add after the `CourseWorkSubmission` model (~line 2190):

```prisma
/// A safety-training catalog entry, shared across courses.
///
/// NOT the "training project" — that is the sandbox project the Constellation
/// 101 walkthroughs drive (`POST /api/training-project`,
/// `tourConfig.requiresTrainingProject`, `EXCLUDE_TRAINING` in scheduler.ts).
/// The two are unrelated; do not consolidate them.
///
/// Shared on purpose: one Bloodborne Pathogens entry serves every course that
/// requires it, so a member's certificate satisfies it everywhere. The cost is
/// that editing an entry edits it in every course — TrainingBuilder warns.
model Training {
  id              String    @id @default(cuid())
  slug            String    @unique
  name            String
  /// Free text, e.g. "CITI Program" or "Purdue EHS — HSI Platform". Deliberately
  /// not an enum: a third provider must not require a migration.
  providerName    String
  providerUrl     String?
  /// Direct link to the training itself.
  courseUrl       String?
  /// Separate from courseUrl on purpose. CITI's registration instructions are a
  /// PDF that is not the course, and HSI courses are found by catalog search
  /// rather than by URL, so for those this is the only usable link.
  registrationUrl String?
  description     String?
  /// null → never expires. 12 → annual.
  renewalMonths   Int?
  /// The author-uploaded sample certificate, so a learner knows what to submit.
  /// Lives in the bot's Drive; served through the same authenticated proxy as a
  /// real certificate so there is one code path.
  exampleFileId   String?
  exampleFileName String?
  exampleMimeType String?
  createdById     String
  createdBy       Member    @relation("TrainingCreator", fields: [createdById], references: [id])
  /// Soft delete. An entry referenced by a historical certificate must never be
  /// hard-deleted, or the certificate loses the name of what it certifies.
  archivedAt      DateTime?
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  sections     CourseSection[]
  certificates TrainingCertificate[]

  @@index([archivedAt])
}

/// One learner's certificate submission.
///
/// One row PER ATTEMPT — the same idiom as CourseWorkSubmission. Review updates
/// `status` on an existing row, but a resubmission always creates a new one, so
/// the attempt history survives a disputed rejection.
model TrainingCertificate {
  id             String             @id @default(cuid())
  trainingId     String
  training       Training           @relation(fields: [trainingId], references: [id])
  memberId       String
  member         Member             @relation("TrainingCertificateMember", fields: [memberId], references: [id], onDelete: Cascade)
  /// Which course section it was uploaded from, if any. Nullable so a
  /// certificate can outlive the course that collected it.
  sectionId      String?
  section        CourseSection?     @relation(fields: [sectionId], references: [id], onDelete: SetNull)

  /// The file is RETAINED, unlike CourseWorkSubmission which discards it after
  /// text extraction. It stays private in the bot's Drive — this fileId is NEVER
  /// passed to makeDriveFilePublic. Serving goes through the authenticated proxy.
  driveFileId    String
  fileName       String
  fileMimeType   String
  fileSize       Int

  /// The date printed on the certificate, entered by the member.
  completedOn    DateTime
  /// Server-computed at submission: completedOn + training.renewalMonths. Null
  /// when the training never expires. SNAPSHOTTED, not derived on read — editing
  /// a registry entry's renewalMonths later must not silently re-date every
  /// certificate already issued under the old period.
  expiresOn      DateTime?

  status         TrainingCertStatus @default(PENDING)
  reviewedById   String?
  reviewedBy     Member?            @relation("TrainingCertificateReviewer", fields: [reviewedById], references: [id], onDelete: SetNull)
  reviewedAt     DateTime?
  /// Required on REJECTED — the member is told why.
  reviewNote     String?
  /// Set by the expiry cron so one threshold crossing nags exactly once.
  lastRemindedAt DateTime?
  createdAt      DateTime           @default(now())

  @@index([trainingId, memberId])
  @@index([status])
  @@index([status, expiresOn])
}
```

- [ ] **Step 5: Add `trainingId` to `CourseSection`**

In `model CourseSection` (~line 2013), add the field after `assignmentConfig` and the relation
alongside the others. A real foreign key, **not** a `trainingConfig` JSON column — the registry
is shared across sections, which JSON cannot express:

```prisma
  // TRAINING: a foreign key into the shared Training registry, deliberately NOT
  // a `trainingConfig` JSON column like the kinds above. Those columns hold
  // per-section configuration; a Training row is shared BETWEEN sections and
  // courses, so it has to be relational. Required-vs-optional rides on the
  // existing `isRequired`, so a TRAINING section needs no config column at all.
  trainingId    String?
  training      Training?         @relation(fields: [trainingId], references: [id])
```

And in the relation block of the same model, beside `workSubmissions`:

```prisma
  trainingCertificates TrainingCertificate[]
```

And add to the index list at the bottom of the model:

```prisma
  @@index([trainingId])
```

- [ ] **Step 6: Add the three back-relations to `Member`**

In `model Member`, beside the other relation fields, add:

```prisma
  trainingsCreated        Training[]            @relation("TrainingCreator")
  trainingCertificates    TrainingCertificate[] @relation("TrainingCertificateMember")
  trainingCertsReviewed   TrainingCertificate[] @relation("TrainingCertificateReviewer")
```

- [ ] **Step 7: Validate the schema before generating a migration**

Run: `cd backend && npx prisma validate`
Expected: `The schema at prisma\schema.prisma is valid 🚀`

If it reports a missing opposite relation field, you missed one of Step 5's or Step 6's
back-relations. Fix and re-run before generating SQL.

- [ ] **Step 8: Generate and apply the migration**

Run: `cd backend && npx prisma migrate dev --name lab_training_certifications`
Expected: a new folder under `prisma/migrations/`, then
`Your database is now in sync with your schema.` and `Generated Prisma Client`.

- [ ] **Step 9: Confirm the generated SQL adds enum values rather than recreating enums**

Run: `cd backend && cat prisma/migrations/*lab_training_certifications/migration.sql`
Expected: `ALTER TYPE "CourseSectionKind" ADD VALUE 'TRAINING';` and two
`ALTER TYPE "NotificationType" ADD VALUE` lines, plus `CREATE TABLE "Training"` and
`CREATE TABLE "TrainingCertificate"`.

If instead you see the enum being dropped and recreated, stop — that would break existing rows.

- [ ] **Step 10: Typecheck**

Run: `cd backend && npx tsc --noEmit`
Expected: no output (exit 0).

- [ ] **Step 11: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations
git commit -m "feat(trainings): schema for the training registry and certificates"
```

<details>
<summary><b>Paste-able prompt for Phase 1</b></summary>

```
Implement Phase 1 of docs/superpowers/plans/2026-08-25-lab-training-certifications.md
(schema and migration). Read that phase and the design doc it links before starting.

Context you need:
- backend/ is Prisma + PostgreSQL. Migration command: cd backend && npx prisma migrate dev
- The codebase ALREADY uses "training" for an unrelated thing: the walkthrough sandbox
  "training project" (POST /api/training-project, tourConfig.requiresTrainingProject,
  EXCLUDE_TRAINING in scheduler.ts). The new Training model is a safety-training catalog
  entry. Do not merge or rename either. Keep the schema comments that say so.
- Do not touch any other model.

Do only Phase 1. Stop after its commit and report what the generated migration.sql contains.
```
</details>

---

# Phase 2 — `trainingService.ts` pure logic and tests

**Goal:** Expiry arithmetic, status derivation, and input validation exist and are tested. No
Prisma, no routes.

**Files:**
- Create: `backend/src/services/trainingService.ts`
- Create: `backend/src/services/trainingService.test.ts`

- [ ] **Step 1: Write the failing test**

Create `backend/src/services/trainingService.test.ts`:

```ts
// Pure-logic unit tests for trainingService. No DB required.
// Run: cd backend && npx tsx src/services/trainingService.test.ts
//
// Excluded from the production build (tsconfig `exclude` covers *.test.ts).
// Same inline assertion harness as assignmentService.test.ts.

import { computeExpiry, deriveStatus, sanitizeTrainingInput } from "./trainingService.js";

let passed = 0, failed = 0;
function check(name: string, cond: boolean) {
  if (cond) passed++; else { failed++; console.error(`  ✗ ${name}`); }
}

const utc = (s: string) => new Date(`${s}T00:00:00.000Z`);
const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

console.log("computeExpiry — renewal arithmetic");
{
  check("null renewal never expires", computeExpiry(utc("2026-08-25"), null) === null);
  check("zero renewal never expires", computeExpiry(utc("2026-08-25"), 0) === null);
  check("12 months lands the same day next year",
    iso(computeExpiry(utc("2026-08-25"), 12)) === "2027-08-25");
  check("crosses a year boundary",
    iso(computeExpiry(utc("2026-11-15"), 3)) === "2027-02-15");

  // Month arithmetic must CLAMP, not overflow. 31 Jan + 1 month is 28 Feb, and
  // naive Date math would silently produce 3 March.
  check("31 Jan + 1 month clamps to 28 Feb",
    iso(computeExpiry(utc("2027-01-31"), 1)) === "2027-02-28");
  check("29 Feb + 12 months clamps to 28 Feb",
    iso(computeExpiry(utc("2028-02-29"), 12)) === "2029-02-28");
  check("31 Aug + 1 month clamps to 30 Sep",
    iso(computeExpiry(utc("2026-08-31"), 1)) === "2026-09-30");

  // End of day, so a certificate is valid through the whole of its expiry date.
  const e = computeExpiry(utc("2026-08-25"), 12)!;
  check("expiry is end of day", e.getUTCHours() === 23 && e.getUTCMinutes() === 59);
}

console.log("deriveStatus — the four-test cascade, in order");
{
  const now = utc("2026-08-25");
  const cert = (
    status: "PENDING" | "APPROVED" | "REJECTED",
    expiresOn: Date | null,
    createdAt = utc("2026-01-01")
  ) => ({ status, expiresOn, createdAt });

  check("no certificates at all", deriveStatus([], now) === "NOT_COMPLETED");
  check("only rejected reads as not completed",
    deriveStatus([cert("REJECTED", null)], now) === "NOT_COMPLETED");
  check("pending only", deriveStatus([cert("PENDING", null)], now) === "PENDING_REVIEW");
  check("approved, never expires",
    deriveStatus([cert("APPROVED", null)], now) === "UP_TO_DATE");
  check("approved, not yet expired",
    deriveStatus([cert("APPROVED", utc("2026-12-01"))], now) === "UP_TO_DATE");
  check("approved, past expiry",
    deriveStatus([cert("APPROVED", utc("2026-08-01"))], now) === "EXPIRED");

  // The two cases the ORDER of the tests exists for.
  check("early renewal: unexpired approval plus newer pending stays UP_TO_DATE",
    deriveStatus(
      [cert("APPROVED", utc("2026-12-01")), cert("PENDING", null, utc("2026-08-20"))],
      now
    ) === "UP_TO_DATE");
  check("lapsed and resubmitted reads PENDING_REVIEW, not EXPIRED",
    deriveStatus(
      [cert("APPROVED", utc("2026-08-01")), cert("PENDING", null, utc("2026-08-20"))],
      now
    ) === "PENDING_REVIEW");

  // Boundary: expiry is end of day, so the expiry date itself is still valid.
  const endOfDay = new Date("2026-08-25T23:59:59.999Z");
  check("valid through the whole expiry day",
    deriveStatus([cert("APPROVED", endOfDay)], new Date("2026-08-25T12:00:00.000Z")) === "UP_TO_DATE");
}

console.log("sanitizeTrainingInput — validation");
{
  const ok = sanitizeTrainingInput({
    name: "  Bloodborne Pathogens  ",
    providerName: "Purdue EHS — HSI Platform",
    courseUrl: "https://www.purdue.edu/ehps/rem/training/index.html",
    renewalMonths: 12,
  });
  check("valid input is accepted", ok.ok === true);
  check("name is trimmed", ok.ok === true && ok.value.name === "Bloodborne Pathogens");
  check("slug is derived", ok.ok === true && ok.value.slug === "bloodborne-pathogens");
  check("renewalMonths survives", ok.ok === true && ok.value.renewalMonths === 12);

  check("missing name rejected",
    sanitizeTrainingInput({ providerName: "CITI Program" }).ok === false);
  check("missing provider rejected",
    sanitizeTrainingInput({ name: "Laser Safety" }).ok === false);

  // A javascript: URL in a field the learner clicks is the whole reason this
  // check exists.
  check("javascript: url rejected",
    sanitizeTrainingInput({
      name: "X", providerName: "Y", courseUrl: "javascript:alert(1)",
    }).ok === false);
  check("ftp url rejected",
    sanitizeTrainingInput({
      name: "X", providerName: "Y", courseUrl: "ftp://example.com/a",
    }).ok === false);

  const blank = sanitizeTrainingInput({ name: "X", providerName: "Y", courseUrl: "" });
  check("empty url becomes null", blank.ok === true && blank.value.courseUrl === null);

  const clamped = sanitizeTrainingInput({ name: "X", providerName: "Y", renewalMonths: 999 });
  check("absurd renewal rejected", clamped.ok === false);
  const zero = sanitizeTrainingInput({ name: "X", providerName: "Y", renewalMonths: 0 });
  check("zero renewal becomes null", zero.ok === true && zero.value.renewalMonths === null);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && npx tsx src/services/trainingService.test.ts`
Expected: FAIL — `Cannot find module './trainingService.js'`.

- [ ] **Step 3: Write the implementation**

Create `backend/src/services/trainingService.ts`:

```ts
/**
 * Safety-training catalog logic.
 *
 * NOT the walkthrough "training project" (POST /api/training-project,
 * tourConfig.requiresTrainingProject). Unrelated concepts that share a word.
 *
 * Everything above the `── Persistence ──` divider is pure and unit-tested in
 * trainingService.test.ts. Keep it that way: the expiry arithmetic and the
 * status cascade are the two things worth testing, and neither needs a database.
 */

export type TrainingStatus =
  | "UP_TO_DATE"
  | "PENDING_REVIEW"
  | "EXPIRED"
  | "NOT_COMPLETED";

export interface CertLike {
  status: "PENDING" | "APPROVED" | "REJECTED";
  expiresOn: Date | null;
  createdAt: Date;
}

/** Longest renewal period an author may set, in months. */
const MAX_RENEWAL_MONTHS = 120;

/**
 * completedOn + renewalMonths, clamped to the last day of the target month and
 * pinned to end-of-day UTC.
 *
 * Clamping matters: naive month arithmetic turns 31 January + 1 month into
 * 3 March, which would hand someone two extra days of validity and produce a
 * date that does not exist on their certificate's renewal schedule.
 *
 * End-of-day matters: a certificate should be valid through the whole of its
 * expiry date, not expire at midnight as that day begins.
 */
export function computeExpiry(completedOn: Date, renewalMonths: number | null): Date | null {
  if (renewalMonths == null || renewalMonths <= 0) return null;

  const day = completedOn.getUTCDate();
  const target = new Date(Date.UTC(
    completedOn.getUTCFullYear(),
    completedOn.getUTCMonth() + renewalMonths,
    1
  ));
  // Day 0 of the following month is the last day of the target month.
  const lastDayOfTarget = new Date(Date.UTC(
    target.getUTCFullYear(),
    target.getUTCMonth() + 1,
    0
  )).getUTCDate();

  return new Date(Date.UTC(
    target.getUTCFullYear(),
    target.getUTCMonth(),
    Math.min(day, lastDayOfTarget),
    23, 59, 59, 999
  ));
}

/**
 * A member's standing for one training, derived from their certificate rows.
 *
 * THE ORDER OF THESE FOUR TESTS IS THE SPECIFICATION, not an implementation
 * detail. It is what makes the two interesting cases come out right:
 *
 *   - Early renewal. An unexpired approval plus a newer pending resubmission is
 *     UP_TO_DATE, not PENDING_REVIEW — someone who renews a month early is
 *     still compliant today.
 *   - Lapsed and resubmitted. An expired approval plus a newer pending is
 *     PENDING_REVIEW, not EXPIRED — they have done their part, so the yellow
 *     warning should stop nagging them and the queue should show it is the
 *     admin's turn.
 */
export function deriveStatus(certs: CertLike[], now: Date): TrainingStatus {
  const approved = certs.filter((c) => c.status === "APPROVED");
  if (approved.some((c) => c.expiresOn == null || c.expiresOn.getTime() > now.getTime())) {
    return "UP_TO_DATE";
  }
  if (certs.some((c) => c.status === "PENDING")) return "PENDING_REVIEW";
  if (approved.length > 0) return "EXPIRED";
  return "NOT_COMPLETED";
}

export interface TrainingInput {
  slug: string;
  name: string;
  providerName: string;
  providerUrl: string | null;
  courseUrl: string | null;
  registrationUrl: string | null;
  description: string | null;
  renewalMonths: number | null;
}

export type SanitizeResult =
  | { ok: true; value: TrainingInput }
  | { ok: false; error: string };

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/**
 * Only http(s). A `javascript:` URL here would render as a link the learner is
 * told to click, which is the whole reason the scheme is checked rather than
 * the string merely being non-empty.
 */
function cleanUrl(v: unknown): string | null | undefined {
  if (v == null || v === "") return null;
  if (typeof v !== "string") return undefined;
  const trimmed = v.trim();
  if (!trimmed) return null;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return undefined;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return undefined;
  return parsed.toString();
}

export function sanitizeTrainingInput(body: unknown): SanitizeResult {
  const b = (body ?? {}) as Record<string, unknown>;

  const name = typeof b.name === "string" ? b.name.trim() : "";
  if (!name) return { ok: false, error: "A training needs a name" };

  const providerName = typeof b.providerName === "string" ? b.providerName.trim() : "";
  if (!providerName) return { ok: false, error: "A training needs a provider" };

  const urls: Record<string, string | null> = {};
  for (const key of ["providerUrl", "courseUrl", "registrationUrl"] as const) {
    const cleaned = cleanUrl(b[key]);
    if (cleaned === undefined) {
      return { ok: false, error: `${key} must be an http(s) URL` };
    }
    urls[key] = cleaned;
  }

  let renewalMonths: number | null = null;
  if (b.renewalMonths != null && b.renewalMonths !== "") {
    const n = Number(b.renewalMonths);
    if (!Number.isInteger(n) || n < 0 || n > MAX_RENEWAL_MONTHS) {
      return { ok: false, error: `renewalMonths must be a whole number of months, 0–${MAX_RENEWAL_MONTHS}` };
    }
    // 0 and null both mean "never expires"; normalize to null so the rest of the
    // code has one representation to reason about.
    renewalMonths = n === 0 ? null : n;
  }

  const slugSource = typeof b.slug === "string" && b.slug.trim() ? b.slug : name;

  return {
    ok: true,
    value: {
      slug: slugify(slugSource),
      name,
      providerName,
      providerUrl: urls.providerUrl,
      courseUrl: urls.courseUrl,
      registrationUrl: urls.registrationUrl,
      description: typeof b.description === "string" ? b.description.trim() || null : null,
      renewalMonths,
    },
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && npx tsx src/services/trainingService.test.ts`
Expected: `31 passed, 0 failed` (exact count may differ by a few if you added cases; **0 failed**
is the requirement).

- [ ] **Step 5: Typecheck**

Run: `cd backend && npx tsc --noEmit`
Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/trainingService.ts backend/src/services/trainingService.test.ts
git commit -m "feat(trainings): expiry arithmetic, status cascade, and input validation"
```

<details>
<summary><b>Paste-able prompt for Phase 2</b></summary>

```
Implement Phase 2 of docs/superpowers/plans/2026-08-25-lab-training-certifications.md
(trainingService pure logic + tests). Phase 1 is already merged, so the Prisma models exist.

Context you need:
- backend/ is ESM TypeScript. Relative imports need a .js extension even from .ts files.
- Backend tests are NOT Jest. They are tsx scripts with an inline check() harness —
  copy the shape from backend/src/services/assignmentService.test.ts.
  Run with: cd backend && npx tsx src/services/trainingService.test.ts
- Write the test FIRST, run it, watch it fail, then implement. The plan has the full code
  for both files.
- Do not import Prisma in this phase. Everything here is pure.

Do only Phase 2. Stop after its commit and paste the test output.
```
</details>

---

# Phase 3 — Registry routes and example-certificate upload

**Goal:** An author can list, create, and edit registry entries, and attach an example
certificate that any signed-in member can view.

**Files:**
- Modify: `backend/src/services/trainingService.ts` (add a `── Persistence ──` section)
- Modify: `backend/src/api/courses.ts`

- [ ] **Step 1: Add persistence helpers to `trainingService.ts`**

Append to `backend/src/services/trainingService.ts`:

```ts
// ── Persistence ──────────────────────────────────────────────
//
// Everything below touches Prisma and is therefore not unit-tested. Keep the
// logic here thin — anything worth testing belongs above the divider.

import { prisma } from "../db/prisma.js";

/** Live registry entries, alphabetical. Archived entries are excluded. */
export async function listTrainings() {
  return prisma.training.findMany({
    where: { archivedAt: null },
    orderBy: { name: "asc" },
  });
}

export async function createTraining(input: TrainingInput, createdById: string) {
  // Slug collisions are real: "Laser Safety Training" and "Laser Safety
  // Training " slugify identically. Suffix rather than fail, so an author is
  // never blocked by an invisible duplicate.
  let slug = input.slug || "training";
  const existing = await prisma.training.findMany({
    where: { slug: { startsWith: slug } },
    select: { slug: true },
  });
  const taken = new Set(existing.map((t) => t.slug));
  if (taken.has(slug)) {
    let n = 2;
    while (taken.has(`${slug}-${n}`)) n++;
    slug = `${slug}-${n}`;
  }
  return prisma.training.create({ data: { ...input, slug, createdById } });
}

export async function updateTraining(id: string, input: TrainingInput) {
  // The slug is identity once created — a course section points at the row by
  // id, but the seed script matches on slug, so churning it would make reseeding
  // create duplicates.
  const { slug: _ignored, ...rest } = input;
  return prisma.training.update({ where: { id }, data: rest });
}
```

- [ ] **Step 2: Add the multer instance and registry routes to `courses.ts`**

In `backend/src/api/courses.ts`, immediately after the existing `deckUpload` multer instance
near the top of the file, add:

```ts
// Certificates and example certificates are PDFs or photos of a printed page.
// 25 MB matches the handout route; nobody's certificate is larger.
const certUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 1 },
});
```

Then add this block **before** the `// ── Catalog ──` comment, so the literal `/trainings`
paths are registered ahead of the one-segment `GET /:id` route that would otherwise shadow them:

```ts
// ── Training registry ────────────────────────────────────────
//
// ROUTE ORDER: these literal `/trainings...` paths MUST stay above `GET /:id`
// and `GET /:slug/learn`, or Express matches "trainings" as an id.
//
// Registry writes are author-or-admin — the same bar as creating a course
// section, since creating a registry entry is something you do while authoring
// one. Reads are open to any signed-in member: a learner has to see the name and
// the link of the training they are being asked to complete.

coursesRouter.get("/trainings", async (_req: Request, res: Response) => {
  try {
    const rows = await trainingService.listTrainings();
    res.json(rows);
  } catch (error) {
    console.error("GET /outreach/courses/trainings error:", error);
    res.status(500).json({ error: "Failed to load trainings" });
  }
});

coursesRouter.post("/trainings", async (req: Request, res: Response) => {
  try {
    const parsed = trainingService.sanitizeTrainingInput(req.body);
    if (!parsed.ok) { res.status(400).json({ error: parsed.error }); return; }
    const row = await trainingService.createTraining(parsed.value, req.memberId!);
    res.status(201).json(row);
  } catch (error) {
    console.error("POST /outreach/courses/trainings error:", error);
    res.status(500).json({ error: "Failed to create that training" });
  }
});

coursesRouter.patch("/trainings/:tid", async (req: Request, res: Response) => {
  try {
    const parsed = trainingService.sanitizeTrainingInput(req.body);
    if (!parsed.ok) { res.status(400).json({ error: parsed.error }); return; }
    const row = await trainingService.updateTraining(req.params.tid as string, parsed.value);
    res.json(row);
  } catch (error) {
    console.error("PATCH /outreach/courses/trainings/:tid error:", error);
    res.status(500).json({ error: "Failed to update that training" });
  }
});

// The author's sample certificate. Uploaded through the bot account and served
// through the proxy below — never made public, so there is one serving path for
// both example and real certificates.
coursesRouter.post(
  "/trainings/:tid/example",
  certUpload.single("file"),
  async (req: Request, res: Response) => {
    try {
      if (!req.file) { res.status(400).json({ error: "file is required" }); return; }
      const { Readable } = await import("node:stream");
      const drive = await import("../services/driveService.js");
      const folderId = await drive.ensureClubPmRootFolder();
      if (!folderId) { res.status(503).json({ error: "Drive is not configured" }); return; }

      const uploaded = await drive.uploadStreamToDrive(
        Readable.from(req.file.buffer),
        req.file.mimetype,
        `example-${req.file.originalname}`,
        folderId
      );
      if (!uploaded) { res.status(502).json({ error: "Could not upload to Drive" }); return; }
      // Deliberately NOT makeDriveFilePublic — see the proxy route.

      const prev = await prisma.training.findUnique({
        where: { id: req.params.tid as string },
        select: { exampleFileId: true },
      });
      const row = await prisma.training.update({
        where: { id: req.params.tid as string },
        data: {
          exampleFileId: uploaded.fileId,
          exampleFileName: req.file.originalname,
          exampleMimeType: req.file.mimetype,
        },
      });
      // Best-effort cleanup of the file we just replaced. A failure here must not
      // fail the request — the row already points at the new file.
      if (prev?.exampleFileId) await drive.deleteDriveFile(prev.exampleFileId).catch(() => false);
      res.json(row);
    } catch (error) {
      console.error("POST /outreach/courses/trainings/:tid/example error:", error);
      res.status(500).json({ error: "Failed to attach that example" });
    }
  }
);

coursesRouter.delete("/trainings/:tid/example", async (req: Request, res: Response) => {
  try {
    const prev = await prisma.training.findUnique({
      where: { id: req.params.tid as string },
      select: { exampleFileId: true },
    });
    if (prev?.exampleFileId) {
      const drive = await import("../services/driveService.js");
      // Best-effort: a Drive delete that fails must not block clearing the
      // reference, or the row points at a file forever.
      await drive.deleteDriveFile(prev.exampleFileId).catch(() => false);
    }
    const row = await prisma.training.update({
      where: { id: req.params.tid as string },
      data: { exampleFileId: null, exampleFileName: null, exampleMimeType: null },
    });
    res.json(row);
  } catch (error) {
    console.error("DELETE /outreach/courses/trainings/:tid/example error:", error);
    res.status(500).json({ error: "Failed to remove that example" });
  }
});

// Any signed-in member — an example certificate is teaching material, and a
// learner has to see it to know what to submit.
coursesRouter.get("/trainings/:tid/example-file", async (req: Request, res: Response) => {
  try {
    const row = await prisma.training.findUnique({
      where: { id: req.params.tid as string },
      select: { exampleFileId: true, exampleFileName: true },
    });
    if (!row?.exampleFileId) { res.status(404).json({ error: "No example certificate" }); return; }
    await streamDriveFileToResponse(res, row.exampleFileId, row.exampleFileName ?? "example");
  } catch (error) {
    console.error("GET /outreach/courses/trainings/:tid/example-file error:", error);
    res.status(500).json({ error: "Failed to load that example" });
  }
});
```

- [ ] **Step 3: Add the shared streaming helper**

Add this helper **above** the `// ── Training registry ──` block (both file routes use it, and
Phase 5's certificate proxy will too):

```ts
/**
 * Stream a private Drive file to the client.
 *
 * `inline` rather than `attachment` so a PDF opens in the browser's viewer —
 * an admin reviewing twenty certificates should not end up with twenty
 * downloads. The caller is responsible for authorization BEFORE calling this.
 */
async function streamDriveFileToResponse(res: Response, fileId: string, fileName: string) {
  const drive = await import("../services/driveService.js");
  const result = await drive.streamDriveFile(fileId);
  if (!result.ok) {
    // The reason is reported rather than collapsed to a bare 404: a broken bot
    // credential takes out every certificate at once, and as a plain 404 that is
    // indistinguishable from one deleted file.
    const status = result.reason === "not-found" ? 404 : 502;
    res.status(status).json({ error: "Could not load that file", reason: result.reason });
    return;
  }
  res.setHeader("Content-Type", result.mimeType);
  res.setHeader(
    "Content-Disposition",
    `inline; filename="${fileName.replace(/["\r\n]/g, "")}"`
  );
  result.stream.on("error", (err) => {
    console.error(`[courses] certificate stream ${fileId} failed mid-flight:`, err);
    res.destroy();
  });
  result.stream.pipe(res);
}
```

- [ ] **Step 4: Add the import**

At the top of `backend/src/api/courses.ts`, beside the other service imports:

```ts
import * as trainingService from "../services/trainingService.js";
```

- [ ] **Step 5: Typecheck**

Run: `cd backend && npx tsc --noEmit`
Expected: no output.

- [ ] **Step 6: Verify route order by reading, not guessing**

Run: `cd backend && grep -n 'coursesRouter.get("/trainings\|coursesRouter.get("/:id"\|coursesRouter.get("/:slug/learn"' src/api/courses.ts`
Expected: every `/trainings` line number is **smaller** than the `/:id` and `/:slug/learn` line
numbers. If not, move the block up.

- [ ] **Step 7: Smoke-test against a running backend**

Run in one terminal: `cd backend && npm run dev`
In another, with a valid session cookie or Bearer token:

```bash
curl -s -H "Authorization: Bearer $CLUBPM_TOKEN" \
  http://localhost:3001/api/outreach/courses/trainings
```

Expected: `[]` (an empty array — no registry entries exist yet), **not** an HTML 404 and not
`{"error":"Course not found"}`. `Course not found` means `GET /:id` shadowed the route; go back
to Step 6.

- [ ] **Step 8: Commit**

```bash
git add backend/src/services/trainingService.ts backend/src/api/courses.ts
git commit -m "feat(trainings): registry CRUD and example-certificate upload"
```

<details>
<summary><b>Paste-able prompt for Phase 3</b></summary>

```
Implement Phase 3 of docs/superpowers/plans/2026-08-25-lab-training-certifications.md
(registry routes + example-certificate upload). Phases 1-2 are merged.

Context you need:
- Routes go on coursesRouter in backend/src/api/courses.ts, mounted at
  /api/outreach/courses. The router already has requireAuth applied.
- ROUTE ORDER IS LOAD-BEARING: literal /trainings paths must be registered ABOVE the
  existing GET /:id and GET /:slug/learn, or Express matches "trainings" as an id.
  Step 6 verifies this with grep — actually run it.
- ALWAYS read req.memberId, never req.session.memberId. Bearer-token clients have no session.
- Certificate files are NEVER passed to makeDriveFilePublic. They are served through the
  streaming helper this phase adds.
- Copy the upload idiom from the existing POST /sections/:sid/handout route in the same file.

Do only Phase 3. Stop after its commit and paste the Step 6 grep output and the Step 7 curl result.
```
</details>

---

# Phase 4 — Certificate submission and the learner payload

**Goal:** A member can upload a certificate from a `TRAINING` section; the section completes
immediately and the certificate is `PENDING`.

**Files:**
- Modify: `backend/src/services/trainingService.ts`
- Modify: `backend/src/services/courseProgressService.ts`
- Modify: `backend/src/api/courses.ts`

- [ ] **Step 1: Add `recordCertificate` to `trainingService.ts`**

Append to the `── Persistence ──` section:

```ts
export interface CertificateInput {
  driveFileId: string;
  fileName: string;
  fileMimeType: string;
  fileSize: number;
  completedOn: Date;
}

/**
 * Write one certificate row.
 *
 * `expiresOn` is SNAPSHOTTED from the registry's renewalMonths at submission
 * time. Deriving it on read instead would mean an author editing renewalMonths
 * silently re-dates every certificate ever issued under the old period.
 */
export async function recordCertificate(
  trainingId: string,
  memberId: string,
  sectionId: string | null,
  input: CertificateInput
) {
  const training = await prisma.training.findUnique({
    where: { id: trainingId },
    select: { renewalMonths: true },
  });
  return prisma.trainingCertificate.create({
    data: {
      trainingId,
      memberId,
      sectionId,
      driveFileId: input.driveFileId,
      fileName: input.fileName,
      fileMimeType: input.fileMimeType,
      fileSize: input.fileSize,
      completedOn: input.completedOn,
      expiresOn: computeExpiry(input.completedOn, training?.renewalMonths ?? null),
    },
  });
}

/** This member's attempts for one training, newest first. */
export async function listCertificates(trainingId: string, memberId: string) {
  return prisma.trainingCertificate.findMany({
    where: { trainingId, memberId },
    orderBy: { createdAt: "desc" },
    include: { reviewedBy: { select: { id: true, displayName: true } } },
  });
}
```

- [ ] **Step 2: Add `submitCertificate` to `courseProgressService.ts`**

Add near `submitWork` (~line 1366), after it:

```ts
/**
 * Record a certificate for a TRAINING section and complete it.
 *
 * The section completes on UPLOAD, not on approval — a slow admin must never
 * block a member's course progress. The certificate stays PENDING and the
 * member's compliance status reads PENDING_REVIEW until someone reviews it, so
 * the roster still tells the truth. See design doc §2.
 */
export async function submitCertificate(
  sectionId: string,
  memberId: string,
  input: {
    driveFileId: string;
    fileName: string;
    fileMimeType: string;
    fileSize: number;
    completedOn: Date;
  }
) {
  const ctx = await requireUnlockedSection(sectionId, memberId);
  if (!ctx.ok) return { error: ctx.error, status: ctx.status };
  const { section, enrollment, progress } = ctx;

  if (section.kind !== "TRAINING") {
    return { error: "Section does not accept certificates", status: 400 } as const;
  }
  if (!section.trainingId) {
    return {
      error: "This section has no training attached yet — ask the course author to pick one",
      status: 409,
    } as const;
  }

  const now = new Date();
  if (Number.isNaN(input.completedOn.getTime())) {
    return { error: "Enter the completion date printed on your certificate", status: 400 } as const;
  }
  if (input.completedOn.getTime() > now.getTime()) {
    return { error: "That completion date is in the future", status: 400 } as const;
  }

  const trainingService = await import("./trainingService.js");
  const certificate = await trainingService.recordCertificate(
    section.trainingId,
    memberId,
    sectionId,
    input
  );

  const firstCompletion = progress.status !== "COMPLETED";
  if (firstCompletion) {
    await prisma.courseSectionProgress.update({
      where: { id: progress.id },
      data: { status: "COMPLETED", completedAt: now },
    });
  }
  await prisma.courseEnrollment.update({
    where: { id: enrollment.id },
    data: { lastSectionId: sectionId },
  });

  const effects = firstCompletion
    ? await applyCourseSideEffects(memberId, { courseId: section.courseId, sectionId })
    : { actorReward: null, progressMilestones: [] as CourseProgressMilestone[] };

  return { certificate, alreadyComplete: !firstCompletion, ...effects };
}
```

- [ ] **Step 3: Refuse `completeSection` for `TRAINING`**

In `completeSection` (~line 925), beside the existing `LIT_REVIEW` refusal, add:

```ts
  if (section.kind === "TRAINING") {
    return {
      error: "Training sections complete by uploading a certificate",
      status: 400,
    } as const;
  }
```

- [ ] **Step 4: Put the training on the learner payload**

In `getLearnerCourse`, the section-building loop needs the registry row. First widen the
`prisma.courseSection.findMany` select/include that feeds `sections` to include the relation —
find the query that loads sections for the course and add:

```ts
    include: { training: true },
```

(If it uses `select`, add `training: { select: { id: true, name: true, providerName: true,
providerUrl: true, courseUrl: true, registrationUrl: true, description: true,
renewalMonths: true, exampleFileId: true, exampleFileName: true, exampleMimeType: true } }`
instead.)

Then inside the `if (unlocked) { ... }` block, beside the `ASSIGNMENT` branch (~line 547):

```ts
      if (s.kind === "TRAINING") {
        // Every registry field is learner-safe — unlike litConfig and
        // assignmentConfig there is NO author-only secret on a Training row, so
        // there is deliberately no sanitizer here. Do not add one "for
        // symmetry"; the reference answer this would be hiding does not exist.
        // `exampleFileId` is included because the learner needs it to build the
        // example-file URL; the file itself is still gated by the proxy route.
        out.training = s.training ?? null;
      }
```

- [ ] **Step 5: Add the submission routes to `courses.ts`**

Add after the existing `GET /sections/:sid/work` route:

```ts
// A TRAINING certificate. Multipart because the file is retained, and the
// completion date rides alongside it as a form field.
//
// Carries the reward envelope like every other completion route, so RewardFlux
// and the quest toasts fire with no extra frontend wiring.
coursesRouter.post(
  "/sections/:sid/certificate",
  certUpload.single("file"),
  async (req: Request, res: Response) => {
    const requestStartedAt = new Date();
    try {
      if (!req.file) { res.status(400).json({ error: "Attach your certificate" }); return; }
      const completedOnRaw = (req.body as { completedOn?: string })?.completedOn;
      if (!completedOnRaw) {
        res.status(400).json({ error: "Enter the completion date printed on your certificate" });
        return;
      }
      // Parsed as UTC midnight so a member in Indiana and the server agree on
      // which day the certificate says.
      const completedOn = new Date(`${String(completedOnRaw).slice(0, 10)}T00:00:00.000Z`);

      const { Readable } = await import("node:stream");
      const drive = await import("../services/driveService.js");
      const folderId = await drive.ensureClubPmRootFolder();
      if (!folderId) { res.status(503).json({ error: "Drive is not configured" }); return; }

      const uploaded = await drive.uploadStreamToDrive(
        Readable.from(req.file.buffer),
        req.file.mimetype,
        `cert-${req.memberId}-${Date.now()}-${req.file.originalname}`,
        folderId
      );
      if (!uploaded) { res.status(502).json({ error: "Could not upload to Drive" }); return; }
      // Deliberately NOT makeDriveFilePublic: a certificate carries the member's
      // real name and is served only through GET /certificates/:cid/file.

      const result = await progressService.submitCertificate(
        req.params.sid as string,
        req.memberId!,
        {
          driveFileId: uploaded.fileId,
          fileName: req.file.originalname,
          fileMimeType: req.file.mimetype,
          fileSize: req.file.size,
          completedOn,
        }
      );
      if (isServiceError(result)) {
        // The row was never written, so the uploaded file is garbage. Clean it up
        // rather than leaving an orphan in the bot's Drive on every bad request.
        await drive.deleteDriveFile(uploaded.fileId).catch(() => false);
        res.status(result.status).json({ error: result.error });
        return;
      }
      res.json(
        await withRewardEnvelope(
          req.memberId!,
          requestStartedAt,
          { ok: true, certificate: result.certificate, alreadyComplete: result.alreadyComplete },
          result
        )
      );
    } catch (error) {
      console.error("POST /outreach/courses/sections/:sid/certificate error:", error);
      res.status(500).json({ error: "Failed to save your certificate" });
    }
  }
);

// The caller's own attempts for this section's training.
coursesRouter.get("/sections/:sid/certificates", async (req: Request, res: Response) => {
  try {
    const section = await prisma.courseSection.findUnique({
      where: { id: req.params.sid as string },
      select: { trainingId: true },
    });
    if (!section?.trainingId) { res.json({ certificates: [] }); return; }
    const rows = await trainingService.listCertificates(section.trainingId, req.memberId!);
    res.json({ certificates: rows });
  } catch (error) {
    console.error("GET /outreach/courses/sections/:sid/certificates error:", error);
    res.status(500).json({ error: "Failed to load your certificates" });
  }
});
```

- [ ] **Step 6: Typecheck and build**

Run: `cd backend && npx tsc --noEmit`
Expected: no output.

- [ ] **Step 7: Commit**

```bash
git add backend/src/services/trainingService.ts backend/src/services/courseProgressService.ts backend/src/api/courses.ts
git commit -m "feat(trainings): certificate submission completes the section on upload"
```

<details>
<summary><b>Paste-able prompt for Phase 4</b></summary>

```
Implement Phase 4 of docs/superpowers/plans/2026-08-25-lab-training-certifications.md
(certificate submission + learner payload). Phases 1-3 are merged.

Context you need:
- ALWAYS read req.memberId, never req.session.memberId.
- The section completes on UPLOAD, not on approval — a slow admin must not block course
  progress. The certificate stays PENDING.
- Do NOT clear rewardGrantedAt anywhere. It is an idempotency gate.
- Certificate files are NEVER passed to makeDriveFilePublic.
- Completion routes must merge the reward envelope via withRewardEnvelope() — that is what
  makes RewardFlux and the quest toasts fire. Copy the shape from the existing
  POST /sections/:sid/work route in the same file.
- In getLearnerCourse, the training goes on the payload only inside the `if (unlocked)` block,
  same as every other kind's config. There is deliberately NO sanitizer for it — read the
  comment in the plan and keep it.

Do only Phase 4. Stop after its commit.
```
</details>

---

# Phase 5 — Review queue, decisions, and the file proxy

**Goal:** An admin can see pending certificates, open the file, and approve or reject. Rejection
reopens the section and tells the member why.

**Files:**
- Modify: `backend/src/services/trainingService.ts`
- Modify: `backend/src/api/courses.ts`

- [ ] **Step 1: Add `reviewCertificate` and the status query to `trainingService.ts`**

Append to the `── Persistence ──` section:

```ts
/** Everything awaiting review, oldest first — a queue, not a feed. */
export async function listPendingCertificates() {
  return prisma.trainingCertificate.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
    include: {
      training: { select: { id: true, name: true, providerName: true, renewalMonths: true } },
      member: { select: { id: true, displayName: true, avatarUrl: true } },
      section: { select: { id: true, title: true, courseId: true } },
    },
  });
}

export async function countPendingCertificates() {
  return prisma.trainingCertificate.count({ where: { status: "PENDING" } });
}

/**
 * Approve or reject one certificate.
 *
 * On APPROVE the admin may correct `completedOn` — the member typed it off a
 * scan and the admin is looking at the same scan. Correcting it recomputes
 * `expiresOn` from the registry's CURRENT renewalMonths, which is the one place
 * a re-derivation is right: someone is deliberately re-deciding this row.
 */
export async function reviewCertificate(
  certificateId: string,
  reviewerId: string,
  decision: "APPROVED" | "REJECTED",
  note: string | null,
  correctedCompletedOn: Date | null
) {
  const cert = await prisma.trainingCertificate.findUnique({
    where: { id: certificateId },
    include: { training: { select: { renewalMonths: true, name: true } } },
  });
  if (!cert) return { error: "Certificate not found", status: 404 } as const;
  if (cert.status !== "PENDING") {
    return { error: "That certificate has already been reviewed", status: 409 } as const;
  }
  if (decision === "REJECTED" && !note) {
    return { error: "Say why you are rejecting it — the member sees this", status: 400 } as const;
  }

  const completedOn = correctedCompletedOn ?? cert.completedOn;
  const updated = await prisma.trainingCertificate.update({
    where: { id: certificateId },
    data: {
      status: decision,
      reviewedById: reviewerId,
      reviewedAt: new Date(),
      reviewNote: note,
      completedOn,
      expiresOn:
        decision === "APPROVED"
          ? computeExpiry(completedOn, cert.training.renewalMonths)
          : cert.expiresOn,
      // A fresh decision starts a fresh reminder cycle.
      lastRemindedAt: null,
    },
  });
  return { certificate: updated, trainingName: cert.training.name };
}

/** Every live training with this member's derived standing. */
export async function getMemberTrainingStatuses(memberId: string) {
  const [trainings, certs] = await Promise.all([
    prisma.training.findMany({ where: { archivedAt: null }, orderBy: { name: "asc" } }),
    prisma.trainingCertificate.findMany({
      where: { memberId },
      select: { trainingId: true, status: true, expiresOn: true, createdAt: true },
    }),
  ]);
  const now = new Date();
  const byTraining = new Map<string, CertLike[]>();
  for (const c of certs) {
    const list = byTraining.get(c.trainingId) ?? [];
    list.push(c);
    byTraining.set(c.trainingId, list);
  }
  return trainings.map((t) => {
    const mine = byTraining.get(t.id) ?? [];
    const newestApproved = mine
      .filter((c) => c.status === "APPROVED")
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
    return {
      trainingId: t.id,
      name: t.name,
      providerName: t.providerName,
      renewalMonths: t.renewalMonths,
      status: deriveStatus(mine, now),
      expiresOn: newestApproved?.expiresOn ?? null,
    };
  });
}
```

- [ ] **Step 2: Add `reopenSectionForMember` to `courseProgressService.ts`**

Add after `submitCertificate`:

```ts
/**
 * Flip a completed section back to IN_PROGRESS so it accepts a new submission.
 *
 * Used when a certificate is rejected and when one expires.
 *
 * IT DOES NOT TOUCH `rewardGrantedAt`, on the progress row or the enrollment.
 * Those are idempotency gates exactly like Task.rewardGrantedAt — clearing one
 * would re-grant course XP on every annual renewal, forever. `status` and
 * `completedAt` are the only fields this is allowed to write.
 */
export async function reopenSectionForMember(sectionId: string, memberId: string) {
  const enrollment = await prisma.courseEnrollment.findFirst({
    where: { memberId, course: { sections: { some: { id: sectionId } } } },
    select: { id: true },
  });
  if (!enrollment) return false;
  const progress = await prisma.courseSectionProgress.findUnique({
    where: { enrollmentId_sectionId: { enrollmentId: enrollment.id, sectionId } },
    select: { id: true, status: true },
  });
  if (!progress || progress.status !== "COMPLETED") return false;
  await prisma.courseSectionProgress.update({
    where: { id: progress.id },
    data: { status: "IN_PROGRESS", completedAt: null },
  });
  return true;
}
```

- [ ] **Step 3: Add the review routes to `courses.ts`**

Add after the `GET /sections/:sid/certificates` route:

```ts
// ── Certificate review (admin) ───────────────────────────────

coursesRouter.get("/certificates/pending", async (req: Request, res: Response) => {
  try {
    if (!(await isAdmin(req.memberId))) { res.status(403).json({ error: "Forbidden" }); return; }
    const rows = await trainingService.listPendingCertificates();
    res.json({ certificates: rows, count: rows.length });
  } catch (error) {
    console.error("GET /outreach/courses/certificates/pending error:", error);
    res.status(500).json({ error: "Failed to load the review queue" });
  }
});

coursesRouter.post("/certificates/:cid/review", async (req: Request, res: Response) => {
  try {
    if (!(await isAdmin(req.memberId))) { res.status(403).json({ error: "Forbidden" }); return; }
    const body = req.body as { decision?: string; note?: string; completedOn?: string };
    if (body.decision !== "APPROVED" && body.decision !== "REJECTED") {
      res.status(400).json({ error: "decision must be APPROVED or REJECTED" });
      return;
    }
    const corrected = body.completedOn
      ? new Date(`${String(body.completedOn).slice(0, 10)}T00:00:00.000Z`)
      : null;
    if (corrected && Number.isNaN(corrected.getTime())) {
      res.status(400).json({ error: "completedOn is not a date" });
      return;
    }

    const result = await trainingService.reviewCertificate(
      req.params.cid as string,
      req.memberId!,
      body.decision,
      body.note?.trim() || null,
      corrected
    );
    if (isServiceError(result)) {
      res.status(result.status).json({ error: result.error });
      return;
    }

    const cert = result.certificate;
    if (body.decision === "REJECTED" && cert.sectionId) {
      await progressService.reopenSectionForMember(cert.sectionId, cert.memberId);
    }

    // Tell the member either way. An approval that lands silently reads as "still
    // waiting" and generates a Slack question a week later.
    const { createNotification } = await import("../services/notificationCrud.js");
    const message =
      body.decision === "APPROVED"
        ? `Your ${result.trainingName} certificate was approved.`
        : `Your ${result.trainingName} certificate needs another look: ${cert.reviewNote}`;
    await createNotification({
      type: "TRAINING_CERT_REVIEWED",
      recipientId: cert.memberId,
      actorId: req.memberId!,
      message,
      metadata: { certificateId: cert.id, sectionId: cert.sectionId, decision: body.decision },
    });
    const member = await prisma.member.findUnique({
      where: { id: cert.memberId },
      select: { slackId: true },
    });
    if (member?.slackId) {
      const { queueDm } = await import("../services/dmBatcher.js");
      queueDm(member.slackId, message);
    }

    res.json({ certificate: cert });
  } catch (error) {
    console.error("POST /outreach/courses/certificates/:cid/review error:", error);
    res.status(500).json({ error: "Failed to record that decision" });
  }
});

// The authenticated proxy. This is the ONLY way a certificate file is served —
// the Drive file is never made public, so a leaked URL is not a leaked
// certificate.
coursesRouter.get("/certificates/:cid/file", async (req: Request, res: Response) => {
  try {
    const cert = await prisma.trainingCertificate.findUnique({
      where: { id: req.params.cid as string },
      select: { memberId: true, driveFileId: true, fileName: true },
    });
    if (!cert) { res.status(404).json({ error: "Certificate not found" }); return; }
    // Re-read the admin flag from the database; never trust the client's claim.
    const allowed = cert.memberId === req.memberId || (await isAdmin(req.memberId));
    if (!allowed) { res.status(403).json({ error: "Forbidden" }); return; }
    await streamDriveFileToResponse(res, cert.driveFileId, cert.fileName);
  } catch (error) {
    console.error("GET /outreach/courses/certificates/:cid/file error:", error);
    res.status(500).json({ error: "Failed to load that certificate" });
  }
});

// The caller's own standing across every live training. Backs the Profile strip.
coursesRouter.get("/trainings/my-status", async (req: Request, res: Response) => {
  try {
    const rows = await trainingService.getMemberTrainingStatuses(req.memberId!);
    res.json({ trainings: rows });
  } catch (error) {
    console.error("GET /outreach/courses/trainings/my-status error:", error);
    res.status(500).json({ error: "Failed to load your training status" });
  }
});
```

- [ ] **Step 4: Fix route order for `/trainings/my-status`**

`GET /trainings/:tid/example-file` is three segments and `GET /trainings/my-status` is two, so
they cannot collide — but `GET /trainings/:tid` does not exist, so nothing shadows it. Verify:

Run: `cd backend && grep -n 'coursesRouter.get("/trainings' src/api/courses.ts`
Expected: `/trainings`, `/trainings/:tid/example-file`, and `/trainings/my-status` — and **no**
`coursesRouter.get("/trainings/:tid"` line. If someone later adds one, it must go *below*
`my-status`.

- [ ] **Step 5: Typecheck**

Run: `cd backend && npx tsc --noEmit`
Expected: no output.

- [ ] **Step 6: Verify the proxy refuses a third party**

With the backend running, as a **non-admin** member who does not own certificate `$CID`:

```bash
curl -s -o /dev/null -w "%{http_code}\n" \
  -H "Authorization: Bearer $OTHER_MEMBER_TOKEN" \
  http://localhost:3001/api/outreach/courses/certificates/$CID/file
```

Expected: `403`. If it returns `200`, the authorization check is wrong — stop and fix it before
committing. This is the check the whole private-Drive decision rests on.

- [ ] **Step 7: Commit**

```bash
git add backend/src/services/trainingService.ts backend/src/services/courseProgressService.ts backend/src/api/courses.ts
git commit -m "feat(trainings): review queue, decisions, and the authenticated file proxy"
```

<details>
<summary><b>Paste-able prompt for Phase 5</b></summary>

```
Implement Phase 5 of docs/superpowers/plans/2026-08-25-lab-training-certifications.md
(review queue, decisions, file proxy). Phases 1-4 are merged.

Context you need:
- ALWAYS read req.memberId, never req.session.memberId.
- reopenSectionForMember MUST NOT touch rewardGrantedAt on either the progress row or the
  enrollment. Those are idempotency gates; clearing one re-grants course XP on every annual
  renewal. Only status and completedAt may be written.
- GET /certificates/:cid/file is the only way a certificate is ever served. Re-read the
  admin flag from the DB inside the handler. Step 6 verifies a third party gets 403 —
  actually run it, it is the check the whole privacy design rests on.
- Notification + Slack DM helpers: createNotification from services/notificationCrud.js
  (typed { type, recipientId, actorId?, message, metadata? }) and queueDm(slackId, message)
  from services/dmBatcher.js.

Do only Phase 5. Stop after its commit and paste the Step 6 status code.
```
</details>

---

# Phase 6 — Expiry cron

**Goal:** People are nagged 30 days out, 7 days out, and once lapsed. Lapsed certificates reopen
their section.

**Files:**
- Modify: `backend/src/services/trainingService.ts`
- Modify: `backend/src/slack/scheduler.ts`

- [ ] **Step 1: Add `findExpiringCertificates` to `trainingService.ts`**

Append to the `── Persistence ──` section:

```ts
export type ExpiryThreshold = "T30" | "T7" | "LAPSED";

/**
 * Which reminder, if any, this certificate is due for.
 *
 * Pure so the threshold arithmetic can be reasoned about without a database.
 * `lastRemindedAt` is compared against the moment the threshold was CROSSED, not
 * against "now": that is what makes each threshold fire exactly once, rather
 * than every morning for thirty days running.
 */
export function dueReminder(
  expiresOn: Date,
  lastRemindedAt: Date | null,
  now: Date
): ExpiryThreshold | null {
  const DAY = 86_400_000;
  const msLeft = expiresOn.getTime() - now.getTime();

  let threshold: ExpiryThreshold;
  let crossedAt: number;
  if (msLeft <= 0) {
    threshold = "LAPSED";
    crossedAt = expiresOn.getTime();
  } else if (msLeft <= 7 * DAY) {
    threshold = "T7";
    crossedAt = expiresOn.getTime() - 7 * DAY;
  } else if (msLeft <= 30 * DAY) {
    threshold = "T30";
    crossedAt = expiresOn.getTime() - 30 * DAY;
  } else {
    return null;
  }

  if (lastRemindedAt && lastRemindedAt.getTime() >= crossedAt) return null;
  return threshold;
}

/**
 * Approved certificates inside the 30-day window, one per (member, training).
 *
 * The newest-per-pair filter is not cosmetic: a member who has renewed four
 * years running has four approved rows, three of them long expired, and without
 * it every one of them would generate a "lapsed" DM every single morning.
 */
export async function findExpiringCertificates(now: Date) {
  const horizon = new Date(now.getTime() + 30 * 86_400_000);
  const rows = await prisma.trainingCertificate.findMany({
    where: { status: "APPROVED", expiresOn: { not: null, lte: horizon } },
    orderBy: { createdAt: "desc" },
    include: {
      training: { select: { id: true, name: true } },
      member: { select: { id: true, slackId: true } },
    },
  });

  const newestPerPair = new Map<string, (typeof rows)[number]>();
  for (const r of rows) {
    const key = `${r.memberId}:${r.trainingId}`;
    // rows are newest-first, so the first one wins.
    if (!newestPerPair.has(key)) newestPerPair.set(key, r);
  }
  return [...newestPerPair.values()];
}
```

- [ ] **Step 2: Add tests for `dueReminder`**

Append to `backend/src/services/trainingService.test.ts`, **before** the final summary lines:

```ts
console.log("dueReminder — each threshold fires exactly once");
{
  const DAY = 86_400_000;
  const now = utc("2026-08-25");
  const inDays = (n: number) => new Date(now.getTime() + n * DAY);

  check("far from expiry is silent", dueReminder(inDays(60), null, now) === null);
  check("30 days out fires T30", dueReminder(inDays(29), null, now) === "T30");
  check("7 days out fires T7", dueReminder(inDays(6), null, now) === "T7");
  check("already past fires LAPSED", dueReminder(inDays(-1), null, now) === "LAPSED");

  // The whole point: a reminder already sent for this threshold does not repeat.
  const expires = inDays(29);
  const t30CrossedAt = new Date(expires.getTime() - 30 * DAY);
  check("T30 already sent stays silent",
    dueReminder(expires, new Date(t30CrossedAt.getTime() + 1000), now) === null);

  // ...but the NEXT threshold still fires, even though a reminder was sent.
  const soon = inDays(6);
  check("T7 fires even after T30 was sent",
    dueReminder(soon, new Date(soon.getTime() - 30 * DAY + 1000), now) === "T7");
  check("LAPSED fires even after T7 was sent",
    dueReminder(inDays(-1), new Date(now.getTime() - 3 * DAY), now) === "LAPSED");
}
```

- [ ] **Step 3: Run the tests**

Run: `cd backend && npx tsx src/services/trainingService.test.ts`
Expected: `0 failed`.

- [ ] **Step 4: Add the cron to `scheduler.ts`**

In `backend/src/slack/scheduler.ts`, immediately after the existing
`cron.schedule("0 8 * * *", ...)` due-date reminder block, add:

```ts
  // ── Daily 8:15 AM — Safety-training certificate expiry ───────────
  //
  // Nags at 30 days out, 7 days out, and once lapsed. A lapsed certificate also
  // reopens its course section so the member can upload the new one where they
  // uploaded the last one.
  cron.schedule("15 8 * * *", async () => {
    console.log("📜 Checking safety-training certificate expiry...");
    try {
      const trainingService = await import("../services/trainingService.js");
      const progressService = await import("../services/courseProgressService.js");
      const { createNotification } = await import("../services/notificationCrud.js");
      const { queueDm } = await import("../services/dmBatcher.js");

      const now = new Date();
      const candidates = await trainingService.findExpiringCertificates(now);
      let sent = 0;

      for (const cert of candidates) {
        if (!cert.expiresOn) continue;
        const threshold = trainingService.dueReminder(cert.expiresOn, cert.lastRemindedAt, now);
        if (!threshold) continue;

        const when = cert.expiresOn.toISOString().slice(0, 10);
        const message =
          threshold === "LAPSED"
            ? `Your ${cert.training.name} training expired on ${when}. Upload a new certificate to get back to current.`
            : `Your ${cert.training.name} training expires on ${when}. Renew it and upload the new certificate.`;

        await createNotification({
          type: "TRAINING_EXPIRING",
          recipientId: cert.memberId,
          message,
          metadata: { certificateId: cert.id, sectionId: cert.sectionId, threshold },
        });
        if (cert.member.slackId) queueDm(cert.member.slackId, message);

        // Only a lapse reopens the section — a 30-day warning must not undo
        // someone's course completion while they are still compliant.
        if (threshold === "LAPSED" && cert.sectionId) {
          await progressService.reopenSectionForMember(cert.sectionId, cert.memberId);
        }

        await prisma.trainingCertificate.update({
          where: { id: cert.id },
          data: { lastRemindedAt: now },
        });
        sent++;
      }
      console.log(`✅ Training expiry: ${sent} reminder(s) sent`);
    } catch (error) {
      console.error("❌ Training expiry check error:", error);
    }
  });
```

- [ ] **Step 5: Typecheck**

Run: `cd backend && npx tsc --noEmit`
Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/trainingService.ts backend/src/services/trainingService.test.ts backend/src/slack/scheduler.ts
git commit -m "feat(trainings): daily certificate expiry reminders"
```

<details>
<summary><b>Paste-able prompt for Phase 6</b></summary>

```
Implement Phase 6 of docs/superpowers/plans/2026-08-25-lab-training-certifications.md
(expiry cron). Phases 1-5 are merged.

Context you need:
- All crons live in backend/src/slack/scheduler.ts (node-cron). Add yours next to the
  existing "0 8 * * *" due-date reminder block. Do not create a new scheduler file.
- Write the dueReminder tests FIRST and watch them fail, then implement. Tests are tsx
  scripts with an inline check() harness, appended to the existing
  backend/src/services/trainingService.test.ts.
  Run: cd backend && npx tsx src/services/trainingService.test.ts
- Only a LAPSED threshold reopens the section. A 30-day warning must not undo someone's
  course completion while they are still compliant.
- reopenSectionForMember must not touch rewardGrantedAt (it already doesn't — don't change it).

Do only Phase 6. Stop after its commit and paste the test output.
```
</details>

---

# Phase 7 — Client wrappers and the learner section

**Goal:** A member can see a `TRAINING` section, click through to the real training, look at the
example certificate, and upload theirs.

**Files:**
- Modify: `src/api/clubPmClient.js`
- Modify: `src/components/clubpm/courses/CourseSectionRail.jsx`
- Create: `src/components/clubpm/courses/TrainingSection.jsx`
- Modify: `src/pages/ClubPM/CoursePlayerPage.jsx`

- [ ] **Step 1: Add the client wrappers**

In `src/api/clubPmClient.js`, after `deleteAssignmentHandout` (~line 670), add:

```js
// ── Safety-training registry and certificates ────────────────
// NOTE: unrelated to `ensureTrainingProject` below, which is the walkthrough
// sandbox project. Same word, different feature.
export const listTrainings   = ()          => get('/api/outreach/courses/trainings');
export const createTraining  = (body)      => post('/api/outreach/courses/trainings', body);
export const updateTraining  = (id, body)  => patch(`/api/outreach/courses/trainings/${id}`, body);
export const myTrainingStatus = ()         => get('/api/outreach/courses/trainings/my-status');

export const uploadTrainingExample = (trainingId, file) => {
  const form = new FormData();
  form.append('file', file);
  return post(`/api/outreach/courses/trainings/${trainingId}/example`, form);
};
export const deleteTrainingExample = (trainingId) =>
  del(`/api/outreach/courses/trainings/${trainingId}/example`);

// Carries the reward envelope like every other completion, so `handleResponse`
// fires RewardFlux and the quest toasts with no extra wiring on the page.
export const submitCertificate = (sectionId, { file, completedOn }) => {
  const form = new FormData();
  form.append('file', file);
  form.append('completedOn', completedOn);
  return post(`/api/outreach/courses/sections/${sectionId}/certificate`, form);
};
export const listMyCertificates = (sectionId) =>
  get(`/api/outreach/courses/sections/${sectionId}/certificates`);

export const listPendingCertificates = () =>
  get('/api/outreach/courses/certificates/pending');
export const reviewCertificate = (certificateId, body) =>
  post(`/api/outreach/courses/certificates/${certificateId}/review`, body);

// These two build URLs rather than fetching, because they are used as <iframe>
// and <a href> targets. Both routes are authenticated — the browser sends the
// session cookie, which is why this works without the Bearer header. A member
// whose browser blocks the cross-origin cookie sees the fallback download link
// that TrainingSection renders beside the preview.
export const certificateFileUrl = (certificateId) =>
  `${BASE_URL}/api/outreach/courses/certificates/${certificateId}/file`;
export const trainingExampleUrl = (trainingId) =>
  `${BASE_URL}/api/outreach/courses/trainings/${trainingId}/example-file`;
```

- [ ] **Step 2: Add the `TRAINING` kind to the rail**

In `src/components/clubpm/courses/CourseSectionRail.jsx`, add to `SECTION_KINDS`:

```js
  ASSIGNMENT:  { label: 'Assignment', icon: 'fas fa-file-pen' },
  TRAINING:    { label: 'Training', icon: 'fas fa-certificate' },
};
```

- [ ] **Step 3: Create `TrainingSection.jsx`**

Create `src/components/clubpm/courses/TrainingSection.jsx`:

```jsx
import React, { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import {
  submitCertificate,
  listMyCertificates,
  certificateFileUrl,
  trainingExampleUrl,
} from '../../../api/clubPmClient';

// The four statuses, their icons, and their colours. Font Awesome only — never
// emoji. `PENDING_REVIEW` exists because a section completes on upload while the
// certificate waits for an admin, so there is a real state between red and green.
export const CERT_STATUS = {
  UP_TO_DATE:     { cls: 'is-current',  icon: 'fas fa-circle-check',         label: 'Up to date' },
  PENDING_REVIEW: { cls: 'is-pending',  icon: 'fas fa-hourglass-half',       label: 'Awaiting review' },
  EXPIRED:        { cls: 'is-expired',  icon: 'fas fa-triangle-exclamation', label: 'Expired' },
  NOT_COMPLETED:  { cls: 'is-missing',  icon: 'fas fa-circle-xmark',         label: 'Not completed' },
};

const ROW_STATUS = {
  PENDING:  { cls: 'is-pending',  icon: 'fas fa-hourglass-half', label: 'Awaiting review' },
  APPROVED: { cls: 'is-current',  icon: 'fas fa-circle-check',   label: 'Approved' },
  REJECTED: { cls: 'is-missing',  icon: 'fas fa-circle-xmark',   label: 'Needs another look' },
};

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—';

// Derived client-side purely for the chip at the top of the card. The server is
// still the authority — this is the same cascade as trainingService.deriveStatus.
function deriveStatus(certs) {
  const now = Date.now();
  const approved = certs.filter((c) => c.status === 'APPROVED');
  if (approved.some((c) => !c.expiresOn || new Date(c.expiresOn).getTime() > now)) return 'UP_TO_DATE';
  if (certs.some((c) => c.status === 'PENDING')) return 'PENDING_REVIEW';
  if (approved.length) return 'EXPIRED';
  return 'NOT_COMPLETED';
}

export default function TrainingSection({ section, onCompleted }) {
  const training = section.training;
  const [certs, setCerts]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [file, setFile]           = useState(null);
  const [completedOn, setCompletedOn] = useState('');
  const [saving, setSaving]       = useState(false);
  const [showExample, setShowExample] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await listMyCertificates(section.id);
      setCerts(data?.certificates ?? []);
    } catch {
      // A failed history load must not hide the upload form — the member can
      // still submit, which is the thing they came here to do.
      setCerts([]);
    } finally {
      setLoading(false);
    }
  }, [section.id]);

  useEffect(() => { load(); }, [load]);

  const submit = async (e) => {
    e.preventDefault();
    if (!file)        { toast.error('Attach your certificate'); return; }
    if (!completedOn) { toast.error('Enter the completion date printed on it'); return; }
    setSaving(true);
    try {
      await submitCertificate(section.id, { file, completedOn });
      toast.success('Certificate submitted — an officer will review it');
      setFile(null);
      setCompletedOn('');
      await load();
      onCompleted?.();
    } catch (err) {
      toast.error(err?.message || 'Could not save that certificate');
    } finally {
      setSaving(false);
    }
  };

  if (!training) {
    return (
      <div className="cpm-card cpm-training-card">
        <p className="cpm-training-empty">
          <i className="fas fa-circle-info" aria-hidden="true" />{' '}
          This section has no training attached yet. Ask the course author to pick one.
        </p>
      </div>
    );
  }

  const status = CERT_STATUS[deriveStatus(certs)];

  return (
    <div className="cpm-card cpm-training-card">
      <header className="cpm-training-head">
        <div>
          <span className="cpm-training-provider">
            <i className="fas fa-building-columns" aria-hidden="true" /> {training.providerName}
          </span>
          <h3 className="cpm-training-name">{training.name}</h3>
        </div>
        <span className={`cpm-training-status ${status.cls}`}>
          <i className={status.icon} aria-hidden="true" /> {status.label}
        </span>
      </header>

      {training.description && <p className="cpm-training-desc">{training.description}</p>}

      {training.renewalMonths ? (
        <p className="cpm-training-renewal">
          <i className="fas fa-rotate" aria-hidden="true" />{' '}
          Renews every {training.renewalMonths} months.
        </p>
      ) : null}

      <div className="cpm-training-links">
        {training.courseUrl && (
          <a className="clubpm-btn-primary" href={training.courseUrl}
             target="_blank" rel="noopener noreferrer">
            <i className="fas fa-arrow-up-right-from-square" aria-hidden="true" /> Open training
          </a>
        )}
        {training.registrationUrl && (
          <a className="clubpm-btn-ghost" href={training.registrationUrl}
             target="_blank" rel="noopener noreferrer">
            <i className="fas fa-file-lines" aria-hidden="true" /> Registration instructions
          </a>
        )}
        {training.exampleFileId && (
          <button type="button" className="clubpm-btn-ghost"
                  onClick={() => setShowExample((v) => !v)}>
            <i className="fas fa-image" aria-hidden="true" />{' '}
            {showExample ? 'Hide example' : 'What should it look like?'}
          </button>
        )}
      </div>

      {showExample && training.exampleFileId && (
        <div className="cpm-training-example">
          <p className="cpm-training-example-cap">
            An example of an acceptable certificate. Yours will have your own name and date.
          </p>
          {/* An <object> rather than <img>: most certificates are PDFs, and this
              renders both without branching on mime type. The link beneath is the
              fallback for a browser that blocks the cross-origin session cookie. */}
          <object
            className="cpm-training-example-frame"
            data={trainingExampleUrl(training.id)}
            type={training.exampleMimeType || 'application/pdf'}
            aria-label={`Example ${training.name} certificate`}
          >
            <a href={trainingExampleUrl(training.id)} target="_blank" rel="noopener noreferrer">
              Open the example certificate
            </a>
          </object>
        </div>
      )}

      <form className="cpm-training-upload" onSubmit={submit}>
        <h4>Submit your certificate</h4>
        <label className="cpm-form-label" htmlFor={`cert-file-${section.id}`}>
          Certificate file (PDF or image)
        </label>
        <input
          id={`cert-file-${section.id}`}
          className="cpm-form-input"
          type="file"
          accept="application/pdf,image/*"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />

        <label className="cpm-form-label" htmlFor={`cert-date-${section.id}`}>
          Completion date printed on the certificate
        </label>
        <input
          id={`cert-date-${section.id}`}
          className="cpm-form-input"
          type="date"
          value={completedOn}
          max={new Date().toISOString().slice(0, 10)}
          onChange={(e) => setCompletedOn(e.target.value)}
        />

        <button className="clubpm-btn-primary" type="submit" disabled={saving}>
          {saving
            ? <><i className="fas fa-spinner fa-spin" aria-hidden="true" /> Uploading…</>
            : <><i className="fas fa-upload" aria-hidden="true" /> Submit certificate</>}
        </button>
        <p className="cpm-training-note">
          Submitting completes this section right away. An officer reviews it afterwards —
          you will hear back either way.
        </p>
      </form>

      {!loading && certs.length > 0 && (
        <div className="cpm-training-history">
          <h4>Your submissions</h4>
          <ul>
            {certs.map((c) => {
              const meta = ROW_STATUS[c.status] ?? ROW_STATUS.PENDING;
              return (
                <li key={c.id} className={`cpm-training-history-row ${meta.cls}`}>
                  <span className="cpm-training-history-status">
                    <i className={meta.icon} aria-hidden="true" /> {meta.label}
                  </span>
                  <a href={certificateFileUrl(c.id)} target="_blank" rel="noopener noreferrer">
                    {c.fileName}
                  </a>
                  <span className="cpm-training-history-dates">
                    Completed {fmtDate(c.completedOn)}
                    {c.expiresOn ? ` · expires ${fmtDate(c.expiresOn)}` : ''}
                  </span>
                  {c.status === 'REJECTED' && c.reviewNote && (
                    <span className="cpm-training-history-note">{c.reviewNote}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Render it in the player**

In `src/pages/ClubPM/CoursePlayerPage.jsx`, add the import beside the other section imports:

```jsx
import TrainingSection from '../../components/clubpm/courses/TrainingSection';
```

Add the render branch beside the `ASSIGNMENT` one (~line 423):

```jsx
              {selected.kind === 'TRAINING' && (
                <TrainingSection section={selected} onCompleted={reload} />
              )}
```

Use whatever the page's existing reload function is called — find it by looking at what the
`ASSIGNMENT` branch passes to `AssignmentSection`, and pass the same thing.

Then extend the "generic body" guard on ~line 437 so a `TRAINING` section's prose renders
*above* the card rather than being suppressed. Change:

```jsx
{selected.kind !== 'QUIZ' && selected.kind !== 'LIT_REVIEW' && selected.kind !== 'ASSIGNMENT' && selected.contentJson && (
```

to:

```jsx
{selected.kind !== 'QUIZ' && selected.kind !== 'LIT_REVIEW' && selected.kind !== 'ASSIGNMENT' && selected.kind !== 'TRAINING' && selected.contentJson && (
```

and add a dedicated branch **above** the `TrainingSection` render, mirroring `ASSIGNMENT`:

```jsx
              {selected.kind === 'TRAINING' && selected.contentJson && (
                <BlogEditor value={selected.contentJson} readOnly />
              )}
```

Match the exact props the `ASSIGNMENT` version at line 412 passes to `BlogEditor` — copy that
line rather than guessing.

- [ ] **Step 5: Build**

Run: `npm run build` (repo root)
Expected: `Compiled successfully` (warnings about unused vars are acceptable; errors are not).

- [ ] **Step 6: Commit**

```bash
git add src/api/clubPmClient.js src/components/clubpm/courses/CourseSectionRail.jsx src/components/clubpm/courses/TrainingSection.jsx src/pages/ClubPM/CoursePlayerPage.jsx
git commit -m "feat(trainings): learner training section with certificate upload"
```

<details>
<summary><b>Paste-able prompt for Phase 7</b></summary>

```
Implement Phase 7 of docs/superpowers/plans/2026-08-25-lab-training-certifications.md
(client wrappers + TrainingSection). Phases 1-6 are merged, so all backend routes exist.

Context you need:
- Frontend is plain JSX (React 19). NO TypeScript in src/.
- Font Awesome classes only: <i className="fas fa-..." aria-hidden="true" />. Never emoji.
- Do not add CSS yet — Phase 11 does that. Use the class names the plan specifies.
- In CoursePlayerPage.jsx, copy the ASSIGNMENT branch's exact props rather than guessing:
  the reload callback name and the BlogEditor props both come from there.
- The client's `post()` already handles a FormData body (it omits Content-Type so the
  browser sets the multipart boundary). Copy the submitWork idiom.

Do only Phase 7. Stop after its commit and paste the npm run build result.
```
</details>

---

# Phase 8 — Authoring the registry from the course editor

**Goal:** An author adding a `TRAINING` section can pick an existing registry entry or create a
new one, and attach an example certificate.

**Files:**
- Create: `src/components/clubpm/courses/TrainingBuilder.jsx`
- Modify: `src/pages/ClubPM/CourseEditorPage.jsx`

- [ ] **Step 1: Create `TrainingBuilder.jsx`**

Create `src/components/clubpm/courses/TrainingBuilder.jsx`:

```jsx
import React, { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import {
  listTrainings,
  createTraining,
  updateTraining,
  uploadTrainingExample,
  deleteTrainingExample,
  trainingExampleUrl,
} from '../../../api/clubPmClient';

const BLANK = {
  name: '',
  providerName: '',
  providerUrl: '',
  courseUrl: '',
  registrationUrl: '',
  description: '',
  renewalMonths: '',
};

/**
 * Author-side panel for a TRAINING section.
 *
 * `onChange({ trainingId })` is how the section's FK gets saved — this component
 * does not write the section itself, matching how LitReviewBuilder and
 * AssignmentBuilder hand their config up to CourseEditorPage.
 */
export default function TrainingBuilder({ section, onChange }) {
  const [rows, setRows]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode]       = useState('pick');   // 'pick' | 'edit'
  const [draft, setDraft]     = useState(BLANK);
  const [saving, setSaving]   = useState(false);

  const selected = rows.find((r) => r.id === section.trainingId) ?? null;

  const load = useCallback(async () => {
    try {
      setRows(await listTrainings());
    } catch {
      toast.error('Could not load the training registry');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const startNew = () => { setDraft(BLANK); setMode('edit'); };
  const startEdit = () => {
    if (!selected) return;
    setDraft({
      name:            selected.name ?? '',
      providerName:    selected.providerName ?? '',
      providerUrl:     selected.providerUrl ?? '',
      courseUrl:       selected.courseUrl ?? '',
      registrationUrl: selected.registrationUrl ?? '',
      description:     selected.description ?? '',
      renewalMonths:   selected.renewalMonths ?? '',
    });
    setMode('edit');
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const body = { ...draft, renewalMonths: draft.renewalMonths === '' ? null : Number(draft.renewalMonths) };
      const row = selected && mode === 'edit' && draft.name === selected.name
        ? await updateTraining(selected.id, body)
        : selected && mode === 'edit'
          ? await updateTraining(selected.id, body)
          : await createTraining(body);
      await load();
      onChange({ trainingId: row.id });
      setMode('pick');
      toast.success('Training saved');
    } catch (err) {
      toast.error(err?.message || 'Could not save that training');
    } finally {
      setSaving(false);
    }
  };

  const attachExample = async (file) => {
    if (!selected || !file) return;
    try {
      await uploadTrainingExample(selected.id, file);
      await load();
      toast.success('Example certificate attached');
    } catch (err) {
      toast.error(err?.message || 'Could not attach that example');
    }
  };

  const removeExample = async () => {
    if (!selected) return;
    try {
      await deleteTrainingExample(selected.id);
      await load();
      toast.success('Example removed');
    } catch (err) {
      toast.error(err?.message || 'Could not remove that example');
    }
  };

  if (loading) return <p className="cpm-training-empty">Loading the registry…</p>;

  if (mode === 'edit') {
    return (
      <form className="cpm-card cpm-training-builder" onSubmit={save}>
        <h4>{selected ? 'Edit training' : 'New training'}</h4>

        {selected && (
          // A shared registry's one sharp edge, said out loud rather than
          // discovered. Editing this row changes it in every course that uses it.
          <p className="cpm-training-warn">
            <i className="fas fa-triangle-exclamation" aria-hidden="true" />{' '}
            This entry is shared. Editing it changes it in <strong>every course</strong> that
            uses this training, not just this one.
          </p>
        )}

        <label className="cpm-form-label" htmlFor="tb-name">Name</label>
        <input id="tb-name" className="cpm-form-input" value={draft.name} required
               onChange={(e) => setDraft({ ...draft, name: e.target.value })} />

        <label className="cpm-form-label" htmlFor="tb-provider">Provider</label>
        <input id="tb-provider" className="cpm-form-input" value={draft.providerName} required
               placeholder="CITI Program"
               onChange={(e) => setDraft({ ...draft, providerName: e.target.value })} />

        <label className="cpm-form-label" htmlFor="tb-course-url">Link to the training</label>
        <input id="tb-course-url" className="cpm-form-input" type="url" value={draft.courseUrl}
               onChange={(e) => setDraft({ ...draft, courseUrl: e.target.value })} />

        <label className="cpm-form-label" htmlFor="tb-reg-url">
          Registration instructions (optional)
        </label>
        <input id="tb-reg-url" className="cpm-form-input" type="url" value={draft.registrationUrl}
               onChange={(e) => setDraft({ ...draft, registrationUrl: e.target.value })} />

        <label className="cpm-form-label" htmlFor="tb-desc">What it covers</label>
        <textarea id="tb-desc" className="cpm-form-input" rows={4} value={draft.description}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })} />

        <label className="cpm-form-label" htmlFor="tb-renewal">
          Renews every … months (blank = never expires)
        </label>
        <input id="tb-renewal" className="cpm-form-input" type="number" min="0" max="120"
               value={draft.renewalMonths}
               onChange={(e) => setDraft({ ...draft, renewalMonths: e.target.value })} />

        <div className="cpm-training-builder-actions">
          <button className="clubpm-btn-primary" type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Save training'}
          </button>
          <button className="clubpm-btn-ghost" type="button" onClick={() => setMode('pick')}>
            Cancel
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="cpm-card cpm-training-builder">
      <h4>Training for this section</h4>

      <label className="cpm-form-label" htmlFor="tb-pick">Registry entry</label>
      <select id="tb-pick" className="cpm-form-input" value={section.trainingId ?? ''}
              onChange={(e) => onChange({ trainingId: e.target.value || null })}>
        <option value="">— pick a training —</option>
        {rows.map((r) => (
          <option key={r.id} value={r.id}>{r.name} · {r.providerName}</option>
        ))}
      </select>

      <div className="cpm-training-builder-actions">
        <button className="clubpm-btn-ghost" type="button" onClick={startNew}>
          <i className="fas fa-plus" aria-hidden="true" /> New training
        </button>
        {selected && (
          <button className="clubpm-btn-ghost" type="button" onClick={startEdit}>
            <i className="fas fa-pen" aria-hidden="true" /> Edit “{selected.name}”
          </button>
        )}
      </div>

      {selected && (
        <div className="cpm-training-example-admin">
          <h5>Example certificate</h5>
          <p className="cpm-training-note">
            What an acceptable certificate looks like. Learners see this before they upload,
            which is most of the reason a wrong file gets submitted.
          </p>
          {selected.exampleFileId ? (
            <div className="cpm-training-builder-actions">
              <a className="clubpm-btn-ghost" href={trainingExampleUrl(selected.id)}
                 target="_blank" rel="noopener noreferrer">
                <i className="fas fa-eye" aria-hidden="true" /> {selected.exampleFileName}
              </a>
              <button className="clubpm-btn-ghost" type="button" onClick={removeExample}>
                <i className="fas fa-trash" aria-hidden="true" /> Remove
              </button>
            </div>
          ) : (
            <input className="cpm-form-input" type="file" accept="application/pdf,image/*"
                   onChange={(e) => attachExample(e.target.files?.[0])} />
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Simplify the redundant branch in `save`**

The ternary in Step 1's `save` has an identical branch on both sides of its first condition.
Replace the whole `const row = ...` expression with:

```jsx
      const row = selected
        ? await updateTraining(selected.id, body)
        : await createTraining(body);
```

(Kept as a separate step so the reviewer sees it was deliberate: `mode === 'edit'` with a
`selected` row is always an update, and without one is always a create.)

- [ ] **Step 3: Wire it into the editor**

In `src/pages/ClubPM/CourseEditorPage.jsx`, add the import beside `AssignmentBuilder`:

```jsx
import TrainingBuilder from '../../components/clubpm/courses/TrainingBuilder';
```

Add the render branch beside the `ASSIGNMENT` one (~line 723):

```jsx
              {sectionKind === 'TRAINING' && (
                <TrainingBuilder section={section} onChange={saveSectionPatch} />
              )}
```

`saveSectionPatch` is whatever the file already calls its section-PATCH helper — look at what
the `LIT_REVIEW` and `ASSIGNMENT` builders are handed at lines 712 and 723 and pass the same
function. `trainingId` is a plain column, so it patches like `passThreshold` does, **not** like
the JSON config columns.

- [ ] **Step 4: Confirm the section PATCH accepts `trainingId`**

`PATCH /sections/:sid` goes through `courseService.updateSection`. Check that it whitelists
`trainingId`:

Run: `cd backend && grep -n "trainingId\|passThreshold" src/services/courseService.ts`

If the update function has an explicit field whitelist and `trainingId` is missing, add it
beside `passThreshold`. If it spreads the request body, nothing to do.

- [ ] **Step 5: Build**

Run: `npm run build` (repo root) and `cd backend && npx tsc --noEmit`
Expected: `Compiled successfully`, and no tsc output.

- [ ] **Step 6: Commit**

```bash
git add src/components/clubpm/courses/TrainingBuilder.jsx src/pages/ClubPM/CourseEditorPage.jsx backend/src/services/courseService.ts
git commit -m "feat(trainings): registry picker and example upload in the course editor"
```

<details>
<summary><b>Paste-able prompt for Phase 8</b></summary>

```
Implement Phase 8 of docs/superpowers/plans/2026-08-25-lab-training-certifications.md
(TrainingBuilder + course editor wiring). Phases 1-7 are merged.

Context you need:
- Plain JSX, no TypeScript. Font Awesome only, never emoji.
- No CSS in this phase — Phase 11 handles it.
- trainingId is a plain scalar column on CourseSection, NOT a JSON config column. It patches
  like passThreshold, not like litConfig/assignmentConfig (which every writer must spread).
- Step 4 matters: if courseService.updateSection has a field whitelist, trainingId must be
  added to it or the picker silently saves nothing. Actually run the grep.
- Copy the handler prop the LIT_REVIEW and ASSIGNMENT builders are given in
  CourseEditorPage.jsx rather than inventing a name.

Do only Phase 8. Stop after its commit.
```
</details>

---

# Phase 9 — Admin review panel

**Goal:** An admin sees pending certificates in `CourseProgressDashboard`, opens each file, and
approves or rejects. A badge in the sidebar shows the queue depth.

**Files:**
- Create: `src/components/clubpm/courses/CertificateReviewPanel.jsx`
- Modify: `src/components/clubpm/courses/CourseProgressDashboard.jsx`
- Modify: `src/components/clubpm/AppShell.jsx`

- [ ] **Step 1: Create `CertificateReviewPanel.jsx`**

Create `src/components/clubpm/courses/CertificateReviewPanel.jsx`:

```jsx
import React, { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import {
  listPendingCertificates,
  reviewCertificate,
  certificateFileUrl,
} from '../../../api/clubPmClient';

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—';

function ReviewRow({ cert, onDone }) {
  const [note, setNote]           = useState('');
  const [completedOn, setDate]    = useState(cert.completedOn?.slice(0, 10) ?? '');
  const [busy, setBusy]           = useState(false);
  const [rejecting, setRejecting] = useState(false);

  const decide = async (decision) => {
    if (decision === 'REJECTED' && !note.trim()) {
      toast.error('Say why — the member sees this note');
      return;
    }
    setBusy(true);
    try {
      await reviewCertificate(cert.id, {
        decision,
        note: note.trim() || null,
        // Only send a corrected date when the admin actually changed it.
        completedOn: completedOn !== cert.completedOn?.slice(0, 10) ? completedOn : undefined,
      });
      toast.success(decision === 'APPROVED' ? 'Approved' : 'Sent back');
      onDone();
    } catch (err) {
      toast.error(err?.message || 'Could not record that decision');
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="cpm-cert-review-row">
      <div className="cpm-cert-review-meta">
        <strong>{cert.member?.displayName ?? 'Unknown member'}</strong>
        <span>{cert.training?.name}</span>
        <span className="cpm-cert-review-sub">
          Submitted {fmtDate(cert.createdAt)}
          {cert.expiresOn ? ` · would expire ${fmtDate(cert.expiresOn)}` : ' · never expires'}
        </span>
      </div>

      {/* An <object> renders both PDFs and images without branching on mime
          type. The link beneath is the fallback when a browser blocks the
          cross-origin session cookie the proxy route relies on. */}
      <object
        className="cpm-cert-review-frame"
        data={certificateFileUrl(cert.id)}
        type={cert.fileMimeType || 'application/pdf'}
        aria-label={`${cert.member?.displayName}'s ${cert.training?.name} certificate`}
      >
        <a href={certificateFileUrl(cert.id)} target="_blank" rel="noopener noreferrer">
          Open {cert.fileName}
        </a>
      </object>

      <div className="cpm-cert-review-actions">
        <label className="cpm-form-label" htmlFor={`cert-date-${cert.id}`}>
          Completion date {completedOn !== cert.completedOn?.slice(0, 10) && '(corrected)'}
        </label>
        <input id={`cert-date-${cert.id}`} className="cpm-form-input" type="date"
               value={completedOn} onChange={(e) => setDate(e.target.value)} />

        {rejecting && (
          <textarea className="cpm-form-input" rows={2} value={note} autoFocus
                    placeholder="What's wrong with it? The member sees this."
                    onChange={(e) => setNote(e.target.value)} />
        )}

        <div className="cpm-cert-review-buttons">
          <button className="clubpm-btn-primary" type="button" disabled={busy}
                  onClick={() => decide('APPROVED')}>
            <i className="fas fa-circle-check" aria-hidden="true" /> Approve
          </button>
          {rejecting ? (
            <>
              <button className="clubpm-btn-ghost" type="button" disabled={busy}
                      onClick={() => decide('REJECTED')}>
                <i className="fas fa-paper-plane" aria-hidden="true" /> Send back
              </button>
              <button className="clubpm-btn-ghost" type="button"
                      onClick={() => { setRejecting(false); setNote(''); }}>
                Cancel
              </button>
            </>
          ) : (
            <button className="clubpm-btn-ghost" type="button" disabled={busy}
                    onClick={() => setRejecting(true)}>
              <i className="fas fa-circle-xmark" aria-hidden="true" /> Reject…
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

export default function CertificateReviewPanel() {
  const [certs, setCerts]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listPendingCertificates();
      setCerts(data?.certificates ?? []);
      setError('');
    } catch (err) {
      setError(err?.message || 'Could not load the review queue');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <p className="cpm-training-empty">Loading the review queue…</p>;
  if (error)   return <p className="cpm-training-empty">{error}</p>;

  if (!certs.length) {
    return (
      <p className="cpm-training-empty">
        <i className="fas fa-circle-check" aria-hidden="true" /> Nothing waiting for review.
      </p>
    );
  }

  return (
    <div className="cpm-cert-review">
      <p className="cpm-training-note">
        {certs.length} certificate{certs.length === 1 ? '' : 's'} awaiting review, oldest first.
      </p>
      <ul className="cpm-cert-review-list">
        {certs.map((c) => <ReviewRow key={c.id} cert={c} onDone={load} />)}
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: Add the view tab to `CourseProgressDashboard.jsx`**

Add the import:

```jsx
import CertificateReviewPanel from './CertificateReviewPanel';
```

Extend the `VIEWS` array (~line 20):

```jsx
const VIEWS = [
  { id: 'matrix',   label: 'Completion matrix', icon: 'fas fa-table-cells' },
  { id: 'analysis', label: 'Quiz item analysis', icon: 'fas fa-clipboard-question' },
  { id: 'certs',    label: 'Certificates', icon: 'fas fa-certificate' },
];
```

Then find where the component renders `view === 'matrix'` / `view === 'analysis'` and add
alongside them:

```jsx
        {view === 'certs' && <CertificateReviewPanel />}
```

The certificate queue is **not** course-scoped — it is every pending certificate across every
course, because a reviewer works a queue rather than a course. Make sure the `certs` view is not
gated behind the `courseId` guard the other two views use; if the render is wrapped in
`{courseId && ...}`, put the `certs` branch outside that wrapper.

- [ ] **Step 3: Add the badge to `AppShell.jsx`**

Beside the existing `pendingRewardsCount` / `pendingCrCount` state (~line 290):

```jsx
  const [pendingCertCount, setPendingCertCount] = useState(0);
```

Beside the existing admin-only fetch effects (~line 294–306), add one modelled on them:

```jsx
  useEffect(() => {
    if (!member?.isAdmin) return;
    let cancelled = false;
    listPendingCertificates()
      .then((d) => { if (!cancelled) setPendingCertCount(d?.count ?? 0); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [member?.isAdmin]);
```

Import it at the top:

```jsx
import { listPendingCertificates } from '../../api/clubPmClient';
```

(If `AppShell.jsx` already imports from `clubPmClient`, add the name to that import rather than
adding a second statement.)

Then extend the badge group (~line 437) — add a third badge inside the existing
`pm-admin-badge-group`, and widen its visibility condition:

```jsx
                {(pendingRewardsCount > 0 || pendingCrCount > 0 || pendingCertCount > 0) && (
                  <span className="pm-admin-badge-group">
                    {/* ...existing two badges unchanged... */}
                    {pendingCertCount > 0 && (
                      <span className="pm-admin-badge" title="Certificates awaiting review">
                        {pendingCertCount}
                      </span>
                    )}
                  </span>
                )}
```

- [ ] **Step 4: Build**

Run: `npm run build` (repo root)
Expected: `Compiled successfully`.

- [ ] **Step 5: Commit**

```bash
git add src/components/clubpm/courses/CertificateReviewPanel.jsx src/components/clubpm/courses/CourseProgressDashboard.jsx src/components/clubpm/AppShell.jsx
git commit -m "feat(trainings): admin certificate review queue and sidebar badge"
```

<details>
<summary><b>Paste-able prompt for Phase 9</b></summary>

```
Implement Phase 9 of docs/superpowers/plans/2026-08-25-lab-training-certifications.md
(CertificateReviewPanel + dashboard tab + AppShell badge). Phases 1-8 are merged.

Context you need:
- Plain JSX, no TypeScript. Font Awesome only, never emoji.
- No CSS in this phase — Phase 11 handles it.
- The certificate queue is NOT course-scoped. If CourseProgressDashboard wraps its views in
  a {courseId && ...} guard, the certs branch goes OUTSIDE it — a reviewer works a queue,
  not a course.
- Copy the admin-fetch effect shape from the existing pendingRewardsCount / pendingCrCount
  effects in AppShell.jsx rather than inventing one.

Do only Phase 9. Stop after its commit.
```
</details>

---

# Phase 10 — Profile status strip

**Goal:** A member can see their standing across every training, year-round, after the course is
long finished.

**Files:**
- Create: `src/components/clubpm/courses/TrainingStatusStrip.jsx`
- Modify: `src/pages/ClubPM/Profile.jsx`

- [ ] **Step 1: Create `TrainingStatusStrip.jsx`**

Create `src/components/clubpm/courses/TrainingStatusStrip.jsx`:

```jsx
import React, { useEffect, useState } from 'react';
import { myTrainingStatus } from '../../../api/clubPmClient';
import { CERT_STATUS } from './TrainingSection';

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : null;

/**
 * The member's own compliance standing.
 *
 * Renders only on your OWN profile — another member's safety-training record is
 * not public within the club, and the backing route is `my-status`, which only
 * ever answers for the caller.
 */
export default function TrainingStatusStrip({ isSelf }) {
  const [rows, setRows]       = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isSelf) { setLoading(false); return; }
    let cancelled = false;
    myTrainingStatus()
      .then((d) => { if (!cancelled) setRows(d?.trainings ?? []); })
      .catch(() => { if (!cancelled) setRows([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [isSelf]);

  // Nothing to say when there is no registry yet, and nothing to say on someone
  // else's profile. Render nothing rather than an empty card.
  if (!isSelf || loading || !rows.length) return null;

  return (
    <section className="cpm-card cpm-training-strip">
      <h3>
        <i className="fas fa-certificate" aria-hidden="true" /> Safety trainings
      </h3>
      <ul>
        {rows.map((r) => {
          const meta = CERT_STATUS[r.status] ?? CERT_STATUS.NOT_COMPLETED;
          const expiry = fmtDate(r.expiresOn);
          return (
            <li key={r.trainingId} className={`cpm-training-strip-row ${meta.cls}`}>
              <span className="cpm-training-strip-status" title={meta.label}>
                <i className={meta.icon} aria-hidden="true" />
              </span>
              <span className="cpm-training-strip-name">{r.name}</span>
              <span className="cpm-training-strip-provider">{r.providerName}</span>
              <span className="cpm-training-strip-expiry">
                {r.status === 'UP_TO_DATE' && expiry ? `Valid to ${expiry}` : meta.label}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
```

- [ ] **Step 2: Render it on the profile**

In `src/pages/ClubPM/Profile.jsx`, add the import:

```jsx
import TrainingStatusStrip from '../../components/clubpm/courses/TrainingStatusStrip';
```

The page already distinguishes your own profile from someone else's (it reads `useParams()` and
`useClubPmAuth()`). Find that existing boolean — it will be something like `isOwnProfile` or a
comparison of `member.id` to the route param — and render the strip beside the other profile
sections, after the rank/XP block:

```jsx
        <TrainingStatusStrip isSelf={isOwnProfile} />
```

Do **not** introduce a second way of computing "is this me"; reuse the one the file already has.

- [ ] **Step 3: Build**

Run: `npm run build` (repo root)
Expected: `Compiled successfully`.

- [ ] **Step 4: Commit**

```bash
git add src/components/clubpm/courses/TrainingStatusStrip.jsx src/pages/ClubPM/Profile.jsx
git commit -m "feat(trainings): compliance status strip on the member profile"
```

<details>
<summary><b>Paste-able prompt for Phase 10</b></summary>

```
Implement Phase 10 of docs/superpowers/plans/2026-08-25-lab-training-certifications.md
(TrainingStatusStrip + Profile wiring). Phases 1-9 are merged.

Context you need:
- Plain JSX, no TypeScript. Font Awesome only, never emoji.
- No CSS in this phase — Phase 11 handles it.
- The strip renders ONLY on your own profile. Profile.jsx already has a boolean for "is this
  my profile" — find it and reuse it. Do not add a second way of computing it.
- CERT_STATUS is exported from TrainingSection.jsx (Phase 7). Import it rather than
  redefining the four statuses.

Do only Phase 10. Stop after its commit.
```
</details>

---

# Phase 11 — Styles

**Goal:** Everything built in Phases 7–10 looks like the rest of ClubPM.

**Files:**
- Modify: `public/clubpm-theme.css`

- [ ] **Step 1: Append the stylesheet section**

Append to the **bottom** of `public/clubpm-theme.css`. It goes here, not in `search-theme.css`,
because every one of these components renders only under `/clubpm/*`:

```css
/* === Safety trainings and certificates ================================= */
/* Learner section, author builder, admin review queue, profile strip.
   Rendered only under /clubpm/*, so these live here rather than in
   search-theme.css. The four status colours are shared by all four surfaces. */

.cpm-training-card,
.cpm-training-builder,
.cpm-training-strip { display: flex; flex-direction: column; gap: 1rem; }

.cpm-training-head {
  display: flex; justify-content: space-between; align-items: flex-start;
  gap: 1rem; flex-wrap: wrap;
}
.cpm-training-provider {
  font-size: .78rem; letter-spacing: .04em; text-transform: uppercase;
  color: var(--pm-text-muted);
}
.cpm-training-name { margin: .25rem 0 0; font-family: var(--pm-font-display); font-size: 1.35rem; }
.cpm-training-desc { color: var(--pm-text-muted); line-height: 1.6; margin: 0; }
.cpm-training-renewal,
.cpm-training-note {
  font-size: .85rem; color: var(--pm-text-muted); margin: 0;
}

/* The four statuses. Colour is never the only signal — every one of these is
   paired with a distinct Font Awesome icon in the JSX, so the strip is readable
   without colour vision. */
.cpm-training-status,
.cpm-training-history-row,
.cpm-training-strip-row { --cpm-cert: var(--pm-text-muted); }
.is-current  { --cpm-cert: #2ecc71; }
.is-pending  { --cpm-cert: #8fa3ad; }
.is-expired  { --cpm-cert: var(--pm-accent-amber); }
.is-missing  { --cpm-cert: var(--pm-accent-coral); }

.cpm-training-status {
  display: inline-flex; align-items: center; gap: .45rem;
  padding: .3rem .7rem; border-radius: 999px; white-space: nowrap;
  font-size: .8rem; font-weight: 600;
  color: var(--cpm-cert);
  border: 1px solid color-mix(in srgb, var(--cpm-cert) 45%, transparent);
  background: color-mix(in srgb, var(--cpm-cert) 12%, transparent);
}

.cpm-training-links {
  display: flex; flex-wrap: wrap; gap: .6rem; align-items: center;
}

.cpm-training-example { display: flex; flex-direction: column; gap: .5rem; }
.cpm-training-example-cap { font-size: .85rem; color: var(--pm-text-muted); margin: 0; }
.cpm-training-example-frame,
.cpm-cert-review-frame {
  width: 100%; min-height: 420px; border: 1px solid var(--pm-border, rgba(255,255,255,.12));
  border-radius: 10px; background: var(--pm-surface);
}

.cpm-training-upload {
  display: flex; flex-direction: column; gap: .5rem;
  padding-top: 1rem; border-top: 1px solid var(--pm-border, rgba(255,255,255,.12));
}
.cpm-training-upload h4,
.cpm-training-history h4 { margin: 0; font-family: var(--pm-font-display); }

.cpm-training-history ul,
.cpm-cert-review-list,
.cpm-training-strip ul { list-style: none; margin: 0; padding: 0; }

.cpm-training-history-row {
  display: grid; gap: .2rem .8rem; padding: .7rem 0;
  border-top: 1px solid var(--pm-border, rgba(255,255,255,.08));
  grid-template-columns: minmax(9rem, auto) 1fr;
}
.cpm-training-history-status { color: var(--cpm-cert); font-weight: 600; font-size: .85rem; }
.cpm-training-history-dates,
.cpm-training-history-note {
  grid-column: 1 / -1; font-size: .82rem; color: var(--pm-text-muted);
}
.cpm-training-history-note { color: var(--pm-accent-coral); }

.cpm-training-warn {
  display: flex; gap: .5rem; align-items: flex-start; margin: 0;
  padding: .7rem .9rem; border-radius: 8px; font-size: .87rem;
  color: var(--pm-accent-amber);
  border: 1px solid color-mix(in srgb, var(--pm-accent-amber) 40%, transparent);
  background: color-mix(in srgb, var(--pm-accent-amber) 10%, transparent);
}
.cpm-training-builder-actions { display: flex; flex-wrap: wrap; gap: .6rem; }
.cpm-training-example-admin {
  display: flex; flex-direction: column; gap: .5rem;
  padding-top: 1rem; border-top: 1px solid var(--pm-border, rgba(255,255,255,.12));
}
.cpm-training-example-admin h5 { margin: 0; font-family: var(--pm-font-display); }
.cpm-training-empty { color: var(--pm-text-muted); padding: 1.5rem 0; }

.cpm-cert-review { display: flex; flex-direction: column; gap: 1rem; }
.cpm-cert-review-row {
  display: grid; gap: 1rem; padding: 1rem 0;
  border-top: 1px solid var(--pm-border, rgba(255,255,255,.12));
  grid-template-columns: 1fr;
}
@media (min-width: 900px) {
  .cpm-cert-review-row { grid-template-columns: 1fr 1fr; align-items: start; }
  .cpm-cert-review-meta { grid-column: 1 / -1; }
}
.cpm-cert-review-meta { display: flex; flex-direction: column; gap: .2rem; }
.cpm-cert-review-sub { font-size: .82rem; color: var(--pm-text-muted); }
.cpm-cert-review-actions { display: flex; flex-direction: column; gap: .5rem; }
.cpm-cert-review-buttons { display: flex; flex-wrap: wrap; gap: .6rem; }

.cpm-training-strip h3 {
  margin: 0; display: flex; align-items: center; gap: .5rem;
  font-family: var(--pm-font-display); font-size: 1.05rem;
}
.cpm-training-strip-row {
  display: grid; align-items: center; gap: .25rem .75rem; padding: .55rem 0;
  border-top: 1px solid var(--pm-border, rgba(255,255,255,.08));
  grid-template-columns: 1.25rem 1fr;
}
.cpm-training-strip-status { color: var(--cpm-cert); }
.cpm-training-strip-name { font-weight: 600; }
.cpm-training-strip-provider,
.cpm-training-strip-expiry {
  grid-column: 2; font-size: .8rem; color: var(--pm-text-muted);
}
@media (min-width: 700px) {
  .cpm-training-strip-row { grid-template-columns: 1.25rem 1fr auto auto; }
  .cpm-training-strip-provider,
  .cpm-training-strip-expiry { grid-column: auto; }
}
```

- [ ] **Step 2: Confirm the token names actually resolve**

`--pm-text-muted`, `--pm-accent-amber`, `--pm-accent-coral`, `--pm-surface`, `--pm-font-display`
must be declared on `.clubpm-app`. Verify rather than trusting memory — a token that does not
exist resolves to *nothing* silently, which is exactly how two ARES SVG strokes went invisible
through six review passes:

Run: `rg -n "\-\-pm-text-muted:|\-\-pm-accent-amber:|\-\-pm-accent-coral:|\-\-pm-surface:|\-\-pm-font-display:|\-\-pm-border:" public/clubpm-theme.css`

Expected: a declaration for each. `--pm-border` is the one most likely to be missing — the CSS
above already supplies a fallback for it (`var(--pm-border, rgba(255,255,255,.12))`), so if the
grep finds no `--pm-border:` line, that is fine and no change is needed. If any of the **other
five** is missing, find the real token name in the `.clubpm-app` block and use that instead.

- [ ] **Step 3: Confirm the minifier will pick it up**

`clubpm-theme.css` is already in the hardcoded `TARGETS` array of
`scripts/minify-public-css.mjs`, so this needs no change — but confirm, because the script warns
and skips rather than failing the build:

Run: `rg -n "clubpm-theme" scripts/minify-public-css.mjs`
Expected: one line inside `TARGETS`.

- [ ] **Step 4: Build and check the minifier log**

Run: `npm run build` (repo root)
Expected: `Compiled successfully`, and a `[minify-css]` line mentioning `clubpm-theme.css` with
no warning beside it.

- [ ] **Step 5: Commit**

```bash
git add public/clubpm-theme.css
git commit -m "style(trainings): certificate and training-status styles"
```

<details>
<summary><b>Paste-able prompt for Phase 11</b></summary>

```
Implement Phase 11 of docs/superpowers/plans/2026-08-25-lab-training-certifications.md
(CSS). Phases 1-10 are merged, so every component that uses these classes exists.

Context you need:
- Append to the BOTTOM of public/clubpm-theme.css. Never search-theme.css — these components
  render only under /clubpm/*.
- Step 2 is not optional. A CSS custom property that does not exist resolves to nothing
  silently rather than erroring. Actually run the rg and confirm each token has a real
  declaration on .clubpm-app before trusting it.
- After the build, read the [minify-css] log lines. The minifier warns and SKIPS a missing
  target rather than failing the build.

Do only Phase 11. Stop after its commit and paste the [minify-css] log lines.
```
</details>

---

# Phase 12 — Seed the twelve trainings and the course

**Goal:** `npm run seed:courses` installs the registry and the Porterfield Lab Safety Trainings
course.

**Files:**
- Create: `docs/courses/porterfield-lab-trainings/course.json`
- Create: `docs/courses/porterfield-lab-trainings/trainings.json`
- Create: `docs/courses/porterfield-lab-trainings/content/C01-before-you-start.md`
- Modify: `backend/scripts/seedCourses.ts`

- [ ] **Step 1: Create the registry file**

Create `docs/courses/porterfield-lab-trainings/trainings.json`. Every field is lifted from the
source document `Porterfield Lab Trainings (2).docx`:

```json
[
  {
    "slug": "biosafety-for-principal-investigators",
    "name": "Biosafety for Principal Investigators",
    "providerName": "CITI Program",
    "providerUrl": "https://www.citiprogram.org/",
    "registrationUrl": "https://www.purdue.edu/research/oevprp/regulatory-affairs/docs/CITI%20Registration%20Instruction%20Sheet%20IBC%2010.2020.pdf",
    "renewalMonths": null,
    "description": "Foundational biosafety training required by the Purdue Institutional Biosafety Committee (IBC) for all PIs. Covers risk assessment, containment practices, regulatory compliance, and NIH guidelines for recombinant DNA research."
  },
  {
    "slug": "bloodborne-pathogens",
    "name": "Bloodborne Pathogens",
    "providerName": "Purdue EHS — HSI Platform",
    "providerUrl": "https://www.purdue.edu/ehps/rem/training/index.html",
    "courseUrl": "https://www.purdue.edu/ehps/rem/laboratory/personal/Bloodborne%20Pathogens%20Program.html",
    "renewalMonths": 12,
    "description": "Annual OSHA-mandated training covering exposure risks, prevention strategies, personal protective equipment, decontamination procedures, and post-exposure protocols. Must be completed within 10 working days of starting lab work and renewed annually."
  },
  {
    "slug": "hazard-communication-awareness",
    "name": "Hazard Communication Awareness Training",
    "providerName": "Purdue EHS — HSI Platform",
    "providerUrl": "https://www.purdue.edu/ehps/rem/training/index.html",
    "courseUrl": "https://www.purdue.edu/ehps/rem/laboratory/hazmat/hazcom.html",
    "renewalMonths": 12,
    "description": "Covers OSHA Hazard Communication Standards (HazCom/GHS), Safety Data Sheets (SDS), chemical labeling requirements, and employee rights. Required for personnel working with or around hazardous chemicals. Two separate modules are available — take the one matching your role (lab vs. non-lab)."
  },
  {
    "slug": "laboratory-safety-fundamentals",
    "name": "Laboratory Safety Fundamentals (LSF) — or Refresher",
    "providerName": "Purdue EHS — HSI Platform",
    "providerUrl": "https://www.purdue.edu/ehps/rem/training/index.html",
    "renewalMonths": 12,
    "description": "Comprehensive lab safety training covering chemical hygiene, physical hazards, waste disposal, emergency procedures, and PPE. Search HSI for \"Purdue – Lab Safety Fundamentals (W/Haz Waste Disposal)\". If you completed LSF in a prior year, take the Laboratory Safety Refresher instead. Required annually."
  },
  {
    "slug": "responsible-conduct-of-research",
    "name": "Responsible Conduct of Research (RCR)",
    "providerName": "CITI Program",
    "providerUrl": "https://www.citiprogram.org/",
    "courseUrl": "https://about.citiprogram.org/series/responsible-conduct-of-research/",
    "renewalMonths": null,
    "description": "Covers research integrity, authorship, peer review, data management, conflicts of interest, and mentoring responsibilities. Often required by federal funding agencies (NSF, NIH) for graduate students and postdocs."
  },
  {
    "slug": "biosafety-and-biosecurity",
    "name": "Biosafety & Biosecurity (BSS) Comprehensive",
    "providerName": "CITI Program",
    "providerUrl": "https://www.citiprogram.org/",
    "courseUrl": "https://about.citiprogram.org/series/biosafety-and-biosecurity-bss/",
    "renewalMonths": null,
    "description": "Advanced biosafety training covering BSL-1 through BSL-3 practices, dual-use research of concern, NIH rDNA guidelines, gene transfer, select agents, incident response, and animal biosafety. Recommended for labs handling Risk Group 2+ agents."
  },
  {
    "slug": "human-subjects-research",
    "name": "Human Subjects Research (HSR)",
    "providerName": "CITI Program",
    "providerUrl": "https://www.citiprogram.org/",
    "courseUrl": "https://about.citiprogram.org/series/human-subjects-research-hsr/",
    "renewalMonths": null,
    "description": "REQUIRED IF APPLICABLE — mandatory for any research involving human participants, optional otherwise. Covers informed consent, IRB regulations, vulnerable populations, privacy, and the ethical principles of the Belmont Report. Available in Biomedical and Social-Behavioral-Educational tracks."
  },
  {
    "slug": "shipping-regulated-biological-materials",
    "name": "Shipping and Transport of Regulated Biological Materials",
    "providerName": "CITI Program",
    "providerUrl": "https://www.citiprogram.org/",
    "courseUrl": "https://about.citiprogram.org/course/shipping-and-transport-of-regulated-biological-materials/",
    "renewalMonths": null,
    "description": "Covers IATA and U.S. DOT packaging and labeling requirements for Category B (UN 3373) biological materials and exempt human/animal specimens. Recommended for labs that ship samples to collaborators or other facilities."
  },
  {
    "slug": "laser-safety",
    "name": "Laser Safety Training",
    "providerName": "Purdue EHS — HSI Platform",
    "providerUrl": "https://www.purdue.edu/ehps/rem/training/index.html",
    "renewalMonths": null,
    "description": "REQUIRED IF APPLICABLE — mandatory for anyone working with Class 3B or Class 4 lasers, optional otherwise. Covers laser classifications, biological effects on eyes and skin, control measures, protective equipment, and Purdue's Laser Safety Program. A separate Laser Safety Retraining module is available for renewal."
  },
  {
    "slug": "biological-safety-review",
    "name": "Biological Safety Review",
    "providerName": "Purdue EHS — HSI Platform",
    "providerUrl": "https://www.purdue.edu/ehps/rem/training/index.html",
    "renewalMonths": null,
    "description": "Self-paced slide review covering biosafety cabinets, PPE for biological work, waste handling, biohazard spills, and laminar flow clean bench operation. Recommended for anyone working with biological materials at BSL-1 or BSL-2."
  },
  {
    "slug": "building-emergency-plan",
    "name": "Building Emergency Plan (BEP)",
    "providerName": "Purdue EHS — HSI Platform",
    "providerUrl": "https://www.purdue.edu/ehps/rem/training/index.html",
    "courseUrl": "https://www.purdue.edu/ehps/rem/training/index.html#B",
    "renewalMonths": null,
    "description": "Covers emergency procedures specific to your building, including fire evacuation routes, tornado shelter-in-place, and lockdown protocols. Search for your building name in HSI. Strongly recommended for everyone, especially anyone new to campus."
  },
  {
    "slug": "office-ergonomics",
    "name": "Office Ergonomics Overview",
    "providerName": "Purdue EHS — HSI Platform",
    "providerUrl": "https://www.purdue.edu/ehps/rem/training/index.html",
    "renewalMonths": null,
    "description": "Introduces ergonomic principles for workstation setup, posture, and repetitive-strain injury prevention. Particularly useful if you split time between the bench and a computer."
  }
]
```

- [ ] **Step 2: Create the intro content**

Create `docs/courses/porterfield-lab-trainings/content/C01-before-you-start.md`:

```markdown
# Before you start

Everything in this course happens somewhere else. Purdue runs its safety training on two
outside platforms, and neither of them talks to Constellation — so what this course does is
tell you which trainings you need, link you to them, show you what a finished certificate
looks like, and hold onto yours once you have it.

## The two platforms

**CITI Program** ([citiprogram.org](https://www.citiprogram.org/)) hosts the research-ethics
and biosafety courses. If you have never used it, register through Purdue rather than as an
independent learner — the registration guide is linked on the first training below, and
registering the wrong way is the single most common reason a certificate does not count.

**Purdue EHS**, delivered through the **HSI platform**, hosts everything else. If you do not
have an HSI account, create one using the self-registration group at
[purdue.edu/ehps/rem/training](https://www.purdue.edu/ehps/rem/training/index.html). Once you
are in, click **View Catalog** and search for the course by name — most HSI courses have no
direct link, which is why the trainings below tell you what to search for.

## What to submit

When you finish a training, download the completion certificate and upload it to that
training's section here, along with **the completion date printed on the certificate**. Not
today's date — the one on the document. That date is what the renewal reminder is calculated
from.

Uploading completes the section immediately. An officer reviews it afterwards and you will
hear back either way; if something is wrong with it, the note explaining why comes back to you
in Slack.

## Renewals

Three of the four required trainings renew every year. You do not have to remember them —
Constellation will message you 30 days before a certificate expires, again a week before, and
once more if it lapses. The link in that message brings you back to the right section.

## Required and recommended

The **Required** module has to be finished before you begin lab work. The **Recommended**
module is optional in general, but two of its trainings are mandatory for particular kinds of
work: **Human Subjects Research** if your project involves human participants, and **Laser
Safety** if you work with Class 3B or Class 4 lasers. If either applies to you, treat it as
required.
```

- [ ] **Step 3: Create the course**

Create `docs/courses/porterfield-lab-trainings/course.json`:

```json
{
  "slug": "porterfield-lab-trainings",
  "title": "Porterfield Lab Safety Trainings",
  "summary": "The trainings you need before you work in the lab, where to take them, and where to put the certificate when you're done. Four required, eight recommended, and the annual ones will remind you themselves.",
  "estimatedMinutes": 20,
  "status": "DRAFT",
  "modules": [
    {
      "order": 0,
      "title": "Required",
      "summary": "Finish all four before you begin laboratory work. Three of them renew every year.",
      "estimatedMinutes": 10,
      "isRequired": true,
      "sequential": false,
      "sections": [
        {
          "order": 0,
          "title": "Before you start",
          "kind": "CONTENT",
          "isRequired": true,
          "bodyRef": "content/C01-before-you-start.md"
        },
        {
          "order": 1,
          "title": "Biosafety for Principal Investigators",
          "kind": "TRAINING",
          "isRequired": true,
          "trainingSlug": "biosafety-for-principal-investigators"
        },
        {
          "order": 2,
          "title": "Bloodborne Pathogens",
          "kind": "TRAINING",
          "isRequired": true,
          "trainingSlug": "bloodborne-pathogens"
        },
        {
          "order": 3,
          "title": "Hazard Communication Awareness Training",
          "kind": "TRAINING",
          "isRequired": true,
          "trainingSlug": "hazard-communication-awareness"
        },
        {
          "order": 4,
          "title": "Laboratory Safety Fundamentals",
          "kind": "TRAINING",
          "isRequired": true,
          "trainingSlug": "laboratory-safety-fundamentals"
        }
      ]
    },
    {
      "order": 1,
      "title": "Recommended",
      "summary": "Optional in general. Human Subjects Research and Laser Safety are mandatory if that kind of work applies to you.",
      "estimatedMinutes": 10,
      "isRequired": false,
      "sequential": false,
      "sections": [
        {
          "order": 0,
          "title": "Responsible Conduct of Research (RCR)",
          "kind": "TRAINING",
          "isRequired": false,
          "trainingSlug": "responsible-conduct-of-research"
        },
        {
          "order": 1,
          "title": "Biosafety & Biosecurity (BSS) Comprehensive",
          "kind": "TRAINING",
          "isRequired": false,
          "trainingSlug": "biosafety-and-biosecurity"
        },
        {
          "order": 2,
          "title": "Human Subjects Research (HSR)",
          "kind": "TRAINING",
          "isRequired": false,
          "trainingSlug": "human-subjects-research"
        },
        {
          "order": 3,
          "title": "Shipping and Transport of Regulated Biological Materials",
          "kind": "TRAINING",
          "isRequired": false,
          "trainingSlug": "shipping-regulated-biological-materials"
        },
        {
          "order": 4,
          "title": "Laser Safety Training",
          "kind": "TRAINING",
          "isRequired": false,
          "trainingSlug": "laser-safety"
        },
        {
          "order": 5,
          "title": "Biological Safety Review",
          "kind": "TRAINING",
          "isRequired": false,
          "trainingSlug": "biological-safety-review"
        },
        {
          "order": 6,
          "title": "Building Emergency Plan (BEP)",
          "kind": "TRAINING",
          "isRequired": false,
          "trainingSlug": "building-emergency-plan"
        },
        {
          "order": 7,
          "title": "Office Ergonomics Overview",
          "kind": "TRAINING",
          "isRequired": false,
          "trainingSlug": "office-ergonomics"
        }
      ]
    }
  ]
}
```

- [ ] **Step 4: Teach the seeder about trainings**

In `backend/scripts/seedCourses.ts`, add a registry upsert that runs **before** the section
loop, and a section branch that resolves `trainingSlug` to an id.

Near the top, beside the other helpers:

```ts
/**
 * Upsert a course's trainings.json into the Training registry.
 *
 * Matched on `slug`, which is why trainingService.updateTraining refuses to
 * change one: reseeding after a slug churn would create duplicates rather than
 * updating in place.
 *
 * Never clears exampleFileId — an author uploads the sample certificate through
 * the UI, and reseeding must not throw it away.
 */
async function seedTrainings(dir: string, authorId: string): Promise<Map<string, string>> {
  const file = path.join(dir, "trainings.json");
  const bySlug = new Map<string, string>();
  if (!fs.existsSync(file)) return bySlug;

  const entries = JSON.parse(fs.readFileSync(file, "utf8")) as Array<{
    slug: string; name: string; providerName: string;
    providerUrl?: string; courseUrl?: string; registrationUrl?: string;
    description?: string; renewalMonths?: number | null;
  }>;

  for (const t of entries) {
    const data = {
      name: t.name,
      providerName: t.providerName,
      providerUrl: t.providerUrl ?? null,
      courseUrl: t.courseUrl ?? null,
      registrationUrl: t.registrationUrl ?? null,
      description: t.description ?? null,
      renewalMonths: t.renewalMonths ?? null,
      archivedAt: null,
    };
    const row = await prisma.training.upsert({
      where: { slug: t.slug },
      update: data,
      create: { ...data, slug: t.slug, createdById: authorId },
    });
    bySlug.set(t.slug, row.id);
  }
  console.log(`  ✓ ${entries.length} training(s) in the registry`);
  return bySlug;
}
```

In the course-seeding function, after the course upsert and before the section loop:

```ts
  const trainingIds = await seedTrainings(dir, authorId);
```

And in the section loop, beside the other `if (s.kind === ...)` branches:

```ts
      if (s.kind === "TRAINING" && s.trainingSlug) {
        const id = trainingIds.get(s.trainingSlug);
        if (id) {
          data.trainingId = id;
        } else {
          // Same treatment as a dangling bodyRef: install the section anyway so
          // the rest of the course opens, and print it at the end of the run.
          pendingRefs.push(`${doc.slug}: no training "${s.trainingSlug}" in trainings.json`);
        }
      }
```

Add `trainingSlug?: string;` to whatever type the script uses for a section entry.

- [ ] **Step 5: Run the seeder**

Run: `cd backend && npm run seed:courses`
Expected: a line `✓ 12 training(s) in the registry` and the course installed with no dangling
refs printed for `porterfield-lab-trainings`.

- [ ] **Step 6: Verify the rows landed**

Run:

```bash
cd backend && npx tsx -e "import{prisma}from'./src/db/prisma.js';const t=await prisma.training.count();const s=await prisma.courseSection.count({where:{kind:'TRAINING'}});console.log({trainings:t,trainingSections:s});await prisma.\$disconnect();"
```

Expected: `{ trainings: 12, trainingSections: 12 }`.

- [ ] **Step 7: Run it a second time to prove idempotency**

Run: `cd backend && npm run seed:courses`
Then re-run the Step 6 count.
Expected: still `{ trainings: 12, trainingSections: 12 }` — not 24. If the counts doubled, the
upsert is matching on the wrong field.

- [ ] **Step 8: Commit**

```bash
git add docs/courses/porterfield-lab-trainings backend/scripts/seedCourses.ts
git commit -m "feat(trainings): seed the twelve Purdue trainings and the lab course"
```

<details>
<summary><b>Paste-able prompt for Phase 12</b></summary>

```
Implement Phase 12 of docs/superpowers/plans/2026-08-25-lab-training-certifications.md
(seed data + seeder support). Phases 1-11 are merged.

Context you need:
- Courses are authored as files under docs/courses/<slug>/ and installed with
  cd backend && npm run seed:courses. The seeder reads the repo working tree.
- The seeder is idempotent and must STAY idempotent — Step 7 runs it twice and checks the
  counts did not double. Actually run it twice.
- seedTrainings must never clear exampleFileId. Authors upload the sample certificate through
  the UI; reseeding must not throw it away.
- Copy the existing `if (s.kind === "X" && s.xRef)` branch idiom in the section loop, and use
  the existing pendingRefs array for a trainingSlug that does not resolve.
- All twelve trainings and their URLs are in the plan, lifted from the source .docx. Do not
  invent or "correct" a URL.

Do only Phase 12. Stop after its commit and paste the Step 6 and Step 7 counts.
```
</details>

---

## Self-review notes

Checked against the design doc:

- **§3 data model** → Phase 1. All four schema additions plus the two `NotificationType`
  values (which the spec implied via "in-app notification" but did not enumerate — added here).
- **§3.5 derived status** → Phase 2, with the ordered cascade tested directly.
- **§4.1 trainingService** → Phases 2 (pure), 3/4/5 (persistence). `sanitizeTrainingInput`
  gained URL-scheme validation the spec did not spell out; a `javascript:` URL in a field the
  learner is told to click is worth the four lines.
- **§4.2 routes** → Phases 3, 4, 5. All eleven routes are covered. Route-ordering verification
  is an explicit step in both Phase 3 and Phase 5 because `GET /:id` will shadow `/trainings`
  otherwise.
- **§4.3 completion + reward gate** → Phase 4 (`submitCertificate`), Phase 5
  (`reopenSectionForMember`). The `rewardGrantedAt` rule is restated in the code comment, the
  step text, and both phase prompts.
- **§4.4 expiry cron** → Phase 6, with `dueReminder` extracted as a pure function so the
  fire-once-per-threshold behaviour is testable — the spec described the thresholds but left
  the "don't nag daily for thirty days" mechanism unspecified.
- **§5 frontend** → Phases 7–10, styles in 11.
- **§6 seed** → Phase 12, all twelve trainings with the URLs from the source document.
- **§7 testing** → Phase 2 (`computeExpiry`, `deriveStatus`, `sanitizeTrainingInput`), Phase 6
  (`dueReminder`). The spec's authorization test is a manual curl in Phase 5 Step 6 rather than
  an automated test: the backend has no HTTP test harness, and adding one is a larger change
  than this feature justifies. **This is a deliberate downgrade from the spec** — flagged
  rather than silently dropped.

Type consistency: `CertLike`, `TrainingStatus`, `TrainingInput`, `ExpiryThreshold`,
`CERT_STATUS`, and the four status strings are used identically everywhere they appear.
`deriveStatus` exists twice on purpose — once in TypeScript on the server (authoritative) and
once in JS in `TrainingSection.jsx` (for the chip); the JSX copy carries a comment saying so.