# Lab Training Certifications — Design

**Date:** 2026-08-25
**Status:** Approved, ready for implementation planning

## 1. The problem

Lab safety training for the Porterfield lab is currently a Word document
(`Porterfield Lab Trainings (2).docx`) listing twelve trainings with links out to
CITI Program and the Purdue EHS "HSI" platform. Nothing tracks who has done what,
nobody knows what a valid certificate looks like until they have submitted a
wrong one, and certificates arrive as Slack attachments that are lost within a
week. Three of the four *required* trainings renew annually, and nothing tracks
expiry at all.

This design replaces the sheet with a Constellation course, backed by a shared
training registry and retained, admin-reviewed certificate submissions.

### What Constellation cannot do

The trainings themselves live on CITI and HSI. Constellation cannot host them and
should not pretend to. A training section is therefore **explain → link out →
collect proof**, not a lesson.

## 2. Decisions

Locked during brainstorming:

| Question | Decision |
|---|---|
| Scope | Course **plus** a standing compliance signal with expiry, not a one-time onboarding gate. |
| Review gate | Approval required, but the **course section completes on upload**. A slow admin never blocks a member; the compliance status still tells the truth. |
| Expiry source | Member enters the completion date printed on the certificate; the server computes expiry from the training's renewal period. An admin can correct it at review. |
| Catalog | A **shared training registry**. One `Training` row is referenced by any number of course sections, so a Bloodborne Pathogens certificate satisfies it everywhere. |
| Requirement tiers | Two: required / optional. "Required if applicable" (Human Subjects, Laser Safety) stays as prose in the description. |
| Surfaces | No new route. Everything lives in the course player, the course editor, `CourseProgressDashboard`, and a status strip on the existing Profile page. |
| Certificate privacy | Owner + admins only, streamed through an authenticated backend proxy. Files stay private in the bot's Drive. |
| Registry CRUD | Inline in the course editor when adding a `TRAINING` section. |
| Renewal path | Expiry cron → in-app notification + Slack DM → deep link reopens the course section for re-upload. |

### Rejected alternatives

- **A denormalized `MemberTrainingRecord` (member × training).** It is a cache of
  something already true in the certificate rows, and unlike `Member.xp` there is
  no single `grantXP()`-style chokepoint to force the dual write through. The
  expiry cron — the only thing it really bought — works fine off an index on
  `TrainingCertificate`.
- **A three-tier required / conditional / recommended model** with a
  self-declaration question ("do you work with Class 3B+ lasers?"). More faithful
  to the document, but it adds per-member requirement state to every roster
  query for two trainings out of twelve.
- **A standalone `/clubpm/trainings` page.** Rejected in favour of reusing
  existing surfaces.

## 3. Data model

All additions are in `backend/prisma/schema.prisma`.

### 3.1 Enum additions

```prisma
enum CourseSectionKind {
  CONTENT
  VIDEO
  QUIZ
  SLIDES
  WALKTHROUGH
  LIT_REVIEW
  ASSIGNMENT
  TRAINING        // new
}

enum TrainingCertStatus {
  PENDING
  APPROVED
  REJECTED
}
```

### 3.2 `Training` — the shared registry

```prisma
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
  /// Separate from courseUrl — CITI's registration instructions are a PDF that is
  /// not the course, and HSI courses are found by catalog search rather than URL.
  registrationUrl String?
  description     String?
  /// null → never expires. 12 → annual.
  renewalMonths   Int?
  /// The author-uploaded sample certificate, so a learner knows what to submit.
  exampleFileId   String?
  exampleFileName String?
  exampleMimeType String?
  createdById     String
  createdBy       Member    @relation("TrainingCreator", fields: [createdById], references: [id])
  /// Soft delete. A registry entry referenced by a historical certificate must
  /// never be hard-deleted.
  archivedAt      DateTime?
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  sections     CourseSection[]
  certificates TrainingCertificate[]

  @@index([archivedAt])
}
```

### 3.3 `CourseSection.trainingId`

```prisma
model CourseSection {
  // ... existing fields ...
  trainingId String?
  training   Training? @relation(fields: [trainingId], references: [id])
  // ...
  @@index([trainingId])
}
```

