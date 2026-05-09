import { Router, type Request, type Response } from "express";
import { requireAuth } from "./auth.js";
import {
  createMilestone,
  updateMilestone,
  deleteMilestone,
  getMilestone,
  getMilestonesForProject,
} from "../services/milestoneService.js";

export const milestonesRouter = Router();
milestonesRouter.use(requireAuth);

// ── GET /api/milestones/project/:projectId ───────────────────

milestonesRouter.get("/project/:projectId", async (req: Request, res: Response) => {
  try {
    const milestones = await getMilestonesForProject(req.params.projectId as string);
    res.json(milestones);
  } catch (error) {
    console.error("Get milestones error:", error);
    res.status(500).json({ error: "Failed to get milestones" });
  }
});

// ── GET /api/milestones/:id ──────────────────────────────────

milestonesRouter.get("/:id", async (req: Request, res: Response) => {
  try {
    const milestone = await getMilestone(req.params.id as string);
    if (!milestone) {
      res.status(404).json({ error: "Milestone not found" });
      return;
    }
    res.json(milestone);
  } catch (error) {
    console.error("Get milestone error:", error);
    res.status(500).json({ error: "Failed to get milestone" });
  }
});

// ── POST /api/milestones ─────────────────────────────────────

milestonesRouter.post("/", async (req: Request, res: Response) => {
  try {
    const { name, projectId, dueDate } = req.body as {
      name: string;
      projectId: string;
      dueDate?: string;
    };
    if (!name || !projectId) {
      res.status(400).json({ error: "name and projectId are required" });
      return;
    }
    const milestone = await createMilestone({
      name,
      projectId,
      dueDate: dueDate ? new Date(dueDate) : undefined,
    });
    res.status(201).json(milestone);
  } catch (error) {
    console.error("Create milestone error:", error);
    res.status(500).json({ error: "Failed to create milestone" });
  }
});

// ── PATCH /api/milestones/:id ────────────────────────────────

milestonesRouter.patch("/:id", async (req: Request, res: Response) => {
  try {
    const { name, dueDate } = req.body as {
      name?: string;
      dueDate?: string | null;
    };
    const milestone = await updateMilestone(req.params.id as string, {
      name,
      dueDate: dueDate === null ? null : dueDate ? new Date(dueDate) : undefined,
    });
    res.json(milestone);
  } catch (error) {
    console.error("Update milestone error:", error);
    res.status(500).json({ error: "Failed to update milestone" });
  }
});

// ── DELETE /api/milestones/:id ───────────────────────────────

milestonesRouter.delete("/:id", async (req: Request, res: Response) => {
  try {
    await deleteMilestone(req.params.id as string);
    res.json({ ok: true });
  } catch (error) {
    console.error("Delete milestone error:", error);
    res.status(500).json({ error: "Failed to delete milestone" });
  }
});
