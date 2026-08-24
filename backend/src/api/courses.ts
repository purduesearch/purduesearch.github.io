import { Router, type Request, type Response } from "express";
import multer from "multer";
import { requireAuth } from "./auth.js";
import { prisma } from "../db/prisma.js";
import * as courseService from "../services/courseService.js";
import * as progressService from "../services/courseProgressService.js";
import { logAuditEvent } from "../services/activityService.js";
import { replaceCourseSectionContent } from "../collab/courseCollab.js";
import type { PMDoc } from "../services/blogRender.js";
import type { CourseSectionKind, CourseQuestionKind } from "@prisma/client";

// Decks are streamed straight to Drive for conversion, so memory storage is
// fine and no temp directory is needed. 60 MB covers a large slide deck.
const deckUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 60 * 1024 * 1024, files: 1 },
});

export const coursesRouter = Router();
coursesRouter.use(requireAuth);

async function isAdmin(memberId?: string): Promise<boolean> {
  if (!memberId) return false;
  const m = await prisma.member.findUnique({ where: { id: memberId }, select: { isAdmin: true } });
  return !!m?.isAdmin;
}

// Write permission everywhere below: course.createdById === req.memberId || member.isAdmin.
// Author-or-admin guard for a course; returns the course or null (and sends the response).
async function requireCourseAccess(req: Request, res: Response, courseId: string) {
  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course) {
    res.status(404).json({ error: "Course not found" });
    return null;
  }
  if (course.createdById !== req.memberId && !(await isAdmin(req.memberId))) {
    res.status(403).json({ error: "Forbidden" });
    return null;
  }
  return course;
}

// Same guard, entered from a section id. Returns { section, course } or null.
async function requireSectionAccess(req: Request, res: Response, sectionId: string) {
  const section = await prisma.courseSection.findUnique({
    where: { id: sectionId },
    include: { course: { select: { id: true, createdById: true } } },
  });
  if (!section) {
    res.status(404).json({ error: "Section not found" });
    return null;
  }
  if (section.course.createdById !== req.memberId && !(await isAdmin(req.memberId))) {
    res.status(403).json({ error: "Forbidden" });
    return null;
  }
  return section;
}

// Same guard, entered from a module id. Returns the module or null.
async function requireModuleAccess(req: Request, res: Response, moduleId: string) {
  const mod = await prisma.courseModule.findUnique({
    where: { id: moduleId },
    include: { course: { select: { id: true, createdById: true } } },
  });
  if (!mod) {
    res.status(404).json({ error: "Module not found" });
    return null;
  }
  if (mod.course.createdById !== req.memberId && !(await isAdmin(req.memberId))) {
    res.status(403).json({ error: "Forbidden" });
    return null;
  }
  return mod;
}

// ── Catalog ──────────────────────────────────────────────────

// GET / — published courses plus the caller's own drafts, with their progress.
coursesRouter.get("/", async (req: Request, res: Response) => {
  try {
    const memberId = req.memberId!;
    const admin = await isAdmin(memberId);
    const courses = await courseService.listCourses({
      q: typeof req.query.q === "string" ? req.query.q : undefined,
    });
    const visible = admin
      ? courses
      : courses.filter((c) => c.status === "PUBLISHED" || c.createdById === memberId);

    const enrollments = await prisma.courseEnrollment.findMany({
      where: { memberId, courseId: { in: visible.map((c) => c.id) } },
      include: { sectionProgress: { select: { status: true } } },
    });
    const byCourse = new Map(enrollments.map((e) => [e.courseId, e]));

    res.json(
      visible.map((course) => {
        const enrollment = byCourse.get(course.id);
        const completedSections =
          enrollment?.sectionProgress.filter((p) => p.status === "COMPLETED").length ?? 0;
        return {
          ...course,
          canEdit: course.createdById === memberId || admin,
          myProgress: enrollment
            ? {
                enrollmentId: enrollment.id,
                dueDate: enrollment.dueDate,
                completedAt: enrollment.completedAt,
                completedSections,
                totalSections: course._count.sections,
              }
            : null,
        };
      })
    );
  } catch (error) {
    console.error("GET /outreach/courses error:", error);
    res.status(500).json({ error: "Failed to list courses" });
  }
});

coursesRouter.post("/", async (req: Request, res: Response) => {
  try {
    const { title, slug, summary, coverImageUrl, estimatedMinutes } = req.body as {
      title?: string;
      slug?: string;
      summary?: string;
      coverImageUrl?: string;
      estimatedMinutes?: number;
    };
    if (!title?.trim()) {
      res.status(400).json({ error: "title is required" });
      return;
    }
    const course = await courseService.createCourse({
      title: title.trim(),
      slug,
      summary,
      coverImageUrl,
      estimatedMinutes,
      createdById: req.memberId!,
    });
    res.status(201).json(course);
  } catch (error) {
    console.error("POST /outreach/courses error:", error);
    res.status(500).json({ error: "Failed to create course" });
  }
});

// GET /slide-capabilities — whether the bot account can export a linked Google
// Slides deck. MUST be registered above any /:id route or Express matches it as
// a course id (the same trap members.ts documents for /cosmetic-styles).
coursesRouter.get("/slide-capabilities", async (_req: Request, res: Response) => {
  try {
    const cred = await prisma.googleDriveCredential.findUnique({
      where: { id: "singleton" }, select: { scope: true },
    });
    const { hasDriveReadonlyScope, getBotAccountEmail } = await import("../services/driveService.js");
    res.json({
      canImportLink: hasDriveReadonlyScope(cred?.scope),
      botEmail: await getBotAccountEmail(),
    });
  } catch (error) {
    console.error("GET /outreach/courses/slide-capabilities error:", error);
    res.json({ canImportLink: false, botEmail: null });
  }
});

// ── Single course (authoring view) ───────────────────────────

// GET /:id — the AUTHORING view: every section's settings, including the
// `videoConfig` of sections a learner has not unlocked yet. Author/admin only.
// Learners read `/:slug/learn`, which withholds exactly those fields; leaving
// this open to any member on a published course handed the same data back
// through the side door.
coursesRouter.get("/:id", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const course = await courseService.getCourse(id);
    if (!course) {
      res.status(404).json({ error: "Course not found" });
      return;
    }
    const canEdit = course.createdById === req.memberId || (await isAdmin(req.memberId));
    if (!canEdit) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    res.json({ ...course, canEdit });
  } catch (error) {
    console.error("GET /outreach/courses/:id error:", error);
    res.status(500).json({ error: "Failed to get course" });
  }
});

coursesRouter.patch("/:id", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    if (!(await requireCourseAccess(req, res, id))) return;
    const updated = await courseService.updateCourse(id, req.body);
    res.json(updated);
  } catch (error) {
    console.error("PATCH /outreach/courses/:id error:", error);
    res.status(500).json({ error: "Failed to update course" });
  }
});

