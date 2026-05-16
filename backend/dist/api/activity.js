import { Router } from "express";
import { requireAuth } from "./auth.js";
import { prisma } from "../db/prisma.js";
import { activityBus } from "../services/activityService.js";
export const activityRouter = Router();
activityRouter.use(requireAuth);
activityRouter.get("/", async (_req, res) => {
    try {
        // Fetch recent ProjectUpdates
        const updates = await prisma.projectUpdate.findMany({
            take: 10,
            orderBy: { postedAt: "desc" },
            include: {
                project: { select: { id: true, name: true } },
            },
        });
        // We don't have author relation heavily fleshed out on ProjectUpdate in schema.prisma,
        // wait, ProjectUpdate has authorId, but no relation to Member in schema!
        // Let me check schema.prisma... Ah, authorId is just a String there, no relation defined.
        // I will fetch Members manually for updates or update the schema later.
        const memberIds = [...new Set(updates.map(u => u.authorId).filter((id) => id !== null))];
        const members = await prisma.member.findMany({
            where: { id: { in: memberIds } }
        });
        const memberMap = new Map(members.map(m => [m.id, m]));
        const formattedUpdates = updates.map(u => ({
            id: u.id,
            type: "update",
            content: u.content,
            createdAt: u.postedAt,
            project: u.project,
            author: (u.authorId ? memberMap.get(u.authorId) : undefined) || { displayName: "Unknown", avatarUrl: null }
        }));
        // Fetch recent TaskComments
        const comments = await prisma.taskComment.findMany({
            take: 10,
            orderBy: { createdAt: "desc" },
            include: {
                task: {
                    include: { project: { select: { id: true, name: true } } }
                },
                author: true
            }
        });
        const formattedComments = comments.map(c => ({
            id: c.id,
            type: "comment",
            content: c.content,
            createdAt: c.createdAt,
            task: { id: c.task.id, title: c.task.title },
            project: c.task.project,
            author: c.author
        }));
        // Combine and sort
        const activity = [...formattedUpdates, ...formattedComments]
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
            .slice(0, 15);
        res.json(activity);
    }
    catch (error) {
        console.error("Fetch activity error:", error);
        res.status(500).json({ error: "Failed to fetch activity" });
    }
});
// ── GET /api/activity/project/:projectId ─────────────────────
activityRouter.get("/project/:projectId", async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit ?? "20", 10), 100);
        const offset = parseInt(req.query.offset ?? "0", 10);
        const type = req.query.type;
        const where = { projectId: req.params.projectId };
        if (type) {
            const types = type.split(",").map(t => t.trim()).filter(Boolean);
            if (types.length === 1)
                where.type = types[0];
            else
                where.type = { in: types };
        }
        const [activities, total] = await Promise.all([
            prisma.activity.findMany({
                where: where,
                include: { member: { select: { id: true, displayName: true, avatarUrl: true } } },
                orderBy: { createdAt: "desc" },
                take: limit,
                skip: offset,
            }),
            prisma.activity.count({ where: where }),
        ]);
        res.json({ activities, total });
    }
    catch (error) {
        console.error("Fetch project activity error:", error);
        res.status(500).json({ error: "Failed to fetch project activity" });
    }
});
// ── GET /api/activity/project/:projectId/stream (SSE) ────────
activityRouter.get("/project/:projectId/stream", (req, res) => {
    const { projectId } = req.params;
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();
    const heartbeat = setInterval(() => res.write(": heartbeat\n\n"), 25_000);
    const onActivity = (activity) => {
        res.write(`data: ${JSON.stringify(activity)}\n\n`);
    };
    activityBus.on(`project:${projectId}`, onActivity);
    req.on("close", () => {
        clearInterval(heartbeat);
        activityBus.off(`project:${projectId}`, onActivity);
    });
});
//# sourceMappingURL=activity.js.map