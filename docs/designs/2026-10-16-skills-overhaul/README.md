# Constellation Skills — design proposal

**Status:** design approved, October 16, 2026. The initial implementation is described in [IMPLEMENTATION.md](IMPLEMENTATION.md). No deployment or production database change has been performed.

**Confirmed direction:** member growth and evidence-backed profiles lead the experience. Routine skill creation and duplicate consolidation run automatically, with history, undo, and review for exceptions.

Open [the interactive prototype](index.html) in a browser. It uses fictional people, evidence, counts, and run results; all interactions are local to the page and reset on reload. It needs no account, network, backend, or build. Five views cover My skills, Growth, Team coverage, Library, and Automation. Select any skill to inspect its evidence. Try the library merge receipt, undo, and exception review. Resize to a phone width. The prototype illustrates the proposed information architecture; it is not an authenticated implementation.

| Member experience | Project and system views |
|---|---|
| [My skills — desktop](01-my-skills-desktop.png) | [Team coverage](04-team-coverage.png) |
| [Skill evidence drawer](02-skill-evidence.png) | [Automatic consolidation and library](05-library.png) |
| [Growth opportunities](03-growth.png) | [Automation and exceptions](06-automation.png) |
| [My skills — phone](07-my-skills-mobile.png) | |

## 1. Product direction

Make Skills a place a member visits to answer three questions: **What can I do? What work demonstrates it? What could I try next?** The same evidence helps project leads find collaborators and plan handoffs. Catalog maintenance should happen in the background.

The member landing page has a concise recent-work summary, a searchable skill list, and one specific next opportunity. Avoid a wall of proficiency charts. Each skill explains the work, its context, the strength of the estimate, and a next experience that would broaden it. A linked contribution timeline becomes useful material for a portfolio or a resume, with member review before export.

Keep Constellation's dark surfaces, teal accent, Syne/DM Sans font tokens, and restrained mission-control character. Use amber for uncertainty, violet for learning, and teal for demonstrated work. Increase text contrast above the current muted token for essential metadata. Decorative orbital lines are confined to the header; ordinary lists remain the main way to navigate.

### What exists today, and what changes

Repository review: `docs/SKILLS.md`, `docs/skills/RUBRIC.md`, `src/components/clubpm/skills/*`, `skillAnalysisService.ts`, `skillPrompts.ts`, `skillArtifactCore.ts`, `skillTaxonomyService.ts`, `skillScoringCore.ts`, and the Skills Prisma models.

| Today | Proposed |
|---|---|
| Own skills are an expandable profile card | Dedicated Skills workspace; profile keeps a compact summary and link |
| Admin has Overview / People / Find / Ask / Review / Taxonomy | Member-first landing; combine Find and Ask into contextual people discovery; put system operations in Automation |
| Fixed catalog; unknown names become admin proposals | Automatically create supported concepts, normalize aliases, and consolidate true duplicates |
| Existing merge handles a **proposal** becoming an alias | Add reversible consolidation between **existing skill concepts**, with stable original IDs |
| Weekly, per-artifact labels; summaries up to 240 characters | Incremental processing with bounded context packets and multi-source contribution stories |
| One task, PR, and CAD version can each contribute evidence | Group records of the same contribution before scoring; retain every source citation |
| All task assignees get artifacts; creator can receive a planning artifact | Separate assignment from demonstrated contribution; require support for authorship, reviewing, or leadership |
| Volume/complexity/recency arithmetic determines advisory level | Preserve v1 during UI rollout; separately validate a versioned, contribution-aware v2 rubric |
| Trend includes “Fading” | Explain “No recent evidence” without implying the person lost the skill |
| Skill visibility combines teammate and portfolio display | Separate teammate visibility, public publishing, and internal processing preferences |

## 2. The five surfaces

### My skills — the default

Above the fold: “Your work is building a story,” latest successful analysis, connection health, and recently recognized work. List skills by area with plain-language proficiency, explicit confidence, evidence count, and last demonstrated date. Filters: search, area, recent changes, and learning goals. Missing evidence means unknown, never level zero.

An evidence drawer answers “why this skill?” before presenting controls. It contains:

