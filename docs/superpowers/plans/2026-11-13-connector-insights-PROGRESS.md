# Connector insights + recommendations progress (cobalt-ibis)

Updated: 2026-11-13. No phases started.

## Decisions

- Staging: server builds recommendation drafts on request; Claude reviews with full snapshot + insights and may edit (new preview) or dismiss.
- Contacts: project members only, under opt-in scope `constellation.contacts`; log-back via `record_external_action`.
- Who: any member may hold `constellation.plan`, limited by own permissions; delete stays admin-only.
- Timing: on request, no build cron (cleanup cron only).
- Executor: controller + subagents.
- Base branch: `feat/duet-insights`, created from `feat/duet-connector` 06f28ea8 (pushed). Plans live in the repo so a VM can run them.

## Phases

| Phase | Status |
| --- | --- |
| 1 — Schema + migration | Not started |
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

- Web routes `/api/projects/:id/ai-execute-plan` and milestone/blocker REST lack project-edit checks (pre-existing; separate decision).
