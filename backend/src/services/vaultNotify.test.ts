// Vault notifications (Phase 8): recipient planning (subscriptions, project
// permission, preferences, mutes), outbox deduplication, and delivery
// failures with retry. No DB, no Slack: the outbox store and the Slack sender
// are in-memory fakes that keep the same uniqueness rules as the schema.
// Run: cd backend && npx tsx src/services/vaultNotify.test.ts

import {
  checkinEventRows,
  conflictEventRow,
  crDecisionEventRow,
  eventKeys,
  eventLink,
  MAX_DELIVERY_ATTEMPTS,
  planDeliveries,
  renderMessage,
  SENDING_LEASE_MS,
  type RecipientProfile,
  type Subscriber,
  type VaultEventRow,
} from "./vaultNotifyCore.js";
import { dispatchVaultEvent, processDueVaultNotifications, subscriptionView, type ClaimedDelivery, type NotifyDeps, type OutboxStore } from "./vaultNotificationService.js";

let passed = 0, failed = 0;
function check(name: string, cond: boolean) {
  if (cond) passed++; else { failed++; console.error(`  ✗ ${name}`); }
}

const profile = (id: string, over: Partial<RecipientProfile> = {}): RecipientProfile => ({
  id, slackId: `U-${id}`, isBot: false, notificationChannels: {}, mutedProjectIds: [], canAccess: true, ...over,
});
const sub = (memberId: string, itemId = "i1", over: Partial<Subscriber> = {}): Subscriber => ({ memberId, itemId, checkins: true, decisions: true, conflicts: true, ...over });

const item = { id: "i1", projectId: "p1", name: "Motor mount", partNumber: "PRT-0007" };
const version = { id: "v2", versionNumber: 2, fileName: "mount_v2.step", note: "thicker wall" };
const [checkin] = checkinEventRows(item, version, "actor", "Ada", null);

// ── Planning ──────────────────────────────────────────────────
{
  const profiles = new Map([
    ["actor", profile("actor")],
    ["watcher", profile("watcher")],
    ["left", profile("left", { canAccess: false })],
    ["muted", profile("muted", { mutedProjectIds: ["p1"] })],
    ["dash", profile("dash", { notificationChannels: { VAULT_CHECKIN: "dashboard" } })],
    ["slacky", profile("slacky", { notificationChannels: { VAULT_CHECKIN: "slack" } })],
    ["off", profile("off", { notificationChannels: { VAULT_CHECKIN: "off" } })],
    ["noslack", profile("noslack", { slackId: null })],
    ["bot", profile("bot", { isBot: true })],
    ["nocheckins", profile("nocheckins")],
    ["otheritem", profile("otheritem")],
  ]);
  const subs = [
    sub("actor"), sub("watcher"), sub("left"), sub("muted"), sub("dash"), sub("slacky"), sub("off"), sub("noslack"), sub("bot"),
    sub("nocheckins", "i1", { checkins: false }), sub("otheritem", "i9"),
  ];
  const plan = planDeliveries(checkin, subs, profiles);
  const has = (id: string, ch: string) => plan.some((p) => p.recipientId === id && p.channel === ch);
  const any = (id: string) => plan.some((p) => p.recipientId === id);
  check("a watcher gets in-app and Slack by default", has("watcher", "IN_APP") && has("watcher", "SLACK"));
  check("the actor is never notified of their own check-in", !any("actor"));
  check("a subscriber who lost project access is skipped", !any("left"));
  check("a muted project is silent", !any("muted"));
  check("dashboard preference → in-app only", has("dash", "IN_APP") && !has("dash", "SLACK"));
  check("slack preference → Slack only", has("slacky", "SLACK") && !has("slacky", "IN_APP"));
  check("off preference → nothing", !any("off"));
  check("no Slack id → in-app still delivered", has("noslack", "IN_APP") && !has("noslack", "SLACK"));
  check("bots are never recipients", !any("bot"));
  check("a subscription with check-ins off is skipped", !any("nocheckins"));
  check("watching another item does not match", !any("otheritem"));
  check("each recipient/channel pair is planned once", new Set(plan.map((p) => `${p.recipientId}:${p.channel}`)).size === plan.length);

  const cr = crDecisionEventRow({ id: "c1", projectId: "p1", number: 12, title: "Stiffen mount", authorId: "author", items: [{ itemId: "i1", item: { name: "Motor mount", partNumber: "PRT-0007" } }] }, "APPROVED", "reviewer", "Rae");
  const crPlan = planDeliveries(cr, [sub("watcher"), sub("nodecisions", "i1", { decisions: false })], new Map([
    ["author", profile("author")], ["watcher", profile("watcher")], ["nodecisions", profile("nodecisions")],
  ]));
  check("the CR author is notified without subscribing", crPlan.some((p) => p.recipientId === "author"));
  check("CR decisions respect the per-item decisions flag", !crPlan.some((p) => p.recipientId === "nodecisions"));
  check("a direct recipient still needs project access", planDeliveries(cr, [], new Map([["author", profile("author", { canAccess: false })]])).length === 0);
}

