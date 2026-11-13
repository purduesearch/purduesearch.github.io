# Connector insights + recommendations progress (cobalt-ibis)

Updated: 2026-11-13. Phase 1 done.

## Decisions

- Staging: server builds recommendation drafts on request; Claude reviews with full snapshot + insights and may edit (new preview) or dismiss.
- Contacts: project members only, under opt-in scope `constellation.contacts`; log-back via `record_external_action`.
- Who: any member may hold `constellation.plan`, limited by own permissions; delete stays admin-only.
- Timing: on request, no build cron (cleanup cron only).
- Executor: controller + subagents.
- Base branch: `feat/duet-insights`, created from `feat/duet-connector` 06f28ea8 (pushed). Plans live in the repo so a VM can run them.

## Baseline (2026-11-13, VM)

- Root build ok; root `test:ci` 89 suites / 618 tests passed.
- Backend `npm run typecheck` OOMs under Node 22's default heap; passes with `NODE_OPTIONS=--max-old-space-size=6144`. Gates use that flag.
- Backend `npm test`: 117 passed, 1 failed — `src/services/icsFeedService.test.ts` (`assertSafeFeedUrl` does real DNS; the VM has none). Pre-existing, environmental, not fixed here.
- `feat/duet-connector` merged to `main` (d23a0be1, tree identical to 06f28ea). Henry: leave the branch based on 06f28ea; no rebase.

## Phases

| Phase | Status |
| --- | --- |
| 1 — Schema + migration | Done — `AgentPlanDraft.origin`/`recommendationKey`, `AgentRecommendationDismissal`, `AGENT_EXTERNAL_ACTION`; migration `20261114120000_connector_insights` (prisma migrate diff output). Gate: build ok, typecheck ok, backend 117/118 (baseline), root n/a |
| 2 — Open plans to members safely | Not started |
| 3 — Consent + Connected apps UI | Not started |
| 4 — Pure insights core | Not started |
| 5 — get_project_insights | Not started |
| 6 — Draft cleanup cron | Not started |
| 7 — Pure recommendation core | Not started |
| 8 — Recommendation tools | Not started |
| 9 — Contacts + log-back | Not started |
| 10 — MCP prompts | Not started |
| 11 — Activity feed label | Not started |
| 12 — Security review | Not started |
| 13 — Docs | Not started |
| 14 — Manual rollout | Not started |

## Follow-ups

- `icsFeedService.test.ts` needs DNS (violates the no-network test rule); inject the resolver in a separate change.
- `prisma validate` needs a `DATABASE_URL` (dummy is fine).

- Web routes `/api/projects/:id/ai-execute-plan` and milestone/blocker REST lack project-edit checks (pre-existing; separate decision).
