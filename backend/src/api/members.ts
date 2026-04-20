import { Router, type Request, type Response } from "express";
import { requireAuth } from "./auth.js";
import { prisma } from "../db/prisma.js";
import { getTasksForMember } from "../services/taskService.js";

export const membersRouter = Router();

// All routes require authentication
membersRouter.use(requireAuth);

// ── GET /api/members/me ──────────────────────────────────────

membersRouter.get("/me", async (req: Request, res: Response) => {
  try {
    if (!req.session.memberId) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const member = await prisma.member.findUnique({
      where: { id: req.session.memberId },
      include: {
        projects: {
          include: {
            project: {
              include: {
                _count: { select: { tasks: true } },
              },
            },
          },
        },
      },
    });

    if (!member) {
      res.status(404).json({ error: "Member not found" });
      return;
    }

    const tasks = await getTasksForMember(member.id);

    res.json({ ...member, tasks });
  } catch (error) {
    console.error("Get me error:", error);
    res.status(500).json({ error: "Failed to get profile" });
  }
});

// ── GET /api/members ─────────────────────────────────────────

membersRouter.get("/", async (_req: Request, res: Response) => {
  try {
    const members = await prisma.member.findMany({
      include: {
        _count: {
          select: { tasks: true, projects: true },
        },
      },
      orderBy: { displayName: "asc" },
    });

    res.json(members);
  } catch (error) {
    console.error("List members error:", error);
    res.status(500).json({ error: "Failed to list members" });
  }
});
