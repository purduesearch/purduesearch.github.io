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

/**
 * Refs a course.json points at that nobody has written yet, across every course.
 *
 * A course is scaffolded before it is written: `ares-101`'s course.json lands
 * with all 52 sections up front so eleven independently-authored modules cannot
 * drift on section order or asset numbering, which means most of its refs dangle
 * until each module task fills one in. Seeding installs the section anyway, with
 * an empty body — the shape a section with no bodyRef at all already takes — so
 * the modules that ARE written can be opened in the player as they land.
 *
 * Skipped, never silent: an unwritten article and a mistyped ref look identical
 * from here, so every one is printed at the end of the run.
 */
const pendingRefs: string[] = [];

/** Resolve a ref against its course dir, or record it as pending and return null. */
function resolveRef(dir: string, slug: string, ref: string): string | null {
  const file = path.join(dir, ref);
  if (fs.existsSync(file)) return file;
  pendingRefs.push(`${slug}/${ref}`);
  return null;
}

/**
 * Split a course markdown file into its frontmatter block and its body.
 *
 * The body is everything after the closing `---`. `readLitConfig` discards it —
 * a lit review's body is author material — but `readAssignmentConfig` installs
 * it, because an assignment's body is the learner-facing context.
 */
function parseFrontmatter(file: string): { front: string; body: string } {
  const raw = fs.readFileSync(file, "utf8");
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) throw new Error(`${path.basename(file)}: no frontmatter block`);
  return { front: match[1]!, body: raw.slice(match[0].length).replace(/^\r?\n/, "") };
}

