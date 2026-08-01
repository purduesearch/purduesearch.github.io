import { Router, type Request, type Response } from "express";
import { requireAuth } from "./auth.js";
import { prisma } from "../db/prisma.js";
import * as courseService from "../services/courseService.js";
import * as progressService from "../services/courseProgressService.js";
import type { CourseSectionKind, CourseQuestionKind } from "@prisma/client";

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
    const { moduleId, title, kind, isRequired, videoConfig, passThreshold, maxAttempts } = req.body as {
      moduleId?: string;
      title?: string;
      kind?: CourseSectionKind;
      isRequired?: boolean;
      videoConfig?: Record<string, unknown> | null;
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
    res.json(await courseService.updateSection(sid, req.body));
  } catch (error) {
    console.error("PATCH /outreach/courses/sections/:sid error:", error);
    res.status(500).json({ error: "Failed to update section" });
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
      res.json(questions);
      return;
    }
    res.json(
      questions.map((q) => ({
        id: q.id,
        sectionId: q.sectionId,
        order: q.order,
        prompt: q.prompt,
        kind: q.kind,
        points: q.points,
        videoTimestampSec: q.videoTimestampSec,
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
    const { id, order, prompt, kind, explanation, points, videoTimestampSec, rewindToSec, answers } =
      req.body as {
        id?: string;
        order?: number;
        prompt?: string;
        kind?: CourseQuestionKind;
        explanation?: string | null;
        points?: number;
        videoTimestampSec?: number | null;
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

    const rows = enrollments
      .map((e) => {
        const cells: Record<string, { status: string; completedAt: Date | null; maxWatchedSec: number }> = {};
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
