import { Router, type Request, type Response } from "express";
import { requireAuth } from "./auth.js";
import { channelAuth } from "../middleware/channelAuth.js";
import { prisma } from "../db/prisma.js";
import {
  getProject,
  createProject,
  updateProject,
  getProjectsWithTaskStats,
  getChannelMemberSlackIds,
  syncProjectMembersFromChannel,
} from "../services/projectService.js";
import {
  getTasksForProject,
  createTask,
} from "../services/taskService.js";
import { logAuditEvent, diffObjects, getProjectAuditLog } from "../services/activityService.js";
import type { ProjectType, ProjectStatus, TaskStatus, Priority, ActivityEventType, NotificationType } from "@prisma/client";
import { createNotification } from "../services/notificationCrud.js";
import { queueDm } from "../services/dmBatcher.js";
import { fetchDriveFileAsText, extractFileId, listDriveFolderFiles, getDriveFileMeta } from "../services/driveService.js";
import { runJson, runText, todayContext } from "../services/ai/aiRouter.js";
import {
  driveToTasksPrompt, meetingNotesToTasksPrompt, projectContextPrompt,
} from "../utils/aiPrompts.js";
import { buildProjectContext } from "../services/projectContextService.js";
import { suggestProjectActions, executeActionPlan, buildPlanPrompt, type ActionPlanAction } from "../services/aiActionService.js";
import {
  analyzeProjectRisks, generateSprintPlan, generateProjectBrief,
  inferTaskDependencies, analyzeTeamCapacity, generateStakeholderEmail,
} from "../services/projectAnalysisService.js";
import { ensureTrainingProject } from "../services/trainingSandboxService.js";

export const projectsRouter = Router();

// All routes require authentication
projectsRouter.use(requireAuth);

// ── GET /api/projects ────────────────────────────────────────

projectsRouter.get("/", async (_req: Request, res: Response) => {
  try {
    const projects = await getProjectsWithTaskStats();
    res.json(projects);
  } catch (error) {
    console.error("List projects error:", error);
    res.status(500).json({ error: "Failed to list projects" });
  }
});

// ── POST /api/projects ───────────────────────────────────────

projectsRouter.post("/", async (req: Request, res: Response) => {
  try {
    const memberId = req.memberId!;
    const actor = await prisma.member.findUnique({ where: { id: memberId }, select: { isAdmin: true } });
    if (!actor?.isAdmin) {
      res.status(403).json({ error: "Admin only" });
      return;
    }

    const { name, description, driveLink, slackChannel, type, startDate, targetDate } =
      req.body as {
        name: string;
        description?: string;
        driveLink?: string;
        slackChannel?: string;
        type: ProjectType;
        startDate?: string;
        targetDate?: string;
      };

    if (!name || !type) {
      res.status(400).json({ error: "name and type are required" });
      return;
    }

    // driveLink is optional at creation — an admin links the human-managed Files
    // folder later; the vault provisions its own bot-owned folder on first use
    // (see ensureVaultFolder).

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
      memberId:  memberId ?? null,
      source:    "WEB",
      eventType: "PROJECT_CREATED",
      payload:   { projectName: project.name },
    }).catch(console.error);

    res.status(201).json(project);
  } catch (error) {
    console.error("Create project error:", error);
    res.status(500).json({ error: "Failed to create project" });
  }
});

// ── GET /api/projects/:id ────────────────────────────────────

projectsRouter.get("/:id", async (req: Request, res: Response) => {
  try {
    const projectId = req.params.id as string;

    // Opportunistic channel-member sync (60s per-project debounce, no-op if
    // channel isn't linked). Done BEFORE getProject so members reflect the sync.
    await syncProjectMembersFromChannel(projectId).catch(err =>
      console.warn("syncProjectMembersFromChannel failed:", err)
    );

    const project = await getProject(projectId);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    let channelMemberSlackIds: string[] = [];
    if (project.slackChannelId) {
      try {
        channelMemberSlackIds = await getChannelMemberSlackIds(project.slackChannelId);
      } catch {
        // Slack API unavailable — degrade gracefully
      }
    }

    res.json({ ...project, channelMemberSlackIds });
  } catch (error) {
    console.error("Get project error:", error);
    res.status(500).json({ error: "Failed to get project" });
  }
});

// ── PATCH /api/projects/:id ──────────────────────────────────

