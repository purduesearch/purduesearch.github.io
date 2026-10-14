import type { TaskStatus, TaskProgress, Priority } from "@prisma/client";
import type { TaskPatch } from "./taskMutationService.js";

/**
 * Pure planning for PATCH /api/tasks/bulk.
 *
 * A bulk edit is one request applied to many tasks. Relative operations
 * (add/remove assignees, tags and blockers, shift due dates) depend on each
 * task's current values, so the route turns the shared request into one
 * ordinary TaskPatch per task here and sends it through updateTaskAsMember —
 * the same permission, audit, notification and reward path as a single edit.
 */
export interface BulkTaskPatch {
  status?: TaskStatus;
  priority?: Priority;
  progress?: TaskProgress;
  /** ISO date sets it; null clears it. */
  dueDate?: string | null;
  /** Moves existing due dates by whole days; tasks with no due date are left alone. */
  dueShiftDays?: number;
  /** Replaces the assignee set. */
  assigneeIds?: string[];
  addAssigneeIds?: string[];
  removeAssigneeIds?: string[];
  /** Replaces the tag set. */
  tagIds?: string[];
  addTagIds?: string[];
  removeTagIds?: string[];
  /** Milestone id; null unlinks. */
  milestoneId?: string | null;
  storyPoints?: number | null;
  estimatedHours?: number | null;
  /** Category blockers to attach or detach. */
  addBlockerIds?: string[];
  removeBlockerIds?: string[];
  /** Nest under this top-level task; null promotes to top level. */
  parentTaskId?: string | null;
}

export interface BulkTaskState {
  id: string;
  projectId: string;
  parentTaskId: string | null;
  subtaskCount: number;
  dueDate: Date | null;
  assigneeIds: string[];
  tagIds: string[];
  blockerIds: string[];
}

/** Ids that exist in the task's project. Anything else in the request is dropped or refused. */
export interface BulkProjectScope {
  tagIds: Set<string>;
  milestoneIds: Set<string>;
  openBlockerIds: Set<string>;
  /** Top-level, unarchived tasks in the project — valid parents. */
  parentCandidateIds: Set<string>;
}

export type BulkPlan =
  | { ok: true; patch: TaskPatch; clearDueDate: boolean }
  | { ok: false; reason: string };

const DAY_MS = 24 * 60 * 60 * 1000;
const STATUSES = new Set(["TODO", "IN_PROGRESS", "BLOCKED", "DONE"]);
const PRIORITIES = new Set(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
const PROGRESSES = new Set(["NO_PROGRESS", "IN_PROGRESS", "COMPLETED"]);

function idList(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((v): v is string => typeof v === "string" && v.length > 0))];
}

function nullableNumber(value: unknown, integer: boolean): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return undefined;
  return integer ? Math.round(value) : value;
}

/**
 * Normalize an untrusted request body. Unknown keys and malformed values are
 * dropped rather than guessed at. Returns null when nothing usable remains.
 */
export function normalizeBulkPatch(raw: unknown): BulkTaskPatch | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const out: BulkTaskPatch = {};

  if (typeof r.status === "string" && STATUSES.has(r.status)) out.status = r.status as TaskStatus;
  if (typeof r.priority === "string" && PRIORITIES.has(r.priority)) out.priority = r.priority as Priority;
  if (typeof r.progress === "string" && PROGRESSES.has(r.progress)) out.progress = r.progress as TaskProgress;

  if (r.dueDate === null) out.dueDate = null;
  else if (typeof r.dueDate === "string" && !Number.isNaN(new Date(r.dueDate).getTime())) out.dueDate = r.dueDate;
  if (typeof r.dueShiftDays === "number" && Number.isInteger(r.dueShiftDays) && r.dueShiftDays !== 0
    && Math.abs(r.dueShiftDays) <= 3650) out.dueShiftDays = r.dueShiftDays;

  for (const key of ["assigneeIds", "addAssigneeIds", "removeAssigneeIds", "tagIds", "addTagIds",
    "removeTagIds", "addBlockerIds", "removeBlockerIds"] as const) {
    const list = idList(r[key]);
    if (list !== undefined) out[key] = list;
  }

  if (r.milestoneId === null || (typeof r.milestoneId === "string" && r.milestoneId)) out.milestoneId = r.milestoneId as string | null;
  if (r.parentTaskId === null || (typeof r.parentTaskId === "string" && r.parentTaskId)) out.parentTaskId = r.parentTaskId as string | null;

  const storyPoints = nullableNumber(r.storyPoints, true);
  if (storyPoints !== undefined) out.storyPoints = storyPoints;
  const estimatedHours = nullableNumber(r.estimatedHours, false);
  if (estimatedHours !== undefined) out.estimatedHours = estimatedHours;

  return Object.keys(out).length > 0 ? out : null;
}

/** Union of `base` and `add`, minus `remove`, keeping `base` order first. */
function applySetOps(base: string[], replace: string[] | undefined, add: string[] | undefined, remove: string[] | undefined): string[] | undefined {
  if (replace === undefined && add === undefined && remove === undefined) return undefined;
  const next = new Set(replace ?? base);
  for (const id of add ?? []) next.add(id);
  for (const id of remove ?? []) next.delete(id);
  return [...next];
}

function sameSet(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every(id => b.includes(id));
}