coursesRouter.post("/:id/publish", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    if (!(await requireCourseAccess(req, res, id))) return;
    const sectionCount = await prisma.courseSection.count({ where: { courseId: id } });
    if (sectionCount === 0) {
      res.status(400).json({ error: "A course needs at least one section before publishing" });
      return;
    }
    res.json(await courseService.publishCourse(id));
  } catch (error) {
    console.error("POST /outreach/courses/:id/publish error:", error);
    res.status(500).json({ error: "Failed to publish course" });
  }
});

coursesRouter.post("/:id/archive", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    if (!(await requireCourseAccess(req, res, id))) return;
    res.json(await courseService.archiveCourse(id));
  } catch (error) {
    console.error("POST /outreach/courses/:id/archive error:", error);
    res.status(500).json({ error: "Failed to archive course" });
  }
});

coursesRouter.delete("/:id", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    if (!(await requireCourseAccess(req, res, id))) return;
    await courseService.deleteCourse(id);
    res.json({ ok: true });
  } catch (error) {
    console.error("DELETE /outreach/courses/:id error:", error);
    res.status(500).json({ error: "Failed to delete course" });
  }
});

// ── Modules ──────────────────────────────────────────────────

coursesRouter.post("/:id/modules", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    if (!(await requireCourseAccess(req, res, id))) return;
    const { title, summary, estimatedMinutes, isRequired, sequential } = req.body as {
      title?: string;
      summary?: string | null;
      estimatedMinutes?: number | null;
      isRequired?: boolean;
      sequential?: boolean;
    };
    if (!title?.trim()) {
      res.status(400).json({ error: "title is required" });
      return;
    }
    const created = await courseService.createModule({
      courseId: id,
      title: title.trim(),
      summary,
      estimatedMinutes,
      isRequired,
      sequential,
    });
    res.status(201).json(created);
  } catch (error) {
    console.error("POST /outreach/courses/:id/modules error:", error);
    res.status(500).json({ error: "Failed to create module" });
  }
});

coursesRouter.patch("/modules/:mid", async (req: Request, res: Response) => {
  try {
    const mid = req.params.mid as string;
    if (!(await requireModuleAccess(req, res, mid))) return;
    res.json(await courseService.updateModule(mid, req.body));
  } catch (error) {
    console.error("PATCH /outreach/courses/modules/:mid error:", error);
    res.status(500).json({ error: "Failed to update module" });
  }
});

// Deletes the module AND its sections (and their questions, progress and quiz
// attempts, by cascade). The client confirms with the section count named.
coursesRouter.delete("/modules/:mid", async (req: Request, res: Response) => {
  try {
    const mid = req.params.mid as string;
    if (!(await requireModuleAccess(req, res, mid))) return;
    await courseService.deleteModule(mid);
    res.json({ ok: true });
  } catch (error) {
    console.error("DELETE /outreach/courses/modules/:mid error:", error);
    res.status(500).json({ error: "Failed to delete module" });
  }
});

// PUT /:id/structure — the whole module/section tree, one transaction. Replaces
// the old sections-order endpoint: a cross-module drag must not half-apply.
coursesRouter.put("/:id/structure", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    if (!(await requireCourseAccess(req, res, id))) return;
    const { tree } = req.body as { tree?: courseService.StructureModule[] };
    if (!Array.isArray(tree)) {
      res.status(400).json({ error: "tree must be an array" });
      return;
    }
    res.json(await courseService.saveStructure(id, tree));
  } catch (error) {
    if (error instanceof courseService.StructureMismatchError) {
      res.status(400).json({ error: error.message });
      return;
    }
    console.error("PUT /outreach/courses/:id/structure error:", error);
    res.status(500).json({ error: "Failed to save course structure" });
  }
});

// ── Sections ─────────────────────────────────────────────────

coursesRouter.post("/:id/sections", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    if (!(await requireCourseAccess(req, res, id))) return;
    const {
      moduleId, title, kind, isRequired, videoConfig, slideConfig, passThreshold, maxAttempts,
    } = req.body as {
      moduleId?: string;
      title?: string;
      kind?: CourseSectionKind;
      isRequired?: boolean;
      videoConfig?: Record<string, unknown> | null;
      slideConfig?: Record<string, unknown> | null;
      passThreshold?: number | null;
      maxAttempts?: number | null;
    };
    if (!title?.trim()) {
      res.status(400).json({ error: "title is required" });
      return;
    }
    if (!moduleId?.trim()) {
      res.status(400).json({ error: "moduleId is required" });
      return;
    }
    const owns = await prisma.courseModule.findFirst({
      where: { id: moduleId, courseId: id },
      select: { id: true },
    });
    if (!owns) {
      res.status(400).json({ error: "moduleId does not belong to this course" });
      return;
    }
    const section = await courseService.createSection({
      courseId: id,
      moduleId,
      title: title.trim(),
      kind,
      isRequired,
      videoConfig,
      slideConfig,
      passThreshold,
      maxAttempts,
    });
    res.status(201).json(section);
  } catch (error) {
    console.error("POST /outreach/courses/:id/sections error:", error);
    res.status(500).json({ error: "Failed to create section" });
  }
});

// GET /sections/:sid — one section including `contentJson`, which the tree
// endpoints omit. This is what the editor seeds its document from when the
// collab socket never syncs; see courseService.getSection.
coursesRouter.get("/sections/:sid", async (req: Request, res: Response) => {
  try {
    const sid = req.params.sid as string;
    if (!(await requireSectionAccess(req, res, sid))) return;
    const section = await courseService.getSection(sid);
    if (!section) {
      res.status(404).json({ error: "Section not found" });
      return;
    }
    res.json(section);
  } catch (error) {
    console.error("GET /outreach/courses/sections/:sid error:", error);
    res.status(500).json({ error: "Failed to load section" });
  }
});

coursesRouter.patch("/sections/:sid", async (req: Request, res: Response) => {
  try {
    const sid = req.params.sid as string;
    if (!(await requireSectionAccess(req, res, sid))) return;
    // req.memberId, never req.session.memberId — Bearer-token users have no
    // session, and this is what stamps the pre-overwrite snapshot's author.
    res.json(await courseService.updateSection(sid, req.body, req.memberId));
  } catch (error) {
    console.error("PATCH /outreach/courses/sections/:sid error:", error);
    res.status(500).json({ error: "Failed to update section" });
  }
});

// ── Section revisions ────────────────────────────────────────
// Same surface as the blog's (GET list / PATCH name / POST rollback) so the
// editor reuses RevisionHistoryDrawer rather than growing a second one.

coursesRouter.get("/sections/:sid/revisions", async (req: Request, res: Response) => {
  try {
    const sid = req.params.sid as string;
    if (!(await requireSectionAccess(req, res, sid))) return;
    res.json(await courseService.listSectionRevisions(sid));
  } catch (error) {
    console.error("GET /outreach/courses/sections/:sid/revisions error:", error);
    res.status(500).json({ error: "Failed to list revisions" });
  }
});

