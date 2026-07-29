import { Prisma, type CourseSectionKind, type CourseQuestionKind } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { EMPTY_DOC, slugify, type PMDoc } from "./blogRender.js";

// ── Types ────────────────────────────────────────────────────

export interface CreateCourseInput {
  title: string;
  createdById: string;
  slug?: string;
  summary?: string;
  coverImageUrl?: string;
  estimatedMinutes?: number;
}

export interface UpdateCourseInput {
  title?: string;
  slug?: string;
  summary?: string | null;
  coverImageUrl?: string | null;
  theme?: Record<string, unknown> | null;
  estimatedMinutes?: number | null;
  xpOverride?: number | null;
  doubloonOverride?: number | null;
}

export interface CreateSectionInput {
  courseId: string;
  title: string;
  kind?: CourseSectionKind;
  isRequired?: boolean;
  contentJson?: PMDoc;
  videoConfig?: Record<string, unknown> | null;
  passThreshold?: number | null;
  maxAttempts?: number | null;
}

export interface UpdateSectionInput {
  title?: string;
  kind?: CourseSectionKind;
  isRequired?: boolean;
  contentJson?: PMDoc;
  videoConfig?: Record<string, unknown> | null;
  passThreshold?: number | null;
  maxAttempts?: number | null;
}

export interface UpsertQuestionInput {
  id?: string;
  sectionId: string;
  order?: number;
  prompt: string;
  kind?: CourseQuestionKind;
  explanation?: string | null;
  points?: number;
  videoTimestampSec?: number | null;
  rewindToSec?: number | null;
  answers: { id?: string; order?: number; text: string; isCorrect?: boolean }[];
}

export interface ListCoursesFilters {
  status?: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  createdById?: string;
  q?: string;
}

const asJson = (doc: PMDoc): Prisma.InputJsonValue => doc as unknown as Prisma.InputJsonValue;

const courseInclude = {
  createdBy: { select: { id: true, displayName: true, avatarUrl: true } },
} satisfies Prisma.CourseInclude;

