// Completed tasks -> artifacts. The only DB read here is one bounded query; the
// mapping lives in skillArtifactCore.taskArtifacts.

import { prisma } from "../../db/prisma.js";
import { EXCLUDE_TRAINING } from "../trainingSandboxService.js";
import { enforceCap, taskArtifacts, type TaskInput } from "../skillArtifactCore.js";
import { emptyResult, type CollectResult, type CollectWindow } from "./types.js";

export async function collectTasks(win: CollectWindow): Promise<CollectResult> {
  const out = emptyResult();
  const rows = await prisma.task.findMany({
    where: {
      status: "DONE",
      completedAt: { gt: win.since, lte: win.until },
      project: EXCLUDE_TRAINING,
      ...(win.memberIds?.length ? { OR: [{ assignees: { some: { id: { in: win.memberIds } } } }, { createdById: { in: win.memberIds } }] } : {}),
    },
    select: {
      id: true, title: true, description: true, priority: true, completedAt: true, estimatedHours: true, storyPoints: true,
      projectId: true, createdById: true,
      project: { select: { name: true } },
      milestone: { select: { title: true } },
      tags: { select: { name: true } },
      assignees: { select: { id: true, isBot: true } },
      subtasks: { select: { status: true } },
      timeLogs: { select: { memberId: true, minutes: true } },
      comments: { select: { authorId: true, content: true }, orderBy: { createdAt: "desc" }, take: 20 },
    },
    orderBy: { completedAt: "asc" },
    take: win.maxArtifacts + 1,
  });

  const wanted = win.memberIds ? new Set(win.memberIds) : null;
  const rowsInRange = rows.slice(0, win.maxArtifacts);
  if (rows.length > win.maxArtifacts) {
    out.truncated = true;
    out.resumeFrom = rowsInRange[rowsInRange.length - 1]?.completedAt ?? null;
  }

  for (const t of rowsInRange) {
    if (!t.completedAt) continue;
    const logged: Record<string, number> = {};
    for (const l of t.timeLogs) logged[l.memberId] = (logged[l.memberId] ?? 0) + l.minutes;
    const input: TaskInput = {
      contributionNotes: Object.fromEntries([...new Set(t.comments.map(c => c.authorId))].map(id => [id, t.comments.filter(c => c.authorId === id).map(c => c.content).join("\n").slice(0, 1800)])),
      id: t.id, title: t.title, description: t.description, tags: t.tags.map((x) => x.name), priority: t.priority,
      milestoneTitle: t.milestone?.title ?? null, projectName: t.project?.name ?? null, projectId: t.projectId,
      completedAt: t.completedAt, estimatedHours: t.estimatedHours, storyPoints: t.storyPoints,
      subtaskTotal: t.subtasks.length, subtaskDone: t.subtasks.filter((s) => s.status === "DONE").length,
      assigneeCount: t.assignees.length, loggedMinutes: logged, createdById: t.createdById,
      assigneeIds: t.assignees.filter((a) => !a.isBot).map((a) => a.id),
    };
    for (const a of taskArtifacts(input, win.maxChars)) {
      if (!wanted || wanted.has(a.memberId)) out.artifacts.push(enforceCap(a, win.maxChars));
    }
  }
  return out;
}