// An empty or whitespace-only name clears it, which is how the drawer un-names
// a version.
coursesRouter.patch("/sections/:sid/revisions/:revId", async (req: Request, res: Response) => {
  try {
    const sid = req.params.sid as string;
    if (!(await requireSectionAccess(req, res, sid))) return;
    const raw = req.body?.name;
    const name = typeof raw === "string" ? raw.trim().slice(0, 120) : null;
    const updated = await courseService.renameSectionRevision(sid, String(req.params.revId), name);
    if (!updated) {
      res.status(404).json({ error: "Revision not found" });
      return;
    }
    res.json(updated);
  } catch (error) {
    console.error("PATCH /outreach/courses/sections/:sid/revisions/:revId error:", error);
    res.status(500).json({ error: "Failed to rename revision" });
  }
});

coursesRouter.post("/sections/:sid/revisions/:revId/rollback", async (req: Request, res: Response) => {
  try {
    const sid = req.params.sid as string;
    if (!(await requireSectionAccess(req, res, sid))) return;
    const section = await courseService.rollbackSectionRevision(
      sid,
      String(req.params.revId),
      req.memberId!
    );
    // The live Yjs document is authoritative while anyone has the section open,
    // so a DB-only write would be invisible (and then overwritten by the next
    // collab store). Push the restored body into the live doc as well.
    await replaceCourseSectionContent(sid, section.contentJson as unknown as PMDoc);
    res.json(section);
  } catch (error) {
    if (error instanceof Error && error.message === "Revision not found") {
      res.status(404).json({ error: error.message });
      return;
    }
    console.error("POST /outreach/courses/sections/:sid/revisions/:revId/rollback error:", error);
    res.status(500).json({ error: "Failed to roll back" });
  }
});

coursesRouter.delete("/sections/:sid", async (req: Request, res: Response) => {
  try {
    const sid = req.params.sid as string;
    if (!(await requireSectionAccess(req, res, sid))) return;
    await courseService.deleteSection(sid);
    res.json({ ok: true });
  } catch (error) {
    console.error("DELETE /outreach/courses/sections/:sid error:", error);
    res.status(500).json({ error: "Failed to delete section" });
  }
});

// ── Questions ────────────────────────────────────────────────

