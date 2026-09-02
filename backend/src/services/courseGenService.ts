import { prisma } from "../db/prisma.js";
import { todayContext } from "./geminiService.js";
import { runJson } from "./ai/aiRouter.js";
import { validateCoursePlan, planSectionCount } from "./coursePlan.js";
import { docToPlainText } from "./blogAiService.js";
import * as courseService from "./courseService.js";
import { buildDocFromPlan, validateSectionPlan } from "./sectionPlan.js";
import { BLOG_PLAN_SCHEMA, BLOG_PLAN_RULES } from "./aiOutreachService.js";
import { EMPTY_DOC, markdownToTiptapJson } from "./blogRender.js";
import type { CoursePlan, PlanCourseSection } from "./coursePlan.js";

// Stage 1 is one call and takes seconds. Stage 2 is one call per section and
// takes minutes, which is why the job lives in a table and the client polls.

/** Hard ceiling on model calls per job, checked in stage 2's loop. */
export const MAX_CALLS_PER_JOB = 60;

/** A job in OUTLINING or GENERATING older than this was killed by a restart. */
const STALE_JOB_MS = 15 * 60 * 1000;

async function loadSourcePosts(ids: string[]): Promise<string> {
  if (!ids.length) return "";
  const posts = await prisma.blogPost.findMany({
    where: { id: { in: ids.slice(0, 5) }, status: "PUBLISHED" },
    select: { title: true, contentJson: true },
  });
  return posts
    .map((p) => `### ${p.title}\n${docToPlainText(p.contentJson).slice(0, 6000)}`)
    .join("\n\n");
}

export async function startOutline(input: {
  memberId: string; prompt: string; reference?: string; sourcePostIds?: string[];
}) {
  return prisma.courseGenJob.create({
    data: {
      createdById: input.memberId,
      status: "OUTLINING",
      prompt: input.prompt.slice(0, 20000),
      reference: input.reference?.slice(0, 40000) ?? null,
      sourcePostIds: (input.sourcePostIds ?? []).slice(0, 5),
      stepLabel: "Drafting the outline…",
    },
    select: { id: true },
  });
}

/**
 * Stage 1. One model call; on success the job parks in AWAITING_REVIEW until the
 * author approves. Never throws — a failure is recorded on the row, because the
 * caller is a fire-and-forget `void` and has nowhere to report to.
 */
