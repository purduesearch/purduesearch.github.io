import { Router, type Request, type Response } from "express";
import { requireAuth } from "./auth.js";
import { getProjectReport } from "../services/reportingService.js";

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
