# Skills workspace — initial implementation

The approved design now has an integrated React workspace at `/clubpm/skills`, backed by member/admin APIs and a Prisma migration. The original HTML prototype remains a design reference; the application uses real APIs, existing ClubPM fonts/icons, shell navigation and the shared accessible overlay primitive.

## Included

- My skills: searchable area-filtered record, distinct contribution counts, evidence drawers, context/attribution/truncation, every original provenance, correction submission, and separate teammate/public choices.
- Growth: up to three persistent focus skills, concept/alias matches against accessible open tasks, saved task references and actual task links. Saving has no assignment/message side effect.
- Team coverage: selected-project evidence and estimates, alphabetical member discovery, explicit unknown capability/availability. Restricted projects and hidden/disputed skills are filtered before retrieval or assistant prompts.
- Library: definitions, aliases (including redirected names), provisional concepts, admin receipts, curator consolidation and dependency-aware undo. Original evidence and human assertions remain attached to their original ids.
- Automation: source-backed automatic provisional creation; deferred candidates with reasons; establishment after independent support; creation/consolidation caps; pause/resume; run health, progress, cancellation and review queues. Conservative provider-call reservations bound each run at configured token rates, including retries and embeddings; deferred work does not advance watermarks.
- Context: member-authored task notes, the reviewer's own explanation, optional bounded non-generated PR patches, explicit task/PR/Vault contribution grouping, and content hashes covering relevant context. File types/line counts are candidate hints only. Creating a task alone does not earn leadership evidence.
- Compatibility: existing Admin → Skills tools remain; Profile links to the workspace. Both navigation shells, CSS cache URL/preload/test, tour registry, anchor documentation and an optional member walkthrough are updated together.

## Rollout boundaries

Automatic creation and exact normalized duplicate consolidation are on by default within the existing opt-in weekly run. Creation is capped at 10 concepts per UTC day; consolidation is capped at 3 merges per UTC day affecting at most 5 members each. Consolidation also requires matching definitions or a shared external identity, matching types, and no hierarchy/assertion/dispute conflict. Automation can pause or disable either operation. General semantic merges remain subject to reviewed equivalence validation.

The five-level v1 formula is retained; the derived version is `1-contributions` to record canonical/deduplicated inputs. A new autonomy-based v2 rubric, full semantic catalog reconciliation, event-driven/nightly processing, explicit mentor availability and milestone coverage planning remain later rollout stages from the proposal. None is simulated in the live application. Growth suggestions currently use explainable explicit mentions rather than model-generated staffing claims. The existing admin Find/Ask/People tools remain for deeper planning.

## Database and release

Deploy migration `20261016160000_skills_workspace` before this backend. It preserves existing sharing selections and makes newly encountered skills/projects private by default. `SkillCatalogChange` has an append-only UPDATE trigger; reversal appends a compensating decision. Member and source ids in audit records are references, not permission grants.

The new prompt version re-analyzes eligible work within the normal collection window. For older history, use a bounded backfill after a dry run. Recompute derived assessments with `npm run skills:run -- --recompute` after the migration. Run the source-backed discovery with a small member-scoped sample first and inspect the resulting receipts and exception reasons before broader activation. The schedule remains controlled by `SKILLS_ENABLED`; no production setting has been changed.

`SKILLS_INCLUDE_DIFFS=1` is an optional context expansion; its default is off. Provider prices come from the existing `SKILLS_PRICE_*` configuration. The editable per-run allowance is a conservative reservation at those configured prices, not an external billing guarantee.

## Verification

Completed checks:

- Production frontend build, backend typecheck, Prisma client generation/schema validation, focused frontend lint and `git diff --check` pass.
- Nine relevant frontend suites pass (70 tests across the completed runs); all 14 Skills-related standalone backend test files pass. The latest provenance-display and transactional creation/consolidation tests were rerun successfully after the final changes.
- Tour validation passes: 145 registered/rendered anchors and 106 anchors used by walkthrough steps.
- Chromium checks cover all five sections at 390, 768 and 1440 pixels, evidence-dialog dismissal, growth/task links, project coverage, and policy pause/resume. No page errors or document-width overflow occurred.
- The full backend suite reports 103 passing files and six failures. All six reproduce on an untouched checkout with the same dependencies: `planTextExtract.test.ts` and `taskService.completedAt.test.ts` require Slack configuration; `blockerMutationService.test.ts` and `taskMutationService.modal.test.ts` have existing fixture failures; `vaultGeometry.test.ts` and `vaultGeometryService.test.ts` cannot resolve `occt-import-js/package.json`.

The browser checks use intercepted API fixtures and no live member data. The backend policy/mutation/creation tests use pure or transactional injected boundaries, without a database or paid model calls. A real migration rehearsal still requires PostgreSQL: Docker is installed locally but its daemon is unavailable, so no database migration has been applied here.

Application screenshots: [desktop](implementation-desktop.png), [phone](implementation-mobile.png). These demonstrate the integrated components using fictional intercepted responses.
