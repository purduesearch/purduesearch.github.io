# Controller handoff: connector insights + staged recommendations (cobalt-ibis)

Runs on any machine, including a fresh VM. Everything the controller needs is in the repo on
branch `feat/duet-insights`:

- Plan: `docs/superpowers/plans/2026-11-13-connector-insights.md`
- Handoff: this file
- Progress: `docs/superpowers/plans/2026-11-13-connector-insights-PROGRESS.md`

Nothing depends on `~/.claude/` or on Windows paths.

## VM setup (Henry, once)

```bash
git clone https://github.com/purduesearch/purduesearch.github.io.git
cd purduesearch.github.io
git switch feat/duet-insights        # or: git pull, if already cloned
npm ci                               # root app
(cd backend && npm ci && npx prisma generate)
```

Node 24 matches the backend. No `backend/.env`, database or network credentials are needed: the
gates are `npm run build`, `npm run typecheck` and `npm test`, and the standalone tests use
injected boundaries. Git must be able to push to `origin` (for example `gh auth login`), because
the progress file is how a later session resumes.

Then start Claude Code in the repo root and paste everything below the line.

---

You are the **controller** for upgrading the Constellation Claude connector. You plan, dispatch,
verify and record. Subagents write most of the code. You own the registry files and the final
say on every phase.

## Read first (in this order)

1. `docs/superpowers/plans/2026-11-13-connector-insights.md`: the plan. **Locked decisions**,
   **New and changed tools** and **Recommendation rules** are fixed. Do not redesign them. If
   one is impossible, stop and ask Henry.
2. `CLAUDE.md` and the `AGENTS.md` files it imports (auto-loaded). Watch: CSS cache bump rule,
   `req.memberId`, `ActivityLog` vs `Activity`, crons only in `scheduler.ts`, "no Gemini in
   connector tools".
3. `docs/CLAUDE-DUET.md` and `backend/src/mcp/` (`server.ts`, `context.ts`, `untrusted.ts`,
   `tools/*.ts`, `tools/testHarness.ts`). Every new tool copies these patterns.
4. `docs/superpowers/plans/2026-11-13-connector-insights-PROGRESS.md`. Resume from it and do
   not redo done phases.

## Before Phase 1

The base branch is settled: work on `feat/duet-insights`, which was created from
`feat/duet-connector` 06f28ea8. If `feat/duet-connector` merges to `main` first, rebase only
after asking Henry. Never commit to `main`.

1. Run `git switch feat/duet-insights && git pull --ff-only`.
2. Confirm the working tree is clean.
3. Run the gate once (below) to get a green baseline. If the baseline fails, record the failure
   in the progress file and ask Henry before fixing unrelated code.

## Working rules

- One phase at a time, in plan order (1 → 13). Phase 14 is manual for Henry: give him the
  checklist and wait.
- Dispatch each phase to one `general-purpose` subagent. Use Sonnet by default and Opus for
  Phases 2, 8 and 12. Phase 12's reviewer must be a fresh agent.
- **Controller-owned registry files.** Subagents return exact lines and you apply them:
  `backend/src/mcp/server.ts` (tool registration lines, except Phase 10, which owns it),
  `backend/src/slack/scheduler.ts`, `backend/src/app.ts`, `backend/prisma/schema.prisma` (except
  Phase 1), `backend/package.json`, root `.env.example`, `src/App.js`, and every `AGENTS.md` /
  `CLAUDE.md`.
- **Brief format.** Each brief is self-contained because the subagent has not seen this
  conversation. Include: goal, the files it may touch (≤4 source files plus tests), `rg` anchors,
  locked decisions copied in, tests to add, gate commands and the receipt format. Tell it never
  to read `schema.prisma`, `tasks.ts`, `ProjectDetail.jsx`, `TaskModal.jsx` or
  `public/clubpm-theme.css` in full.
- **Gate after every phase, run by you**: root `npm run build`; in `backend/`, run
  `npm run typecheck` and `npm test`. When `src/` changed, also run root `npm run test:ci`.
  Fix or re-dispatch until green.
- **Commit per phase** after the gate. Commit subjects on member-visible work are patch-note
  copy, for example `feat(connect): let Claude see project insights and suggested plans`. For
  internal phases, use `chore(duet-insights): phase N …`. End every message with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Progress lives in the repo.** After each phase, update
  `docs/superpowers/plans/2026-11-13-connector-insights-PROGRESS.md` (status, commit hash, gate
  counts and follow-ups) and include it in that phase's commit.
