import type { CourseProgressStatus, CourseQuestionKind } from "@prisma/client";
import { prisma } from "../db/prisma.js";

// ── The gating brain ─────────────────────────────────────────
//
// Everything a learner is allowed to see or do flows through this file. The
// rules are enforced here, on the server, and the payload is built by omission:
// a locked section's `contentJson` / `videoConfig` are never serialized, and a
// question's `isCorrect` / `explanation` never leave the grader. Hiding either
// in the UI would be defeated by one devtools call.

// ── Pure helpers (unit-tested in courseProgressService.test.ts) ──

/** The minimum a section must expose for the gate to reason about it. */
export interface GateSection {
  id: string;
  moduleId: string;
  /** Order WITHIN its module — not within the course. */
  order: number;
  isRequired: boolean;
}

/** The minimum a module must expose for the gate to reason about it. */
export interface GateModule {
  id: string;
  order: number;
  isRequired: boolean;
  /** When true, sections inside must be completed in `order`. */
  sequential: boolean;
}

export interface GateProgress {
  status: CourseProgressStatus;
}

export type ProgressLookup =
  | Record<string, GateProgress | undefined>
  | Map<string, GateProgress | undefined>;

function lookup(progress: ProgressLookup, id: string): GateProgress | undefined {
  return progress instanceof Map ? progress.get(id) : progress[id];
}

/**
 * A module is complete when every *required* section in it is COMPLETED.
 *
 * A module with no required sections — including one with no sections at all —
 * is vacuously complete and therefore never gates. That is deliberate: a module
 * of optional readings must not trap anyone, and an empty module is a normal
 * mid-edit state, not an error. The editor warns about both.
 */
export function isModuleComplete(
  sections: GateSection[],
  progress: ProgressLookup,
  moduleId: string
): boolean {
  for (const s of sections) {
    if (s.moduleId !== moduleId) continue;
    if (!s.isRequired) continue;
    if (lookup(progress, s.id)?.status !== "COMPLETED") return false;
  }
  return true;
}

/**
 * A section is unlocked when BOTH hold:
 *
 *   1. Between modules (always): every *required* module with a strictly lower
 *      `order` is complete.
 *   2. Within its module (only when the module is `sequential`): every
 *      *required* section in the same module with a strictly lower `order` is
 *      COMPLETED.
 *
 * Ties on `order` do not block each other at either level.
 *
 * Pure: `modules` and `sections` are the full sets for the course, `progress`
 * maps section id → the learner's progress row (missing = NOT_STARTED).
 */
export function isSectionUnlocked(
  modules: GateModule[],
  sections: GateSection[],
  progress: ProgressLookup,
  section: GateSection
): boolean {
  const own = modules.find((m) => m.id === section.moduleId);

  // 1. Earlier required modules must be complete.
  if (own) {
    for (const m of modules) {
      if (m.id === own.id) continue;
      if (!m.isRequired) continue;
      if (m.order >= own.order) continue;
      if (!isModuleComplete(sections, progress, m.id)) return false;
    }
  }

  // 2. Earlier required siblings, only when the module is sequential.
  if (!own || own.sequential) {
    for (const s of sections) {
      if (s.id === section.id) continue;
      if (s.moduleId !== section.moduleId) continue;
      if (!s.isRequired) continue;
      if (s.order >= section.order) continue;
      if (lookup(progress, s.id)?.status !== "COMPLETED") return false;
    }
  }

  return true;
}

/** Shape the grader needs — deliberately narrower than the Prisma row. */
export interface GradableQuestion {
  id: string;
  kind: CourseQuestionKind;
  points: number;
  explanation?: string | null;
  answers: { id: string; isCorrect: boolean }[];
}

/**
 * Grade one question against a learner's selection.
 *
 * - SINGLE / TRUE_FALSE: exactly one selection, and it must be a correct answer.
 * - MULTI: the selected set must equal the correct set exactly — a partial
 *   selection is wrong, not partially right. (Partial credit is scored at the
 *   attempt level via `points`, not within a question.)
 * - A question with no answer flagged correct is only satisfied by selecting
 *   nothing; that is an authoring mistake, but it must not grade as a freebie.
 */
