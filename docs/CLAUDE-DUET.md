# Claude connector (Duet, claude.ai, Claude Code)

Constellation exposes a remote MCP server so a member's Claude can read what is happening on
their projects and apply changes through the existing AI action-plan engine. It works in any
Claude surface that supports custom connectors: Claude Duet, regular claude.ai chats, and
Claude Code. Design and phase history: `~/.claude/plans/slate-kestrel.md` (original connector) and `docs/superpowers/plans/2026-11-13-connector-insights.md` (insights, recommendations, contacts).

## Endpoints

All served by the API process at `https://api.purduesearch.org`. The catch-all nginx
`location /` already forwards them with `Host` preserved and `proxy_buffering off`, so no
vhost change is needed.

| Path | Purpose |
|------|---------|
| `/.well-known/oauth-authorization-server` | RFC 8414 metadata |
| `/.well-known/oauth-protected-resource[/mcp]` | RFC 9728 resource metadata |
| `/oauth/register` | Dynamic client registration (public PKCE clients only) |
| `/oauth/authorize` | Validates the request, stores it for 10 minutes, redirects to `/clubpm/connect?req=` |
| `/oauth/pending/:id`, `/oauth/consent` | Consent page data and decision. **Login Bearer only**, never the session cookie |
| `/oauth/token`, `/oauth/revoke` | Code + refresh exchange (rotating refresh), revocation |
| `/oauth/grants[/:id]` | Profile → Connected apps: list, edit projects (`PATCH`), disconnect (`DELETE`). Login Bearer only |
| `/mcp` | Streamable HTTP, stateless, JSON responses, one SDK server per request |

Environment (root `.env.example`): `MCP_ISSUER` (default `https://api.purduesearch.org`) and
`MCP_ALLOWED_REDIRECT_URIS` (comma-separated exact callbacks, default
`https://claude.ai/api/mcp/auth_callback`). `/mcp` rejects any `Host` other than the issuer's,
so the proxy must pass `Host` through unchanged.

## Permissions

A connection is a **grant**: one member, one client, a set of scopes and a set of projects the
member ticked at consent.

| Scope | Allows | Who can grant it |
|-------|--------|------------------|
| `constellation.read` | All read tools, including insights and assignment candidates | Any member |
| `constellation.plan` | `preview_action_plan`, `execute_action_plan`, `get_recommendations`, `dismiss_recommendation`, `record_external_action` | Any member (requires read). Pre-checked at consent for admins only |
| `constellation.plan.delete` | `DELETE_TASK` actions inside a plan | Admins only, off by default. Enforced at consent, preview and execute |
| `constellation.contacts` | `get_project_contacts` | Any member (requires read). Opt-in: off by default for everyone |