const sectionSelect = {
  id: true,
  courseId: true,
  order: true,
  title: true,
  kind: true,
  isRequired: true,
  videoConfig: true,
  passThreshold: true,
  maxAttempts: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.CourseSectionSelect;

// ── Slug helper ──────────────────────────────────────────────

// Mirrors blogService.ensureUniqueSlug, but scoped to the Course table — that
// helper's uniqueness loop queries blogPost, so it cannot guarantee a free
// course slug. The slugify normalization itself is reused, not reimplemented.
export async function ensureUniqueCourseSlug(base: string, excludeId?: string): Promise<string> {
  const root = slugify(base);
  let slug = root;
  let suffix = 1;
  while (
    await prisma.course.findFirst({
      where: { slug, ...(excludeId ? { NOT: { id: excludeId } } : {}) },
      select: { id: true },
    })
  ) {
    suffix += 1;
    slug = `${root}-${suffix}`;
  }
  return slug;
}

// ── Course CRUD ──────────────────────────────────────────────

export async function listCourses(filters: ListCoursesFilters = {}) {
  const where: Prisma.CourseWhereInput = {};
  if (filters.status) where.status = filters.status;
  if (filters.createdById) where.createdById = filters.createdById;
  if (filters.q?.trim()) {
    const q = filters.q.trim();
    where.OR = [
      { title: { contains: q, mode: "insensitive" } },
      { summary: { contains: q, mode: "insensitive" } },
    ];
  }
  return prisma.course.findMany({
    where,
    include: { ...courseInclude, _count: { select: { sections: true, enrollments: true } } },
    orderBy: { updatedAt: "desc" },
  });
}

export async function getCourse(id: string) {
  return prisma.course.findUnique({
    where: { id },
    include: {
      ...courseInclude,
      sections: { orderBy: { order: "asc" }, select: sectionSelect },
    },
  });
}

export async function getCourseBySlug(slug: string) {
  return prisma.course.findUnique({
    where: { slug },
    include: {
      ...courseInclude,
      sections: { orderBy: { order: "asc" }, select: sectionSelect },
    },
  });
}

export async function createCourse(input: CreateCourseInput) {
  const slug = await ensureUniqueCourseSlug(input.slug ?? input.title);
  return prisma.course.create({
    data: {
      title: input.title,
      slug,
      summary: input.summary ?? null,
      coverImageUrl: input.coverImageUrl ?? null,
      estimatedMinutes: input.estimatedMinutes ?? null,
      status: "DRAFT",
      createdById: input.createdById,
    },
    include: courseInclude,
  });
}

export async function updateCourse(id: string, input: UpdateCourseInput) {
  const data: Prisma.CourseUpdateInput = {};
  if (input.title !== undefined) data.title = input.title;
  if (input.slug !== undefined) data.slug = await ensureUniqueCourseSlug(input.slug, id);
  if (input.summary !== undefined) data.summary = input.summary;
  if (input.coverImageUrl !== undefined) data.coverImageUrl = input.coverImageUrl;
  if (input.estimatedMinutes !== undefined) data.estimatedMinutes = input.estimatedMinutes;
  if (input.xpOverride !== undefined) data.xpOverride = input.xpOverride;
  if (input.doubloonOverride !== undefined) data.doubloonOverride = input.doubloonOverride;
  if (input.theme !== undefined) {
    data.theme = input.theme === null ? Prisma.DbNull : (input.theme as Prisma.InputJsonValue);
  }
  return prisma.course.update({ where: { id }, data, include: courseInclude });
}

export async function publishCourse(id: string) {
  return prisma.course.update({
    where: { id },
    data: { status: "PUBLISHED", publishedAt: new Date() },
    include: courseInclude,
  });
}

export async function archiveCourse(id: string) {
  return prisma.course.update({
    where: { id },
    data: { status: "ARCHIVED" },
    include: courseInclude,
  });
}

export async function deleteCourse(id: string) {
  // Sections, questions, answers, enrollments and progress all cascade.
  await prisma.course.delete({ where: { id } });
}

// ── Sections ─────────────────────────────────────────────────

export async function createSection(input: CreateSectionInput) {
  const last = await prisma.courseSection.findFirst({
    where: { courseId: input.courseId },
    orderBy: { order: "desc" },
    select: { order: true },
  });
  return prisma.courseSection.create({
    data: {
      courseId: input.courseId,
      order: (last?.order ?? -1) + 1,
      title: input.title,
      kind: input.kind ?? "CONTENT",
      isRequired: input.isRequired ?? true,
      contentJson: asJson(input.contentJson ?? EMPTY_DOC),
      videoConfig: (input.videoConfig ?? undefined) as Prisma.InputJsonValue | undefined,
      passThreshold: input.passThreshold ?? null,
      maxAttempts: input.maxAttempts ?? null,
    },
    select: sectionSelect,
  });
}

export async function updateSection(id: string, input: UpdateSectionInput) {
  const data: Prisma.CourseSectionUpdateInput = {};
  if (input.title !== undefined) data.title = input.title;
  if (input.kind !== undefined) data.kind = input.kind;
  if (input.isRequired !== undefined) data.isRequired = input.isRequired;
  if (input.contentJson !== undefined) data.contentJson = asJson(input.contentJson);
  if (input.passThreshold !== undefined) data.passThreshold = input.passThreshold;
  if (input.maxAttempts !== undefined) data.maxAttempts = input.maxAttempts;
  if (input.videoConfig !== undefined) {
    data.videoConfig =
      input.videoConfig === null ? Prisma.DbNull : (input.videoConfig as Prisma.InputJsonValue);
  }
  return prisma.courseSection.update({ where: { id }, data, select: sectionSelect });
}

export async function deleteSection(id: string) {
  await prisma.courseSection.delete({ where: { id } });
}

/**
 * Rewrite the whole order column for a course in one transaction. `order` is a
 * plain index (not @@unique) precisely so this can be a single pass with no
 * temporary-value shuffle. Ids that don't belong to the course are ignored;
 * sections omitted from `orderedIds` keep their relative order after the listed
 * ones.
 */
export async function reorderSections(courseId: string, orderedIds: string[]) {
  const existing = await prisma.courseSection.findMany({
    where: { courseId },
    orderBy: { order: "asc" },
    select: { id: true },
  });
  const known = new Set(existing.map((s) => s.id));
  const seen = new Set<string>();
  const finalOrder: string[] = [];
  for (const id of orderedIds) {
    if (known.has(id) && !seen.has(id)) {
      seen.add(id);
      finalOrder.push(id);
    }
  }
  for (const s of existing) {
    if (!seen.has(s.id)) finalOrder.push(s.id);
  }

  await prisma.$transaction(
    finalOrder.map((id, index) =>
      prisma.courseSection.update({ where: { id }, data: { order: index } })
    )
  );

  return prisma.courseSection.findMany({
    where: { courseId },
    orderBy: { order: "asc" },
    select: sectionSelect,
  });
}

// ── Questions ────────────────────────────────────────────────

const questionInclude = {
  answers: { orderBy: { order: "asc" } },
} satisfies Prisma.CourseQuestionInclude;

export async function listQuestions(sectionId: string) {
  return prisma.courseQuestion.findMany({
    where: { sectionId },
    orderBy: { order: "asc" },
    include: questionInclude,
  });
}

/**
 * Create or replace one question and its full answer set. Answers are rewritten
 * wholesale rather than diffed — a CourseQuestionResponse stores answer ids, so
 * an edited question's historical responses intentionally read as stale rather
 * than silently re-grading against reworded options.
 */
export async function upsertQuestion(input: UpsertQuestionInput) {
  const answers = input.answers.map((a, index) => ({
    order: a.order ?? index,
    text: a.text,
    isCorrect: a.isCorrect ?? false,
  }));

  if (input.id) {
    return prisma.$transaction(async (tx) => {
      await tx.courseAnswer.deleteMany({ where: { questionId: input.id! } });
      return tx.courseQuestion.update({
        where: { id: input.id! },
        data: {
          order: input.order,
          prompt: input.prompt,
          kind: input.kind,
          explanation: input.explanation ?? null,
          points: input.points,
          videoTimestampSec: input.videoTimestampSec ?? null,
          rewindToSec: input.rewindToSec ?? null,
          answers: { create: answers },
        },
        include: questionInclude,
      });
    });
  }

  const last = await prisma.courseQuestion.findFirst({
    where: { sectionId: input.sectionId },
    orderBy: { order: "desc" },
    select: { order: true },
  });
  return prisma.courseQuestion.create({
    data: {
      sectionId: input.sectionId,
      order: input.order ?? (last?.order ?? -1) + 1,
      prompt: input.prompt,
      kind: input.kind ?? "SINGLE",
      explanation: input.explanation ?? null,
      points: input.points ?? 1,
      videoTimestampSec: input.videoTimestampSec ?? null,
      rewindToSec: input.rewindToSec ?? null,
      answers: { create: answers },
    },
    include: questionInclude,
  });
}

/** Which family of questions a whole-set replace is allowed to touch. */
export type QuestionScope = "all" | "quiz" | "popup";

const scopeFilter = (scope: QuestionScope): Prisma.CourseQuestionWhereInput =>
  scope === "quiz"
    ? { videoTimestampSec: null }
    : scope === "popup"
      ? { videoTimestampSec: { not: null } }
      : {};

/**
 * Replace a section's question set, in order.
 *
 * Questions carrying an `id` are UPDATED IN PLACE, never dropped and recreated.
 * `CourseQuestionResponse.questionId` is a cascading FK, so deleting a question
 * deletes every response ever recorded against it — one save in the quiz editor
 * would silently wipe the admin item analysis for that section. Only questions
 * genuinely absent from the payload are deleted.
 *
 * `scope` bounds that deletion to one family. The quiz editor only ever loads
 * untimed questions, so without it, saving a quiz would delete the section's
 * in-video pop-ups as collateral.
 *
 * Answers ARE rewritten wholesale per question: a response stores answer ids as
 * plain strings with no FK, so historical responses read as stale rather than
 * silently re-grading against reworded options.
 */
export async function replaceQuestions(
  sectionId: string,
  questions: Omit<UpsertQuestionInput, "sectionId">[],
  scope: QuestionScope = "all"
) {
  await prisma.$transaction(async (tx) => {
    const existing = await tx.courseQuestion.findMany({
      where: { sectionId, ...scopeFilter(scope) },
      select: { id: true },
    });
    const known = new Set(existing.map((q) => q.id));
    const keep = new Set(questions.map((q) => q.id).filter((id): id is string => !!id && known.has(id)));

    const orphans = [...known].filter((id) => !keep.has(id));
    if (orphans.length) {
      await tx.courseQuestion.deleteMany({ where: { id: { in: orphans } } });
    }

    for (const [index, q] of questions.entries()) {
      const data = {
        order: q.order ?? index,
        prompt: q.prompt,
        kind: q.kind ?? ("SINGLE" as CourseQuestionKind),
        explanation: q.explanation ?? null,
        points: q.points ?? 1,
        videoTimestampSec: q.videoTimestampSec ?? null,
        rewindToSec: q.rewindToSec ?? null,
      };
      const answers = q.answers.map((a, i) => ({
        order: a.order ?? i,
        text: a.text,
        isCorrect: a.isCorrect ?? false,
      }));

      if (q.id && keep.has(q.id)) {
        await tx.courseAnswer.deleteMany({ where: { questionId: q.id } });
        await tx.courseQuestion.update({
          where: { id: q.id },
          data: { ...data, answers: { create: answers } },
        });
      } else {
        await tx.courseQuestion.create({
          data: { sectionId, ...data, answers: { create: answers } },
        });
      }
    }
  });
  return listQuestions(sectionId);
}

export async function deleteQuestion(id: string) {
  await prisma.courseQuestion.delete({ where: { id } });
}

// ── Enrollment (admin assignment) ────────────────────────────

export async function assignCourse(
  courseId: string,
  memberIds: string[],
  assignedById: string,
  dueDate?: Date | null
) {
  await prisma.$transaction(
    memberIds.map((memberId) =>
      prisma.courseEnrollment.upsert({
        where: { courseId_memberId: { courseId, memberId } },
        create: { courseId, memberId, assignedById, dueDate: dueDate ?? null },
        update: { assignedById, dueDate: dueDate ?? null },
      })
    )
  );
  return prisma.courseEnrollment.findMany({
    where: { courseId, memberId: { in: memberIds } },
    include: { member: { select: { id: true, displayName: true, avatarUrl: true } } },
  });
}
