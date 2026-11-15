# Controller handoff: skills to careers (saffron-osprey)

Runs on any machine, including a fresh VM. Everything the controller needs is in the repo on branch
`feat/skills-careers`:

- Plan: `docs/superpowers/plans/2026-11-15-skills-careers.md`
- Handoff: this file
- Progress: `docs/superpowers/plans/2026-11-15-skills-careers-PROGRESS.md`
- Mockups (approved direction, sample data): https://claude.ai/artifact/MdRYh8atW3VQSacAX764vg

Nothing depends on `~/.claude/` or Windows paths.

## VM setup (Henry, once)

```bash
git clone https://github.com/purduesearch/purduesearch.github.io.git
cd purduesearch.github.io
git switch feat/skills-careers       # or: git pull, if already cloned
npm ci
(cd backend && npm ci && npx prisma generate)
```

Use Node 24, the same version the backend runs. The gates need no `backend/.env`, database or credentials. Phase 1 needs network once
(downloading the O*NET zip). Phases 19 and 21 use the network only to check public documentation. Git must be
able to push to `origin`.

Then start the controller (Sol 6.1, medium) in the repo root and paste everything below the line as its only
prompt.

---

You are the **controller** for the Constellation "skills to careers" upgrade. You plan, dispatch, verify,
commit and record. One implementation subagent per phase writes most of the code. You own the registry files
and have the final say on every phase. Work until Phases 1–24 are done, then stop for Henry's manual Phase 25.

## Read first (in this order)

1. `docs/superpowers/plans/2026-11-15-skills-careers.md`: the plan. **Locked decisions**, **Data model** and
   **Impact metric registry** are fixed. Do not redesign them. If one is impossible, record why in the progress
   file and ask Henry. Do not improvise.
2. `AGENTS.md`, then the nested `AGENTS.md` files for the areas a phase touches (`src/`, `backend/`,
   `backend/src/api`, `backend/src/services`, `backend/src/slack`, `backend/prisma`). Watch: CSS cache bump rule,
   `req.memberId` (never `req.session.memberId`), crons only in `scheduler.ts`, no scheduled digests,
   `createNotification` for notifications, course-sync rule for any navigation change, `SITE_URL` (never a
   hard-coded domain), skills invariants (append-only evidence, no total score, no leaderboard).
3. `docs/SKILLS.md` and `docs/skills/RUBRIC.md` (the system being extended).
4. The progress file. Resume from it and never redo a phase marked done.

## Before Phase 1

1. `git fetch origin`. If `feat/skills-careers` exists remotely, switch to it and `git pull --ff-only`;
   otherwise create it from `origin/main`. Never commit to `main`.
2. Confirm a clean working tree.
3. Run the gate once for a green baseline. If the baseline fails, record it in the progress file and ask Henry
   before touching unrelated code.

## Working rules

- Phases run one at a time, in plan order. Phase 25 is Henry's: give him its checklist and stop.
- Dispatch each phase to one fresh implementation subagent. Use your strongest subagent setting for phases
  tagged **[deep]** (2, 7, 15, 16, 21, 23). Phase 23's reviewer must be a new agent that wrote none of Phases 15,
  16 or 21.
- **Controller-owned registry files.** Subagents return exact lines and you apply them:
  `backend/src/app.ts`, `backend/src/appMountOrder.test.ts`, `backend/src/slack/scheduler.ts`,
  `backend/package.json`, `backend/prisma/schema.prisma` (except Phase 2, which owns it), `src/App.js`,
  `src/components/Navbar.jsx`, `src/clubpm/loadClubPmTheme.js` + `public/index.html` preload + the loader test
  (the CSS cache bump, after every phase that edits `public/clubpm-theme.css`), `src/clubpm/tour/tourAnchors.js`,
  `docs/courses/ANCHORS.md`, `.github/workflows/seed-backend.yml`, root `.env.example`, `public/sitemap.xml`, and
  every `AGENTS.md` / `CLAUDE.md`.
- **Brief format.** A subagent has not seen this conversation, so each brief must stand alone. Include:
  - the goal and the phase text copied from the plan;
  - the files it may touch (≤4 source files plus tests);
  - `rg` anchors, the locked decisions that apply (copied, not referenced), and the tests to add;
  - the gate commands and the receipt format below.
  Tell it never to read `backend/prisma/schema.prisma`, `backend/src/api/tasks.ts`,
  `src/pages/ClubPM/ProjectDetail.jsx`, `src/components/clubpm/TaskModal.jsx`, `public/clubpm-theme.css` or
  `public/search-theme.css` in full. It must search with `rg -n` and read only the needed range.
- **Verify schema fields before writing a query.** The registry table marks unverified fields with †. The
  subagent confirms each one with `rg -n "model <Name>" -A 40 backend/prisma/schema.prisma` and reports the real
  name in DEVIATIONS if it differs.
- **Gate after every phase, run by you:** root `npm run build`; in `backend/` run `npm run typecheck` and
  `npm test`. Run root `npm run test:ci` when `src/` changed. Fix, or re-dispatch with the failure output,
  until green. Never weaken a test, a safety rule or a locked decision to get green; ask Henry instead.
