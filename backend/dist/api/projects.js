import { Router } from "express";
import { requireAuth } from "./auth.js";
import { channelAuth } from "../middleware/channelAuth.js";
import { prisma } from "../db/prisma.js";
import { getProject, createProject, updateProject, getProjectsWithTaskStats, getChannelMemberSlackIds, } from "../services/projectService.js";
import { getTasksForProject, createTask, } from "../services/taskService.js";
import { logAuditEvent, diffObjects, getProjectAuditLog } from "../services/activityService.js";
import { fetchDriveFileAsText, extractFileId } from "../services/driveService.js";
import { generateJsonFromDocument, generateText } from "../services/geminiService.js";
import { driveToTasksPrompt, meetingNotesToTasksPrompt, projectQaPrompt, } from "../utils/aiPrompts.js";
import { analyzeProjectRisks, generateSprintPlan, generateProjectBrief, inferTaskDependencies, analyzeTeamCapacity, generateStakeholderEmail, } from "../services/projectAnalysisService.js";
export const projectsRouter = Router();
// All routes require authentication
projectsRouter.use(requireAuth);
// ── GET /api/projects ────────────────────────────────────────
projectsRouter.get("/", async (_req, res) => {
    try {
        const projects = await getProjectsWithTaskStats();
        res.json(projects);
    }
    catch (error) {
        console.error("List projects error:", error);
        res.status(500).json({ error: "Failed to list projects" });
    }
});
// ── POST /api/projects ───────────────────────────────────────
projectsRouter.post("/", async (req, res) => {
    try {
        const memberId = req.session.memberId;
        const actor = await prisma.member.findUnique({ where: { id: memberId }, select: { isAdmin: true } });
        if (!actor?.isAdmin) {
            res.status(403).json({ error: "Admin only" });
            return;
        }
        const { name, description, driveLink, slackChannel, type, startDate, targetDate } = req.body;
        if (!name || !type) {
            res.status(400).json({ error: "name and type are required" });
            return;
        }
        if (!driveLink) {
            res.status(400).json({ error: "driveLink is required" });
            return;
        }
        const project = await createProject({
            name,
            description,
            driveLink,
            slackChannel,
            type,
            startDate: startDate ? new Date(startDate) : undefined,
            targetDate: targetDate ? new Date(targetDate) : undefined,
        });
        logAuditEvent({
            projectId: project.id,
            memberId: memberId ?? null,
            source: "WEB",
            eventType: "PROJECT_CREATED",
            payload: { projectName: project.name },
        }).catch(console.error);
        res.status(201).json(project);
    }
    catch (error) {
        console.error("Create project error:", error);
        res.status(500).json({ error: "Failed to create project" });
    }
});
// ── GET /api/projects/:id ────────────────────────────────────
projectsRouter.get("/:id", async (req, res) => {
    try {
        const projectId = req.params.id;
        const project = await getProject(projectId);
        if (!project) {
            res.status(404).json({ error: "Project not found" });
            return;
        }
        let channelMemberSlackIds = [];
        if (project.slackChannelId) {
            try {
                channelMemberSlackIds = await getChannelMemberSlackIds(project.slackChannelId);
            }
            catch {
                // Slack API unavailable — degrade gracefully
            }
        }
        res.json({ ...project, channelMemberSlackIds });
    }
    catch (error) {
        console.error("Get project error:", error);
        res.status(500).json({ error: "Failed to get project" });
    }
});
// ── PATCH /api/projects/:id ──────────────────────────────────
projectsRouter.patch("/:id", channelAuth, async (req, res) => {
    try {
        const projectId = req.params.id;
        const { name, description, driveLink, slackChannel, slackChannelId, slackChannelName, status, startDate, targetDate } = req.body;
        const before = await getProject(projectId);
        const project = await updateProject(projectId, {
            name,
            description,
            driveLink,
            slackChannel,
            slackChannelId,
            slackChannelName,
            status,
            startDate: startDate ? new Date(startDate) : undefined,
            targetDate: targetDate ? new Date(targetDate) : undefined,
        });
        if (before) {
            const WATCHED_PROJECT_FIELDS = ["name", "status", "description", "type", "targetDate"];
            const changes = diffObjects(before, project, WATCHED_PROJECT_FIELDS);
            if (changes.length > 0) {
                const memberId = req.session.memberId;
                logAuditEvent({
                    projectId,
                    memberId: memberId ?? null,
                    source: "WEB",
                    eventType: "PROJECT_UPDATED",
                    payload: { changes },
                }).catch(console.error);
            }
        }
        res.json(project);
    }
    catch (error) {
        console.error("Update project error:", error);
        res.status(500).json({ error: "Failed to update project" });
    }
});
// ── GET /api/projects/:id/activity ──────────────────────────
projectsRouter.get("/:id/activity", async (req, res) => {
    try {
        const projectId = req.params.id;
        const cursor = req.query.cursor;
        const limit = Number(req.query.limit) || 50;
        const eventType = req.query.eventType;
        const result = await getProjectAuditLog(projectId, cursor, limit, eventType);
        res.json(result);
    }
    catch (error) {
        console.error("Get project activity error:", error);
        res.status(500).json({ error: "Failed to get project activity" });
    }
});
// ── GET /api/projects/:id/tasks ──────────────────────────────
projectsRouter.get("/:id/tasks", async (req, res) => {
    try {
        const projectId = req.params.id;
        const { status, assigneeId } = req.query;
        const tasks = await getTasksForProject(projectId, {
            status,
            assigneeId,
        });
        res.json(tasks);
    }
    catch (error) {
        console.error("Get project tasks error:", error);
        res.status(500).json({ error: "Failed to get tasks" });
    }
});
// ── POST /api/projects/:id/tasks ─────────────────────────────
projectsRouter.post("/:id/tasks", async (req, res) => {
    try {
        const projectId = req.params.id;
        const { title, description, priority, dueDate, assigneeIds, parentTaskId, status, milestoneId, tagIds } = req.body;
        if (!title) {
            res.status(400).json({ error: "title is required" });
            return;
        }
        console.log(`[createTask] projectId=${projectId} title="${title}" parentTaskId=${parentTaskId ?? "none"} status=${status ?? "default"}`);
        const task = await createTask({
            title,
            description,
            priority,
            dueDate: dueDate ? new Date(dueDate) : undefined,
            projectId,
            assigneeIds,
            parentTaskId,
            status,
            milestoneId: milestoneId ?? undefined,
            tagIds,
        });
        console.log(`[createTask] created id=${task.id} parentTaskId=${task.parentTaskId ?? "none"}`);
        // If task is linked to a milestone, refresh its health (fire-and-forget)
        if (milestoneId) {
            const { refreshMilestoneHealth } = await import("../services/milestoneService.js");
            refreshMilestoneHealth(milestoneId).catch(console.error);
        }
        const memberId = req.session.memberId;
        logAuditEvent({
            projectId,
            taskId: task.id,
            memberId: memberId ?? null,
            source: "WEB",
            eventType: "TASK_CREATED",
            payload: {
                taskTitle: task.title,
                priority: task.priority,
                assigneeNames: task.assignees?.map((a) => a.displayName) ?? [],
            },
        }).catch(console.error);
        res.status(201).json(task);
    }
    catch (error) {
        console.error("Create task error:", error);
        res.status(500).json({ error: "Failed to create task" });
    }
});
// ── GET /api/projects/:id/tags ───────────────────────────────
projectsRouter.get("/:id/tags", async (req, res) => {
    try {
        const tags = await prisma.tag.findMany({ where: { projectId: req.params.id } });
        res.json(tags);
    }
    catch (error) {
        console.error("Get tags error:", error);
        res.status(500).json({ error: "Failed to get tags" });
    }
});
// ── POST /api/projects/:id/tags ──────────────────────────────
projectsRouter.post("/:id/tags", async (req, res) => {
    try {
        const memberId = req.session.memberId;
        const actor = await prisma.member.findUnique({ where: { id: memberId }, select: { isAdmin: true } });
        if (!actor?.isAdmin) {
            res.status(403).json({ error: "Admin only" });
            return;
        }
        const { name, color } = req.body;
        if (!name) {
            res.status(400).json({ error: "name is required" });
            return;
        }
        const tag = await prisma.tag.create({
            data: { name, color: color ?? "#6c5ce7", projectId: req.params.id },
        });
        res.status(201).json(tag);
    }
    catch (error) {
        console.error("Create tag error:", error);
        res.status(500).json({ error: "Failed to create tag" });
    }
});
// ── POST /api/projects/:id/updates ──────────────────────────
projectsRouter.post("/:id/updates", async (req, res) => {
    try {
        const memberId = req.session.memberId;
        const { content } = req.body;
        if (!content) {
            res.status(400).json({ error: "content is required" });
            return;
        }
        const update = await prisma.projectUpdate.create({
            data: { projectId: req.params.id, authorId: memberId, content },
            include: { author: { select: { displayName: true, avatarUrl: true } } },
        });
        res.status(201).json(update);
    }
    catch (error) {
        console.error("Create project update error:", error);
        res.status(500).json({ error: "Failed to create project update" });
    }
});
// ── POST /api/projects/:id/parse-drive ──────────────────────
projectsRouter.post("/:id/parse-drive", async (req, res) => {
    try {
        const projectId = req.params.id;
        const { driveUrl, suggestedTaskCount } = req.body;
        const fileId = extractFileId(driveUrl);
        if (!fileId) {
            res.status(400).json({ error: "Invalid or unrecognized Google Drive URL" });
            return;
        }
        if (/\/folders\//.test(driveUrl)) {
            res.status(400).json({ error: "Please paste a link to a specific file (Google Doc, Sheet, or Slides), not a Drive folder." });
            return;
        }
        const fileResult = await fetchDriveFileAsText(fileId);
        if (!fileResult) {
            res.status(400).json({ error: "Could not read the file from Google Drive. Make sure it exists and has been shared with the service account." });
            return;
        }
        const project = await getProject(projectId);
        if (!project) {
            res.status(404).json({ error: "Project not found" });
            return;
        }
        const existingTasks = await prisma.task.findMany({
            where: { projectId, status: { not: "DONE" } },
            select: { title: true },
        });
        const existingTaskTitles = existingTasks.map(t => t.title);
        const today = new Date().toISOString().split("T")[0];
        const result = await generateJsonFromDocument(fileResult.text, driveToTasksPrompt(project.name, project.description ?? "", existingTaskTitles, today, suggestedTaskCount));
        res.json({ tasks: result?.tasks ?? [], sourceFileName: fileResult.name });
    }
    catch (error) {
        console.error("Parse drive error:", error);
        res.status(500).json({ error: "Failed to parse Drive file" });
    }
});
// ── POST /api/projects/:id/parse-drive/confirm ───────────────
projectsRouter.post("/:id/parse-drive/confirm", async (req, res) => {
    try {
        const projectId = req.params.id;
        const { tasks } = req.body;
        if (!Array.isArray(tasks) || tasks.length === 0) {
            res.status(400).json({ error: "tasks array is required" });
            return;
        }
        const projectMembers = await prisma.projectMember.findMany({
            where: { projectId },
            include: { member: true },
        });
        let created = 0;
        for (const t of tasks) {
            let assigneeId;
            if (t.suggestedAssigneeName) {
                const nameLower = t.suggestedAssigneeName.toLowerCase();
                const match = projectMembers.find(pm => pm.member.displayName.toLowerCase().includes(nameLower) ||
                    nameLower.includes(pm.member.displayName.toLowerCase()));
                if (match)
                    assigneeId = match.member.id;
            }
            await createTask({
                title: t.title,
                description: t.description,
                priority: t.priority,
                dueDate: t.dueDate ? new Date(t.dueDate) : undefined,
                projectId,
                assigneeIds: assigneeId ? [assigneeId] : [],
            });
            created++;
        }
        res.json({ created });
    }
    catch (error) {
        console.error("Parse drive confirm error:", error);
        res.status(500).json({ error: "Failed to create tasks from Drive file" });
    }
});
// ── POST /api/projects/:id/parse-meeting-notes ───────────────
projectsRouter.post("/:id/parse-meeting-notes", async (req, res) => {
    try {
        const projectId = req.params.id;
        const { notes, attendees, suggestedTaskCount } = req.body;
        if (!notes) {
            res.status(400).json({ error: "notes is required" });
            return;
        }
        const project = await getProject(projectId);
        if (!project) {
            res.status(404).json({ error: "Project not found" });
            return;
        }
        const today = new Date().toISOString().split("T")[0];
        const result = await generateJsonFromDocument(notes, meetingNotesToTasksPrompt(project.name, attendees ?? [], today, suggestedTaskCount));
        res.json(result);
    }
    catch (error) {
        console.error("Parse meeting notes error:", error);
        res.status(500).json({ error: "Failed to parse meeting notes" });
    }
});
// ── POST /api/projects/:id/ai-risks ─────────────────────────
projectsRouter.post("/:id/ai-risks", async (req, res) => {
    try {
        const projectId = req.params.id;
        const result = await analyzeProjectRisks(projectId);
        if (!result) {
            res.status(404).json({ error: "Project not found or analysis failed" });
            return;
        }
        res.json(result);
    }
    catch (error) {
        console.error("AI risks error:", error);
        res.status(500).json({ error: "Failed to analyze project risks" });
    }
});
// ── POST /api/projects/:id/sprint-plan ──────────────────────
projectsRouter.post("/:id/sprint-plan", async (req, res) => {
    try {
        const projectId = req.params.id;
        const { capacityPoints, sprintDays } = req.body;
        const result = await generateSprintPlan(projectId, capacityPoints, sprintDays);
        if (!result) {
            res.status(404).json({ error: "Project not found or planning failed" });
            return;
        }
        res.json(result);
    }
    catch (error) {
        console.error("Sprint plan error:", error);
        res.status(500).json({ error: "Failed to generate sprint plan" });
    }
});
// ── POST /api/projects/:id/generate-brief ───────────────────
projectsRouter.post("/:id/generate-brief", async (req, res) => {
    try {
        const projectId = req.params.id;
        const result = await generateProjectBrief(projectId);
        if (!result) {
            res.status(404).json({ error: "Project not found or brief generation failed" });
            return;
        }
        res.json(result);
    }
    catch (error) {
        console.error("Generate brief error:", error);
        res.status(500).json({ error: "Failed to generate project brief" });
    }
});
// ── POST /api/projects/:id/infer-dependencies ───────────────
projectsRouter.post("/:id/infer-dependencies", async (req, res) => {
    try {
        const projectId = req.params.id;
        const result = await inferTaskDependencies(projectId);
        if (!result) {
            res.status(404).json({ error: "Project not found or inference failed" });
            return;
        }
        res.json(result);
    }
    catch (error) {
        console.error("Infer dependencies error:", error);
        res.status(500).json({ error: "Failed to infer task dependencies" });
    }
});
// ── POST /api/projects/:id/capacity-analysis ────────────────
projectsRouter.post("/:id/capacity-analysis", async (req, res) => {
    try {
        const projectId = req.params.id;
        const result = await analyzeTeamCapacity(projectId);
        if (!result) {
            res.status(404).json({ error: "Project not found or analysis failed" });
            return;
        }
        res.json(result);
    }
    catch (error) {
        console.error("Capacity analysis error:", error);
        res.status(500).json({ error: "Failed to analyze team capacity" });
    }
});
// ── POST /api/projects/:id/stakeholder-email ────────────────
projectsRouter.post("/:id/stakeholder-email", async (req, res) => {
    try {
        const projectId = req.params.id;
        const result = await generateStakeholderEmail(projectId);
        if (!result) {
            res.status(404).json({ error: "Project not found or email generation failed" });
            return;
        }
        res.json(result);
    }
    catch (error) {
        console.error("Stakeholder email error:", error);
        res.status(500).json({ error: "Failed to generate stakeholder email" });
    }
});
// ── POST /api/projects/:id/ask ───────────────────────────────
projectsRouter.post("/:id/ask", async (req, res) => {
    try {
        const projectId = req.params.id;
        const { question } = req.body;
        if (!question) {
            res.status(400).json({ error: "question is required" });
            return;
        }
        const { getMilestonesForProject } = await import("../services/milestoneService.js");
        const [project, milestonesRaw] = await Promise.all([
            prisma.project.findUnique({
                where: { id: projectId },
                include: {
                    tasks: { include: { assignees: { select: { displayName: true } } } },
                    members: { include: { member: { select: { displayName: true } } } },
                    updates: { orderBy: { postedAt: "desc" }, take: 5 },
                },
            }),
            getMilestonesForProject(projectId),
        ]);
        if (!project) {
            res.status(404).json({ error: "Project not found" });
            return;
        }
        const tasksArr = project.tasks.map(t => ({
            title: t.title,
            status: t.status,
            priority: t.priority,
            assignees: t.assignees.map((a) => a.displayName),
            dueDate: t.dueDate?.toISOString().split("T")[0] ?? null,
        }));
        const memberNames = project.members.map((pm) => pm.member.displayName);
        const milestonesArr = milestonesRaw.map((m) => ({
            title: m.title,
            status: m.status,
            targetDate: m.dueDate?.toISOString().split("T")[0] ?? null,
        }));
        const recentUpdates = project.updates.map(u => u.content.slice(0, 150));
        const projectObj = {
            name: project.name,
            description: project.description,
            type: project.type,
            targetDate: project.targetDate?.toISOString().split("T")[0] ?? null,
        };
        const answer = await generateText(projectQaPrompt(question, projectObj, tasksArr, memberNames, milestonesArr, recentUpdates));
        res.json({ answer });
    }
    catch (error) {
        console.error("Project ask error:", error);
        res.status(500).json({ error: "Failed to answer question" });
    }
});
// ── Tags router (for DELETE /api/tags/:tagId) ────────────────
export const tagsRouter = Router();
tagsRouter.use(requireAuth);
tagsRouter.delete("/:tagId", async (req, res) => {
    try {
        const memberId = req.session.memberId;
        const actor = await prisma.member.findUnique({ where: { id: memberId }, select: { isAdmin: true } });
        if (!actor?.isAdmin) {
            res.status(403).json({ error: "Admin only" });
            return;
        }
        await prisma.tag.delete({ where: { id: req.params.tagId } });
        res.json({ ok: true });
    }
    catch (error) {
        console.error("Delete tag error:", error);
        res.status(500).json({ error: "Failed to delete tag" });
    }
});
//# sourceMappingURL=projects.js.map