export function gradeQuestion(question: GradableQuestion, selectedAnswerIds: string[]): boolean {
  const valid = new Set(question.answers.map((a) => a.id));
  const selected = new Set(selectedAnswerIds.filter((id) => valid.has(id)));
  const correct = new Set(question.answers.filter((a) => a.isCorrect).map((a) => a.id));

  if (question.kind === "SINGLE" || question.kind === "TRUE_FALSE") {
    if (selected.size !== 1) return false;
    const [only] = [...selected];
    return correct.has(only as string);
  }

  // MULTI — exact set equality.
  if (selected.size !== correct.size) return false;
  for (const id of correct) if (!selected.has(id)) return false;
  return true;
}

/** Weighted percentage, 0–100. A zero-point quiz scores 0 rather than NaN. */
export function computeScorePct(
  graded: { points: number; isCorrect: boolean }[]
): number {
  const total = graded.reduce((s, g) => s + (g.points > 0 ? g.points : 0), 0);
  if (total <= 0) return 0;
  const earned = graded.reduce((s, g) => s + (g.isCorrect && g.points > 0 ? g.points : 0), 0);
  return Math.round((earned / total) * 10000) / 100;
}

export const DEFAULT_PASS_THRESHOLD = 80;
export const DEFAULT_MAX_ALLOWED_RATE = 2;
/** Slack for the very first ping of a session, when no wall-clock window exists yet. */
export const VIDEO_BOOTSTRAP_GRACE_SEC = 15;

/**
 * The server-side video clamp. A new high-water mark is accepted only if it is
 * monotonically increasing *and* the jump is no larger than wall-clock time
 * could have produced at the fastest allowed playback rate (× 1.5 for timer
 * jitter, tab throttling and a late flush).
 *
 * Without this the seek lock is pure client-side theater — one fabricated
 * `positionSec` would unlock the rest of the course.
 *
 * Returns the value to persist; never returns less than `prevMaxWatchedSec`, so
 * a rewind (which is always allowed in the player) never rolls the mark back.
 */
export function clampVideoProgress(opts: {
  prevMaxWatchedSec: number;
  positionSec: number;
  /** Wall-clock seconds since this member's previous ping for this section. */
  elapsedSec: number;
  maxAllowedRate?: number;
}): number {
  const prev = Math.max(0, Math.floor(opts.prevMaxWatchedSec));
  const next = Math.floor(opts.positionSec);
  if (!Number.isFinite(next) || next <= prev) return prev;

  const rate = opts.maxAllowedRate && opts.maxAllowedRate > 0
    ? opts.maxAllowedRate
    : DEFAULT_MAX_ALLOWED_RATE;
  const budget = Math.max(0, opts.elapsedSec) * rate * 1.5 + VIDEO_BOOTSTRAP_GRACE_SEC;

  return next - prev <= budget ? next : prev;
}

// ── Wall-clock ping window ───────────────────────────────────
//
// `CourseSectionProgress` has no `updatedAt` column, and adding one would mean a
// migration in a phase that is meant to be migration-free. The ping window is
// therefore held in-process. The consequence is bounded and safe: a restart (or
// a second instance) only resets the window, and a reset window still starts
// from the DB-persisted high-water mark plus the bootstrap grace — it can never
// grant more than one grace window of unwatched video.
const lastPingAt = new Map<string, number>();
const pingKey = (memberId: string, sectionId: string) => `${memberId}:${sectionId}`;

// One entry per (member, section) that has ever pinged, so without eviction this
// grows for the life of the process. Entries older than the window are useless —
// a stale one is indistinguishable from no entry at all, since both fall back to
// the bootstrap grace.
const PING_TTL_MS = 30 * 60 * 1000;
const PING_SWEEP_AT = 5000;

function prunePings(now: number): void {
  if (lastPingAt.size < PING_SWEEP_AT) return;
  for (const [key, at] of lastPingAt) {
    if (now - at > PING_TTL_MS) lastPingAt.delete(key);
  }
}

// ── Learner payload ──────────────────────────────────────────

