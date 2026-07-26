// Leaderboard — top 10 members by XP, optionally filtered by team or semester.
// Semester is implemented as a date window: when ?semester=FALL_2025 is set we sum
// XpEvent.amount within the window; otherwise we use Member.xp (all-time).

import { Router, type Request, type Response } from "express";
import { prisma } from "../db/prisma.js";
import { requireAuth } from "./auth.js";

export const leaderboardRouter = Router();

// Semester windows — extend here when new semesters start.
const SEMESTER_WINDOWS: Record<string, { start: Date; end: Date }> = {
  FALL_2025:   { start: new Date("2025-08-15T00:00:00Z"), end: new Date("2025-12-20T23:59:59Z") },
  SPRING_2026: { start: new Date("2026-01-07T00:00:00Z"), end: new Date("2026-05-15T23:59:59Z") },
  FALL_2026:   { start: new Date("2026-08-15T00:00:00Z"), end: new Date("2026-12-20T23:59:59Z") },
};

leaderboardRouter.get("/", requireAuth, async (req: Request, res: Response) => {
  const semester = typeof req.query.semester === "string" ? req.query.semester : null;
  const team     = typeof req.query.team     === "string" ? req.query.team     : null;

  // Member filter — exclude bots
  const memberWhere: any = { isBot: false };
  if (team) memberWhere.team = team;

  if (!semester || !SEMESTER_WINDOWS[semester]) {
    // All-time leaderboard from Member.xp
    const members = await prisma.member.findMany({
      where: memberWhere,
      select: { id: true, displayName: true, avatarUrl: true, slackHandle: true, xp: true, rank: true, team: true },
      orderBy: { xp: "desc" },
      take: 10,
    });
    res.json(members.map((m, i) => ({ ...m, position: i + 1 })));
    return;
  }

  // Semester-scoped: sum XpEvent.amount within the window per member
  const { start, end } = SEMESTER_WINDOWS[semester];
  const events = await prisma.xpEvent.groupBy({
    by: ["memberId"],
    where: { createdAt: { gte: start, lte: end } },
    _sum: { amount: true },
    orderBy: { _sum: { amount: "desc" } },
    take: 50, // overfetch to allow team filtering after the fact
  });

  const memberIds = events.map(e => e.memberId);
  const members = await prisma.member.findMany({
    where: { id: { in: memberIds }, ...memberWhere },
    select: { id: true, displayName: true, avatarUrl: true, slackHandle: true, rank: true, team: true },
  });
  const byId = new Map(members.map(m => [m.id, m]));

  const rows = events
    .map(e => {
      const m = byId.get(e.memberId);
      if (!m) return null;
      return { ...m, xp: e._sum.amount ?? 0 };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .slice(0, 10)
    .map((r, i) => ({ ...r, position: i + 1 }));

  res.json(rows);
});
