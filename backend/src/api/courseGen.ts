// AI course generation routes.
//
// Two stages behind a CourseGenJob row: POST / drafts an outline (seconds), the
// author reviews and PATCHes it, then POST /:jobId/run writes the bodies
// (minutes, one model call per section). Both stages are fire-and-forget; the
// job row is their only report channel and the client polls GET /:jobId.
//
// MOUNT ORDER MATTERS: this router must be registered in app.ts BEFORE
// coursesRouter, or coursesRouter's GET /:id matches "generate" as a course id.

import { Router, type Request, type Response } from "express";
import { requireAuth } from "./auth.js";
import { prisma } from "../db/prisma.js";
import * as gen from "../services/courseGenService.js";

export const courseGenRouter = Router();
courseGenRouter.use(requireAuth);

async function isAdmin(memberId?: string): Promise<boolean> {
  if (!memberId) return false;
  const m = await prisma.member.findUnique({ where: { id: memberId }, select: { isAdmin: true } });
  return !!m?.isAdmin;
}

// POST / — start stage 1. Returns immediately; the client polls GET /:jobId.
courseGenRouter.post("/", async (req: Request, res: Response) => {
  try {
    const { prompt, reference, sourcePostIds } = req.body as {
      prompt?: string; reference?: string; sourcePostIds?: string[];
    };
    if (!prompt?.trim() || prompt.trim().length < 20) {
      res.status(400).json({ error: "Describe the course you want in a sentence or two" });
      return;
    }
    const job = await gen.startOutline({
      memberId: req.memberId!,
      prompt: prompt.trim(),
      reference: reference?.trim() || undefined,
      sourcePostIds: Array.isArray(sourcePostIds) ? sourcePostIds : [],
    });
    // Fire and forget: the work outlives this request, and its only report
    // channel is the job row.
    void gen.runOutline(job.id, req.memberId);
    res.status(202).json({ id: job.id });
  } catch (error) {
    console.error("POST /outreach/courses/generate error:", error);
    res.status(500).json({ error: "Could not start generation" });
  }
});

courseGenRouter.get("/", async (req: Request, res: Response) => {
  try {
    res.json(await gen.listJobs(req.memberId!));
  } catch (error) {
    console.error("GET /outreach/courses/generate error:", error);
    res.status(500).json({ error: "Failed to list jobs" });
  }
});

courseGenRouter.get("/:jobId", async (req: Request, res: Response) => {
  try {
    const job = await gen.getJob(req.params.jobId as string, req.memberId!, await isAdmin(req.memberId));
    if (!job) { res.status(404).json({ error: "Job not found" }); return; }
    res.json(job);
  } catch (error) {
    console.error("GET /outreach/courses/generate/:jobId error:", error);
    res.status(500).json({ error: "Failed to get job" });
  }
});

// PATCH /:jobId — the author's edited outline. Re-validated server-side: the
// review screen is a convenience, not a trust boundary, so a hand-built
// 40-module payload is clamped here rather than trusted.
courseGenRouter.patch("/:jobId", async (req: Request, res: Response) => {
  try {
    const updated = await gen.reviseOutline(
      req.params.jobId as string, req.memberId!, (req.body as { outline?: unknown }).outline
    );
    if (!updated) { res.status(409).json({ error: "That job is not awaiting review" }); return; }
    res.json(updated);
  } catch (error) {
    console.error("PATCH /outreach/courses/generate/:jobId error:", error);
    res.status(500).json({ error: "Failed to save the outline" });
  }
});

// POST /:jobId/run — approve the outline and start stage 2.
courseGenRouter.post("/:jobId/run", async (req: Request, res: Response) => {
  try {
    const jobId = req.params.jobId as string;
    const job = await gen.getJob(jobId, req.memberId!, false);
    if (!job) { res.status(404).json({ error: "Job not found" }); return; }
    if (job.status !== "AWAITING_REVIEW") {
      res.status(409).json({ error: "That job is not awaiting review" });
      return;
    }
    await prisma.courseGenJob.update({
      where: { id: jobId },
      data: { status: "GENERATING", progress: 1, stepLabel: "Creating the course…", error: null },
    });
    void gen.runGeneration(jobId, req.memberId);
    res.status(202).json({ ok: true });
  } catch (error) {
    console.error("POST /outreach/courses/generate/:jobId/run error:", error);
    res.status(500).json({ error: "Could not start generation" });
  }
});

courseGenRouter.delete("/:jobId", async (req: Request, res: Response) => {
  try {
    const cancelled = await gen.cancelJob(req.params.jobId as string, req.memberId!);
    if (!cancelled) { res.status(404).json({ error: "Job not found" }); return; }
    res.json({ ok: true });
  } catch (error) {
    console.error("DELETE /outreach/courses/generate/:jobId error:", error);
    res.status(500).json({ error: "Could not cancel that job" });
  }
});
