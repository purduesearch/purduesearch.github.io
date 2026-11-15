# Skills to careers: O*NET alignment, verified impact numbers, employer connections

Created 2026-11-15 (plan slug `saffron-osprey`). Work branch: `feat/skills-careers` from `main` (6dbe7327).
Handoff with the single controller prompt: `2026-11-15-skills-careers-HANDOFF.md` beside this file.
Progress: `2026-11-15-skills-careers-PROGRESS.md`. Mockups (approved direction, sample data):
https://claude.ai/artifact/MdRYh8atW3VQSacAX764vg (six boards: Career profile, Pathway match, Skill detail,
Opportunities, Public impact + talent, Admin metrics).
Status: no phases done.

## Goal

1. **Align the skills catalog with O*NET 31.0** (U.S. Department of Labor, August 2026, CC BY 4.0). Import the
   reference data locally and link every club skill to an O*NET Software Skills example, a content-model
   element (Essential/Transferable skill, Knowledge, Work Style) or a Detailed Work Activity (DWA).
2. **Show 2026 employer demand.** O*NET's `Hot Technology` and `In Demand` flags (from employer job postings)
   mark the tools employers ask for. Admins add short, cited hiring signals (NACE, WEF, LinkedIn).
3. **Attach usable numbers to every skill.** A deterministic **impact metric registry** counts real records,
   for example "trained 14 members" or "released 12 CAD parts". Each count maps to an O*NET work activity,
   carries a proof level and becomes a résumé bullet whose number stays linked to its source.
4. **Connect members with employers and attract new members.** (A) a public club impact page, (B) an opt-in
   talent directory with a sponsor portal and consent-gated intros, (C) an opportunities feed from USAJOBS,
   public ATS job boards and sponsor posts, and (D) Open Badges 3.0 credentials with LinkedIn
   "Add to profile" links.

## Research basis (verified 2026-11-15)

- **O*NET 31.0** is the current release (August 2026). CSV download:
  `https://www.onetcenter.org/dl_files/database/db_31_0_csv.zip` (16 MB). Release 30.3 restructured the model.
  The old Skills file is now `essential_skills.csv` (10 elements, `2.A.*`: Reading Comprehension, Active
  Listening, Writing, Speaking, Mathematics, Science, Critical Thinking, Active Learning, Learning Strategies,
  Monitoring) and `transferable_skills.csv` (25 elements, `2.B.*`, e.g. Coordination `2.B.1.b`, Instructing
  `2.B.1.e`, Complex Problem Solving `2.B.2.i`, Programming `2.B.3.e`, Troubleshooting `2.B.3.k`). Both use
  scales `IM` (Importance 1–5) and `LV` (Level 0–7). "Technology Skills" was renamed `software_skills.csv`
  with columns `O*NET-SOC Code, Title, Workplace Example, Element ID, Element Name, Hot Technology, In Demand`
  (31,821 rows, 176 hot technologies; `Element ID` is a `2.E.*` software category, e.g. `2.E.9.c` Computer
  aided design CAD software). `work_styles.csv` has 21 elements (`1.D.*`) on scales `DR`/`WI`.
  `gwas_to_iwas_to_dwas.csv` (2,087 DWAs) and `tasks_to_dwas.csv` link occupations to work activities.
  `job_titles.csv` has 54,269 lay titles (`O*NET-SOC Code, Title, Job Title, Short Title, Source(s)`).
  `emerging_tasks.csv` (`Category` New/Revision) lists new work, e.g. Aerospace Engineers: "Develop and test
  autonomous systems for uncrewed aerospace vehicles." Attribution pattern: "O*NET 31.0 Database by U.S.
  Department of Labor, Employment and Training Administration (USDOL/ETA), licensed under CC BY 4.0."
  The data is O*NET 31.0 (August 2026). Re-check the headers and counts in this plan when importing a
  newer release.
- **What employers want in 2026.** NACE Job Outlook 2026: teamwork, problem-solving and communication lead.
  Employers want examples rather than lists, and 70% use skills-based hiring. WEF Future of Jobs 2025: AI and
  big data, networks and cybersecurity, and technological literacy grow fastest to 2030. LinkedIn Skills on
  the Rise 2026: mentorship, cross-functional collaboration and AI skills. O*NET In Demand tools for Aerospace
  Engineers (17-2011.00): AutoCAD, C, C++, CATIA, SolidWorks, Simulink, Excel, Office, PowerPoint, Python, MATLAB.
- **Employer channels.** The USAJOBS Search API is free: request a key at developer.usajobs.gov/APIRequest.
  Send headers `Host: data.usajobs.gov`, `User-Agent: <registered email>` and `Authorization-Key: <key>`.
  Greenhouse (`boards-api.greenhouse.io/v1/boards/{token}/jobs?content=true`), Lever
  (`api.lever.co/v0/postings/{site}?mode=json`, EU `api.eu.lever.co`) and Ashby
  (`api.ashbyhq.com/posting-api/job-board/{name}?includeCompensation=true`) serve published jobs without
  auth; you need each company's board token. Rejected: Handshake (no student-organization API; members
  export instead), Lightcast (free tier 50 calls/month, license unclear), CareerOneStop (duplicates local
  O*NET), LinkedIn/Indeed job APIs (closed).
- The existing seed (`skillSeedData.ts`) only names skills "after" ESCO/O*NET/SFIA and sets no `externalId`.
  `docs/SKILLS.md` says a full import was always expected later.

## Locked decisions (Henry, 2026-11-15; do not re-litigate)

1. **Scope:** core (O*NET import, links, impact metrics, Career tab, exports) plus options **A** (public impact
   page), **B** (talent directory + sponsor portal), **C** (opportunities feed: USAJOBS + Greenhouse/Lever/Ashby
   for admin-listed companies + sponsor posts) and **D** (Open Badges 3.0 + LinkedIn Add to profile).
2. **O*NET is local data.** A dev script extracts a pruned subset (about 1.5 MB gzipped) into
   `backend/data/onet/31.0/onet-subset.json.gz`, which is committed with `ATTRIBUTION.md`. A loader puts it
   into Postgres. The O*NET Web Services API is not used. The server never downloads O*NET.
3. **Numbers never come from a model.** Impact metrics, bullets, pathway matching, opportunity matching,
   sponsor views and badges are deterministic, with no Gemini calls. The weekly skills pipeline is unchanged.
4. **Proof levels:** `RECORDS` (counted from Constellation rows), `CONFIRMED` (a RECORDS metric whose
   registry entry needs a lead/admin to confirm it before it can be shared), `CLAIM` (member-entered value with
   an evidence link, shareable only after an admin verifies it). Pending claims never leave the member's view.
