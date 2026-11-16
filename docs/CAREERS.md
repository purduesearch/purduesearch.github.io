# Careers: O*NET, impact numbers, sponsors and badges

Constellation turns club work into career material. Every number on a member's résumé is counted from
Constellation records, aligned with the U.S. Department of Labor's O*NET 31.0 reference data, and shared only
when the member chooses. The pieces are:

- **O*NET alignment.** A local copy of O*NET 31.0 links each club skill to an O*NET software example,
  skill/knowledge element or Detailed Work Activity (DWA), and shows which tools employers ask for.
- **Impact metrics.** A fixed registry counts real records ("trained 14 members", "released 12 CAD parts").
  Each count carries a proof level and becomes a résumé bullet whose number stays linked to its source.
- **Career view.** In the Skills workspace (`/clubpm/profile?tab=skills`, view **Career**): bullets, target
  roles and pathways, settings and sharing, intro requests, badges, and exports (print, copy text,
  JSON Resume).
- **Public impact page** (`/impact`), **sponsor portal** (`/sponsors`), **opportunity feed** (API only for now)
  and **Open Badges 3.0** credentials with a public verify page (`/badges/:id`).

Rules that hold everywhere:

- **Numbers never come from a model.** Metrics, bullets, pathway matching, opportunity matching, sponsor views
  and badges are plain code with no Gemini calls. The weekly skills pipeline (`docs/SKILLS.md`) is unchanged.
- **Sharing is off by default.** "Share with sponsors" and "Show on the public Impact page" are separate
  settings, and both start off. Pending claims never leave the member's own view.
- **No ranking of people.** No total score, no match percentage, no leaderboard. The sponsor directory sorts by
  name or graduation term; filters narrow, they never score. Opportunity matching ranks jobs, never people.
- **No scheduled digests.** The three crons added here only maintain data. An intro request is one reactive,
  preference-routed notification; new postings and badges notify nobody.

## What is where

| Layer | Files |
|---|---|
| Schema | `backend/prisma/schema.prisma` (Onet*, SkillOnetLink, Career*, Impact*, ResumeBullet, DemandSignal, Sponsor*, IntroRequest, Opportunity*, BadgeAward), migration `20261116120000_skills_careers` |
| O*NET data | `backend/data/onet/31.0/onet-subset.json.gz` + `ATTRIBUTION.md`; `services/onetCsvCore.ts` (parser, `normalizeText`, `normalizeExample`), `services/onetLoadService.ts`, `scripts/onet-extract.ts`, `scripts/onet-load.ts` |
| Skill links | `services/onetLinkCore.ts` (exact-match proposals), `services/onetLinkService.ts` (auto/curated/admin links, demand), `services/skillOnetCurated.ts` (80 reviewed links) |
| Impact metrics | `services/impactMetricCore.ts` (registry, proof rules, public floor), `services/impactMetricService.ts` (one query per metric, nightly recompute), `scripts/impact-recompute.ts` |
| Résumé | `services/resumeCore.ts` (bullets, shareable wording, JSON Resume, plain text) |
| Pathways | `services/pathwayCore.ts`, `services/pathwayService.ts` |
| Member API | `api/career.ts` → `services/careerService.ts` + `careerStore.ts` |
| Admin API | `api/careerAdmin.ts` → `services/careerAdminService.ts` + `careerAdminStore.ts` |
| Sponsors | `api/sponsor.ts`, `middleware/sponsorAuth.ts`, `services/sponsorAuthService.ts`, `services/talentDirectoryCore.ts` (card allow-lists, filters), `services/introService.ts` |
| Public impact | `services/publicImpactService.ts`, `GET /api/public/impact` in `api/public.ts` |
| Opportunities | `services/opportunityParseCore.ts`, `services/opportunityMatchCore.ts`, `services/opportunityService.ts` |
| Badges | `services/badgeCore.ts` (Open Badges 3.0 documents), `services/badgeService.ts` (signing, claim, revoke, verify), `api/badges.ts` (public) |
| Member UI | `src/components/clubpm/career/*` (`CareerView`, `ResumeBuilder`, `PathwayView`, `OccupationPicker`, `SkillOnetSection`, `CareerSettings`, `IntroInbox`, `BadgesPanel`), `src/pages/ClubPM/CareerPrint.jsx` (`/clubpm/career/print`) |
| Public UI | `src/pages/Public/Impact.jsx` (`/impact`), `Sponsors.jsx` (`/sponsors`, `noindex`), `BadgeVerify.jsx` (`/badges/:id`, `noindex`); `src/components/sponsor/*`, `src/api/sponsorClient.js` |
| Crons (`slack/scheduler.ts`) | `23 * * * *` sponsor maintenance; `40 3 * * *` impact recompute; `25 4 * * *` opportunity refresh (only with `CAREERS_FEED_ENABLED=1`) |
| Scripts (`backend/`) | `npm run onet:extract`, `npm run onet:load`, `npm run impact:recompute`; Seed Backend workflow target `onet` |

