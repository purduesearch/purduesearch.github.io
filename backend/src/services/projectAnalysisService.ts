import { createHash } from "node:crypto";
import { prisma } from "../db/prisma.js";
import { runJson } from "./ai/aiRouter.js";
import { buildProjectContext, type ProjectContext } from "./projectContextService.js";
import {
  normalizeRisk, normalizeSprintPlan, normalizeCapacity, normalizeDriveTasks, resolveSprintCapacity,
} from "./projectAnalysisCore.js";
import {
  riskAnalysisPrompt, sprintPlanPrompt, projectBriefPrompt,
  standupSynthesisPrompt, standupSentimentPrompt,
  inferDependenciesPrompt, capacityAnalysisPrompt, stakeholderEmailPrompt, driveToTasksPrompt,
} from "../utils/aiPrompts.js";

// Every exported function takes an OPTIONAL trailing `memberId`. API handlers pass
// `req.memberId`; the scheduler in slack/scheduler.ts passes nothing.
//
// Tier is "medium" throughout: these were `generateJson` (the 30 RPM standard lane),
// and the tiers map 1:1 onto geminiService's lanes, so this is a relabelling that
// leaves built-in behaviour byte-for-byte unchanged.
//
// Risk, sprint plan, capacity and Drive parsing all start from `buildProjectContext`,
// which reads one project only: its members, tasks, milestones, blockers, time logs and
// activity. Nothing about other projects, or members outside this one, reaches a prompt.
// That helper also returns null for a training project, so these reports can never be
// run over fixture data.

const today = () => new Date().toISOString().split("T")[0];

/** Cache key that changes whenever the project's work changes, so a report is never served stale. */
function contextFingerprint(kind: string, context: ProjectContext, extra = ""): string {
  const basis = JSON.stringify([
    context.tasks.map((t) => [t.id, t.status, t.priority, t.dueDate, t.assignees, t.storyPoints, t.estimatedHours, t.blockedByTitles.length]),
    context.members.map((m) => [m.id, m.openTaskCount, m.loggedHoursLast14d]),
    context.milestones.map((m) => [m.id, m.status, m.taskCounts]),
    context.activeBlockers.map((b) => b.id),
    today(), extra,
  ]);
  return `${kind}:${context.project.id}:${createHash("sha1").update(basis).digest("hex").slice(0, 16)}`;
}

export async function analyzeProjectRisks(projectId: string, memberId?: string | null) {
  const context = await buildProjectContext(projectId);
  if (!context) return null;
  const raw = await runJson({ memberId }, "medium", {
    prompt: riskAnalysisPrompt(context, today()),
    json: true,
    cacheKey: contextFingerprint("risk", context),
  });
  return normalizeRisk(raw, context);
}

export async function generateSprintPlan(projectId: string, capacityPoints?: number, sprintDays = 14, memberId?: string | null) {
  const context = await buildProjectContext(projectId);
  if (!context) return null;
  const days = Number.isFinite(sprintDays) && sprintDays > 0 ? Math.min(Math.round(sprintDays), 60) : 14;
  const capacity = resolveSprintCapacity(context, capacityPoints, days);
  const raw = await runJson({ memberId }, "medium", {
    prompt: sprintPlanPrompt(context, { ...capacity, sprintDays: days }, today()),
    json: true,
  });
  return normalizeSprintPlan(raw, context, capacity);
}

/**
 * Extract tasks from a Drive document's text, shaped to this project: real member and
 * milestone ids, the team's own sizing, and no duplicates of open work. Returns null
 * when the project does not exist (or is a training project).
 */
export async function parseDriveDocument(
  projectId: string, documentText: string, opts: { memberId?: string | null; suggestedTaskCount?: number } = {}
) {
  const context = await buildProjectContext(projectId);
  if (!context) return null;
  // Truncation lives in the router (truncateForAdapter), keyed to the selected adapter's
  // ceiling, so a long document is not pre-cut here.
  const raw = await runJson({ memberId: opts.memberId }, "medium", {
    json: true,
    prompt: `${driveToTasksPrompt(context, today(), opts.suggestedTaskCount)}\n\n---DOCUMENT---\n${documentText}`,
  });
  return normalizeDriveTasks(raw, context);
}

