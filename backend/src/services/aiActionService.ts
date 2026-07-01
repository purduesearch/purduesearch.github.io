import { prisma } from "../db/prisma.js";
import type { Priority, TaskStatus } from "@prisma/client";
import { buildProjectContext, type ProjectContext } from "./projectContextService.js";
import { suggestActionsPrompt } from "../utils/aiPrompts.js";
import { generateJsonComplex } from "./geminiService.js";
import { getTaskPermissions } from "../middleware/taskAccess.js";
import { logAuditEvent, diffObjects } from "./activityService.js";
import { recomputeBlockedStatus } from "../api/blockers.js";
import { refreshMilestoneHealth } from "./milestoneService.js";
import {
  createTask, updateTask, deleteTask, getTask, createSubtask, addDependency,
  assertCanComplete, assertNotCategoryBlocked,
} from "./taskService.js";

// ── Action-plan schema ──────────────────────────────────────────
// An ordered list of concrete, executable actions an AI proposes toward a
// stated goal. Every `targetTaskId` / id inside `params` must reference a
// real row in the project — `suggestProjectActions` drops/clamps anything
// that doesn't; `executeActionPlan` re-validates from scratch since the
// client-submitted list may have been hand-edited.

export type ActionType =
  | "CREATE_TASK" | "UPDATE_TASK" | "DELETE_TASK"
  | "SET_STATUS" | "SET_PRIORITY" | "SET_DUE" | "ASSIGN"
  | "CREATE_SUBTASK" | "ADD_DEPENDENCY"
  | "ATTACH_BLOCKER" | "RESOLVE_BLOCKER"
  | "ADD_COMMENT"
  | "CREATE_MILESTONE" | "LINK_MILESTONE";

export interface ActionPlanAction {
  type: ActionType;
  /** Required for task-scoped actions; null/omitted for project-scoped ones (CREATE_TASK, CREATE_MILESTONE, RESOLVE_BLOCKER). LINK_MILESTONE treats it as one optional task to link. */
  targetTaskId?: string | null;
  params: Record<string, any>;
  rationale: string;
}

export type ActionPlan = ActionPlanAction[];

export interface ActionExecutionResult {
  index: number;
  type: ActionType;
  ok: boolean;
  error?: string;
}

const VALID_TYPES = new Set<ActionType>([
  "CREATE_TASK", "UPDATE_TASK", "DELETE_TASK",
  "SET_STATUS", "SET_PRIORITY", "SET_DUE", "ASSIGN",
  "CREATE_SUBTASK", "ADD_DEPENDENCY",
  "ATTACH_BLOCKER", "RESOLVE_BLOCKER",
  "ADD_COMMENT",
  "CREATE_MILESTONE", "LINK_MILESTONE",
]);

const REQUIRES_TARGET = new Set<ActionType>([
  "UPDATE_TASK", "DELETE_TASK", "SET_STATUS", "SET_PRIORITY", "SET_DUE", "ASSIGN",
  "CREATE_SUBTASK", "ADD_DEPENDENCY", "ATTACH_BLOCKER", "ADD_COMMENT",
]);

const VALID_STATUSES = new Set(["TODO", "IN_PROGRESS", "BLOCKED", "DONE"]);
const VALID_PRIORITIES = new Set(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);

// ── Suggest ──────────────────────────────────────────────────────

export async function suggestProjectActions(projectId: string, goal: string): Promise<ActionPlan | null> {
  const context = await buildProjectContext(projectId);
  if (!context) return null;

  const prompt = suggestActionsPrompt(goal, context);
  const cacheKey = `ai-plan:${projectId}:${goal}`;
  const raw = await generateJsonComplex<{ actions?: unknown[] }>(prompt, cacheKey, { maxOutputTokens: 8192 });
  if (!raw) return [];

  return normalizeActionPlan(raw.actions, context);
}