- Definition and boundaries: for example, Assembly Design versus the SolidWorks tool.
- AI estimate, self-claim, peer endorsements, and lead verification on separate lines, with dates. Never collapse them into a single highest number. Prototype values illustrate presentation, not a new validated scoring formula.
- Work stories with the member's contribution, constraints, decisions, outcome, and exact supporting source references. Explain unavailable or truncated context.
- What the evidence does **not** establish. For example, building an enclosure is not evidence of independent structural validation.
- A next experience, drawn from a real task or mentor opportunity and explained in terms of the member's chosen goal. No XP bar promising a promotion after a certain number of tasks.
- “Add context,” “This looks wrong,” “Set a goal,” and visibility settings. The member sees their own full record.

Changes appear in a quiet weekly digest inside the app: “Assembly design now has evidence from a second project.” In-app delivery is the default; a Slack DM digest is an optional future preference using the same permissions. Do not post member assessments in channels.

### Growth — learn through useful work

Members pick at most three focus skills and optionally say they are open to mentoring or learning. Recommend accessible, unassigned or explicitly mentor-friendly tasks, workshops, and paired opportunities. Each card names the skill practiced, prerequisite evidence, project, expected commitment if actually provided, and why it fits. Separate “I want to learn” from “I can mentor”; neither follows automatically from a level.

Use “Save opportunity” and “Open task” as initial actions. Do not assign tasks, contact anyone, or change calendars automatically. A later “Request to pair” feature needs a concrete recipient and explicit member action. A member with no evidence can begin from interests and self-claims, clearly labeled.

### Team coverage — questions tied to actual work

Project leads choose a milestone and define required capabilities, desired autonomy, and minimum coverage. Requirements begin as editable suggestions from tasks, never invented commitments. Show coverage as demonstrated, learning, or unknown; show confidence and date. Flag a single documented contributor as a handoff opportunity, not a judgment about others.

Combine structured search and natural-language questions in one surface. Results explain relevant work, missing evidence, current recorded workload, and volunteered availability separately. “No hours recorded” is not “available.” Similar skills can suggest a pairing, but prerequisite/related links never confer proficiency. Alphabetical names are the default; a query-specific relevance sort is labeled and has no aggregate member score. Shortlists remain local planning objects until a lead takes an explicit action.

Members can discover eligible collaborators within projects they can access. Project leads get project-scoped coverage; admins retain club-wide operations. Public profiles, hidden skills, private rationale, and restricted evidence retain distinct permissions.

### Library — a catalog that maintains itself

Searchable domains, tools, techniques, and collaboration skills with definitions, aliases, related concepts, recent changes, and source provenance. A list/tree is the default; a relationship diagram is optional exploration. Search for “ReactJS” lands on React, while Python and Scientific Computing remain distinct linked concepts.

Admins can inspect every automated action: before/after, rationale, exact evidence references, classifier/policy versions, affected records, score impact, and visibility impact. Undo is a durable action, not only a disappearing toast. Any member can report a misleading concept. Members see catalog explanations without access to admin-only member counts or private evidence.

### Automation — operations and exceptions

Show source freshness, eligible versus processed work, retry backlog, unresolved identities, attribution gaps, run progress, actual tokens/cost when available, and next scheduled reconciliation. A successful empty run is distinct from a failed collector. “Current” appears only when all enabled collectors have completed within policy and remaining failures are visible.

Review exceptions with concrete choices: keep separate, link as related, correct attribution, or escalate a dispute. Routine automatic changes are in Activity, outside the review queue. Include pause/resume automation, a hard budget limit, and per-operation controls for creation/consolidation/context expansion. Pausing preserves queued work and does not change member records.

## 3. Automatic discovery and consolidation

“Automatic” means the normal path needs no admin click. It does not mean every model suggestion becomes a skill. An unsupported phrase remains an observation with no assessment until adequate evidence exists. Low-volume legitimate specialties can become provisional concepts after one strong, attributable artifact; repetition across members is not required.

### Processing flow

