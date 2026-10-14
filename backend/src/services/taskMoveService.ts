import { prisma } from "../db/prisma.js";
import { getTaskPermissions } from "../middleware/taskAccess.js";
import { logAuditEvent } from "./activityService.js";
import { emitTaskChanged } from "./taskChangeBus.js";
import { TaskMutationError } from "./taskMutationService.js";
import { addManualMemberToProject } from "./projectService.js";
import { moveRoots, matchByName, dependencyNeighbors, type NameMatch } from "./taskBulkCore.js";

/**
 * Moving tasks to another project, without losing data.
 *
 * Tags, category blockers and milestones belong to a project, so each one is
 * matched by name in the target project and created there when missing.
 * Dependencies are kept as they are (they may cross projects); the preview
 * lists linked tasks so the member can bring them along. Assignees who are
 * not in the target project are added to it as manual members unless the
 * caller opts out, in which case they are unassigned.
 *
 * Nothing here sends a notification: no createNotification, no assignment
 * DM. Live Slack cards still refresh silently through emitTaskChanged.
 */

export interface MovePreview {
  project: { id: string; name: string };
  /** Tasks that will move, subtasks included. */
  taskCount: number;
  skipped: { id: string; reason: string }[];
  tags: { name: string; color: string; exists: boolean }[];
  blockers: { name: string; exists: boolean }[];
  milestones: { name: string; exists: boolean }[];
  missingAssignees: { id: string; displayName: string; avatarUrl: string | null }[];
  /** Tasks sharing a dependency with the moved set that are not moving. */
  linkedTasks: { id: string; title: string; status: string; relation: "blocks" | "blocked-by"; sameProject: boolean }[];
}

export interface MoveResult {
  moved: string[];
  skipped: { id: string; reason: string }[];
  created: { tags: number; blockers: number; milestones: number; members: number };
}

async function planMove(actorId: string, ids: string[], projectId: string) {
  const [target, actor, membership] = await Promise.all([
    prisma.project.findUnique({ where: { id: projectId }, select: { id: true, name: true, trainingForMemberId: true } }),
    prisma.member.findUnique({ where: { id: actorId }, select: { isAdmin: true } }),
    prisma.projectMember.findUnique({ where: { projectId_memberId: { projectId, memberId: actorId } }, select: { memberId: true } }),
  ]);
  if (!target || target.trainingForMemberId) throw new TaskMutationError(404, "Project not found");
  if (!actor?.isAdmin && !membership) throw new TaskMutationError(403, "You can only move tasks into a project you belong to");

  const unique = [...new Set(ids)];
  const rows = await prisma.task.findMany({
    where: { id: { in: unique } },
    select: {
      id: true, title: true, projectId: true, parentTaskId: true,
      project: { select: { name: true, trainingForMemberId: true } },
      subtasks: { select: { id: true } },
    },
  });
  const byId = new Map(rows.map(r => [r.id, r]));
  const skipped: { id: string; reason: string }[] = unique.filter(id => !byId.has(id)).map(id => ({ id, reason: "Task not found" }));
  const roots: typeof rows = [];
  for (const id of moveRoots(rows)) {
    const row = byId.get(id)!;
    if (row.projectId === projectId) { skipped.push({ id, reason: "Already in this project" }); continue; }
    if (row.project.trainingForMemberId) { skipped.push({ id, reason: "Training tasks cannot be moved" }); continue; }
    if (!(await getTaskPermissions(actorId, id)).canEdit) { skipped.push({ id, reason: "Permission denied" }); continue; }
    roots.push(row);
  }

  const movedIds = new Set<string>();
  for (const root of roots) {
    movedIds.add(root.id);
    for (const sub of root.subtasks) movedIds.add(sub.id);
  }
  const moved = [...movedIds];

  const [tasks, edges, roster, targetTags, targetBlockers, targetMilestones] = await Promise.all([
    prisma.task.findMany({
      where: { id: { in: moved } },
      select: {
        id: true, milestoneId: true,
        assignees: { select: { id: true, displayName: true, avatarUrl: true, isBot: true } },
        tags: { select: { id: true, name: true, color: true } },
        blockers: { select: { reason: true, blocker: { select: { id: true, label: true, color: true, assigneeId: true } } } },
        milestone: { select: { id: true, title: true, dueDate: true, description: true, ownerId: true, status: true } },
      },
    }),
    prisma.taskDependency.findMany({
      where: { OR: [{ blockingTaskId: { in: moved } }, { blockedTaskId: { in: moved } }] },
      select: { blockingTaskId: true, blockedTaskId: true },
    }),
    prisma.projectMember.findMany({ where: { projectId }, select: { memberId: true } }),
    prisma.tag.findMany({ where: { projectId }, select: { id: true, name: true } }),
    prisma.blocker.findMany({ where: { projectId, resolvedAt: null }, select: { id: true, label: true } }),
    prisma.milestone.findMany({ where: { projectId }, select: { id: true, title: true } }),
  ]);

  const sourceTags = new Map(tasks.flatMap(t => t.tags).map(t => [t.id, t]));
  const sourceBlockers = new Map(tasks.flatMap(t => t.blockers.map(b => b.blocker)).map(b => [b.id, b]));
  const sourceMilestones = new Map(tasks.flatMap(t => (t.milestone ? [t.milestone] : [])).map(m => [m.id, m]));

  const tagMatches = matchByName([...sourceTags.values()], targetTags);
  const blockerMatches = matchByName([...sourceBlockers.values()].map(b => ({ id: b.id, name: b.label })), targetBlockers.map(b => ({ id: b.id, name: b.label })));
  const milestoneMatches = matchByName([...sourceMilestones.values()].map(m => ({ id: m.id, name: m.title })), targetMilestones.map(m => ({ id: m.id, name: m.title })));

  const rosterIds = new Set(roster.map(r => r.memberId));
  const missingAssignees = new Map<string, { id: string; displayName: string; avatarUrl: string | null }>();
  for (const t of tasks) {
    for (const a of t.assignees) {
      if (!a.isBot && !rosterIds.has(a.id)) missingAssignees.set(a.id, { id: a.id, displayName: a.displayName, avatarUrl: a.avatarUrl });
    }
  }

  return {
    target, roots, skipped, moved, movedIds, tasks, edges, rosterIds,
    sourceTags, sourceBlockers, sourceMilestones,
    tagMatches, blockerMatches, milestoneMatches,
    missingAssignees: [...missingAssignees.values()],
  };
}

