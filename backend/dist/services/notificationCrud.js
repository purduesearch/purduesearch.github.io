import { prisma } from "../db/prisma.js";
import { activityBus } from "./activityService.js";
// ── Create ───────────────────────────────────────────────────
export async function createNotification(data) {
    const notification = await prisma.notification.create({
        data: {
            type: data.type,
            recipientId: data.recipientId,
            actorId: data.actorId ?? null,
            projectId: data.projectId ?? null,
            taskId: data.taskId ?? null,
            commentId: data.commentId ?? null,
            message: data.message,
            metadata: data.metadata ?? undefined,
        },
    });
    // Push to SSE stream for the recipient
    activityBus.emit(`notification:${data.recipientId}`, notification);
    return notification;
}
// ── Batch Create ─────────────────────────────────────────────
export async function batchCreateNotifications(notifications) {
    if (notifications.length === 0)
        return;
    // createMany doesn't return records, so we create individually to be able
    // to emit per-recipient SSE events.
    await Promise.all(notifications.map(n => createNotification(n)));
}
// ── List (paginated, project-membership filtered) ────────────
export async function getNotificationsForMember(memberId, opts) {
    const limit = Math.min(opts?.limit ?? 20, 100);
    const unreadOnly = opts?.unreadOnly ?? false;
    // Fetch the member's project IDs so we can filter notifications properly.
    const projectMemberships = await prisma.projectMember.findMany({
        where: { memberId },
        select: { projectId: true },
    });
    const memberProjectIds = projectMemberships.map(pm => pm.projectId);
    const where = {
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
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore
        ? items[items.length - 1].createdAt.toISOString()
        : null;
    return { notifications: items, nextCursor };
}
// ── Unread Count ─────────────────────────────────────────────
export async function getUnreadCount(memberId) {
    return prisma.notification.count({
        where: { recipientId: memberId, read: false },
    });
}
// ── Mark One Read ────────────────────────────────────────────
export async function markRead(notifId, memberId) {
    // Verify ownership before updating
    const notif = await prisma.notification.findUnique({ where: { id: notifId } });
    if (!notif || notif.recipientId !== memberId) {
        throw Object.assign(new Error("Notification not found"), { status: 404 });
    }
    if (notif.read)
        return; // already read — no-op
    await prisma.notification.update({
        where: { id: notifId },
        data: { read: true, readAt: new Date() },
    });
}
// ── Mark All Read ────────────────────────────────────────────
export async function markAllRead(memberId) {
    await prisma.notification.updateMany({
        where: { recipientId: memberId, read: false },
        data: { read: true, readAt: new Date() },
    });
}
// ── Delete One ───────────────────────────────────────────────
export async function deleteNotification(notifId, memberId) {
    const notif = await prisma.notification.findUnique({ where: { id: notifId } });
    if (!notif || notif.recipientId !== memberId) {
        throw Object.assign(new Error("Notification not found"), { status: 404 });
    }
    await prisma.notification.delete({ where: { id: notifId } });
}
// ── Cleanup: Delete Old Read Notifications ───────────────────
export async function deleteOldNotifications(olderThanDays) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - olderThanDays);
    const { count } = await prisma.notification.deleteMany({
        where: { read: true, createdAt: { lt: cutoff } },
    });
    return count;
}
//# sourceMappingURL=notificationCrud.js.map