5. **Sharing is off by default.** `CareerProfile.shareWithSponsors` and `showOnPublicPage` are independent and
   both default `false`. A public card shows first name and last initial, major, graduation term, target roles
   and the bullets the member picked. Never an email, photo, Slack id or level. Public aggregates hide any
   count below 3.
6. **Sponsors** sign in by magic link (admin-invited `SponsorUser`). Tokens persist only as SHA-256 hashes.
   Links expire after 15 minutes. Sessions are HMAC Bearer tokens (7 days, `tokenVersion` revocation), modeled
   on member auth but on a separate secret. Sponsors see only members with `shareWithSponsors`, only shareable
   proof levels, and only through an allow-list builder. An intro request reaches the member first. Contact
   details go both ways only after the member accepts. Limit: 20 intro requests per sponsor user per 7 days.
7. **No ranking of people.** The directory sorts alphabetically or by graduation term. Filters narrow; they
   never score members. No total score or leaderboard anywhere, so existing skills invariants hold.
8. **No scheduled digests.** New postings, intros and badges never trigger a cron-driven Slack DM or email
   digest. An intro request is a reactive `createNotification` (preference-routed). Crons added here only
   maintain data (snapshot recompute, opportunity fetch, token cleanup).
9. **Badges are member-claimed.** A member claims a badge once its threshold holds. The award stores an
   immutable VC-JWT (Ed25519, `jose`, pinned exactly). Credentials are revocable and never auto-published.
10. **Exports are client-side:** print stylesheet (no server PDF, since puppeteer is absent on the server),
    JSON Resume v1.0.0 download, copy text, LinkedIn Add to profile links.
11. **Career lives in the Skills workspace** as a new **Career** view (`/clubpm/profile?tab=skills`, view
    `career`). Public pages: `/impact`, `/sponsors` (portal) and `/badges/:id` (verify page).
12. **Executor:** one controller (Sol 6.1, medium) plus one implementation subagent per phase. Phases tagged
    **[deep]** use the controller's strongest subagent setting. The Phase 23 reviewer is a fresh agent that wrote
    none of Phases 15, 16 or 21.

## Data model (Phase 2 pastes this; the migration SQL is written to match `prisma migrate diff` output)