function normalizeActionPlan(rawActions: unknown, context: ProjectContext): ActionPlan {
  const taskIds = new Set(context.tasks.map(t => t.id));
  const memberIds = new Set(context.members.map(m => m.id));
  const milestoneIds = new Set(context.milestones.map(m => m.id));
  const blockerIds = new Set(context.activeBlockers.map(b => b.id));

  const actions = Array.isArray(rawActions) ? rawActions : [];
  const result: ActionPlan = [];

  for (const raw of actions) {
    if (!raw || typeof raw !== "object") continue;
    const a = raw as Record<string, unknown>;
    const type = a.type as ActionType;
    if (!VALID_TYPES.has(type)) continue;

    const rationale = typeof a.rationale === "string" ? a.rationale : "";
    const params: Record<string, any> = (a.params && typeof a.params === "object") ? { ...(a.params as object) } : {};
    let targetTaskId: string | null = typeof a.targetTaskId === "string" ? a.targetTaskId : null;

    if (REQUIRES_TARGET.has(type)) {
      if (!targetTaskId || !taskIds.has(targetTaskId)) continue;
    } else if (type !== "LINK_MILESTONE") {
      targetTaskId = null;
    }

    if (type === "CREATE_TASK") {
      if (typeof params.title !== "string" || !params.title.trim()) continue;
      if (params.assigneeIds !== undefined) {
        params.assigneeIds = Array.isArray(params.assigneeIds)
          ? params.assigneeIds.filter((id: unknown) => typeof id === "string" && memberIds.has(id))
          : [];
      }
      if (params.milestoneId !== undefined && !milestoneIds.has(params.milestoneId)) delete params.milestoneId;
      if (params.priority !== undefined && !VALID_PRIORITIES.has(params.priority)) delete params.priority;
      if (params.subtasks !== undefined) {
        params.subtasks = Array.isArray(params.subtasks)
          ? params.subtasks
              .filter((s: unknown) => typeof s === "string" && s.trim())
              .map((s: string) => s.trim())
              .slice(0, 30)
          : [];
        if (!params.subtasks.length) delete params.subtasks;
      }
    }

    if (type === "UPDATE_TASK" && params.priority !== undefined && !VALID_PRIORITIES.has(params.priority)) {
      delete params.priority;
    }

    if (type === "SET_STATUS" && !VALID_STATUSES.has(params.status)) continue;
    if (type === "SET_PRIORITY" && !VALID_PRIORITIES.has(params.priority)) continue;
    if (type === "SET_DUE" && !("dueDate" in params)) continue;

    if ((type === "ASSIGN" || type === "CREATE_SUBTASK") && params.assigneeIds !== undefined) {
      if (!Array.isArray(params.assigneeIds)) continue;
      params.assigneeIds = params.assigneeIds.filter((id: unknown) => typeof id === "string" && memberIds.has(id));
    }
    if (type === "ASSIGN" && !Array.isArray(params.assigneeIds)) continue;
    if (type === "CREATE_SUBTASK" && (typeof params.title !== "string" || !params.title.trim())) continue;

    if (type === "ADD_DEPENDENCY") {
      if (typeof params.blockingTaskId !== "string" || !taskIds.has(params.blockingTaskId)) continue;
    }

    if ((type === "ATTACH_BLOCKER" || type === "RESOLVE_BLOCKER")) {
      if (typeof params.blockerId !== "string" || !blockerIds.has(params.blockerId)) continue;
    }

    if (type === "ADD_COMMENT" && (typeof params.content !== "string" || !params.content.trim())) continue;

    if (type === "CREATE_MILESTONE") {
      if (typeof params.title !== "string" || !params.title.trim()) continue;
      if (params.ownerId !== undefined && !memberIds.has(params.ownerId)) delete params.ownerId;
    }

    if (type === "LINK_MILESTONE") {
      if (typeof params.milestoneId !== "string" || !milestoneIds.has(params.milestoneId)) continue;
      if (targetTaskId && !taskIds.has(targetTaskId)) targetTaskId = null;
      const extraIds = Array.isArray(params.taskIds)
        ? params.taskIds.filter((id: unknown) => typeof id === "string" && taskIds.has(id))
        : [];
      params.taskIds = extraIds;
      if (!targetTaskId && extraIds.length === 0) continue;
    }

    result.push({ type, targetTaskId, params, rationale });
  }

  return result;
}

// ── Execute ──────────────────────────────────────────────────────