Backend paths are relative to `backend/src/` unless they start with `backend/`.

## O*NET data

The club uses **O*NET 31.0** (August 2026). A dev-time extractor prunes the CSV release to a 1.5 MB gzipped JSON
subset that is committed to the repository. The server never downloads O*NET and does not use the O*NET Web
Services API.

| Table | Rows in 31.0 |
|---|---|
| Occupations | 1,016 |
| Content-model elements (skills, knowledge, work styles, software categories, GWA/IWA/DWA) | 3,006 |
| Ratings (IM/LV for essential skills, transferable skills, knowledge; DR for work styles) | 142,471 |
| Software examples (with Hot Technology and In Demand flags) | 31,821 |
| DWAs / occupation-DWA pairs | 2,087 / 18,583 |
| Lay job titles | 54,269 |
| Emerging tasks / related occupations | 338 / 18,460 |

- **Load:** `cd backend && npm run onet:load` (optional `--file <path>`), or **Actions → Seed Backend** with
  target `onet`. It replaces every O*NET table in one transaction, marks the release active, records the file's
  SHA-256, and reports `SkillOnetLink` rows whose target no longer exists. It never deletes club links.
- **Links:** a new or seeded skill gets an automatic link only on an exact normalized name match (C, C++ and C#
  normalize alike, so the ambiguous `c` is never auto-linked). 80 reviewed links ship in `skillOnetCurated.ts`;
  apply them with `POST /api/admin/career/onet/apply-curated`. Admins add or remove links through
  `PUT|DELETE /api/admin/career/skills/:id/onet-links`. Relations are `EXACT`, `BROADER` or `RELATED`; origins are
  `AUTO`, `CURATED` or `ADMIN`.
- **Demand:** a skill's demand is the count of distinct occupations listing its linked software as Hot Technology
  or In Demand. Suppressed and not-relevant ratings are excluded. Admins add short, cited hiring signals
  (`DemandSignal`, for example NACE or WEF reports) that members see beside related skills and pathways.
- **Upgrading to a new release:** download and extract the new CSV zip, run
  `npm run onet:extract -- --dir <csv dir> --out data/onet/<version>/onet-subset.json.gz`, check that the headers
  and counts still match (the extractor fails on a header change), load it, then review the dangling-link
  report and `GET /api/admin/career/onet/unlinked`.

**Attribution (CC BY 4.0).** Every page that shows O*NET content shows this text, which comes from
`ONET_ATTRIBUTION` in `services/careerService.ts`; `backend/data/onet/31.0/ATTRIBUTION.md` lists the changes made:

> O*NET 31.0 Database by U.S. Department of Labor, Employment and Training Administration (USDOL/ETA), licensed
> under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Source: https://www.onetcenter.org/database.html.
> This derivative has been modified (selected columns and files) and is not endorsed by USDOL/ETA.

## Impact metrics

The registry is `METRICS` in `impactMetricCore.ts` (`METRIC_VERSION = "impact-v1"`). Order is display order.
Snapshots (`ImpactSnapshot`, one row per member and metric) are derived and recomputed nightly at 03:40, by
`npm run impact:recompute`, or for one member by **Recount** in the Career view (once a minute). The nightly run
holds an advisory lock, so an overlapping run is skipped.

