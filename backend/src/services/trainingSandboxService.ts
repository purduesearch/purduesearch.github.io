import { prisma } from "../db/prisma.js";

export const TRAINING_PROJECT_NAME = "Constellation 101 — Training";

export const TRAINING_FIXTURE = {
  tasks: [
    { title: "Draft the agenda for the design review", status: "TODO",        priority: "MEDIUM" },
    { title: "Collect part numbers for the bracket order", status: "TODO",     priority: "LOW" },
    { title: "Route the harness through bay two", status: "IN_PROGRESS",       priority: "HIGH" },
    { title: "Machine the mounting plate", status: "BLOCKED",                  priority: "HIGH" },
    { title: "Update the wiring diagram", status: "IN_PROGRESS",               priority: "MEDIUM" },
    { title: "Photograph the assembly for the blog", status: "DONE",           priority: "LOW" },
  ],
  milestones: [
    { title: "Design review", dueInDays: 14 },
    // Negative on purpose: the learner needs to see a real at-risk badge in
    // module 3, and a fixture where everything is green teaches nothing.
    { title: "Fabrication complete", dueInDays: -3 },
  ],
  blockers: [
    { label: "Waiting on the machine shop", color: "#f5a623" },
  ],
};

/**
 * Spread into any Prisma `where` that lists or aggregates projects.
 *
 * Training projects are real rows with real tasks, so every listing query sees
 * them unless told otherwise. Import this rather than hand-writing the filter —
 * a hand-written one is how a site gets missed.
 */
export const EXCLUDE_TRAINING = { trainingForMemberId: null } as const;

/**
 * Re-seeds any fixture blocker the sandbox is missing, and un-resolves one the
 * learner already cleared.
 *
 * "Blocking and unblocking" step 6 says "attach the seeded one" — but resolving
 * a category is a one-way door (`GET /projects/:id/blockers` only returns
 * `resolvedAt: null`), so a learner who finished module 4 once, or who pressed
 * Resolve on the board, could never take that module again. Repairing on entry
 * is what makes the sandbox genuinely re-runnable.
 */
async function ensureFixtureBlockers(projectId: string) {
  const blockers = [];
  for (const fixture of TRAINING_FIXTURE.blockers) {
    const found = await prisma.blocker.findFirst({
      where: { projectId, label: fixture.label },
    });
    if (!found) {
      blockers.push(await prisma.blocker.create({ data: { projectId, ...fixture } }));
    } else if (found.resolvedAt) {
      blockers.push(await prisma.blocker.update({
        where: { id: found.id }, data: { resolvedAt: null },
      }));
    } else {
      blockers.push(found);
    }
  }
  return blockers;
}

/**
 * Idempotent by construction: trainingForMemberId is @unique, so a second call
 * cannot create a second project even under a race.
 */
export async function ensureTrainingProject(memberId: string): Promise<{ projectId: string }> {
  const existing = await prisma.project.findUnique({ where: { trainingForMemberId: memberId } });
  if (existing) {
    if (existing.status === "ARCHIVED") {
      await prisma.project.update({ where: { id: existing.id }, data: { status: "ACTIVE" } });
    }
    await ensureFixtureBlockers(existing.id);
    return { projectId: existing.id };
  }

  const project = await prisma.project.create({
    data: {
      name: TRAINING_PROJECT_NAME,
      description: "Your private practice space. Nothing here reaches the club's real reporting.",
      // ProjectType is ENGINEERING | RESEARCH | HYBRID — there is no SOFTWARE.
      type: "ENGINEERING",
      status: "ACTIVE",
      trainingForMemberId: memberId,
      members: { create: { memberId } },
    },
  });

  const [blocker] = await ensureFixtureBlockers(project.id);

  for (const m of TRAINING_FIXTURE.milestones) {
    await prisma.milestone.create({
      data: {
        projectId: project.id,
        title: m.title,
        dueDate: new Date(Date.now() + m.dueInDays * 86_400_000),
      },
    });
  }

  for (const t of TRAINING_FIXTURE.tasks) {
    const task = await prisma.task.create({
      data: {
        projectId: project.id,
        title: t.title,
        status: t.status as never,
        priority: t.priority as never,
        createdById: memberId,
      },
    });
    if (t.status === "BLOCKED") {
      await prisma.taskBlocker.create({ data: { taskId: task.id, blockerId: blocker.id } });
    }
  }

  return { projectId: project.id };
}

export async function archiveTrainingProject(memberId: string) {
  await prisma.project.updateMany({
    where: { trainingForMemberId: memberId },
    data: { status: "ARCHIVED" },
  });
}

export async function isTrainingProject(projectId: string): Promise<boolean> {
  const p = await prisma.project.findUnique({
    where: { id: projectId }, select: { trainingForMemberId: true },
  });
  return Boolean(p?.trainingForMemberId);
}

/**
 * The taskId-only variant, for callers that never loaded the task's project
 * (rewardService.handleTimeLog takes an id, not a row).
 */
export async function isTrainingTask(taskId: string): Promise<boolean> {
  const t = await prisma.task.findUnique({
    where: { id: taskId }, select: { project: { select: { trainingForMemberId: true } } },
  });
  return Boolean(t?.project?.trainingForMemberId);
}
