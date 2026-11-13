# Connector insights + recommendations progress (cobalt-ibis)

Updated: 2026-11-13. Phases 1–11 done.

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
| 2 — Open plans to members safely | Done — `constellation.contacts` scope; plan/contacts grantable by any member, delete admin-only (consent + preview + execute); `PROJECT_SCOPED_ACTION_TYPES` + injected `canEditProject` gate in preview/execute; rate kind `log` (20/h). Gate: build ok, typecheck ok, backend 117/118 (baseline) |
| 3 — Consent + Connected apps UI | Done — plan checkbox for every member (default on for admins, off for members), delete admin-only, contacts checkbox off by default, "read-only" note only when plan isn't offered; Connected apps contacts label. No CSS change. Gate: build ok, root 622/622 |
| 4 — Pure insights core | Done — `projectInsightsCore.ts` (`computeProjectInsights`, `openHoursFor`, `HOURS_FALLBACK`, `HOURS_PER_POINT`, `AGING_BUCKETS`, `weekStartUtc`). UTC date math (website uses local); `meanCycleDays` null when no completions (website shows 0); weekly[] is Monday-aligned, so its sum can differ from the rolling `completedInWindow`. Gate: typecheck ok, backend 118/119 (baseline + 1) |
| 5 — get_project_insights | Done — `mcp/tools/insights.ts` registered in `server.ts`; kpis/workload/weekly/aging + time (totals, byWeek, byMember; task titles dropped) + skills (≤5/member, ≤1 evidence; degrades to `not_a_member`/`unavailable`). Names only inside `untrustedData`. Gate: build ok, typecheck ok, backend 119/120 |
| 6 — Draft cleanup cron | Done — `agentDraftCleanup.ts` (`cleanupAgentDrafts`, `runAgentDraftCleanup`); drafts pruned 24h after expiry, dismissals at `until`; `scheduler.ts` `17 * * * *`. Gate: typecheck ok, backend 120/121 |
| 7 — Pure recommendation core | Done — `recommendationCore.ts` (`RULE_DEFAULTS`, `buildContext`, `rankCandidates`, `buildRecommendations`), id-based `RecInput` (Phase 8 maps into it). Milestone rules include overdue milestones and skip COMPLETED/CANCELLED (controller added CANCELLED). Overload reassign keeps co-assignees. Gate: typecheck ok, backend 121/122, 43 checks |
| 8 — Recommendation tools | Done — `mcp/tools/recommendations.ts` (`get_recommendations`, `get_assignment_candidates`, `dismiss_recommendation`) registered in `server.ts`; `scopedContext` exported from `projects.ts`. Permission-filtered per task + project gate; blocked recommendations stay as findings (`planId: null`, note); grant-bound draft reuse re-verified on the row; bots/deactivated excluded via `loadInactiveMemberIds`; ASSIGN that normalizes to empty assignees dropped. Gate: build ok, typecheck ok, backend 122/123 |
| 9 — Contacts + log-back | Done — `mcp/tools/contacts.ts` (`get_project_contacts` under `constellation.contacts`; `record_external_action` under plan, rate `log`, roster-only recipients, local task only, actor = connection member) registered in `server.ts`. Gate: build ok, typecheck ok, backend 123/124 |
| 10 — MCP prompts | Done — `mcp/prompts.ts` (`weekly_triage`, `review_recommendations`, `status_update_email`; args quoted + capped at 200) wired in `server.ts`; test checks every referenced tool is registered. Gate: build ok, typecheck ok, backend 124/125 |
| 11 — Activity feed label | Done — `ProjectActivity.jsx` `AGENT_EXTERNAL_ACTION` (paper-plane, "Claude", in AI filter; "via Claude — App: summary · N recipients"); new `ProjectActivity.test.jsx`. TaskModal history untouched (server-humanized "agent external action"). No CSS. Gate: build ok, root 627/627 |
| 12 — Security review | Not started |
| 13 — Docs | Not started |
| 14 — Manual rollout | Not started |

## Follow-ups

- `icsFeedService.test.ts` needs DNS (violates the no-network test rule); inject the resolver in a separate change.
- Phase 13: add the `17 * * * *` connector cleanup to the `backend/src/slack/AGENTS.md` scheduler bullet.
- Phase 8 tests use a fake `normalize`: the real `normalizeActionPlan` imports the Slack Bolt app at load (needs SLACK_APP_TOKEN). Phase 12 to review the real path; consider splitting normalize into an import-safe module later.
- `buildProjectContext().members` includes bots (no isBot filter) — worked around in Phase 8; other AI features may want the same filter.
- `prisma validate` needs a `DATABASE_URL` (dummy is fine).

- Web routes `/api/projects/:id/ai-execute-plan` and milestone/blocker REST lack project-edit checks (pre-existing; separate decision).