```prisma
// ── O*NET reference (O*NET 31.0, USDOL/ETA, CC BY 4.0). Written only by onetLoadService. ──
enum OnetDomain { ESSENTIAL_SKILL TRANSFERABLE_SKILL KNOWLEDGE WORK_STYLE SOFTWARE_CATEGORY GWA IWA DWA OTHER }
enum OnetLinkKind { SOFTWARE ELEMENT DWA }
enum OnetLinkRelation { EXACT BROADER RELATED }

model OnetRelease {
  version      String   @id // "31.0"
  releasedOn   String   // "2026-08"
  sourceSha256 String   // sha256 of onet-subset.json.gz
  counts       Json
  active       Boolean  @default(false)
  loadedAt     DateTime @default(now())
}

model OnetOccupation {
  code        String              @id // "17-2011.00"
  title       String
  description String
  jobZone     Int?
  ratings     OnetRating[]
  software    OnetSoftware[]
  dwas        OnetOccupationDwa[]
  titles      OnetJobTitle[]
  emerging    OnetEmergingTask[]
  @@index([title])
}

/// Content-model elements. parentId: IWA for a DWA, GWA for an IWA, the parent category otherwise.
model OnetElement {
  id          String     @id // O*NET Element ID, e.g. "2.B.1.e", "2.E.9.c", "4.A.4.b.3.d.1"
  name        String
  description String?
  domain      OnetDomain
  parentId    String?
  @@index([domain])
  @@index([parentId])
}

model OnetRating {
  occupationCode String
  occupation     OnetOccupation @relation(fields: [occupationCode], references: [code], onDelete: Cascade)
  elementId      String
  scale          String  // IM | LV | DR
  value          Float
  suppress       Boolean @default(false)
  notRelevant    Boolean @default(false)
  @@id([occupationCode, elementId, scale])
  @@index([elementId, scale])
}

model OnetSoftware {
  id             Int            @id @default(autoincrement())
  occupationCode String
  occupation     OnetOccupation @relation(fields: [occupationCode], references: [code], onDelete: Cascade)
  example        String         // "Dassault Systemes SolidWorks"
  exampleNorm    String         // onetLinkCore.normalizeExample(example)
  categoryId     String         // "2.E.9.c"
  hot            Boolean
  inDemand       Boolean
  @@unique([occupationCode, example, categoryId])
  @@index([exampleNorm])
  @@index([categoryId])
}

model OnetOccupationDwa {
  occupationCode String
  occupation     OnetOccupation @relation(fields: [occupationCode], references: [code], onDelete: Cascade)
  dwaId          String
  @@id([occupationCode, dwaId])
  @@index([dwaId])
}

model OnetJobTitle {
  id             Int            @id @default(autoincrement())
  occupationCode String
  occupation     OnetOccupation @relation(fields: [occupationCode], references: [code], onDelete: Cascade)
  title          String
  titleNorm      String
  @@index([titleNorm])
}

model OnetEmergingTask {
  id             Int            @id @default(autoincrement())
  occupationCode String
  occupation     OnetOccupation @relation(fields: [occupationCode], references: [code], onDelete: Cascade)
  task           String
  category       String         // New | Revision
}

model OnetRelatedOccupation {
  occupationCode String
  relatedCode    String
  tier           String // Primary-Short | Primary-Long | Supplemental
  rank           Int
  @@id([occupationCode, relatedCode])
}

// ── Club skill ↔ O*NET ──
model SkillOnetLink {
  id          String           @id @default(cuid())
  skillId     String
  skill       Skill            @relation(fields: [skillId], references: [id], onDelete: Cascade)
  kind        OnetLinkKind
  /// SOFTWARE: OnetSoftware.exampleNorm. ELEMENT / DWA: O*NET Element ID.
  ref         String
  relation    OnetLinkRelation @default(EXACT)
  origin      String           @default("AUTO") // AUTO | CURATED | ADMIN
  createdById String?
  createdAt   DateTime         @default(now())
  @@unique([skillId, kind, ref])
  @@index([kind, ref])
}

// ── Career ──
enum AttestationKind { CLAIM CONFIRM }
enum AttestationStatus { PENDING VERIFIED DECLINED NEEDS_PROOF }
enum IntroStatus { PENDING ACCEPTED DECLINED EXPIRED WITHDRAWN }
enum OpportunitySourceKind { USAJOBS GREENHOUSE LEVER ASHBY SPONSOR }

model CareerProfile {
  memberId          String   @id
  member            Member   @relation(fields: [memberId], references: [id], onDelete: Cascade)
  major             String?
  gradTerm          String?  // "2028-05"
  openTo            String[] @default([]) // INTERNSHIP | COOP | FULL_TIME | RESEARCH
  availableFrom     String?  // "2027-05"
  headline          String?
  shareWithSponsors Boolean  @default(false)
  showOnPublicPage  Boolean  @default(false)
  updatedAt         DateTime @updatedAt
}

model CareerTarget {
  memberId  String
  member    Member   @relation(fields: [memberId], references: [id], onDelete: Cascade)
  onetCode  String
  position  Int      @default(0)
  createdAt DateTime @default(now())
  @@id([memberId, onetCode])
}

/// Derived and recomputable. One row per member and metric.
model ImpactSnapshot {
  memberId      String
  member        Member   @relation(fields: [memberId], references: [id], onDelete: Cascade)
  metricId      String
  value         Float
  detail        Json     // { breakdown, projects: [{ id, name }], since }
  sourceRefs    String[] @default([]) // first 50 source ids, for audit
  metricVersion String
  computedAt    DateTime @default(now())
  @@id([memberId, metricId])
  @@index([metricId])
}

model ImpactAttestation {
  id          String            @id @default(cuid())
  memberId    String
  member      Member            @relation(fields: [memberId], references: [id], onDelete: Cascade)
  kind        AttestationKind
  metricId    String?           // CONFIRM: registry id. CLAIM: null.
  label       String?           // CLAIM only, ≤80 chars
  value       Float
  unit        String?           // CLAIM only: USD | people | hours | items
  dwaId       String?
  evidenceUrl String?
  note        String?
  status      AttestationStatus @default(PENDING)
  reviewerId  String?
  reviewedAt  DateTime?
  reviewNote  String?
  createdAt   DateTime          @default(now())
  @@index([status, createdAt])
  @@index([memberId])
}

model ResumeBullet {
  id         String   @id @default(cuid())
  memberId   String
  member     Member   @relation(fields: [memberId], references: [id], onDelete: Cascade)
  sourceKind String   // METRIC | ATTESTATION
  sourceId   String   // metric id or attestation id
  template   String?  // member wording; must contain {n} exactly once
  included   Boolean  @default(true)
  position   Int      @default(0)
  updatedAt  DateTime @updatedAt
  @@unique([memberId, sourceKind, sourceId])
}

model DemandSignal {
  id             String   @id @default(cuid())
  title          String
  summary        String
  sourceName     String
  sourceUrl      String
  publishedOn    String   // "2026-04"
  onetElementIds String[] @default([])
  skillIds       String[] @default([])
  metricIds      String[] @default([])
  active         Boolean  @default(true)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
}

model SponsorOrg {
  id                String        @id @default(cuid())
  name              String
  website           String?
  outreachContactId String?
  active            Boolean       @default(true)
  accessUntil       DateTime?
  createdAt         DateTime      @default(now())
  users             SponsorUser[]
}

model SponsorUser {
  id           String              @id @default(cuid())
  orgId        String
  org          SponsorOrg          @relation(fields: [orgId], references: [id], onDelete: Cascade)
  email        String              @unique
  name         String?
  tokenVersion Int                 @default(0)
  lastLoginAt  DateTime?
  disabledAt   DateTime?
  createdAt    DateTime            @default(now())
  loginTokens  SponsorLoginToken[]
  intros       IntroRequest[]
}

model SponsorLoginToken {
  tokenHash     String      @id // sha256 hex
  sponsorUserId String
  sponsorUser   SponsorUser @relation(fields: [sponsorUserId], references: [id], onDelete: Cascade)
  expiresAt     DateTime
  usedAt        DateTime?
  createdAt     DateTime    @default(now())
  @@index([expiresAt])
}

model IntroRequest {
  id            String      @id @default(cuid())
  sponsorUserId String
  sponsorUser   SponsorUser @relation(fields: [sponsorUserId], references: [id], onDelete: Cascade)
  memberId      String
  member        Member      @relation(fields: [memberId], references: [id], onDelete: Cascade)
  opportunityId String?
  message       String      // ≤1000 chars
  status        IntroStatus @default(PENDING)
  respondedAt   DateTime?
  expiresAt     DateTime    // createdAt + 21 days
  createdAt     DateTime    @default(now())
  @@index([memberId, status])
  @@index([sponsorUserId, createdAt])
}

model OpportunitySource {
  id            String                @id @default(cuid())
  kind          OpportunitySourceKind
  label         String
  companyName   String?
  /// USAJOBS { keyword, hiringPath? } | GREENHOUSE { boardToken } | LEVER { site, region? } | ASHBY { jobBoardName } | SPONSOR { sponsorOrgId }
  config        Json
  enabled       Boolean               @default(true)
  lastFetchedAt DateTime?
  lastError     String?
  createdAt     DateTime              @default(now())
  opportunities Opportunity[]
}

model Opportunity {
  id             String            @id @default(cuid())
  sourceId       String
  source         OpportunitySource @relation(fields: [sourceId], references: [id], onDelete: Cascade)
  externalId     String
  title          String
  company        String?
  location       String?
  url            String
  postedAt       DateTime?
  closesAt       DateTime?
  employmentType String?
  isInternship   Boolean           @default(false)
  description    String            // plain text, ≤20,000 chars
  onetCodes      String[]          @default([])
  skillIds       String[]          @default([])
  firstSeenAt    DateTime          @default(now())
  lastSeenAt     DateTime          @default(now())
  expiredAt      DateTime?
  saves          OpportunitySave[]
  @@unique([sourceId, externalId])
  @@index([expiredAt])
}

model OpportunitySave {
  memberId      String
  member        Member      @relation(fields: [memberId], references: [id], onDelete: Cascade)
  opportunityId String
  opportunity   Opportunity @relation(fields: [opportunityId], references: [id], onDelete: Cascade)
  createdAt     DateTime    @default(now())
  @@id([memberId, opportunityId])
}

/// Singleton (id "default"), created on first read.
model CareerSettings {
  id              String   @id @default("default")
  disabledMetrics String[] @default([])
  updatedAt       DateTime @updatedAt
}

/// credentialJwt is immutable once written; revocation sets revokedAt only.
model BadgeAward {
  id               String    @id @default(cuid())
  memberId         String
  member           Member    @relation(fields: [memberId], references: [id], onDelete: Cascade)
  achievementId    String
  value            Float
  issuedAt         DateTime  @default(now())
  credentialJwt    String    @db.Text
  credentialSha256 String
  revokedAt        DateTime?
  revokedReason    String?
  @@unique([memberId, achievementId])
}
```