// GET /sections/:sid/questions — `isCorrect` and `explanation` are included ONLY
// for editors. This strip is the entire reason questions live in Prisma rather
// than in the section's TipTap document: a learner's browser must never receive
// the answer key.
coursesRouter.get("/sections/:sid/questions", async (req: Request, res: Response) => {
  try {
    const sid = req.params.sid as string;
    const section = await prisma.courseSection.findUnique({
      where: { id: sid },
      include: { course: { select: { id: true, createdById: true, status: true } } },
    });
    if (!section) {
      res.status(404).json({ error: "Section not found" });
      return;
    }
    const editor =
      section.course.createdById === req.memberId || (await isAdmin(req.memberId));
    if (!editor) {
      if (section.course.status !== "PUBLISHED") {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      // Same gate the content payload uses: a locked section's questions are
      // withheld too, or the prompts of a quiz nobody has reached yet are one
      // fetch away.
      if (!(await progressService.isSectionUnlockedForMember(sid, req.memberId!))) {
        res.status(403).json({ error: "Section is locked" });
        return;
      }
    }

    const questions = await courseService.listQuestions(sid);
    if (editor) {
      // Unclamped on purpose: the workbench flags a slideIndex past the end of
      // the deck, and it can only do that if it sees the stored value.
      res.json(questions);
      return;
    }

    // A re-import can shorten a deck out from under a question. The row is
    // clamped, never deleted (clampQuestionSlideIndex) — but the learner must
    // be shown it on a slide they can actually reach, because completion
    // requires every overlay question to be answered. Left unclamped, a stray
    // question is unreachable and the section can never be completed.
    let slideCount = 0;
    if (section.kind === "SLIDES" && questions.some((q) => q.slideIndex != null)) {
      slideCount = await prisma.courseSlide.count({ where: { sectionId: sid } });
    }
    const { clampQuestionSlideIndex } = await import("../services/courseSlideService.js");

    res.json(
      questions.map((q) => ({
        id: q.id,
        sectionId: q.sectionId,
        order: q.order,
        prompt: q.prompt,
        kind: q.kind,
        points: q.points,
        videoTimestampSec: q.videoTimestampSec,
        slideIndex: section.kind === "SLIDES"
          ? clampQuestionSlideIndex(q.slideIndex, slideCount)
          : q.slideIndex,
        answers: q.answers.map((a) => ({ id: a.id, order: a.order, text: a.text })),
      }))
    );
  } catch (error) {
    console.error("GET /outreach/courses/sections/:sid/questions error:", error);
    res.status(500).json({ error: "Failed to list questions" });
  }
});

// PUT /sections/:sid/questions — replace the whole question set.
coursesRouter.put("/sections/:sid/questions", async (req: Request, res: Response) => {
  try {
    const sid = req.params.sid as string;
    if (!(await requireSectionAccess(req, res, sid))) return;
    const { questions, scope } = req.body as {
      questions?: {
        id?: string;
        order?: number;
        prompt?: string;
        kind?: CourseQuestionKind;
        explanation?: string | null;
        points?: number;
        videoTimestampSec?: number | null;
        slideIndex?: number | null;
        rewindToSec?: number | null;
        answers?: { order?: number; text?: string; isCorrect?: boolean }[];
      }[];
      scope?: courseService.QuestionScope;
    };
    if (!Array.isArray(questions)) {
      res.status(400).json({ error: "questions must be an array" });
      return;
    }
    if (questions.some((q) => !q.prompt?.trim() || !Array.isArray(q.answers) || !q.answers.length)) {
      res.status(400).json({ error: "Every question needs a prompt and at least one answer" });
      return;
    }
    const saved = await courseService.replaceQuestions(
      sid,
      // `id` is forwarded so an existing question is updated rather than dropped
      // and recreated — recreating cascades its CourseQuestionResponse rows away
      // and takes the item analysis with them.
      questions.map((q) => ({
        id: q.id,
        order: q.order,
        prompt: q.prompt!.trim(),
        kind: q.kind,
        explanation: q.explanation,
        points: q.points,
        videoTimestampSec: q.videoTimestampSec,
        slideIndex: q.slideIndex,
        rewindToSec: q.rewindToSec,
        answers: (q.answers ?? []).map((a) => ({
          order: a.order,
          text: (a.text ?? "").trim(),
          isCorrect: a.isCorrect,
        })),
      })),
      scope === "quiz" || scope === "popup" ? scope : "all"
    );
    res.json(saved);
  } catch (error) {
    console.error("PUT /outreach/courses/sections/:sid/questions error:", error);
    res.status(500).json({ error: "Failed to save questions" });
  }
});

coursesRouter.post("/sections/:sid/questions", async (req: Request, res: Response) => {
  try {
    const sid = req.params.sid as string;
    if (!(await requireSectionAccess(req, res, sid))) return;
    const {
      id, order, prompt, kind, explanation, points,
      videoTimestampSec, slideIndex, rewindToSec, answers,
    } =
      req.body as {
        id?: string;
        order?: number;
        prompt?: string;
        kind?: CourseQuestionKind;
        explanation?: string | null;
        points?: number;
        videoTimestampSec?: number | null;
        slideIndex?: number | null;
        rewindToSec?: number | null;
        answers?: { id?: string; order?: number; text?: string; isCorrect?: boolean }[];
      };
    if (!prompt?.trim()) {
      res.status(400).json({ error: "prompt is required" });
      return;
    }
    if (!Array.isArray(answers) || !answers.length) {
      res.status(400).json({ error: "at least one answer is required" });
      return;
    }
    const question = await courseService.upsertQuestion({
      id,
      sectionId: sid,
      order,
      prompt: prompt.trim(),
      kind,
      explanation,
      points,
      videoTimestampSec,
      slideIndex,
      rewindToSec,
      answers: answers.map((a, i) => ({
        order: a.order ?? i,
        text: (a.text ?? "").trim(),
        isCorrect: a.isCorrect,
      })),
    });
    res.status(id ? 200 : 201).json(question);
  } catch (error) {
    console.error("POST /outreach/courses/sections/:sid/questions error:", error);
    res.status(500).json({ error: "Failed to save question" });
  }
});

coursesRouter.delete("/sections/:sid/questions/:qid", async (req: Request, res: Response) => {
  try {
    const sid = req.params.sid as string;
    if (!(await requireSectionAccess(req, res, sid))) return;
    const question = await prisma.courseQuestion.findUnique({
      where: { id: req.params.qid as string },
      select: { sectionId: true },
    });
    if (!question || question.sectionId !== sid) {
      res.status(404).json({ error: "Question not found" });
      return;
    }
    await courseService.deleteQuestion(req.params.qid as string);
    res.json({ ok: true });
  } catch (error) {
    console.error("DELETE /outreach/courses/sections/:sid/questions/:qid error:", error);
    res.status(500).json({ error: "Failed to delete question" });
  }
});

// ── Slides ───────────────────────────────────────────────────
//
// The capabilities probe lives further up, above GET /:id, so Express does not
// match "slide-capabilities" as a course id.

// Node's stream.pipe() does NOT forward errors, so an `error` on a Drive export
// stream is an unhandled emitter error — an uncaught exception that takes the
// whole process down. Every deck stream goes out through here instead.
function pipeDeckPdf(stream: NodeJS.ReadableStream, res: Response, onDone?: () => void) {
  res.setHeader("Content-Type", "application/pdf");
  stream.on("error", (err) => {
    console.error("POST /outreach/courses/sections/:sid/deck/source stream error:", err);
    if (!res.headersSent) res.status(502).json({ error: "Could not read that deck from Drive" });
    else res.destroy();
  });
  if (onDone) res.on("close", onDone);
  stream.pipe(res);
}

// POST /sections/:sid/deck/source — normalize any deck source to a PDF and
// stream it back. The ONLY place Drive's conversion machinery is touched;
// everything downstream of "we have a PDF" is shared browser code.
//
// Body is either multipart with a `deck` file (.pptx or .pdf) or JSON { url }.
coursesRouter.post(
  "/sections/:sid/deck/source",
  deckUpload.single("deck"),
  async (req: Request, res: Response) => {
    try {
      const sid = req.params.sid as string;
      if (!(await requireSectionAccess(req, res, sid))) return;

      const drive = await import("../services/driveService.js");

      // A .pdf never needs the server at all, but accepting it keeps the client
      // to one code path when the author does upload one here.
      if (req.file && req.file.mimetype === "application/pdf") {
        res.setHeader("Content-Type", "application/pdf");
        res.send(req.file.buffer);
        return;
      }

      if (req.file) {
        const folderId = await drive.ensureClubPmRootFolder();
        if (!folderId) {
          res.status(503).json({ error: "Google Drive is not connected" });
          return;
        }
        const { Readable } = await import("node:stream");
        const converted = await drive.convertUploadToPdf(
          Readable.from(req.file.buffer),
          req.file.mimetype,
          req.file.originalname || "deck.pptx",
          folderId
        );
        if (!converted) {
          res.status(502).json({ error: "Could not convert that presentation" });
          return;
        }
        // The converted Google Slides copy is scratch space; leaving it behind
        // leaks one Drive file per import.
        pipeDeckPdf(converted.stream, res, () => {
          void drive.deleteDriveFile(converted.tempFileId);
        });
        return;
      }

      const { url } = req.body as { url?: string };
      if (!url?.trim()) {
        res.status(400).json({ error: "Upload a file or provide a Google Slides link" });
        return;
      }
      const fileId = drive.extractFileId(url.trim());
      if (!fileId) {
        res.status(400).json({ error: "That does not look like a Google Slides link" });
        return;
      }
      const result = await drive.exportDriveFileAsPdf(fileId);
      if ("error" in result) {
        const botEmail = await drive.getBotAccountEmail();
        const message = result.error === "FORBIDDEN" || result.error === "NOT_FOUND"
          ? `Share that deck with ${botEmail ?? "the SEARCH bot account"} (view access is enough), then try again`
          : "Google Drive is not available right now";
        res.status(result.error === "UNAVAILABLE" ? 503 : 403).json({ error: message });
        return;
      }
      pipeDeckPdf(result.stream, res);
    } catch (error) {
      console.error("POST /outreach/courses/sections/:sid/deck/source error:", error);
      if (!res.headersSent) res.status(500).json({ error: "Could not load that deck" });
    }
  }
);

// Slide PNGs arrive as multipart, ONE REQUEST PER PAGE — never base64 JSON,
// which app.ts's default 100 kb express.json() limit would reject outright.
const slideUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
});
const audioUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 80 * 1024 * 1024, files: 1 },
});

coursesRouter.get("/sections/:sid/slides", async (req: Request, res: Response) => {
  try {
    const sid = req.params.sid as string;
    if (!(await requireSectionAccess(req, res, sid))) return;
    const slideService = await import("../services/courseSlideService.js");
    res.json(await slideService.listSlides(sid));
  } catch (error) {
    console.error("GET /outreach/courses/sections/:sid/slides error:", error);
    res.status(500).json({ error: "Failed to list slides" });
  }
});

// One page per request. Fields: image (file), index, text, width, height.
coursesRouter.post(
  "/sections/:sid/slides",
  slideUpload.single("image"),
  async (req: Request, res: Response) => {
    try {
      const sid = req.params.sid as string;
      if (!(await requireSectionAccess(req, res, sid))) return;
      if (!req.file) { res.status(400).json({ error: "image is required" }); return; }
      const index = Number.parseInt(String(req.body.index ?? ""), 10);
      if (!Number.isFinite(index) || index < 0) {
        res.status(400).json({ error: "index is required" });
        return;
      }
      const slideService = await import("../services/courseSlideService.js");
      const slide = await slideService.addSlide({
        sectionId: sid,
        index,
        imageBase64: req.file.buffer.toString("base64"),
        text: typeof req.body.text === "string" ? req.body.text.slice(0, 20000) : null,
        width: Number.parseInt(String(req.body.width ?? ""), 10) || null,
        height: Number.parseInt(String(req.body.height ?? ""), 10) || null,
      });
      res.status(201).json(slide);
    } catch (error) {
      console.error("POST /outreach/courses/sections/:sid/slides error:", error);
      res.status(500).json({ error: "Failed to store that slide" });
    }
  }
);

