import { Router, type Request, type Response } from "express";
import { requireAuth } from "./auth.js";
import { getProjectReport } from "../services/reportingService.js";
import { generateWeeklyMeetingTemplate } from "../services/meetingNotesService.js";
import { prisma } from "../db/prisma.js";

export const reportingRouter = Router();
reportingRouter.use(requireAuth);

// ── GET /api/reporting/project/:projectId ────────────────────

reportingRouter.get("/project/:projectId", async (req: Request, res: Response) => {
  try {
    const report = await getProjectReport(req.params.projectId as string);
    res.json(report);
  } catch (error) {
    console.error("Get project report error:", error);
    res.status(500).json({ error: "Failed to get report" });
  }
});

// ── GET /api/reporting/meeting-template ─────────────────────

reportingRouter.get("/meeting-template", async (req: Request, res: Response) => {
  try {
    const member = await prisma.member.findUnique({
      where: { id: req.memberId },
      select: { isAdmin: true },
    });
    if (!member?.isAdmin) {
      res.status(403).json({ error: "Admin access required" });
      return;
    }

    let weekEnd: Date | undefined;
    if (typeof req.query.weekEnd === "string" && req.query.weekEnd) {
      const parsed = new Date(req.query.weekEnd);
      if (!isNaN(parsed.getTime())) {
        weekEnd = parsed;
      }
    }

    const template = await generateWeeklyMeetingTemplate(weekEnd);
    res.json(template);
  } catch (error) {
    console.error("Get meeting template error:", error);
    res.status(500).json({ error: "Failed to generate meeting template" });
  }
});

// ── GET /api/reporting/meeting-template/markdown ────────────

reportingRouter.get("/meeting-template/markdown", async (req: Request, res: Response) => {
  try {
    const member = await prisma.member.findUnique({
      where: { id: req.memberId },
      select: { isAdmin: true },
    });
    if (!member?.isAdmin) {
      res.status(403).json({ error: "Admin access required" });
      return;
    }

    let weekEnd: Date | undefined;
    if (typeof req.query.weekEnd === "string" && req.query.weekEnd) {
      const parsed = new Date(req.query.weekEnd);
      if (!isNaN(parsed.getTime())) {
        weekEnd = parsed;
      }
    }

    const template = await generateWeeklyMeetingTemplate(weekEnd);
    res.setHeader("Content-Type", "text/plain");
    res.send(template.agendaTemplate);
  } catch (error) {
    console.error("Get meeting template markdown error:", error);
    res.status(500).json({ error: "Failed to generate meeting template" });
  }
});