Also in Phase 2: add back-relations to `Member` (`careerProfile CareerProfile?`, `careerTargets CareerTarget[]`,
`impactSnapshots ImpactSnapshot[]`, `impactAttestations ImpactAttestation[]`, `resumeBullets ResumeBullet[]`,
`introRequests IntroRequest[]`, `opportunitySaves OpportunitySave[]`, `badgeAwards BadgeAward[]`) and to `Skill`
(`onetLinks SkillOnetLink[]`). Add `CAREER_INTRO_REQUEST` and `CAREER_ATTESTATION_REVIEWED` to
`NotificationType`, each `ALTER TYPE … ADD VALUE` in its own statement. Migration:
`backend/prisma/migrations/20261116120000_skills_careers/migration.sql`.

## Impact metric registry (Phase 6 pure core; Phase 7 queries)

`impactMetricCore.ts` exports `METRICS` (array, order = display order), `METRIC_VERSION = "impact-v1"`,
`PUBLIC_FLOOR = 3`. Each entry: `{ id, label, unitSingular, unitPlural, proof: "RECORDS" | "CONFIRMED",
dwaId: string | null, softwareCategories: string[], bulletTemplate, achievement?: { id, threshold } }`.
Templates use `{n}` for the number, `{tool}` for the member's strongest linked tool (fallback text in the
template), and `{projects}` for up to two project names. Fields marked † must be verified with
`rg -n "model X" -A 30 backend/prisma/schema.prisma` before writing the query.

| id | Counted from (member = M) | dwaId | proof | Achievement |
|---|---|---|---|---|
| `members_trained` | distinct `CourseEnrollment.memberId ≠ M` with `completedAt` set, on `Course.createdById = M` | `4.A.4.b.3.d.1` Train personnel to enhance job skills | RECORDS | `trainer` ≥5 |
| `courses_authored` | `Course` with `createdById = M`, `status` published† | `4.A.3.b.6.l.10` Develop training materials | RECORDS | — |
| `cad_items_released` | distinct `VaultItem` (not soft-deleted) where some `ChangeRequestItem.version.uploadedById = M` and the CR `status = APPROVED` | `4.A.3.b.2.d.1` Create models of engineering designs or methods | RECORDS | `cad-release` ≥5 |
| `cad_revisions` | `VaultVersion.uploadedById = M` | `4.A.2.b.2.o.18` Create graphical representations of mechanical equipment | RECORDS | — |
| `drawings_released` | subset of `cad_items_released` with `VaultItem.drawingForId` set | `4.A.3.b.6.i.2` Document technical design details | RECORDS | — |
| `design_reviews` | distinct CRs where `ChangeRequest.reviewerId = M` and status APPROVED/REJECTED, union `VaultSignoff.memberId = M` | `4.A.2.a.4.e.3` Evaluate designs or specifications to ensure quality | RECORDS | `design-reviewer` ≥5 |
| `prs_merged` | distinct `SkillEvidence.sourceRef` with `source = GITHUB`, `contribution = AUTHORED`, `outcome = MERGED`, `supersededAt = null` | `4.A.2.b.2.b.1` Develop software or computer applications | RECORDS | `software-contributor` ≥10 |
| `code_reviews` | distinct `SkillEvidence.sourceRef` with `source = REVIEW` and `sourceRef` containing `:review:` | `4.A.2.a.4.e.3` | RECORDS | — |
| `tasks_completed` | DONE tasks with M as assignee†; `detail.onTimeRate` = share with `completedAt ≤ dueDate` among those with a due date | null | RECORDS | — |
| `lab_hours` | sum of confirmed `LabVisit.totalMinutes` / 60 (same filter as `labVisitService.getLabTimeSummary`) | null | RECORDS | `lab-practitioner` ≥50 |
| `team_led` | per project where `ProjectMember.isLead` for M: distinct non-bot task assignees other than M; value = max over projects; `detail.tasksShipped` | `4.A.4.b.4.a.2` Supervise engineering or other technical personnel | CONFIRMED | `team-lead` ≥3 (verified) |
| `events_organized` | `Event.organizerId = M`, not `DEADLINE`, `startTime` in the past | `4.A.4.b.4.j.20` Coordinate logistics for productions or events | RECORDS | — |
| `outreach_attendees` | attended `EventRsvp` rows (members + guests) on public events M organized | `4.A.4.b.4.j.20` | RECORDS | `outreach-organizer` ≥50 |
| `outreach_published` | `OutreachSubmission.authorId = M`, status published† | `4.A.3.b.6.p.3` Write advertising or promotional material | RECORDS | — |
| `blog_posts_published` | published `BlogPost` by M† (author field) | `4.A.3.b.6.l.5` Write informational material | RECORDS | — |
| `milestones_delivered` | completed milestones† owned by M | `4.A.4.b.4.j.12` Manage operations, research, or logistics projects | RECORDS | — |

Bot members (`isBot` or the field the schema uses†) never count, including as trainees or assignees.
Approved `TrainingCertificate` rows feed the résumé **Certifications** list, not a metric.

## Phases

Every phase touches at most 4 source files plus their tests and stays under 50 tool calls. Gate after each:
root `npm run build` (includes the tour-anchor check), and in `backend/` run `npm run typecheck` and
`npm test`. Run root `npm run test:ci` when `src/` changed. Registry files are controller-owned (list in the
handoff). Never read `schema.prisma`, `tasks.ts`, `ProjectDetail.jsx`, `TaskModal.jsx`,
`public/clubpm-theme.css` or `public/search-theme.css` in full; use `rg` anchors.

### Phase 1: O*NET subset extractor (dev-time)
Files: `backend/src/services/onetCsvCore.ts` (+test), `backend/scripts/onet-extract.ts`,
`backend/data/onet/31.0/onet-subset.json.gz`, `backend/data/onet/31.0/ATTRIBUTION.md`.
- Controller first: `curl -sSL -o /tmp/onet/db.zip https://www.onetcenter.org/dl_files/database/db_31_0_csv.zip`
  then `python3 -m zipfile -e /tmp/onet/db.zip /tmp/onet/` (no unzip binary needed). If there is no network,
  stop and ask Henry for the zip.
