import { Router } from "express";
import { requireAuth } from "./auth.js";
import { prisma } from "../db/prisma.js";
import * as outreachService from "../services/outreachService.js";
export const outreachRouter = Router();
outreachRouter.use(requireAuth);
// ── GET /submissions ─────────────────────────────────────────
outreachRouter.get("/submissions", async (req, res) => {
    try {
        const { status, type, projectId, platform, from, to } = req.query;
        const filters = {};
        if (status)
            filters.status = status;
        if (type)
            filters.type = type;
        if (projectId && typeof projectId === "string")
            filters.projectId = projectId;
        if (from && typeof from === "string")
            filters.from = new Date(from);
        if (to && typeof to === "string")
            filters.to = new Date(to);
        // platform filter: comma-separated list → filter by any matching platform
        // (applied post-query since Prisma array contains is per-element)
        let submissions = await outreachService.listSubmissions(filters);
        if (platform && typeof platform === "string") {
            const platforms = platform.split(",").map((p) => p.trim()).filter(Boolean);
            if (platforms.length > 0) {
                submissions = submissions.filter((s) => platforms.some((p) => s.platform.includes(p)));
            }
        }
        res.json(submissions);
    }
    catch (error) {
        console.error("GET /submissions error:", error);
        res.status(500).json({ error: "Failed to list submissions" });
    }
});
// ── GET /submissions/:id ─────────────────────────────────────
outreachRouter.get("/submissions/:id", async (req, res) => {
    try {
        const submission = await outreachService.getSubmission(req.params.id);
        if (!submission) {
            res.status(404).json({ error: "Submission not found" });
            return;
        }
        res.json(submission);
    }
    catch (error) {
        console.error("GET /submissions/:id error:", error);
        res.status(500).json({ error: "Failed to get submission" });
    }
});
// ── POST /submissions ────────────────────────────────────────
outreachRouter.post("/submissions", async (req, res) => {
    try {
        const { title, type, content, mediaUrls, platform, projectId, eventId, scheduledAt, } = req.body;
        if (!title || !type) {
            res.status(400).json({ error: "title and type are required" });
            return;
        }
        const submission = await outreachService.createSubmission({
            title,
            type,
            content,
            mediaUrls,
            platform,
            projectId,
            eventId,
            authorId: req.session.memberId,
            scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined,
        });
        res.status(201).json(submission);
    }
    catch (error) {
        console.error("POST /submissions error:", error);
        res.status(500).json({ error: "Failed to create submission" });
    }
});
// ── PATCH /submissions/:id ───────────────────────────────────
outreachRouter.patch("/submissions/:id", async (req, res) => {
    try {
        const submission = await outreachService.getSubmission(req.params.id);
        if (!submission) {
            res.status(404).json({ error: "Submission not found" });
            return;
        }
        // Check: author or admin
        if (submission.authorId !== req.session.memberId) {
            const member = await prisma.member.findUnique({
                where: { id: req.session.memberId },
                select: { isAdmin: true },
            });
            if (!member?.isAdmin) {
                res.status(403).json({ error: "Forbidden" });
                return;
            }
        }
        const { title, type, status, content, mediaUrls, platform, projectId, eventId, reviewNote, scheduledAt, } = req.body;
        const updated = await outreachService.updateSubmission(req.params.id, {
            title,
            type,
            status,
            content,
            mediaUrls,
            platform,
            projectId,
            eventId,
            reviewNote,
            scheduledAt: scheduledAt != null ? new Date(scheduledAt) : scheduledAt,
        });
        res.json(updated);
    }
    catch (error) {
        console.error("PATCH /submissions/:id error:", error);
        res.status(500).json({ error: "Failed to update submission" });
    }
});
// ── DELETE /submissions/:id ──────────────────────────────────
outreachRouter.delete("/submissions/:id", async (req, res) => {
    try {
        const submission = await outreachService.getSubmission(req.params.id);
        if (!submission) {
            res.status(404).json({ error: "Submission not found" });
            return;
        }
        // Check: author or admin
        if (submission.authorId !== req.session.memberId) {
            const member = await prisma.member.findUnique({
                where: { id: req.session.memberId },
                select: { isAdmin: true },
            });
            if (!member?.isAdmin) {
                res.status(403).json({ error: "Forbidden" });
                return;
            }
        }
        await outreachService.deleteSubmission(req.params.id);
        res.json({ ok: true });
    }
    catch (error) {
        console.error("DELETE /submissions/:id error:", error);
        res.status(500).json({ error: "Failed to delete submission" });
    }
});
// ── POST /submissions/:id/review ─────────────────────────────
outreachRouter.post("/submissions/:id/review", async (req, res) => {
    try {
        // Admin only
        const member = await prisma.member.findUnique({
            where: { id: req.session.memberId },
            select: { isAdmin: true },
        });
        if (!member?.isAdmin) {
            res.status(403).json({ error: "Forbidden" });
            return;
        }
        const { status, note } = req.body;
        if (!status || !["APPROVED", "REJECTED", "IN_REVIEW"].includes(status)) {
            res.status(400).json({ error: "status must be APPROVED, REJECTED, or IN_REVIEW" });
            return;
        }
        const submission = await outreachService.getSubmission(req.params.id);
        if (!submission) {
            res.status(404).json({ error: "Submission not found" });
            return;
        }
        const updated = await outreachService.reviewSubmission(req.params.id, req.session.memberId, status, note);
        res.json(updated);
    }
    catch (error) {
        console.error("POST /submissions/:id/review error:", error);
        res.status(500).json({ error: "Failed to review submission" });
    }
});
// ── GET /recommendations ─────────────────────────────────────
outreachRouter.get("/recommendations", async (_req, res) => {
    try {
        const digest = await outreachService.getOutreachDigest();
        res.json(digest);
    }
    catch (error) {
        console.error("GET /recommendations error:", error);
        res.status(500).json({ error: "Failed to get recommendations" });
    }
});
// ── GET /calendar ────────────────────────────────────────────
outreachRouter.get("/calendar", async (req, res) => {
    try {
        const { from, to } = req.query;
        if (!from || typeof from !== "string" || !to || typeof to !== "string") {
            res.status(400).json({ error: "from and to query params (ISO dates) are required" });
            return;
        }
        const fromDate = new Date(from);
        const toDate = new Date(to);
        if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
            res.status(400).json({ error: "from and to must be valid ISO dates" });
            return;
        }
        const calendar = await outreachService.getContentCalendar(fromDate, toDate);
        res.json(calendar);
    }
    catch (error) {
        console.error("GET /calendar error:", error);
        res.status(500).json({ error: "Failed to get content calendar" });
    }
});
// ── GET /submissions/:id/comments ──────────────────────────────
outreachRouter.get("/submissions/:id/comments", async (req, res) => {
    try {
        const comments = await outreachService.listComments(req.params.id);
        res.json(comments);
    }
    catch (error) {
        console.error("GET /submissions/:id/comments error:", error);
        res.status(500).json({ error: "Failed to list comments" });
    }
});
// ── POST /submissions/:id/comments ─────────────────────────────
outreachRouter.post("/submissions/:id/comments", async (req, res) => {
    try {
        const { body, mentions, parentId } = req.body;
        if (!body?.trim()) {
            res.status(400).json({ error: "body is required" });
            return;
        }
        const comment = await outreachService.addComment(req.params.id, req.session.memberId, body, mentions, parentId);
        res.status(201).json(comment);
    }
    catch (error) {
        console.error("POST /submissions/:id/comments error:", error);
        res.status(500).json({ error: "Failed to add comment" });
    }
});
//# sourceMappingURL=outreach.js.map