export interface LearnerSection {
  id: string;
  order: number;
  title: string;
  kind: string;
  isRequired: boolean;
  locked: boolean;
  passThreshold: number | null;
  maxAttempts: number | null;
  status: CourseProgressStatus;
  maxWatchedSec: number;
  answeredPopupIds: string[];
  completedAt: Date | null;
  attemptsUsed: number;
  bestScorePct: number | null;
  passed: boolean;
  // Present ONLY when unlocked. Withheld from the payload, not hidden in the UI.
  contentJson?: unknown;
  videoConfig?: unknown;
}

/**
 * Build the learner view of a course, lazily creating the enrollment (and its
 * per-section progress rows) on first visit. Accepts a slug or an id.
 *
 * Returns null when the course does not exist, or when it is not PUBLISHED and
 * the caller is not its author — an unpublished course has no learner view.
 *
 * `opts.preview` is honoured only for an author/admin: it returns every section
 * unlocked and creates NO enrollment. Without it, an author clicking "Preview"
 * enrols themselves and then shows up in their own completion matrix as a
 * learner who never finished.
 */
export async function getLearnerCourse(
  courseIdOrSlug: string,
  memberId: string,
  opts: { preview?: boolean } = {}
) {
  const course =
    (await prisma.course.findUnique({ where: { slug: courseIdOrSlug } })) ??
    (await prisma.course.findUnique({ where: { id: courseIdOrSlug } }));
  if (!course) return null;

  const isEditor =
    course.createdById === memberId ||
    !!(await prisma.member.findUnique({ where: { id: memberId }, select: { isAdmin: true } }))
      ?.isAdmin;
  if (course.status !== "PUBLISHED" && !isEditor) return null;

  const preview = !!opts.preview && isEditor;

  const sections = await prisma.courseSection.findMany({
    where: { courseId: course.id },
    orderBy: { order: "asc" },
  });

  const enrollment = preview
    ? null
    : await ensureEnrollment(course.id, memberId, sections.map((s) => s.id));

  const progressRows = enrollment
    ? await prisma.courseSectionProgress.findMany({ where: { enrollmentId: enrollment.id } })
    : [];
  const byId = new Map(progressRows.map((p) => [p.sectionId, p]));

  const attempts = enrollment
    ? await prisma.courseQuizAttempt.findMany({
        where: { enrollmentId: enrollment.id, submittedAt: { not: null } },
        select: { sectionId: true, scorePct: true, passed: true },
      })
    : [];

  const gateSections: GateSection[] = sections.map((s) => ({
    id: s.id,
    order: s.order,
    isRequired: s.isRequired,
  }));
  const gateProgress = new Map<string, GateProgress | undefined>(
    sections.map((s) => [s.id, byId.get(s.id)])
  );

  const learnerSections: LearnerSection[] = sections.map((s) => {
    const progress = byId.get(s.id);
    const unlocked = preview || isSectionUnlocked(gateSections, gateProgress, {
      id: s.id,
      order: s.order,
      isRequired: s.isRequired,
    });
    const mine = attempts.filter((a) => a.sectionId === s.id);
    const scores = mine.map((a) => a.scorePct ?? 0);

    const out: LearnerSection = {
      id: s.id,
      order: s.order,
      title: s.title,
      kind: s.kind,
      isRequired: s.isRequired,
      locked: !unlocked,
      passThreshold: s.passThreshold,
      maxAttempts: s.maxAttempts,
      status: progress?.status ?? "NOT_STARTED",
      maxWatchedSec: progress?.maxWatchedSec ?? 0,
      answeredPopupIds: progress?.answeredPopupIds ?? [],
      completedAt: progress?.completedAt ?? null,
      attemptsUsed: mine.length,
      bestScorePct: scores.length ? Math.max(...scores) : null,
      passed: mine.some((a) => a.passed),
    };
    if (unlocked) {
      out.contentJson = s.contentJson;
      out.videoConfig = s.videoConfig ?? null;
    }
    return out;
  });

  return {
    id: course.id,
    slug: course.slug,
    title: course.title,
    summary: course.summary,
    coverImageUrl: course.coverImageUrl,
    theme: course.theme,
    estimatedMinutes: course.estimatedMinutes,
    status: course.status,
    preview,
    enrollment: enrollment
      ? {
          id: enrollment.id,
          dueDate: enrollment.dueDate,
          startedAt: enrollment.startedAt,
          completedAt: enrollment.completedAt,
          lastSectionId: enrollment.lastSectionId,
        }
      : null,
    sections: learnerSections,
  };
}