A real foreign key, **not** a `trainingConfig` JSON column. The one-JSON-column
idiom used by `videoConfig` / `slideConfig` / `tourConfig` / `litConfig` /
`assignmentConfig` exists for per-section configuration; the registry is shared
*across* sections and courses, which JSON cannot express. Required-vs-optional
rides on the existing `CourseSection.isRequired`, so a `TRAINING` section needs no
config column of its own.

### 3.4 `TrainingCertificate` — one row per upload attempt

```prisma
/// One learner's certificate submission. One row PER ATTEMPT, never updated in
/// place except by review — the same idiom as CourseWorkSubmission. The attempt
/// history is what makes a disputed rejection resolvable.
model TrainingCertificate {
  id             String             @id @default(cuid())
  trainingId     String
  training       Training           @relation(fields: [trainingId], references: [id])
  memberId       String
  member         Member             @relation("TrainingCertificateMember", fields: [memberId], references: [id], onDelete: Cascade)
  /// Which course section it was uploaded from, if any. Nullable so a certificate
  /// can outlive the course that collected it.
  sectionId      String?
  section        CourseSection?     @relation(fields: [sectionId], references: [id], onDelete: SetNull)

  /// The file is RETAINED, unlike CourseWorkSubmission which discards it after
  /// text extraction. It stays private in the bot's Drive and is served only
  /// through the authenticated proxy route.
  driveFileId    String
  fileName       String
  fileMimeType   String
  fileSize       Int

  /// The date printed on the certificate, entered by the member.
  completedOn    DateTime
  /// Server-computed: completedOn + training.renewalMonths. Null when the
  /// training never expires. Snapshotted at submission, so changing a registry
  /// entry's renewalMonths later does not silently re-date existing certificates.
  expiresOn      DateTime?

  status         TrainingCertStatus @default(PENDING)
  reviewedById   String?
  reviewedBy     Member?            @relation("TrainingCertificateReviewer", fields: [reviewedById], references: [id], onDelete: SetNull)
  reviewedAt     DateTime?
  /// Required on REJECTED — the member is told why.
  reviewNote     String?
  /// Set by the expiry cron so a member is not nagged twice for the same
  /// threshold crossing.
  lastRemindedAt DateTime?
  createdAt      DateTime           @default(now())

  @@index([trainingId, memberId])
  @@index([status])
  @@index([status, expiresOn])
}
```

`expiresOn` is snapshotted rather than derived on read. If an author later edits
`renewalMonths` from 12 to 24, already-submitted certificates keep the expiry
they were issued under; only new submissions use the new period.

### 3.5 Derived status

There is no status column for a member's standing. It is computed from the
certificate rows:

```
deriveStatus(certificatesForMemberAndTraining, now) →
  1. UP_TO_DATE      an APPROVED cert exists with (expiresOn is null OR expiresOn > now)
  2. PENDING_REVIEW  else, a PENDING cert exists
  3. EXPIRED         else, an APPROVED cert exists (necessarily past expiresOn)
  4. NOT_COMPLETED   else (no certs, or only REJECTED)
```

The order of those four tests is the specification, not an implementation detail,
and it is what makes the two interesting cases come out right:

- **Early renewal.** An unexpired approval plus a newer pending resubmission is
  `UP_TO_DATE`, not `PENDING_REVIEW`. A member who renews a month early is still
  compliant today.
- **Lapsed and resubmitted.** An expired approval plus a newer pending is
  `PENDING_REVIEW`, not `EXPIRED`. They have done their part; the yellow warning
  should stop nagging them and the queue should show the admin's turn.

Display vocabulary, using Font Awesome (never emoji):

| Status | Icon | Colour | Meaning |
|---|---|---|---|
| `UP_TO_DATE` | `fa-circle-check` | green | approved, not past `expiresOn` |
| `PENDING_REVIEW` | `fa-hourglass-half` | slate | uploaded, awaiting admin review |
| `EXPIRED` | `fa-triangle-exclamation` | yellow | approved, past `expiresOn` |
| `NOT_COMPLETED` | `fa-circle-xmark` | red | nothing uploaded, or last one rejected |