- `onetCsvCore.ts`: RFC 4180 parser (quoted fields, embedded commas/newlines, BOM), `normalizeText` (lower-case,
  NFKD, strip diacritics, non-alphanumerics to single spaces, trim; the one normalizer every later phase
  imports), `buildSubset(files)`.
  Output keys and row shapes (compact arrays): `occ [code,title,desc]`, `el [id,name,desc]`,
  `rat [code,elementId,scale,value,suppress,notRelevant]` (essential, transferable, knowledge: IM+LV;
  work_styles: DR), `sw [code,example,elementId,hot,inDemand]`, `dwa [gwaId,iwaId,dwaId,dwaName]`,
  `odwa [code,dwaId]` (unique), `jt [code,jobTitle]`, `jz [code,jobZone]`, `em [code,task,category]`,
  `rel [code,relatedCode,tier,rank]`, plus `meta { version: "31.0", releasedOn: "2026-08", files: {name: rows} }`.
  Reference counts: 1,016 occ, 3,006 el, 142,471 rat, 31,821 sw, 2,087 dwa, 18,583 odwa, 54,269 jt, 923 jz,
  338 em, 18,460 rel. About 12.9 MB raw, 1.5 MB at gzip level 9. Fail if any header differs from the
  research section.
- Script: `tsx scripts/onet-extract.ts --dir /tmp/onet/db_31_0_csv --out data/onet/31.0/onet-subset.json.gz`.
  Registry line: `backend/package.json` script `"onet:extract"`.
- Tests use a tiny inline CSV fixture, never the real file.

### Phase 2: Schema + migration [deep]
Files: `backend/prisma/schema.prisma`, the migration SQL. Paste the Data model block and the back-relations.
Run `npx prisma validate`, `npx prisma format`, `npx prisma generate`. Produce the SQL with
`npx prisma migrate diff --from-schema-datamodel <copy of old schema> --to-schema-datamodel prisma/schema.prisma --script`.
Never run `migrate dev` against a real database. No other code in this phase.

### Phase 3: O*NET loader
Files: `backend/src/services/onetLoadService.ts` (+test), `backend/scripts/onet-load.ts`,
`backend/src/services/onetCsvCore.ts` (+test, `normalizeExample`).
- Reads the gz, verifies `meta.version`, computes sha256. In one transaction (timeout 300 s): delete every
  O*NET table, `createMany` in 5,000-row batches, derive `OnetElement.domain` from the id prefix (`2.A`
  essential, `2.B` transferable, `2.C` knowledge, `1.D` work style, `2.E` software category, DWA/IWA/GWA from
  the `dwa` rows; else OTHER) and `parentId`, then upsert `OnetRelease` as active (deactivate others).
  `titleNorm` = `normalizeText(title)`. `exampleNorm` = `normalizeExample(example)`, which this phase adds to
  `onetCsvCore.ts` (vendor prefixes stripped through a fixed list: Dassault Systemes, The MathWorks, MathWorks,
  Autodesk, PTC, Microsoft, Atlassian, National Instruments, Siemens, Oracle, IBM; "Amazon Web Services AWS"
  becomes "aws"; a trailing "software" is dropped; then `normalizeText`). Phase 5 imports both; never fork them.
- After loading, report dangling `SkillOnetLink` refs (no matching element/example) without deleting them.
- Registry lines: `backend/package.json` `"onet:load"`; `.github/workflows/seed-backend.yml` new option
  `onet` running `npm run onet:load`.
- Tests: injected Prisma-like store, a 10-row fixture, idempotent double load, release switch.

### Phase 4: Starter taxonomy refresh for 2026 demand
Files: `backend/src/services/skillSeedData.ts`, `backend/src/services/skillOnetCurated.ts` (+test).
- Read the seed first. Add the missing concepts below with `source: "ONET"` (tools/techniques) or `"CLUB"`, each
  with aliases and a parent. Seeding stays add-only. AI-assisted engineering (LLM tools, prompt design),
  Machine learning (PyTorch, scikit-learn), Data analysis (pandas, SQL), Cybersecurity fundamentals, Cloud
  basics (AWS), C, C++, Simulink, CATIA, Creo, AutoCAD, Mentorship, Cross-functional collaboration, Instructing,
  Technical writing, Public speaking, Project scheduling (Jira, MS Project). Skip any that already exist by
  name or alias.
- `skillOnetCurated.ts`: `CURATED_LINKS: { slug, kind, ref, relation }[]` for every starter skill where a
  confident mapping exists (tools → `SOFTWARE` exampleNorm; soft/technique skills → `ELEMENT` such as Coordination
  `2.B.1.b`, Instructing `2.B.1.e`, Writing `2.A.1.c`, Programming `2.B.3.e`, Troubleshooting `2.B.3.k`; work →
  `DWA`). Generate candidates with a throwaway script against the subset, review them by hand, and commit only
  the reviewed list. The test asserts every slug exists in the seed and every ref exists in the subset (load the
  gz in the test; it is in the repo).

### Phase 5: Linker core + link service
Files: `backend/src/services/onetLinkCore.ts` (+test), `backend/src/services/onetLinkService.ts` (+test).
- Core: `proposeLinks(skills+aliases, softwareExamples, elements)`, using `normalizeExample` /
  `normalizeText` from `onetCsvCore.ts`. Exact name/alias matches only (never fuzzy). Each proposal carries its
  reason.
- Service: `applyCuratedLinks()` (idempotent upsert, origin CURATED), `autoLink(skillId)` (origin AUTO,
  exact matches only), `listUnlinked()`, `setLink/removeLink` (admin, origin ADMIN). Hook: newly created
  catalog skills call `autoLink` after `skillCatalogService` creates them. Return the one-line call site as a
  registry line if it touches a file outside the phase.
- `getSkillDemand(skillIds)`: for SOFTWARE links, `{ hot, inDemandOccupations: count, occupationsListed:
  count, examples }`; for ELEMENT links, top occupations by IM.

### Phase 6: Impact metric registry core (pure)
Files: `backend/src/services/impactMetricCore.ts` (+test).
Exactly the registry table. Also `ACHIEVEMENTS` (derived from the table), `shareable(proof, attestation)`,
`publicAggregate(values[])` (sum, distinct contributors, null if contributors < `PUBLIC_FLOOR`),
`renderBullet(template, { n, tool, projects })`, and `validateMemberTemplate(t)` (exactly one `{n}`, ≤300
chars, no other braces). Tests pin every template rendering and boundary.

