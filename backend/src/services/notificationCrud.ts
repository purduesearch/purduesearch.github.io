import { prisma } from "../db/prisma.js";
import { activityBus } from "./activityService.js";
import type { Notification, NotificationType } from "@prisma/client";

// ── Create ───────────────────────────────────────────────────

export async function createNotification(data: {
  type: NotificationType;
  recipientId: string;
  actorId?: string;
  projectId?: string;
  taskId?: string;
  commentId?: string;
  message: string;
  metadata?: Record<string, any>;
}): Promise<Notification> {
  const notification = await prisma.notification.create({
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