An **optional** training (`isRequired: false`) with status `NOT_COMPLETED` renders
muted as "Optional — not started", never red. Red is reserved for a required
training a member actually owes.

## 4. Backend

### 4.1 `services/trainingService.ts`

Pure logic, unit-tested, no Prisma in the tested functions:

- `computeExpiry(completedOn: Date, renewalMonths: number | null): Date | null`
- `deriveStatus(certs: CertLike[], now: Date): TrainingStatus`
- `sanitizeTrainingInput(body): TrainingInput` — trims, validates URLs are
  `http(s)`, clamps `renewalMonths` to 1–120 or null.

Plus Prisma-touching helpers: `listTrainings()`, `upsertTraining()`,
`recordCertificate()`, `reviewCertificate()`, `getMemberTrainingStatuses(memberId)`.

Every registry field is learner-safe — there is no author-only secret in a
`Training`, so unlike `sanitizeLitConfig` / `sanitizeAssignmentConfig` there is no
learner-payload sanitizer to write. Say so in a comment so the next person does
not assume one is missing.

### 4.2 Routes

All on `coursesRouter` (mounted under `/api/outreach/courses`), mirroring the
existing handout routes.

```
GET    /trainings                       registry list, for the author picker
POST   /trainings                       create a registry entry           (author/admin)
PATCH  /trainings/:tid                  edit a registry entry             (author/admin)
POST   /trainings/:tid/example          multipart example-cert upload → bot Drive
DELETE /trainings/:tid/example
GET    /trainings/:tid/example-file     streams the example cert (any authed member)

POST   /sections/:sid/certificate       multipart { file, completedOn } → PENDING
GET    /sections/:sid/certificates      the caller's own attempts for this section

GET    /certificates/pending            admin review queue
POST   /certificates/:cid/review        { decision, note } → APPROVED | REJECTED
GET    /certificates/:cid/file          authenticated proxy — owner or admin only
```

Notes:

- Uploads use `multer.memoryStorage()` with a 25 MB / 1 file limit, exactly like
  the existing `/sections/:sid/handout` route. `express.json()`'s 100 kb body
  limit does not apply to multipart, so `app.ts` needs no change.
- Both file routes use the existing `driveService.streamDriveFile()`. Certificate
  files are **never** passed to `makeDriveFilePublic()` — that is the whole point
  of the proxy. Example certificates are author-uploaded samples and could be
  public, but go through the proxy too so there is one code path.
- Every handler reads `req.memberId`, never `req.session.memberId`.
- `GET /certificates/:cid/file` authorises on `cert.memberId === req.memberId ||
  member.isAdmin`, re-read from the database, not trusted from the client.

### 4.3 Section completion and the reward gate

`courseProgressService.ts` gains `TRAINING` handling:

- **On upload:** write the certificate row, mark `CourseSectionProgress`
  `COMPLETED`, and return through the existing `withRewardEnvelope()` so
  RewardFlux / quests / rank-up fire exactly as other section kinds do.
- **On rejection:** flip the section back to `IN_PROGRESS`, notify the member with
  `reviewNote`.
- **On expiry:** flip the section back to `IN_PROGRESS` so it accepts a new
  upload.

> **Load-bearing rule.** Reopening a section must **never** clear
> `CourseSectionProgress.rewardGrantedAt` or `CourseEnrollment.rewardGrantedAt`.
> These are idempotency gates, exactly like `Task.rewardGrantedAt`. Clear them and
> every annual renewal re-grants course XP, forever. The reopen path sets
> `status` and `completedAt` only.

`isSectionUnlocked` is untouched — a `TRAINING` section gates like any other.

### 4.4 Expiry cron

One job added to `backend/src/slack/scheduler.ts`, daily at **08:15** (beside the
existing 08:00 due-date reminders):

1. Select `TrainingCertificate` where `status = APPROVED`, `expiresOn` is not
   null, and `expiresOn <= now + 30 days`.
2. Keep only the newest certificate per (member, training) — an older superseded
   row must not generate a reminder.
3. Skip any whose `lastRemindedAt` is newer than the last threshold crossed
   (thresholds: 30 days out, 7 days out, and lapsed).