### Phase 7: Impact metric service + nightly recompute [deep]
Files: `backend/src/services/impactMetricService.ts` (+test), `backend/scripts/impact-recompute.ts`.
- One query function per metric (verify † fields first). `computeForMember(memberId)` writes all snapshots in one
  transaction (upsert). `recomputeAll()` pages members 50 at a time with an advisory lock (same pattern as
  skills runs). `{tool}` resolution: the member's highest-level non-disputed `AI_INFERRED` or
  `MANAGER_VERIFIED` skill linked (SOFTWARE) to a metric `softwareCategories` example; null → template fallback.
- Registry lines: `scheduler.ts` cron `40 3 * * *` `recomputeAllImpact` (data maintenance, no Slack send, never
  throws); `backend/package.json` `"impact:recompute"`.
- Tests: in-memory store fixtures per metric, including bots excluded, self-enrollment excluded, soft-deleted
  Vault items excluded, superseded evidence excluded, and lead with zero assignees giving 0.

### Phase 8: Résumé + JSON Resume cores (pure)
Files: `backend/src/services/resumeCore.ts` (+test).
`buildBullets(snapshots, attestations, bulletRows, metricDefs)`: proof gating, member overrides, ordering,
pending claims flagged `pending: true`. `buildJsonResume(profile, member, bullets, skills, certifications,
badges)` conforms to JSON Resume v1.0.0 (`basics`, `work[0]` = Purdue SEARCH with `highlights`, `skills` grouped
by area, `certificates`). It never includes pending claims or levels. `buildPlainText()` for copy.

### Phase 9: Pathway match
Files: `backend/src/services/pathwayCore.ts` (+test), `backend/src/services/pathwayService.ts` (+test).
For an occupation code and a member: `tools` = that occupation's software rows where `inDemand || hot`, each
mapped through SOFTWARE links to the member's status (`demonstrated` = level ≥3 or MANAGER_VERIFIED;
`learning` = level 1–2 or goal; `claimed` = SELF_CLAIMED only; `none`). `skills` = top 7 essential+transferable
by IM, mapped through ELEMENT links (status as above, with `notInferred` when no club skill links to it).
`activities` = the occupation's DWAs ∩ the member's nonzero metric `dwaId`s. `emerging` = the occupation's
emerging tasks plus open unassigned accessible tasks whose title shares ≥2 normalized tokens with the task
(reuse `skillWorkspaceService` access rules). `related` = related occupations (Primary tiers). Respects skill
visibility only for non-self viewers (none in v1: pathway is self-only).

### Phase 10: Career API (member)
Files: `backend/src/api/career.ts` (+test). Mount `/api/career` (registry line for `app.ts`).
`requireAuth`, identity from `req.memberId`, writes throttled. Routes: `GET /me` (profile, targets, snapshots
with shareability, bullets, attestations, certifications, badges summary, O*NET attribution), `PUT /me/profile`,
`PUT /me/targets { codes[≤3] }`, `GET /occupations?q=` (search by title + lay titles, 20 max),
`GET /pathway/:code`, `POST /me/recompute` (rate-limited 1/minute), `PUT /me/bullets/:sourceKind/:sourceId`,
`POST /me/claims`, `DELETE /me/claims/:id` (pending only), `GET /me/export.json` (JSON Resume),
`GET /demand-signals`. Errors use the existing JSON error shape. Tests through the existing route test harness pattern
(see `workspaces.test.ts`).

### Phase 11: Career admin API
Files: `backend/src/api/careerAdmin.ts` (+test). Mount `/api/admin/career` (`requireAuth`, `requireAdmin`).
`GET /onet/status` (release, counts, dangling links), `GET /onet/unlinked`, `PUT|DELETE /skills/:id/onet-links`,
`POST /onet/apply-curated`, `GET|PUT /metrics` (`CareerSettings.disabledMetrics`; a disabled metric is still
computed but never shown or shared), `GET /attestations?status=`,
`POST /attestations/:id/review { status, note }` (notifies with `CAREER_ATTESTATION_REVIEWED`), CRUD
`/demand-signals` (seed the three cited signals from the research section on first GET when empty).
`team_led` confirm: `POST /confirm { memberId, metricId }` creates a VERIFIED CONFIRM attestation at the current
snapshot value.

### Phase 12: Career view: impact + résumé (frontend)
Files: `src/components/clubpm/career/CareerView.jsx` (+test), `src/components/clubpm/career/ResumeBuilder.jsx`,
`src/pages/ClubPM/SkillsWorkspace.jsx` (add the `career` view button with `data-tour-id="skills.career"`),
`src/api/clubPmClient.js` (career helpers).
Matches mockup board 1: target-role chips, impact tiles with proof badges and DWA line, bullet list with
include/edit (template editor enforces `{n}`), paper preview, export buttons (copy, print route, JSON Resume
download, LinkedIn link for badges only). CSS: the subagent appends `pm-career-*` rules to
`public/clubpm-theme.css`. The controller does the cache bump (`?v=` in `src/clubpm/loadClubPmTheme.js`, the
`public/index.html` preload, the loader test) and the course sync in the same commit:
`src/clubpm/tour/tourAnchors.js` + `docs/courses/ANCHORS.md` entry `skills.career` (label "Career", route
`/clubpm/profile?tab=skills`). Then search `docs/courses/` with `rg -n "Team coverage|Skills workspace"` and add
Career to any prose that lists the Skills views. Every later phase that edits `clubpm-theme.css` gets the same
controller bump.

### Phase 13: Pathway + skill detail (frontend)
Files: `src/components/clubpm/career/PathwayView.jsx` (+test), `src/components/clubpm/career/OccupationPicker.jsx`,
the existing skill evidence drawer component (find with `rg -n "evidence" src/components/clubpm/skills
src/pages/ClubPM/SkillsWorkspace.jsx`), CSS as Phase 12 (bump `?v=` again).
Boards 2 and 3: tools table with HOT / IN DEMAND flags, importance bars, emerging task, signals strip, and in the
skill drawer an O*NET placement crumb, demand line, "Your numbers" from metrics whose categories match, the
suggested bullet and linked DWAs. O*NET attribution line on both.

### Phase 14: Career settings + print route
Files: `src/components/clubpm/career/CareerSettings.jsx` (+test), `src/pages/ClubPM/CareerPrint.jsx`,
`src/App.js` route `/clubpm/career/print` (registry line), CSS.
Settings: major, grad term, open to, availability, headline, the two sharing toggles with plain explanations
(what sponsors see vs the public page) and the claim form (label, value, unit, evidence link). Print page:
a one-column résumé section with `@media print` rules, nothing else on the page.