coursesRouter.put("/sections/:sid/slides", async (req: Request, res: Response) => {
  try {
    const sid = req.params.sid as string;
    if (!(await requireSectionAccess(req, res, sid))) return;
    const { slides } = req.body as {
      slides?: { id: string; notes?: string | null; startSec?: number | null }[];
    };
    if (!Array.isArray(slides)) { res.status(400).json({ error: "slides must be an array" }); return; }
    const slideService = await import("../services/courseSlideService.js");
    res.json(await slideService.updateSlideMeta(sid, slides));
  } catch (error) {
    console.error("PUT /outreach/courses/sections/:sid/slides error:", error);
    res.status(500).json({ error: "Failed to save slide details" });
  }
});

// No body → clear the whole deck. { ids } → delete only those, which is how a
// re-import removes the OLD pages after the new ones are safely stored.
coursesRouter.delete("/sections/:sid/slides", async (req: Request, res: Response) => {
  try {
    const sid = req.params.sid as string;
    if (!(await requireSectionAccess(req, res, sid))) return;
    const { ids } = (req.body ?? {}) as { ids?: string[] };
    const slideService = await import("../services/courseSlideService.js");
    await slideService.clearDeck(sid, Array.isArray(ids) ? ids : undefined);
    res.json({ ok: true });
  } catch (error) {
    console.error("DELETE /outreach/courses/sections/:sid/slides error:", error);
    res.status(500).json({ error: "Failed to clear the deck" });
  }
});

coursesRouter.post(
  "/sections/:sid/audio",
  audioUpload.single("audio"),
  async (req: Request, res: Response) => {
    try {
      const sid = req.params.sid as string;
      if (!(await requireSectionAccess(req, res, sid))) return;
      if (!req.file) { res.status(400).json({ error: "audio is required" }); return; }
      const { Readable } = await import("node:stream");
      const slideService = await import("../services/courseSlideService.js");
      res.json(await slideService.setAudio(
        sid, Readable.from(req.file.buffer), req.file.mimetype,
        req.file.originalname || "narration.mp3"
      ));
    } catch (error) {
      console.error("POST /outreach/courses/sections/:sid/audio error:", error);
      res.status(500).json({ error: "Failed to store that audio" });
    }
  }
);

coursesRouter.delete("/sections/:sid/audio", async (req: Request, res: Response) => {
  try {
    const sid = req.params.sid as string;
    if (!(await requireSectionAccess(req, res, sid))) return;
    const slideService = await import("../services/courseSlideService.js");
    res.json(await slideService.clearAudio(sid));
  } catch (error) {
    console.error("DELETE /outreach/courses/sections/:sid/audio error:", error);
    res.status(500).json({ error: "Failed to clear that audio" });
  }
});

// ── Learner ──────────────────────────────────────────────────
//
// Every route below re-enters the server-side gate; none of them trust anything
// the client says about what it is allowed to see.
//
// RESPONSE-SHAPE CONTRACT: each completion route merges
// `{ ...actorReward, progressMilestones, achievementUnlocks }` into its JSON
// body exactly as `tasks.ts` PATCH /:id does. That merge is the whole reason
// RewardFlux, QuestCompleteToast, the rank-up modal and cosmetic unlocks fire —
// `clubPmClient.js` inspects every response body, so no new frontend listener
// component is needed. Do not nest these under a sub-key.
async function withRewardEnvelope(
  memberId: string,
  since: Date,
  body: Record<string, unknown>,
  effects: {
    actorReward?: import("../services/rewardService.js").ActorRewardSummary | null;
    progressMilestones?: unknown[];
  }
): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = { ...body };
  if (effects.actorReward) Object.assign(out, effects.actorReward);
  if (effects.progressMilestones?.length) out.progressMilestones = effects.progressMilestones;
  const achievementUnlocks = await progressService.collectAchievementUnlocks(memberId, since);
  if (achievementUnlocks.length) out.achievementUnlocks = achievementUnlocks;
  return out;
}

// A service call returning `{ error, status }` is a gate refusal, not a crash.
function isServiceError(v: unknown): v is { error: string; status: number } {
  return !!v && typeof v === "object" && "error" in v && "status" in v;
}

// GET /:slug/learn — the gated learner payload. Locked sections come back
// WITHOUT `contentJson` / `videoConfig`; they are omitted from the payload, not
// hidden in the UI.
coursesRouter.get("/:slug/learn", async (req: Request, res: Response) => {
  try {
    // ?preview=1 — author/admin only (the service re-checks): unlocks everything
    // and creates no enrollment, so previewing your own course does not put you
    // in its completion matrix as a learner who never finished.
    const payload = await progressService.getLearnerCourse(
      req.params.slug as string,
      req.memberId!,
      { preview: req.query.preview === "1" || req.query.preview === "true" }
    );
    if (!payload) {
      res.status(404).json({ error: "Course not found" });
      return;
    }
    res.json(payload);
  } catch (error) {
    console.error("GET /outreach/courses/:slug/learn error:", error);
    res.status(500).json({ error: "Failed to load course" });
  }
});

coursesRouter.post("/sections/:sid/video-progress", async (req: Request, res: Response) => {
  try {
    const { positionSec } = req.body as { positionSec?: number };
    if (typeof positionSec !== "number" || !Number.isFinite(positionSec) || positionSec < 0) {
      res.status(400).json({ error: "positionSec must be a non-negative number" });
      return;
    }
    const result = await progressService.recordVideoProgress(
      req.params.sid as string,
      req.memberId!,
      positionSec
    );
    if (isServiceError(result)) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json(result);
  } catch (error) {
    console.error("POST /outreach/courses/sections/:sid/video-progress error:", error);
    res.status(500).json({ error: "Failed to record progress" });
  }
});

coursesRouter.post("/sections/:sid/slide-progress", async (req: Request, res: Response) => {
  try {
    const index = Number.parseInt(String((req.body as { index?: unknown }).index ?? ""), 10);
    if (!Number.isFinite(index)) {
      res.status(400).json({ error: "index is required" });
      return;
    }
    const result = await progressService.recordSlideProgress(
      req.params.sid as string,
      req.memberId!,
      index
    );
    if (isServiceError(result)) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json(result);
  } catch (error) {
    console.error("POST /outreach/courses/sections/:sid/slide-progress error:", error);
    res.status(500).json({ error: "Failed to record progress" });
  }
});

