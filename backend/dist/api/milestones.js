import { Router } from "express";
import { requireAuth } from "./auth.js";
import { getMilestoneWithProgress, refreshMilestoneHealth } from "../services/milestoneService.js";
export const milestonesRouter = Router();
milestonesRouter.use(requireAuth);
// ── GET /api/milestones/project/:projectId ───────────────────
milestonesRouter.get("/project/:projectId", async (req, res) => {
    try {
        const projectId = req.params.projectId;
        const { prisma } = await import("../db/prisma.js");
        const milestones = await prisma.milestone.findMany({
            where: { projectId },
            include: {
                tasks: {
                    select: {
                        id: true,
                        title: true,
                        status: true,
                        priority: true,
                        assignees: { select: { id: true, displayName: true } },
                    },
                },
                owner: { select: { id: true, displayName: true, avatarUrl: true } },
            },
            orderBy: { dueDate: "asc" },
        });
        const enriched = milestones.map((m) => {
            const tasks = m.tasks;
            const total = tasks.length;
            const done = tasks.filter((t) => t.status === "DONE").length;
            return {
                ...m,
                progress: total > 0 ? Math.round((done / total) * 100) : 0,
                completionPct: total > 0 ? Math.round((done / total) * 100) : 0,
                taskCounts: { total, done },
            };
        });
        res.json(enriched);
    }
    catch (error) {
        console.error("Get milestones error:", error);
        res.status(500).json({ error: "Failed to get milestones" });
    }
});
// ── GET /api/milestones/:id ──────────────────────────────────
milestonesRouter.get("/:id", async (req, res) => {
    try {
        const id = req.params.id;
        const milestone = await getMilestoneWithProgress(id);
        if (!milestone) {
            res.status(404).json({ error: "Milestone not found" });
            return;
        }
        res.json(milestone);
    }
    catch (error) {
        console.error("Get milestone error:", error);
        res.status(500).json({ error: "Failed to get milestone" });
    }
});
// ── POST /api/milestones ─────────────────────────────────────
milestonesRouter.post("/", async (req, res) => {
    try {
        const { title, projectId, dueDate, description, ownerId } = req.body;
        if (!title || !projectId) {
            res.status(400).json({ error: "title and projectId are required" });
            return;
        }
        const { prisma } = await import("../db/prisma.js");
        const milestone = await prisma.milestone.create({
            data: {
                title,
                projectId,
                dueDate: dueDate ? new Date(dueDate) : undefined,
                description: description ?? null,
                ownerId: ownerId ?? null,
            },
            include: {
                tasks: { select: { id: true, status: true } },
                owner: { select: { id: true, displayName: true, avatarUrl: true } },
            },
        });
        res.status(201).json({
            ...milestone,
            progress: 0,
            completionPct: 0,
            taskCounts: { total: 0, done: 0 },
        });
    }
    catch (error) {
        console.error("Create milestone error:", error);
        res.status(500).json({ error: "Failed to create milestone" });
    }
});
// ── PATCH /api/milestones/:id ────────────────────────────────
milestonesRouter.patch("/:id", async (req, res) => {
    try {
        const milestoneId = req.params.id;
        const { title, dueDate, description, ownerId, status, milestoneTaskIds } = req.body;
        const { prisma } = await import("../db/prisma.js");
        // Build update data
        const data = {};
        if (title !== undefined)
            data.title = title;
        if (dueDate !== undefined)
            data.dueDate = dueDate === null ? null : new Date(dueDate);
        if (description !== undefined)
            data.description = description;
        if (ownerId !== undefined)
            data.ownerId = ownerId;
        if (status !== undefined) {
            data.status = status;
            if (status === "COMPLETED" && !data.completedAt)
                data.completedAt = new Date();
        }
        // Handle milestoneTaskIds: set milestoneId on selected tasks, null on delinked tasks
        if (milestoneTaskIds !== undefined) {
            // First, unlink all tasks currently linked to this milestone
            await prisma.task.updateMany({
                where: { milestoneId },
                data: { milestoneId: null },
            });
            // Then, link the selected tasks
            if (milestoneTaskIds.length > 0) {
                await prisma.task.updateMany({
                    where: { id: { in: milestoneTaskIds } },
                    data: { milestoneId },
                });
            }
        }
        const milestone = await prisma.milestone.update({
            where: { id: milestoneId },
            data,
            include: {
                tasks: {
                    select: {
                        id: true,
                        title: true,
                        status: true,
                        priority: true,
                        assignees: { select: { id: true, displayName: true } },
                    },
                },
                owner: { select: { id: true, displayName: true, avatarUrl: true } },
            },
        });
        // Refresh health after any update
        await refreshMilestoneHealth(milestoneId);
        const tasks = milestone.tasks;
        const total = tasks.length;
        const done = tasks.filter((t) => t.status === "DONE").length;
        res.json({
            ...milestone,
            progress: total > 0 ? Math.round((done / total) * 100) : 0,
            completionPct: total > 0 ? Math.round((done / total) * 100) : 0,
            taskCounts: { total, done },
        });
    }
    catch (error) {
        console.error("Update milestone error:", error);
        res.status(500).json({ error: "Failed to update milestone" });
    }
});
// ── DELETE /api/milestones/:id ───────────────────────────────
milestonesRouter.delete("/:id", async (req, res) => {
    try {
        const milestoneId = req.params.id;
        const { prisma } = await import("../db/prisma.js");
        // Unlink tasks first
        await prisma.task.updateMany({
            where: { milestoneId },
            data: { milestoneId: null },
        });
        await prisma.milestone.delete({ where: { id: milestoneId } });
        res.json({ ok: true });
    }
    catch (error) {
        console.error("Delete milestone error:", error);
        res.status(500).json({ error: "Failed to delete milestone" });
    }
});
//# sourceMappingURL=milestones.js.map