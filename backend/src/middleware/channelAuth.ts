import type { Request, Response, NextFunction } from "express";
import { prisma } from "../db/prisma.js";
import { canEditProject } from "../services/projectEditAccess.js";

/**
 * Rejects mutations if the current user is not a member of the project's linked Slack channel
 * (admin-added project members count as members).
 * Attach after requireAuth. Reads projectId from:
 *   - req.params.id   (for PATCH /api/projects/:id)
 *   - task → projectId  (for PATCH/DELETE /api/tasks/:id)
 */
export async function channelAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    let projectId: string | null = null;

    const paramId = req.params.id as string;
    if (req.baseUrl.includes("/tasks")) {
      const task = await prisma.task.findUnique({
        where: { id: paramId },
        select: { projectId: true },
      });
      projectId = task?.projectId ?? null;
    } else {
      projectId = paramId;
    }

    if (!projectId) { next(); return; }

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { slackChannelId: true },
    });

    if (!project?.slackChannelId) { next(); return; }

    const memberId = req.memberId;
    if (!memberId) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    if (!(await canEditProject(memberId, projectId))) {
      res.status(403).json({
        error: "You must be a member of the linked Slack channel to edit this project.",
      });
      return;
    }

    next();
  } catch (err) {
    console.error("channelAuth middleware error:", err);
    res.status(503).json({ error: "Authorization check unavailable" });
  }
}
