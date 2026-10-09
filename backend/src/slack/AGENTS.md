# AGENTS.md — Slack Integration (`backend/src/slack/`)

Scope: Slack Bolt handlers, cron scheduler, and the two-way Slack portal. Applies
together with the root and `backend/AGENTS.md`.

---

### Slack (`backend/src/slack/`)
- `scheduler.ts` — The sole cron registry (node-cron): quest/shop/streak maintenance, vault/training cleanup, Slack file/emoji/membership/read synchronization, notification cleanup, training expiry, outreach publication/templates/event-promo drafts, milestone refresh, meeting-poll reminders, blog publication, PR-linked Vault change-request reconcile (`*/20`, `syncPr`, plus `VaultWebhookDelivery` pruning), Vault release package build/retry (`*/15`, `retryReleasePackages`), the Vault notification outbox (`*/2`, `processDueVaultNotifications`), the Vault search reconcile (`*/30`, `reconcileVaultSearch`), the Vault geometry-diff queue + cache prune (`*/2`, `processDueGeometryDiffs` / `pruneGeometryCache`), the Slack card outbox (`* * * * *`, `flushDueCardBundles`), and admin synchronization. The card outbox flushes reactive deliveries; it is not a scheduled digest. **Add new crons here only.** Scheduled digests, standups, due-date/escalation reports, milestone alerts, outreach summaries, kudos digests, and CRM follow-ups were removed on 2026-09-12 and must not be reintroduced casually. Scheduled jobs otherwise stay in-app or maintain data; the remaining intentional scheduled Slack sends are the hourly meeting-poll reminder through `remindNonResponders`, and the lab check-out reminder (`*/5`, `sendDueReminders`) and auto-close notice (hourly `:07`, `autoCloseStale`) from `labVisitService.ts` — one each per visit, via `createNotification` + `slackText` (`LAB_CHECKOUT_REMINDER`, `LAB_VISIT_PENDING`). `/lab` (and `/c lab`) is registered in `commands.ts`; the Slack app needs a `/lab` slash command with the same request URL as `/c`. Reactive bot replies and web-triggered `createNotification` deliveries are separate from cron behavior.

---

### Slack portal invariants
Constellation is a two-way portal to the Slack workspace (plan: `docs/superpowers/plans/2026-09-10-slack-portal.md`, decisions D1–D14). Each rule below is load-bearing:
1. **No admin bypass for private conversations.** `canReadConversation` has no admin input at all, and static tests fail if either access module (`slackConversationAccess.ts`, `middleware/conversationAccess.ts`) mentions `isAdmin` — DMs are readable only by their participants (D2).
2. **Private-channel, DM and group-DM files never go to Google Drive** (`mirrorTargetFor` in `slackFileService.ts`) — the Drive bot account is browsed by humans (D5).
3. **`/uploads/slack` must never be served statically** — files there are served only through the access-checked `/api/chat/files` proxy; `appMountOrder.test.ts` asserts the guard sits above `express.static` (D6).
4. **Backfill never notifies; pings come only from `slack/events.ts`** — importing 90 days of history must not fire hundreds of notifications (D10).
5. **`SLACK_*` notifications are never DM'd back to Slack, and our own bot's posts never ping** — two loop guards; the Slack ping already happened, and Constellation notifies natively for everything the bot posts (D9).
6. **HTTP 409 from `/api/chat` means exactly "reconnect Slack"** — the UI keys its reconnect prompt off the status alone (`slackSendRules.ts`); never return 409 for anything else there.
7. **Any Slack read of a specific conversation goes through `resolveReadClient()`, never the bot token directly** — the bot isn't in most private channels or any DM, so a bot-token read silently returns nothing or fails.
8. **`ignoreSelf` is off in `slack/bolt.ts`; every reactive Slack handler must guard against bot authors** — the bot's own posts are archived (D4), so a handler that replies to messages without a guard will loop on itself.
9. **Slack user events are delivered once per event, however many members can see it** — which member's token an event arrived under says nothing about who else can see it; derive recipients and access from `SlackConversationMember`, never from the delivery.
10. **`notificationChannels` is now enforced** — `createNotification` routes by the member's per-type preference (D14); a call site opts in to the Slack DM by passing `slackText` (text DM) or `slackCard` (durable card outbox), never by calling `queueDm` alongside it. The one deliberate exception is the Vault notification outbox (`services/vaultNotificationService.ts`): it needs retryable, deduplicated delivery, so it applies the same `routeFor` rule itself and sends through `sendSlackDmNow`, which throws instead of swallowing errors.
11. **Task cards never post to channels.** Assignment cards go to the assignee's DM as a bundle, respecting `notificationChannels.TASK_ASSIGNED`; thread context cards are a separate attachment surface.
12. **Mirror handlers write through mutation services only.** Resolve the clicking Slack user to a member and use the same service and permission checks as REST; never write task, Vault or event rows directly with Prisma.
13. **Model ids are validated against candidate keys.** Recommendation prompts use short keys (`c1`…`cN`); resolve returned keys against the supplied candidates, never trust model-generated entity ids. AI sees only explicitly tagged or shortcut-selected content and its relevant thread.
14. **Backlinks are filtered by conversation access, with no admin bypass.** `slackItemLinkService.listBacklinks` checks each conversation before exposing its label, excerpt or permalink.
15. **Open a loading modal before slow work.** Ack within 3 seconds, use the fresh `trigger_id` to open the loading view, then do AI/DB work and update the view with its id and hash.

