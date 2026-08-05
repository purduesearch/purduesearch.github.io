/**
 * Install courses from docs/courses into the database.
 *
 * Reads the repo working tree, so this CANNOT run from a deployed backend build
 * (no docs/ directory there). That is deliberate: installing a course is an
 * authoring act performed from a checkout, not a runtime operation.
 *
 * Idempotent and non-destructive toward learners: it upserts course / module /
 * section / question rows and never touches CourseEnrollment,
 * CourseSectionProgress, or CourseQuizAttempt.
 *
 * Run: cd backend && npm run seed:courses
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prisma } from "../src/db/prisma.js";
import { loadTourSteps } from "../src/services/tourStepService.js";
import { courseBodyToDoc } from "../src/services/courseMarkdown.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const COURSES = path.join(REPO_ROOT, "docs", "courses");

const ARCHIVED_PREFIX = "[archived] ";

async function seedCourse(dir: string, authorId: string) {
  const doc = JSON.parse(fs.readFileSync(path.join(dir, "course.json"), "utf8"));

  const course = await prisma.course.upsert({
    where: { slug: doc.slug },
    update: {
      title: doc.title,
      summary: doc.summary,
      estimatedMinutes: doc.estimatedMinutes,
      xpOverride: doc.xpOverride ?? null,
      doubloonOverride: doc.doubloonOverride ?? null,
    },
    create: {
      slug: doc.slug,
      title: doc.title,
      summary: doc.summary,
      estimatedMinutes: doc.estimatedMinutes,
      status: "DRAFT",
      xpOverride: doc.xpOverride ?? null,
      doubloonOverride: doc.doubloonOverride ?? null,
      createdById: authorId,
    },
  });

  const seenSectionIds: string[] = [];

  for (const m of doc.modules) {
    const existingModule = await prisma.courseModule.findFirst({
      where: { courseId: course.id, title: m.title },
    });
    const mod = existingModule
      ? await prisma.courseModule.update({
          where: { id: existingModule.id },
          data: {
            order: m.order,
            summary: m.summary,
            estimatedMinutes: m.estimatedMinutes,
            isRequired: m.isRequired,
            sequential: m.sequential,
          },
        })
      : await prisma.courseModule.create({
          data: {
            courseId: course.id,
            order: m.order,
            title: m.title,
            summary: m.summary,
            estimatedMinutes: m.estimatedMinutes,
            isRequired: m.isRequired,
            sequential: m.sequential,
          },
        });

    for (const s of m.sections) {
      const data: Record<string, unknown> = {
        order: s.order,
        title: s.title,
        kind: s.kind,
        isRequired: s.isRequired,
        contentJson: {},
        passThreshold: s.passThreshold ?? null,
        maxAttempts: s.maxAttempts ?? null,
      };

      if (s.kind === "WALKTHROUGH") {
        // Validate now, not at learn time: a broken step file should fail the
        // seed loudly rather than surface as a dead tour for a learner.
        const steps = loadTourSteps(s.tourConfig.tourId);
        if (steps.length !== s.tourConfig.stepCount) {
          throw new Error(
            `${s.tourConfig.tourId}: course.json says stepCount ${s.tourConfig.stepCount}, ` +
              `file has ${steps.length}`
          );
        }
        data.tourConfig = s.tourConfig;
      }
      if (s.kind === "CONTENT" && s.bodyRef) {
        // Must be a TipTap document, not the raw markdown: the player renders
        // this through BlogEditor read-only and the editor loads the same
        // shape. Storing `{ markdownSource }` here rendered every CONTENT
        // section blank, because TipTap got an object with no doc node.
        data.contentJson = courseBodyToDoc(
          fs.readFileSync(path.join(dir, s.bodyRef), "utf8")
        );
      }
      if (s.kind === "VIDEO" && s.videoConfig) data.videoConfig = s.videoConfig;
      if (s.kind === "SLIDES" && s.slideConfig) data.slideConfig = s.slideConfig;

      const existing = await prisma.courseSection.findFirst({
        where: { courseId: course.id, moduleId: mod.id, title: s.title },
      });
      const section = existing
        ? await prisma.courseSection.update({ where: { id: existing.id }, data })
        : await prisma.courseSection.create({
            data: { ...data, courseId: course.id, moduleId: mod.id } as never,
          });
      seenSectionIds.push(section.id);

      if (s.kind === "QUIZ" && s.quizRef) {
        await seedQuiz(section.id, path.join(dir, s.quizRef));
      }
    }
  }

  // Sections dropped from course.json are archived, never deleted — deleting a
  // section deletes the progress rows of everyone who completed it. The title is
  // prefixed rather than replaced, so an archived section is still identifiable.
  const dropped = await prisma.courseSection.findMany({
    where: { courseId: course.id, id: { notIn: seenSectionIds } },
    select: { id: true, title: true },
  });
  for (const d of dropped) {
    await prisma.courseSection.update({
      where: { id: d.id },
      data: {
        isRequired: false,
        title: d.title.startsWith(ARCHIVED_PREFIX) ? d.title : `${ARCHIVED_PREFIX}${d.title}`,
      },
    });
  }
  if (dropped.length) console.log(`  · ${doc.slug}: archived ${dropped.length} dropped section(s)`);

  console.log(`  ✓ ${doc.slug}: ${doc.modules.length} modules`);
}

async function seedQuiz(sectionId: string, file: string) {
  const bank = JSON.parse(fs.readFileSync(file, "utf8"));
  for (const q of bank.questions) {
    const existing = await prisma.courseQuestion.findFirst({
      where: { sectionId, prompt: q.prompt },
    });
    if (existing) {
      await prisma.courseQuestion.update({
        where: { id: existing.id },
        data: { order: q.order, kind: q.kind, explanation: q.explanation, points: q.points },
      });
      await prisma.courseAnswer.deleteMany({ where: { questionId: existing.id } });
      await prisma.courseAnswer.createMany({
        data: q.answers.map((a: any) => ({ questionId: existing.id, ...a })),
      });
      continue;
    }
    await prisma.courseQuestion.create({
      data: {
        sectionId,
        order: q.order,
        prompt: q.prompt,
        kind: q.kind,
        explanation: q.explanation,
        points: q.points,
        answers: { create: q.answers },
      },
    });
  }
}

async function main() {
  const author = await prisma.member.findFirst({ where: { isAdmin: true } });
  if (!author) throw new Error("no admin member to own the seeded courses");

  // One uninstallable course must not abort the others: a course whose step
  // files have not landed yet is a content gap, not a reason to leave the
  // courses that ARE ready uninstalled. Failures are still loud and still make
  // the run exit non-zero.
  const failures: string[] = [];

  for (const e of fs.readdirSync(COURSES, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const dir = path.join(COURSES, e.name);
    if (!fs.existsSync(path.join(dir, "course.json"))) continue;
    try {
      await seedCourse(dir, author.id);
    } catch (err) {
      failures.push(`${e.name}: ${err instanceof Error ? err.message : String(err)}`);
      console.error(`  ✗ ${e.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (failures.length) {
    console.error(`\nseed:courses finished with ${failures.length} course(s) not installed.`);
    process.exitCode = 1;
    return;
  }
  console.log("seed:courses done");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