coursesRouter.post("/sections/:sid/tour-progress", async (req: Request, res: Response) => {
  try {
    const stepIndex = Number.parseInt(
      String((req.body as { stepIndex?: unknown }).stepIndex ?? ""),
      10
    );
    if (!Number.isFinite(stepIndex)) {
      res.status(400).json({ error: "stepIndex is required" });
      return;
    }
    // CONVENTION: req.memberId, never req.session.memberId — session reads are
    // undefined for Bearer-token users and silently break them.
    const result = await progressService.recordTourProgress(
      req.params.sid as string,
      req.memberId!,
      stepIndex
    );
    if (isServiceError(result)) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json(result);
  } catch (error) {
    console.error("POST /outreach/courses/sections/:sid/tour-progress error:", error);
    res.status(500).json({ error: "Failed to record progress" });
  }
});

// A learner whose step could not be anchored reports it here. This is the only
// signal that a UI rename broke a live tour for someone the CI gate missed, so
// it must never surface as an error to the learner mid-tour — they are already
// looking at the degraded card. Always 200.
coursesRouter.post("/sections/:sid/tour-breakage", async (req: Request, res: Response) => {
  try {
    const { stepId, anchor, pathname } = req.body as {
      stepId?: string; anchor?: string; pathname?: string;
    };
    // ActivityLog.projectId is a required FK, so a breakage is attributed to the
    // reporter's training project. Tours that run outside the sandbox have no
    // project to hang the row on and are counted only in the server log.
    const training = await prisma.project.findUnique({
      where: { trainingForMemberId: req.memberId! },
      select: { id: true },
    });
    if (training) {
      await logAuditEvent({
        projectId: training.id,
        memberId: req.memberId!,
        source: "WEB",
        eventType: "TOUR_STEP_BROKEN",
        payload: { sectionId: req.params.sid, stepId, anchor, pathname },
      });
    } else {
      console.warn(
        `tour breakage (no training project): section=${req.params.sid} anchor=${anchor} path=${pathname}`
      );
    }
    res.json({ ok: true });
  } catch (error) {
    console.error("POST /outreach/courses/sections/:sid/tour-breakage error:", error);
    res.json({ ok: true });
  }
});

