import { Router, type Request, type Response } from "express";
import { requireAuth } from "./auth.js";
import { prisma } from "../db/prisma.js";
import { getTasksForMember } from "../services/taskService.js";
import { sendKudos, getKudosCaps, KudosCapError } from "../services/kudosService.js";
import { EXCLUDE_TRAINING } from "../services/trainingSandboxService.js";

export const membersRouter = Router();

// All routes require authentication
membersRouter.use(requireAuth);

// ── GET /api/members/me ──────────────────────────────────────

membersRouter.get("/me", async (req: Request, res: Response) => {
  try {
    if (!req.memberId) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const member = await prisma.member.findUnique({
      where: { id: req.memberId },
      include: {
        projects: {
          // A member is a member of their own training project, so without this
          // it shows up in their own profile's project list.
          where: { project: { is: EXCLUDE_TRAINING } },
          include: {
            project: {
              include: {
                _count: { select: { tasks: true } },
              },
            },
          },
        },
        equippedBadge: { select: { id: true, name: true, rarity: true, svgUrl: true, iconClass: true } },
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
    if (!req.memberId) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const { kanbanColumnOrder, bio, email } = req.body;

    // Input validation
    if (email !== undefined) {
      if (typeof email !== "string" || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        res.status(400).json({ error: "Invalid email format" });
        return;
      }
    }
    if (bio !== undefined && (typeof bio !== "string" || bio.length > 500)) {
      res.status(400).json({ error: "bio must be a string of at most 500 characters" });
      return;
    }
    const VALID_COLUMNS = new Set(["TODO", "IN_PROGRESS", "BLOCKED", "DONE"]);
    if (kanbanColumnOrder !== undefined) {
      if (
        !Array.isArray(kanbanColumnOrder) ||
        !kanbanColumnOrder.every((k: unknown) => typeof k === "string" && VALID_COLUMNS.has(k))
      ) {
        res.status(400).json({ error: "kanbanColumnOrder must contain only valid column keys" });
        return;
      }
    }

    const profileChanged = bio !== undefined || email !== undefined;

    const member = await prisma.member.update({
      where: { id: req.memberId },
      data: {
        ...(kanbanColumnOrder !== undefined ? { kanbanColumnOrder } : {}),
        ...(bio   !== undefined ? { bio }   : {}),
        ...(email !== undefined ? { email } : {}),
      },
    });

    res.json(member);

    if (profileChanged) {
      import("../services/challengeService.js").then(({ recordEvent }) =>
        recordEvent(req.memberId!, "PROFILE_UPDATED", 1)
      ).catch(err => console.error("[challenge] PROFILE_UPDATED:", err));
    }
  } catch (error) {
    console.error("Update me error:", error);
    res.status(500).json({ error: "Failed to update profile" });
  }
});

// ── PATCH /api/members/me/notification-preferences ──────────

membersRouter.patch("/me/notification-preferences", async (req: Request, res: Response) => {
  try {
    if (!req.memberId) {
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
      where: { id: req.memberId },
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

// ── GET /api/members/me/progress-snapshot ───────────────────
//
// Returns the per-project progress snapshot the caller last observed. The
// client uses this to fill milestone bars from the previous value on project
// mount (rather than snapping). Returns null if the user has never saved one.

membersRouter.get("/me/progress-snapshot", async (req: Request, res: Response) => {
  if (!req.memberId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  try {
    const member = await prisma.member.findUnique({
      where: { id: req.memberId },
      select: { lastSeenProgress: true },
    });
    res.json(member?.lastSeenProgress ?? null);
  } catch (error) {
    console.error("Get progress snapshot error:", error);
    res.status(500).json({ error: "Failed to get progress snapshot" });
  }
});

// ── PUT /api/members/me/progress-snapshot ───────────────────
//
// Replaces the caller's stored progress snapshot. The client debounces calls
// from project route changes; the server doesn't merge — last write wins.

membersRouter.put("/me/progress-snapshot", async (req: Request, res: Response) => {
  if (!req.memberId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  try {
    const snapshot = req.body;
    if (snapshot !== null && (typeof snapshot !== "object" || Array.isArray(snapshot))) {
      res.status(400).json({ error: "snapshot must be an object or null" });
      return;
    }
    await prisma.member.update({
      where: { id: req.memberId },
      data: { lastSeenProgress: snapshot ?? undefined },
    });
    res.json({ ok: true });
  } catch (error) {
    console.error("Save progress snapshot error:", error);
    res.status(500).json({ error: "Failed to save progress snapshot" });
  }
});

// ── GET /api/members/cosmetic-styles ─────────────────────────
// Compact map of memberId → equipped cosmetic css slugs, so avatar chips
// anywhere in the app can render borders/frames/animations without every
// task/project query having to join through MemberCosmetic.
// MUST stay registered above `GET /:id`.

const STYLE_SLOTS = ["border", "frame", "animation"] as const;

membersRouter.get("/cosmetic-styles", async (_req: Request, res: Response) => {
  try {
    const rows = await prisma.memberCosmetic.findMany({
      where: { equippedSlot: { in: [...STYLE_SLOTS] } },
      select: {
        memberId:     true,
        equippedSlot: true,
        cosmetic:     { select: { cssSlug: true } },
      },
    });

    const out: Record<string, Record<string, string>> = {};
    for (const r of rows) {
      const slug = r.cosmetic.cssSlug;
      if (!slug || !r.equippedSlot) continue;
      (out[r.memberId] ??= {})[r.equippedSlot] = slug;
    }
    res.json(out);
  } catch (err) {
    console.error("Get cosmetic styles error:", err);
    res.status(500).json({ error: "Failed to get cosmetic styles" });
  }
});

// ── GET /api/members ─────────────────────────────────────────

membersRouter.get("/", async (_req: Request, res: Response) => {
  try {
    const members = await prisma.member.findMany({
      where: { isBot: false },
      include: {
        _count: {
          // Filtered counts, not raw ones: the roster's task/project numbers are
          // read as real workload, so a seeded sandbox would inflate them.
          select: {
            tasks: { where: { project: { is: EXCLUDE_TRAINING } } },
            projects: { where: { project: { is: EXCLUDE_TRAINING } } },
          },
        },
        projects: {
          where: { project: { is: EXCLUDE_TRAINING } },
          include: { project: { select: { id: true, name: true, status: true } } },
        },
        equippedBadge: { select: { id: true, name: true, rarity: true, svgUrl: true, iconClass: true } },
      },
      orderBy: { displayName: "asc" },
    });

    // Strip the encrypted OAuth tokens from every row — the roster is readable
    // by any signed-in member and has no use for them.
    res.json(
      members.map(({
        githubAccessToken: _gat,
        githubRefreshToken: _grt,
        slackUserToken: _sut,
        tokenVersion: _tv,
        ...rest
      }) => rest)
    );
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
          // MemberDrawer. Someone else's training project is not their work,
          // and a member's own should not appear in their public profile either.
          where: { project: { is: EXCLUDE_TRAINING } },
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
          where: { project: { is: EXCLUDE_TRAINING } },
          orderBy: { createdAt: "desc" },
          take: 20,
          include: { project: { select: { id: true, name: true } } },
        },
        equippedBadge: { select: { id: true, name: true, rarity: true, svgUrl: true, iconClass: true } },
        _count: {
          select: {
            tasks: { where: { project: { is: EXCLUDE_TRAINING } } },
            projects: { where: { project: { is: EXCLUDE_TRAINING } } },
          },
        },
      },
    });

    if (!member) {
      res.status(404).json({ error: "Member not found" });
      return;
    }

    // Strip PII and internal auth fields before returning
    const {
      email: _email,
      slackId: _slackId,
      isAdmin: _isAdmin,
      githubLogin: _githubLogin,
      githubAccessToken: _gat,
      githubRefreshToken: _grt,
      githubTokenExpiresAt: _gte,
      slackUserToken: _sut,
      slackUserTokenAt: _suta,
      tokenVersion: _tv,
      ...publicMember
    } = member;
    res.json(publicMember);
  } catch (error) {
    console.error("Get member error:", error);
    res.status(500).json({ error: "Failed to get member" });
  }
});

// ── GET /api/members/:id/profile ─────────────────────────────
// Engagement profile: XP, doubloons, rank, equipped cosmetics, owned badges, pending count.

membersRouter.get("/:id/profile", async (req: Request, res: Response) => {
  const id = req.params.id as string;
  try {
    const member = await prisma.member.findUnique({
      where: { id },
      select: {
        id: true, displayName: true, avatarUrl: true, slackHandle: true,
        xp: true, doubloons: true, rank: true,
        equippedBadgeId: true,
        equippedBadge: { select: { id: true, name: true, rarity: true, svgUrl: true, iconClass: true } },
      },
    });
    if (!member) {
      res.status(404).json({ error: "Member not found" });
      return;
    }

    const [ownedCosmetics, pendingCount] = await Promise.all([
      prisma.memberCosmetic.findMany({
        where: { memberId: id },
        include: { cosmetic: true },
      }),
      prisma.pendingReward.count({ where: { memberId: id, status: "PENDING" } }),
    ]);

    // Group equipped cosmetics by slot for easy frontend lookup
    const equippedCosmetics: Record<string, any> = {};
    const ownedBadges: any[] = [];
    for (const mc of ownedCosmetics) {
      if (mc.equippedSlot) equippedCosmetics[mc.equippedSlot] = mc.cosmetic;
      if (mc.cosmetic.category === "BADGE") ownedBadges.push(mc.cosmetic);
    }

    res.json({
      ...member,
      equippedCosmetics,
      ownedBadges,
      pendingCount,
    });
  } catch (err) {
    console.error("Get profile error:", err);
    res.status(500).json({ error: "Failed to get profile" });
  }
});

// ── GET /api/members/:id/xp-history ──────────────────────────
// Returns [{ date: "YYYY-MM-DD", xp: number }] for the last 365 days (UTC days).

membersRouter.get("/:id/xp-history", async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const since = new Date(Date.now() - 365 * 86_400_000);
  try {
    const events = await prisma.xpEvent.findMany({
      where: { memberId: id, createdAt: { gte: since } },
      select: { amount: true, createdAt: true },
    });
    const buckets: Record<string, number> = {};
    for (const e of events) {
      const day = e.createdAt.toISOString().slice(0, 10);
      buckets[day] = (buckets[day] ?? 0) + e.amount;
    }
    const out = Object.entries(buckets)
      .map(([date, xp]) => ({ date, xp }))
      .sort((a, b) => a.date.localeCompare(b.date));
    res.json(out);
  } catch (err) {
    console.error("Get xp-history error:", err);
    res.status(500).json({ error: "Failed to get xp history" });
  }
});

// ── GET /api/members/:id/cosmetics ───────────────────────────
// Returns the member's full cosmetic inventory with equipped state.

membersRouter.get("/:id/cosmetics", async (req: Request, res: Response) => {
  const id = req.params.id as string;
  try {
    const owned = await prisma.memberCosmetic.findMany({
      where: { memberId: id },
      include: { cosmetic: true },
      orderBy: { acquiredAt: "desc" },
    });
    res.json(owned);
  } catch (err) {
    console.error("Get cosmetics error:", err);
    res.status(500).json({ error: "Failed to get cosmetics" });
  }
});

// ── GET /api/members/:id/kudos/caps ──────────────────────────
// Returns how many kudos the caller can still send to this member this week.

membersRouter.get("/:id/kudos/caps", async (req: Request, res: Response) => {
  if (!req.memberId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  const caps = await getKudosCaps(req.memberId, req.params.id as string);
  res.json(caps);
});

// ── POST /api/members/:id/kudos ──────────────────────────────
// Cap-enforced: returns 429 if weekly send or receive cap is hit.

membersRouter.post("/:id/kudos", async (req: Request, res: Response) => {
  if (!req.memberId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  const toId = req.params.id as string;
  if (toId === req.memberId) {
    res.status(400).json({ error: "Cannot send kudos to yourself" });
    return;
  }
  try {
    const { message } = req.body as { message?: string };
    const result = await sendKudos(req.memberId, toId, message);
    res.json(result);
  } catch (err: any) {
    if (err instanceof KudosCapError) {
      res.status(429).json({ error: err.message, which: err.which });
      return;
    }
    console.error("Send kudos error:", err);
    res.status(500).json({ error: err.message ?? "Failed to send kudos" });
  }
});
