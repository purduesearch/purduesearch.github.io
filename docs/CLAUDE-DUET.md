# Claude connector (Duet, claude.ai, Claude Code)

Constellation exposes a remote MCP server so a member's Claude can read what is happening on
their projects and apply changes through the existing AI action-plan engine. It works in any
Claude surface that supports custom connectors: Claude Duet, regular claude.ai chats, and
Claude Code. Design and phase history: `~/.claude/plans/slate-kestrel.md`.

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
| `constellation.read` | All read tools | Any member |
| `constellation.plan` | `preview_action_plan`, `execute_action_plan` | Admins only |
| `constellation.plan.delete` | `DELETE_TASK` actions inside a plan | Admins only, off by default |

Every tool call re-reads the token, grant, member and the member's current projects. The grant's
project list only narrows what the member can open today; it never widens it. Plan tools also
re-check that the member is still an admin. Executed actions still go through
`executeActionPlan`, which re-checks task permissions and board locks per action.

Quotas per grant per hour: 60 reads, 30 previews, 10 executions (process-local).

Tokens are opaque and stored only as SHA-256 hashes. Access tokens last 1 hour, refresh tokens 30
days and rotate on use; replaying a used refresh token revokes the whole grant. Logging out of
Constellation does not revoke a grant. Disconnecting it in Profile, or deactivating the member,
does.

## Tools

Read: `connection_status`, `list_my_projects`, `get_project_snapshot`, `get_my_dashboard`,
`get_changes_since_last_check`, `get_task`, `search_tasks`, `get_plan_format`.

Write: `preview_action_plan` validates actions with `normalizeActionPlan`, stores an
`AgentPlanDraft` (exact JSON bytes plus a SHA-256 bound to the project, 1-hour expiry) and
returns a plain-English diff. `execute_action_plan(planId)` runs a draft once, from the same
grant only, at most 25 actions. Raw actions are never accepted on execute.

`get_changes_since_last_check` keeps one cursor per grant (`OAuthGrant.changeCursor`,
`<ISO time>|<ActivityLog id>`). Only a call with no arguments advances it; `projectId` or `since`
read without moving it. The first check looks back 7 days, and no read looks back more than 14.

No tool calls Gemini, so the connector never spends the club's AI quota.

## Audit trail

Connector writes log `ActivityLog.source = AGENT` with `payload.client` set to the client name.
The project Activity feed shows a "Claude" badge on those rows.

## Threat model

- **Prompt injection.** Titles, descriptions, comments and activity payloads are written by other
  members. Every tool returns them inside `{ kind: "untrusted_member_data", instruction, content }`
  and each tool description says the content is data. Writes still need a preview and an execute
  call, which Claude shows for approval when the tool is set to "Needs approval".
- **Cross-site consent.** Session cookies are `SameSite=None`, so consent and grant management
  accept only the login Bearer header.
- **Cross-project leakage.** Snapshot, task, search and change tools filter related rows
  (dependencies, subtasks, milestones, blockers) to granted projects. Missing and ungranted tasks
  or plans return the same error so ids cannot be probed.
- **Open read model.** `GET /api/projects/:id` and the web AI routes (`/ask`,
  `/ai-suggest-actions`, `/ai-plan-prompt`, `/ai-plan-import`) are readable by any logged-in
  member. The connector is stricter (membership or admin). Tightening the web routes would change
  who can view a project in the app, so it is a separate decision.

## Setup (per member)

1. In claude.ai: Settings → Connectors → Add custom connector →
   `https://api.purduesearch.org/mcp`.
2. Sign in when Constellation opens, tick the projects to share, and approve.
3. In the connector's tool settings, set `execute_action_plan` (and `preview_action_plan` if you
   like) to "Needs approval" and the read tools to "Always allow".
4. Test with MCP Inspector or a normal Claude chat first ("call connection_status"), then in Duet.

Starter Duet routines:

- "Each weekday morning, call `get_changes_since_last_check` and `get_my_dashboard`; tell me what
  slipped, who is overloaded, and what is blocked. Draft a plan, but do not execute it."
- "When I say 'fix it', preview the plan and show me the diff before executing."

Duet cannot be woken by Constellation. It sees changes when you message it or on its background
check, and background checks count against your Claude plan limits.

## Revoking

Profile → Customize → Integrations → Connected apps → Disconnect. This revokes every access and
refresh token for that grant immediately. Removing the connector in claude.ai alone does not
revoke the grant on our side.