1. **Collect deltas.** Reuse existing collectors, watermarks, leases, retry behavior, and scoped-run semantics. Add event-triggered enqueueing at existing task/GitHub/Vault mutation boundaries, with nightly catch-up and weekly deeper reconciliation. Only enable triggers when their source integration exists.
2. **Build context.** Resolve source access and identity before loading a bounded, versioned packet. Record references, revisions/hashes, omissions, and purpose. Deduplicate work relationships before model calls where explicit links exist.
3. **Extract observations.** Structured output includes concept candidates, contribution assertions, cited source spans, outcome, uncertainty, and missing context. Artifact text remains untrusted. Validate cited IDs and spans server-side. Model confidence is a feature, never an authorization or a calibrated probability.
4. **Resolve concepts.** Normalize names and aliases; retrieve candidates lexically and semantically; compare definitions, types, scope, parent context, exclusions, and actual cited work. Explicitly test equivalence, broader/narrower, related, and distinct. Embedding proximity only retrieves candidates.
5. **Apply policy.** Equivalent name variation becomes an alias automatically. Supported novel concept becomes provisional automatically. Deterministic criteria can promote it to established. Existing equivalent concepts consolidate only after equivalence and impact checks; all other relationships stay distinct. Ambiguity stays in the exception queue without blocking unrelated work.
6. **Publish projections.** Append decisions, rebuild affected contribution groups and canonical assessment projections, then atomically publish a complete revision. Credit supporting work immediately, respecting disputes. Member changes appear only after a consistent projection exists.
7. **Reconcile.** Periodically revisit provisional concepts, missed aliases, and stale classifications with bounded scope. Keep separate decisions and rejection suppressions prevent endless re-proposal. Never delete valid niche skills merely because their usage is low.

### Starting policy (to be calibrated before automatic writes)

| Operation | Automatic path | Exception path |
|---|---|---|
| Exact existing name or approved alias | Resolve to its stable canonical concept | Alias collision or context-dependent acronym |
| New spelling/abbreviation | Verified same referent, definition and scope; no collision | Ambiguous abbreviation such as “FEA” outside engineering context |
| New concept | At least one attributable artifact with a supporting span, useful definition, type and valid placement; no equivalent concept | Only filenames, aspirational task text, a self-claim, product name mention, or no reliable definition |
| Provisional → established | Two independent contribution groups or explicit curator validation; niche concepts stay usable while provisional | Repeated copies of the same work do not count |
| Existing-concept consolidation | Same referent/type/scope; no parent-child relation; no conflicting external IDs; deterministic validation and bounded affected population | Semantic similarity alone, cross-type pair, disputed equivalence, high-impact operation, conflicting manual assertions |
| Parent/related links | Explicitly supported, type-valid, cycle-free; no effect on proficiency | Uncertain prerequisite or possible hierarchy cycle |
| Split, redefine, or retire a populated concept | Automatically suggest and prepare impact report | Review because meaning changes; never silently reinterpret old endorsements |

Initial operational caps: at most 10 new concepts and 3 existing-concept consolidations per daily reconciliation; an existing-concept consolidation affecting more than 5 members goes to review. These are provisional blast-radius limits, **not measured accuracy thresholds**. Tune from replayed club data. Suppressions, policy locks, disputed concepts, and exhausted budgets always win over automation. A creation cap defers queued candidates rather than losing them.

### Consolidation without losing history

An existing-skill consolidation creates a versioned equivalence decision and canonical redirect. Original concept IDs, evidence labels, claims, endorsements, verifications, disputes, and visibility records stay attached to their original IDs. Do not rewrite append-only evidence, `skillIds`, or historic assertion rows. Canonical projections resolve equivalence at read/recompute time.

The operation transaction records the current graph revision, before-state, impact, reason, policy version, and idempotency key. Canonical selection uses a deterministic rule (locked/external canonical identity first, otherwise oldest stable ID); redirected skills remain resolvable by old URLs. Reject equivalence loops, normalized alias collisions, and hierarchy cycles. Member permissions are evaluated over all contributing originals.

Two assessments of the same provenance do not become a stronger assessment by addition. For AI-derived evidence, deduplicate contribution groups and recompute. Manual assertions remain independently attributable, even if the same person asserted both labels. Contradictory claims are displayed as a conflict; no silent “highest wins.” An open dispute withholds affected results across the entire equivalence class. An upheld suppression continues to exclude the original concept and its equivalents from credit.