export async function executeActionPlan(
  projectId: string,
  memberId: string,
  actions: ActionPlanAction[]
): Promise<ActionExecutionResult[]> {
  const results: ActionExecutionResult[] = [];
  let succeeded = 0;

  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];
    try {
      if (!action || !VALID_TYPES.has(action.type)) throw new Error("Unknown action type");
      await dispatchAction(projectId, memberId, action);
      results.push({ index: i, type: action.type, ok: true });
      succeeded++;
    } catch (err: any) {
      results.push({ index: i, type: action?.type, ok: false, error: err?.message ?? "Action failed" });
    }
  }

  await logAuditEvent({
    projectId, memberId, source: "WEB",
    eventType: "AI_PLAN_EXECUTED",
    payload: { totalActions: actions.length, succeeded, failed: actions.length - succeeded },
  }).catch(err => console.error("[aiAction] AI_PLAN_EXECUTED log:", err));

  return results;
}

// ── Permission / scope helpers ───────────────────────────────────

async function assertTaskInProject(taskId: string, projectId: string): Promise<{ id: string; projectId: string }> {
  const task = await prisma.task.findUnique({ where: { id: taskId }, select: { id: true, projectId: true } });
  if (!task || task.projectId !== projectId) throw new Error("Task not found in this project");
  return task;
}

async function requireEditable(taskId: string, projectId: string, memberId: string): Promise<void> {
  await assertTaskInProject(taskId, projectId);
  const { canEdit } = await getTaskPermissions(memberId, taskId);
  if (!canEdit) throw new Error(`Forbidden: no edit permission on task ${taskId}`);
}

async function requireDeletable(taskId: string, projectId: string, memberId: string): Promise<void> {
  await assertTaskInProject(taskId, projectId);
  const { canDelete } = await getTaskPermissions(memberId, taskId);
  if (!canDelete) throw new Error(`Forbidden: no delete permission on task ${taskId}`);
}

function requireTargetId(action: ActionPlanAction): string {
  if (!action.targetTaskId) throw new Error("targetTaskId is required for this action");
  return action.targetTaskId;
}

// ── Dispatch ──────────────────────────────────────────────────────