4. Send an in-app notification via `notificationCrud.createNotification()` and a
   Slack DM via `dmBatcher.queueDm()`, deep-linking to the course section.
5. For lapsed certificates, reopen the section per §4.3 — skipping any whose
   `sectionId` is null, since there is no section to reopen. Those still get the
   notification and DM.
6. Stamp `lastRemindedAt`.

## 5. Frontend

New components under `src/components/clubpm/courses/`:

- **`TrainingSection.jsx`** (learner). Provider badge, description, "Open training ↗"
  to `courseUrl`, a "Registration instructions ↗" link when `registrationUrl` is
  set, an example-certificate preview, and the upload form (file input +
  `completedOn` date picker labelled "the date printed on your certificate").
  Below it, the member's own attempt history with status chips.
- **`TrainingBuilder.jsx`** (author). Typeahead over the registry plus inline
  "create new". Editing an existing entry shows an explicit warning that the
  change applies to **every course using it** — the cost of a shared registry, and
  the UI must say it rather than let an author discover it.
- **`CertificateReviewPanel.jsx`** (admin). A new panel inside the existing
  `CourseProgressDashboard`: pending certificates with member, training,
  `completedOn`, computed `expiresOn`, an inline viewer hitting the proxy route,
  and approve / reject-with-note actions.
- **`TrainingStatusStrip.jsx`**. Rendered on the existing Profile page; the
  member's colored training rows, visible year-round after the course is done.

Wiring:

- `CoursePlayerPage.jsx` — render `TrainingSection` for `kind === "TRAINING"`.
- `CourseEditorPage.jsx` — render `TrainingBuilder` for `kind === "TRAINING"`.
- `AppShell.jsx` — a pending-certificate count joins the existing admin badges for
  pending rewards and change requests.
- `src/api/clubPmClient.js` — fetch wrappers; the certificate upload uses the
  XHR-with-progress idiom already used by `uploadVaultFile()`.

CSS goes at the bottom of `public/clubpm-theme.css` (these render only under
`/clubpm/*`), namespaced `cpm-training-*`.

## 6. Seed data

A script under `backend/scripts/` (or `prisma/seed` equivalent) creates the twelve
registry entries and a **"Porterfield Lab Safety Trainings"** course with two
modules, both `sequential: false` so trainings can be worked in any order:

**Module 1 — Required** (`isRequired: true` on each section)

| # | Training | Provider | Renewal |
|---|---|---|---|
| 1 | Biosafety for Principal Investigators | CITI Program | none |
| 2 | Bloodborne Pathogens | Purdue EHS / HSI | 12 months |
| 3 | Hazard Communication Awareness Training | Purdue EHS / HSI | 12 months |
| 4 | Laboratory Safety Fundamentals (LSF) — or Refresher | Purdue EHS / HSI | 12 months |

**Module 2 — Recommended** (`isRequired: false` on each section)

| # | Training | Provider | Renewal |
|---|---|---|---|
| 5 | Responsible Conduct of Research (RCR) | CITI Program | none |
| 6 | Biosafety & Biosecurity (BSS) Comprehensive | CITI Program | none |
| 7 | Human Subjects Research (HSR) | CITI Program | none |
| 8 | Shipping and Transport of Regulated Biological Materials | CITI Program | none |
| 9 | Laser Safety Training | Purdue EHS / HSI | none |
| 10 | Biological Safety Review | Purdue EHS / HSI | none |
| 11 | Building Emergency Plan (BEP) | Purdue EHS / HSI | none |
| 12 | Office Ergonomics Overview | Purdue EHS / HSI | none |

URLs taken from the source document:

> **Superseded 2026-08-25 — every `purdue.edu/ehps/rem/*` URL below is dead, and
> not in a way a link checker catches.** Purdue moved EHS from `/ehps/rem/` to
> `/operations/ehs/`, and the old paths still answer **HTTP 200** with a
> JavaScript stub whose canonical is `https://www.purdue.edu/home/` — so all six
> of them silently dropped the member on Purdue's homepage. `www.citiprogram.org`
> and the RCR series URL 301 elsewhere, and the IBC registration PDF 301s to a
> generic compliance index. Four trainings also shipped with no `courseUrl` at
> all. The corrected, status-checked set is in
> `docs/courses/porterfield-lab-trainings/trainings.json`; treat that file as the
> source of truth and this list as history. **If you re-verify these, check the
> response body, not the status code.**

