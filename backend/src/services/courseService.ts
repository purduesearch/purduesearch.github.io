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
  moduleId: string;
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

export interface CreateModuleInput {
  courseId: string;
  title: string;
  summary?: string | null;
  estimatedMinutes?: number | null;
  isRequired?: boolean;
  sequential?: boolean;
}

export interface UpdateModuleInput {
  title?: string;
  summary?: string | null;
  estimatedMinutes?: number | null;
  isRequired?: boolean;
  sequential?: boolean;
}

/** One module's slot in a whole-tree structure write. */
export interface StructureModule {
  moduleId: string;
  sectionIds: string[];
}

/**
 * Thrown when a structure payload is not an exact permutation of the course's
 * modules and sections. A partial payload is a client bug, not a partial
 * update — applying it would silently orphan whatever it omitted.
 */
export class StructureMismatchError extends Error {}

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

const moduleSelect = {
  id: true,
  courseId: true,
  order: true,
  title: true,
  summary: true,
  estimatedMinutes: true,
  isRequired: true,
  sequential: true,
} satisfies Prisma.CourseModuleSelect;

const sectionSelect = {
  id: true,
  courseId: true,
  moduleId: true,
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
  const course = await prisma.course.findUnique({ where: { id }, include: courseInclude });
  if (!course) return null;
  // The authoring view is a tree: the rail renders it and writes it back whole.
  // The client derives its own flat list where it needs one.
  return { ...course, modules: await listModules(id) };
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
  // A course is born with one module. Without it, POST /sections could never
  // succeed on a fresh course and the editor would need an empty-state branch
  // that exists for exactly one click.
  return prisma.course.create({
    data: {
      title: input.title,
      slug,
      summary: input.summary ?? null,
      coverImageUrl: input.coverImageUrl ?? null,
      estimatedMinutes: input.estimatedMinutes ?? null,
      status: "DRAFT",
      createdById: input.createdById,
      modules: { create: { order: 0, title: "Course content" } },
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

// ── Modules ──────────────────────────────────────────────────

/** The authoring tree: modules in order, each with its sections in order. */
export async function listModules(courseId: string) {
  return prisma.courseModule.findMany({
    where: { courseId },
    orderBy: { order: "asc" },
    select: {
      ...moduleSelect,
      sections: { orderBy: { order: "asc" }, select: sectionSelect },
    },
  });
}

/** A new module always appends; authors reposition by dragging, not by index. */
export async function createModule(input: CreateModuleInput) {
  const last = await prisma.courseModule.findFirst({
    where: { courseId: input.courseId },
    orderBy: { order: "desc" },
    select: { order: true },
  });
  return prisma.courseModule.create({
    data: {
      courseId: input.courseId,
      order: (last?.order ?? -1) + 1,
      title: input.title,
      summary: input.summary ?? null,
      estimatedMinutes: input.estimatedMinutes ?? null,
      isRequired: input.isRequired ?? true,
      sequential: input.sequential ?? true,
    },
    select: { ...moduleSelect, sections: { orderBy: { order: "asc" }, select: sectionSelect } },
  });
}

export async function updateModule(id: string, input: UpdateModuleInput) {
  const data: Prisma.CourseModuleUpdateInput = {};
  if (input.title !== undefined) data.title = input.title;
  if (input.summary !== undefined) data.summary = input.summary;
  if (input.estimatedMinutes !== undefined) data.estimatedMinutes = input.estimatedMinutes;
  if (input.isRequired !== undefined) data.isRequired = input.isRequired;
  if (input.sequential !== undefined) data.sequential = input.sequential;
  return prisma.courseModule.update({
    where: { id },
    data,
    select: { ...moduleSelect, sections: { orderBy: { order: "asc" }, select: sectionSelect } },
  });
}

/** Cascades to its sections, and through them to questions, progress and attempts. */
export async function deleteModule(id: string) {
  await prisma.courseModule.delete({ where: { id } });
}

/**
 * Rewrite the whole module/section tree for a course in one transaction.
 *
 * A nested drag produces a whole-tree state on the client anyway, and a
 * whole-set write is the only shape that cannot leave a section orphaned
 * between two modules when a cross-container drop applies half its effect.
 *
 * The payload must be an EXACT permutation of the course's modules and
 * sections — every id present exactly once, no strangers. Anything else throws
 * StructureMismatchError, which the route turns into a 400.
 */
export async function saveStructure(courseId: string, tree: StructureModule[]) {
  const [modules, sections] = await Promise.all([
    prisma.courseModule.findMany({ where: { courseId }, select: { id: true } }),
    prisma.courseSection.findMany({ where: { courseId }, select: { id: true } }),
  ]);

  const knownModules = new Set(modules.map((m) => m.id));
  const knownSections = new Set(sections.map((s) => s.id));

  const seenModules = new Set<string>();
  const seenSections = new Set<string>();
  for (const entry of tree) {
    // Shape-check before field access: a malformed entry is the same class of
    // client bug as a partial one, and must land on the 400 path rather than
    // throwing a TypeError the route can only report as a 500.
    if (!entry || typeof entry !== "object" || !Array.isArray(entry.sectionIds)) {
      throw new StructureMismatchError("Each tree entry needs a moduleId and a sectionIds array");
    }
    if (!knownModules.has(entry.moduleId) || seenModules.has(entry.moduleId)) {
      throw new StructureMismatchError(`Unknown or duplicated module ${entry.moduleId}`);
    }
    seenModules.add(entry.moduleId);
    for (const sid of entry.sectionIds) {
      if (!knownSections.has(sid) || seenSections.has(sid)) {
        throw new StructureMismatchError(`Unknown or duplicated section ${sid}`);
      }
      seenSections.add(sid);
    }
  }
  if (seenModules.size !== knownModules.size || seenSections.size !== knownSections.size) {
    throw new StructureMismatchError("Structure payload must list every module and section exactly once");
  }

  const writes: Prisma.PrismaPromise<unknown>[] = [];
  tree.forEach((entry, moduleIndex) => {
    writes.push(
      prisma.courseModule.update({ where: { id: entry.moduleId }, data: { order: moduleIndex } })
    );
    entry.sectionIds.forEach((sid, sectionIndex) => {
      writes.push(
        prisma.courseSection.update({
          where: { id: sid },
          data: { moduleId: entry.moduleId, order: sectionIndex },
        })
      );
    });
  });
  await prisma.$transaction(writes);

  return listModules(courseId);
}

// ── Sections ─────────────────────────────────────────────────

/**
 * One section WITH its body.
 *
 * `sectionSelect` deliberately omits `contentJson` so the whole-course tree
 * stays small, but the editor needs a real body to fall back on when the collab
 * WS never syncs (blocked socket, stripped Upgrade headers, failed token auth).
 * Without it the editor renders blank while the learner preview — which reads
 * contentJson straight from the DB — still shows the text.
 */
export async function getSection(id: string) {
  return prisma.courseSection.findUnique({
    where: { id },
    select: { ...sectionSelect, contentJson: true },
  });
}

export async function createSection(input: CreateSectionInput) {
  const last = await prisma.courseSection.findFirst({
    where: { moduleId: input.moduleId },
    orderBy: { order: "desc" },
    select: { order: true },
  });
  return prisma.courseSection.create({
    data: {
      courseId: input.courseId,
      moduleId: input.moduleId,
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
