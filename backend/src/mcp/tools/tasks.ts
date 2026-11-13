import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import { OAuthError } from "../../services/oauthCore.js";
import type { McpContext } from "../context.js";
import { humanizeEventType } from "./changes.js";
import { jsonToolResult, safeTool, untrustedData, UNTRUSTED_DATA_WARNING } from "../untrusted.js";

const annotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
export const TASK_COMMENT_LIMIT = 20;
export const TASK_HISTORY_LIMIT = 20;
export const SEARCH_LIMIT = 20;

const taskLink = { select: { id: true, projectId: true, title: true, status: true } } as const;
export function taskDetailQuery(taskId: string) {
  return {
    where: { id: taskId, project: { trainingForMemberId: null } },
    select: {
      id: true, projectId: true, title: true, description: true, status: true, priority: true, progress: true,
      dueDate: true, createdAt: true, updatedAt: true, archivedAt: true, storyPoints: true, estimatedHours: true,
      assignees: { select: { id: true, displayName: true } },
      tags: { select: { name: true } },
      milestone: { select: { id: true, projectId: true, title: true } },
      parentTask: taskLink,
      subtasks: { where: { archivedAt: null }, ...taskLink },
      blockedBy: { select: { reason: true, blockingTask: taskLink } },
      blocks: { select: { reason: true, blockedTask: taskLink } },
      blockers: { where: { blocker: { resolvedAt: null } }, select: { reason: true, blocker: { select: { id: true, projectId: true, label: true } } } },
      comments: { orderBy: { createdAt: "desc" }, take: TASK_COMMENT_LIMIT,
        select: { id: true, parentId: true, content: true, createdAt: true, editedAt: true, author: { select: { displayName: true } } } },
      activityLogs: { orderBy: { createdAt: "desc" }, take: TASK_HISTORY_LIMIT,
        select: { id: true, projectId: true, eventType: true, source: true, payload: true, createdAt: true, member: { select: { displayName: true } } } },
    },
  } satisfies Prisma.TaskFindFirstArgs;
}
export type TaskDetailRow = Prisma.TaskGetPayload<ReturnType<typeof taskDetailQuery>>;

export function taskSearchQuery(query: string, projectIds: string[]) {
  const text = { contains: query, mode: "insensitive" as const };
  return {
    where: {
      archivedAt: null, projectId: { in: projectIds }, project: { trainingForMemberId: null },
      OR: [{ title: text }, { description: text }, { tags: { some: { name: text } } }, { assignees: { some: { displayName: text } } }],
    },
    orderBy: { updatedAt: "desc" },
    take: SEARCH_LIMIT,
    select: { id: true, projectId: true, title: true, status: true, priority: true, dueDate: true, assignees: { select: { displayName: true } } },
  } satisfies Prisma.TaskFindManyArgs;
}
export type TaskSearchRow = Prisma.TaskGetPayload<ReturnType<typeof taskSearchQuery>>;

export interface TaskToolsDependencies {
  loadTask?: (taskId: string) => Promise<TaskDetailRow | null>;
  searchTasks?: (query: string, projectIds: string[]) => Promise<TaskSearchRow[]>;
}
const date = (value: Date | null) => value?.toISOString().slice(0, 10) ?? null;
const unavailable = () => new OAuthError("not_found", "Task is unavailable to this connection", 404);

