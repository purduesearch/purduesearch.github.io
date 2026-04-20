import { Router, type Request, type Response } from "express";
import { requireAuth } from "./auth.js";
import {
  getProject,
  createProject,
  updateProject,
  getProjectsWithTaskStats,
} from "../services/projectService.js";
import {
  getTasksForProject,
  createTask,
} from "../services/taskService.js";
import type { ProjectType, ProjectStatus, TaskStatus, Priority } from "@prisma/client";

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
    const { name, description, slackChannel, type, startDate, targetDate } =
      req.body as {
        name: string;
        description?: string;
        slackChannel?: string;
        type: ProjectType;
        startDate?: string;
        targetDate?: string;
      };

    if (!name || !type) {
      res.status(400).json({ error: "name and type are required" });
      return;
    }

    const project = await createProject({
      name,
      description,
      slackChannel,
      type,
      startDate: startDate ? new Date(startDate) : undefined,
      targetDate: targetDate ? new Date(targetDate) : undefined,
    });

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
    res.json(project);
  } catch (error) {
    console.error("Get project error:", error);
    res.status(500).json({ error: "Failed to get project" });
  }
});

// ── PATCH /api/projects/:id ──────────────────────────────────

projectsRouter.patch("/:id", async (req: Request, res: Response) => {
  try {
    const projectId = req.params.id as string;
    const { name, description, slackChannel, status, startDate, targetDate } =
      req.body as {
        name?: string;
        description?: string;
        slackChannel?: string;
        status?: ProjectStatus;
        startDate?: string;
        targetDate?: string;
      };

    const project = await updateProject(projectId, {
      name,
      description,
      slackChannel,
      status,
      startDate: startDate ? new Date(startDate) : undefined,
      targetDate: targetDate ? new Date(targetDate) : undefined,
    });

    res.json(project);
  } catch (error) {
    console.error("Update project error:", error);
    res.status(500).json({ error: "Failed to update project" });
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
    const { title, description, priority, dueDate, assigneeId } = req.body as {
      title: string;
      description?: string;
      priority?: Priority;
      dueDate?: string;
      assigneeId?: string;
    };

    if (!title) {
      res.status(400).json({ error: "title is required" });
      return;
    }

    const task = await createTask({
      title,
      description,
      priority,
      dueDate: dueDate ? new Date(dueDate) : undefined,
      projectId,
      assigneeId,
    });

    res.status(201).json(task);
  } catch (error) {
    console.error("Create task error:", error);
    res.status(500).json({ error: "Failed to create task" });
  }
});