---

### Slack mirror

Plan: `docs/superpowers/plans/2026-10-09-slack-mirror.md`. The bot is **Constellation**; `/c` is the primary command, `/constellation` its long alias, and `/pm` a compatibility alias. `/lab` remains independent. `slack-manifest.yaml` records scopes, events, shortcuts and command URLs; workspace installation/reinstallation is a human rollout step.

**Registry files are orchestrator-owned:** `mirror.ts` registers handlers, `router.ts` owns the `/c` subcommand table, `bolt.ts` attaches the mirror, `scheduler.ts` owns crons, `backend/src/app.ts` mounts APIs/startup hooks, and root `slack-manifest.yaml` declares the app. When working under the mirror plan, request exact registration lines in the receipt instead of editing these files from a phase subagent.

Handler map (all paths relative to `backend/src/slack/`):

- `handlers/taskCardActions.ts` — live-card status, done, assign, time and More actions; `views/taskCard.ts` and `views/taskSmallModals.ts` build the cards/forms.
- `handlers/taskModal.ts` — create/edit task modal and optional sections; `views/taskModal.ts` builds the view.
- `handlers/quickAdd.ts` — `/c task <sentence>` draft review and `/c find`; `views/taskDraft.ts` builds the ephemeral draft.
- `handlers/mentions.ts` — attach picker, search, link and unlink actions; `views/attachPicker.ts` and `views/linkCard.ts` build the thread surfaces.
- `handlers/mentionIntents.ts` — task, plan, summary, blocker and project-Q&A mention intents, with an Attach items fallback.
- `handlers/plan.ts` — plan review, accept/skip/edit/run/discard; `views/planModal.ts` renders durable sessions.
- `handlers/shortcuts.ts` — Create task, Attach items, Plan from thread and Add to task message shortcuts.
- `home.ts` — App Home publication/tab handlers; `views/home.ts` and `views/homeFilesCalendar.ts` render My work, Projects, Files and Calendar.
- `handlers/vault.ts` — `/c vault` search, checkout, watch, CR review and sign-off; `views/vaultCards.ts` builds item/CR cards.
- `handlers/vaultCheckin.ts` — CAD files shared in the bot DM, confirmed GitHub-backed upload and progress cards.
- `handlers/calendar.ts` — RSVP/cancel through `eventRsvpService`; `views/eventCards.ts` builds event cards.
- `handlers/polls.ts` — availability voting and usual-availability prefills; `views/pollModal.ts` builds local-day checkbox groups.
- `handlers/unfurls.ts` — Constellation link previews scoped to linked channels; `views/unfurl.ts` builds compact or generic previews.
- `views/common.ts` — pure Block Kit budgets, truncation, pills and links shared by all builders. Pure views have standalone sibling tests.

Assignments are queued for a 10-minute debounce, capped at 15 minutes after the first card, with up to five full cards and compact overflow. Live cards refresh silently in place. Link cards reply under the source message; the same source has one card that subsequent attachments update. Plan state lives in `SlackPlanSession`, not modal metadata.
