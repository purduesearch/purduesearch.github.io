# Progress: skills to careers (saffron-osprey)

Plan: `2026-11-15-skills-careers.md` · Handoff: `2026-11-15-skills-careers-HANDOFF.md` · Branch: `feat/skills-careers`

Baseline gate (2026-11-15, Node v24.14.1, branch `feat/skills-careers` at `ba115f4e`): green.
Fetched origin, switched to the work branch, pulled with `--ff-only`, and confirmed a clean working tree.
Root `npm run build` passed with existing ESLint/Browserslist warnings; backend `npm run typecheck`
passed and `npm test` passed (125 standalone test files). Initial typecheck detected a stale generated
Prisma client; the handoff's setup command `npx prisma generate` resolved it without source changes or
database access. Root `test:ci` was not required because no `src/` files changed.

Phase 1 prerequisite: downloaded and extracted the O*NET 31.0 CSV archive successfully to the
machine's temporary directory.

| Phase | Title | Status | Commit | Gate | Notes |
|---|---|---|---|---|---|
| 1 | O*NET subset extractor | done | `0e6ecc3f` | build / backend typecheck / backend test green; root test:ci n/a | All reference counts match; 12 extractor tests. |
| 2 | Schema + migration [deep] | done | `d6ad45c9` | build / backend typecheck / backend test green; root test:ci n/a | Exact locked model; offline migration diff only. |
| 3 | O*NET loader | done | `3e23c1f0` | build / backend typecheck / backend test green; root test:ci n/a | 9 loader + 13 extractor tests; real subset checked through injected store. |
| 4 | Starter taxonomy refresh | done | `1ded60f9` | build / backend typecheck / backend test green; root test:ci n/a | 16 skills added, 80 reviewed links; 410 reference checks and 24 taxonomy checks. |
| 5 | Linker core + link service | done | `59d2fbe6` | build / backend typecheck / backend test green; root test:ci n/a | 3 core + 6 service tests; atomic catalog hook covered. |
| 6 | Impact metric registry core | done | `e16584e3` | build / backend typecheck / backend test green; root test:ci n/a | 32 core tests; fixed metrics, proofs, DWA ids and achievements. |
| 7 | Impact metric service [deep] | done | `bc45180c` | build / backend typecheck / backend test green; root test:ci n/a | 29 service tests; 16 queries, atomic upserts, locked nightly run. |
| 8 | Résumé + JSON Resume cores | done | `65f35e1d` | build / backend typecheck / backend test green; root test:ci n/a | 8 tests; proof gating, overrides, no levels in exports. |
| 9 | Pathway match | done | `ec2a6c45` | build / backend typecheck / backend test green; root test:ci n/a | 12 tests; deterministic statuses, no score. |
| 10 | Career API (member) | done | `3f6208d1` | build / backend typecheck / backend test green; root test:ci n/a | 55 route tests; mounted at /api/career. |
| 11 | Career admin API | done | `6d19324c` | build / backend typecheck / backend test green; root test:ci n/a | 69 route tests; mounted at /api/admin/career. Seed URLs OPEN. |
| 12 | Career view: impact + résumé | done | this commit | build / backend typecheck / backend test / root test:ci green | 8 UI tests + 2 route checks; CSS v=32; anchor skills.career. |
| 13a | Skill O*NET detail endpoint (split) | done | this commit | build / backend typecheck / backend test green; root test:ci n/a | 75 route checks; GET /api/career/skills/:id/onet. |
| 13 | Pathway + skill detail UI (13b) | done | this commit | build / backend typecheck / backend test / root test:ci green | 11 UI tests + drawer assertion; CSS v=33. |
| 14 | Career settings + print route | done | this commit | build / backend typecheck / backend test / root test:ci green | 10 UI tests; route /clubpm/career/print; CSS v=34. |
| 15 | Sponsor auth [deep] | done | this commit | build / backend typecheck / backend test green; root test:ci n/a | 100 checks across 3 files; /api/sponsor above bare /api; cron 23 * * * *. |
| 16 | Talent directory + intros [deep] | todo | | | |
| 17 | Public impact page | todo | | | |
| 18 | Sponsor portal frontend | todo | | | |
| 19 | Opportunity parsers + matching | todo | | | |
| 20 | Opportunity service + APIs | todo | | | |
| 21 | Badges backend [deep] | todo | | | |
| 22 | Badges frontend | todo | | | |
| 23 | Security and privacy review [deep, fresh] | todo | | | |
| 24 | Docs | todo | | | |
| 25 | Manual rollout (Henry) | todo | | | |