Visibility resolves to the most restrictive member setting across merged originals. A new concept is visible to its owner first; a member can enable automatic teammate sharing, separately from public publishing. Canonical changes never expand audiences or automatically add skills to an already published portfolio.

Undo appends a compensating decision, deactivates that equivalence edge, rebuilds the projections, and restores distinctions without deleting later activity. If later merges, labels, or permissions depend on that edge, show the dependency impact and either reverse the dependent operations atomically or queue a reviewed repair. Never offer a misleading one-click undo that leaves corrupted redirects. After undo, record a durable “keep separate” constraint so the next run does not repeat the mistake.

## 4. More context, with clear attribution

### A bounded context packet

| Source | Additional context worth reading | What it establishes |
|---|---|---|
| Completed task | Acceptance criteria, milestone purpose, dependency context, attributed subtasks, linked deliverables, relevant explicit contribution notes | Intent and completion are context; assignment alone is not proof of authorship |
| GitHub PR | Description, changed file metadata, bounded relevant diff hunks, tests/results, attributable review comments, linked task | Specific contribution and validation; generated/vendor code is excluded |
| Vault version/change request | Item/revision/BOM context, member's check-in notes, change rationale, review decision, validation report | CAD work and engineering decisions; no geometry claim unless a supported geometry extractor actually ran |
| Meeting/document | Explicit member-linked action/result, versioned section and citation, accessible linked artifact | Supporting context; attendance, document ownership, or a name mention does not prove proficiency |
| Member reflection | What I did, constraints, decisions, outcome, sources, optional collaborator clarification | Self-reported evidence, visibly distinct until corroborated |

Keep each initial packet within a configurable budget (starting hypothesis: 12k characters), with a single bounded retrieval pass (up to 24k total) when the model identifies a specific missing fact. Prefer exact linked sources over global semantic search. Every fetched fragment is scoped to the source/project and pipeline purpose. Retain references, revision hashes, short redacted excerpts and structured observations; raw repository/CAD/document contents stay in their source systems. Set excerpt retention and deletion policy before enabling deeper extraction.

Do not analyze DMs or general Slack conversation by default. No new accounts, scopes, or whole-drive crawls are required for the first release. Meeting/document context is a later explicitly enabled source with access checks. Private-source observations must never enrich a broader audience's summaries, counts, search, embeddings, or model prompt.

### One contribution, multiple records

Group task + PR + Vault CR only on explicit links, matching identity, and compatible scope. Semantic/time similarity can suggest a link, but cannot silently collapse distinct work. Store grouping confidence and supporting relationships. A member may correct grouping and attribution.

Within a group, use source records as corroboration, not additive mass. A bounded group-level contribution weight can use the strongest supported role and outcome for that member/skill; split independent deliverables only with explicit justification. Correlated records do not inflate confidence through source count. A reviewer gets evidence of review/validation work, not the author's implementation. Merely approving a PR or creating a task is insufficient evidence of deep review or leadership.

File extension and changed-line signals become candidate hints, replacing the current strong-signal floor. They support “this tool may have been used,” not competence or autonomy. Keep a visible “not enough context” outcome instead of manufacturing credit.

## 5. Assessment and growth model

Keep level, confidence, recency, provenance, and willingness separate. No overall member score, percentile, leaderboard, or hidden suitability rating. Recommendation relevance must be explainable in terms of the particular opportunity.

For the first UI release, retain the existing 1–5 rubric and explicitly label it “advisory estimate.” Do not change historical levels just to fit new wording. The prototype uses Aware / Beginner / Competent / Advanced / Expert, matching the current rubric.

Develop v2 in shadow mode: assess demonstrated task complexity **and autonomy** against skill-specific behavioral anchors, calibrated by club leads. Use contribution-group evidence and validation quality; do not let many routine changes alone imply advanced expertise. The model extracts supported observations; deterministic, versioned rules compute the estimate. A specific promotion recommendation must cite the missing behavior, not “do three more tasks.”