- **Push `feat/duet-insights` after every phase commit** (`git push -u origin feat/duet-insights`)
  so a VM loss never loses work. Henry authorized this for this branch only. Do not force-push.
- Without Henry's explicit go-ahead, do not open a PR, merge, deploy, push any other branch or run
  migrations against a real database.
- The VM has no `~/.claude` memory from Henry's laptop. Everything you need is in the repo files
  above, so don't look for local plan paths.
- Never weaken a safety rule to make a test pass. Stop and ask instead.

## Codebase anchors (verified 2026-11-13 on feat/duet-connector 06f28ea8)

- Scopes: `backend/src/services/oauthCore.ts` `OAUTH_SCOPES`, `validateScopes`. Consent admin
  filter: `backend/src/services/oauthService.ts`. Search `member.isAdmin || scope ===` and
  `"Project changes require an administrator"`.
- Context and rates: `backend/src/mcp/context.ts` `LIMITS`, `McpRateKind`, `resolve`,
  `authorizeProject`, `assertAdmin`.
- Plans: `backend/src/mcp/tools/plans.ts`. Search `admin: true`, `DELETE_SCOPE` and
  `planContentHash`. Draft model `AgentPlanDraft` in `schema.prisma`
  (`rg -n "model AgentPlanDraft" -A 16`).
- Engine: `backend/src/services/aiActionService.ts` `normalizeActionPlan`, `executeActionPlan`,
  `requireEditable`, `dispatchAction`. Project-scoped cases (`CREATE_TASK`, `CREATE_MILESTONE`,
  `LINK_MILESTONE`, `ATTACH_BLOCKER`, `RESOLVE_BLOCKER`) do **not** check project edit
  permission. The REST milestone/blocker routes don't either. The connector gate in Phase 2
  covers this for the connector only.
- Permissions: `backend/src/middleware/taskAccess.ts` `getTaskPermissions(memberId, taskId)` and
  `backend/src/services/projectEditAccess.ts` `canEditProject(memberId, projectId)`.
- Read model: `backend/src/mcp/tools/projects.ts` `projectTasksQuery`, `scopedContext`, `read`;
  `backend/src/utils/projectContextRender.ts` `computeProjectSignals`.
- Insights sources: `src/components/clubpm/analytics/useAnalyticsData.js` (`computeKpis`,
  `computeVelocity`, `computeThroughput`, `AGING_BUCKETS`, `RISK_FACTORS`);
  `backend/src/services/timeInsightsService.ts` `getProjectTimeInsights(projectIds, { from, to })`;
  `backend/src/services/skillWorkspaceService.ts` `getProjectSkillCoverage(memberId, projectId)`
  (throws `TaxonomyError("FORBIDDEN")` for non-members; makes no model call).
- Audit write: `backend/src/services/activityService.ts` `logAuditEvent`.
- Describe: `backend/src/services/aiActionDescribe.ts` `describeAction`.
- Member contact fields: `Member.email` (nullable), `slackId`, `slackHandle`, `displayName`;
  `ProjectMember.isLead`, `projectRole`.
- Frontend: `src/pages/ClubPM/ConnectConsent.jsx` (`PLAN`, `DELETE`, `canPlan` gated on
  `member.isAdmin`), `src/components/clubpm/ConnectedApps.jsx`,
  `src/components/clubpm/ProjectActivity.jsx` (`AI_PLAN_EXECUTED` entries).
- MCP SDK `@modelcontextprotocol/sdk` 1.32.2 and zod 4.6.7 are pinned exactly. Check
  `registerPrompt` in the installed package typings before Phase 10.
- No cleanup exists for expired `AgentPlanDraft` rows today. Phase 6 adds it.

## Receipt format (each subagent returns exactly this)

```
PHASE: <n> — <title>
FILES: <path> (created|edited) …
REGISTRY LINES (for controller): <file> — <exact lines + where> | none
TESTS: <test files added> — <pass count>
GATE: build <ok|fail>, backend typecheck <ok|fail>, backend test <ok|fail>, root test:ci <ok|fail|n/a>
DEVIATIONS: <what differs from the brief, and why> | none
OPEN: <questions or follow-ups> | none
```

## Done means

Phases 1–13 are committed on the feature branch with green gates. The progress file is complete
and `docs/CLAUDE-DUET.md` is updated. The final message to Henry lists what is ready, the manual
Phase 14 steps and every follow-up recorded during the run.

Start by reading the files above, then ask Henry the base-branch question.
