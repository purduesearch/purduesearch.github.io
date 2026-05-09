import { Router, type Request, type Response } from "express";
import { requireAuth } from "./auth.js";
import { prisma } from "../db/prisma.js";

export const activityRouter = Router();

activityRouter.use(requireAuth);

activityRouter.get("/", async (_req: Request, res: Response) => {
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
    const memberIds = [...new Set(updates.map(u => u.authorId))];
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
      author: memberMap.get(u.authorId) || { displayName: "Unknown", avatarUrl: null }
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
  } catch (error) {
    console.error("Fetch activity error:", error);
    res.status(500).json({ error: "Failed to fetch activity" });
  }
});

// ── GET /api/activity/project/:projectId ─────────────────────

activityRouter.get("/project/:projectId", async (req: Request, res: Response) => {
  try {
    const { getProjectActivities } = await import("../services/activityService.js");
    const cursor = req.query.cursor as string | undefined;
    const activities = await getProjectActivities(req.params.projectId as string, 50, cursor);
    res.json(activities);
  } catch (error) {
    console.error("Fetch project activity error:", error);
    res.status(500).json({ error: "Failed to fetch project activity" });
  }
});