coursesRouter.get("/sections/:sid/tour-breakages", async (req: Request, res: Response) => {
  try {
    // Authoring data, not learner data: it names anchor ids and the routes
    // learners were on when a step failed. Only the course's author or an admin
    // has any use for it, and the panel that reads it is admin-only already.
    if (!(await requireSectionAccess(req, res, req.params.sid as string))) return;
    // Filtered in the query, not after a take(50) — otherwise busy sections
    // elsewhere would crowd this one out of the window entirely.
    const rows = await prisma.activityLog.findMany({
      where: {
        eventType: "TOUR_STEP_BROKEN",
        payload: { path: ["sectionId"], equals: req.params.sid as string },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    res.json(rows);
  } catch (error) {
    console.error("GET /outreach/courses/sections/:sid/tour-breakages error:", error);
    res.status(500).json({ error: "Failed to load breakages" });
  }
});

coursesRouter.post("/sections/:sid/popup-answer", async (req: Request, res: Response) => {
  try {
    const { questionId, answerIds } = req.body as { questionId?: string; answerIds?: string[] };
    if (!questionId) {
      res.status(400).json({ error: "questionId is required" });
      return;
    }
    const result = await progressService.recordPopupAnswer(
      req.params.sid as string,
      req.memberId!,
      questionId,
      Array.isArray(answerIds) ? answerIds : []
    );
    if (isServiceError(result)) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json(result);
  } catch (error) {
    console.error("POST /outreach/courses/sections/:sid/popup-answer error:", error);
    res.status(500).json({ error: "Failed to record answer" });
  }
});

coursesRouter.post("/sections/:sid/complete", async (req: Request, res: Response) => {
  const requestStartedAt = new Date();
  try {
    const result = await progressService.completeSection(
      req.params.sid as string,
      req.memberId!
    );
    if (isServiceError(result)) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json(
      await withRewardEnvelope(
        req.memberId!,
        requestStartedAt,
        { ok: true, alreadyComplete: result.alreadyComplete },
        result
      )
    );
  } catch (error) {
    console.error("POST /outreach/courses/sections/:sid/complete error:", error);
    res.status(500).json({ error: "Failed to complete section" });
  }
});

coursesRouter.post("/sections/:sid/quiz/attempts", async (req: Request, res: Response) => {
  const requestStartedAt = new Date();
  try {
    const { responses } = req.body as { responses?: { questionId: string; answerIds: string[] }[] };
    if (!Array.isArray(responses)) {
      res.status(400).json({ error: "responses must be an array" });
      return;
    }
    const result = await progressService.submitQuiz(
      req.params.sid as string,
      req.memberId!,
      responses
    );
    if (isServiceError(result)) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    const { actorReward, progressMilestones, ...graded } = result;
    res.json(
      await withRewardEnvelope(req.memberId!, requestStartedAt, graded, {
        actorReward,
        progressMilestones,
      })
    );
  } catch (error) {
    console.error("POST /outreach/courses/sections/:sid/quiz/attempts error:", error);
    res.status(500).json({ error: "Failed to submit quiz" });
  }
});

// A learner's written summary of a LIT_REVIEW section's paper. Completion is
// recorded by the service before grading runs — see submitLitReview.
coursesRouter.post("/sections/:sid/lit-review", async (req: Request, res: Response) => {
  const requestStartedAt = new Date();
  try {
    const { text } = req.body as { text?: string };
    if (typeof text !== "string") {
      res.status(400).json({ error: "text is required" });
      return;
    }
    const result = await progressService.submitLitReview(
      req.params.sid as string,
      req.memberId!,
      text
    );
    if (isServiceError(result)) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json(
      await withRewardEnvelope(
        req.memberId!,
        requestStartedAt,
        {
          ok: true,
          submission: result.submission,
          feedback: result.feedback,
          gradingPending: result.gradingPending,
          alreadyComplete: result.alreadyComplete,
        },
        result
      )
    );
  } catch (error) {
    console.error("POST /outreach/courses/sections/:sid/lit-review error:", error);
    res.status(500).json({ error: "Failed to submit summary" });
  }
});

coursesRouter.get("/sections/:sid/lit-review", async (req: Request, res: Response) => {
  try {
    const result = await progressService.listLitSubmissions(
      req.params.sid as string,
      req.memberId!
    );
    if (isServiceError(result)) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json(result);
  } catch (error) {
    console.error("GET /outreach/courses/sections/:sid/lit-review error:", error);
    res.status(500).json({ error: "Failed to load submissions" });
  }
});

// ── Admin reporting ──────────────────────────────────────────
//
// Gated with `requireCourseAccess` (author-or-admin) rather than a bare admin
// check: item analysis exists so the person who wrote a question can see that
// it is a bad question, and that person is the author.
//
// NOTE ON ROUTE ORDER: these must not be shadowed by `GET /:id` (1 segment) or
// `GET /:slug/learn` (2 segments, literal "learn"). `/:id/progress` and
// `/:id/quiz-analysis` are 2-segment with distinct literals, and
// `/progress/member/:memberId` is 3-segment, so none of them collide.

const MEMBER_CARD_SELECT = {
  id: true,
  displayName: true,
  avatarUrl: true,
  slackHandle: true,
  title: true,
  rank: true,
  isAdmin: true,
  role: true,
} as const;

// GET /:id/progress — the completion matrix: every enrolled member × every
// section, plus roll-up counts for the summary strip.
coursesRouter.get("/:id/progress", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    if (!(await requireCourseAccess(req, res, id))) return;

    const [course, sections, enrollments] = await Promise.all([
      prisma.course.findUnique({
        where: { id },
        select: { id: true, slug: true, title: true, status: true },
      }),
      prisma.courseSection.findMany({
        where: { courseId: id },
        // `order` is order WITHIN a module, so course-wide ordering has to lead
        // with the module's own order — otherwise the matrix columns interleave
        // the modules as soon as a course has more than one.
        orderBy: [{ module: { order: "asc" } }, { order: "asc" }],
        select: { id: true, title: true, order: true, kind: true, isRequired: true },
      }),
      prisma.courseEnrollment.findMany({
        where: { courseId: id },
        include: {
          member: { select: MEMBER_CARD_SELECT },
          assignedBy: { select: { id: true, displayName: true } },
          sectionProgress: {
            select: { sectionId: true, status: true, completedAt: true, maxWatchedSec: true },
          },
        },
      }),
    ]);

    const requiredCount = sections.filter((s) => s.isRequired).length || sections.length;

    // Newest first, so the FIRST row seen for a (member, section) pair is that
    // member's latest attempt and every later row is a prior revision.
    const litSectionIds = sections.filter((s) => s.kind === "LIT_REVIEW").map((s) => s.id);
    const litRows = litSectionIds.length
      ? await prisma.courseWorkSubmission.findMany({
          where: { sectionId: { in: litSectionIds } },
          orderBy: { createdAt: "desc" },
          select: { sectionId: true, memberId: true, feedbackJson: true },
        })
      : [];
    const latestLit = new Map<string, { scorePct: number | null; attempts: number }>();
    for (const r of litRows) {
      const key = `${r.memberId}:${r.sectionId}`;
      const seen = latestLit.get(key);
      if (seen) { seen.attempts += 1; continue; }
      const fb = r.feedbackJson as { scorePct?: number } | null;
      latestLit.set(key, {
        // Null when grading never ran. Distinct from a score of 0, and the UI
        // must not conflate them — one is "not graded", the other is "graded badly".
        scorePct: typeof fb?.scorePct === "number" ? fb.scorePct : null,
        attempts: 1,
      });
    }

    const rows = enrollments
      .map((e) => {
        const cells: Record<string, {
          status: string;
          completedAt: Date | null;
          maxWatchedSec: number;
          litScorePct?: number | null;
          litAttempts?: number;
        }> = {};
        for (const p of e.sectionProgress) {
          cells[p.sectionId] = {
            status: p.status,
            completedAt: p.completedAt,
            maxWatchedSec: p.maxWatchedSec,
          };
        }
        // Sections with no progress row at all are NOT_STARTED — the row is
        // created lazily, so its absence is meaningful rather than an error.
        for (const s of sections) {
          if (!cells[s.id]) cells[s.id] = { status: "NOT_STARTED", completedAt: null, maxWatchedSec: 0 };
        }
        for (const s of sections) {
          if (s.kind !== "LIT_REVIEW") continue;
          const lit = latestLit.get(`${e.memberId}:${s.id}`);
          if (lit) {
            cells[s.id]!.litScorePct = lit.scorePct;
            cells[s.id]!.litAttempts = lit.attempts;
          }
        }
        const completedSections = sections.filter((s) => cells[s.id]!.status === "COMPLETED").length;
        const completedRequired = sections.filter(
          (s) => s.isRequired && cells[s.id]!.status === "COMPLETED"
        ).length;
        const lastActivity = e.sectionProgress.reduce<Date>(
          (acc, p) => (p.completedAt && p.completedAt > acc ? p.completedAt : acc),
          e.startedAt
        );
        return {
          enrollmentId: e.id,
          member: e.member,
          assignedBy: e.assignedBy,
          dueDate: e.dueDate,
          startedAt: e.startedAt,
          completedAt: e.completedAt,
          lastActivity,
          completedSections,
          totalSections: sections.length,
          pct: requiredCount ? Math.round((completedRequired / requiredCount) * 100) : 0,
          cells,
        };
      })
      .sort((a, b) => a.member.displayName.localeCompare(b.member.displayName));

    const completed = rows.filter((r) => r.completedAt).length;
    const notStarted = rows.filter((r) => !r.completedAt && r.completedSections === 0).length;
    const now = Date.now();

    res.json({
      course,
      sections,
      rows,
      summary: {
        enrolled: rows.length,
        completed,
        inProgress: rows.length - completed - notStarted,
        notStarted,
        overdue: rows.filter((r) => !r.completedAt && r.dueDate && r.dueDate.getTime() < now).length,
        avgPct: rows.length ? Math.round(rows.reduce((s, r) => s + r.pct, 0) / rows.length) : 0,
      },
    });
  } catch (error) {
    console.error("GET /outreach/courses/:id/progress error:", error);
    res.status(500).json({ error: "Failed to load course progress" });
  }
});

// GET /:id/quiz-analysis — per-question pass rate. The counts come from a single
// `groupBy` over CourseQuestionResponse (questionId × isCorrect) — that pair is
// exactly what the `@@index([questionId])` on the model is there to serve — so
// this stays one query regardless of how many attempts a course has collected.
coursesRouter.get("/:id/quiz-analysis", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    if (!(await requireCourseAccess(req, res, id))) return;

    const [course, questions, grouped, attempts] = await Promise.all([
      prisma.course.findUnique({ where: { id }, select: { id: true, slug: true, title: true } }),
      prisma.courseQuestion.findMany({
        where: { section: { courseId: id } },
        // Module order first: a section's `order` is only meaningful inside it.
        orderBy: [
          { section: { module: { order: "asc" } } },
          { section: { order: "asc" } },
          { order: "asc" },
        ],
        include: {
          section: { select: { id: true, title: true, order: true, kind: true, passThreshold: true } },
          answers: { orderBy: { order: "asc" }, select: { id: true, text: true, isCorrect: true } },
        },
      }),
      prisma.courseQuestionResponse.groupBy({
        by: ["questionId", "isCorrect"],
        where: { question: { section: { courseId: id } } },
        _count: { _all: true },
      }),
      prisma.courseQuizAttempt.findMany({
        where: { section: { courseId: id }, submittedAt: { not: null } },
        select: { sectionId: true, scorePct: true, passed: true },
      }),
    ]);

    const counts = new Map<string, { correct: number; incorrect: number }>();
    for (const g of grouped) {
      const bucket = counts.get(g.questionId) ?? { correct: 0, incorrect: 0 };
      if (g.isCorrect) bucket.correct += g._count._all;
      else bucket.incorrect += g._count._all;
      counts.set(g.questionId, bucket);
    }

    const items = questions.map((q) => {
      const c = counts.get(q.id) ?? { correct: 0, incorrect: 0 };
      const responses = c.correct + c.incorrect;
      return {
        id: q.id,
        prompt: q.prompt,
        kind: q.kind,
        order: q.order,
        points: q.points,
        explanation: q.explanation,
        // videoTimestampSec non-null ⇒ this is a video pop-up, not a question
        // in a quiz section. The two are reported separately because a pop-up
        // that everyone fails usually means a bad timestamp, not a bad question.
        isPopup: q.videoTimestampSec !== null,
        videoTimestampSec: q.videoTimestampSec,
        rewindToSec: q.rewindToSec,
        section: q.section,
        answers: q.answers,
        responses,
        correct: c.correct,
        incorrect: c.incorrect,
        passRate: responses ? Math.round((c.correct / responses) * 100) : null,
      };
    });

    // Per quiz-section attempt roll-up, so a low pass rate can be read against
    // how the section as a whole is performing.
    const bySection = new Map<string, { attempts: number; passed: number; scoreSum: number }>();
    for (const a of attempts) {
      const b = bySection.get(a.sectionId) ?? { attempts: 0, passed: 0, scoreSum: 0 };
      b.attempts += 1;
      if (a.passed) b.passed += 1;
      b.scoreSum += a.scorePct ?? 0;
      bySection.set(a.sectionId, b);
    }

    res.json({
      course,
      quizQuestions: items.filter((i) => !i.isPopup),
      popupQuestions: items.filter((i) => i.isPopup),
      sectionStats: [...bySection.entries()].map(([sectionId, b]) => ({
        sectionId,
        attempts: b.attempts,
        passed: b.passed,
        passRate: b.attempts ? Math.round((b.passed / b.attempts) * 100) : null,
        avgScorePct: b.attempts ? Math.round(b.scoreSum / b.attempts) : null,
      })),
    });
  } catch (error) {
    console.error("GET /outreach/courses/:id/quiz-analysis error:", error);
    res.status(500).json({ error: "Failed to load quiz analysis" });
  }
});

