# Skills system

Once a week a job reads each member's new work (GitHub pull requests and reviews, CAD check-ins in the Vault,
finished tasks, plus work they describe by hand), has Gemini label it against a fixed skill taxonomy, stores a short
summary as **evidence**, and recomputes each person's **assessments** with plain arithmetic. Members see everything
inferred about them and can dispute it. Admins can find people by skill and ask staffing questions. Members can
publish an opt-in portfolio for employers.

Levels are **advisory estimates**, not performance scores. There is no total score and no leaderboard anywhere.

Scoring rules and the written rubric: [skills/RUBRIC.md](skills/RUBRIC.md).

## What is where

| Layer | Files (`backend/src/…`) |
|---|---|
| Schema | `prisma/schema.prisma` (Skill…SkillRun), migration `20261013120000_skills` |
| Taxonomy | `services/skillSeedData.ts`, `skillTaxonomyService.ts`, `skillMatchCore.ts` |
| Gemini lane | `services/ai/skillsGemini.ts` (own limiter, retry, batch, embeddings, cost) |
| Prompt + schema | `services/skillPrompts.ts` (`PROMPT_VERSION`, `RUBRIC_VERSION`) |
| Per-artifact analysis | `skillAnalysisService.ts`, `skillValidateCore.ts` |
| Collectors | `services/skillCollectors/{github,vault,task}.ts`, `skillArtifactCore.ts` |
| Pipeline | `skillPipelineService.ts`, `skillPipelineCore.ts`, `skillEvidenceService.ts`, `skillAssessmentService.ts` |
| Scoring | `skillScoringCore.ts` (pure, unit tested) |
| APIs | `api/skills.ts` (member + public portfolio), `api/skillsAdmin.ts` |
| Search / assistant | `skillSearchService.ts`, `skillQueryCore.ts`, `projectAskService.ts`, `utils/aiPrompts.ts` |
| Signals | `services/skillSignalCore.ts` (file types and names → hints and strong floors) |
| UI | `src/components/clubpm/skills/*` (`SkillsAdmin` shell, `SkillsRunPanel`, `SkillsMatrix`, `SkillsTaxonomy`, `SkillsReview`, `MemberSkillsCard`), `src/pages/Public/Portfolio.jsx` |

## Data model

1. **Taxonomy** – `Skill` (type tool / technique / domain / soft skill), `SkillAlias`, `SkillEdge` (multi-parent,
   related, prerequisite; cycles refused). Gemini never creates a skill: it picks from candidate keys, every proposed
   name is matched against all names and aliases first ("React", "ReactJS", "React.js" are one skill), and what is left
   goes to `SkillProposal` for an admin to add, merge as an alias, or reject.
2. **Evidence** – `SkillEvidence`, append only (a database trigger rejects every update except `supersededAt` and
   `embedding`). Keeps the source reference, the model's labels, a one-sentence summary and an embedding. Raw diffs,
   file contents and CAD bytes stay in their systems. Stores `modelVersion`, `promptVersion` and `rubricVersion`.
3. **Assessments** – `SkillAssessment`, derived. One row per member, skill and provenance (`AI_INFERRED`,
   `SELF_CLAIMED`, `PEER_ENDORSED`, `MANAGER_VERIFIED`), never merged. Level and confidence are separate fields.

## Setup

1. Apply the migration: `cd backend && npx prisma migrate deploy` (dev: `npm run db:migrate`).
2. Seed the starter taxonomy: `npm run seed:skills`, the **Seed Backend** workflow with target `skills`, or Admin → Skills → Taxonomy → "Install about 130 starter skills". A run that finds no active skills installs them itself. It is idempotent and only adds. It is a curated set of about 130
   skills for engineering teams (CAD, electronics, software, aerospace, manufacturing, soft skills) named after concepts
   in ESCO, O*NET and SFIA, with `source` recording which. It is **not** an import of those standards and sets no
   `externalId`; a full import can fill `externalId` later without changing slugs.
3. Configure `.env` (see the Skills block in the root `.env.example`): `GEMINI_API_KEY`, and `SKILLS_MODEL` (or rely on
   `GEMINI_MODEL`). Any current Gemini model works: 1.x/2.0 models are sent the OpenAPI response schema automatically,
   2.5 models get a bounded thinking budget. The key is read on the server only. Admin → Skills → Overview lists anything
   missing.