- CITI Program: `https://www.citiprogram.org/`
- CITI registration instructions (PDF):
  `https://www.purdue.edu/research/oevprp/regulatory-affairs/docs/CITI%20Registration%20Instruction%20Sheet%20IBC%2010.2020.pdf`
- Purdue EHS/REM: `https://www.purdue.edu/ehps/rem/`
- HSI catalog + self-registration: `https://www.purdue.edu/ehps/rem/training/index.html`
- Bloodborne Pathogens program:
  `https://www.purdue.edu/ehps/rem/laboratory/personal/Bloodborne%20Pathogens%20Program.html`
- Hazard Communication program:
  `https://www.purdue.edu/ehps/rem/laboratory/hazmat/hazcom.html`
- Building Emergency Plan: `https://www.purdue.edu/ehps/rem/training/index.html#B`
- RCR: `https://about.citiprogram.org/series/responsible-conduct-of-research/`
- BSS: `https://about.citiprogram.org/series/biosafety-and-biosecurity-bss/`
- HSR: `https://about.citiprogram.org/series/human-subjects-research-hsr/`
- Shipping: `https://about.citiprogram.org/course/shipping-and-transport-of-regulated-biological-materials/`

Descriptions are lifted from the source document. Human Subjects Research and
Laser Safety keep their "required if you do this kind of work" language in the
description prose, since the two-tier model does not encode it.

Example certificates are **not** seeded — an admin uploads them through
`TrainingBuilder` once real samples exist. A training with no example certificate
renders the upload form without the preview block; it must not render a broken
image or an empty slot.

## 7. Testing

- `backend/src/services/trainingService.test.ts` — `computeExpiry` (month
  arithmetic across year boundaries, `renewalMonths: null`, Feb 29 completion),
  `deriveStatus` (no certs; only rejected; pending only; approved unexpired;
  approved expired; approved-expired plus newer pending; early renewal where an
  unexpired approval coexists with a newer pending).
- `sanitizeTrainingInput` — rejects non-http URLs, clamps `renewalMonths`.
- An authorisation test asserting `GET /certificates/:cid/file` refuses a member
  who is neither the owner nor an admin.

## 8. Known risks

- **Drive bot account.** Certificates live in the bot account's Drive under the
  `drive.file` scope. Per the 2026-08-08 account switch, `drive.file` grants do
  not transfer between accounts — if the bot account is ever changed again, every
  stored certificate is orphaned. Certificates are more consequential to lose than
  blog images. Worth a follow-up on export/backup, out of scope here.
- **Shared-registry edits.** Editing a `Training` changes it in every course. The
  builder warns, but nothing prevents it. Acceptable at current scale (one lab);
  revisit if a second lab needs divergent wording for the same training.
- **Self-reported completion dates.** A member could enter a date that does not
  match their certificate. The admin sees both the date and the file at review,
  which is the control. No automated verification.

## 9. Implementation order

Phased so each phase fits one fresh session, per the CLAUDE.md phase rule
(≤ 50 tool calls, ≤ 4 files, never a Prisma migration and frontend work in the
same phase):

1. Schema + migration (`TRAINING` kind, `Training`, `TrainingCertificate`,
   `CourseSection.trainingId`).
2. `trainingService.ts` + its tests — pure logic first, no routes.
3. Registry routes + example-certificate upload/stream.
4. Certificate submission route + `courseProgressService` `TRAINING` completion.
5. Review routes + the reopen-on-rejection path.
6. Expiry cron in `scheduler.ts`.
7. `clubPmClient.js` wrappers + `TrainingSection.jsx`.
8. `TrainingBuilder.jsx` + `CourseEditorPage` wiring.
9. `CertificateReviewPanel.jsx` + `AppShell` badge.
10. `TrainingStatusStrip.jsx` + Profile wiring.
11. CSS in `clubpm-theme.css`.
12. Seed script for the twelve trainings and the course.

The detailed plan is produced separately by the writing-plans skill.
