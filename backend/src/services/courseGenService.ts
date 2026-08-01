import { prisma } from "../db/prisma.js";
import { generateJsonComplex, todayContext } from "./geminiService.js";
import { validateCoursePlan, planSectionCount } from "./coursePlan.js";
import { docToPlainText } from "./blogAiService.js";

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
export async function runOutline(jobId: string): Promise<void> {
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

    const raw = await generateJsonComplex<unknown>(prompt, undefined, { maxOutputTokens: 8192 });
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
