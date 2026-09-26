// Vault subscriptions and notifications (Phase 8).
//
// Flow: a write enqueues a VaultNotificationEvent whose id is a deterministic
// key (vaultNotifyCore.eventKeys) — inside the write's own transaction when it
// has one — then asks for a dispatch. Dispatch fans the event out once into
// VaultNotificationDelivery rows (unique per event/recipient/channel) and
// delivers each row:
//   IN_APP  the Notification row and the delivery's SENT mark commit together,
//           so an in-app notice is created exactly once.
//   SLACK   sent directly (not through the in-memory dmBatcher, which loses
//           messages on restart and swallows errors). A failure backs off and
//           retries up to MAX_DELIVERY_ATTEMPTS, then the row is FAILED. Only a
//           crash between Slack accepting the message and the SENT write can
//           repeat one, after the SENDING lease expires.
// The scheduler's */2 cron (processDueVaultNotifications) finishes anything a
// crash or a failed delivery left behind.
//
// Preferences: Member.notificationChannels (per NotificationType, the same
// "both / dashboard / slack / off" setting every other notification uses),
// Member.mutedProjectIds, and each VaultSubscription's per-event flags.

import type { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { activityBus } from "./activityService.js";
import { sendSlackDmNow } from "./dmBatcher.js";
import {
  checkinEventRows,
  conflictEventRow,
  crDecisionEventRow,
  eventLink,
  type ConflictKind,
  nextAttemptDelayMs,
  NOTIFICATION_TYPE,
  planDeliveries,
  renderMessage,
  SENDING_LEASE_MS,
  slackText,
  type DeliveryChannel,
  type RecipientProfile,
  type Subscriber,
  type VaultEventRow,
} from "./vaultNotifyCore.js";

// ── Store boundary (Prisma in production, in-memory in tests) ─

export interface ClaimedDelivery { id: string; eventId: string; recipientId: string; channel: DeliveryChannel; attempts: number; slackId: string | null }

export interface OutboxStore {
  loadEvent(id: string): Promise<(VaultEventRow & { fannedOutAt: Date | null }) | null>;
  loadAudience(event: VaultEventRow): Promise<{ subscribers: Subscriber[]; profiles: Map<string, RecipientProfile> }>;
  createDeliveries(eventId: string, planned: Array<{ recipientId: string; channel: DeliveryChannel }>): Promise<void>;
  markFannedOut(eventId: string, at: Date): Promise<void>;
  /** PENDING rows that are due, plus SENDING rows whose lease expired, moved to SENDING. */
  claim(filter: { eventId?: string }, now: Date, limit: number): Promise<ClaimedDelivery[]>;
  /** In one transaction: SENDING → SENT and create the Notification. Null if the row was no longer ours. */
  commitInApp(deliveryId: string, now: Date, notification: { type: string; recipientId: string; actorId: string | null; projectId: string; message: string; metadata: Record<string, unknown> }): Promise<unknown | null>;
  markSent(deliveryId: string, now: Date): Promise<void>;
  markRetry(deliveryId: string, attempts: number, error: string, nextAttemptAt: Date | null): Promise<void>;
  eventsAwaitingFanOut(limit: number): Promise<string[]>;
}

export interface NotifyDeps {
  store: OutboxStore;
  sendSlack: (slackId: string, text: string) => Promise<void>;
  emit: (recipientId: string, notification: unknown) => void;
  now: () => Date;
  frontendUrl: string | undefined;
}

type Db = Prisma.TransactionClient | typeof prisma;

async function loadProfiles(db: Db, ids: string[]) {
  return db.member.findMany({ where: { id: { in: ids } }, select: { id: true, slackId: true, isBot: true, isAdmin: true, role: true, notificationChannels: true, mutedProjectIds: true } });
}

export const prismaOutboxStore: OutboxStore = {
  async loadEvent(id) {
    const row = await prisma.vaultNotificationEvent.findUnique({ where: { id } });
    return row ? { ...row, kind: row.kind as VaultEventRow["kind"], payload: row.payload as VaultEventRow["payload"] } : null;
  },
  async loadAudience(event) {
    const subscribers = await prisma.vaultSubscription.findMany({ where: { itemId: { in: event.itemIds } }, select: { memberId: true, itemId: true, checkins: true, decisions: true, conflicts: true } });
    const ids = [...new Set([...subscribers.map((s) => s.memberId), ...event.directRecipientIds])];
    const [members, memberships] = await Promise.all([
      loadProfiles(prisma, ids),
      prisma.projectMember.findMany({ where: { projectId: event.projectId, memberId: { in: ids } }, select: { memberId: true } }),
    ]);
    const inProject = new Set(memberships.map((m) => m.memberId));
    const profiles = new Map<string, RecipientProfile>(members.map((m) => [m.id, {
      id: m.id,
      slackId: m.slackId || null,
      isBot: m.isBot,
      notificationChannels: m.notificationChannels,
      mutedProjectIds: m.mutedProjectIds,
      canAccess: m.isAdmin || m.role === "ADMIN" || inProject.has(m.id),
    }]));
    return { subscribers, profiles };
  },
  async createDeliveries(eventId, planned) {
    if (planned.length) await prisma.vaultNotificationDelivery.createMany({ data: planned.map((p) => ({ eventId, ...p })), skipDuplicates: true });
  },
  async markFannedOut(eventId, at) {
    await prisma.vaultNotificationEvent.update({ where: { id: eventId }, data: { fannedOutAt: at } });
  },
  async claim(filter, now, limit) {
    const rows = await prisma.vaultNotificationDelivery.findMany({
      where: {
        ...(filter.eventId ? { eventId: filter.eventId } : {}),
        OR: [{ state: "PENDING", nextAttemptAt: { lte: now } }, { state: "SENDING", leaseUntil: { lt: now } }],
      },
      orderBy: { createdAt: "asc" },
      take: limit,
      select: { id: true, eventId: true, recipientId: true, channel: true, attempts: true, state: true, leaseUntil: true, recipient: { select: { slackId: true } } },
    });
    const claimed: ClaimedDelivery[] = [];
    for (const row of rows) {
      // Conditional on the state we read, so two workers never claim one row.
      const won = await prisma.vaultNotificationDelivery.updateMany({
        where: { id: row.id, state: row.state, leaseUntil: row.leaseUntil },
        data: { state: "SENDING", leaseUntil: new Date(now.getTime() + SENDING_LEASE_MS) },
      });
      if (won.count === 1) claimed.push({ id: row.id, eventId: row.eventId, recipientId: row.recipientId, channel: row.channel as DeliveryChannel, attempts: row.attempts, slackId: row.recipient.slackId || null });
    }
    return claimed;
  },
  async commitInApp(deliveryId, now, n) {
    return prisma.$transaction(async (tx) => {
      const owned = await tx.vaultNotificationDelivery.updateMany({ where: { id: deliveryId, state: "SENDING" }, data: { state: "SENT", sentAt: now, leaseUntil: null, lastError: null } });
      if (owned.count !== 1) return null;
      const created = await tx.notification.create({
        data: { type: n.type as any, recipientId: n.recipientId, actorId: n.actorId, projectId: n.projectId, message: n.message, metadata: n.metadata as any },
      });
      await tx.vaultNotificationDelivery.update({ where: { id: deliveryId }, data: { notificationId: created.id } });
      return created;
    });
  },
  async markSent(deliveryId, now) {
    await prisma.vaultNotificationDelivery.updateMany({ where: { id: deliveryId, state: "SENDING" }, data: { state: "SENT", sentAt: now, leaseUntil: null, lastError: null } });
  },
  async markRetry(deliveryId, attempts, error, nextAttemptAt) {
    await prisma.vaultNotificationDelivery.updateMany({
      where: { id: deliveryId, state: "SENDING" },
      data: nextAttemptAt
        ? { state: "PENDING", attempts, lastError: error.slice(0, 500), nextAttemptAt, leaseUntil: null }
        : { state: "FAILED", attempts, lastError: error.slice(0, 500), leaseUntil: null },
    });
  },
  async eventsAwaitingFanOut(limit) {
    const rows = await prisma.vaultNotificationEvent.findMany({ where: { fannedOutAt: null }, orderBy: { createdAt: "asc" }, take: limit, select: { id: true } });
    return rows.map((r) => r.id);
  },
};

const defaultDeps: NotifyDeps = {
  store: prismaOutboxStore,
  sendSlack: sendSlackDmNow,
  emit: (recipientId, notification) => activityBus.emit(`notification:${recipientId}`, notification),
  now: () => new Date(),
  frontendUrl: process.env.FRONTEND_URL,
};

// ── Enqueue ───────────────────────────────────────────────────

export function vaultEventData(event: VaultEventRow): Prisma.VaultNotificationEventCreateManyInput {
  return { id: event.id, kind: event.kind, projectId: event.projectId, itemIds: event.itemIds, actorId: event.actorId, directRecipientIds: event.directRecipientIds, payload: event.payload as Prisma.InputJsonValue };
}

/**
 * Record an event. A repeat of the same key is a no-op, which is what makes a
 * retried job or a replayed request safe. Pass `db` to join the caller's
 * transaction, then call dispatchVaultEventSoon after it commits.
 */
export async function enqueueVaultEvent(event: VaultEventRow, db: Db = prisma): Promise<boolean> {
  const { count } = await db.vaultNotificationEvent.createMany({ data: [vaultEventData(event)], skipDuplicates: true });
  return count === 1;
}

/** Enqueue + dispatch, never throwing into the caller's request. */
export function emitVaultEvent(event: VaultEventRow): void {
  enqueueVaultEvent(event)
    .then(() => dispatchVaultEvent(event.id))
    .catch((err) => console.error("[vault-notify] emit failed", event.id, err?.message || err));
}

export async function actorName(memberId: string | null | undefined): Promise<string | null> {
  if (!memberId) return null;
  return (await prisma.member.findUnique({ where: { id: memberId }, select: { displayName: true } }))?.displayName ?? null;
}

type ItemRef = { id: string; projectId: string; name: string; partNumber: string | null };

/** A check-in outside a transaction (legacy Drive path). The GitHub job enqueues inside its index transaction. */
export function notifyVaultCheckin(item: ItemRef, version: { id: string; versionNumber: number; fileName: string; note: string | null }, actorId: string | null, otherHolderId: string | null): void {
  actorName(actorId)
    .then((name) => { for (const row of checkinEventRows(item, version, actorId, name, otherHolderId)) emitVaultEvent(row); })
    .catch((err) => console.error("[vault-notify] check-in notify failed", version.id, err?.message || err));
}

export function notifyCrDecision(cr: { id: string; projectId: string; number: number; title: string; authorId: string | null; items: Array<{ itemId: string; item: { name: string; partNumber: string | null } }> }, decision: "APPROVED" | "REJECTED", reviewerId: string): void {
  actorName(reviewerId)
    .then((name) => emitVaultEvent(crDecisionEventRow(cr, decision, reviewerId, name)))
    .catch((err) => console.error("[vault-notify] CR decision notify failed", cr.id, err?.message || err));
}

export function notifyVaultCheckoutConflict(item: ItemRef, actorId: string | null, holderId: string, conflict: ConflictKind, key: string): void {
  actorName(actorId)
    .then((name) => emitVaultEvent(conflictEventRow(item, actorId, name, holderId, conflict, key)))
    .catch((err) => console.error("[vault-notify] conflict notify failed", item.id, err?.message || err));
}

export function dispatchVaultEventSoon(eventId: string): void {
  dispatchVaultEvent(eventId).catch((err) => console.error("[vault-notify] dispatch failed", eventId, err?.message || err));
}

// ── Dispatch ──────────────────────────────────────────────────

async function fanOut(eventId: string, deps: NotifyDeps): Promise<VaultEventRow | null> {
  const event = await deps.store.loadEvent(eventId);
  if (!event) return null;
  if (!event.fannedOutAt) {
    const { subscribers, profiles } = await deps.store.loadAudience(event);
    await deps.store.createDeliveries(event.id, planDeliveries(event, subscribers, profiles));
    await deps.store.markFannedOut(event.id, deps.now());
  }
  return event;
}

async function deliver(d: ClaimedDelivery, event: VaultEventRow, deps: NotifyDeps): Promise<"SENT" | "RETRY" | "FAILED" | "LOST"> {
  const message = renderMessage(event, d.recipientId);
  const link = eventLink(event);
  try {
    if (d.channel === "IN_APP") {
      const created = await deps.store.commitInApp(d.id, deps.now(), {
        type: NOTIFICATION_TYPE[event.kind],
        recipientId: d.recipientId,
        actorId: event.actorId,
        projectId: event.projectId,
        message,
        metadata: { link, vaultEventId: event.id, kind: event.kind, ...event.payload },
      });
      if (created === null) return "LOST";
      deps.emit(d.recipientId, created);
    } else {
      if (!d.slackId) throw new Error("NO_SLACK_ID");
      await deps.sendSlack(d.slackId, slackText(message, link, deps.frontendUrl));
      await deps.store.markSent(d.id, deps.now());
    }
    return "SENT";
  } catch (err: any) {
    const attempts = d.attempts + 1;
    const delay = err?.message === "NO_SLACK_ID" ? null : nextAttemptDelayMs(attempts);
    await deps.store.markRetry(d.id, attempts, err?.message || String(err), delay === null ? null : new Date(deps.now().getTime() + delay));
    return delay === null ? "FAILED" : "RETRY";
  }
}

async function deliverClaimed(claimed: ClaimedDelivery[], deps: NotifyDeps, events = new Map<string, VaultEventRow>()) {
  const tally = { sent: 0, retry: 0, failed: 0 };
  for (const d of claimed) {
    let event = events.get(d.eventId);
    if (!event) {
      const loaded = await deps.store.loadEvent(d.eventId);
      if (!loaded) continue;
      events.set(d.eventId, loaded);
      event = loaded;
    }
    const outcome = await deliver(d, event, deps);
    if (outcome === "SENT") tally.sent++;
    else if (outcome === "RETRY") tally.retry++;
    else if (outcome === "FAILED") tally.failed++;
  }
  return tally;
}

/** Fan out (once) and deliver whatever is due for one event. Safe to call repeatedly. */
export async function dispatchVaultEvent(eventId: string, deps: NotifyDeps = defaultDeps) {
  const event = await fanOut(eventId, deps);
  if (!event) return { sent: 0, retry: 0, failed: 0 };
  const claimed = await deps.store.claim({ eventId }, deps.now(), 500);
  return deliverClaimed(claimed, deps, new Map([[event.id, event]]));
}

/** Cron: finish fan-outs a crash interrupted, then retry due deliveries. */
export async function processDueVaultNotifications(deps: NotifyDeps = defaultDeps) {
  for (const id of await deps.store.eventsAwaitingFanOut(100)) await fanOut(id, deps);
  return deliverClaimed(await deps.store.claim({}, deps.now(), 200), deps);
}

// ── Subscriptions ─────────────────────────────────────────────

export interface SubscriptionChoice { checkins: boolean; decisions: boolean; conflicts: boolean }

export function subscriptionView(row: { checkins: boolean; decisions: boolean; conflicts: boolean; source: string } | null) {
  if (!row) return { watching: false, checkins: false, decisions: false, conflicts: false, source: null as string | null };
  return { watching: row.checkins || row.decisions || row.conflicts, checkins: row.checkins, decisions: row.decisions, conflicts: row.conflicts, source: row.source };
}

/**
 * Watch an item on the member's behalf after they create it, check it in or
 * check it out — only if their vaultAutoWatch preference is on, and never
 * over an existing row: an explicit unwatch is stored as all-false and stays.
 */
export async function autoWatchVaultItem(memberId: string | undefined | null, itemId: string, projectId: string): Promise<void> {
  if (!memberId) return;
  const member = await prisma.member.findUnique({ where: { id: memberId }, select: { vaultAutoWatch: true, isBot: true } });
  if (!member?.vaultAutoWatch || member.isBot) return;
  await prisma.vaultSubscription.createMany({ data: [{ memberId, itemId, projectId, source: "AUTO" }], skipDuplicates: true });
}

export function autoWatchSoon(memberId: string | undefined | null, itemId: string, projectId: string): void {
  autoWatchVaultItem(memberId, itemId, projectId).catch((err) => console.error("[vault-notify] auto-watch failed", itemId, err?.message || err));
}

export async function setVaultSubscription(memberId: string, itemId: string, projectId: string, choice: SubscriptionChoice) {
  return prisma.vaultSubscription.upsert({
    where: { memberId_itemId: { memberId, itemId } },
    create: { memberId, itemId, projectId, ...choice, source: "MANUAL" },
    update: { ...choice, source: "MANUAL" },
  });
}
