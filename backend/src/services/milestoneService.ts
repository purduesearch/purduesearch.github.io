import { prisma } from "../db/prisma.js";

// ── Milestone Service ────────────────────────────────────────

export async function createMilestone(data: {
  name: string;
  projectId: string;
  dueDate?: Date;
}) {
  return prisma.milestone.create({
    data: {
      name: data.name,
      projectId: data.projectId,
      dueDate: data.dueDate,
    },
    include: { tasks: { select: { id: true, status: true } } },
  });
}

export async function updateMilestone(
  id: string,
  data: { name?: string; dueDate?: Date | null }
) {
  return prisma.milestone.update({
    where: { id },
    data,
    include: { tasks: { select: { id: true, status: true } } },
  });
}

export async function deleteMilestone(id: string) {
  return prisma.milestone.delete({ where: { id } });
}

export async function getMilestone(id: string) {
  return prisma.milestone.findUnique({
    where: { id },
    include: {
      tasks: {
        include: { assignees: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });
}

export async function getMilestonesForProject(projectId: string) {
  const milestones = await prisma.milestone.findMany({
    where: { projectId },
    include: {
      tasks: { select: { id: true, status: true } },
    },
    orderBy: { dueDate: "asc" },
  });

  return milestones.map((m) => {
    const total = m.tasks.length;
    const done = m.tasks.filter((t) => t.status === "DONE").length;
    return {
      ...m,
      completionPct: total > 0 ? Math.round((done / total) * 100) : 0,
      taskCounts: { total, done },
    };
  });
}