projectsRouter.patch("/:id", channelAuth, async (req: Request, res: Response) => {
  try {
    const projectId = req.params.id as string;
    const { name, description, driveLink, githubRepo, githubInstallId, githubBlockDoneOnCiFail, slackChannel, slackChannelId, slackChannelName, status, startDate, targetDate } =
      req.body as {
        name?: string;
        description?: string;
        driveLink?: string | null;
        githubRepo?: string | null;
        githubInstallId?: number | null;
        githubBlockDoneOnCiFail?: boolean;
        slackChannel?: string;
        slackChannelId?: string | null;
        slackChannelName?: string | null;
        status?: ProjectStatus;
        startDate?: string;
        targetDate?: string;
      };

    const before = await getProject(projectId);

    const mutatorId = req.memberId as string | undefined;
    const actor = mutatorId
      ? await prisma.member.findUnique({ where: { id: mutatorId }, select: { isAdmin: true } })
      : null;

    // Admin gate: description and Drive folder are admin-only fields
    if (description !== undefined && (before?.description ?? null) !== (description ?? null)) {
      if (!actor?.isAdmin) {
        res.status(403).json({ error: "Only admins can edit the project description" });
        return;
      }
    }
    if (driveLink !== undefined && (before?.driveLink ?? null) !== (driveLink ?? null)) {
      if (!actor?.isAdmin) {
        res.status(403).json({ error: "Only admins can change the channel's Drive folder" });
        return;
      }
    }
    if (githubRepo !== undefined && ((before as any)?.githubRepo ?? null) !== (githubRepo ?? null)) {
      if (!actor?.isAdmin) {
        res.status(403).json({ error: "Only admins can change the project's GitHub repo" });
        return;
      }
    }

    const project = await updateProject(projectId, {
      name,
      description,
      driveLink: driveLink === undefined ? undefined : (driveLink ?? null),
      githubRepo: githubRepo === undefined ? undefined : (githubRepo ?? null),
      githubInstallId: githubInstallId === undefined ? undefined : (githubInstallId ?? null),
      githubBlockDoneOnCiFail,
      slackChannel,
      slackChannelId,
      slackChannelName,
      status,
      startDate: startDate ? new Date(startDate) : undefined,
      targetDate: targetDate ? new Date(targetDate) : undefined,
    });

    if (before) {
      const WATCHED_PROJECT_FIELDS = ["name", "status", "description", "type", "targetDate", "driveLink", "githubRepo"];
      const changes = diffObjects(before as any, project as any, WATCHED_PROJECT_FIELDS);
      if (changes.length > 0) {
        const memberId = req.memberId;
        logAuditEvent({
          projectId,
          memberId:  memberId ?? null,
          source:    "WEB",
          eventType: "PROJECT_UPDATED",
          payload:   { changes },
        }).catch(console.error);
      }
    }

    // If the linked Slack channel was set or changed, force a member sync.
    const channelChanged =
      slackChannelId !== undefined &&
      (before?.slackChannelId ?? null) !== (project.slackChannelId ?? null);
    if (channelChanged && project.slackChannelId) {
      syncProjectMembersFromChannel(projectId, { force: true }).catch(err =>
        console.warn("syncProjectMembersFromChannel after PATCH failed:", err)
      );
    }

    res.json(project);
  } catch (error) {
    console.error("Update project error:", error);
    res.status(500).json({ error: "Failed to update project" });
  }
});

// ── GET /api/projects/:id/activity ──────────────────────────

projectsRouter.get("/:id/activity", async (req: Request, res: Response) => {
  try {
    const projectId = req.params.id as string;
    const cursor    = req.query.cursor as string | undefined;
    const limit     = Number(req.query.limit) || 50;
    const eventType = req.query.eventType as ActivityEventType | undefined;

    const result = await getProjectAuditLog(projectId, cursor, limit, eventType);
    res.json(result);
  } catch (error) {
    console.error("Get project activity error:", error);
    res.status(500).json({ error: "Failed to get project activity" });
  }
});

// ── GET /api/projects/:id/tasks ──────────────────────────────

projectsRouter.get("/:id/tasks", async (req: Request, res: Response) => {
  try {
    const projectId = req.params.id as string;
    const { status, assigneeId, archived } = req.query as {
      status?: TaskStatus;
      assigneeId?: string;
      archived?: string;
    };

    const tasks = await getTasksForProject(
      projectId,
      { status, assigneeId },
      archived === "1" || archived === "true" ? { archivedOnly: true } : {}
    );

    res.json(tasks);
  } catch (error) {
    console.error("Get project tasks error:", error);
    res.status(500).json({ error: "Failed to get tasks" });
  }
});