| id | Counts (for member M) | O*NET DWA | Proof | Badge |
|---|---|---|---|---|
| `members_trained` | other members who completed a published course M authored | `4.A.4.b.3.d.1` Train personnel to enhance job skills | RECORDS | `trainer` ≥ 5 |
| `courses_authored` | published courses M created | `4.A.3.b.6.l.10` Develop training materials | RECORDS | |
| `cad_items_released` | distinct Vault items (not deleted) where M uploaded a version in an approved change request | `4.A.3.b.2.d.1` Create models of engineering designs or methods | RECORDS | `cad-release` ≥ 5 |
| `cad_revisions` | Vault versions M uploaded | `4.A.2.b.2.o.18` Create graphical representations of mechanical equipment | RECORDS | |
| `drawings_released` | the `cad_items_released` that are drawings | `4.A.3.b.6.i.2` Document technical design details | RECORDS | |
| `design_reviews` | change requests M approved or rejected as reviewer, plus Vault sign-offs | `4.A.2.a.4.e.3` Evaluate designs or specifications to ensure quality | RECORDS | `design-reviewer` ≥ 5 |
| `prs_merged` | merged pull requests M authored (current GitHub skill evidence) | `4.A.2.b.2.b.1` Develop software or computer applications | RECORDS | `software-contributor` ≥ 10 |
| `code_reviews` | code reviews recorded in skill evidence | `4.A.2.a.4.e.3` | RECORDS | |
| `tasks_completed` | DONE tasks with M as assignee (detail: on-time rate) | none | RECORDS | |
| `lab_hours` | confirmed lab visit time, same filter as the lab time summary | none | RECORDS | `lab-practitioner` ≥ 50 |
| `team_led` | on projects where M is lead: distinct other (non-bot) task assignees; the largest project counts | `4.A.4.b.4.a.2` Supervise engineering or other technical personnel | CONFIRMED | `team-lead` ≥ 3 (confirmed) |
| `events_organized` | past events M organized, deadlines excluded | `4.A.4.b.4.j.20` Coordinate logistics for productions or events | RECORDS | |
| `outreach_attendees` | attendances (members and guests) at public events M organized | `4.A.4.b.4.j.20` | RECORDS | `outreach-organizer` ≥ 50 |
| `outreach_published` | published outreach submissions M authored | `4.A.3.b.6.p.3` Write advertising or promotional material | RECORDS | |
| `blog_posts_published` | published blog posts crediting M as an author (not the creator) | `4.A.3.b.6.l.5` Write informational material | RECORDS | |
| `milestones_delivered` | completed milestones M owns | `4.A.4.b.4.j.12` Manage operations, research, or logistics projects | RECORDS | |

Exclusions apply to every metric: bot members never count (as the member, a trainee or an assignee), training
sandbox projects are excluded from every project-scoped source (unlinked events and outreach still count), self
enrollment does not count as training, soft-deleted Vault items and superseded evidence are ignored.

Bullet templates use `{n}` for the number, `{tool}` for the member's strongest linked tool (skills with an open or
upheld dispute are skipped) and `{projects}` for up to two project names. Approved `TrainingCertificate` rows feed
the résumé's Certifications list, not a metric. Admins can turn metrics off for everyone with
`PUT /api/admin/career/metrics` (`CareerSettings.disabledMetrics`); a disabled metric disappears from bullets,
cards, public totals and badges.

## Proof levels

| Level | What it is | When it can be shared |
|---|---|---|
| **RECORDS** | counted directly from Constellation rows | as soon as the snapshot is non-zero |
| **CONFIRMED** | a RECORDS count that needs a human check (`team_led`) | after an admin confirms it (`POST /api/admin/career/confirm`) at the current value. If the count changes, the confirmation goes stale and the bullet returns to pending until it is confirmed again. Admins cannot confirm their own metrics. |
| **CLAIM** | a number the member enters with a label, a unit (USD, people, hours, items) and an https evidence link | after an admin verifies it (`POST /api/admin/career/attestations/:id/review` with `VERIFIED`). `NEEDS_PROOF` sends it back; `DECLINED` drops it. Admins cannot review their own claims. The member gets one preference-routed notification per review. |

A member can hold 20 open claims and can delete a claim while it is pending or needs proof. Pending bullets can be
ticked in the résumé builder but never reach the printed page, copy text, JSON Resume, sponsors or the public
page. Review and confirmation are **API only**; there is no admin screen yet.

## Who sees what