// GET /progress/member/:memberId — everything one learner has done, across every
// course they are enrolled in. Admin-only, except that a member may read their
// own record.
coursesRouter.get("/progress/member/:memberId", async (req: Request, res: Response) => {
  try {
    const memberId = req.params.memberId as string;
    if (memberId !== req.memberId && !(await isAdmin(req.memberId))) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const member = await prisma.member.findUnique({
      where: { id: memberId },
      select: { ...MEMBER_CARD_SELECT, xp: true },
    });
    if (!member) {
      res.status(404).json({ error: "Member not found" });
      return;
    }

    const enrollments = await prisma.courseEnrollment.findMany({
      where: { memberId },
      orderBy: { startedAt: "desc" },
      include: {
        assignedBy: { select: { id: true, displayName: true } },
        course: {
          select: {
            id: true,
            slug: true,
            title: true,
            status: true,
            estimatedMinutes: true,
            sections: {
              // Module order first — `order` alone is per-module.
              orderBy: [{ module: { order: "asc" } }, { order: "asc" }],
              select: { id: true, title: true, order: true, kind: true, isRequired: true, passThreshold: true },
            },
          },
        },
        sectionProgress: {
          select: {
            sectionId: true,
            status: true,
            maxWatchedSec: true,
            completedAt: true,
            rewardGrantedAt: true,
          },
        },
        quizAttempts: {
          orderBy: { startedAt: "asc" },
          select: {
            id: true,
            sectionId: true,
            startedAt: true,
            submittedAt: true,
            scorePct: true,
            passed: true,
          },
        },
      },
    });

    res.json({
      member,
      enrollments: enrollments.map((e) => {
        const progressBySection = new Map(e.sectionProgress.map((p) => [p.sectionId, p]));
        const sections = e.course.sections.map((s) => {
          const p = progressBySection.get(s.id);
          const sectionAttempts = e.quizAttempts.filter((a) => a.sectionId === s.id);
          const best = sectionAttempts.reduce<number | null>(
            (acc, a) => (a.scorePct != null && (acc == null || a.scorePct > acc) ? a.scorePct : acc),
            null
          );
          return {
            ...s,
            status: p?.status ?? "NOT_STARTED",
            maxWatchedSec: p?.maxWatchedSec ?? 0,
            completedAt: p?.completedAt ?? null,
            attemptCount: sectionAttempts.length,
            bestScorePct: best,
            passed: sectionAttempts.some((a) => a.passed),
            attempts: sectionAttempts,
          };
        });
        const requiredCount = sections.filter((s) => s.isRequired).length || sections.length;
        const completedRequired = sections.filter((s) => s.isRequired && s.status === "COMPLETED").length;
        const lastActivity = [
          ...e.sectionProgress.map((p) => p.completedAt),
          ...e.quizAttempts.map((a) => a.submittedAt ?? a.startedAt),
          e.completedAt,
          e.startedAt,
        ].reduce<Date | null>((acc, d) => (d && (!acc || d > acc) ? d : acc), null);

        const { sections: _courseSections, ...courseMeta } = e.course;
        return {
          enrollmentId: e.id,
          course: courseMeta,
          assignedBy: e.assignedBy,
          dueDate: e.dueDate,
          startedAt: e.startedAt,
          completedAt: e.completedAt,
          lastActivity,
          completedSections: sections.filter((s) => s.status === "COMPLETED").length,
          totalSections: sections.length,
          pct: requiredCount ? Math.round((completedRequired / requiredCount) * 100) : 0,
          sections,
        };
      }),
    });
  } catch (error) {
    console.error("GET /outreach/courses/progress/member/:memberId error:", error);
    res.status(500).json({ error: "Failed to load member progress" });
  }
});

// ── Assignment (admin) ───────────────────────────────────────

coursesRouter.post("/:id/assign", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    if (!(await isAdmin(req.memberId))) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const course = await prisma.course.findUnique({ where: { id }, select: { id: true } });
    if (!course) {
      res.status(404).json({ error: "Course not found" });
      return;
    }
    const { memberIds, dueDate } = req.body as { memberIds?: string[]; dueDate?: string | null };
    if (!Array.isArray(memberIds) || !memberIds.length) {
      res.status(400).json({ error: "memberIds must be a non-empty array" });
      return;
    }
    const enrollments = await courseService.assignCourse(
      id,
      memberIds,
      req.memberId!,
      dueDate ? new Date(dueDate) : null
    );
    res.status(201).json(enrollments);
  } catch (error) {
    console.error("POST /outreach/courses/:id/assign error:", error);
    res.status(500).json({ error: "Failed to assign course" });
  }
});