## Open items

1. Resolved: pushes from the earlier session were rejected by automatic approval review. On
   2026-11-15 a new controller session pushed `feat/skills-careers` (`ba115f4e..bc45180c`), which
   delivered Phases 1-7 together. No other branch was pushed.

## Phase receipts

### Phase 1 — O*NET subset extractor

- Fresh implementation agent: `phase_01`. Controller reviewed all source and test changes and applied
  the `onet:extract` package script.
- Created `onetCsvCore.ts` and its 12-test inline fixture suite, the local extraction CLI, compressed
  subset and attribution. Exact headers are enforced; ratings and occupation/DWA pairs are pruned as planned.
- Artifact counts: occ 1,016; el 3,006; rat 142,471; sw 31,821; dwa 2,087; odwa 18,583;
  jt 54,269; jz 923; em 338; rel 18,460. Gzip: 1,503,057 bytes.
  SHA-256: `fac42723498ee8757ffa83d8adde3e0cefff7c2dafb4f6f62c731e2227ddcb83`.
- Controller gate: root build passed (existing warnings); backend typecheck passed; backend tests
  126 files passed, 0 failed. Root `test:ci` not required (no `src/` changes).
- Deviations: none. OPEN: none. Follow-ups: none.
- Delivery blocker after commit: the required push was rejected by automatic approval review
  (quoted above). Implementation is complete locally; Phase 1 is not marked done until pushed.
- The phase row identifies its containing commit by subject to avoid a self-referential commit hash;
  the next phase's progress update records the resolved hash.

### Phase 2 — Schema + migration

- Fresh strongest-setting implementation agent: `phase_02`. Added 25 locked models, 7 enums,
  9 back-relations and the 2 notification enum values. SQL generated by offline schema diff;
  both `ALTER TYPE` statements are separate. No database connection or migration execution.
- Prisma validate/format/generate, locked-model equivalence, existing-schema preservation,
  additive SQL, separate enum statements, deterministic diff and whitespace checks passed.
- Controller gate: root build passed (existing warnings); backend typecheck passed;
  backend tests 126 files passed, 0 failed. Root `test:ci` n/a (no `src/` changes).
- Deviation: required Prisma format normalized existing whitespace; no semantic deviation.
  OPEN: outstanding push rejection already recorded above. No new follow-ups.

### Phase 3 — O*NET loader

- Fresh implementation agent: `phase_03`. Controller reviewed source/tests and applied
  `onet:load` and the manual seed workflow's `onet` target (workflow not executed).
- Transactional replacement in 5,000-row batches, shared software normalization, hierarchy,
  release switching, gzip SHA-256, and dangling-link reporting. No historical club links deleted.
- Focused tests: 9 loader, 13 extractor; real subset passed an injected-store load; CLI help passed.
- Controller gate: root build passed (existing warnings); backend typecheck passed;
  backend tests 127 files passed, 0 failed. Root `test:ci` n/a (no `src/` changes).
- Deviations: none. OPEN: push remains rejected by automatic approval review. No new follow-ups.

### Phase 4 — Starter taxonomy refresh

- Fresh implementation agent: `phase_04`. Controller reviewed 16 add-only starter entries
  (146 total), 2 aliases on existing entries and 80 manually reviewed local O*NET mappings.
- Focused tests: 410 curated-link checks and 24 existing taxonomy checks passed.
- Controller gate: root build passed (existing warnings); backend typecheck passed;
  backend tests 128 files passed, 0 failed. Root `test:ci` n/a (no `src/` changes).
- Deviations: none. Existing Simulink → MATLAB and Data Analysis → Data Science aliases preserved.
- OPEN for Phase 5: locked normalization collapses C/C++/C# to `c`; do not propose false EXACT
  SOFTWARE links for this ambiguous identity. Curated C/C++ links use broader Programming instead.
  Push remains blocked by automatic approval review.

