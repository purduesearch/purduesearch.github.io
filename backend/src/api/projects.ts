import { Router, type Request, type Response } from "express";
import { requireAuth } from "./auth.js";
import { channelAuth } from "../middleware/channelAuth.js";
import {
  getProject,
  createProject,
  updateProject,
  getProjectsWithTaskStats,
  getChannelMemberSlackIds,
} from "../services/projectService.js";
import {
  getTasksForProject,
  createTask,
} from "../services/taskService.js";
import { logAuditEvent, diffObjects, getProjectAuditLog } from "../services/activityService.js";
import type { ProjectType, ProjectStatus, TaskStatus, Priority, ActivityEventType } from "@prisma/client";

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

    const memberId = (req.session as any).memberId as string | undefined;
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
    const { name, description, driveLink, slackChannel, slackChannelId, slackChannelName, status, startDate, targetDate } =
      req.body as {
        name?: string;
        description?: string;
        driveLink?: string;
        slackChannel?: string;
        slackChannelId?: string | null;
        slackChannelName?: string | null;
        status?: ProjectStatus;
        startDate?: string;
        targetDate?: string;
      };

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
      const changes = diffObjects(before as any, project as any, WATCHED_PROJECT_FIELDS);
      if (changes.length > 0) {
        const memberId = (req.session as any).memberId as string | undefined;
        logAuditEvent({
          projectId,
          memberId:  memberId ?? null,
          source:    "WEB",
          eventType: "PROJECT_UPDATED",
          payload:   { changes },
        }).catch(console.error);
      }
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
    const { status, assigneeId } = req.query as {
      status?: TaskStatus;
      assigneeId?: string;
    };

    const tasks = await getTasksForProject(projectId, {
      status,
      assigneeId,
    });

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
    const { title, description, priority, dueDate, assigneeIds, parentTaskId, status, milestoneId } = req.body as {
      title: string;
      description?: string;
      priority?: Priority;
      dueDate?: string;
      assigneeIds?: string[];
      parentTaskId?: string;
      status?: TaskStatus;
      milestoneId?: string;
    };

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
    });

    console.log(`[createTask] created id=${task.id} parentTaskId=${(task as any).parentTaskId ?? "none"}`);

    // If task is linked to a milestone, refresh its health (fire-and-forget)
    if (milestoneId) {
      const { refreshMilestoneHealth } = await import("../services/milestoneService.js");
      refreshMilestoneHealth(milestoneId).catch(console.error);
    }

    const memberId = (req.session as any).memberId as string | undefined;
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
  } catch (error) {
    console.error("Create task error:", error);
    res.status(500).json({ error: "Failed to create task" });
  }
});