// ── POST /api/projects/:id/tasks ─────────────────────────────

projectsRouter.post("/:id/tasks", async (req: Request, res: Response) => {
  try {
    const projectId = req.params.id as string;
    const { title, description, priority, dueDate, assigneeIds, parentTaskId, status, milestoneId, tagIds } = req.body as {
      title: string;
      description?: string;
      priority?: Priority;
      dueDate?: string;
      assigneeIds?: string[];
      parentTaskId?: string;
      status?: TaskStatus;
      milestoneId?: string;
      tagIds?: string[];
    };

    if (!title) {
      res.status(400).json({ error: "title is required" });
      return;
    }

    console.log(`[createTask] projectId=${projectId} title="${title}" parentTaskId=${parentTaskId ?? "none"} status=${status ?? "default"}`);

    const memberId = req.memberId;
    console.log(`[createTask req] projectId=${projectId} dueDate=${JSON.stringify(dueDate)} actor=${memberId} ua="${(req.headers["user-agent"] ?? "").slice(0, 80)}"`);

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
      createdById: memberId,
    });

    console.log(`[createTask] created id=${task.id} parentTaskId=${(task as any).parentTaskId ?? "none"}`);

    // If task is linked to a milestone, refresh its health (fire-and-forget)
    if (milestoneId) {
      const { refreshMilestoneHealth } = await import("../services/milestoneService.js");
      refreshMilestoneHealth(milestoneId).catch(console.error);
    }

    logAuditEvent({
      projectId,
      taskId:   task.id,
      memberId: memberId ?? null,
      source:   "WEB",
      eventType: "TASK_CREATED",
      payload: {
        taskTitle:     task.title,
        priority:      task.priority,
        assigneeNames: (task as any).assignees?.map((a: any) => a.displayName) ?? [],
      },
    }).catch(console.error);

    res.status(201).json(task);
  } catch (error: any) {
    const msg: string = error?.message ?? "";
    if (msg.startsWith("Invalid ") || msg.includes("year out of range")) {
      res.status(400).json({ error: msg });
      return;
    }
    console.error("Create task error:", error);
    res.status(500).json({ error: "Failed to create task" });
  }
});

// ── GET /api/projects/:id/tags ───────────────────────────────

projectsRouter.get("/:id/tags", async (req: Request, res: Response) => {
  try {
    const tags = await prisma.tag.findMany({ where: { projectId: req.params.id as string } });
    res.json(tags);
  } catch (error) {
    console.error("Get tags error:", error);
    res.status(500).json({ error: "Failed to get tags" });
  }
});

// ── POST /api/projects/:id/tags ──────────────────────────────

projectsRouter.post("/:id/tags", async (req: Request, res: Response) => {
  try {
    const memberId = req.memberId!;
    const actor = await prisma.member.findUnique({ where: { id: memberId }, select: { isAdmin: true } });
    if (!actor?.isAdmin) {
      res.status(403).json({ error: "Admin only" });
      return;
    }
    const { name, color } = req.body as { name: string; color?: string };
    if (!name) {
      res.status(400).json({ error: "name is required" });
      return;
    }
    const tag = await prisma.tag.create({
      data: { name, color: color ?? "#6c5ce7", projectId: req.params.id as string },
    });
    res.status(201).json(tag);
  } catch (error) {
    console.error("Create tag error:", error);
    res.status(500).json({ error: "Failed to create tag" });
  }
});

// ── POST /api/projects/:id/updates ──────────────────────────

projectsRouter.post("/:id/updates", async (req: Request, res: Response) => {
  try {
    const memberId = req.memberId!;
    const { content } = req.body as { content: string };
    if (!content) {
      res.status(400).json({ error: "content is required" });
      return;
    }
    const projectId = req.params.id as string;
    const update = await prisma.projectUpdate.create({
      data: { projectId, authorId: memberId, content },
      include: { author: { select: { displayName: true, avatarUrl: true } } },
    });

    // Notify all project members of the update (except author) — fire-and-forget
    (() => {
      const actorId = memberId;
      return (async () => {
        const projectWithMembers = await prisma.project.findUnique({
          where: { id: projectId },
          select: {
            name: true,
            members: { include: { member: { select: { id: true, slackId: true } } } },
          },
        });
        if (!projectWithMembers) return;

        for (const pm of projectWithMembers.members) {
          const recipient = pm.member;
          if (recipient.id === actorId) continue;
          await createNotification({
            type: "PROJECT_UPDATE" as NotificationType,
            recipientId: recipient.id,
            actorId,
            projectId,
            message: `New update in project ${projectWithMembers.name}: ${content.slice(0, 100)}`,
          });
          if (recipient.slackId) queueDm(recipient.slackId, `📢 New update in *${projectWithMembers.name}*:\n> ${content.slice(0, 200)}`);
        }
      })();
    })().catch(console.error);

    res.status(201).json(update);
  } catch (error) {
    console.error("Create project update error:", error);
    res.status(500).json({ error: "Failed to create project update" });
  }
});