Planning is **not** an admin privilege. A member's plan is limited to what that member can do in
the app: `executeActionPlan` re-checks task permissions and board locks per action, and the
connector adds a project-edit gate (the member's own `canEditProject`) for the project-scoped
actions `CREATE_TASK`, `CREATE_MILESTONE`, `LINK_MILESTONE`, `ATTACH_BLOCKER` and
`RESOLVE_BLOCKER`. Actions the member cannot take are dropped at preview with a reason and
refused at execute.

Every tool call re-reads the token, grant, member and the member's current projects. The grant's
project list only narrows what the member can open today; it never widens it. Deleting tasks also
re-checks that the member is still an admin.

Quotas per grant per hour (process-local): 60 reads, 30 previews, 10 executions, 20 logs.

Tokens are opaque and stored only as SHA-256 hashes. Access tokens last 1 hour, refresh tokens 30
days and rotate on use; replaying a used refresh token revokes the whole grant. Logging out of
Constellation does not revoke a grant. Disconnecting it in Profile, or deactivating the member,
does.

**Existing grants keep their scopes.** Refreshing a token never adds scopes. A member who
connected before plan/contacts opened up must disconnect and reconnect to get them.

## Tools

| Tool | Scope | Rate kind | Notes |
|------|-------|-----------|-------|
| `connection_status`, `list_my_projects`, `get_project_snapshot`, `get_my_dashboard`, `get_changes_since_last_check`, `get_task`, `search_tasks`, `get_plan_format` | read | read | |
| `get_project_insights` | read | read | KPIs, per-member workload, weekly completions, open-task aging, logged time (manual vs lab) and per-member skill coverage for one project |
| `get_assignment_candidates` | read | read | Ranks who could take one task (see Recommendations) |
| `get_recommendations` | plan | preview | Stages draft plans; see Recommendations |
| `dismiss_recommendation` | plan | read | Hides one recommendation for you, 1 to 30 days (default 14) |
| `preview_action_plan` | plan | preview | Validates and stores a draft, returns a plain-English diff |
| `execute_action_plan` | plan | execute | Runs a draft once |
| `get_project_contacts` | contacts | read | Email, Slack id and handle of the project's members |
| `record_external_action` | plan | log | Logs what Claude did in another app; sends nothing |

`preview_action_plan` validates actions with `normalizeActionPlan`, stores an `AgentPlanDraft`
(exact JSON bytes plus a SHA-256 bound to the project, 1-hour expiry) and returns a plain-English
diff. `execute_action_plan(planId)` runs a draft once, from the same grant only, at most 25
actions. Raw actions are never accepted on execute. Neither tool is admin-gated any more; only
`DELETE_TASK` is.

`get_changes_since_last_check` keeps one cursor per grant (`OAuthGrant.changeCursor`,
`<ISO time>|<ActivityLog id>`). Only a call with no arguments advances it; `projectId` or `since`
read without moving it. The first check looks back 7 days, and no read looks back more than 14.

No tool calls Gemini, so the connector never spends the club's AI quota.

## Recommendations

`get_recommendations(projectId, max?)` builds recommendations **on request**; no cron builds them.
Each one that carries changes is staged as an ordinary `AgentPlanDraft` (`origin: RECOMMENDED`,
`recommendationKey`) bound to the calling grant, expiring after 1 hour. An identical, unexpired,
unexecuted draft for the same grant is reused instead of duplicated. Default 8 results, at most
15.

Recommendations are **permission-filtered**: only actions the member could run themselves become
a plan. A recommendation whose actions are all blocked is still shown as a finding with
`planId: null` and a note. Findings for rules with no safe automatic fix (below) never carry a
plan. Dismissals are per member and per project (`AgentRecommendationDismissal`), 1 to 30 days.

Rules (`RULE_DEFAULTS` in `recommendationCore.ts`; deterministic, no Gemini):

| Rule | Fires when | Severity | Proposed action |
|------|-----------|----------|-----------------|
| `UNASSIGNED_DUE_SOON` | Open task with no assignee, due within 7 days or overdue | high if overdue or high priority, else medium | `ASSIGN` to the top candidate |
| `OVERLOADED_MEMBER` | Open hours at least 1.5x the roster median with at least 3 open tasks, or at least 3 overdue tasks | medium | `ASSIGN` one TODO task to the top candidate (co-assignees kept) |
| `STALE_IN_PROGRESS` | In progress, no update for 14+ days | low | `ADD_COMMENT` nudge |
| `BLOCKED_WITHOUT_CAUSE` | Status BLOCKED with no open dependency or active blocker | medium | `SET_STATUS` to TODO |
| `OVERDUE_NO_OWNER_ACTIVITY` | Assigned, 7+ days overdue and no update for 7+ days | high | Finding only |
| `MILESTONE_EMPTY` | Open milestone due within 21 days (or overdue) with no tasks | medium | Finding only |
| `MILESTONE_UNASSIGNED_WORK` | Open milestone due within 14 days (or overdue) with unassigned open tasks | medium | Finding only |

Completed and cancelled milestones never trigger milestone rules.

**Candidate ranking** (`get_assignment_candidates`, and the `ASSIGN` rules): bots, current
assignees and overloaded members are skipped. Score = `-open hours - 4 x overdue tasks +
min(recent logged hours, 10) + 3 if a skill name shares a word of 3+ letters with the task
title`. Ties break on fewer open tasks, then name, then id. Reasons are returned as numbers and
flags, not prose.

### Review loop

Recommendations are drafts for Claude to check, not orders. For each draft Claude calls
`get_project_snapshot` and `get_project_insights`, then does one of:

1. **Execute** `execute_action_plan(planId)`, after you approve that specific plan.
2. **Edit** by calling `preview_action_plan` with improved actions, which returns a new `planId`.
3. **Dismiss** with `dismiss_recommendation`.

## Cross-app workflow

Constellation sends nothing to Gmail, Slack or Calendar. With `constellation.contacts`, Claude can
fetch teammates' contact details and use **your own** connectors for the delivery:

1. `get_project_contacts(projectId)` (project members only, no bots or deactivated members).
2. Claude drafts in your Gmail, Slack or Calendar connector. Draft by default; it sends only if you
   say so.
3. `record_external_action({ projectId, taskId?, app, kind, summary, recipientMemberIds })` writes
   one `ActivityLog` row, `AGENT_EXTERNAL_ACTION`, source `AGENT`, payload
   `{ client, app, kind, summary, recipientMemberIds }`. Recipients must be on the project roster
   and the task, if given, must belong to the project. It appears in the project Activity feed as
   "Claude" under the AI filter ("via Claude - Email: summary, N recipients").

## Prompts (Duet routines)

The server publishes three MCP prompts. They are workflow text only (no data, no database access,
no AI call), their arguments are quoted and capped at 200 characters, and none executes anything
without your approval of that specific plan.

| Prompt | Does |
|--------|------|
| `weekly_triage` (`projectId?`) | `get_changes_since_last_check`, `get_my_dashboard`, then insights and recommendations per project (at most 5 without a `projectId`); summarizes what changed, risks and planIds |
| `review_recommendations` (`projectId`) | Runs the review loop above on a project's staged drafts, consulting `get_assignment_candidates` before any reassignment |
| `status_update_email` (`projectId`, `audience?`) | Writes a status update from insights and snapshot, optionally drafts it via your mail connector using `get_project_contacts`, then calls `record_external_action` |

## Audit trail

Connector writes log `ActivityLog.source = AGENT` with `payload.client` set to the client name.
The project Activity feed shows a "Claude" badge on those rows. `record_external_action` adds the
`AGENT_EXTERNAL_ACTION` event, which records that Claude acted in another app on your behalf, not
that Constellation changed anything.

Housekeeping: an hourly cron (`17 * * * *`, `agentDraftCleanup.ts`) deletes plan drafts 24 hours
after they expire (the grace lets execute still answer "expired") and recommendation dismissals
once their `until` passes.

## Threat model

- **Prompt injection.** Titles, descriptions, comments, member names, skills and activity payloads
  are written by other members. Every tool returns them inside
  `{ kind: "untrusted_member_data", instruction, content }` and each tool description says the
  content is data. This covers insights, recommendations, candidates and contacts too.
  Recommendation rationales are built from fixed templates with numbers only, never copied member
  text. Writes still need a preview and an execute call, which Claude shows for approval when the
  tool is set to "Needs approval".
- **Cross-site consent.** Session cookies are `SameSite=None`, so consent and grant management
  accept only the login Bearer header.
- **Cross-project leakage.** Snapshot, task, search, change, insights and recommendation tools
  filter related rows (dependencies, subtasks, milestones, blockers) to the one project asked
  about. Missing and ungranted tasks or plans return the same error so ids cannot be probed.
- **Contacts exposure.** `get_project_contacts` needs its own opt-in scope and returns only the
  active, non-bot members of projects the grant covers. `record_external_action` accepts only
  roster members as recipients.
- **Open read model.** `GET /api/projects/:id` and the web AI routes (`/ask`,
  `/ai-suggest-actions`, `/ai-plan-prompt`, `/ai-plan-import`) are readable by any logged-in
  member. The connector is stricter (membership or admin). Tightening the web routes would change
  who can view a project in the app, so it is a separate decision.
- **Known gap.** Task-targeted plan actions check only the task permission rule (admin, lead,
  creator or assignee), not project edit access, the same as the web `/ai-execute-plan` route.

## Setup (per member)

1. In claude.ai: Settings → Connectors → Add custom connector →
   `https://api.purduesearch.org/mcp`.
2. Sign in when Constellation opens, tick the projects to share, and approve.
3. On the consent page, "Allow project changes" is pre-checked for admins only; "Share teammates'
   contact details" is off for everyone. Tick only what you want.
4. In the connector's tool settings, set `execute_action_plan` and `record_external_action` (and
   `preview_action_plan` if you like) to "Needs approval" and the read tools to "Always allow".
5. Test with MCP Inspector or a normal Claude chat first ("call connection_status"), then in Duet.

Starter Duet routines:

- "Each weekday morning, call `get_changes_since_last_check` and `get_my_dashboard`; tell me what
  slipped, who is overloaded, and what is blocked. Draft a plan, but do not execute it."
- "When I say 'fix it', preview the plan and show me the diff before executing."

Or use the built-in prompts: `weekly_triage`, `review_recommendations`, `status_update_email`.

Duet cannot be woken by Constellation. It sees changes when you message it or on its background
check, and background checks count against your Claude plan limits.

## Revoking

Profile → Customize → Integrations → Connected apps → Disconnect. This revokes every access and
refresh token for that grant immediately. Removing the connector in claude.ai alone does not
revoke the grant on our side.
