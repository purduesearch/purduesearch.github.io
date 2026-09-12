import { prisma } from "../db/prisma.js";
import { activityBus } from "./activityService.js";
import { addPing, removePing, newestPing, pingCount, type PingEntry } from "./slackPingAggregate.js";
import { queueDm } from "./dmBatcher.js";
import { routeFor } from "./notificationRouting.js";
import type { Notification, NotificationType } from "@prisma/client";

// ── Create ───────────────────────────────────────────────────

/**
 * Create one notification, delivered per the recipient's preference for its
 * type (D14). `slackText` opts a call site in to the Slack DM; a caller that
 * passes none keeps its pre-portal behaviour (in-app only). No caller uses the
 * return value, which is null when the member turned this type off or chose
 * Slack-only.
 */
export async function createNotification(data: {
  type: NotificationType;
  recipientId: string;
  actorId?: string;
  projectId?: string;
  taskId?: string;
  commentId?: string;
  message: string;
  metadata?: Record<string, any>;
  slackText?: string;
}): Promise<Notification | null> {
  const recipient = await prisma.member.findUnique({
    where: { id: data.recipientId },
    select: { slackId: true, notificationChannels: true },
  });
  const prefs = (recipient?.notificationChannels ?? {}) as Record<string, unknown>;
  const route = routeFor(data.type, prefs[data.type]);

  let notification: Notification | null = null;
  if (route.inApp) {
    notification = await prisma.notification.create({
      data: {
        type:        data.type,
        recipientId: data.recipientId,
        actorId:     data.actorId     ?? null,
        projectId:   data.projectId   ?? null,
        taskId:      data.taskId      ?? null,
        commentId:   data.commentId   ?? null,
        message:     data.message,
        metadata:    (data.metadata as any) ?? undefined,
      },
    });
    // Push to SSE stream for the recipient
    activityBus.emit(`notification:${data.recipientId}`, notification);
  }

  if (route.slack && data.slackText && recipient?.slackId) {
    queueDm(recipient.slackId, data.slackText);
  }
  return notification;
}

// ── Batch Create ─────────────────────────────────────────────

export async function batchCreateNotifications(
  notifications: Array<{
    type: NotificationType;
    recipientId: string;
    actorId?: string;
    projectId?: string;
    taskId?: string;
    commentId?: string;
    message: string;
    metadata?: Record<string, any>;
    slackText?: string;
  }>
): Promise<void> {
  if (notifications.length === 0) return;

  // createMany doesn't return records, so we create individually to be able
  // to emit per-recipient SSE events.
  await Promise.all(notifications.map(n => createNotification(n)));
}

// ── List (paginated, project-membership filtered) ────────────

export async function getNotificationsForMember(
  memberId: string,
  opts?: { limit?: number; cursor?: string; unreadOnly?: boolean }
): Promise<{ notifications: Notification[]; nextCursor: string | null }> {
  const limit      = Math.min(opts?.limit ?? 20, 100);
  const unreadOnly = opts?.unreadOnly ?? false;

  // Fetch the member's project IDs so we can filter notifications properly.
  const projectMemberships = await prisma.projectMember.findMany({
    where:  { memberId },
    select: { projectId: true },
  });
  const memberProjectIds = projectMemberships.map(pm => pm.projectId);

  const where: any = {
    recipientId: memberId,
    // Only return notifications for projects the member belongs to, or global ones
    OR: [
      { projectId: null },
      { projectId: { in: memberProjectIds } },
    ],
    ...(unreadOnly ? { read: false } : {}),
    // Cursor-based pagination: notifications older than the cursor's createdAt
    ...(opts?.cursor
      ? { createdAt: { lt: new Date(opts.cursor) } }
      : {}),
  };

  // Fetch one extra to determine whether there is a next page
  const rows = await prisma.notification.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit + 1,
  });

  const hasMore      = rows.length > limit;
  const items        = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor   = hasMore
    ? items[items.length - 1].createdAt.toISOString()
    : null;

  return { notifications: items, nextCursor };
}

// ── Unread Count ─────────────────────────────────────────────

