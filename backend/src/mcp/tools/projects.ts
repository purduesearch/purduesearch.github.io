import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import type { ProjectContext, ProjectContextTask, BuildProjectContextOptions } from "../../services/projectContextService.js";
import { OAuthError } from "../../services/oauthCore.js";
import { computeProjectSignals, renderProjectContext, renderSignals } from "../../utils/projectContextRender.js";
import type { McpContext, McpResolvedContext, AccessibleProject } from "../context.js";
import { jsonToolResult, safeTool, untrustedData, UNTRUSTED_DATA_WARNING } from "../untrusted.js";

const DAY_MS = 86_400_000;
const annotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

/** Narrow, unbounded read: exact counts/own-work filtering cannot use the 300-task snapshot. */
export function projectTasksQuery(projectIds: string[]) {
  const scope = { projectId: { in: projectIds }, archivedAt: null };
  return {
    where: { ...scope, project: { trainingForMemberId: null } },
    select: {
      id: true, projectId: true, title: true, status: true, priority: true, dueDate: true,
      updatedAt: true, storyPoints: true, estimatedHours: true,
      assignees: { select: { id: true, displayName: true } },
      parentTask: { select: { id: true, projectId: true } },
      milestone: { select: { id: true, projectId: true } },
      blockedBy: { where: { blockingTask: scope }, select: { blockingTask: { select: { id: true, projectId: true, title: true, status: true } } } },
      blockers: { where: { blocker: { projectId: { in: projectIds }, resolvedAt: null } }, select: { blocker: { select: { id: true, projectId: true, label: true } } } },
      subtasks: { where: scope, select: { projectId: true, status: true } },
    },
  } satisfies Prisma.TaskFindManyArgs;
}
export type ProjectTaskRow = Prisma.TaskGetPayload<ReturnType<typeof projectTasksQuery>>;

export interface ProjectToolsDependencies {
  buildContext?: (projectId: string, options: BuildProjectContextOptions) => Promise<ProjectContext | null>;
  loadTasks?: (projectIds: string[]) => Promise<ProjectTaskRow[]>;
  loadPlanFormat?: () => Promise<string>;
  now?: () => Date;
}

const defaultBuildContext: NonNullable<ProjectToolsDependencies["buildContext"]> = async (id, options) =>
  (await import("../../services/projectContextService.js")).buildProjectContext(id, options);
const defaultLoadTasks: NonNullable<ProjectToolsDependencies["loadTasks"]> = ids => prisma.task.findMany(projectTasksQuery(ids));
const defaultLoadPlanFormat = async () => (await import("../../utils/aiPrompts.js")).ACTION_PLAN_FORMAT;
const date = (value: Date | null) => value?.toISOString().slice(0, 10) ?? null;
const role = (access: McpResolvedContext, project: AccessibleProject) => access.member.isAdmin ? "admin" : project.members.some(m => m.isLead) ? "lead" : "member";

/** Replace relation text from the shared context with explicitly project-scoped fields. */
export function scopedContext(context: ProjectContext, rows: ProjectTaskRow[], now: Date): ProjectContext {
  const projectId = context.project.id;
  const local = rows.filter(row => row.projectId === projectId);
  const byId = new Map(local.map(row => [row.id, row]));
  const milestones = new Map(context.milestones.map(m => [m.id, m.title]));
  const original = new Map(context.tasks.map(t => [t.id, t]));
  const tasks: ProjectContextTask[] = local.map(row => {
    // All related rows must belong to THIS project, even when another granted project exists.
    const deps = row.blockedBy.filter(d => d.blockingTask.projectId === projectId && d.blockingTask.status !== "DONE");
    const blockers = row.blockers.filter(b => b.blocker.projectId === projectId);
    const subtasks = row.subtasks.filter(t => t.projectId === projectId);
    const old = original.get(row.id);
    return {
      id: row.id, title: row.title, description: old?.description ?? null, status: row.status,
      priority: row.priority, assignees: row.assignees.map(a => a.displayName), dueDate: date(row.dueDate),
      milestoneTitle: row.milestone?.projectId === projectId ? milestones.get(row.milestone.id) ?? null : null,
      parentTitle: row.parentTask?.projectId === projectId ? byId.get(row.parentTask.id)?.title ?? null : null,
      blockedByOpenDependencies: deps.length > 0, blockedByTitles: deps.map(d => d.blockingTask.title),
      activeCategoryBlockers: blockers.map(b => b.blocker.label),
      subtaskCounts: { total: subtasks.length, done: subtasks.filter(t => t.status === "DONE").length },
      storyPoints: row.storyPoints, estimatedHours: row.estimatedHours, loggedHours: old?.loggedHours ?? 0,
      daysSinceUpdate: Math.max(0, Math.floor((now.getTime() - row.updatedAt.getTime()) / DAY_MS)),
    };
  });
  return {
    ...context, tasks, rollupProjects: [], recentActivity: [],
    activeBlockers: context.activeBlockers.map(blocker => ({ ...blocker,
      attachedTaskTitles: local.filter(t => t.blockers.some(b => b.blocker.projectId === projectId && b.blocker.id === blocker.id)).map(t => t.title),
    })),
  };
}