### Phase 5 — Linker core + link service

- Fresh implementation agent: `phase_05`. Controller reviewed source/tests and applied exact
  catalog import/call; extended catalog fixture to test exact auto-link creation, repeat deduplication,
  and rollback of skill creation if a link write fails.
- Exact normalized matches only; curated/admin relations preserved; admin mutation authorization;
  distinct-occupation demand counts with suppressed/not-relevant ratings excluded.
- Phase 4 C-family OPEN resolved: automatic linking excludes ambiguous normalized software `c`;
  fixed normalizer and broader curated Programming links retained.
- Focused tests: 3 core and 6 service tests passed, catalog creation tests passed.
- Controller gate: root build passed (existing warnings); backend typecheck passed;
  backend tests 130 files passed, 0 failed. Root `test:ci` n/a (no `src/` changes).
- Deviations: none. OPEN: push rejection remains; no new follow-ups.

### Phase 6 — Impact metric registry core

- Fresh implementation agent: `phase_06`. Controller reviewed the exact ordered metric/DWA/proof
  registry and achievement thresholds, conservative counted-record templates and pure helpers.
- `shareable` enforces attestation kind/status and optional metric/value binding;
  `publicAggregate` returns `{ sum, contributors }` or null below 3 distinct positive contributors;
  member template validation returns `{ valid, error? }`.
- Focused tests: 32 passed. Controller gate: root build passed (existing warnings);
  backend typecheck passed; backend tests 131 files passed, 0 failed. Root `test:ci` n/a.
- Deviations: none. OPEN: outstanding automatic-review push rejection only. No new follow-ups.

### Phase 7 — Impact metric service + nightly recompute

- The implementation agent ran out of usage before committing. A new controller session reviewed the
  uncommitted service, test and CLI, verified the lab filter matches `getLabTimeSummary`, and applied
  the registry lines (`impact:recompute` script; `40 3 * * *` cron calling `recomputeAllImpact`,
  catch-all, no Slack send).
- One query per metric. Bots, self-enrollment, soft-deleted Vault items and superseded evidence are
  excluded; a lead with zero other assignees yields 0; `since` never uses membership `joinedAt` for
  lead tenure. Blog posts count credited `authors`, not the creator. `{tool}` resolution follows
  canonical identities and suppresses OPEN/UPHELD disputes.
- `recomputeAll` holds `pg_try_advisory_xact_lock(hashtext('impact-recompute'))` inside one pinned
  transaction (30-minute timeout) and pages humans 50 at a time; overlap returns SKIPPED.
- Focused tests: 29 passed. Controller gate: root build passed (existing warnings); backend typecheck
  passed; backend tests 132 files passed, 0 failed. Root `test:ci` n/a (no `src/` changes).
- Deviations: none. OPEN: none. The progress update landed in a follow-up commit because the
  first edit attempt failed (no python3 on this machine).

### Phase 8 — Résumé + JSON Resume cores

- Fresh implementation agent. Pure `resumeCore.ts`: `buildBullets`, `exportable`, `buildJsonResume`,
  `buildPlainText`; reuses `shareable`, `renderBullet` and `validateMemberTemplate` from the registry core.
- Pending rules: unverified CLAIM (PENDING/NEEDS_PROOF) is pending; DECLINED claim dropped. A CONFIRMED
  metric without a VERIFIED CONFIRM attestation at the current snapshot value is pending and not
  shareable, so a value change makes a confirmation stale.
- Focused tests: 8 passed. Controller gate: root build passed (existing warnings); backend typecheck
  passed; backend tests 133 files passed, 0 failed. Root `test:ci` n/a.
- Deviations: `buildPlainText` takes the built JSON Resume (same exclusions by construction);
  `buildJsonResume` takes optional `{ includeEmail }`, off by default, for the member's own download only;
  `buildBullets` takes optional `disabledMetrics`; member order is `position > 0`. OPEN: none.

### Phase 9 — Pathway match

- Fresh implementation agent. Pure `pathwayCore.ts` plus `pathwayService.getPathway(memberId, code)`
  with an injectable store. No overall score or percentage (tested). Self-only; no visibility filter.