For v2, separate historical demonstrated proficiency from current-evidence freshness. Old evidence can lower certainty about present readiness, but should not silently erase demonstrated experience. Availability and mentor interest remain explicit, expiring member preferences. Analyze grade/role and seniority neither as proof nor as model priors.

Verification records need an actor, scope, supporting example, and date. “Lead-verified in this project” is not a certification. A missing source, anonymous review, unresolved identity, or incomplete artifact lowers context quality or prevents an inference; it is never a negative judgment about the member.

## 6. Implementation shape

Reuse the current services; this does not require a new AI provider, autonomous multi-agent framework, enterprise skills subscription, or imported global taxonomy.

Proposed additions (names are design placeholders):

| Addition | Purpose |
|---|---|
| `SkillObservation` / `SkillContextManifest` | Versioned cited observations, context quality, references/hashes and access scope |
| `SkillContributionGroup` + source/member-role links | Cross-source deduplication with explainable attribution |
| `SkillCatalogDecision` + revision/equivalence projection | Create/alias/consolidate/keep-separate/reverse operations and dependencies |
| Concept lifecycle and policy lock | Provisional/established/redirected concepts, generation and provenance metadata |
| `SkillGoal` / `SkillOpportunitySave` | Member-selected development intent and saved opportunities |
| Split visibility and publishing selections | Owner/team/public preferences; preserve old opt-in boundaries |
| Run stages and incremental queue/outbox | Durable retries, budgets, per-source freshness, atomic projection publication |

Extend `skillTaxonomyService` behind one mutation service shared by admin tools and workers. Add a pure catalog policy module and canonical resolver. Extend `skillArtifactCore`/collectors for manifests and attribution. Extend `skillAssessmentService` and `skillScoringCore` only after the v2 evaluation; preserve all four provenances. Existing `SkillProposal` becomes an observation/exception intake rather than the routine bottleneck.

API outline: workspace summary; member skills/detail/context correction/goals; project-scoped opportunities and coverage; library search and change receipts; admin policy/status/exception decisions/reversal previews. All write endpoints need actor/scope authorization, idempotency and an expected revision; workers use the same service rules. Retrieval filters access **before** candidate generation, prompt building, counts and embeddings, then validates citations again before output.

Proposed production route: `/clubpm/skills`, with section URL state. Keep current profile and Admin entry points as links into the right section. Do not remove old deep links until compatibility behavior is implemented. Final navigation names/routes require the same-commit registry, `docs/courses/ANCHORS.md`, walkthrough steps/README, course prose, videos and quizzes updates required by root `AGENTS.md`. Production CSS must use the ClubPM stylesheet, existing font/icon system, and its cache-version/preload/test update. This isolated design artifact deliberately does not alter the live navigation or those contracts.

### Rollout and migration

1. **UI + visibility foundations.** Dedicated workspace over current API, explicit provenance, skill drawer, connection/empty/error states. Migrate old public selections as a frozen allow-list; default newly discovered skills to owner-only. Preserve existing teammate choices without expanding access.
2. **Context in shadow mode.** Collect cited context and proposed contribution groups. Replay existing evidence, compare proposed attribution with reviewed examples, and expose missing-context diagnostics. No recalculated public levels yet.
3. **Automatic catalog.** Exact aliases, provisional creation and validated exact-duplicate consolidation are enabled by default (confirmed October 16, 2026). Broader semantic consolidation follows replay validation. Backfill pending proposals through the same policies. Start from current curated seed skills; grandfather existing stable concepts. Provide preview, operation caps, pause and dependency-aware reversal before enabling writes.
4. **Growth + team coverage.** Member goals, saved opportunities, workload-aware discovery and editable milestone requirements. Add optional document sources only after source-access and retention contracts exist.
5. **Assessment v2.** Publish a rubric/version diff, run both scoring versions, review member-level changes, and explain changes to affected members. Release independently of the visual redesign.

Each phase is feature-flagged. A rollback switches readers to a prior complete projection; it does not delete evidence or model decisions. Existing leases and watermarks remain authoritative. Re-seeding must recognize canonical redirects and must not resurrect a consolidated duplicate. Budget exhaustion pauses new model calls while preserving ingestion and queues; an operator stop finishes the current atomic operation.

