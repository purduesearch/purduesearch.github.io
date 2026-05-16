import { EventEmitter } from "events";
import { prisma } from "../db/prisma.js";
// ── Activity Event Bus ───────────────────────────────────────
// Used by the SSE stream endpoint to push activity to connected clients.
export const activityBus = new EventEmitter();
activityBus.setMaxListeners(200);
// ── Activity Logging Service ─────────────────────────────────
export async function logActivity(data) {
    const activity = await prisma.activity.create({
        data: {
            type: data.type,
            entityId: data.entityId,
            entityType: data.entityType,
            projectId: data.projectId,
            memberId: data.memberId,
            metadata: data.metadata ?? undefined,
        },
        include: { member: true },
    });
    if (data.projectId) {
        activityBus.emit(`project:${data.projectId}`, activity);
    }
    return activity;
}
export async function getProjectActivities(projectId, take = 50, cursor) {
    return prisma.activity.findMany({
        where: { projectId },
        include: { member: true },
        orderBy: { createdAt: "desc" },
        take,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
}
export async function getEntityActivities(entityId, take = 30) {
    return prisma.activity.findMany({
        where: { entityId },
        include: { member: true },
        orderBy: { createdAt: "desc" },
        take,
    });
}
export async function logAuditEvent(params) {
    let projectId = params.projectId;
    if (!projectId && params.taskId) {
        const task = await prisma.task.findUnique({
            where: { id: params.taskId },
            select: { projectId: true },
        });
        projectId = task?.projectId ?? undefined;
    }
    if (!projectId)
        return;
    await prisma.activityLog.create({
        data: {
            projectId,
            taskId: params.taskId ?? null,
            memberId: params.memberId ?? null,
            source: params.source,
            eventType: params.eventType,
            payload: params.payload,
        },
    });
}
export function diffObjects(before, after, watchFields) {
    return watchFields
        .filter(f => JSON.stringify(before[f]) !== JSON.stringify(after[f]))
        .map(f => ({ field: f, from: before[f], to: after[f] }));
}
export async function getProjectAuditLog(projectId, cursor, limit = 50, eventType) {
    const take = Math.min(limit, 100);
    const logs = await prisma.activityLog.findMany({
        where: {
            projectId,
            ...(eventType ? { eventType } : {}),
        },
        orderBy: { createdAt: "desc" },
        take: take + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        include: {
            member: { select: { id: true, displayName: true, avatarUrl: true } },
            task: { select: { id: true, title: true } },
        },
    });
    const hasMore = logs.length > take;
    const items = hasMore ? logs.slice(0, take) : logs;
    return { items, nextCursor: hasMore ? items[items.length - 1].id : null };
}
//# sourceMappingURL=activityService.js.map