/** One `key: value` line from a frontmatter block, unquoted. */
function readScalar(front: string, key: string): string {
  const m = front.match(new RegExp(`^${key}:[ \\t]*(.*)$`, "m"));
  return m ? m[1]!.trim().replace(/^["']|["']$/g, "") : "";
}

/** Parse the `rubric:` list out of a frontmatter block. Shared by both kinds. */
function parseRubricBlock(front: string): { id: string; point: string; weight: number }[] {
  // rubric:
  //   - id: claim
  //     point: States the central claim
  //     weight: 2
  //
  // Consume indented lines only, and stop at the first line that starts in
  // column 0 (the next frontmatter key). Do NOT use `\Z` here: JavaScript has no
  // such escape, so it is a literal "Z" and any capital Z in a rubric point —
  // "send Z", "Van der Hegge Zijnen" — silently truncates the block and drops
  // every point after it.
  const rubric: { id: string; point: string; weight: number }[] = [];
  const rubricBlock = front.match(/^rubric:\r?\n((?:[ \t]+.*(?:\r?\n)?)*)/m)?.[1] ?? "";
  for (const chunk of rubricBlock.split(/^\s*-\s+/m).slice(1)) {
    const id = chunk.match(/id:[ \t]*(.*)/)?.[1]?.trim() ?? "";
    const point = chunk.match(/point:[ \t]*(.*)/)?.[1]?.trim() ?? "";
    const weight = Number(chunk.match(/weight:[ \t]*(.*)/)?.[1]?.trim() ?? 1);
    if (id && point) rubric.push({ id, point, weight: Number.isFinite(weight) && weight > 0 ? weight : 1 });
  }
  return rubric;
}

/**
 * Read a `key: |` block scalar: everything after the marker line to the end of
 * the frontmatter, with two-space indentation stripped. Such a key must be the
 * frontmatter's LAST, so it can run to the `---` without any escaping.
 */
function parseBlockScalar(front: string, key: string): string {
  const block = front.match(new RegExp(`^${key}:[ \\t]*\\|\\r?\\n([\\s\\S]*)$`, "m"))?.[1] ?? "";
  return block
    .split(/\r?\n/)
    .map((line) => line.replace(/^ {2}/, ""))
    .join("\n")
    .trim();
}

/**
 * Read a `lit/Lnn-*.md` file into a litConfig.
 *
 * The file's frontmatter is the section config; its body is the annotated
 * bibliography and synthesis, which is author material and is NOT installed.
 * One file holds both because the reference summary is a distillation of the
 * synthesis directly below it, and split across two files they drift.
 *
 * `referenceSummary` is the frontmatter's last key and runs to the `---`, so it
 * can be several paragraphs without any escaping.
 */
function readLitConfig(file: string): Record<string, unknown> {
  const { front } = parseFrontmatter(file);
  const scalar = (key: string): string => readScalar(front, key);
  const rubric = parseRubricBlock(front);
  const referenceSummary = parseBlockScalar(front, "referenceSummary");

  const minWords = Number(scalar("minWords"));
  const config = {
    pdfDriveFileId: scalar("pdfDriveFileId"),
    pdfTitle: scalar("pdfTitle"),
    citation: scalar("citation"),
    promptText: scalar("promptText"),
    minWords: Number.isFinite(minWords) && minWords > 0 ? minWords : 150,
    referenceSummary,
    rubric,
  };

  // Fail the seed loudly rather than install a section that grades against
  // nothing — a learner would submit, get no feedback, and never know why.
  if (!config.pdfDriveFileId) throw new Error(`${path.basename(file)}: pdfDriveFileId is required`);
  if (!config.referenceSummary) throw new Error(`${path.basename(file)}: referenceSummary is required`);
  if (!config.rubric.length) throw new Error(`${path.basename(file)}: at least one rubric point is required`);
  return config;
}

/**
 * Read an `exercises/E0n-*.md` file into an assignmentConfig plus its body.
 *
 * Unlike readLitConfig, the BODY IS INSTALLED: for an assignment it is the
 * learner-facing context that sets up the work, not author material. Only the
 * frontmatter's referenceAnswer and rubric are withheld, and they are withheld
 * by courseProgressService building the learner payload from safe keys — not by
 * anything here.
 */
function readAssignmentConfig(file: string): {
  config: Record<string, unknown>;
  body: string;
  passThreshold: number | null;
} {
  const { front, body } = parseFrontmatter(file);
  const scalar = (key: string) => readScalar(front, key);
  const minWords = Number(scalar("minWords"));
  const threshold = Number(scalar("passThreshold"));
  const rubric = parseRubricBlock(front);
  const referenceAnswer = parseBlockScalar(front, "referenceAnswer");

  // Fail the seed loudly rather than install a section that grades against
  // nothing — same rule as readLitConfig.
  if (!rubric.length) throw new Error(`${path.basename(file)}: no rubric points`);
  if (!referenceAnswer) throw new Error(`${path.basename(file)}: no referenceAnswer`);

  return {
    config: {
      promptText: scalar("promptText"),
      handoutDriveFileId: scalar("handoutDriveFileId"),
      handoutName: scalar("handoutName"),
      handoutMimeType: scalar("handoutMimeType"),
      minWords: Number.isFinite(minWords) && minWords > 0 ? minWords : 150,
      referenceAnswer,
      rubric,
    },
    body,
    passThreshold: Number.isFinite(threshold) && threshold > 0 ? threshold : null,
  };
}

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
        const file = resolveRef(dir, doc.slug, s.bodyRef);
        if (file) data.contentJson = courseBodyToDoc(fs.readFileSync(file, "utf8"));
      }
      if (s.kind === "VIDEO" && s.videoConfig) data.videoConfig = s.videoConfig;
      if (s.kind === "SLIDES" && s.slideConfig) data.slideConfig = s.slideConfig;
      if (s.kind === "LIT_REVIEW" && s.litRef) {
        const file = resolveRef(dir, doc.slug, s.litRef);
        if (file) data.litConfig = readLitConfig(file);
      }
      if (s.kind === "LIT_REVIEW" && s.bodyRef) {
        // Intro prose above the paper, same conversion as a CONTENT body.
        const file = resolveRef(dir, doc.slug, s.bodyRef);
        if (file) data.contentJson = courseBodyToDoc(fs.readFileSync(file, "utf8"));
      }
      if (s.kind === "ASSIGNMENT" && s.assignmentRef) {
        const file = resolveRef(dir, doc.slug, s.assignmentRef);
        if (file) {
          const { config, body, passThreshold } = readAssignmentConfig(file);
          data.assignmentConfig = config;
          data.contentJson = courseBodyToDoc(body);
          // course.json's explicit passThreshold wins; the file's is the default.
          if (s.passThreshold == null && passThreshold != null) {
            data.passThreshold = passThreshold;
          }
        }
      }

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
        const file = resolveRef(dir, doc.slug, s.quizRef);
        if (file) await seedQuiz(section.id, file);
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

  if (pendingRefs.length) {
    console.log(`\n${pendingRefs.length} ref(s) not written yet — those sections installed empty:`);
    for (const p of pendingRefs) console.log(`  · ${p}`);
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
