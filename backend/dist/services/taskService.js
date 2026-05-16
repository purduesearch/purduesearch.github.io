import { prisma } from "../db/prisma.js";
import { logActivity } from "./activityService.js";
// ── Service ──────────────────────────────────────────────────
export async function createTask(data) {
    // Idempotency check: if slackMsgTs is provided, check for duplicates
    if (data.slackMsgTs) {
        const existing = await prisma.task.findFirst({
            where: { slackMsgTs: data.slackMsgTs },
            include: { assignees: true, project: true },
        });
        if (existing) {
            return existing;
        }
    }
    const task = await prisma.task.create({
        data: {
            title: data.title,
            description: data.description,
            status: data.status,
            priority: data.priority,
            dueDate: data.dueDate,
            projectId: data.projectId,
            slackMsgTs: data.slackMsgTs,
            parentTaskId: data.parentTaskId,
            milestoneId: data.milestoneId,
            recurringInterval: data.recurringInterval,
            estimatedHours: data.estimatedHours,
            storyPoints: data.storyPoints,
            isRecurring: data.isRecurring,
            recurrencePattern: data.recurrencePattern,
            recurrenceEndDate: data.recurrenceEndDate,
            recurringParentId: data.recurringParentId,
            ...(data.assigneeIds && data.assigneeIds.length > 0
                ? { assignees: { connect: data.assigneeIds.map(id => ({ id })) } }
                : {}),
            ...(data.tagIds?.length
                ? { tags: { connect: data.tagIds.map(id => ({ id })) } }
                : {}),
        },
        include: { assignees: true, project: true, subtasks: true },
    });
    await logActivity({
        type: "TASK_CREATED",
        entityId: task.id,
        entityType: "Task",
        projectId: task.projectId,
    });
    return task;
}
export async function updateTask(id, data) {
    const updateData = {};
    // Copy simple scalar fields
    if (data.title !== undefined)
        updateData.title = data.title;
    if (data.description !== undefined)
        updateData.description = data.description;
    if (data.status !== undefined)
        updateData.status = data.status;
    if (data.progress !== undefined)
        updateData.progress = data.progress;
    if (data.priority !== undefined)
        updateData.priority = data.priority;
    if (data.dueDate !== undefined)
        updateData.dueDate = data.dueDate;
    if (data.tags !== undefined)
        updateData.tags = { set: data.tags.map(id => ({ id })) };
    if (data.estimatedHours !== undefined)
        updateData.estimatedHours = data.estimatedHours;
    if (data.storyPoints !== undefined)
        updateData.storyPoints = data.storyPoints;
    if (data.isRecurring !== undefined)
        updateData.isRecurring = data.isRecurring;
    if (data.recurrencePattern !== undefined)
        updateData.recurrencePattern = data.recurrencePattern;
    if (data.recurrenceEndDate !== undefined)
        updateData.recurrenceEndDate = data.recurrenceEndDate;
    if (data.recurringParentId !== undefined)
        updateData.recurringParentId = data.recurringParentId;
    if (data.attachments !== undefined) {
        updateData.attachments = data.attachments.map(a => typeof a === "string" ? a : JSON.stringify(a));
    }
    if (data.recurringInterval !== undefined)
        updateData.recurringInterval = data.recurringInterval;
    // M:N relations
    if (data.assigneeIds !== undefined) {
        updateData.assignees = { set: data.assigneeIds.map(aid => ({ id: aid })) };
    }
    // FK relations
    if (data.parentTaskId !== undefined) {
        updateData.parentTask = data.parentTaskId
            ? { connect: { id: data.parentTaskId } }
            : { disconnect: true };
    }
    if (data.milestoneId !== undefined) {
        updateData.milestone = data.milestoneId
            ? { connect: { id: data.milestoneId } }
            : { disconnect: true };
    }
    let updated = await prisma.task.update({
        where: { id },
        data: updateData,
        include: { assignees: true, project: true, subtasks: true, tags: true },
    });
    // Dep set operations (explicit join table — cannot use Prisma connect/disconnect)
    if (data.blockedByIds !== undefined) {
        await prisma.taskDependency.deleteMany({ where: { blockedTaskId: id } });
        if (data.blockedByIds.length > 0) {
            await prisma.taskDependency.createMany({
                data: data.blockedByIds.map(bid => ({ blockingTaskId: bid, blockedTaskId: id })),
                skipDuplicates: true,
            });
        }
    }
    if (data.blockingIds !== undefined) {
        await prisma.taskDependency.deleteMany({ where: { blockingTaskId: id } });
        if (data.blockingIds.length > 0) {
            await prisma.taskDependency.createMany({
                data: data.blockingIds.map(bid => ({ blockingTaskId: id, blockedTaskId: bid })),
                skipDuplicates: true,
            });
        }
    }
    if (data.status !== undefined) {
        await logActivity({
            type: "STATUS_CHANGED",
            entityId: updated.id,
            entityType: "Task",
            projectId: updated.projectId,
            metadata: { status: updated.status },
        });
    }
    // ── Recurring task spawn on DONE ──
    if (data.status === "DONE" && updated.recurringInterval) {
        await spawnRecurringTask(updated);
    }
    if (data.status === "DONE" && updated.isRecurring && updated.recurrencePattern) {
        await spawnNextOccurrence(updated);
    }
    return updated;
}
export async function deleteTask(id) {
    return prisma.task.delete({ where: { id } });
}
export async function getTask(id) {
    return prisma.task.findUnique({
        where: { id },
        include: {
            assignees: true,
            project: true,
            comments: { include: { author: true }, orderBy: { createdAt: "asc" } },
            subtasks: { include: { assignees: true }, orderBy: { createdAt: "asc" } },
            blockedBy: { include: { blockingTask: { select: { id: true, title: true, status: true } } } },
            blocks: { include: { blockedTask: { select: { id: true, title: true, status: true } } } },
            timeLogs: { include: { member: { select: { id: true, displayName: true } } } },
            tags: true,
            milestone: true,
            parentTask: { select: { id: true, title: true } },
        },
    });
}
export async function getTasksForProject(projectId, filters) {
    const where = { projectId };
    if (filters?.status)
        where.status = filters.status;
    if (filters?.assigneeId)
        where.assignees = { some: { id: filters.assigneeId } };
    if (filters?.priority)
        where.priority = filters.priority;
    return prisma.task.findMany({
        where,
        include: { assignees: true, tags: true },
        orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
    });
}
export async function getTasksForMember(memberId) {
    return prisma.task.findMany({
        where: { assignees: { some: { id: memberId } } },
        include: { project: true, assignees: true, tags: true },
        orderBy: [{ dueDate: "asc" }, { priority: "desc" }],
    });
}
export async function getOverdueTasks() {
    const now = new Date();
    return prisma.task.findMany({
        where: {
            dueDate: { lt: now },
            status: { notIn: ["DONE"] },
        },
        include: { assignees: true, project: true },
    });
}
export async function getTasksDueToday() {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);
    return prisma.task.findMany({
        where: {
            dueDate: { gte: startOfDay, lte: endOfDay },
            status: { notIn: ["DONE"] },
        },
        include: { assignees: true, project: true },
    });
}
export async function getTasksDueThisWeek(memberId) {
    const now = new Date();
    const endOfWeek = new Date();
    endOfWeek.setDate(now.getDate() + (7 - now.getDay()));
    endOfWeek.setHours(23, 59, 59, 999);
    const where = {
        dueDate: { gte: now, lte: endOfWeek },
        status: { notIn: ["DONE"] },
    };
    if (memberId)
        where.assignees = { some: { id: memberId } };
    return prisma.task.findMany({
        where,
        include: { assignees: true, project: true },
        orderBy: { dueDate: "asc" },
    });
}
// ── Subtask Helpers ─────────────────────────────────────────
export async function getSubtasks(taskId) {
    return prisma.task.findMany({
        where: { parentTaskId: taskId },
        include: { assignees: true },
        orderBy: { createdAt: "asc" },
    });
}
export async function createSubtask(parentTaskId, data) {
    const parent = await prisma.task.findUnique({ where: { id: parentTaskId } });
    if (!parent)
        throw new Error("Parent task not found");
    const subtask = await prisma.task.create({
        data: {
            title: data.title,
            projectId: parent.projectId,
            parentTaskId,
            ...(data.assigneeIds && data.assigneeIds.length > 0
                ? { assignees: { connect: data.assigneeIds.map(id => ({ id })) } }
                : {}),
        },
        include: { assignees: true, project: true },
    });
    await logActivity({
        type: "SUBTASK_ADDED",
        entityId: subtask.id,
        entityType: "Task",
        projectId: subtask.projectId,
        metadata: { parentTaskId },
    });
    return subtask;
}
// ── Dependency Helpers ──────────────────────────────────────
export async function addDependency(taskId, blockedById) {
    if (taskId === blockedById)
        throw new Error("A task cannot depend on itself");
    const hasCycle = await checkDependencyCycle(blockedById, taskId);
    if (hasCycle)
        throw new Error("Adding this dependency would create a circular chain");
    await prisma.taskDependency.upsert({
        where: { blockingTaskId_blockedTaskId: { blockingTaskId: blockedById, blockedTaskId: taskId } },
        create: { blockingTaskId: blockedById, blockedTaskId: taskId },
        update: {},
    });
    return prisma.task.findUnique({
        where: { id: taskId },
        include: {
            blockedBy: { include: { blockingTask: true } },
            blocks: { include: { blockedTask: true } },
        },
    });
}
export async function removeDependency(taskId, blockedById) {
    await prisma.taskDependency.delete({
        where: { blockingTaskId_blockedTaskId: { blockingTaskId: blockedById, blockedTaskId: taskId } },
    });
    return prisma.task.findUnique({
        where: { id: taskId },
        include: {
            blockedBy: { include: { blockingTask: true } },
            blocks: { include: { blockedTask: true } },
        },
    });
}
async function checkDependencyCycle(fromId, targetId) {
    // BFS: walk the blockedBy chain upward; if we reach targetId it's a cycle.
    const visited = new Set();
    const queue = [fromId];
    while (queue.length > 0) {
        const currentId = queue.shift();
        if (currentId === targetId)
            return true;
        if (visited.has(currentId))
            continue;
        visited.add(currentId);
        const deps = await prisma.taskDependency.findMany({
            where: { blockedTaskId: currentId },
            select: { blockingTaskId: true },
        });
        for (const dep of deps) {
            queue.push(dep.blockingTaskId);
        }
    }
    return false;
}
// ── Recurring Task Spawn ────────────────────────────────────
async function spawnRecurringTask(completedTask) {
    // Only spawn if no un-done child of the same source already exists
    const sourceId = completedTask.sourceTaskId ?? completedTask.id;
    const existingOpen = await prisma.task.findFirst({
        where: {
            sourceTaskId: sourceId,
            status: { not: "DONE" },
        },
    });
    if (existingOpen)
        return; // prevent duplicates
    const nextDueDate = computeNextDueDate(completedTask.dueDate ?? new Date(), completedTask.recurringInterval);
    await prisma.task.create({
        data: {
            title: completedTask.title,
            description: completedTask.description,
            priority: completedTask.priority,
            projectId: completedTask.projectId,
            recurringInterval: completedTask.recurringInterval,
            sourceTaskId: sourceId,
            dueDate: nextDueDate,
            milestoneId: completedTask.milestoneId,
            assignees: {
                connect: completedTask.assignees.map(a => ({ id: a.id })),
            },
        },
    });
    // Mark the completed task's lastSpawnedAt
    await prisma.task.update({
        where: { id: completedTask.id },
        data: { lastSpawnedAt: new Date() },
    });
}
function computeNextDueDate(currentDue, interval) {
    const next = new Date(currentDue);
    switch (interval) {
        case "DAILY":
            next.setDate(next.getDate() + 1);
            break;
        case "WEEKLY":
            next.setDate(next.getDate() + 7);
            break;
        case "BIWEEKLY":
            next.setDate(next.getDate() + 14);
            break;
        case "MONTHLY":
            next.setMonth(next.getMonth() + 1);
            break;
    }
    return next;
}
// ── Time Logging ────────────────────────────────────────────
export async function logTime(taskId, memberId, minutes, note) {
    return prisma.timeLog.create({ data: { taskId, memberId, minutes, note } });
}
// ── spawnNextOccurrence (recurrencePattern-based) ───────────
export async function spawnNextOccurrence(task) {
    if (!task.isRecurring || !task.recurrencePattern || !task.dueDate)
        return;
    const next = new Date(task.dueDate);
    const patterns = {
        DAILY: () => next.setDate(next.getDate() + 1),
        WEEKLY: () => next.setDate(next.getDate() + 7),
        BIWEEKLY: () => next.setDate(next.getDate() + 14),
        MONTHLY: () => next.setMonth(next.getMonth() + 1),
    };
    patterns[task.recurrencePattern]?.();
    if (task.recurrenceEndDate && next > task.recurrenceEndDate)
        return;
    await prisma.task.create({
        data: {
            title: task.title, description: task.description, priority: task.priority,
            projectId: task.projectId, dueDate: next, status: "TODO",
            isRecurring: true, recurrencePattern: task.recurrencePattern,
            recurrenceEndDate: task.recurrenceEndDate,
            recurringParentId: task.recurringParentId ?? task.id,
            estimatedHours: task.estimatedHours, storyPoints: task.storyPoints,
            assignees: { connect: task.assignees.map(a => ({ id: a.id })) },
            tags: { connect: task.tags.map(t => ({ id: t.id })) },
        },
    });
}
// ── Slack-Oriented Helpers ──────────────────────────────────
export async function completeTaskFromSlack(taskId) {
    return updateTask(taskId, { status: "DONE" });
}
export async function claimTaskFromSlack(taskId, memberId) {
    const task = await getTask(taskId);
    const existingIds = task?.assignees.map(a => a.id) ?? [];
    if (!existingIds.includes(memberId))
        existingIds.push(memberId);
    return updateTask(taskId, { assigneeIds: existingIds });
}
export async function createTaskFromSlackMessage(data) {
    return createTask(data);
}
export async function reassignTaskFromSlack(taskId, memberId) {
    return updateTask(taskId, { assigneeIds: [memberId] });
}
//# sourceMappingURL=taskService.js.map