- **Commit per phase** after the gate. Member-visible work gets a patch-note subject (Constellation patch
  notes come from commit subjects), for example `feat(career): turn club work into résumé bullets with real
  numbers`. Internal phases get `chore(careers): phase N <title>`. End every commit message with the
  co-author or attribution line that your own environment instructions specify, if any.
- **Progress lives in the repo.** After each phase, update the progress file (status, commit hash, gate
  results, deviations, follow-ups) inside that phase's commit.
- **Push `feat/skills-careers` after every phase commit** (`git push -u origin feat/skills-careers`). Henry
  authorizes this by starting this handoff. Never force-push. Never push another branch.
- Without Henry's explicit go-ahead, never open a PR, merge, deploy, run migrations against a real database,
  request API keys, generate production signing keys or email anyone.
- Keep your own context lean. Read receipts and diffs (`git diff --stat`, then targeted hunks), not whole
  files. Re-read the plan section for each phase when you write its brief.

## Codebase anchors (verified 2026-11-15 on main 6dbe7327)

- Skills: `backend/src/services/skillSeedData.ts` (starter taxonomy, add-only seed via `npm run seed:skills`),
  `skillCatalogService.ts` (catalog writes under the `skills-catalog` lock), `skillWorkspaceService.ts` (task
  access rules for opportunities), `skillAccessService.ts` (visibility). Models `Skill` (`source`, `externalId`
  unused), `SkillAssessment` (provenance rows), `SkillVisibility` (`isPublic`, `showToTeam`), `SkillEvidence`
  (`source` GITHUB|CAD|TASK|REVIEW|MANUAL; GitHub `sourceRef` = `owner/repo#n`, reviews
  `…#n:review:<login>`, CR reviews `cr:<id>:<how>`).
- Metric sources (verified): `CourseEnrollment.completedAt`, `Course.createdById`/`status`,
  `VaultVersion.uploadedById`, `ChangeRequestItem { changeRequestId, itemId, versionId }`,
  `ChangeRequest { status (OPEN|APPROVED|REJECTED|CANCELLED), authorId, reviewerId }`,
  `VaultSignoff { changeRequestId, memberId }`, `VaultItem { drawingForId, deletedAt }`,
  `LabVisit { totalMinutes, status }`, `ProjectMember { isLead, leadTitle, joinedAt }` (no lead start date),
  `Event.organizerId`, `EventRsvp { attended, guestEmail }`, `OutreachSubmission { authorId, status }`,
  `TrainingCertificate { status, completedOn }`, `Kudos`.
- Auth: `backend/src/api/auth.ts` exports `requireAuth`, `requireAdmin` (HMAC Bearer + session pattern to model
  sponsor auth on). Email: `backend/src/services/emailService.ts` `send({ to, subject, html })` (Resend).
  Notifications: `services/notificationCrud.ts` `createNotification` (enum `NotificationType` in schema).
- Mount order: `backend/src/appMountOrder.test.ts` guards routers that must sit above bare `/api` routers.
- UI: Skills workspace `src/pages/ClubPM/SkillsWorkspace.jsx` (views `mine|growth|team|library|automation`,
  buttons carry `data-tour-id="skills.*"`), rendered from `src/pages/ClubPM/Profile.jsx`
  (`/clubpm/profile?tab=skills`). Admin shell: `src/components/clubpm/skills/SkillsAdmin.jsx` inside
  `src/pages/ClubPM/AdminView.jsx`. Public portfolio precedent: `src/pages/Public/Portfolio.jsx`, route in
  `src/App.js`. Tokens: ClubPM `--pm-*` in `public/clubpm-theme.css`; public `--color-*` in
  `public/search-theme.css` `:root`. Read `src/AGENTS.md` before using a token.
- Seed workflow: `.github/workflows/seed-backend.yml` input `seed_target` options list.
- No zip library in backend deps. Phase 1 extracts with `python3 -m zipfile -e`. `resend`, `googleapis` and
  `zod` (4.6.7) are present. `jose` is not present (Phase 21 adds it, pinned exactly).

## Receipt format (each subagent returns exactly this)

```
PHASE: <n> — <title>
FILES: <path> (created|edited) …
REGISTRY LINES (for controller): <file> — <exact lines + where> | none
VERIFIED FIELDS: <model.field confirmed or corrected> | n/a
TESTS: <test files added> — <pass count>
GATE: build <ok|fail>, backend typecheck <ok|fail>, backend test <ok|fail>, root test:ci <ok|fail|n/a>
DEVIATIONS: <what differs from the brief, and why> | none
OPEN: <questions or follow-ups> | none
```

## Done means

Phases 1–24 are committed and pushed on `feat/skills-careers` with green gates. The progress file is complete,
and `docs/CAREERS.md` plus the `AGENTS.md` lines are in place. Your final message to Henry lists:
- what is ready;
- the Phase 25 checklist;
- every `OPEN` item, especially the Open Badges context and VC version, the USAJOBS field names, and the
  LinkedIn parameters if they could not be verified online;
- every recorded follow-up.

Start by reading the files above, then do "Before Phase 1".
