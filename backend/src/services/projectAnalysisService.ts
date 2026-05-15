import { prisma } from "../db/prisma.js";
import { generateJson } from "./geminiService.js";
import {
  riskAnalysisPrompt, sprintPlanPrompt, projectBriefPrompt,
  standupSynthesisPrompt, standupSentimentPrompt,
  inferDependenciesPrompt, capacityAnalysisPrompt, stakeholderEmailPrompt
} from "../utils/aiPrompts.js";

export async function analyzeProjectRisks(projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { tasks: { include: { assignees: { select: { displayName: true } } } } },
  });
  if (!project) return null;
  const today = new Date().toISOString().split("T")[0];
  const tasks = project.tasks.map(t => ({
    title: t.title, status: t.status, dueDate: t.dueDate?.toISOString().split("T")[0] ?? null,
    priority: t.priority, assignees: t.assignees.map(a => a.displayName),
  }));
  return generateJson(riskAnalysisPrompt({ name: project.name, targetDate: project.targetDate?.toISOString().split("T")[0] }, tasks, today), `risk:${projectId}`);
}

export async function generateSprintPlan(projectId: string, capacityPoints = 40, sprintDays = 14) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { tasks: { include: { assignees: { select: { displayName: true } } } } },
  });
  if (!project) return null;
  const tasks = project.tasks.map(t => ({
    id: t.id, title: t.title, status: t.status, priority: t.priority,
    storyPoints: t.storyPoints, assignees: t.assignees.map(a => a.displayName),
    dueDate: t.dueDate?.toISOString().split("T")[0] ?? null,
  }));
  return generateJson(sprintPlanPrompt(tasks, capacityPoints, sprintDays, new Date().toISOString().split("T")[0]));
}

export async function generateProjectBrief(projectId: string) {
  const { getMilestonesForProject } = await import("./milestoneService.js");
  const [project, milestones] = await Promise.all([
    prisma.project.findUnique({
      where: { id: projectId },
      include: { tasks: true, updates: { orderBy: { postedAt: "desc" }, take: 3 } },
    }),
    getMilestonesForProject(projectId),
  ]);
  if (!project) return null;
  return generateJson(projectBriefPrompt(
    { name: project.name, description: project.description, type: project.type, targetDate: project.targetDate?.toISOString().split("T")[0] ?? null },
    project.tasks.map(t => ({ title: t.title, status: t.status, priority: t.priority })),
    (milestones as any[]).map((m: any) => ({ name: m.title, targetDate: m.dueDate?.toISOString().split("T")[0] ?? null, status: m.status })),
    (project.updates as any[]).map(u => u.content.slice(0, 100)),
  ), `brief:${projectId}`);
}

export async function synthesizeStandups(responses: Array<{ memberName: string; yesterday: string; today: string; blockers: string }>, projectName: string) {
  if (responses.length === 0) return null;
  return generateJson(standupSynthesisPrompt(responses, projectName));
}

export async function analyzeStandupSentiment(responses: Array<{ memberName: string; text: string }>) {
  if (responses.length === 0) return null;
  return generateJson(standupSentimentPrompt(responses));
}

export async function inferTaskDependencies(projectId: string) {
  const tasks = await prisma.task.findMany({
    where: { projectId, status: { not: "DONE" }, parentTaskId: null },
    select: { id: true, title: true, description: true },
  });
  if (tasks.length < 2) return { dependencies: [] };
  return generateJson(inferDependenciesPrompt(tasks), `deps:${projectId}`);
}

export async function analyzeTeamCapacity(projectId: string, sprintDays = 14) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      tasks: {
        where: { status: { not: "DONE" } },
        include: { assignees: { select: { id: true, displayName: true } } },
      },
    },
  });
  if (!project) return null;
  const byMember = new Map<string, { name: string; taskCount: number; highPriorityCount: number; totalEstimatedHours: number }>();
  for (const task of project.tasks) {
    for (const a of task.assignees) {
      const prev = byMember.get(a.id) ?? { name: a.displayName, taskCount: 0, highPriorityCount: 0, totalEstimatedHours: 0 };
      byMember.set(a.id, {
        name: a.displayName,
        taskCount: prev.taskCount + 1,
        highPriorityCount: prev.highPriorityCount + (["CRITICAL","HIGH"].includes(task.priority) ? 1 : 0),
        totalEstimatedHours: prev.totalEstimatedHours + (task.estimatedHours ?? 0),
      });
    }
  }
  return generateJson(capacityAnalysisPrompt([...byMember.values()], sprintDays));
}

export async function generateStakeholderEmail(projectId: string) {
  const oneWeekAgo = new Date(); oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      tasks: true,
      updates: { where: { postedAt: { gte: oneWeekAgo } }, orderBy: { postedAt: "desc" } },
    },
  });
  if (!project) return null;
  const completedThisWeek = project.tasks.filter(t => t.status === "DONE" && t.updatedAt >= oneWeekAgo).map(t => t.title);
  const inProgress = project.tasks.filter(t => t.status === "IN_PROGRESS").map(t => t.title);
  const blockers = project.tasks.filter(t => t.status === "BLOCKED").map(t => t.title);
  const done = project.tasks.filter(t => t.status === "DONE").length;
  const healthScore = project.tasks.length > 0 ? Math.round((done / project.tasks.length) * 100) : 0;
  return generateJson(stakeholderEmailPrompt(
    { name: project.name, targetDate: project.targetDate?.toISOString().split("T")[0] ?? null },
    completedThisWeek, inProgress, blockers, healthScore,
  ));
}