4. Members need a linked GitHub account (`githubLogin`) for pull requests and reviews to be attributed. Unmatched
   logins are counted in the run report, not guessed.
5. Try it without spending anything: `npm run skills:run -- --dry-run` (collects, estimates tokens and cost, writes
   nothing, calls nothing).
6. Turn on the weekly job with `SKILLS_ENABLED=1` (Sundays 02:30 server time, registered in `slack/scheduler.ts`). It
   sends nothing to Slack.

To enable the schedule through GitHub, open **Actions → Set Skills Schedule (manual) → Run workflow** and
leave `enabled` checked. The workflow reuses the deployment secrets `ORACLE_HOST`, `ORACLE_USER` and
`ORACLE_SSH_KEY`; no new secrets are required. It checks that `/opt/clubpm/backend/.env` already has
`GEMINI_API_KEY` and either `SKILLS_MODEL` or `GEMINI_MODEL`, backs up that file, sets `SKILLS_ENABLED=1`,
and restarts `clubpm-backend`. Run it after the backend deployment (including migrations) succeeds.
The workflow appears in the Actions menu once it is on the default branch. Uncheck `enabled` to disable
future weekly runs; this does not cancel a run already in progress. Confirm the setup checks and schedule
in **Admin → Skills → Overview**. The backend must be running at the scheduled time; GitHub only configures
the existing backend cron.

## Running it

| Goal | Command |
|---|---|
| Normal incremental run | `npm run skills:run` |
| Estimate only | `npm run skills:run -- --dry-run` |
| Check one member | `npm run skills:run -- --member <memberId>` (or Admin → Skills → Overview → Who) |
| Backfill history | `npm run skills:run -- --since 2026-01-01 [--until 2026-06-01] [--chunk-days 14]` |
| Rebuild assessments (no model calls) | `npm run skills:run -- --recompute` |
| Fill missing embeddings | `npm run skills:run -- --embed-missing` |

How a run stays safe:

- **Incremental.** Each collector reads `(watermark − 1 day, run start]`. A watermark only advances past work that
  finished: a retryable failure holds it back to just before that artifact (it gives up after 21 days), and a truncated
  collector or a per-run cap stops it at the last item handled.
- **Idempotent.** An artifact already analysed under the current prompt version is skipped by content hash, so a re-run
  makes no model calls. Changing `PROMPT_VERSION` re-analyses everything (old rows are marked superseded, not deleted).
- **No overlap.** A database lease plus an advisory lock refuses a second run; a dead run's lease expires.
- **Scoped runs never move the watermarks** (single member, explicit window, backfill).
- **Failures are contained.** One bad artifact or one down collector does not stop the rest; the status panel lists the
  issues. Invalid model output is counted and dropped, never stored.
- **Approving or merging a proposed skill credits the work that proposed it straight away** (no model call): that work
  was recorded untagged, and the approval links it at a modest fit and recomputes those people. Adding a skill or another
  name by hand also merges any pending proposal it now covers.
- **Stoppable.** Runs renew a short lease while they work and publish their stage and progress. Admin → Skills → Overview
  can stop a live run (it finishes the current item, keeps what it wrote, and does not move the bookmarks) or close one
  that stopped responding after a deploy.

How tags are chosen:

- Before the model reads a piece of work, file types and names produce **signals**: a `.sldasm` check-in points at
  SolidWorks and assembly design, 200 changed lines of `.py` at Python, a `.github/workflows` file at CI/CD. Signalled
  skills are always among the candidates and are listed in the prompt as hints to confirm.
- **Strong** signals are a floor: a native CAD/EDA file in a check-in or an authored PR, or at least 40 changed lines of a
  language in an authored PR. If the model leaves one out it is added at fit 0.5, because the file type alone proves the
  tool was used. Reviews, tasks and manual entries only ever produce hints.
- Candidates show their parent area, and the model is asked for the most specific skill the work shows.

Batch mode (`SKILLS_USE_BATCH=1`) sends runs of at least `SKILLS_BATCH_MIN_ITEMS` artifacts through Gemini's batch API at
about half price; smaller runs use paced synchronous calls (`SKILLS_RPM`, default 20) with exponential backoff and jitter
on 429 and 5xx.