export function registerTaskTools(server: McpServer, context: McpContext, deps: TaskToolsDependencies = {}): void {
  const loadTask = deps.loadTask ?? (id => prisma.task.findFirst(taskDetailQuery(id)));
  const searchTasks = deps.searchTasks ?? ((q, ids) => prisma.task.findMany(taskSearchQuery(q, ids)));

  server.registerTool("get_task", {
    description: `Read one task on a selected project: details, the last ${TASK_COMMENT_LIMIT} comments, recent history, dependencies and blockers. Linked tasks on projects outside this connection are counted but not shown. ${UNTRUSTED_DATA_WARNING}`,
    inputSchema: { taskId: z.string().min(1).max(200) }, annotations,
  }, async ({ taskId }) => safeTool(async () => {
    const access = await context.resolve();
    const task = await loadTask(taskId);
    // Missing and ungranted look the same, so ids on other projects cannot be probed.
    if (!task || task.id !== taskId || !access.projectIds.includes(task.projectId)) throw unavailable();
    const granted = new Set(access.projectIds);
    const visible = <T extends { projectId: string }>(link: T) => granted.has(link.projectId);
    const link = (t: { id: string; projectId: string; title: string; status: string }) =>
      ({ taskId: t.id, projectId: t.projectId, status: t.status, untrusted: untrustedData({ title: t.title }) });
    const blockedBy = task.blockedBy.filter(d => visible(d.blockingTask));
    const blocks = task.blocks.filter(d => visible(d.blockedTask));
    const subtasks = task.subtasks.filter(visible);
    return jsonToolResult({
      taskId: task.id, projectId: task.projectId, status: task.status, priority: task.priority, progress: task.progress,
      dueDate: date(task.dueDate), createdAt: task.createdAt.toISOString(), updatedAt: task.updatedAt.toISOString(),
      archived: task.archivedAt !== null, storyPoints: task.storyPoints, estimatedHours: task.estimatedHours,
      assigneeIds: task.assignees.map(a => a.id),
      milestoneId: task.milestone?.projectId === task.projectId ? task.milestone.id : null,
      parent: task.parentTask && visible(task.parentTask) ? link(task.parentTask) : null,
      subtasks: subtasks.map(link),
      blockedBy: blockedBy.map(d => ({ ...link(d.blockingTask), reason: untrustedData(d.reason) })),
      blocks: blocks.map(d => ({ ...link(d.blockedTask), reason: untrustedData(d.reason) })),
      hiddenLinkedTasks: task.blockedBy.length - blockedBy.length + task.blocks.length - blocks.length + task.subtasks.length - subtasks.length,
      blockers: task.blockers.filter(b => b.blocker.projectId === task.projectId)
        .map(b => ({ blockerId: b.blocker.id, untrusted: untrustedData({ label: b.blocker.label, reason: b.reason }) })),
      untrusted: untrustedData({
        title: task.title, description: task.description,
        assignees: task.assignees.map(a => a.displayName), tags: task.tags.map(t => t.name),
        milestoneTitle: task.milestone?.projectId === task.projectId ? task.milestone.title : null,
        comments: [...task.comments].reverse().map(c => ({ id: c.id, parentId: c.parentId, at: c.createdAt.toISOString(),
          edited: c.editedAt !== null, author: c.author.displayName, content: c.content })),
        history: task.activityLogs.filter(e => e.projectId === task.projectId).map(e => ({ id: e.id, at: e.createdAt.toISOString(),
          action: humanizeEventType(e.eventType), source: e.source, actor: e.member?.displayName ?? null, payload: e.payload })),
      }),
    });
  }));

  server.registerTool("search_tasks", {
    description: `Search unarchived tasks on selected projects by title, description, tag or assignee name. Returns up to ${SEARCH_LIMIT} most recently updated matches. ${UNTRUSTED_DATA_WARNING}`,
    inputSchema: { query: z.string().trim().min(1).max(200), projectId: z.string().min(1).max(200).optional() }, annotations,
  }, async ({ query, projectId }) => safeTool(async () => {
    const access = await context.resolve(projectId ? { projectId } : {});
    const projectIds = projectId ? [projectId] : access.projectIds;
    const allowed = new Set(projectIds);
    const rows = projectIds.length ? (await searchTasks(query, projectIds)).filter(r => allowed.has(r.projectId)) : [];
    const names = new Map(access.projects.map(p => [p.id, p.name]));
    return jsonToolResult({ count: rows.length, limit: SEARCH_LIMIT, tasks: rows.map(r => ({
      taskId: r.id, projectId: r.projectId, status: r.status, priority: r.priority, dueDate: date(r.dueDate),
      untrusted: untrustedData({ title: r.title, projectName: names.get(r.projectId) ?? null, assignees: r.assignees.map(a => a.displayName) }),
    })) });
  }));
}