// `memberId` is the author who started the job, threaded from the route handler so
// the generation spends their own linked key rather than the club-wide Gemini quota.
// Optional: omitted, the whole job routes to the built-in lane.
export async function runOutline(jobId: string, memberId?: string | null): Promise<void> {
  try {
    const job = await prisma.courseGenJob.findUnique({ where: { id: jobId } });
    if (!job || job.status !== "OUTLINING") return;

    const sourceText = await loadSourcePosts(job.sourcePostIds);
    const prompt = `You design training courses for Purdue SEARCH (Students for the Exploration and Research of Space), a university engineering club.
${todayContext()}

Design a course from this brief:
${job.prompt}
${job.reference ? `\nReference material the course MUST be grounded in:\n${job.reference.slice(0, 20000)}` : ""}
${sourceText ? `\nExisting club writing to draw on:\n${sourceText}` : ""}

Return ONLY a JSON object:
{
  "title": string,
  "summary": string,
  "modules": [{
    "title": string,
    "summary": string,          // one line; shown to learners BEFORE the module unlocks
    "estimatedMinutes": number,
    "isRequired": boolean,      // false only for genuinely optional side material
    "sequential": boolean,      // false when the sections inside can be done in any order
    "sections": [{
      "kind": "CONTENT" | "VIDEO" | "QUIZ" | "SLIDES",
      "title": string,
      "brief": string,          // 1-3 sentences: exactly what this section must cover
      "isRequired": boolean,
      "questionCount": number,  // QUIZ only, 3-10
      "passThreshold": number,  // QUIZ only, usually 80
      "slideCount": number      // SLIDES only, 8-20
    }]
  }]
}

Rules:
- 3-6 modules, 2-5 sections each. Build a real progression: teach, then practise, then check.
- End most modules with a QUIZ section that tests THAT module's material.
- Use CONTENT for written material, SLIDES where a deck genuinely suits the topic, and VIDEO only
  where a recorded demonstration is the point. Do not scatter kinds for variety.
- "brief" is the single most important field: it is the only instruction the writer of that section
  will receive. Make each one specific and non-overlapping.
- Ground everything in the brief and the reference material. Do NOT invent facts, numbers, names,
  partnerships, or club history.
- Avoid filler adjectives ("cutting-edge", "comprehensive", "exciting").`;

    const raw = await runJson<unknown>({ memberId }, "high", { prompt, json: true, maxOutputTokens: 8192 });
    const plan = validateCoursePlan(raw);

    if (!plan.modules.length || planSectionCount(plan) === 0) {
      await prisma.courseGenJob.update({
        where: { id: jobId },
        data: { status: "FAILED", error: "The model did not return a usable outline — try a more specific brief" },
      });
      return;
    }

    await prisma.courseGenJob.update({
      where: { id: jobId },
      data: {
        status: "AWAITING_REVIEW",
        outline: plan as unknown as object,
        progress: 0,
        stepLabel: `Outline ready — ${plan.modules.length} modules, ${planSectionCount(plan)} sections`,
      },
    });
  } catch (err) {
    console.error("[courseGen] runOutline error:", err);
    await prisma.courseGenJob.update({
      where: { id: jobId },
      data: { status: "FAILED", error: "Outline generation failed — try again in a minute" },
    }).catch(() => {});
  }
}

function assertOwner(job: { createdById: string } | null, memberId: string, isAdmin: boolean) {
  if (!job) return false;
  return job.createdById === memberId || isAdmin;
}

export async function getJob(jobId: string, memberId: string, isAdmin: boolean) {
  const job = await prisma.courseGenJob.findUnique({ where: { id: jobId } });
  return assertOwner(job, memberId, isAdmin) ? job : null;
}