- Status: demonstrated = AI_INFERRED level ≥3 or MANAGER_VERIFIED; learning = AI level 1–2,
  PEER_ENDORSED or goal; claimed = SELF_CLAIMED only. OPEN/UPHELD disputes (canonical projection)
  void assessments; a goal still gives learning. Best status across all linked club skills.
- Emerging club tasks: ≥2 shared normalized tokens, capped at 5 per emerging task; open = TODO or
  IN_PROGRESS, unassigned, unarchived, non-training, in the member's projects. Related = Primary tiers.
- Verified: `OnetRelease.active`; occupation tables hold only the loaded release, so no release filter.
- Focused tests: 8 core + 4 service passed. Controller gate: root build passed (existing warnings);
  backend typecheck passed; backend tests 135 files passed, 0 failed. Root `test:ci` n/a.
- Deviation: the open-task access rule is not exported from `skillWorkspaceService.ts`, so the service
  re-implements it (see follow-up). OPEN: none.

### Phase 10 — Career API (member)

- Fresh implementation agent. `api/career.ts` (`createCareerRouter` for injected tests; default
  `careerRouter` uses `requireAuth`), `services/careerService.ts`, lazily loaded Prisma
  `services/careerStore.ts`. Controller applied the `app.ts` import and
  `app.use("/api/career", careerRouter)` after `/api/skills` (no ordering constraint).