async function dispatchAction(projectId: string, memberId: string, action: ActionPlanAction): Promise<void> {
  switch (action.type) {
    case "CREATE_TASK": {
      const p = action.params as { title: string; description?: string; priority?: Priority; dueDate?: string | null; assigneeIds?: string[]; milestoneId?: string; subtasks?: string[] };
      const created = await createTask({
        title: p.title.trim(),
        description: p.description,
        priority: p.priority,
        dueDate: p.dueDate ?? undefined,
        projectId,
        assigneeIds: p.assigneeIds,
        milestoneId: p.milestoneId,
        createdById: memberId,
      });
      await logAuditEvent({
        taskId: created.id, projectId, memberId, source: "WEB",
        eventType: "TASK_CREATED",
        payload: { taskTitle: created.title, viaAiPlan: true },
      });
      // Create any child subtasks the plan attached to this new task.
      const subtaskTitles = Array.isArray(p.subtasks) ? p.subtasks : [];
      for (const stTitle of subtaskTitles) {
        const title = String(stTitle).trim();
        if (!title) continue;
        const sub = await createSubtask(created.id, { title });
        await logAuditEvent({
          taskId: created.id, projectId, memberId, source: "WEB",
          eventType: "TASK_SUBTASK_CREATED",
          payload: { parentTaskTitle: created.title, subtaskTitle: sub.title, viaAiPlan: true },
        });
      }
      return;
    }

    case "UPDATE_TASK": {
      const taskId = requireTargetId(action);
      await requireEditable(taskId, projectId, memberId);
      const before = await getTask(taskId);
      if (!before) throw new Error("Task not found");
      const p = action.params as { title?: string; description?: string; priority?: Priority; dueDate?: string | null; assigneeIds?: string[] };
      const updated = await updateTask(taskId, {
        title: p.title,
        description: p.description,
        priority: p.priority,
        dueDate: p.dueDate === undefined ? undefined : (p.dueDate === null ? null : new Date(p.dueDate)),
        assigneeIds: p.assigneeIds,
      });
      const changes = diffObjects(before as any, updated as any, ["title", "description", "priority", "dueDate"]);
      await logAuditEvent({
        taskId, projectId, memberId, source: "WEB",
        eventType: "TASK_UPDATED",
        payload: { taskTitle: updated.title, changes, viaAiPlan: true },
      });
      return;
    }

    case "DELETE_TASK": {
      const taskId = requireTargetId(action);
      await requireDeletable(taskId, projectId, memberId);
      const existing = await getTask(taskId);
      if (!existing) throw new Error("Task not found");
      await deleteTask(taskId);
      await logAuditEvent({
        projectId, memberId, source: "WEB",
        eventType: "TASK_DELETED",
        payload: { taskTitle: existing.title, viaAiPlan: true },
      });
      return;
    }

    case "SET_STATUS": {
      const taskId = requireTargetId(action);
      await requireEditable(taskId, projectId, memberId);
      const { status } = action.params as { status: TaskStatus };
      const before = await getTask(taskId);
      if (!before) throw new Error("Task not found");
      if (status !== before.status) {
        const lockError = assertNotCategoryBlocked(before as any, status);
        if (lockError) throw new Error(lockError);
      }
      const wasNotDone = before.status !== "DONE";
      if (status === "DONE" && wasNotDone) {
        const blockerError = assertCanComplete(before as any);
        if (blockerError) throw new Error(blockerError);
      }
      const updated = await updateTask(taskId, { status });
      await logAuditEvent({
        taskId, projectId, memberId, source: "WEB",
        eventType: status === "DONE" && wasNotDone ? "TASK_COMPLETED" : "TASK_UPDATED",
        payload: { taskTitle: updated.title, status: updated.status, viaAiPlan: true },
      });
      return;
    }

    case "SET_PRIORITY": {
      const taskId = requireTargetId(action);
      await requireEditable(taskId, projectId, memberId);
      const { priority } = action.params as { priority: Priority };
      const before = await getTask(taskId);
      if (!before) throw new Error("Task not found");
      const updated = await updateTask(taskId, { priority });
      const changes = diffObjects(before as any, updated as any, ["priority"]);
      await logAuditEvent({
        taskId, projectId, memberId, source: "WEB",
        eventType: "TASK_UPDATED",
        payload: { taskTitle: updated.title, changes, viaAiPlan: true },
      });
      return;
    }

    case "SET_DUE": {
      const taskId = requireTargetId(action);
      await requireEditable(taskId, projectId, memberId);
      const { dueDate } = action.params as { dueDate: string | null };
      const before = await getTask(taskId);
      if (!before) throw new Error("Task not found");
      const updated = await updateTask(taskId, { dueDate: dueDate ? new Date(dueDate) : null });
      const changes = diffObjects(before as any, updated as any, ["dueDate"]);
      await logAuditEvent({
        taskId, projectId, memberId, source: "WEB",
        eventType: "TASK_UPDATED",
        payload: { taskTitle: updated.title, changes, viaAiPlan: true },
      });
      return;
    }

    case "ASSIGN": {
      const taskId = requireTargetId(action);
      await requireEditable(taskId, projectId, memberId);
      const { assigneeIds } = action.params as { assigneeIds: string[] };
      const updated = await updateTask(taskId, { assigneeIds });
      await logAuditEvent({
        taskId, projectId, memberId, source: "WEB",
        eventType: "TASK_ASSIGNED",
        payload: { taskTitle: updated.title, assigneeNames: (updated.assignees ?? []).map((a: any) => a.displayName), viaAiPlan: true },
      });
      return;
    }

    case "CREATE_SUBTASK": {
      const taskId = requireTargetId(action);
      await requireEditable(taskId, projectId, memberId);
      const { title, assigneeIds } = action.params as { title: string; assigneeIds?: string[] };
      const parent = await getTask(taskId);
      const subtask = await createSubtask(taskId, { title: title.trim(), assigneeIds });
      await logAuditEvent({
        taskId, projectId, memberId, source: "WEB",
        eventType: "TASK_SUBTASK_CREATED",
        payload: { parentTaskTitle: parent?.title ?? null, subtaskTitle: subtask.title, viaAiPlan: true },
      });
      return;
    }

    case "ADD_DEPENDENCY": {
      const taskId = requireTargetId(action);
      await requireEditable(taskId, projectId, memberId);
      const { blockingTaskId, reason } = action.params as { blockingTaskId: string; reason?: string | null };
      await assertTaskInProject(blockingTaskId, projectId);
      const result = await addDependency(taskId, blockingTaskId, reason ?? null);
      const blockingTask = (result as any)?.blockedBy?.find((d: any) => d.blockingTaskId === blockingTaskId)?.blockingTask;
      await logAuditEvent({
        taskId, projectId, memberId, source: "WEB",
        eventType: "TASK_DEPENDENCY_ADDED",
        payload: { taskTitle: result?.title ?? null, dependsOnTitle: blockingTask?.title ?? null, reason: reason ?? null, viaAiPlan: true },
      });
      return;
    }

    case "ATTACH_BLOCKER": {
      const taskId = requireTargetId(action);
      await requireEditable(taskId, projectId, memberId);
      const { blockerId, reason } = action.params as { blockerId: string; reason?: string | null };
      const blocker = await prisma.blocker.findUnique({ where: { id: blockerId } });
      if (!blocker || blocker.projectId !== projectId || blocker.resolvedAt) {
        throw new Error("Blocker not found, already resolved, or not in this project");
      }
      await prisma.taskBlocker.upsert({
        where: { taskId_blockerId: { taskId, blockerId } },
        create: { taskId, blockerId, reason: reason ?? null },
        update: { reason: reason ?? null },
      });
      const task = await prisma.task.update({ where: { id: taskId }, data: { status: "BLOCKED" } });
      await logAuditEvent({
        taskId, projectId, memberId, source: "WEB",
        eventType: "TASK_BLOCKER_ATTACHED",
        payload: { taskTitle: task.title, blockerLabel: blocker.label, reason: reason ?? null, viaAiPlan: true },
      });
      return;
    }

    case "RESOLVE_BLOCKER": {
      const { blockerId } = action.params as { blockerId: string };
      const blocker = await prisma.blocker.findUnique({
        where: { id: blockerId },
        include: { tasks: { select: { taskId: true } } },
      });
      if (!blocker || blocker.projectId !== projectId) throw new Error("Blocker not found in this project");
      const affectedTaskIds = blocker.tasks.map(t => t.taskId);
      await prisma.$transaction([
        prisma.blocker.update({ where: { id: blockerId }, data: { resolvedAt: new Date() } }),
        prisma.taskBlocker.deleteMany({ where: { blockerId } }),
      ]);
      await recomputeBlockedStatus(affectedTaskIds);
      await logAuditEvent({
        projectId, memberId, source: "WEB",
        eventType: "BLOCKER_RESOLVED",
        payload: { blockerLabel: blocker.label, affectedTaskCount: affectedTaskIds.length, viaAiPlan: true },
      });
      return;
    }

    case "ADD_COMMENT": {
      const taskId = requireTargetId(action);
      await assertTaskInProject(taskId, projectId);
      const { content } = action.params as { content: string };
      const comment = await prisma.taskComment.create({ data: { content: content.trim(), taskId, authorId: memberId } });
      await logAuditEvent({
        taskId, projectId, memberId, source: "WEB",
        eventType: "COMMENT_ADDED",
        payload: { commentId: comment.id, excerpt: content.slice(0, 120), viaAiPlan: true },
      });
      return;
    }

    case "CREATE_MILESTONE": {
      const { title, dueDate, description, ownerId } = action.params as { title: string; dueDate?: string | null; description?: string; ownerId?: string };
      const milestone = await prisma.milestone.create({
        data: {
          title: title.trim(),
          projectId,
          dueDate: dueDate ? new Date(dueDate) : undefined,
          description: description ?? null,
          ownerId: ownerId ?? null,
        },
      });
      await logAuditEvent({
        projectId, memberId, source: "WEB",
        eventType: "MILESTONE_CREATED",
        payload: { milestoneTitle: milestone.title, viaAiPlan: true },
      });
      return;
    }

    case "LINK_MILESTONE": {
      const { milestoneId, taskIds } = action.params as { milestoneId: string; taskIds?: string[] };
      const milestone = await prisma.milestone.findUnique({ where: { id: milestoneId } });
      if (!milestone || milestone.projectId !== projectId) throw new Error("Milestone not found in this project");
      const ids = Array.from(new Set([
        ...(action.targetTaskId ? [action.targetTaskId] : []),
        ...(Array.isArray(taskIds) ? taskIds : []),
      ]));
      if (ids.length === 0) throw new Error("At least one task id is required");
      for (const id of ids) await requireEditable(id, projectId, memberId);
      await prisma.task.updateMany({ where: { id: { in: ids } }, data: { milestoneId } });
      await refreshMilestoneHealth(milestoneId);
      await logAuditEvent({
        projectId, memberId, source: "WEB",
        eventType: "MILESTONE_TASKS_LINKED",
        payload: { milestoneTitle: milestone.title, taskIds: ids, viaAiPlan: true },
      });
      return;
    }
  }
}
