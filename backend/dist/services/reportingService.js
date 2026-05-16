import { prisma } from "../db/prisma.js";
// ── Reporting Service ────────────────────────────────────────
export async function getProjectBurndown(projectId) {
    // Get all tasks for the project with their creation/completion dates
    const tasks = await prisma.task.findMany({
        where: { projectId, parentTaskId: null }, // top-level only
        select: { id: true, status: true, createdAt: true, updatedAt: true },
        orderBy: { createdAt: "asc" },
    });
    if (tasks.length === 0)
        return [];
    // Build cumulative burndown data
    const earliest = tasks[0].createdAt;
    const now = new Date();
    const points = [];
    // Walk day-by-day from project start to now
    const cursor = new Date(earliest);
    cursor.setHours(0, 0, 0, 0);
    while (cursor <= now) {
        const dayEnd = new Date(cursor);
        dayEnd.setHours(23, 59, 59, 999);
        const created = tasks.filter((t) => t.createdAt <= dayEnd).length;
        const completed = tasks.filter((t) => t.status === "DONE" && t.updatedAt <= dayEnd).length;
        points.push({
            date: cursor.toISOString().split("T")[0],
            total: created,
            completed,
            remaining: created - completed,
        });
        cursor.setDate(cursor.getDate() + 1);
    }
    return points;
}
export async function getProjectStatusCounts(projectId) {
    const tasks = await prisma.task.findMany({
        where: { projectId, parentTaskId: null },
        select: { status: true },
    });
    const counts = { TODO: 0, IN_PROGRESS: 0, BLOCKED: 0, DONE: 0 };
    for (const t of tasks) {
        counts[t.status] = (counts[t.status] || 0) + 1;
    }
    return counts;
}
export async function getOverdueCount(projectId) {
    const now = new Date();
    return prisma.task.count({
        where: {
            projectId,
            parentTaskId: null,
            status: { not: "DONE" },
            dueDate: { lt: now },
        },
    });
}
export async function getProjectReport(projectId) {
    const [burndown, statusCounts, overdueCount] = await Promise.all([
        getProjectBurndown(projectId),
        getProjectStatusCounts(projectId),
        getOverdueCount(projectId),
    ]);
    return { burndown, statusCounts, overdueCount };
}
//# sourceMappingURL=reportingService.js.map