/** One entry per distinct name, so two source rows called "CAD" show once. */
function distinctByName(matches: NameMatch[]) {
  const seen = new Map<string, NameMatch>();
  for (const m of matches) {
    const key = m.name.toLowerCase();
    if (!seen.has(key)) seen.set(key, m);
  }
  return [...seen.values()];
}

export async function previewMove(actorId: string, ids: string[], projectId: string): Promise<MovePreview> {
  const plan = await planMove(actorId, ids, projectId);
  const sourceProjectIds = new Set(plan.roots.map(r => r.projectId));
  const neighbors = dependencyNeighbors(plan.edges, plan.movedIds);
  const neighborRows = neighbors.length === 0 ? [] : await prisma.task.findMany({
    where: { id: { in: neighbors.map(n => n.id) }, archivedAt: null },
    select: { id: true, title: true, status: true, projectId: true },
  });
  const relationOf = new Map(neighbors.map(n => [n.id, n.relation]));

  return {
    project: { id: plan.target.id, name: plan.target.name },
    taskCount: plan.moved.length,
    skipped: plan.skipped,
    tags: distinctByName(plan.tagMatches).map(m => ({
      name: m.name, color: plan.sourceTags.get(m.sourceId)?.color ?? "#6c5ce7", exists: m.targetId !== null,
    })),
    blockers: distinctByName(plan.blockerMatches).map(m => ({ name: m.name, exists: m.targetId !== null })),
    milestones: distinctByName(plan.milestoneMatches).map(m => ({ name: m.name, exists: m.targetId !== null })),
    missingAssignees: plan.missingAssignees,
    linkedTasks: neighborRows
      // A neighbor already in the target project is already where it would go.
      .filter(r => r.projectId !== projectId)
      .map(r => ({ id: r.id, title: r.title, status: r.status, relation: relationOf.get(r.id)!, sameProject: sourceProjectIds.has(r.projectId) })),
  };
}