/**
 * Is this section readable by this member yet? The question routes need the gate
 * without the rest of the learner payload, so that a locked section's questions
 * are withheld the same way its content is.
 */
export async function isSectionUnlockedForMember(
  sectionId: string,
  memberId: string
): Promise<boolean> {
  const section = await prisma.courseSection.findUnique({
    where: { id: sectionId },
    select: { id: true, order: true, isRequired: true, courseId: true },
  });
  if (!section) return false;

  const sections = await prisma.courseSection.findMany({
    where: { courseId: section.courseId },
    orderBy: { order: "asc" },
    select: { id: true, order: true, isRequired: true },
  });
  const enrollment = await prisma.courseEnrollment.findUnique({
    where: { courseId_memberId: { courseId: section.courseId, memberId } },
    select: { id: true },
  });
  const progressRows = enrollment
    ? await prisma.courseSectionProgress.findMany({ where: { enrollmentId: enrollment.id } })
    : [];
  const byId = new Map(progressRows.map((p) => [p.sectionId, p]));

  return isSectionUnlocked(
    sections,
    new Map(sections.map((s) => [s.id, byId.get(s.id)])),
    section
  );
}

/** Upsert the enrollment and backfill a progress row for every section. */
async function ensureEnrollment(courseId: string, memberId: string, sectionIds: string[]) {
  const enrollment = await prisma.courseEnrollment.upsert({
    where: { courseId_memberId: { courseId, memberId } },
    create: { courseId, memberId },
    update: {},
  });
  if (sectionIds.length) {
    await prisma.courseSectionProgress.createMany({
      data: sectionIds.map((sectionId) => ({ enrollmentId: enrollment.id, sectionId })),
      skipDuplicates: true,
    });
  }
  return enrollment;
}

/**
 * Resolve the caller's enrollment + progress row for one section, creating both
 * if needed, and refuse if the section is still locked. Every learner mutation
 * below re-enters the gate through this function.
 */
async function requireUnlockedSection(sectionId: string, memberId: string) {
  const section = await prisma.courseSection.findUnique({ where: { id: sectionId } });
  if (!section) return { ok: false as const, error: "Section not found", status: 404 };

  const sections = await prisma.courseSection.findMany({
    where: { courseId: section.courseId },
    orderBy: { order: "asc" },
    select: { id: true, order: true, isRequired: true },
  });
  const enrollment = await ensureEnrollment(section.courseId, memberId, sections.map((s) => s.id));
  const progressRows = await prisma.courseSectionProgress.findMany({
    where: { enrollmentId: enrollment.id },
  });
  const byId = new Map(progressRows.map((p) => [p.sectionId, p]));

  const unlocked = isSectionUnlocked(
    sections,
    new Map(sections.map((s) => [s.id, byId.get(s.id)])),
    { id: section.id, order: section.order, isRequired: section.isRequired }
  );
  if (!unlocked) return { ok: false as const, error: "Section is locked", status: 403 };

  const progress = byId.get(sectionId)!;
  return { ok: true as const, section, enrollment, progress, sections, byId };
}

// ── Video progress ───────────────────────────────────────────

/**
 * Persist a clamped high-water watch position. `positionSec` is a claim, not a
 * fact — `clampVideoProgress` decides what is believable.
 */