/** Turn one bulk request into the patch for one task, or a reason it cannot apply. */
export function planTaskPatch(task: BulkTaskState, bulk: BulkTaskPatch, scope: BulkProjectScope): BulkPlan {
  const patch: TaskPatch = {};
  let clearDueDate = false;

  if (bulk.status !== undefined) patch.status = bulk.status;
  if (bulk.priority !== undefined) patch.priority = bulk.priority;
  if (bulk.progress !== undefined) patch.progress = bulk.progress;
  if (bulk.storyPoints !== undefined) patch.storyPoints = bulk.storyPoints;
  if (bulk.estimatedHours !== undefined) patch.estimatedHours = bulk.estimatedHours;

  if (bulk.dueDate === null) {
    if (task.dueDate) clearDueDate = true;
  } else if (bulk.dueDate !== undefined) {
    patch.dueDate = bulk.dueDate;
  } else if (bulk.dueShiftDays !== undefined && task.dueDate) {
    patch.dueDate = new Date(task.dueDate.getTime() + bulk.dueShiftDays * DAY_MS).toISOString();
  }

  const assignees = applySetOps(task.assigneeIds, bulk.assigneeIds, bulk.addAssigneeIds, bulk.removeAssigneeIds);
  if (assignees && !sameSet(assignees, task.assigneeIds)) patch.assigneeIds = assignees;

  // Tags are project-scoped; a tag from another project is silently not applied.
  const tags = applySetOps(task.tagIds, bulk.tagIds, bulk.addTagIds?.filter(id => scope.tagIds.has(id)), bulk.removeTagIds);
  if (tags) {
    const scoped = tags.filter(id => scope.tagIds.has(id) || task.tagIds.includes(id));
    if (!sameSet(scoped, task.tagIds)) patch.tagIds = scoped;
  }

  if (bulk.milestoneId !== undefined) {
    if (bulk.milestoneId !== null && !scope.milestoneIds.has(bulk.milestoneId)) {
      return { ok: false, reason: "Milestone is not in this task's project" };
    }
    patch.milestoneId = bulk.milestoneId;
  }

  if (bulk.addBlockerIds !== undefined || bulk.removeBlockerIds !== undefined) {
    const adds = (bulk.addBlockerIds ?? []).filter(id => scope.openBlockerIds.has(id));
    if ((bulk.addBlockerIds ?? []).length > 0 && adds.length === 0) {
      return { ok: false, reason: "Blocker is not open in this task's project" };
    }
    const blockers = applySetOps(task.blockerIds, undefined, adds, bulk.removeBlockerIds) ?? task.blockerIds;
    if (!sameSet(blockers, task.blockerIds)) patch.blockerIds = blockers;
  }

  if (bulk.parentTaskId !== undefined) {
    if (bulk.parentTaskId === null) {
      if (task.parentTaskId) patch.parentTaskId = null;
    } else {
      if (bulk.parentTaskId === task.id) return { ok: false, reason: "A task cannot be its own parent" };
      if (task.subtaskCount > 0) return { ok: false, reason: "Task has its own subtasks, so it cannot become one" };
      if (!scope.parentCandidateIds.has(bulk.parentTaskId)) {
        return { ok: false, reason: "Parent task must be a top-level task in the same project" };
      }
      if (task.parentTaskId !== bulk.parentTaskId) patch.parentTaskId = bulk.parentTaskId;
    }
  }

  if (Object.keys(patch).length === 0 && !clearDueDate) return { ok: false, reason: "No change" };
  return { ok: true, patch, clearDueDate };
}

/**
 * For POST /api/tasks/bulk-move: which selected tasks move as their own unit.
 * A subtask whose parent is also selected travels with the parent, so it is
 * not moved separately (that would detach it).
 */
export function moveRoots(tasks: { id: string; parentTaskId: string | null }[]): string[] {
  const selected = new Set(tasks.map(t => t.id));
  return tasks.filter(t => !t.parentTaskId || !selected.has(t.parentTaskId)).map(t => t.id);
}

export function normalizeLabel(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

export interface NameMatch {
  sourceId: string;
  name: string;
  /** Existing target-project row with the same name, or null when one must be created. */
  targetId: string | null;
}

/**
 * Match project-scoped rows (tags, blockers, milestones) to the target project
 * by name, ignoring case and spacing. Unmatched sources need a new row; two
 * sources with the same name share one, so the caller creates per `name`.
 */
export function matchByName(sources: { id: string; name: string }[], targets: { id: string; name: string }[]): NameMatch[] {
  const byName = new Map<string, string>();
  for (const t of targets) {
    const key = normalizeLabel(t.name);
    if (!byName.has(key)) byName.set(key, t.id);
  }
  const seen = new Set<string>();
  const out: NameMatch[] = [];
  for (const s of sources) {
    if (seen.has(s.id)) continue;
    seen.add(s.id);
    out.push({ sourceId: s.id, name: s.name.trim(), targetId: byName.get(normalizeLabel(s.name)) ?? null });
  }
  return out;
}

/**
 * Tasks outside the moved set that share a dependency with it. Moving keeps
 * these edges (dependencies may cross projects), but the UI offers to bring
 * the linked tasks along.
 */
export function dependencyNeighbors(edges: { blockingTaskId: string; blockedTaskId: string }[], movedIds: Set<string>): { id: string; relation: "blocks" | "blocked-by" }[] {
  const out = new Map<string, "blocks" | "blocked-by">();
  for (const e of edges) {
    const blockingIn = movedIds.has(e.blockingTaskId);
    const blockedIn = movedIds.has(e.blockedTaskId);
    if (blockingIn === blockedIn) continue;
    // "blocks": the outside task blocks a moved one; "blocked-by": it waits on one.
    if (blockedIn) out.set(e.blockingTaskId, out.get(e.blockingTaskId) ?? "blocks");
    else out.set(e.blockedTaskId, out.get(e.blockedTaskId) ?? "blocked-by");
  }
  return [...out].map(([id, relation]) => ({ id, relation }));
}