### Phase 15: Sponsor auth [deep]
Files: `backend/src/services/sponsorAuthService.ts` (+test), `backend/src/middleware/sponsorAuth.ts` (+test),
`backend/src/api/sponsor.ts` (auth routes only) (+test).
`POST /api/sponsor/login { email }` always answers 202 (no account enumeration). For an active user in an
active org within `accessUntil`, it stores a hashed 32-byte token (15 min) and emails a link to
`${FRONTEND_URL}/sponsors?t=<token>` via `emailService.send`. `POST /api/sponsor/session { token }` makes the
token single-use and returns a Bearer token signed with `SPONSOR_TOKEN_SECRET` (7 days, includes
`tokenVersion`). `requireSponsor` sets `req.sponsorUserId`. Rate limit: 5 login requests per email per hour.
Mount `/api/sponsor` **above every bare `/api` router**; add it to `appMountOrder.test.ts` (registry lines).
Cron registry line: `23 * * * *` delete used or expired `SponsorLoginToken` rows.

### Phase 16: Talent directory + intros [deep]
Files: `backend/src/services/talentDirectoryCore.ts` (+test), `backend/src/services/introService.ts` (+test),
`backend/src/api/sponsor.ts` (directory/intros), `backend/src/api/career.ts` (member intro inbox routes).
- `buildSponsorCard` / `buildPublicCard` by allow-list construction (decision 5). Inputs: profile, targets
  (codes + titles), shareable bullets only (RECORDS, CONFIRMED with VERIFIED attestation, CLAIM VERIFIED),
  certifications (name + provider only), badges (achievement name + verify URL). Never spread a Prisma row.
- `GET /api/sponsor/directory?role=&tool=&gradTerm=&openTo=` sorts alphabetically by display name.
  `POST /api/sponsor/intros { memberId, message, opportunityId? }`: the member must be shareable, at most 1
  pending request per sponsor-member pair, 20 per sponsor user per 7 days. It calls `createNotification`
  (`CAREER_INTRO_REQUEST`, `slackText` with a deep link to the Career view; preference-routed).
  `GET /api/sponsor/intros` returns the member's email only when ACCEPTED.
- Member: `GET /api/career/me/intros`, `POST /api/career/me/intros/:id { accept: boolean }`. Accept emails the
  sponsor the member's email and chosen bullets. Expiry: a lazy check on read, plus the Phase 15 cleanup cron
  marking `expiresAt < now` PENDING rows EXPIRED.
- Tests: non-shared member invisible and 404 on intro, pending claim never in a card, email absent before
  accept, rate limits, alphabetical order.

### Phase 17: Public impact page (option A)
Files: `backend/src/services/publicImpactService.ts` (+test), `backend/src/api/public.ts` (one route:
`GET /api/public/impact`, `max-age=3600`), `src/pages/Public/Impact.jsx` (+test), `src/App.js` route `/impact`
(registry line).
Totals per metric via `publicAggregate` (floor 3). Tool counts: members with a demonstrated (level ≥3, not
disputed, skill shared publicly **or** to the team) skill linked to a hot technology, floor 3. Featured cards:
`buildPublicCard` for `showOnPublicPage` members only. Page (board 5, public look: `search-theme.css` tokens,
Oswald/Lato) with Join and Sponsor CTAs. Append lean `impact-*` CSS to `public/search-theme.css`. Add `/impact`
to `public/sitemap.xml` and a Navbar link (registry: `src/components/Navbar.jsx`). Use `SITE_URL`, never a
hard-coded domain.

### Phase 18: Sponsor portal frontend (option B)
Files: `src/pages/Public/Sponsors.jsx` (+test), `src/components/sponsor/SponsorDirectory.jsx`,
`src/api/sponsorClient.js`, `src/App.js` route `/sponsors` (registry line).
Login (email → "check your inbox"), token exchange from `?t=` (then strip it from the URL), the directory with
filters, card detail, intro request form, the sponsor's intro list, and a sponsor posting form (needs Phase 20;
render it behind `features.postings` from the API). The token lives in `sessionStorage`, sent as Bearer. Public
look; CSS in `search-theme.css` under `sponsor-*`. Member side: intro inbox panel in `CareerView.jsx` (accept /
decline with a preview of exactly what the sponsor will receive).

### Phase 19: Opportunity parsers + matching (pure)
Files: `backend/src/services/opportunityParseCore.ts` (+test), `backend/src/services/opportunityMatchCore.ts` (+test).
- Parsers turn each source's JSON (fixtures recorded by hand from the documented shapes; keep them small) into
  `{ externalId, title, company, location, url, postedAt, closesAt, employmentType, description }`. HTML is
  stripped to text (no external library), description capped at 20,000. USAJOBS:
  `SearchResult.SearchResultItems[].MatchedObjectDescriptor`. Verify field names against
  developer.usajobs.gov when network is available. If it is not, implement `PositionTitle`, `PositionURI`,
  `OrganizationName`, `PositionLocationDisplay`, `PublicationStartDate`, `ApplicationCloseDate` and note it in
  the receipt.
- Matching: `matchOccupations(title)` uses exact `titleNorm` in `OnetJobTitle`, then the same after stripping
  seniority/intern words (`intern`, `internship`, `co-op`, `student trainee`, `junior`, `senior`, `I`–`IV`),
  then token-overlap ≥0.6 against occupation titles; max 3 codes. `matchSkills(text, aliasIndex)` uses
  word-boundary alias matching only. `isInternship` uses fixed keywords.

### Phase 20: Opportunity service + APIs
Files: `backend/src/services/opportunityService.ts` (+test), `backend/src/api/careerAdmin.ts` (source CRUD +
`POST /sources/:id/fetch`), `backend/src/api/career.ts` (`GET /me/opportunities`, `PUT|DELETE
/me/opportunities/:id/save`), `backend/src/api/sponsor.ts` (`POST|PATCH|DELETE /postings`).
- Fetch uses injected `fetch` with a fixed host allowlist (`data.usajobs.gov`, `boards-api.greenhouse.io`,
  `api.lever.co`, `api.eu.lever.co`, `api.ashbyhq.com`). Tokens are validated `^[A-Za-z0-9_-]{1,80}$`. Timeout is
  15 s, at most 500 jobs per source, no redirects followed. USAJOBS uses headers from `USAJOBS_API_KEY` and
  `USAJOBS_USER_AGENT_EMAIL`; skip with `lastError` when unset. Upsert by `(sourceId, externalId)`. Rows not seen
  in a successful fetch get `expiredAt`. Expired rows older than 60 days are deleted (saves cascade).