export async function recordVideoProgress(
  sectionId: string,
  memberId: string,
  positionSec: number
) {
  const ctx = await requireUnlockedSection(sectionId, memberId);
  if (!ctx.ok) return { error: ctx.error, status: ctx.status };
  const { section, progress } = ctx;

  const now = Date.now();
  prunePings(now);
  const key = pingKey(memberId, sectionId);
  const previous = lastPingAt.get(key);
  lastPingAt.set(key, now);
  const elapsedSec = previous ? (now - previous) / 1000 : 0;

  const config = (section.videoConfig ?? {}) as { allowedRates?: unknown };
  const rates = Array.isArray(config.allowedRates)
    ? config.allowedRates.map(Number).filter((r) => Number.isFinite(r) && r > 0)
    : [];
  const maxAllowedRate = rates.length ? Math.max(...rates) : DEFAULT_MAX_ALLOWED_RATE;

  const clamped = clampVideoProgress({
    prevMaxWatchedSec: progress.maxWatchedSec,
    positionSec,
    elapsedSec,
    maxAllowedRate,
  });

  const updated = await prisma.courseSectionProgress.update({
    where: { id: progress.id },
    data: {
      maxWatchedSec: clamped,
      status: progress.status === "COMPLETED" ? "COMPLETED" : "IN_PROGRESS",
    },
  });
  await prisma.courseEnrollment.update({
    where: { id: ctx.enrollment.id },
    data: { lastSectionId: sectionId },
  });

  return {
    maxWatchedSec: updated.maxWatchedSec,
    // False when the claim was rejected — the client should seek back to
    // `maxWatchedSec` rather than trust its own position.
    accepted: clamped >= Math.floor(positionSec),
  };
}

// ── In-video pop-up questions ────────────────────────────────

/**
 * Grade one in-video pop-up. The explanation is returned here (after answering)
 * and only here — `GET /sections/:sid/questions` strips it for learners.
 */
export async function recordPopupAnswer(
  sectionId: string,
  memberId: string,
  questionId: string,
  answerIds: string[]
) {
  const ctx = await requireUnlockedSection(sectionId, memberId);
  if (!ctx.ok) return { error: ctx.error, status: ctx.status };
  const { progress } = ctx;

  const question = await prisma.courseQuestion.findUnique({
    where: { id: questionId },
    include: { answers: { select: { id: true, isCorrect: true } } },
  });
  if (!question || question.sectionId !== sectionId) {
    return { error: "Question not found", status: 404 } as const;
  }
  // MUST stay: this endpoint grades one question at a time, with no attempt
  // accounting. Pointed at a quiz-section question it becomes an unlimited
  // answer-key oracle — a learner walks every option until it says `correct`,
  // then submits a perfect attempt, and `maxAttempts` / `passThreshold` mean
  // nothing. Only in-video pop-ups (videoTimestampSec non-null) belong here.
  if (question.videoTimestampSec == null) {
    return { error: "Question not found", status: 404 } as const;
  }

  const isCorrect = gradeQuestion(question, Array.isArray(answerIds) ? answerIds : []);

  // Only a correct answer clears the pop-up. A wrong answer leaves it pending so
  // the player re-fires it after the offered rewind.
  const answered = new Set(progress.answeredPopupIds);
  if (isCorrect) answered.add(questionId);
  else answered.delete(questionId);
  await prisma.courseSectionProgress.update({
    where: { id: progress.id },
    data: { answeredPopupIds: { set: [...answered] } },
  });

  return {
    correct: isCorrect,
    explanation: question.explanation ?? null,
    rewindToSec: isCorrect ? null : question.rewindToSec,
  };
}

// ── Section completion ───────────────────────────────────────

/**
 * Mark a CONTENT or VIDEO section complete. VIDEO sections additionally require
 * the watch mark to have reached the end (when `videoConfig.durationSec` is
 * known) and every in-video pop-up to have been answered correctly.
 */