export async function executeMove(
  actorId: string,
  ids: string[],
  projectId: string,
  opts: { addMissingMembers: boolean },
): Promise<MoveResult> {
  const plan = await planMove(actorId, ids, projectId);
  const created = { tags: 0, blockers: 0, milestones: 0, members: 0 };
  if (plan.moved.length === 0) return { moved: [], skipped: plan.skipped, created };

  if (opts.addMissingMembers) {
    for (const m of plan.missingAssignees) {
      await addManualMemberToProject(projectId, m.id);
      plan.rosterIds.add(m.id);
      created.members++;
    }
  }

  const detachIds = new Set(plan.roots.filter(r => r.parentTaskId).map(r => r.id));
  const newMilestoneIds = new Set<string>();

  await prisma.$transaction(async (tx) => {
    // Resolve every source row to a target row, creating one per missing name.
    async function resolve(matches: NameMatch[], create: (m: NameMatch) => Promise<string>): Promise<Map<string, string>> {
      const out = new Map<string, string>();
      const createdByName = new Map<string, string>();
      for (const m of matches) {
        if (m.targetId) { out.set(m.sourceId, m.targetId); continue; }
        const key = m.name.toLowerCase();
        if (!createdByName.has(key)) createdByName.set(key, await create(m));
        out.set(m.sourceId, createdByName.get(key)!);
      }
      return out;
    }

    const tagMap = await resolve(plan.tagMatches, async (m) => {
      created.tags++;
      const src = plan.sourceTags.get(m.sourceId)!;
      return (await tx.tag.create({ data: { name: m.name, color: src.color, projectId } })).id;
    });
    const blockerMap = await resolve(plan.blockerMatches, async (m) => {
      created.blockers++;
      const src = plan.sourceBlockers.get(m.sourceId)!;
      const assigneeId = src.assigneeId && plan.rosterIds.has(src.assigneeId) ? src.assigneeId : null;
      return (await tx.blocker.create({ data: { projectId, label: m.name, color: src.color, assigneeId } })).id;
    });
    const milestoneMap = await resolve(plan.milestoneMatches, async (m) => {
      created.milestones++;
      const src = plan.sourceMilestones.get(m.sourceId)!;
      const ownerId = src.ownerId && plan.rosterIds.has(src.ownerId) ? src.ownerId : null;
      const row = await tx.milestone.create({
        data: { projectId, title: m.name, dueDate: src.dueDate, description: src.description, ownerId, status: src.status },
      });
      newMilestoneIds.add(row.id);
      return row.id;
    });

    for (const t of plan.tasks) {
      await tx.taskBlocker.deleteMany({ where: { taskId: t.id } });
      if (t.blockers.length > 0) {
        await tx.taskBlocker.createMany({
          data: t.blockers.map(b => ({ taskId: t.id, blockerId: blockerMap.get(b.blocker.id)!, reason: b.reason })),
          skipDuplicates: true,
        });
      }
      const milestoneId = t.milestoneId ? milestoneMap.get(t.milestoneId) ?? null : null;
      await tx.task.update({
        where: { id: t.id },
        data: {
          project: { connect: { id: projectId } },
          milestone: milestoneId ? { connect: { id: milestoneId } } : { disconnect: true },
          tags: { set: [...new Set(t.tags.map(g => tagMap.get(g.id)!))].map(id => ({ id })) },
          assignees: { set: t.assignees.filter(a => a.isBot || plan.rosterIds.has(a.id)).map(a => ({ id: a.id })) },
          ...(detachIds.has(t.id) ? { parentTask: { disconnect: true } } : {}),
        },
      });
    }
  }, { timeout: 60_000 });

  for (const root of plan.roots) {
    const change = { field: "projectId", from: root.project.name, to: plan.target.name };
    for (const auditProjectId of [root.projectId, projectId]) {
      logAuditEvent({
        projectId: auditProjectId, taskId: root.id, memberId: actorId, source: "WEB", eventType: "TASK_UPDATED",
        payload: { taskTitle: root.title, changes: [change] },
      }).catch(console.error);
    }
  }

  const { refreshMilestoneHealth } = await import("./milestoneService.js");
  const touched = new Set<string>([...plan.sourceMilestones.keys(), ...newMilestoneIds]);
  for (const t of await prisma.task.findMany({ where: { id: { in: plan.moved } }, select: { milestoneId: true } })) {
    if (t.milestoneId) touched.add(t.milestoneId);
  }
  for (const id of touched) refreshMilestoneHealth(id).catch(console.error);

  // Old parents lose a subtask; dependency neighbors show the new project.
  const neighbors = dependencyNeighbors(plan.edges, plan.movedIds).map(n => n.id);
  emitTaskChanged([...plan.moved, ...neighbors, ...plan.roots.map(r => r.parentTaskId).filter((p): p is string => !!p)]);

  return { moved: plan.moved, skipped: plan.skipped, created };
}
