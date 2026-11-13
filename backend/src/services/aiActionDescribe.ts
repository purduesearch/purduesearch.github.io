// Pure. One plain-English line per normalized action, written against the
// current project snapshot so a reviewer sees the real before → after effect
// ("Set *Mount bracket v2* due Fri 21 Nov → Fri 28 Nov"). Used by the Claude
// connector's preview step; the text contains member-authored titles, so callers
// must wrap it as untrusted data.
import type { ProjectContext } from "./projectContextService.js";

// Structural copy of aiActionService's ActionPlanAction, kept here so this file
// stays import-free (aiActionService pulls in Prisma and the AI router).
export interface DescribableAction {
  type: string;
  targetTaskId?: string | null;
  params: Record<string, any>;
}

const STATUS: Record<string, string> = { TODO: "To do", IN_PROGRESS: "In progress", BLOCKED: "Blocked", DONE: "Done" };
const PRIORITY: Record<string, string> = { LOW: "Low", MEDIUM: "Medium", HIGH: "High", CRITICAL: "Critical" };

export function formatDay(value: unknown): string {
  if (value === null || value === undefined || value === "") return "no date";
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return `"${String(value)}"`;
  return d.toLocaleDateString("en-US", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

export function describeAction(action: DescribableAction, context: ProjectContext): string {
  const tasks = new Map(context.tasks.map(t => [t.id, t]));
  const members = new Map(context.members.map(m => [m.id, m.displayName]));
  const milestones = new Map(context.milestones.map(m => [m.id, m.title]));
  const blockers = new Map(context.activeBlockers.map(b => [b.id, b.label]));
  const task = action.targetTaskId ? tasks.get(action.targetTaskId) : undefined;
  const name = (id: string | null | undefined) => {
    const t = id ? tasks.get(id) : undefined;
    return t ? `*${t.title}*` : `task ${id ?? "?"}`;
  };
  const target = name(action.targetTaskId);
  const people = (ids: unknown) => {
    const list = Array.isArray(ids) ? ids.map(id => members.get(id) ?? String(id)) : [];
    return list.length ? list.join(", ") : "nobody";
  };
  const p = action.params ?? {};

  switch (action.type) {
    case "CREATE_TASK": {
      const extras = [
        p.priority && `${PRIORITY[p.priority] ?? p.priority} priority`,
        p.dueDate && `due ${formatDay(p.dueDate)}`,
        Array.isArray(p.assigneeIds) && p.assigneeIds.length && `assigned to ${people(p.assigneeIds)}`,
        p.milestoneId && `in milestone *${milestones.get(p.milestoneId) ?? p.milestoneId}*`,
        Array.isArray(p.subtasks) && p.subtasks.length && `with ${p.subtasks.length} subtask${p.subtasks.length === 1 ? "" : "s"}`,
      ].filter(Boolean);
      return `Create task *${p.title}*${extras.length ? ` (${extras.join(", ")})` : ""}`;
    }
    case "UPDATE_TASK": {
      const changes: string[] = [];
      if (p.title !== undefined) changes.push(`rename to *${p.title}*`);
      if (p.description !== undefined) changes.push("replace the description");
      if (p.priority !== undefined) changes.push(`priority ${PRIORITY[task?.priority ?? ""] ?? "?"} → ${PRIORITY[p.priority] ?? p.priority}`);
      if (p.dueDate !== undefined) changes.push(`due ${formatDay(task?.dueDate)} → ${formatDay(p.dueDate)}`);
      if (p.assigneeIds !== undefined) changes.push(`assignees ${task?.assignees.join(", ") || "nobody"} → ${people(p.assigneeIds)}`);
      if (p.milestoneId !== undefined) changes.push(`milestone → *${milestones.get(p.milestoneId) ?? p.milestoneId}*`);
      return `Update ${target}: ${changes.length ? changes.join("; ") : "no field changes"}`;
    }
    case "DELETE_TASK": return `Delete ${target} permanently`;
    case "SET_STATUS": return `Set ${target} status ${STATUS[task?.status ?? ""] ?? "?"} → ${STATUS[p.status] ?? p.status}`;
    case "SET_PRIORITY": return `Set ${target} priority ${PRIORITY[task?.priority ?? ""] ?? "?"} → ${PRIORITY[p.priority] ?? p.priority}`;
    case "SET_DUE": return `Set ${target} due ${formatDay(task?.dueDate)} → ${formatDay(p.dueDate)}`;
    case "ASSIGN": return `Assign ${target}: ${task?.assignees.join(", ") || "nobody"} → ${people(p.assigneeIds)}`;
    case "CREATE_SUBTASK": {
      const who = Array.isArray(p.assigneeIds) && p.assigneeIds.length ? `, assigned to ${people(p.assigneeIds)}` : "";
      return `Add subtask *${p.title}* under ${target}${who}`;
    }
    case "ADD_DEPENDENCY": return `Make ${target} wait on ${name(p.blockingTaskId)}`;
    case "ATTACH_BLOCKER": return `Attach blocker *${blockers.get(p.blockerId) ?? p.blockerId}* to ${target} (status → Blocked)`;
    case "RESOLVE_BLOCKER": return `Resolve blocker *${blockers.get(p.blockerId) ?? p.blockerId}* and unblock its tasks`;
    case "ADD_COMMENT": {
      const text = String(p.content ?? "");
      return `Comment on ${target}: "${text.length > 120 ? `${text.slice(0, 120)}…` : text}"`;
    }
    case "CREATE_MILESTONE":
      return `Create milestone *${p.title}*${p.dueDate ? ` due ${formatDay(p.dueDate)}` : ""}${p.ownerId ? `, owned by ${members.get(p.ownerId) ?? p.ownerId}` : ""}`;
    case "LINK_MILESTONE": {
      const ids = [...new Set([...(action.targetTaskId ? [action.targetTaskId] : []), ...(Array.isArray(p.taskIds) ? p.taskIds : [])])];
      return `Link ${ids.map(name).join(", ")} to milestone *${milestones.get(p.milestoneId) ?? p.milestoneId}*`;
    }
    default: return `${action.type} (unrecognized)`;
  }
}