export async function generateProjectBrief(projectId: string, memberId?: string | null) {
  const { getMilestonesForProject } = await import("./milestoneService.js");
  const [project, milestones] = await Promise.all([
    prisma.project.findUnique({
      where: { id: projectId },
      include: { tasks: { where: { archivedAt: null } }, updates: { orderBy: { postedAt: "desc" }, take: 3 } },
    }),
    getMilestonesForProject(projectId),
  ]);
  if (!project) return null;
  return runJson({ memberId }, "medium", {
    prompt: projectBriefPrompt(
      { name: project.name, description: project.description, type: project.type, targetDate: project.targetDate?.toISOString().split("T")[0] ?? null },
      project.tasks.map(t => ({ title: t.title, status: t.status, priority: t.priority })),
      (milestones as any[]).map((m: any) => ({ name: m.title, targetDate: m.dueDate?.toISOString().split("T")[0] ?? null, status: m.status })),
      (project.updates as any[]).map(u => u.content.slice(0, 100)),
    ),
    json: true,
    cacheKey: `brief:${projectId}`,
  });
}

export async function synthesizeStandups(responses: Array<{ memberName: string; yesterday: string; today: string; blockers: string }>, projectName: string, memberId?: string | null) {
  if (responses.length === 0) return null;
  return runJson({ memberId }, "medium", { prompt: standupSynthesisPrompt(responses, projectName), json: true });
}

export async function analyzeStandupSentiment(responses: Array<{ memberName: string; text: string }>, memberId?: string | null) {
  if (responses.length === 0) return null;
  return runJson({ memberId }, "medium", { prompt: standupSentimentPrompt(responses), json: true });
}

export async function inferTaskDependencies(projectId: string, memberId?: string | null) {
  const tasks = await prisma.task.findMany({
    where: { projectId, status: { not: "DONE" }, parentTaskId: null, archivedAt: null },
    select: { id: true, title: true, description: true },
  });
  if (tasks.length < 2) return { dependencies: [] };
  return runJson({ memberId }, "medium", {
    prompt: inferDependenciesPrompt(tasks),
    json: true,
    cacheKey: `deps:${projectId}`,
  });
}

export async function analyzeTeamCapacity(projectId: string, sprintDays = 14, memberId?: string | null) {
  const context = await buildProjectContext(projectId);
  if (!context) return null;
  const days = Number.isFinite(sprintDays) && sprintDays > 0 ? Math.min(Math.round(sprintDays), 60) : 14;
  const raw = await runJson({ memberId }, "medium", {
    prompt: capacityAnalysisPrompt(context, days, today()),
    json: true,
    cacheKey: contextFingerprint("capacity", context, String(days)),
  });
  return normalizeCapacity(raw, context);
}

export async function generateStakeholderEmail(projectId: string, memberId?: string | null) {
  const oneWeekAgo = new Date(); oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      tasks: { where: { archivedAt: null } },
      updates: { where: { postedAt: { gte: oneWeekAgo } }, orderBy: { postedAt: "desc" } },
    },
  });
  if (!project) return null;
  const completedThisWeek = project.tasks.filter(t => t.status === "DONE" && t.updatedAt >= oneWeekAgo).map(t => t.title);
  const inProgress = project.tasks.filter(t => t.status === "IN_PROGRESS").map(t => t.title);
  const blockers = project.tasks.filter(t => t.status === "BLOCKED").map(t => t.title);
  const done = project.tasks.filter(t => t.status === "DONE").length;
  const healthScore = project.tasks.length > 0 ? Math.round((done / project.tasks.length) * 100) : 0;
  return runJson({ memberId }, "medium", {
    prompt: stakeholderEmailPrompt(
      { name: project.name, targetDate: project.targetDate?.toISOString().split("T")[0] ?? null },
      completedThisWeek, inProgress, blockers, healthScore,
    ),
    json: true,
  });
}