export async function completeSection(sectionId: string, memberId: string) {
  const ctx = await requireUnlockedSection(sectionId, memberId);
  if (!ctx.ok) return { error: ctx.error, status: ctx.status };
  const { section, enrollment, progress } = ctx;

  if (section.kind === "QUIZ") {
    return { error: "Quiz sections complete by passing an attempt", status: 400 } as const;
  }

  if (section.kind === "VIDEO") {
    const config = (section.videoConfig ?? {}) as { durationSec?: unknown; youtubeId?: unknown };
    const duration = Number(config.durationSec);
    const hasVideo = typeof config.youtubeId === "string" && config.youtubeId.length > 0;
    if (hasVideo) {
      // An unknown duration used to make this whole branch a no-op, which meant
      // POSTing to this route completed the section without watching anything.
      // Refuse loudly instead: the author's settings panel records durationSec
      // as soon as the video loads, so this only fires on a half-configured
      // section, and it says so.
      if (!Number.isFinite(duration) || duration <= 0) {
        return {
          error: "This video's length has not been recorded yet — ask the course author to reopen its video settings",
          status: 409,
        } as const;
      }
      if (progress.maxWatchedSec < duration - 2) {
        return { error: "Video has not been watched to the end", status: 400 } as const;
      }
    }
    const popups = await prisma.courseQuestion.findMany({
      where: { sectionId, videoTimestampSec: { not: null } },
      select: { id: true },
    });
    const answered = new Set(progress.answeredPopupIds);
    if (popups.some((q) => !answered.has(q.id))) {
      return { error: "Answer every in-video question first", status: 400 } as const;
    }
  }

  if (progress.status === "COMPLETED") {
    // Already done — no re-grant (the rewardGrantedAt gate would refuse anyway).
    return { alreadyComplete: true, actorReward: null, progressMilestones: [] };
  }

  await prisma.courseSectionProgress.update({
    where: { id: progress.id },
    data: { status: "COMPLETED", completedAt: new Date() },
  });
  await prisma.courseEnrollment.update({
    where: { id: enrollment.id },
    data: { lastSectionId: sectionId },
  });

  const effects = await applyCourseSideEffects(memberId, {
    courseId: section.courseId,
    sectionId,
  });
  return { alreadyComplete: false, ...effects };
}

// ── Quiz ─────────────────────────────────────────────────────

export interface QuizResponseInput {
  questionId: string;
  answerIds: string[];
}

export interface QuizResult {
  attemptId: string;
  scorePct: number;
  passed: boolean;
  attemptsUsed: number;
  maxAttempts: number | null;
  passThreshold: number;
  perQuestion: { questionId: string; isCorrect: boolean; explanation: string | null }[];
}

/**
 * Grade a quiz submission server-side and persist the attempt.
 *
 * The correct answers never left the server, so this is the only place grading
 * can happen. Explanations are returned in this response and nowhere else.
 */
