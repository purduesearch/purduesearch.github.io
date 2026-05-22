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

// ── PATCH /api/members/me ────────────────────────────────────

membersRouter.patch("/me", async (req: Request, res: Response) => {
  try {
    if (!req.session.memberId) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const { kanbanColumnOrder, team, bio, email } = req.body;

    const member = await prisma.member.update({
      where: { id: req.session.memberId },
      data: {
        ...(kanbanColumnOrder !== undefined ? { kanbanColumnOrder } : {}),
        ...(team  !== undefined ? { team }  : {}),
        ...(bio   !== undefined ? { bio }   : {}),
        ...(email !== undefined ? { email } : {}),
      },
    });

    res.json(member);
  } catch (error) {
    console.error("Update me error:", error);
    res.status(500).json({ error: "Failed to update profile" });
  }
});

// ── PATCH /api/members/me/notification-preferences ──────────

membersRouter.patch("/me/notification-preferences", async (req: Request, res: Response) => {
  try {
    if (!req.session.memberId) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const {
      notificationPrefs,
      notificationChannels,
      quietHoursStart,
      quietHoursEnd,
      mutedProjectIds,
    } = req.body;

    // Validate quiet hours range
    if (quietHoursStart !== undefined && (quietHoursStart < 0 || quietHoursStart > 23 || !Number.isInteger(quietHoursStart))) {
      res.status(400).json({ error: "quietHoursStart must be an integer between 0 and 23" });
      return;
    }
    if (quietHoursEnd !== undefined && (quietHoursEnd < 0 || quietHoursEnd > 23 || !Number.isInteger(quietHoursEnd))) {
      res.status(400).json({ error: "quietHoursEnd must be an integer between 0 and 23" });
      return;
    }

    const updateData: Record<string, unknown> = {};
    if (notificationPrefs !== undefined)    updateData.notificationPrefs    = notificationPrefs;
    if (notificationChannels !== undefined) updateData.notificationChannels = notificationChannels;
    if (quietHoursStart !== undefined)      updateData.quietHoursStart      = quietHoursStart;
    if (quietHoursEnd !== undefined)        updateData.quietHoursEnd        = quietHoursEnd;
    if (mutedProjectIds !== undefined)      updateData.mutedProjectIds      = mutedProjectIds;

    const member = await prisma.member.update({
      where: { id: req.session.memberId },
      data: updateData,
      select: {
        notificationPrefs:    true,
        notificationChannels: true,
        quietHoursStart:      true,
        quietHoursEnd:        true,
        mutedProjectIds:      true,
      },
    });

    res.json(member);
  } catch (error) {
    console.error("Update notification preferences error:", error);
    res.status(500).json({ error: "Failed to update notification preferences" });
  }
});

// ── GET /api/members ─────────────────────────────────────────

membersRouter.get("/", async (_req: Request, res: Response) => {
  try {
    const members = await prisma.member.findMany({
      where: { isBot: false },
      include: {
        _count: {
          select: { tasks: true, projects: true },
        },
        projects: {
          include: { project: { select: { id: true, name: true, status: true } } },
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

// ── GET /api/members/:id ─────────────────────────────────────

membersRouter.get("/:id", async (req: Request, res: Response) => {
  try {
    const member = await prisma.member.findUnique({
      where: { id: req.params.id as string },
      include: {
        projects: {
          include: {
            project: {
              include: {
                _count: { select: { tasks: true } },
                tasks: {
                  where: { assignees: { some: { id: req.params.id as string } } },
                  select: { id: true, status: true, progress: true },
                },
              },
            },
          },
        },
        activityLogs: {
          orderBy: { createdAt: "desc" },
          take: 20,
          include: { project: { select: { id: true, name: true } } },
        },
        _count: { select: { tasks: true, projects: true } },
      },
    });

    if (!member) {
      res.status(404).json({ error: "Member not found" });
      return;
    }

    res.json(member);
  } catch (error) {
    console.error("Get member error:", error);
    res.status(500).json({ error: "Failed to get member" });
  }
});