// ── Messages, links and keys ──────────────────────────────────
{
  const [, conflict] = checkinEventRows(item, version, "actor", "Ada", "holder");
  check("a check-in over someone's checkout also raises a conflict for the holder", conflict?.kind === "CHECKOUT_CONFLICT" && conflict.directRecipientIds[0] === "holder");
  check("holder wording is personal", renderMessage(conflict, "holder").includes("while you had it checked out"));
  check("watcher wording names the conflict", renderMessage(conflict, "watcher").startsWith("Checkout conflict on PRT-0007"));
  check("check-in message names version, file and note", renderMessage(checkin, "watcher") === `Ada checked in v2 of PRT-0007 "Motor mount" (mount_v2.step): thicker wall`);
  check("check-in link opens the exact version", eventLink(checkin) === "/clubpm/projects/p1?tab=files&sub=vault&vaultItem=i1&vaultVersion=v2");
  const cr = crDecisionEventRow({ id: "c1", projectId: "p1", number: 12, title: "Stiffen mount", authorId: "author", items: [{ itemId: "i1", item: { name: "Motor mount", partNumber: null } }] }, "REJECTED", "reviewer", "Rae");
  check("CR author wording", renderMessage(cr, "author") === `Your change request "Stiffen mount" (CR-12) was rejected.`);
  check("CR link opens the change request", eventLink(cr).endsWith("vaultCr=c1"));
  const at = new Date("2026-09-20T10:00:00Z");
  check("repeated blocked checkouts in one session share a key", eventKeys.blocked("i1", "r", "h", at) === eventKeys.blocked("i1", "r", "h", new Date(at)));
  check("a new checkout session gets a new key", eventKeys.blocked("i1", "r", "h", at) !== eventKeys.blocked("i1", "r", "h", new Date(at.getTime() + 1)));
  const takeover = conflictEventRow(item, "actor", "Ada", "holder", "TAKEOVER", eventKeys.takeover("i1", "holder", at));
  check("takeover wording", renderMessage(takeover, "holder") === `Ada took over your checkout of PRT-0007 "Motor mount".`);
  check("unwatch is an all-false row, not watching", subscriptionView({ checkins: false, decisions: false, conflicts: false, source: "MANUAL" }).watching === false);
}

// ── In-memory outbox with the schema's uniqueness rules ───────

type Delivery = ClaimedDelivery & { state: string; nextAttemptAt: number; leaseUntil: number | null; lastError: string | null };