export async function submitQuiz(
  sectionId: string,
  memberId: string,
  responses: QuizResponseInput[]
) {
  const ctx = await requireUnlockedSection(sectionId, memberId);
  if (!ctx.ok) return { error: ctx.error, status: ctx.status };
  const { section, enrollment, progress } = ctx;

  if (section.kind !== "QUIZ") {
    return { error: "Section is not a quiz", status: 400 } as const;
  }

  const passThreshold = section.passThreshold ?? DEFAULT_PASS_THRESHOLD;
  const priorAttempts = await prisma.courseQuizAttempt.count({
    where: { enrollmentId: enrollment.id, sectionId, submittedAt: { not: null } },
  });
  // null = unlimited.
  if (section.maxAttempts != null && priorAttempts >= section.maxAttempts) {
    return { error: "No attempts remaining", status: 400 } as const;
  }

  const questions = await prisma.courseQuestion.findMany({
    where: { sectionId, videoTimestampSec: null },
    orderBy: { order: "asc" },
    include: { answers: { select: { id: true, isCorrect: true } } },
  });
  if (!questions.length) return { error: "This quiz has no questions", status: 400 } as const;

  const selectionByQuestion = new Map<string, string[]>();
  for (const r of Array.isArray(responses) ? responses : []) {
    if (r && typeof r.questionId === "string") {
      selectionByQuestion.set(r.questionId, Array.isArray(r.answerIds) ? r.answerIds : []);
    }
  }

  const graded = questions.map((q) => ({
    questionId: q.id,
    points: q.points,
    // An unanswered question grades against an empty selection rather than
    // being skipped, so omitting a question can never raise the score.
    isCorrect: gradeQuestion(q, selectionByQuestion.get(q.id) ?? []),
    explanation: q.explanation ?? null,
    answerIds: (selectionByQuestion.get(q.id) ?? []).filter((id) =>
      q.answers.some((a) => a.id === id)
    ),
  }));

  const scorePct = computeScorePct(graded);
  const passed = scorePct >= passThreshold;

  const attempt = await prisma.courseQuizAttempt.create({
    data: {
      enrollmentId: enrollment.id,
      sectionId,
      submittedAt: new Date(),
      scorePct,
      passed,
      responses: {
        create: graded.map((g) => ({
          questionId: g.questionId,
          answerIds: g.answerIds,
          isCorrect: g.isCorrect,
        })),
      },
    },
  });

  const result: QuizResult = {
    attemptId: attempt.id,
    scorePct,
    passed,
    attemptsUsed: priorAttempts + 1,
    maxAttempts: section.maxAttempts,
    passThreshold,
    perQuestion: graded.map((g) => ({
      questionId: g.questionId,
      isCorrect: g.isCorrect,
      explanation: g.explanation,
    })),
  };

  if (!passed) {
    await prisma.courseSectionProgress.update({
      where: { id: progress.id },
      data: { status: progress.status === "COMPLETED" ? "COMPLETED" : "IN_PROGRESS" },
    });
    return { ...result, actorReward: null, progressMilestones: [] };
  }

  if (progress.status === "COMPLETED") {
    return { ...result, actorReward: null, progressMilestones: [] };
  }

  await prisma.courseSectionProgress.update({
    where: { id: progress.id },
    data: { status: "COMPLETED", completedAt: new Date() },
  });
  await prisma.courseEnrollment.update({
    where: { id: enrollment.id },
    data: { lastSectionId: sectionId },
  });

  const effects = await applyCourseSideEffects(memberId, {
    courseId: section.courseId,
    sectionId,
  });
  return { ...result, ...effects };
}

// ── Shared completion side effects ───────────────────────────

export type CourseProgressMilestone =
  import("./challengeService.js").ProgressMilestone & { challengeName: string };

/**
 * Modeled on `taskCompletionService.applyCompletionSideEffects`. Call AFTER the
 * progress row has been moved to COMPLETED. Grants the section reward, closes
 * out the course when every required section is done, and returns the reward
 * summary + progress milestones so the route can merge them into its JSON body
 * for the frontend reward dispatcher (RewardFlux, rank-up modal, quest toasts).
 */
export async function applyCourseSideEffects(
  memberId: string,
  opts: { courseId: string; sectionId?: string }
): Promise<{
  actorReward: import("./rewardService.js").ActorRewardSummary | null;
  progressMilestones: CourseProgressMilestone[];
}> {
  const rewards: import("./rewardService.js").ActorRewardSummary[] = [];
  let progressMilestones: CourseProgressMilestone[] = [];

  // Section reward — awaited so the caller can surface the deltas.
  if (opts.sectionId) {
    try {
      const { handleCourseSectionComplete } = await import("./rewardService.js");
      const summary = await handleCourseSectionComplete(memberId, opts.sectionId);
      if (summary) rewards.push(summary);
    } catch (err) {
      console.error("[reward] handleCourseSectionComplete:", err);
    }
  }

  // Course completion — every *required* section COMPLETED closes the course.
  // Optional sections never hold it open, mirroring the unlock rule.
  let courseJustCompleted = false;
  try {
    courseJustCompleted = await closeOutCourseIfFinished(memberId, opts.courseId);
    if (courseJustCompleted) {
      const { handleCourseComplete } = await import("./rewardService.js");
      const summary = await handleCourseComplete(memberId, opts.courseId);
      if (summary) rewards.push(summary);
    }
  } catch (err) {
    console.error("[reward] handleCourseComplete:", err);
  }

  // Challenge hooks — awaited so the caller can surface progress toasts.
  try {
    const { recordEvent } = await import("./challengeService.js");
    const raw: import("./challengeService.js").ProgressMilestone[] = [];
    if (opts.sectionId) {
      raw.push(...(await recordEvent(memberId, "COURSE_SECTION_COMPLETED", 1)));
    }
    if (courseJustCompleted) {
      raw.push(...(await recordEvent(memberId, "COURSE_COMPLETED", 1)));
    }
    // QuestCompleteToast reads `detail.challengeName`, but recordEvent returns
    // the field as `name`. Map it here or every course quest toast renders as
    // "a quest".
    progressMilestones = raw.map((m) => ({ ...m, challengeName: m.name }));
  } catch (err) {
    console.error("[challenge] course completion hooks:", err);
  }

  return { actorReward: mergeRewards(rewards), progressMilestones };
}