// ── GET /api/projects/:id/drive-files ────────────────────────
//
// View-only listing of the project's *linked* Drive folder (`project.driveLink`,
// the human-managed folder an admin linked in the project UI). It never
// provisions a folder or mutates driveLink. Returns
// { folderId, folderName, folderWebViewLink, files, notFolder, noLink } so the
// frontend can render a link-out, a "no folder linked" empty state, or a "linked
// item is a single file, not a folder" empty state.
//
// Under the bot's drive.file scope the bot can only see folders it created, so
// `files` is typically empty for an admin-owned folder — the folder link is the
// source of truth and members open it in Drive to browse.

projectsRouter.get("/:id/drive-files", async (req: Request, res: Response) => {
  try {
    const projectId = req.params.id as string;
    const project = await getProject(projectId);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    const driveLink = project.driveLink ?? null;
    if (!driveLink) {
      res.json({ folderId: null, folderName: null, folderWebViewLink: null, files: [], notFolder: false, noLink: true });
      return;
    }

    if (!/\/folders\//.test(driveLink)) {
      // A linked file/doc rather than a folder — nothing to browse.
      res.json({ folderId: extractFileId(driveLink), folderName: null, folderWebViewLink: driveLink, files: [], notFolder: true, noLink: false });
      return;
    }

    const folderId = extractFileId(driveLink);
    if (!folderId) {
      res.json({ folderId: null, folderName: null, folderWebViewLink: driveLink, files: [], notFolder: true, noLink: false });
      return;
    }

    // Best-effort: under drive.file these return null/[] for folders the bot
    // didn't create; the frontend falls back to the raw driveLink.
    const [folderMeta, files] = await Promise.all([
      getDriveFileMeta(folderId),
      listDriveFolderFiles(folderId),
    ]);

    res.json({
      folderId,
      folderName: folderMeta?.name ?? null,
      folderWebViewLink: folderMeta?.webViewLink ?? driveLink,
      files,
      notFolder: false,
      noLink: false,
    });
  } catch (error) {
    console.error("List drive files error:", error);
    res.status(500).json({ error: "Failed to list Drive files" });
  }
});

// ── POST /api/projects/:id/parse-drive ──────────────────────

projectsRouter.post("/:id/parse-drive", async (req: Request, res: Response) => {
  try {
    const projectId = req.params.id as string;
    const { driveUrl, suggestedTaskCount } = req.body as { driveUrl: string; suggestedTaskCount?: number };

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
      where: { projectId, status: { not: "DONE" }, archivedAt: null },
      select: { title: true },
    });
    const existingTaskTitles = existingTasks.map(t => t.title);
    const today = new Date().toISOString().split("T")[0];

    // Truncation lives in the router now (truncateForAdapter), keyed to the selected
    // adapter's ceiling rather than Gemini's fixed 3.6M — Anthropic's is lower and
    // OpenAI's lower still, so a long Drive doc must not be pre-cut for Gemini here.
    const result = await runJson<{ tasks: any[] }>({ memberId: req.memberId }, "medium", {
      json: true,
      prompt: `${driveToTasksPrompt((project as any).name, (project as any).description ?? "", existingTaskTitles, today, suggestedTaskCount)}\n\n---DOCUMENT---\n${fileResult.text}`,
    });

    res.json({ tasks: result?.tasks ?? [], sourceFileName: fileResult.name });
  } catch (error) {
    console.error("Parse drive error:", error);
    res.status(500).json({ error: "Failed to parse Drive file" });
  }
});

// ── POST /api/projects/:id/parse-drive/confirm ───────────────