export async function listJobs(memberId: string) {
  return prisma.courseGenJob.findMany({
    where: { createdById: memberId },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
}

/**
 * Replace the outline with the author's edited version. Re-validates: the review
 * screen is a convenience, not a trust boundary, and a hand-built request must
 * not be able to smuggle in a 40-module plan.
 */
export async function reviseOutline(jobId: string, memberId: string, outline: unknown) {
  const job = await prisma.courseGenJob.findUnique({ where: { id: jobId } });
  if (!job || job.createdById !== memberId) return null;
  if (job.status !== "AWAITING_REVIEW") return null;
  const plan = validateCoursePlan(outline);
  return prisma.courseGenJob.update({
    where: { id: jobId },
    data: { outline: plan as unknown as object },
  });
}

export async function cancelJob(jobId: string, memberId: string) {
  const job = await prisma.courseGenJob.findUnique({ where: { id: jobId } });
  if (!job || job.createdById !== memberId) return null;
  if (job.status === "DONE") return job;
  // Stage 2 checks status between sections and stops. Sections already written
  // stay — a partial draft is more useful than deleting the author's work.
  return prisma.courseGenJob.update({
    where: { id: jobId },
    data: { status: "FAILED", error: "Cancelled" },
  });
}

/**
 * Jobs run in the API process, so a restart abandons anything in flight. Sweep
 * them to FAILED at startup rather than leaving a spinner that never resolves.
 */
export async function sweepStaleJobs(): Promise<number> {
  const cutoff = new Date(Date.now() - STALE_JOB_MS);
  const { count } = await prisma.courseGenJob.updateMany({
    where: { status: { in: ["OUTLINING", "GENERATING"] }, updatedAt: { lt: cutoff } },
    data: { status: "FAILED", error: "Interrupted by a server restart — start a new generation" },
  });
  return count;
}

interface SectionContext {
  courseTitle: string;
  moduleTitle: string;
  reference: string;
  /** The author who approved the outline; null for any keyless caller. */
  memberId?: string | null;
}

/** CONTENT — the blog generator pointed at a section brief. */
async function generateContentBody(sec: PlanCourseSection, ctx: SectionContext) {
  const prompt = `You are writing one section of a training course for Purdue SEARCH, a university engineering club.
${todayContext()}

Course: ${ctx.courseTitle}
Module: ${ctx.moduleTitle}
Section: ${sec.title}
This section must cover: ${sec.brief}
${ctx.reference ? `\nReference material to ground this in:\n${ctx.reference.slice(0, 12000)}` : ""}

${BLOG_PLAN_SCHEMA}

Compose the section:
- Do NOT open with a hero — this is a section inside a course, not a standalone article.
- Open with a short richText intro, then develop 3-5 body sections (~450-700 words total).
- Teach concretely: name the specific concepts, steps, or components a learner must come away with.
- Use a callout for anything safety-critical or easy to get wrong.
- Do NOT end with a social-media CTA.

${BLOG_PLAN_RULES}`;

  const raw = await runJson<unknown>({ memberId: ctx.memberId }, "high", { prompt, json: true, maxOutputTokens: 8192 });
  const plan = raw ? validateSectionPlan(raw) : { sections: [] };
  // Never leave a section empty: an author would rather edit thin prose than
  // stare at a blank editor wondering whether generation ran.
  if (!plan.sections.length) {
    return markdownToTiptapJson(`## ${sec.title}\n\n${sec.brief}`);
  }
  return buildDocFromPlan(plan);
}

/** SLIDES — a slide outline as prose. No CourseSlide rows: there is no deck. */
async function generateSlideOutline(sec: PlanCourseSection, ctx: SectionContext) {
  const count = sec.slideCount ?? 10;
  const prompt = `You are outlining a slide deck for one section of a Purdue SEARCH training course.
${todayContext()}

Course: ${ctx.courseTitle}
Module: ${ctx.moduleTitle}
Section: ${sec.title}
The deck must cover: ${sec.brief}
${ctx.reference ? `\nReference material:\n${ctx.reference.slice(0, 8000)}` : ""}

Return ONLY a JSON object: { "slides": [{ "title": string, "bullets": string[], "notes": string }] }
- Exactly ${count} slides.
- 2-5 short bullets per slide. Bullets are phrases, not paragraphs.
- "notes" is what the presenter says for that slide: 2-3 sentences.
- Ground everything in the brief and reference. Do NOT invent facts or numbers.`;

  const raw = await runJson<{ slides?: { title?: string; bullets?: string[]; notes?: string }[] }>(
    { memberId: ctx.memberId }, "high", { prompt, json: true, maxOutputTokens: 8192 }
  );
  const slides = Array.isArray(raw?.slides) ? raw!.slides!.slice(0, 60) : [];
  if (!slides.length) return markdownToTiptapJson(`## ${sec.title}\n\n${sec.brief}`);

  const md = [
    `## Slide outline — ${sec.title}`,
    "",
    "*Build this deck, then import it in the Slides workbench.*",
    "",
    ...slides.flatMap((s, i) => [
      `### ${i + 1}. ${(s.title ?? "Untitled slide").slice(0, 200)}`,
      ...(s.bullets ?? []).slice(0, 8).map((b) => `- ${String(b).slice(0, 300)}`),
      s.notes ? `\n> **Speaker notes:** ${String(s.notes).slice(0, 800)}` : "",
      "",
    ]),
  ].join("\n");
  return markdownToTiptapJson(md);
}

/** QUIZ — grounded in the content THIS module just produced. */
async function generateQuizQuestions(
  sec: PlanCourseSection, ctx: SectionContext, moduleContent: string
) {
  const count = sec.questionCount ?? 5;
  const prompt = `You are writing a quiz for one module of a Purdue SEARCH training course.
${todayContext()}

Course: ${ctx.courseTitle}
Module: ${ctx.moduleTitle}
This quiz must test: ${sec.brief}

The module's teaching material (test ONLY what this covers):
${moduleContent.slice(0, 16000)}

Return ONLY a JSON object:
{ "questions": [{
    "prompt": string,
    "kind": "SINGLE" | "MULTI" | "TRUE_FALSE",
    "explanation": string,
    "points": number,
    "answers": [{ "text": string, "isCorrect": boolean }]
}] }

Rules:
- Exactly ${count} questions.
- SINGLE has exactly one correct answer among 4 options. MULTI has 2-3 correct among 5.
  TRUE_FALSE has exactly the two options "True" and "False", one correct.
- Every question MUST be answerable from the material above. Do not test outside it.
- "explanation" says why the right answer is right, in one or two sentences.
- Wrong options must be plausible, not filler. No "none of the above".
- points is 1 unless a question is genuinely harder, then 2.`;

  const raw = await runJson<{ questions?: unknown[] }>(
    { memberId: ctx.memberId }, "high", { prompt, json: true, maxOutputTokens: 8192 }
  );
  const rows = Array.isArray(raw?.questions) ? raw!.questions! : [];

  // Validate here rather than trusting the model: a question with no correct
  // answer grades as unanswerable, and one with two correct answers under SINGLE
  // is unpassable. Both are silent until a learner hits them.
  const KINDS = new Set(["SINGLE", "MULTI", "TRUE_FALSE"]);
  return rows.slice(0, 20).flatMap((r, order) => {
    const o = (r ?? {}) as Record<string, unknown>;
    const prompt2 = typeof o.prompt === "string" ? o.prompt.trim().slice(0, 1000) : "";
    const kind = KINDS.has(String(o.kind)) ? String(o.kind) : "SINGLE";
    const answers = (Array.isArray(o.answers) ? o.answers : [])
      .slice(0, 6)
      .map((a, i) => {
        const ao = (a ?? {}) as Record<string, unknown>;
        return {
          order: i,
          text: typeof ao.text === "string" ? ao.text.trim().slice(0, 500) : "",
          isCorrect: ao.isCorrect === true,
        };
      })
      .filter((a) => a.text);
    const correct = answers.filter((a) => a.isCorrect).length;
    if (!prompt2 || answers.length < 2 || correct < 1) return [];
    if (kind !== "MULTI" && correct !== 1) return [];
    return [{
      order,
      prompt: prompt2,
      kind: kind as "SINGLE" | "MULTI" | "TRUE_FALSE",
      explanation: typeof o.explanation === "string" ? o.explanation.slice(0, 1000) : null,
      points: typeof o.points === "number" && o.points >= 1 && o.points <= 5 ? Math.round(o.points) : 1,
      answers,
    }];
  });
}

/**
 * Stage 2. Walks the approved outline creating real rows through courseService,
 * so ordering, defaults, and the born-with-a-module rule are the same code the
 * editor uses.
 *
 * Calls are SEQUENTIAL: the Gemini limiter is a sliding window, and firing a
 * dozen section calls at once turns a slow job into a failed one.
 *
 * Never throws — it is invoked as fire-and-forget and records failure on the row.
 */
export async function runGeneration(jobId: string, memberId?: string | null): Promise<void> {
  let calls = 0;
  try {
    const job = await prisma.courseGenJob.findUnique({ where: { id: jobId } });
    if (!job || job.status !== "GENERATING") return;

    const plan = job.outline as unknown as CoursePlan;
    const totalSections = planSectionCount(plan);
    const reference = job.reference ?? "";

    const course = await courseService.createCourse({
      title: plan.title,
      summary: plan.summary,
      createdById: job.createdById,
    });
    // createCourse seeds one "Course content" module; the plan supplies its own,
    // so drop the placeholder rather than leaving an empty module at the top.
    const seeded = await prisma.courseModule.findMany({ where: { courseId: course.id } });
    for (const m of seeded) await courseService.deleteModule(m.id);

    await prisma.courseGenJob.update({
      where: { id: jobId }, data: { courseId: course.id, progress: 2 },
    });

    let done = 0;
    for (const planModule of plan.modules) {
      const mod = await courseService.createModule({
        courseId: course.id,
        title: planModule.title,
        summary: planModule.summary ?? null,
        estimatedMinutes: planModule.estimatedMinutes ?? null,
        isRequired: planModule.isRequired ?? true,
        sequential: planModule.sequential ?? true,
      });

      // Accumulated as the module's CONTENT sections are written, then handed to
      // that module's quiz. This is the ONE place stage 2 looks at earlier
      // output, and it is bounded to a single module on purpose.
      let moduleContent = "";

      for (const planSection of planModule.sections) {
        const fresh = await prisma.courseGenJob.findUnique({
          where: { id: jobId }, select: { status: true },
        });
        if (fresh?.status !== "GENERATING") return;  // cancelled between sections
        if (calls >= MAX_CALLS_PER_JOB) {
          await prisma.courseGenJob.update({
            where: { id: jobId },
            data: { status: "FAILED", error: "Hit the generation call limit — the partial course was kept" },
          });
          return;
        }

        await prisma.courseGenJob.update({
          where: { id: jobId },
          data: {
            stepLabel: `Writing ${done + 1} of ${totalSections} — ${planSection.title}`,
            progress: Math.min(98, 2 + Math.round((done / Math.max(1, totalSections)) * 96)),
          },
        });

        const section = await courseService.createSection({
          courseId: course.id,
          moduleId: mod.id,
          title: planSection.title,
          kind: planSection.kind,
          isRequired: planSection.isRequired ?? true,
          ...(planSection.kind === "QUIZ"
            ? { passThreshold: planSection.passThreshold ?? 80 }
            : {}),
        });

        const ctx: SectionContext = {
          courseTitle: plan.title, moduleTitle: planModule.title, reference, memberId,
        };

        if (planSection.kind === "CONTENT") {
          const doc = await generateContentBody(planSection, ctx);
          calls += 1;
          await courseService.updateSection(section.id, { contentJson: doc });
          moduleContent += `\n\n## ${planSection.title}\n${docToPlainText(doc)}`;
        } else if (planSection.kind === "SLIDES") {
          const doc = await generateSlideOutline(planSection, ctx);
          calls += 1;
          await courseService.updateSection(section.id, { contentJson: doc });
          moduleContent += `\n\n## ${planSection.title}\n${docToPlainText(doc)}`;
        } else if (planSection.kind === "VIDEO") {
          // A placeholder, not a call — there is nothing to generate until the
          // author supplies a YouTube id.
          await courseService.updateSection(section.id, {
            contentJson: markdownToTiptapJson(
              `## ${planSection.title}\n\n*Add the video for this section.*\n\n${planSection.brief}`
            ),
          });
        } else if (planSection.kind === "QUIZ") {
          const questions = await generateQuizQuestions(planSection, ctx, moduleContent);
          calls += 1;
          if (questions.length) {
            await courseService.replaceQuestions(section.id, questions, "quiz");
          }
          await courseService.updateSection(section.id, { contentJson: EMPTY_DOC });
        }

        done += 1;
      }
    }

    await prisma.courseGenJob.update({
      where: { id: jobId },
      data: { status: "DONE", progress: 100, stepLabel: "Done", error: null },
    });
  } catch (err) {
    console.error("[courseGen] runGeneration error:", err);
    await prisma.courseGenJob.update({
      where: { id: jobId },
      data: { status: "FAILED", error: "Generation failed partway — the partial course was kept" },
    }).catch(() => {});
  }
}