| | Member (own) | Teammates | Admins | Sponsors (member shares with sponsors) | Public Impact page (member opts in) | Badge verifiers |
|---|---|---|---|---|---|---|
| Name | yes | n/a | yes | first name + last initial | first name + last initial | never (subject is a random `urn:uuid`) |
| Email | yes | no | yes | only after the member accepts an intro | never | salted SHA-256 hash only |
| Major, graduation term, target roles | yes | no | no | yes | yes | no |
| Open to, available from, headline | yes | no | no | yes | no | no |
| Impact numbers | all, with source detail | no | only through the claim queue and confirmation | only inside shareable bullets | only inside shareable bullets; site totals summed across members, hidden below 3 contributors | the badge's value |
| Bullets | all, pending ones marked, custom wording | no | no | picked shareable bullets, **standard wording** | picked shareable bullets, **standard wording** | no |
| Pending claims | yes | no | review queue (label, value, unit, evidence link, note, member name) | never | never | never |
| Certifications | yes | no | already visible in training | name + provider | no | no |
| Badges | yes, with LinkedIn and verify links | no | no | metric label + verify link | no | issuer, achievement, value, issue date, revoked or not |
| Skills | names in exports, never levels | per `docs/SKILLS.md` | per `docs/SKILLS.md` | never on the card; the `tool` filter matches only skills the member made public, bullet text and certification names | tool counts across members (public, demonstrated level ≥ 3 skills only, hidden below 3) | no |
| Intro requests | sponsor name, org, message; sponsor email after accepting | no | no | their own requests | no | no |
| Saved opportunities, feed | yes | no | no | no | no | no |
| Score, ranking, match percentage | none | none | none | none | none | none |

**Shared wording.** A member may reword a bullet for their own résumé (the number stays a `{n}` token). Sponsor
cards, public cards and the intro accept email always use the standard registry template, or `label: value unit`
for a verified claim, so extra numbers cannot ride on a verified value. The member's own view, print page and JSON
Resume keep the custom wording, and the intro accept preview shows the standard text the sponsor will get.

Cards are built from allow-lists (`buildSponsorCard`, `buildPublicCard` in `talentDirectoryCore.ts`), so new
columns cannot leak. Never add a field there by accident; the sharing consent copy in `CareerSettings.jsx` lists
every field and is test-asserted against those builders.

The public page (`GET /api/public/impact`) is cached by browsers for an hour and memoized in-process for 10 minutes,
so a member who turns sharing off can stay visible for a few minutes.

## Sponsor runbook

### Inviting a sponsor

There is **no admin screen or API to invite sponsors yet**. Insert the rows directly in the database. Ids are text
(Prisma generates cuids; any unique string works). Store the email in lower case, because sign-in looks it up
lower-cased.

```sql
INSERT INTO "SponsorOrg" ("id", "name", "website", "accessUntil")
VALUES (gen_random_uuid()::text, 'Example Aerospace', 'https://example.com', '2027-06-30');

INSERT INTO "SponsorUser" ("id", "orgId", "email", "name")
SELECT gen_random_uuid()::text, "id", 'recruiter@example.com', 'Dana Recruiter'
FROM "SponsorOrg" WHERE "name" = 'Example Aerospace';
```

| Model | Fields you set | Defaults |
|---|---|---|
| `SponsorOrg` | `id`, `name`, optional `website`, `outreachContactId` (CRM contact), `accessUntil` | `active = true`, `createdAt` |
| `SponsorUser` | `id`, `orgId`, `email` (unique, lower case), optional `name` | `tokenVersion = 0`, `disabledAt = null`, `lastLoginAt` set on sign-in |

Prerequisites: `SPONSOR_TOKEN_SECRET` (32+ characters, different from `SESSION_SECRET`) and a working
`RESEND_API_KEY` for email. Without the secret, sign-in answers 503 and the login email is not sent.

### Signing in

1. The sponsor opens `/sponsors` and enters their email. The page always shows the same confirmation, whether or
   not the address is known.
2. An eligible user gets a link to `/sponsors?t=…`, valid for 15 minutes and usable once. A new request retires the
   earlier unused links. Only the SHA-256 of the token is stored.
3. The page exchanges the link for a 7-day Bearer token (prefixed `sponsor:`, signed with `SPONSOR_TOKEN_SECRET`)
   kept in `sessionStorage`. Member and sponsor tokens never verify as each other.

Rate limits: 5 login requests per email and 30 per IP per hour; over the limit still answers 202 and sends
nothing. These limiters, and the 10-per-minute intro throttle, live in process memory, so with several API
instances each instance counts separately.

### Revoking access

Every sponsor request re-reads the user and org. Any of these ends access at once (401):