export function registerProjectTools(server: McpServer, context: McpContext, deps: ProjectToolsDependencies = {}): void {
  const build = deps.buildContext ?? defaultBuildContext;
  const loadTasks = deps.loadTasks ?? defaultLoadTasks;
  const now = deps.now ?? (() => new Date());
  const description = (text: string) => `${text} ${UNTRUSTED_DATA_WARNING}`;

  async function read(access: McpResolvedContext, projectId: string, rows: ProjectTaskRow[], at: Date) {
    // resolve() has already checked current membership AND the grant before any context load.
    if (!access.projectIds.includes(projectId)) throw new OAuthError("access_denied", "Project is unavailable to this connection", 403);
    const raw = await build(projectId, { includeRollup: false });
    if (!raw || raw.project.id !== projectId) throw new OAuthError("access_denied", "Project is unavailable to this connection", 403);
    const full = scopedContext(raw, rows, at);
    const signals = computeProjectSignals(full, at.toISOString().slice(0, 10));
    return { raw, full, signals, openTaskCount: full.tasks.filter(t => t.status !== "DONE").length };
  }

  server.registerTool("list_my_projects", {
    description: description("List currently accessible projects selected for this connection, current roles, exact open-task counts, and health signals."),
    inputSchema: {}, annotations,
  }, async () => safeTool(async () => {
    const access = await context.resolve();
    const at = now(), rows = access.projectIds.length ? await loadTasks(access.projectIds) : [];
    const projects = await Promise.all(access.projects.map(async project => {
      const data = await read(access, project.id, rows, at);
      return { projectId: project.id, status: project.status, role: role(access, project), openTaskCount: data.openTaskCount,
        snapshotTaskCount: data.raw.tasks.length, snapshotTruncated: data.raw.truncated,
        signalTaskCount: data.full.tasks.length, signalsTruncated: false,
        untrusted: untrustedData({ name: data.full.project.name, signals: data.signals, renderedSignals: renderSignals(data.signals) }) };
    }));
    return jsonToolResult({ projects });
  }));

  server.registerTool("get_project_snapshot", {
    description: description("Read one selected project's rendered context, including task IDs and computed health signals. Child-project rollups are excluded; counts and signals cover all unarchived local tasks even if the rendered snapshot is truncated."),
    inputSchema: { projectId: z.string().min(1).max(200) }, annotations,
  }, async ({ projectId }) => safeTool(async () => {
    const access = await context.resolve({ projectId });
    const at = now(), rows = await loadTasks([projectId]);
    const data = await read(access, projectId, rows, at);
    const ids = new Set(data.raw.tasks.map(t => t.id));
    const snapshot = { ...data.full, tasks: data.full.tasks.filter(t => ids.has(t.id)) };
    return jsonToolResult({ projectId, role: role(access, access.projects.find(p => p.id === projectId)!),
      openTaskCount: data.openTaskCount, totalTaskCount: data.full.tasks.length,
      snapshotTaskCount: snapshot.tasks.length, snapshotTruncated: data.raw.truncated || snapshot.tasks.length < data.full.tasks.length,
      signalsTruncated: false, signalTaskCount: data.full.tasks.length,
      untrusted: untrustedData({ snapshot: renderProjectContext(snapshot, at.toISOString().slice(0, 10), { ids: true, descChars: 200, activity: false }),
        signals: data.signals, renderedSignals: renderSignals(data.signals) }) });
  }));

  server.registerTool("get_my_dashboard", {
    description: description("Read your assigned unarchived open work across selected, currently accessible projects: overdue, due within seven days, and blocked work, plus risks for projects you currently manage."),
    inputSchema: {}, annotations,
  }, async () => safeTool(async () => {
    const access = await context.resolve();
    const at = now(), today = at.toISOString().slice(0, 10), until = new Date(at.getTime() + 7 * DAY_MS).toISOString().slice(0, 10);
    const rows = access.projectIds.length ? await loadTasks(access.projectIds) : [];
    const allowed = new Set(access.projectIds);
    const own = rows.filter(t => allowed.has(t.projectId) && t.status !== "DONE" && t.assignees.some(a => a.id === access.member.id));
    const tasks = own.map(t => ({ taskId: t.id, projectId: t.projectId, status: t.status, priority: t.priority, dueDate: date(t.dueDate),
      overdue: !!date(t.dueDate) && date(t.dueDate)! < today,
      dueWithin7Days: !!date(t.dueDate) && date(t.dueDate)! >= today && date(t.dueDate)! <= until,
      blocked: t.status === "BLOCKED" || t.blockedBy.some(d => d.blockingTask.projectId === t.projectId && d.blockingTask.status !== "DONE") || t.blockers.some(b => b.blocker.projectId === t.projectId),
      untrusted: untrustedData({ title: t.title, projectName: access.projects.find(p => p.id === t.projectId)!.name }) }));
    const managedProjects = await Promise.all(access.projects.filter(p => role(access, p) !== "member").map(async project => {
      const data = await read(access, project.id, rows, at);
      return { projectId: project.id, role: role(access, project), openTaskCount: data.openTaskCount, signalsTruncated: false,
        untrusted: untrustedData({ name: data.full.project.name, riskLines: renderSignals(data.signals) }) };
    }));
    return jsonToolResult({ memberId: access.member.id, asOf: today, tasks, counts: { assignedOpen: tasks.length,
      overdue: tasks.filter(t => t.overdue).length, dueWithin7Days: tasks.filter(t => t.dueWithin7Days).length, blocked: tasks.filter(t => t.blocked).length },
      tasksTruncated: false, managedProjects });
  }));

  server.registerTool("get_plan_format", {
    description: description("Read the existing Constellation action-plan schema and formatting rules. This returns static documentation and makes no AI generation calls."),
    inputSchema: {}, annotations,
  }, async () => safeTool(async () => {
    await context.resolve();
    return jsonToolResult({ format: await (deps.loadPlanFormat ?? defaultLoadPlanFormat)() });
  }));
}