function makeWorld(audience: { subscribers: Subscriber[]; profiles: Map<string, RecipientProfile> }) {
  let clock = Date.parse("2026-09-26T12:00:00Z");
  const events = new Map<string, VaultEventRow & { fannedOutAt: Date | null }>();
  const deliveries: Delivery[] = [];
  const notifications: Array<{ recipientId: string; message: string; link: unknown }> = [];
  const slackSent: Array<{ slackId: string; text: string }> = [];
  const failSlack = { remaining: 0, always: false };
  const failInApp = { remaining: 0 };
  let seq = 0;

  const store: OutboxStore = {
    loadEvent: async (id) => events.get(id) ?? null,
    loadAudience: async () => audience,
    createDeliveries: async (eventId, planned) => {
      for (const p of planned) {
        if (deliveries.some((d) => d.eventId === eventId && d.recipientId === p.recipientId && d.channel === p.channel)) continue; // @@unique
        deliveries.push({ id: `d${++seq}`, eventId, ...p, attempts: 0, slackId: audience.profiles.get(p.recipientId)?.slackId ?? null, state: "PENDING", nextAttemptAt: clock, leaseUntil: null, lastError: null });
      }
    },
    markFannedOut: async (id, at) => { events.get(id)!.fannedOutAt = at; },
    claim: async (filter, now, limit) => {
      const due = deliveries.filter((d) => (!filter.eventId || d.eventId === filter.eventId) &&
        ((d.state === "PENDING" && d.nextAttemptAt <= now.getTime()) || (d.state === "SENDING" && (d.leaseUntil ?? 0) < now.getTime()))).slice(0, limit);
      for (const d of due) { d.state = "SENDING"; d.leaseUntil = now.getTime() + SENDING_LEASE_MS; }
      return due.map((d) => ({ ...d }));
    },
    commitInApp: async (id, _now, n) => {
      if (failInApp.remaining > 0) { failInApp.remaining--; throw new Error("DB_DOWN"); }
      const d = deliveries.find((x) => x.id === id)!;
      if (d.state !== "SENDING") return null;
      d.state = "SENT";
      const row = { recipientId: n.recipientId, message: n.message, link: n.metadata.link };
      notifications.push(row);
      return row;
    },
    markSent: async (id) => { const d = deliveries.find((x) => x.id === id)!; if (d.state === "SENDING") d.state = "SENT"; },
    markRetry: async (id, attempts, error, next) => {
      const d = deliveries.find((x) => x.id === id)!;
      if (d.state !== "SENDING") return;
      d.attempts = attempts; d.lastError = error; d.leaseUntil = null;
      if (next) { d.state = "PENDING"; d.nextAttemptAt = next.getTime(); } else d.state = "FAILED";
    },
    eventsAwaitingFanOut: async () => [...events.values()].filter((e) => !e.fannedOutAt).map((e) => e.id),
  };
  const deps: NotifyDeps = {
    store,
    now: () => new Date(clock),
    frontendUrl: "https://purduesearch.org",
    emit: () => undefined,
    sendSlack: async (slackId, text) => {
      if (failSlack.always || failSlack.remaining > 0) { failSlack.remaining--; throw new Error("ratelimited"); }
      slackSent.push({ slackId, text });
    },
  };
  /** Same semantics as enqueueVaultEvent: createMany skipDuplicates on the key. */
  const enqueue = (e: VaultEventRow) => { if (events.has(e.id)) return false; events.set(e.id, { ...e, fannedOutAt: null }); return true; };
  return { deps, enqueue, deliveries, notifications, slackSent, failSlack, failInApp, advance: (ms: number) => { clock += ms; } };
}