| To | Set |
|---|---|
| Disable one person | `SponsorUser.disabledAt = now()` |
| End all of an org's access | `SponsorOrg.active = false`, or `accessUntil` in the past |
| Sign one person out everywhere | increment `SponsorUser.tokenVersion` (the portal's sign-out does this too) |

The hourly `23 * * * *` maintenance job deletes used and expired login tokens and marks overdue intro requests
expired.

### Intros

- A sponsor sees only members with **Share with sponsors** on, through the card above. Filters: target role (O*NET
  code), tool, graduation term, open-to; sort by name or graduation term.
- An intro request (message up to 1,000 characters, optional opportunity reference) reaches the member first, as
  one `CAREER_INTRO_REQUEST` notification. The sponsor's message is not in the notification.
- Limits: one pending request per sponsor-member pair and 20 requests per sponsor user per 7 days (enforced under
  an advisory lock), plus a 10-per-minute throttle. Requests expire after 21 days.
- The member accepts or declines in **Career → Intro requests**. Accepting sends the sponsor one email with the
  member's email and shareable bullets, and shows the member the sponsor's email. Declining sends nothing.
- If the member later turns sharing off, the sponsor portal shows every one of their rows as "Member no longer
  sharing" with no id, name or email, and accepting returns 409 until they share again. **A sponsor keeps any accept
  email already sent**; turning sharing off cannot recall it.

## Opportunity sources

Sources are managed through the admin API only (no screen yet): `GET|POST /api/admin/career/sources`,
`PUT|DELETE /api/admin/career/sources/:id`, `POST /api/admin/career/sources/:id/fetch`. Members read their feed with
`GET /api/career/me/opportunities` and save with `PUT|DELETE /api/career/me/opportunities/:id/save`; there is no
member feed screen yet either.

| Kind | Config | Notes |
|---|---|---|
| `USAJOBS` | `{ keyword, hiringPath? }` | Needs `USAJOBS_API_KEY` and `USAJOBS_USER_AGENT_EMAIL`. Request a key at developer.usajobs.gov/APIRequest. Without them the source records an error and keeps its old rows. |
| `GREENHOUSE` | `{ boardToken }` | public job board, no key |
| `LEVER` | `{ site, region? }` (`us` or `eu`) | public postings API, no key |
| `ASHBY` | `{ jobBoardName }` | public job board, no key |
| `SPONSOR` | `{ sponsorOrgId }` | created automatically the first time a sponsor posts from the portal; sponsors edit and delete only their own org's postings |

The board token is the company's slug in its public board URL. `CAREERS_FEED_ENABLED=1` turns on the nightly refresh
at 04:25; manual fetches work without it.

Safety: requests go only to fixed HTTPS hosts (`data.usajobs.gov`, `boards-api.greenhouse.io`, `api.lever.co`,
`api.eu.lever.co`, `api.ashbyhq.com`), refuse redirects, time out after 15 seconds, stop at 10 MB and 500 jobs.
Nothing about members is sent out. A failed fetch keeps the old rows; jobs no longer listed are marked expired and
deleted 60 days later.

Matching maps a job title to up to three O*NET occupations (exact title, then without seniority words, then token
overlap) and finds club skill names and aliases in the description. A member's feed lists open jobs matched to
their target roles or O*NET related occupations (no targets, empty feed). Each job shows which of its skills the
member has **demonstrated** (AI level ≥ 3 or lead-verified, not disputed) and which are gaps. Jobs are ordered by
demonstrated-skill count, then posting date; people are never ranked.

## Badges

Badges are **Open Badges 3.0** credentials signed as VC-JWT with **EdDSA (Ed25519)** using `jose` (pinned 6.2.13).

- **Earning.** A member claims a badge in **Career → Badges** once the metric meets the threshold in the table above
  (`team-lead` also needs a current confirmation). Nothing is issued or published automatically.
- **What the credential holds.** Issuer (Purdue SEARCH), achievement and criteria, the value, issue date, a random
  `urn:uuid:` subject, and the member's email as a salted SHA-256 `IdentityObject` (per-award salt; no identifier if
  the member has no email). No name, photo or skill level.
- **Storage.** `BadgeAward` keeps the JWT and its SHA-256, written once. Revoking sets `revokedAt` only.
- **Revoking.** Only the owner can revoke (`POST /api/career/me/badge-awards/:awardId/revoke`, optional reason up to
  200 characters). It is permanent: a revoked badge cannot be claimed again (409 `REVOKED`).
- **LinkedIn.** Claimed badges have an **Add to LinkedIn** link (certification name, issuer, issue month,
  verify URL, award id).

Public routes (unauthenticated, mounted above `/api/public`):

