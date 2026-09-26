# AGENTS.md — Slack Integration (`backend/src/slack/`)

Scope: Slack Bolt handlers, cron scheduler, and the two-way Slack portal. Applies
together with the root and `backend/AGENTS.md`.

---

### Slack (`backend/src/slack/`)
- `scheduler.ts` — The sole cron registry (node-cron): quest/shop/streak maintenance, vault/training cleanup, Slack file/emoji/membership/read synchronization, notification cleanup, training expiry, outreach publication/templates/event-promo drafts, milestone refresh, meeting-poll reminders, blog publication, PR-linked Vault change-request reconcile (`*/20`, `syncPr`, plus `VaultWebhookDelivery` pruning), Vault release package build/retry (`*/15`, `retryReleasePackages`), the Vault notification outbox (`*/2`, `processDueVaultNotifications`), the Vault search reconcile (`*/30`, `reconcileVaultSearch`), the Vault geometry-diff queue + cache prune (`*/2`, `processDueGeometryDiffs` / `pruneGeometryCache`), and admin synchronization. **Add new crons here only.** Scheduled digests, standups, due-date/escalation reports, milestone alerts, outreach summaries, kudos digests, and CRM follow-ups were removed on 2026-09-12 and must not be reintroduced casually. Scheduled jobs otherwise stay in-app or maintain data; the remaining intentional scheduled Slack sends are the hourly meeting-poll reminder through `remindNonResponders`, and the lab check-out reminder (`*/5`, `sendDueReminders`) and auto-close notice (hourly `:07`, `autoCloseStale`) from `labVisitService.ts` — one each per visit, via `createNotification` + `slackText` (`LAB_CHECKOUT_REMINDER`, `LAB_VISIT_PENDING`). `/lab` (and `/pm lab`) is registered in `commands.ts`; the Slack app needs a `/lab` slash command with the same request URL as `/pm`. Reactive bot replies and web-triggered `createNotification` deliveries are separate from cron behavior.

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
10. **`notificationChannels` is now enforced** — `createNotification` routes by the member's per-type preference (D14); a call site opts in to the Slack DM by passing `slackText`, never by calling `queueDm` alongside it. The one deliberate exception is the Vault notification outbox (`services/vaultNotificationService.ts`): it needs retryable, deduplicated delivery, so it applies the same `routeFor` rule itself and sends through `sendSlackDmNow`, which throws instead of swallowing errors.