/**
 * Stamp `completedAt` on the enrollment if every required section is COMPLETED.
 * Returns true only on the transition, so the course reward fires exactly once
 * (belt-and-braces with `CourseEnrollment.rewardGrantedAt`).
 */
async function closeOutCourseIfFinished(memberId: string, courseId: string): Promise<boolean> {
  const enrollment = await prisma.courseEnrollment.findUnique({
    where: { courseId_memberId: { courseId, memberId } },
    select: { id: true, completedAt: true },
  });
  if (!enrollment || enrollment.completedAt) return false;

  const required = await prisma.courseSection.findMany({
    where: { courseId, isRequired: true },
    select: { id: true },
  });
  if (!required.length) return false;

  const done = await prisma.courseSectionProgress.count({
    where: {
      enrollmentId: enrollment.id,
      status: "COMPLETED",
      sectionId: { in: required.map((s) => s.id) },
    },
  });
  if (done < required.length) return false;

  await prisma.courseEnrollment.update({
    where: { id: enrollment.id },
    data: { completedAt: new Date() },
  });
  return true;
}

/**
 * Flatten several reward summaries into the single flat object the frontend
 * dispatcher expects (`xpDelta`, `newXp`, `rankBefore`/`rankAfter`, …) — a
 * section completion that also finishes the course produces two grants but must
 * fire one animation.
 */
function mergeRewards(
  summaries: import("./rewardService.js").ActorRewardSummary[]
): import("./rewardService.js").ActorRewardSummary | null {
  if (!summaries.length) return null;
  if (summaries.length === 1) return summaries[0]!;

  const first = summaries[0]!;
  const last = summaries[summaries.length - 1]!;
  return {
    xpDelta: summaries.reduce((s, r) => s + (r.xpDelta ?? 0), 0),
    doubloonsDelta: summaries.reduce((s, r) => s + (r.doubloonsDelta ?? 0), 0),
    // Running totals: the last grant that actually reported one is current.
    newXp: [...summaries].reverse().find((r) => r.newXp != null)?.newXp ?? null,
    newDoubloons:
      [...summaries].reverse().find((r) => r.newDoubloons != null)?.newDoubloons ?? null,
    rankBefore: summaries.find((r) => r.rankBefore != null)?.rankBefore ?? first.rankBefore,
    rankAfter: [...summaries].reverse().find((r) => r.rankAfter != null)?.rankAfter ?? last.rankAfter,
    queued: summaries.some((r) => r.queued) || undefined,
    taskTitle: last.taskTitle ?? first.taskTitle,
  };
}

/**
 * Achievements auto-unlocked during `recordEvent` — the same surface as
 * `tasks.ts` PATCH /:id. Routes call this with the timestamp they captured
 * before doing any work.
 */
export async function collectAchievementUnlocks(memberId: string, since: Date) {
  try {
    const unlocks = await prisma.memberAchievement.findMany({
      where: { memberId, unlockedAt: { gte: since } },
      include: {
        challenge: {
          select: {
            name: true, description: true, iconClass: true,
            tier: true, xpReward: true, doubloonReward: true,
          },
        },
      },
    });
    return unlocks.map((u) => ({
      memberAchievementId: u.id,
      name: u.challenge.name,
      description: u.challenge.description,
      iconClass: u.challenge.iconClass,
      tier: u.challenge.tier,
      xpReward: u.challenge.xpReward,
      doubloonReward: u.challenge.doubloonReward,
    }));
  } catch (err) {
    console.error("[challenge] achievement unlock surface:", err);
    return [];
  }
}