| Route | Returns |
|---|---|
| `GET /api/public/badges/issuer` | issuer profile |
| `GET /api/public/badges/jwks.json` | the current public key (never `d`) |
| `GET /api/public/badges/achievements/:id` | achievement definition |
| `GET /api/public/badges/:id` | the JWT, decoded credential and a server-side verification result |
| `GET /api/public/badges/:id/status` | `{ revoked, revokedAt }` |

The verify page `/badges/:id` shows issuer, achievement, value, date, status and the server's signature check, with a
plain reason when verification fails (hash mismatch, key unset or changed, signature or claim mismatch).

### Generating the signing key

From `backend/`:

```sh
node -e "import('jose').then(async j=>{const {privateKey}=await j.generateKeyPair('EdDSA',{extractable:true});console.log(JSON.stringify(await j.exportJWK(privateKey)))})"
```

Put the one-line JSON in `BADGE_SIGNING_JWK` in `backend/.env`. It is the **private** key: keep it out of the
repository and logs. Badge URLs use `BACKEND_URL` and `FRONTEND_URL`. Without a valid key, claims answer 503 and the
Badges panel says issuing is not set up; existing badges still display.

**Rotation caveat.** `jwks.json` publishes only the current key, and each credential's `kid` is the thumbprint of
the key that signed it. Replacing the key makes every earlier badge show "key changed" on its verify page. Do not
rotate unless the key leaks; if you must, keep the old public key published (a code change).

Open items to check at rollout:

- The spec sets RS256 as the minimum and permits EdDSA, which some validators may not accept. Test a claimed badge
  in the 1EdTech Open Badges 3.0 validator.
- `credentialStatus.type` is a custom `ConstellationBadgeStatus`; validators may ignore it. BitstringStatusList is a
  possible follow-up.
- LinkedIn's Add to profile parameter names were not confirmed against official documentation. Test the link by
  hand.

## Rollout checklist

1. Review and merge `feat/skills-careers`. Deploy runs `prisma migrate deploy` (`20261116120000_skills_careers`).
2. **Actions → Seed Backend**: target `onet`, then `skills` (adds the 2026 starter skills, about 145 in total).
   Then apply curated links (`POST /api/admin/career/onet/apply-curated`) and review
   `GET /api/admin/career/onet/unlinked`.
3. Run `npm run impact:recompute` once, or wait for 03:40.
4. Replace the three seeded demand signals' publisher home pages with the exact report links
   (`PUT /api/admin/career/demand-signals/:id`).
5. Request a USAJOBS key, set `USAJOBS_API_KEY` and `USAJOBS_USER_AGENT_EMAIL`, add sources, fetch each once by
   hand to smoke-test it, then set `CAREERS_FEED_ENABLED=1`.
6. Generate the badge key, set `BADGE_SIGNING_JWK` and `SPONSOR_TOKEN_SECRET`, restart, claim a test badge and check
   it in the validator. Test the LinkedIn link.
7. Check `/impact`, `/sponsors` and `/badges/:id` in a browser at 375 px.
8. Invite the first sponsor users (database insert above), then announce Career and `/impact` to members. Members
   opt in themselves.

## Known limits and follow-ups

- **No admin screens** for sponsor invites/disabling, claim review, confirmations, metric settings, O*NET links,
  demand signals or opportunity sources. All but sponsor management have admin API routes; sponsor management has
  none.
- **No member opportunity feed screen**; the feed and saves are API only.
- Only admins can confirm `team_led` (`POST /api/admin/career/confirm`); there is no lead path and no admin UI yet.
- Rate limiters (sponsor login, intro throttle) are per process. Move them to Postgres or Redis if the API runs on
  several instances.
- A sponsor can send a new intro request right after a decline (within the weekly budget). A cool-down is a
  follow-up. The intro `opportunityId` is free text and is not checked against the sponsor's postings.
- The intro accept preview is built in the browser; the backend recomputes at accept time, so the email can differ if
  bullets change in between.
- The sponsor directory runs about eight queries per sharing member per request. Batch or cache it if sharing grows.
- The nightly recompute is one long transaction. Fine at club scale; switch to per-page transactions past a few
  hundred members.
- `GET /api/career/me` does not return a bullet's stored custom template, so the wording editor reconstructs it from
  the rendered text.
- The résumé builder lists claimed badges with its own LinkedIn link as well as the Badges panel.
- The pathway service re-implements the open-task access rule from `skillWorkspaceService.ts`; extract a shared
  helper later.