## Cost

Per analysed artifact: about 2.5k to 3.5k input tokens (the whole taxonomy as short keys, the rubric, and up to
`SKILLS_MAX_ARTIFACT_CHARS` of artifact text) and about 200 output tokens, plus one embedding of about 60 tokens.

`cost ≈ artifacts × (3k × input price + 200 × output price) + embedding tokens × embed price`

With the placeholder prices in `.env.example` ($0.30 in / $2.50 out per million tokens; **check current pricing for your
model and set `SKILLS_PRICE_*`**), 100 artifacts a week is roughly $0.15 a week, a 500-artifact week about $0.70, and a
90-day first backfill of 1,500 artifacts about $2. Batch mode halves the generation part. Every run records tokens and
an estimated cost; the Admin panel shows the last run, and `--dry-run` gives a forecast before you commit. The taxonomy
is sent whole while it has 160 skills or fewer; beyond that it is prefiltered per artifact.

## Who sees what

| | Member (own) | Project member | Admin | Public portfolio |
|---|---|---|---|---|
| Skills, levels, confidence, trend, last used | all | on the profile page (skills not hidden); via project assistant | all | public skills only |
| Rationale text and rows per provenance | yes | no | yes | no |
| Evidence summaries and links | all | on the profile page: shared projects only | all | public projects only; GitHub links only |
| Self-claims, endorsements, verifications | yes | no | yes | never shown on their own |
| Flags / disputes | own | no | all | flagged skills withheld until resolved |
| Disagreements between claims and data | yes | no | yes | no |
| Overall score or ranking | none | none | none | none |

The public portfolio is **off until the member turns it on**, then shows only skills marked public that are lead-verified
or have at least medium confidence, and evidence from projects the member allows. Skills and projects are public by
default once the portfolio is on, and a member can hide any of them (eye icon) in one click. The server builds the
public payload from an allow-list, so new columns cannot leak. Its address is `/portfolio/<slug>`, marked `noindex`.

Any signed-in member sees a teammate's skills on their profile: skills the member has not hidden (eye icon), minus any
under an open dispute, with up to three summaries of work from projects both people are on, and can endorse a skill at a
level (stored as its own peer row). A member can switch this off in Skills → Portfolio and privacy.

Admin → Skills → **People** is a coverage grid: one row per person, one column per skill in an area, each cell the
highest-trust level held (lead-verified, then peer, then analysis, then self-claim; dashed = low confidence, outlined =
self-claimed). It lists skills where only one person is strong (level 3+ backed by work or a lead). Rows are alphabetical
and there is no total; select a person to see everything recorded about them and verify a level.

Members see everything inferred about them with its evidence, can flag a wrong tag (an admin who upholds it removes the
tag from scoring, and later re-analyses will not add it back), and can add claims or describe work that leaves few
digital traces. Entries members write themselves are capped at complexity 3.

## Asking who could take something on

- Admin → Skills → **Find people** (skill, minimum level, recency, confidence) and **Ask** (natural language).
- Any project's assistant answers staffing questions with that project's tasks, workload and people in view, plus
  retrieved candidates with their cited work. Non-admins only retrieve from their own project's members and evidence.
- Retrieval is structured first (skills, level, recency parsed from the question), embedding search second, fused by rank.
  The model only writes prose over rows it was handed; every person and evidence id it names must match a supplied key,
  otherwise the answer falls back to a plain list.
- The project assistant's prompt now carries the same single-project snapshot and exact computed signals the action-plan
  features use (estimates, logged hours, per-member load, overdue, blocked, velocity) and each member's top skills.
  Slack's mention intent still uses the plain version without skills.

## Known limits

- **CAD**: the database holds no feature tree, so CAD evidence uses names, notes, revisions, BOM context and change
  requests. Reading geometry (for example from `VaultGeometryDiff`) is a future addition.
- **Embeddings** are a `Float[]` column compared in Node. That is fine for a few thousand evidence rows; past roughly
  50,000 move to pgvector and replace the evidence query in `askSkills` (`skillSearchService.ts`).
- Reviews are evidence only for GitHub reviews and Vault change-request decisions and sign-offs.
- Skill tags are the model's reading of short summaries. That is why every level carries a confidence, links to its
  work, and can be disputed.