- Choices: DELETE claims allows PENDING and NEEDS_PROOF (else 409; others' or CONFIRM rows 404) and
  removes the matching ResumeBullet; 20 open claims per member; evidence URL https only, no
  credentials, ≤500 chars; occupation search q 2–80 chars, max 20 results; writes 30/min per member,
  recompute 1/min (429). Sharing flags accepted on PUT /me/profile as strict booleans.
- export.json: `includeEmail: false`, attachment + `no-store`, only exportable bullets, approved
  certificates, non-revoked badges, skills as names without levels. Controller tightened the export skill
  query to drop level-0 rows and skills with OPEN/UPHELD disputes.
- Focused tests: 55 passed. Controller gate: root build passed (existing warnings); backend typecheck
  passed; backend tests 136 files passed, 0 failed. Root `test:ci` n/a.
- Deviations: 4 source files (router, service, store, test). OPEN resolved: `computeForMember` already
  upserts snapshots, so recompute needs no extra write.

### Phase 11 — Career admin API

- Fresh implementation agent. `api/careerAdmin.ts`, `services/careerAdminService.ts`, lazily loaded
  `services/careerAdminStore.ts`, 69 route tests. Controller applied the `app.ts` import and
  `app.use("/api/admin/career", careerAdminRouter)` directly above `/api/career`; the router applies
  `requireAuth` + `requireAdmin` itself. No mount-order guard needed.
- Reuses the Phase 5 link service. Dangling links are recomputed live in `onetStatus` (same rule as
  the loader, which exposes no query).
- Review: only PENDING/NEEDS_PROOF CLAIM rows (atomic `updateMany`, races get 409); own claim 403;
  reviewer = `req.memberId` in `reviewerId`; one preference-routed `CAREER_ATTESTATION_REVIEWED`
  notification to the owner. Confirm: CONFIRMED metrics only, own metric 403, bot/missing 404,
  zero/missing snapshot 409; a repeat confirm refreshes the existing CONFIRM row (deviation).
- Demand signals: three seeded on first GET under an advisory lock, idempotent.
- Controller gate: root build passed (existing warnings); backend typecheck passed; backend tests
  137 files passed, 0 failed. Root `test:ci` n/a.
- OPEN: the plan gives no URLs or dates for the three seeded demand signals, so the seed uses publisher
  home pages (naceweb.org, WEF Future of Jobs 2025, linkedin.com) and approximate months. Replace them
  with the exact report links before rollout (editable through PUT /demand-signals/:id).

### Stop point (2026-11-15)

Henry asked to stop at the best spot. Work paused after Phase 11 with a clean tree. Resume at Phase 12
(Career view: impact + résumé, frontend), the first phase that touches `src/`, so root `test:ci` joins
the gate from there on.

### Phase 12 — Career view: impact + résumé

- Resumed 2026-11-15 in a new controller session. Fresh implementation agent created
  `career/CareerView.jsx`, `career/ResumeBuilder.jsx` and 7 UI tests; added the `career` view (all
  members, `data-tour-id="skills.career"`) to `SkillsWorkspace.jsx`, `careerApi` helpers to
  `clubPmClient.js` (JSON Resume download via fetch + Bearer + blob) and `pm-career-*` rules at the end
  of `clubpm-theme.css`.
- Controller: CSS cache bump to `v=32` (loader, `index.html` preload, loader test); registered
  `skills.career` in `tourAnchors.js` and `ANCHORS.md`; added Career prose to
  `constellation-101/content/skills-workspace.md` and a note in `walkthroughs/README.md` (the skills tour
  does not cover Career yet). Repaired this file's table: rows 8-11 had been prepended to the header line.
- Controller backend extension so the UI matches the plan: `GET /api/career/me` snapshots now carry the
  registry `dwaId` and the DWA title (new store method `elementNames`, reading `OnetElement.name`), and
  `me()` returns `skills` as sorted names only (same filter as the export, no levels). The paper preview
  and copy text show the skills line. +1 UI test, +2 route checks.
- Controller gate: root build passed; root test:ci 91 suites / 635 tests passed; backend typecheck
  passed; backend tests 137 files passed, 0 failed.
- Deviations: target-role chips are read-only (the picker is Phase 13). "Edit wording" prefills by
  replacing the first occurrence of the value with `{n}`, because the API does not return the stored
  template. Pending bullets can be pre-ticked but never reach the paper, copy text or exports. A Recount
  button was added. OPEN: none.

### Phase 13a — Skill O*NET detail endpoint (split from Phase 13)

- Deviation: the Phase 13 skill drawer needs O*NET placement, demand and matching numbers per skill, and
  no route returned them. Adding one inside Phase 13 would break the 4-file limit, so Phase 13 is split:
  13a (this backend route) and 13b (the planned frontend).
- Fresh implementation agent. `GET /api/career/skills/:skillId/onet` inside the mounted career router:
  canonical-skill resolution, 404 for missing or inactive skills; placement crumb (best link by EXACT,
  then SOFTWARE/ELEMENT/DWA, then ref; parent walk capped at depth 10 with a cycle guard); links with
  names; demand via `getSkillDemand` (top 3 occupations); the member's own non-zero snapshots for metrics
  whose software categories or DWA match, minus admin-disabled metrics; the suggested bullet from the same
  `buildBullets` output as `me()`; linked activities with names; attribution. No levels or scores.
- Focused tests: career route suite 75 passed. Controller gate: root build passed; backend typecheck
  passed; backend tests 137 files passed, 0 failed. Root test:ci n/a (no `src/` changes). OPEN: none.

### Phase 13b — Pathway + skill detail UI

- Fresh implementation agent. Created `career/PathwayView.jsx`, `career/OccupationPicker.jsx`,
  `career/SkillOnetSection.jsx` (allowed extra file, used by the skill drawer) and 11 UI tests; edited
  `CareerView.jsx` (role chips open the pathway, remove button, Add role disabled at 3 targets),
  `SkillsWorkspace.jsx` (drawer renders the O*NET section; test gained a careerApi mock and assertion),
  `clubPmClient.js` (`demandSignals`, `skillOnet`) and appended `pm-career-*` pathway/drawer rules.
- No overall score or match percentage (tested). Status is text plus a dot. Signal source links open with
  `noopener noreferrer`; `sourceUrl` is already validated as https by the admin service. The pathway
  attribution comes from `/me` because the pathway route returns none. Signals fetch is best-effort.
- Controller: CSS cache bump to `v=33`; added target roles, pathway and skill O*NET detail to
  `constellation-101/content/skills-workspace.md`. No new route or tour anchor.
- Controller gate: root build passed; root test:ci 92 suites / 644 tests passed; backend typecheck
  passed; backend tests 137 files passed, 0 failed.
- Deviations: none beyond the 13a split. OPEN: harmless `act(...)` warnings from the picker's debounce
  under fake timers.

### Phase 14 — Career settings + print route

- Fresh implementation agent. Created `career/CareerSettings.jsx` (profile fields, two independent sharing
  toggles with plain explanations and a confirm step before turning either on, claim form with https-only
  evidence link and pending-claim delete; ref-guarded submits) and `pages/ClubPM/CareerPrint.jsx`
  (one-column résumé of exportable bullets, certifications and skill names; own auth redirect; no
  AppShell; `@media print` rules), with 7 + 3 tests. `CareerView.jsx` shows both sharing states and opens
  Settings.
- Controller: applied the `src/App.js` lazy import and the `/clubpm/career/print` route beside
  `/clubpm/login`, outside `ClubPmProtectedPage`; CSS cache bump to `v=34`; Settings sentence added to
  `constellation-101/content/skills-workspace.md`.
- Controller gate: root build passed; root test:ci 94 suites / 654 tests passed; backend typecheck
  passed; backend tests 137 files passed, 0 failed.
- Deviations: the print page adds body/html marker classes in an effect (removed on unmount) to beat the
  `!important` dark `html.clubpm-route` background from `search-theme.css`; those two override rules sit
  outside `.pm-career-print`. Terms are `YYYY-MM` text inputs (Safari desktop lacks `type=month`).
  OPEN: none.

### Phase 15 — Sponsor auth

- Fresh strongest-setting implementation agent (wrote no later phase). Created
  `services/sponsorAuthService.ts`, `middleware/sponsorAuth.ts`, `api/sponsor.ts` (auth routes only) and
  tests (51 + 17 + 32 checks).
- `POST /login` answers 202 before any lookup; the lookup, token write and email run afterwards with
  errors caught. Rate limits 5 per normalized email and 30 per IP per rolling hour (over-limit still 202,
  nothing sent). Token = 32 random bytes, stored only as SHA-256 hex, 15 minutes; a new request retires
  the user's earlier unused links. Link built from `FRONTEND_URL`, HTML escaped.
- `POST /session` consumes atomically (`updateMany` count must be 1), re-checks eligibility and returns a
  7-day `sponsor:`-prefixed HMAC Bearer on `SPONSOR_TOKEN_SECRET` (timing-safe compare). Member and
  sponsor tokens never verify as each other, even with equal secrets. Missing or short (<32) secret fails
  closed: login 202 without sending, session/me/logout 503. `requireSponsor` re-reads user and org every
  request (disabled, inactive org, `accessUntil`, `tokenVersion` → 401) and sets `req.sponsorUserId`;
  `GET /me`, `POST /logout` (revokes all sessions). Logs hold no tokens, hashes or emails.
- Controller: applied `app.ts` import + `/api/sponsor` mount right after `/api/career` (above every bare
  `/api` router), `SPONSOR_ROUTERS` guard in `appMountOrder.test.ts` (86 checks pass), the `23 * * * *`
  `runSponsorMaintenance` cron in `scheduler.ts` (data only), and `SPONSOR_TOKEN_SECRET=` in root
  `.env.example`.
- Controller gate: root build passed; backend typecheck passed; backend tests 140 files passed, 0 failed.
  Root test:ci n/a (no `src/` changes).
- Deviations: ineligible sponsors get 401 everywhere (never 403). OPEN: the login rate limiter is
  per-process memory; with several API instances the limit applies per instance (recorded as follow-up).

## Follow-ups

- Sponsor login rate limiter is per-process memory. If the API runs on several instances, move it to
  Postgres or Redis so the 5-per-hour limit is global.

- `GET /api/career/me` does not return a bullet's stored custom template, so the editor reconstructs it
  from the rendered text. Return `template` per bullet if members report odd prefills.

- Nightly impact recompute runs as one long transaction. Fine at club scale; if the member count grows
  past a few hundred, switch to per-page transactions under a session advisory lock.

- Preserved existing Simulink/MATLAB and Data Analysis/Data Science identities; any future split
  needs a separate catalog change, not this add-only refresh.
- Pathway open-task access rule duplicates the inline rule in `skillWorkspaceService.ts`. Extract one shared
  helper in a later refactor so the two cannot drift.
