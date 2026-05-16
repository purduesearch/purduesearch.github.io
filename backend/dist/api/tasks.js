import { Router } from "express";
import { requireAuth } from "./auth.js";
import { channelAuth } from "../middleware/channelAuth.js";
import { updateTask, deleteTask, getTask, createSubtask, getSubtasks, addDependency, removeDependency, logTime, createTask } from "../services/taskService.js";
import { logAuditEvent, diffObjects } from "../services/activityService.js";
import { generateJson, generateJsonFromImage } from "../services/geminiService.js";
import { duplicateDetectionPrompt, enrichTaskPrompt, deadlineSuggestionPrompt, nlToTaskPrompt, imageToTaskPrompt, } from "../utils/aiPrompts.js";
import { prisma as prismaClient } from "../db/prisma.js";
export const tasksRouter = Router();
// All routes require authentication
tasksRouter.use(requireAuth);
// ── GET /api/tasks/search ────────────────────────────────────
tasksRouter.get("/search", async (req, res) => {
    try {
        const query = req.query.q;
        if (!query) {
            res.json([]);
            return;
        }
        const { prisma } = await import("../db/prisma.js");
        const tasks = await prisma.task.findMany({
            where: {
                OR: [
                    { title: { contains: query, mode: "insensitive" } },
                    { description: { contains: query, mode: "insensitive" } },
                    { tags: { some: { name: { contains: query, mode: "insensitive" } } } },
                    { assignees: { some: { displayName: { contains: query, mode: "insensitive" } } } },
                ],
            },
            include: { assignees: true, project: true },
            take: 20,
        });
        res.json(tasks);
    }
    catch (error) {
        console.error("Search tasks error:", error);
        res.status(500).json({ error: "Failed to search tasks" });
    }
});
// ── POST /api/tasks/check-duplicates ────────────────────────
tasksRouter.post("/check-duplicates", async (req, res) => {
    try {
        const { title, description, projectId } = req.body;
        if (!title || !projectId) {
            res.status(400).json({ error: "title and projectId are required" });
            return;
        }
        const existingTasks = await prismaClient.task.findMany({
            where: { projectId, status: { not: "DONE" } },
            select: { id: true, title: true, description: true },
        });
        const result = await generateJson(duplicateDetectionPrompt(title, description ?? "", existingTasks));
        res.json(result);
    }
    catch (error) {
        console.error("Check duplicates error:", error);
        res.status(500).json({ error: "Failed to check for duplicates" });
    }
});
// ── POST /api/tasks/create-from-nl ──────────────────────────
tasksRouter.post("/create-from-nl", async (req, res) => {
    try {
        const { input, projectId } = req.body;
        if (!input || !projectId) {
            res.status(400).json({ error: "input and projectId are required" });
            return;
        }
        const project = await prismaClient.project.findUnique({
            where: { id: projectId },
            include: { members: { include: { member: true } } },
        });
        if (!project) {
            res.status(404).json({ error: "Project not found" });
            return;
        }
        const memberNames = project.members.map((pm) => pm.member.displayName);
        const today = new Date().toISOString().split("T")[0];
        const parsed = await generateJson(nlToTaskPrompt(input, project.name, memberNames, today));
        if (!parsed) {
            res.status(500).json({ error: "AI failed to parse task" });
            return;
        }
        let assigneeId;
        if (parsed.assigneeName) {
            const nameLower = parsed.assigneeName.toLowerCase();
            const match = project.members.find((pm) => pm.member.displayName.toLowerCase().includes(nameLower) ||
                nameLower.includes(pm.member.displayName.toLowerCase()));
            if (match)
                assigneeId = match.member.id;
        }
        const task = await createTask({
            title: parsed.title,
            description: parsed.description ?? undefined,
            priority: parsed.priority,
            dueDate: parsed.dueDate ? new Date(parsed.dueDate) : undefined,
            projectId,
            assigneeIds: assigneeId ? [assigneeId] : [],
        });
        res.status(201).json(task);
    }
    catch (error) {
        console.error("Create from NL error:", error);
        res.status(500).json({ error: "Failed to create task from natural language" });
    }
});
// ── POST /api/tasks/create-from-image ───────────────────────
tasksRouter.post("/create-from-image", async (req, res) => {
    try {
        const { imageBase64, mimeType, projectId, userNote } = req.body;
        if (!imageBase64 || !mimeType || !projectId) {
            res.status(400).json({ error: "imageBase64, mimeType, and projectId are required" });
            return;
        }
        const project = await prismaClient.project.findUnique({ where: { id: projectId } });
        if (!project) {
            res.status(404).json({ error: "Project not found" });
            return;
        }
        const result = await generateJsonFromImage(imageBase64, mimeType, imageToTaskPrompt(project.name, userNote ?? ""));
        if (!result) {
            res.status(500).json({ error: "AI failed to analyze image" });
            return;
        }
        let createdTask = null;
        if (result.hasTask) {
            createdTask = await createTask({
                title: result.title,
                description: result.description,
                priority: result.priority,
                projectId,
                assigneeIds: [],
            });
        }
        res.json({ task: createdTask, screenshotDescription: result.screenshotDescription });
    }
    catch (error) {
        console.error("Create from image error:", error);
        res.status(500).json({ error: "Failed to create task from image" });
    }
});
// ── PATCH /api/tasks/:id ─────────────────────────────────────
tasksRouter.patch("/:id", channelAuth, async (req, res) => {
    try {
        const taskId = req.params.id;
        const { title, description, status, progress, priority, dueDate, assigneeIds, tags, attachments, parentTaskId, blockingTaskIds } = req.body;
        const existingTask = await getTask(taskId);
        if (!existingTask) {
            res.status(404).json({ error: "Task not found" });
            return;
        }
        if (status === "DONE" && existingTask.status !== "DONE") {
            const openBlockers = (existingTask.blockedBy ?? []).filter((d) => d.blockingTask.status !== "DONE");
            if (openBlockers.length > 0) {
                const names = openBlockers.map((d) => `"${d.blockingTask.title}"`).join(", ");
                const count = openBlockers.length;
                res.status(400).json({
                    error: `Cannot mark as done: ${count} blocker${count > 1 ? "s" : ""} not yet completed — ${names}`,
                });
                return;
            }
        }
        if (parentTaskId !== undefined) {
            console.log(`[updateTask] id=${taskId} parentTaskId=${parentTaskId ?? "null (removing parent)"}`);
        }
        const task = await updateTask(taskId, {
            title,
            description,
            status,
            progress,
            priority,
            dueDate: dueDate === null ? undefined : dueDate ? new Date(dueDate) : undefined,
            assigneeIds,
            tags,
            attachments,
            parentTaskId,
            blockedByIds: blockingTaskIds,
        });
        // Audit log — fire-and-forget, never block the response
        (() => {
            const memberId = req.session.memberId;
            const assigneesBefore = (existingTask.assignees ?? []).map((a) => a.id).sort().join(",");
            const assigneesAfter = (task.assignees ?? []).map((a) => a.id).sort().join(",");
            const isNowDone = existingTask.status !== "DONE" && task.status === "DONE";
            const assigneesChanged = assigneesBefore !== assigneesAfter;
            if (isNowDone) {
                logAuditEvent({
                    taskId: taskId, memberId: memberId ?? null, source: "WEB",
                    eventType: "TASK_COMPLETED", payload: { taskTitle: task.title },
                }).catch(console.error);
            }
            else if (assigneesChanged && task.status === existingTask.status) {
                logAuditEvent({
                    taskId: taskId, memberId: memberId ?? null, source: "WEB",
                    eventType: "TASK_ASSIGNED",
                    payload: {
                        taskTitle: task.title,
                        assigneeNames: (task.assignees ?? []).map((a) => a.displayName),
                    },
                }).catch(console.error);
            }
            else {
                const WATCHED = ["status", "priority", "dueDate", "title", "description"];
                const changes = diffObjects(existingTask, task, WATCHED);
                if (changes.length > 0) {
                    logAuditEvent({
                        taskId: taskId, memberId: memberId ?? null, source: "WEB",
                        eventType: "TASK_UPDATED",
                        payload: { taskTitle: task.title, changes },
                    }).catch(console.error);
                }
            }
        })();
        // If task is linked to a milestone, refresh its health (fire-and-forget)
        if (task.milestoneId) {
            const { refreshMilestoneHealth } = await import("../services/milestoneService.js");
            refreshMilestoneHealth(task.milestoneId).catch(console.error);
        }
        res.json(task);
    }
    catch (error) {
        console.error("Update task error:", error);
        res.status(500).json({ error: "Failed to update task" });
    }
});
// ── GET /api/tasks/:id ──────────────────────────────────────
tasksRouter.get("/:id", async (req, res) => {
    try {
        const task = await getTask(req.params.id);
        if (!task) {
            res.status(404).json({ error: "Task not found" });
            return;
        }
        res.json(task);
    }
    catch (error) {
        console.error("Get task error:", error);
        res.status(500).json({ error: "Failed to get task" });
    }
});
// ── DELETE /api/tasks/:id ────────────────────────────────────
tasksRouter.delete("/:id", channelAuth, async (req, res) => {
    try {
        const taskId = req.params.id;
        const existingTask = await getTask(taskId);
        if (!existingTask) {
            res.status(404).json({ error: "Task not found" });
            return;
        }
        const memberId = req.session.memberId;
        await deleteTask(taskId);
        logAuditEvent({
            projectId: existingTask.projectId,
            memberId: memberId ?? null,
            source: "WEB",
            eventType: "TASK_DELETED",
            payload: { taskTitle: existingTask.title },
        }).catch(console.error);
        res.json({ ok: true });
    }
    catch (error) {
        console.error("Delete task error:", error);
        res.status(500).json({ error: "Failed to delete task" });
    }
});
// ── GET /api/tasks/:id/comments ──────────────────────────────
tasksRouter.get("/:id/comments", async (req, res) => {
    try {
        const taskId = req.params.id;
        const { prisma } = await import("../db/prisma.js");
        const comments = await prisma.taskComment.findMany({
            where: { taskId },
            include: { author: true },
            orderBy: { createdAt: "asc" },
        });
        res.json(comments);
    }
    catch (error) {
        console.error("Get comments error:", error);
        res.status(500).json({ error: "Failed to get comments" });
    }
});
// ── GET /api/tasks/:id/history ────────────────────────────────
tasksRouter.get("/:id/history", async (req, res) => {
    try {
        const taskId = req.params.id;
        const { prisma } = await import("../db/prisma.js");
        const activities = await prisma.activity.findMany({
            where: { entityId: taskId, entityType: "Task" },
            include: { member: true },
            orderBy: { createdAt: "desc" },
            take: 50,
        });
        // Normalize to the shape TaskModal expects: { actor, action, at }
        const history = activities.map(a => ({
            id: a.id,
            actor: a.member,
            action: a.type.toLowerCase().replace(/_/g, " "),
            at: a.createdAt,
            metadata: a.metadata,
        }));
        res.json(history);
    }
    catch (error) {
        console.error("Get history error:", error);
        res.status(500).json({ error: "Failed to get history" });
    }
});
// ── POST /api/tasks/:id/comments ─────────────────────────────
tasksRouter.post("/:id/comments", async (req, res) => {
    try {
        const taskId = req.params.id;
        const { content } = req.body;
        const memberId = req.session.memberId;
        if (!content) {
            res.status(400).json({ error: "Content is required" });
            return;
        }
        const { prisma } = await import("../db/prisma.js");
        const comment = await prisma.taskComment.create({
            data: {
                content,
                taskId,
                authorId: memberId,
            },
        });
        const populatedComment = await prisma.taskComment.findUnique({
            where: { id: comment.id },
            include: { author: true, task: { include: { project: true } } },
        });
        // Handle @mentions
        const mentionRegex = /@([a-zA-Z0-9_-]+)/g;
        const mentions = [...content.matchAll(mentionRegex)].map(m => m[1]);
        if (mentions.length > 0) {
            const mentionedMembers = await prisma.member.findMany({
                where: { slackHandle: { in: mentions } }
            });
            console.log(`[mentions] Found ${mentionedMembers.length} members matching handles: ${mentions.join(", ")}`);
            for (const m of mentionedMembers) {
                if (!m.slackId) {
                    console.log(`[mentions] Skipping member ${m.displayName}: no slackId`);
                    continue;
                }
                if (!populatedComment) {
                    console.log(`[mentions] Skipping member ${m.displayName}: populatedComment is null`);
                    continue;
                }
                try {
                    // Lazy import to avoid circular dependency at module load time
                    const { boltApp } = await import("../slack/bolt.js");
                    await boltApp.client.chat.postMessage({
                        channel: m.slackId,
                        text: `🔔 *${populatedComment.author.displayName}* mentioned you in a comment on task *${populatedComment.task.title}* (${populatedComment.task.project.name}):\n\n> ${content}\n\n<${process.env.FRONTEND_URL}/clubpm/projects/${populatedComment.task.projectId}|View Task>`
                    });
                    console.log(`[mentions] Sent DM to Slack user ${m.slackId} (${m.displayName})`);
                }
                catch (dmErr) {
                    console.error(`[mentions] Failed to DM ${m.slackId} (${m.displayName}):`, dmErr);
                }
            }
        }
        res.status(201).json(populatedComment || comment);
    }
    catch (error) {
        console.error("Create comment error:", error);
        res.status(500).json({ error: "Failed to create comment" });
    }
});
// ── GET /api/tasks/:id/subtasks ──────────────────────────────
tasksRouter.get("/:id/subtasks", async (req, res) => {
    try {
        const subtasks = await getSubtasks(req.params.id);
        res.json(subtasks);
    }
    catch (error) {
        console.error("Get subtasks error:", error);
        res.status(500).json({ error: "Failed to get subtasks" });
    }
});
// ── POST /api/tasks/:id/subtasks ─────────────────────────────
tasksRouter.post("/:id/subtasks", async (req, res) => {
    try {
        const { title, assigneeIds } = req.body;
        if (!title) {
            res.status(400).json({ error: "title is required" });
            return;
        }
        const subtask = await createSubtask(req.params.id, { title, assigneeIds });
        res.status(201).json(subtask);
    }
    catch (error) {
        console.error("Create subtask error:", error);
        res.status(500).json({ error: "Failed to create subtask" });
    }
});
// ── POST /api/tasks/:id/dependencies ─────────────────────────
tasksRouter.post("/:id/dependencies", async (req, res) => {
    try {
        const { blockedById } = req.body;
        if (!blockedById) {
            res.status(400).json({ error: "blockedById is required" });
            return;
        }
        const result = await addDependency(req.params.id, blockedById);
        res.json(result);
    }
    catch (error) {
        if (error.message?.includes("circular") || error.message?.includes("itself")) {
            res.status(400).json({ error: error.message });
            return;
        }
        console.error("Add dependency error:", error);
        res.status(500).json({ error: "Failed to add dependency" });
    }
});
// ── DELETE /api/tasks/:id/dependencies/:depId ────────────────
tasksRouter.delete("/:id/dependencies/:depId", async (req, res) => {
    try {
        const result = await removeDependency(req.params.id, req.params.depId);
        res.json(result);
    }
    catch (error) {
        console.error("Remove dependency error:", error);
        res.status(500).json({ error: "Failed to remove dependency" });
    }
});
// ── POST /api/tasks/:id/time-logs ────────────────────────────
tasksRouter.post("/:id/time-logs", async (req, res) => {
    try {
        const taskId = req.params.id;
        const memberId = req.session.memberId;
        const { minutes, note } = req.body;
        if (!minutes || typeof minutes !== "number" || minutes <= 0) {
            res.status(400).json({ error: "minutes must be a positive number" });
            return;
        }
        const log = await logTime(taskId, memberId, minutes, note);
        res.status(201).json(log);
    }
    catch (error) {
        console.error("Log time error:", error);
        res.status(500).json({ error: "Failed to log time" });
    }
});
// ── GET /api/tasks/:id/time-logs ─────────────────────────────
tasksRouter.get("/:id/time-logs", async (req, res) => {
    try {
        const taskId = req.params.id;
        const { prisma } = await import("../db/prisma.js");
        const timeLogs = await prisma.timeLog.findMany({
            where: { taskId },
            include: { member: { select: { id: true, displayName: true } } },
            orderBy: { loggedAt: "desc" },
        });
        const totalMinutes = timeLogs.reduce((sum, l) => sum + l.minutes, 0);
        res.json({ timeLogs, totalMinutes });
    }
    catch (error) {
        console.error("Get time logs error:", error);
        res.status(500).json({ error: "Failed to get time logs" });
    }
});
// ── POST /api/tasks/:id/ai-enrich ───────────────────────────
tasksRouter.post("/:id/ai-enrich", async (req, res) => {
    try {
        const taskId = req.params.id;
        const { projectType } = req.body;
        const task = await getTask(taskId);
        if (!task) {
            res.status(404).json({ error: "Task not found" });
            return;
        }
        const enriched = await generateJson(enrichTaskPrompt(task.title, task.description ?? "", projectType ?? "engineering"));
        if (!enriched) {
            res.status(500).json({ error: "AI enrichment failed" });
            return;
        }
        const updated = await updateTask(taskId, { description: enriched.description });
        res.json({ ...updated, ...enriched });
    }
    catch (error) {
        console.error("AI enrich error:", error);
        res.status(500).json({ error: "Failed to enrich task" });
    }
});
// ── POST /api/tasks/:id/suggest-deadline ────────────────────
tasksRouter.post("/:id/suggest-deadline", async (req, res) => {
    try {
        const taskId = req.params.id;
        const { sprintDays: _sprintDays } = req.body;
        const task = await getTask(taskId);
        if (!task) {
            res.status(404).json({ error: "Task not found" });
            return;
        }
        const project = await prismaClient.project.findUnique({
            where: { id: task.projectId },
            select: { targetDate: true },
        });
        const fourWeeksAgo = new Date();
        fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);
        const timeLogs = await prismaClient.timeLog.findMany({
            where: {
                task: { projectId: task.projectId },
                loggedAt: { gte: fourWeeksAgo },
            },
            select: { minutes: true },
        });
        const totalMinutes = timeLogs.reduce((sum, l) => sum + l.minutes, 0);
        // Approximate velocity: total hours logged over 4 weeks → points per week (rough proxy)
        const velocity = totalMinutes > 0 ? Math.round(totalMinutes / (4 * 60)) : 10;
        const today = new Date().toISOString().split("T")[0];
        const result = await generateJson(deadlineSuggestionPrompt(task.title, task.description ?? "", task.storyPoints ?? null, velocity, project?.targetDate?.toISOString().split("T")[0] ?? null, today));
        if (!result) {
            res.status(500).json({ error: "AI deadline suggestion failed" });
            return;
        }
        res.json(result);
    }
    catch (error) {
        console.error("Suggest deadline error:", error);
        res.status(500).json({ error: "Failed to suggest deadline" });
    }
});
//# sourceMappingURL=tasks.js.map