## 7. Validation and acceptance

Before implementation approval, review the information architecture, the automatic-policy boundaries, and whether deeper source context belongs in the first release. Before enabling automatic writes, use a manually reviewed replay set covering CAD, software, fabrication, outreach, low-digital-trace work, and new members.

Proposed release gates (targets to validate, not achieved results): zero permission leaks across a fixed access matrix; zero duplicate counting in linked task/PR/Vault fixtures; complete decision replay/reversal; no automatic consolidation on any annotated non-equivalent pair; at least 95% precision for novel concepts on a held-out club sample, with the denominator and uncertainty reported. Evaluate merge precision separately with enough negative examples; a handful of perfect examples is not evidence of reliability. Exact-duplicate consolidation uses deterministic validation and defaults on; keep broader semantic consolidation in shadow mode until the sample supports it.

Required functional cases: racing aliases, retries after partial failure, redirect chains, disputed original skill merged into another, restrictive visibility after merge, two endorsements by one actor, undo after a later dependent merge, grouping corrections, collector outage, revoked source access, erased project, cost cap, and recovery after deploy. Test policy and projection invariants rather than snapshotting model wording.

UX checks: member can explain why a skill appears, find the source, hide it, correct it, and identify a useful next action; lead can distinguish unknown coverage from lack of ability; admin can explain and reverse a change. Keyboard navigation, focus return/trapping in drawers, non-color status labels, 44px touch targets, reduced-motion behavior, readable 390px layout, and empty/loading/error/partial-source states are required in production.

Success measures: members who inspect or correct evidence, saved growth opportunities that lead to completed work, time spent maintaining the catalog, false concept/merge rate, attribution correction rate, coverage freshness, and source-access incidents. Never use “more skills per member” as a quality goal.

## 8. References and adaptations

These are researched product/framework patterns, not claims that Constellation implements their internal algorithms. Vendor pages describe vendor capabilities; the design choices below are ours.

| Reference | Documented pattern | Adaptation for SEARCH |
|---|---|---|
| [Gloat Workforce Graph](https://gloat.com/platform/workforce-graph/) | Organization-specific evolving ontology and dynamic skills inference | Let actual club work grow the catalog; make it useful for project opportunities |
| [Degreed Skills+](https://degreed.com/experience/de/blog/harness-skill-data-optimize-learning-outcomes-with-skills/) | Ingesting, cleaning, updating and mapping skills data across learning surfaces | Maintain one coherent skill identity across evidence and growth experiences |
| [ESCO structure](https://esco.ec.europa.eu/en/about-esco/escopedia/escopedia/two-pillar-structure-esco) | Preferred/non-preferred terms, descriptions, skill types and hierarchy | Stable concepts, aliases and explicit boundaries; related concepts stay distinct |
| [SFIA structure](https://sfia-online.org/en/about-sfia/how-sfia-works) | Responsibility and skill descriptions tied to autonomy, complexity and impact | Use behavioral context when validating a future rubric; keep Constellation's five-level scale, with no claimed SFIA equivalence |
| [Lightcast skills access](https://docs.lightcast.io/lightcast-api/docs/api-access) | Standardized skill identities, metadata and a hierarchy | Optional external mappings, with no dependency on importing its catalog; check licensing before any integration |

The design intentionally retains the current system's transparency, append-only evidence, member disputes, separate provenances, and opt-in publishing. The substantial change is automatic catalog management plus richer, contribution-aware context and a member-first experience.

## Prototype verification

Checked in headless Chromium at 390, 768, 1100, and 1500px across all five sections: no page-wide horizontal overflow and no JavaScript page errors. Verified search and area filters, evidence drawers, Escape/focus return and modal focus containment, opportunity saves, three-goal limit, project context, alias search, merge undo, exception resolution, pause/resume, privacy toggles, and reflection submission. Inspected rendered desktop, phone and drawer screenshots. A focused browser check script was run from the temporary tools directory; no test dependencies or production code were changed. These checks validate the local prototype, not the proposed backend or scoring policies.