export async function getUnreadCount(memberId: string): Promise<number> {
  return prisma.notification.count({
    where: { recipientId: memberId, read: false },
  });
}

// ── Mark One Read ────────────────────────────────────────────

export async function markRead(notifId: string, memberId: string): Promise<void> {
  // Verify ownership before updating
  const notif = await prisma.notification.findUnique({ where: { id: notifId } });
  if (!notif || notif.recipientId !== memberId) {
    throw Object.assign(new Error("Notification not found"), { status: 404 });
  }
  if (notif.read) return; // already read — no-op

  await prisma.notification.update({
    where: { id: notifId },
    data:  { read: true, readAt: new Date() },
  });
}

// ── Mark All Read ────────────────────────────────────────────

export async function markAllRead(memberId: string): Promise<void> {
  await prisma.notification.updateMany({
    where: { recipientId: memberId, read: false },
    data:  { read: true, readAt: new Date() },
  });
}

// ── Delete One ───────────────────────────────────────────────

export async function deleteNotification(notifId: string, memberId: string): Promise<void> {
  const notif = await prisma.notification.findUnique({ where: { id: notifId } });
  if (!notif || notif.recipientId !== memberId) {
    throw Object.assign(new Error("Notification not found"), { status: 404 });
  }

  await prisma.notification.delete({ where: { id: notifId } });
}

// ── Cleanup: Delete Old Read Notifications ───────────────────

export async function deleteOldNotifications(olderThanDays: number): Promise<number> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - olderThanDays);

  const { count } = await prisma.notification.deleteMany({
    where: { read: true, createdAt: { lt: cutoff } },
  });

  return count;
}

// ── Slack ping mirror (slack portal) ─────────────────────────

/**
 * The JSON `metadata` shape kept on an unread SLACK_DM notification. `pings`
 * holds every aggregated message it still covers, so retracting one (Slack
 * delete) can shrink the aggregate instead of wiping the whole row — see
 * upsertSlackNotification / retractSlackNotifications.
 */
interface SlackDmMetadata {
  link: string;
  count: number;
  isGroup: boolean;
  pings: PingEntry[];
}

function renderAggregateMessage(count: number, authorName: string, isGroup: boolean): string {
  return isGroup
    ? `${count} new messages in a group message — latest from ${authorName}`
    : `${authorName} sent you ${count} messages`;
}

/** Rows written before `pings` existed (none should, but be safe) — treat as a single-message list. */
function pingsOf(row: { slackTs: string | null; message: string; metadata: unknown }, fallbackAuthorName: string): PingEntry[] {
  const meta = row.metadata as Partial<SlackDmMetadata> | null;
  if (meta?.pings) return meta.pings;
  return [{ ts: row.slackTs ?? "", message: row.message, authorName: fallbackAuthorName }];
}

/**
 * Create or merge one mirrored Slack ping.
 * - Never twice for the same (recipient, conversation, message, type): Slack
 *   redelivers events on retry.
 * - DMs aggregate: while an earlier DM notification from the same conversation
 *   is still unread, it is updated ("3 new messages") and bumped to the top
 *   instead of stacking one row per message. A message already in the
 *   aggregate's list (Slack retry) is a no-op — no count bump.
 * SLACK_* notifications carry no projectId, so the member-project filter in
 * getNotificationsForMember never hides them.
 */