projectsRouter.post("/:id/parse-drive/confirm", async (req: Request, res: Response) => {
  try {
    const projectId = req.params.id as string;
    const { tasks } = req.body as {
      tasks: Array<{
        title: string;
        description?: string;
        priority?: Priority;
        dueDate?: string;
        suggestedAssigneeName?: string;
      }>;
    };

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
      let assigneeId: string | undefined;
      if (t.suggestedAssigneeName) {
        const nameLower = t.suggestedAssigneeName.toLowerCase();
        const match = projectMembers.find(
          pm =>
            pm.member.displayName.toLowerCase().includes(nameLower) ||
            nameLower.includes(pm.member.displayName.toLowerCase()),
        );
        if (match) assigneeId = match.member.id;
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
  } catch (error) {
    console.error("Parse drive confirm error:", error);
    res.status(500).json({ error: "Failed to create tasks from Drive file" });
  }
});

// ── POST /api/projects/:id/parse-meeting-notes ───────────────

projectsRouter.post("/:id/parse-meeting-notes", async (req: Request, res: Response) => {
  try {
    const projectId = req.params.id as string;
    const { notes, attendees, suggestedTaskCount } = req.body as { notes: string; attendees?: string[]; suggestedTaskCount?: number };

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
    const result = await runJson({ memberId: req.memberId }, "medium", {
      json: true,
      prompt: `${meetingNotesToTasksPrompt((project as any).name, attendees ?? [], today, suggestedTaskCount)}\n\n---DOCUMENT---\n${notes}`,
    });

    res.json(result);
  } catch (error) {
    console.error("Parse meeting notes error:", error);
    res.status(500).json({ error: "Failed to parse meeting notes" });
  }
});

// ── POST /api/projects/:id/ai-risks ─────────────────────────

projectsRouter.post("/:id/ai-risks", async (req: Request, res: Response) => {
  try {
    const projectId = req.params.id as string;
    const result = await analyzeProjectRisks(projectId, req.memberId);
    if (!result) {
      res.status(404).json({ error: "Project not found or analysis failed" });
      return;
    }
    res.json(result);
  } catch (error) {
    console.error("AI risks error:", error);
    res.status(500).json({ error: "Failed to analyze project risks" });
  }
});

// ── POST /api/projects/:id/sprint-plan ──────────────────────

projectsRouter.post("/:id/sprint-plan", async (req: Request, res: Response) => {
  try {
    const projectId = req.params.id as string;
    const { capacityPoints, sprintDays } = req.body as {
      capacityPoints?: number;
      sprintDays?: number;
    };
    const result = await generateSprintPlan(projectId, capacityPoints, sprintDays, req.memberId);
    if (!result) {
      res.status(404).json({ error: "Project not found or planning failed" });
      return;
    }
    res.json(result);
  } catch (error) {
    console.error("Sprint plan error:", error);
    res.status(500).json({ error: "Failed to generate sprint plan" });
  }
});

// ── POST /api/projects/:id/generate-brief ───────────────────

projectsRouter.post("/:id/generate-brief", async (req: Request, res: Response) => {
  try {
    const projectId = req.params.id as string;
    const result = await generateProjectBrief(projectId, req.memberId);
    if (!result) {
      res.status(404).json({ error: "Project not found or brief generation failed" });
      return;
    }
    res.json(result);
  } catch (error) {
    console.error("Generate brief error:", error);
    res.status(500).json({ error: "Failed to generate project brief" });
  }
});

// ── POST /api/projects/:id/infer-dependencies ───────────────

projectsRouter.post("/:id/infer-dependencies", async (req: Request, res: Response) => {
  try {
    const projectId = req.params.id as string;
    const result = await inferTaskDependencies(projectId, req.memberId);
    if (!result) {
      res.status(404).json({ error: "Project not found or inference failed" });
      return;
    }
    res.json(result);
  } catch (error) {
    console.error("Infer dependencies error:", error);
    res.status(500).json({ error: "Failed to infer task dependencies" });
  }
});

// ── POST /api/projects/:id/capacity-analysis ────────────────

projectsRouter.post("/:id/capacity-analysis", async (req: Request, res: Response) => {
  try {
    const projectId = req.params.id as string;
    const result = await analyzeTeamCapacity(projectId, undefined, req.memberId);
    if (!result) {
      res.status(404).json({ error: "Project not found or analysis failed" });
      return;
    }
    res.json(result);
  } catch (error) {
    console.error("Capacity analysis error:", error);
    res.status(500).json({ error: "Failed to analyze team capacity" });
  }
});

// ── POST /api/projects/:id/stakeholder-email ────────────────

projectsRouter.post("/:id/stakeholder-email", async (req: Request, res: Response) => {
  try {
    const projectId = req.params.id as string;
    const result = await generateStakeholderEmail(projectId, req.memberId);
    if (!result) {
      res.status(404).json({ error: "Project not found or email generation failed" });
      return;
    }
    res.json(result);
  } catch (error) {
    console.error("Stakeholder email error:", error);
    res.status(500).json({ error: "Failed to generate stakeholder email" });
  }
});

// ── POST /api/projects/:id/ask ───────────────────────────────

projectsRouter.post("/:id/ask", async (req: Request, res: Response) => {
  try {
    const projectId = req.params.id as string;
    const { question } = req.body as { question: string };

    if (!question) {
      res.status(400).json({ error: "question is required" });
      return;
    }

    const context = await buildProjectContext(projectId);

    if (!context) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    const answer = await runText({ memberId: req.memberId }, "high", {
      prompt: projectContextPrompt(question, todayContext(), context),
      json: false,
    });

    res.json({ answer });
  } catch (error) {
    console.error("Project ask error:", error);
    res.status(500).json({ error: "Failed to answer question" });
  }
});

// ── POST /api/projects/:id/ai-suggest-actions ────────────────

projectsRouter.post("/:id/ai-suggest-actions", async (req: Request, res: Response) => {
  try {
    const projectId = req.params.id as string;
    const { goal } = req.body as { goal: string };

    if (!goal) {
      res.status(400).json({ error: "goal is required" });
      return;
    }

    const actions = await suggestProjectActions(projectId, goal, req.memberId);
    if (actions === null) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    res.json({ actions });
  } catch (error) {
    console.error("AI suggest actions error:", error);
    res.status(500).json({ error: "Failed to suggest actions" });
  }
});

// ── POST /api/projects/:id/ai-plan-prompt ────────────────────
// Returns prompt text for the member to paste into their own chat session.
// Deliberately makes no AI call — see buildPlanPrompt.

projectsRouter.post("/:id/ai-plan-prompt", async (req: Request, res: Response) => {
  try {
    const projectId = req.params.id as string;
    const { goal } = req.body as { goal: string };

    if (!goal || !goal.trim()) {
      res.status(400).json({ error: "goal is required" });
      return;
    }

    const prompt = await buildPlanPrompt(projectId, goal.trim());
    if (prompt === null) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    res.json({ prompt });
  } catch (error) {
    console.error("AI plan prompt error:", error);
    res.status(500).json({ error: "Failed to build plan prompt" });
  }
});

// ── POST /api/projects/:id/ai-execute-plan ───────────────────

projectsRouter.post("/:id/ai-execute-plan", async (req: Request, res: Response) => {
  try {
    const projectId = req.params.id as string;
    const { actions } = req.body as { actions: ActionPlanAction[] };

    if (!Array.isArray(actions) || actions.length === 0) {
      res.status(400).json({ error: "actions must be a non-empty array" });
      return;
    }

    const results = await executeActionPlan(projectId, req.memberId!, actions);
    res.json({ results });
  } catch (error) {
    console.error("AI execute plan error:", error);
    res.status(500).json({ error: "Failed to execute action plan" });
  }
});

// ── Tags router (for DELETE /api/tags/:tagId) ────────────────

// ── Training sandbox ─────────────────────────────────────────
// Its own router because the path is /api/training-project, not
// /api/projects/*. requireAuth is per-route, never router.use() — this mounts
// at bare "/api", where a router-level guard would run for every /api/*
// request that reaches it.
export const trainingRouter = Router();

trainingRouter.post("/training-project", requireAuth, async (req: Request, res: Response) => {
  try {
    const out = await ensureTrainingProject(req.memberId!);
    res.json(out);
  } catch (err) {
    console.error("[training] ensureTrainingProject:", err);
    res.status(500).json({ error: "Could not prepare your training project" });
  }
});

export const tagsRouter = Router();
tagsRouter.use(requireAuth);

tagsRouter.delete("/:tagId", async (req: Request, res: Response) => {
  try {
    const memberId = req.memberId!;
    const actor = await prisma.member.findUnique({ where: { id: memberId }, select: { isAdmin: true } });
    if (!actor?.isAdmin) {
      res.status(403).json({ error: "Admin only" });
      return;
    }
    await prisma.tag.delete({ where: { id: req.params.tagId as string } });
    res.json({ ok: true });
  } catch (error) {
    console.error("Delete tag error:", error);
    res.status(500).json({ error: "Failed to delete tag" });
  }
});