- Sponsor postings: `OpportunitySource` kind SPONSOR per org (created lazily), visible to members only.
- Member feed: unexpired, `onetCodes ∩ (targets ∪ their Primary related)` non-empty, ranked by count of the
  member's demonstrated skills in `skillIds`, then `postedAt`. The response includes `why: { occupations,
  haveSkills, gapSkills }`. Nothing about the member is sent outward.
- Registry lines: cron `25 4 * * *` `refreshOpportunities` (gated by `CAREERS_FEED_ENABLED=1`, never throws,
  no notifications); root `.env.example` keys `CAREERS_FEED_ENABLED`, `USAJOBS_API_KEY`,
  `USAJOBS_USER_AGENT_EMAIL`, `SPONSOR_TOKEN_SECRET`.

### Phase 21: Badges backend [deep]
Files: `backend/src/services/badgeCore.ts` (+test), `backend/src/services/badgeService.ts` (+test),
`backend/src/api/badges.ts` (public, +test), `backend/src/api/career.ts` (claim/revoke routes).
- First verify against the 1EdTech Open Badges 3.0 spec (https://www.imsglobal.org/spec/ob/v3p0/): the
  `@context` URLs, VC data model version (`validFrom` vs `issuanceDate`), VC-JWT claim mapping, and the
  `IdentityObject` hashing rule. Pin them as constants with a comment citing the spec section. If there is no
  network, use the latest values you know and add `OPEN` in the receipt for Henry to confirm with the validator
  in Phase 25.
- `badgeCore.buildCredential(award, member, achievement, issuer)`: an `OpenBadgeCredential` with
  `AchievementSubject` whose identifier is a salted sha256 hash of the member's email (never the plain email),
  an achievement with criteria narrative and a `result` carrying the value ("Trained 14 members"), and
  `credentialStatus` pointing at `/api/public/badges/:id/status`.
- `badgeService`: Ed25519 key from `BADGE_SIGNING_JWK` (private JWK JSON; refuse to issue when unset). Add
  `jose` pinned exactly (registry: `backend/package.json`). `claim(memberId, achievementId)` checks the
  threshold now (CONFIRMED metrics need a VERIFIED attestation), signs a compact JWS (`alg: EdDSA`, `kid` =
  absolute URL of the public JWK), stores the JWT and sha256 in one insert, and refuses duplicates. `revoke`
  sets `revokedAt` only.
- Public routes (mount above bare `/api` routers; registry lines + `appMountOrder.test.ts`):
  `GET /api/public/badges/issuer` (Profile), `/jwks.json`, `/achievements/:id`, `/:id` (JSON with the JWT and the
  decoded credential), `/:id/status` (`{ revoked, revokedAt }`).
- `linkedInAddUrl(award)`: build the LinkedIn Add to profile certification URL. Verify the parameter names
  against LinkedIn's current "Add to profile" documentation. Expected: `startTask=CERTIFICATION_NAME`, `name`,
  `organizationName`, `issueYear`, `issueMonth`, `certUrl`, `certId`.

### Phase 22: Badges frontend
Files: `src/components/clubpm/career/BadgesPanel.jsx` (+test), `src/pages/Public/BadgeVerify.jsx` (+test),
`src/App.js` route `/badges/:id` (registry line), CSS in both stylesheets as needed (ClubPM bump rule).
Career view panel: eligible / claimed / revoked, a claim confirmation stating what becomes publicly verifiable,
Add to LinkedIn, Copy verify link, Revoke. Verify page: issuer, achievement, value, issued date, status, and the
signature check done in the browser against the JWKS (`jose` browser build is not in the root app, so show
"signature verified by the server" from `/api/public/badges/:id`, which runs `jwtVerify`).

### Phase 23: Security and privacy review [deep, fresh agent]
Read-only review of Phases 7, 10, 15, 16, 17, 20 and 21 against decisions 3–9: allow-list cards, sponsor token
handling, enumeration, rate limits, SSRF allowlist, public floor, notification routing, badge PII (hashed
identity only), mount order, and `req.memberId` use. Report findings. The controller fixes blockers by
re-dispatching the owning phase's files. No new features.

### Phase 24: Docs
Files: new `docs/CAREERS.md` (what is where, metric table, proof levels, sharing table like `docs/SKILLS.md`
"Who sees what", sponsor runbook, opportunity sources, badge key generation:
`node -e` snippet using `jose.generateKeyPair('EdDSA', { extractable: true })` + `exportJWK`), `docs/SKILLS.md`
(O*NET section replaces "named after ESCO, O*NET and SFIA"), course prose updates found in Phase 12. Controller
applies `AGENTS.md` lines: root (Career + O*NET + sponsor bullets under General), `backend/src/api/AGENTS.md`
(career, careerAdmin, sponsor, badges routes), `backend/src/services/AGENTS.md` (onet*, impact*, resume*,
pathway*, talentDirectory*, intro*, opportunity*, badge*), `backend/prisma/AGENTS.md` (models + migration),
`backend/src/slack/AGENTS.md` (three new data-maintenance crons).

### Phase 25: Manual rollout (Henry)
1. Review and merge `feat/skills-careers`. Deploy runs `prisma migrate deploy`.
2. Actions → Seed Backend → target `onet`, then `skills` (adds new starter skills), then Admin → Skills →
   O*NET → Apply curated links and review unlinked skills.
3. `npm run impact:recompute` once (or wait for 03:40).
4. Request a USAJOBS key (developer.usajobs.gov/APIRequest), set `USAJOBS_API_KEY` and
   `USAJOBS_USER_AGENT_EMAIL`, add sources (USAJOBS keywords, company board tokens), set `CAREERS_FEED_ENABLED=1`.
5. Generate the badge key (docs/CAREERS.md), set `BADGE_SIGNING_JWK` and `SPONSOR_TOKEN_SECRET`, restart, then
   claim a test badge and check it in the 1EdTech Open Badges 3.0 validator. Resolve any Phase 21 `OPEN` item.
6. Invite first sponsor users, then announce Career + `/impact` to members (members opt in themselves).

## Follow-ups (not in scope)

- O*NET release upgrade flow (31.x → 32.0): re-run extract + load, then review dangling links.
- Optional AI wording polish for bullets through the skills Gemini lane (numbers stay tokens).
- pgvector or job-description embeddings for better opportunity matching.
- Handshake: members upload the exported résumé themselves; revisit if Handshake opens an organization API.