export async function upsertSlackNotification(data: {
  type: NotificationType;
  recipientId: string;
  actorId: string | null;
  slackChannelId: string;
  slackTs: string;
  message: string;
  /** The message's sender — needed to re-render the aggregate form later, after a sibling is retracted. */
  authorName: string;
  /** Group DM vs 1:1 — only meaningful for SLACK_DM; carried in metadata so a later retract can re-render correctly. */
  isGroup: boolean;
  link: string;
}): Promise<Notification | null> {
  const dupe = await prisma.notification.findFirst({
    where: { recipientId: data.recipientId, slackChannelId: data.slackChannelId, slackTs: data.slackTs, type: data.type },
    select: { id: true },
  });
  if (dupe) return null;

  if (data.type === "SLACK_DM") {
    const open = await prisma.notification.findFirst({
      where: { recipientId: data.recipientId, slackChannelId: data.slackChannelId, type: "SLACK_DM", read: false },
      orderBy: { createdAt: "desc" },
    });
    if (open) {
      const existing = pingsOf(open, data.authorName);
      const added = addPing(existing, { ts: data.slackTs, message: data.message, authorName: data.authorName });
      if (added === null) return null; // Slack redelivered a message we already have — no bump, no re-render.

      const newest = newestPing(added)!;
      const count = pingCount(added);
      const message = count === 1 ? newest.message : renderAggregateMessage(count, newest.authorName, data.isGroup);
      const updated = await prisma.notification.update({
        where: { id: open.id },
        data: {
          message,
          slackTs: newest.ts,
          actorId: data.actorId,
          createdAt: new Date(),
          metadata: ({ link: data.link, count, isGroup: data.isGroup, pings: added } satisfies SlackDmMetadata) as any,
        },
      });
      activityBus.emit(`notification:${data.recipientId}`, updated);
      return updated;
    }
  }

  const created = await prisma.notification.create({
    data: {
      type: data.type,
      recipientId: data.recipientId,
      actorId: data.actorId,
      slackChannelId: data.slackChannelId,
      slackTs: data.slackTs,
      message: data.message,
      metadata: (data.type === "SLACK_DM"
        ? ({
            link: data.link,
            count: 1,
            isGroup: data.isGroup,
            pings: [{ ts: data.slackTs, message: data.message, authorName: data.authorName }],
          } satisfies SlackDmMetadata)
        : { link: data.link, count: 1 }) as any,
    },
  });
  activityBus.emit(`notification:${data.recipientId}`, created);
  return created;
}

/**
 * A message was deleted in Slack.
 * - Non-DM: its unread notification (matched by slackTs) goes with it, same as before.
 * - SLACK_DM: only the one aggregated message is retracted. If others in the
 *   aggregate are still unread, the row survives with its count and message
 *   re-rendered around the newest remaining message; only an aggregate that
 *   drops to zero is deleted.
 */
export async function retractSlackNotifications(slackChannelId: string, slackTs: string): Promise<void> {
  const rows = await prisma.notification.findMany({
    where: { slackChannelId, read: false },
    select: { id: true, recipientId: true, type: true, slackTs: true, message: true, metadata: true },
  });
  if (rows.length === 0) return;

  const removedByRecipient = new Map<string, string[]>();
  const toDelete: string[] = [];

  for (const row of rows) {
    if (row.type !== "SLACK_DM") {
      if (row.slackTs === slackTs) {
        toDelete.push(row.id);
        removedByRecipient.set(row.recipientId, [...(removedByRecipient.get(row.recipientId) ?? []), row.id]);
      }
      continue;
    }

    const meta = row.metadata as Partial<SlackDmMetadata> | null;
    const existing = pingsOf(row, "");
    if (!existing.some((p) => p.ts === slackTs)) continue; // this delete doesn't touch this aggregate

    const remaining = removePing(existing, slackTs);
    if (remaining.length === 0) {
      toDelete.push(row.id);
      removedByRecipient.set(row.recipientId, [...(removedByRecipient.get(row.recipientId) ?? []), row.id]);
      continue;
    }

    const newest = newestPing(remaining)!;
    const count = pingCount(remaining);
    const isGroup = meta?.isGroup ?? false;
    const message = count === 1 ? newest.message : renderAggregateMessage(count, newest.authorName, isGroup);
    const updated = await prisma.notification.update({
      where: { id: row.id },
      data: {
        message,
        slackTs: newest.ts,
        metadata: ({ link: meta?.link ?? "", count, isGroup, pings: remaining } satisfies SlackDmMetadata) as any,
      },
    });
    activityBus.emit(`notification:${row.recipientId}`, updated);
  }

  if (toDelete.length > 0) {
    await prisma.notification.deleteMany({ where: { id: { in: toDelete } } });
    for (const [recipientId, ids] of removedByRecipient) activityBus.emit(`notification-removed:${recipientId}`, { ids });
  }
}