async function outboxTests() {
  const audience = { subscribers: [sub("watcher"), sub("other")], profiles: new Map([["watcher", profile("watcher")], ["other", profile("other")]]) };

  // Dedupe: a retried job / duplicate webhook enqueues the same key again.
  {
    const w = makeWorld(audience);
    check("first enqueue records the event", w.enqueue(checkin) === true);
    check("a repeated check-in event is a no-op", w.enqueue(checkinEventRows(item, version, "actor", "Ada", null)[0]) === false);
    await dispatchVaultEvent(checkin.id, w.deps);
    await dispatchVaultEvent(checkin.id, w.deps);
    await processDueVaultNotifications(w.deps);
    check("each recipient gets exactly one in-app notice", w.notifications.length === 2 && new Set(w.notifications.map((n) => n.recipientId)).size === 2);
    check("each recipient gets exactly one Slack DM", w.slackSent.length === 2);
    check("Slack text carries the absolute deep link", w.slackSent[0].text.includes("<https://purduesearch.org/clubpm/projects/p1?tab=files&sub=vault&vaultItem=i1&vaultVersion=v2|Open in Constellation>"));
    check("in-app metadata carries the relative deep link", w.notifications[0].link === "/clubpm/projects/p1?tab=files&sub=vault&vaultItem=i1&vaultVersion=v2");
    check("fan-out happens once", w.deliveries.length === 4);
  }

  // Slack failure: retried with backoff, in-app unaffected, no duplicates.
  {
    const w = makeWorld(audience);
    w.enqueue(checkin);
    w.failSlack.remaining = 1;
    const first = await dispatchVaultEvent(checkin.id, w.deps);
    check("one Slack failure is scheduled for retry", first.retry === 1 && first.sent === 3);
    const pending = w.deliveries.find((d) => d.state === "PENDING")!;
    check("the failed delivery records its error and attempt", pending.attempts === 1 && pending.lastError === "ratelimited");
    await processDueVaultNotifications(w.deps);
    check("a retry does not fire before its backoff", w.slackSent.length === 1);
    w.advance(61_000);
    await processDueVaultNotifications(w.deps);
    check("the retry delivers the DM once", w.slackSent.length === 2);
    check("in-app notices were not repeated by the retry", w.notifications.length === 2);
    check("every delivery ends SENT", w.deliveries.every((d) => d.state === "SENT"));
  }

  // Permanent Slack failure ends FAILED and stops retrying.
  {
    const w = makeWorld({ subscribers: [sub("watcher")], profiles: new Map([["watcher", profile("watcher", { notificationChannels: { VAULT_CHECKIN: "slack" } })]]) });
    w.enqueue(checkin);
    w.failSlack.always = true;
    await dispatchVaultEvent(checkin.id, w.deps);
    for (let i = 0; i < MAX_DELIVERY_ATTEMPTS + 3; i++) { w.advance(2 * 60 * 60_000); await processDueVaultNotifications(w.deps); }
    const d = w.deliveries[0];
    check("a delivery that keeps failing ends FAILED", d.state === "FAILED" && d.attempts === MAX_DELIVERY_ATTEMPTS);
    const attemptsBefore = d.attempts;
    w.advance(24 * 60 * 60_000);
    await processDueVaultNotifications(w.deps);
    check("a FAILED delivery is not retried again", d.attempts === attemptsBefore);
  }

  // In-app failure (DB write) retries and still creates exactly one row.
  {
    const w = makeWorld({ subscribers: [sub("watcher")], profiles: new Map([["watcher", profile("watcher", { notificationChannels: { VAULT_CHECKIN: "dashboard" } })]]) });
    w.enqueue(checkin);
    w.failInApp.remaining = 1;
    await dispatchVaultEvent(checkin.id, w.deps);
    check("a failed in-app write leaves no notification", w.notifications.length === 0);
    w.advance(61_000);
    await processDueVaultNotifications(w.deps);
    await processDueVaultNotifications(w.deps);
    check("the retried in-app write lands once", w.notifications.length === 1);
  }

  // Crash recovery: an event committed with its version but never dispatched.
  {
    const w = makeWorld(audience);
    w.enqueue(checkin);
    await processDueVaultNotifications(w.deps);
    check("the cron fans out an undispatched event", w.notifications.length === 2 && w.slackSent.length === 2);
  }

  // Crash mid-send: a SENDING row is reclaimed only after its lease expires.
  {
    const w = makeWorld({ subscribers: [sub("watcher")], profiles: new Map([["watcher", profile("watcher", { notificationChannels: { VAULT_CHECKIN: "slack" } })]]) });
    w.enqueue(checkin);
    await w.deps.store.createDeliveries(checkin.id, [{ recipientId: "watcher", channel: "SLACK" }]);
    await w.deps.store.markFannedOut(checkin.id, new Date());
    await w.deps.store.claim({}, w.deps.now(), 10); // a worker claimed it, then died
    await processDueVaultNotifications(w.deps);
    check("a live lease is not stolen", w.slackSent.length === 0);
    w.advance(SENDING_LEASE_MS + 1);
    await processDueVaultNotifications(w.deps);
    check("an expired lease is reclaimed and delivered", w.slackSent.length === 1);
  }
}

await outboxTests();

console.log(`vaultNotify: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
