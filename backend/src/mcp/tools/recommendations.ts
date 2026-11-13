import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { prisma } from "../../db/prisma.js";
import { OAuthError, expiresAt, isExpired } from "../../services/oauthCore.js";
import type { ProjectContext, BuildProjectContextOptions } from "../../services/projectContextService.js";
import type { ActionPlanAction, DroppedAction } from "../../services/aiActionService.js";
import { describeAction } from "../../services/aiActionDescribe.js";
import {
  buildRecommendations, rankCandidates, type RecInput, type RecTask, type RecMilestone, type RecMember, type RuleId, type Recommendation,
} from "../../services/recommendationCore.js";
import type { McpContext } from "../context.js";
import { jsonToolResult, safeTool, untrustedData, UNTRUSTED_DATA_WARNING } from "../untrusted.js";
import { projectTasksQuery, scopedContext, type ProjectTaskRow } from "./projects.js";
import { planContentHash, PROJECT_SCOPED_ACTION_TYPES, MAX_PLAN_ACTIONS, type PlanDraftRow } from "./plans.js";

const DAY_MS = 86_400_000;
export const RECENT_MINUTES_DAYS = 28;
export const DEFAULT_MAX_RECOMMENDATIONS = 8, MAX_RECOMMENDATIONS = 15;
export const MAX_ASSIGNMENT_CANDIDATES = 10;
export const DEFAULT_DISMISS_DAYS = 14, MAX_DISMISS_DAYS = 30;
export const RECOMMENDATION_KEY_PATTERN = /^[A-Z_]+:[A-Za-z0-9_-]+$/;
/** Every rule the core can emit. The type check below fails if the core gains a rule this list lacks. */
export const RECOMMENDATION_RULES = [
  "UNASSIGNED_DUE_SOON", "OVERLOADED_MEMBER", "STALE_IN_PROGRESS", "BLOCKED_WITHOUT_CAUSE",
  "OVERDUE_NO_OWNER_ACTIVITY", "MILESTONE_EMPTY", "MILESTONE_UNASSIGNED_WORK",
] as const satisfies readonly RuleId[];
type MissingRule = Exclude<RuleId, (typeof RECOMMENDATION_RULES)[number]>;
const _allRulesListed: [MissingRule] extends [never] ? true : never = true;
void _allRulesListed;
const RULES = new Set<string>(RECOMMENDATION_RULES);
export const REVIEW_INSTRUCTION = "Review each draft against get_project_snapshot and get_project_insights. Execute good drafts with execute_action_plan(planId); for weak ones call preview_action_plan with edited actions, or dismiss_recommendation(key).";
const CANNOT_MAKE = "You cannot make this change.";
const NOTHING_LEFT = "Nothing executable remained after validation.";
const PROJECT_SCOPED = new Set<string>(PROJECT_SCOPED_ACTION_TYPES);

export interface RecommendedDraftRow extends PlanDraftRow { origin: string; recommendationKey: string | null }
export interface ReusableDraftQuery { grantId: string; projectId: string; recommendationKey: string; contentHash: string; now: Date }
export interface DismissalUpsert { memberId: string; projectId: string; key: string; until: Date }

export interface RecommendationToolsDependencies {
  buildContext?: (projectId: string, options: BuildProjectContextOptions) => Promise<ProjectContext | null>;
  loadTasks?: (projectIds: string[]) => Promise<ProjectTaskRow[]>;
  /** Minutes logged per member on this project's tasks since `since`. */
  loadRecentMinutes?: (projectId: string, since: Date) => Promise<Record<string, number>>;
  /** Of the given member ids, those that are bots or deactivated: never candidates, never "overloaded". */
  loadInactiveMemberIds?: (memberIds: string[]) => Promise<string[]>;
  loadDismissedKeys?: (memberId: string, projectId: string, now: Date) => Promise<string[]>;
  upsertDismissal?: (data: DismissalUpsert) => Promise<{ key: string; until: Date }>;
  getTaskPermissions?: (memberId: string, taskId: string) => Promise<{ canEdit: boolean }>;
  canEditProject?: (memberId: string, projectId: string) => Promise<boolean>;
  normalize?: (raw: unknown, context: ProjectContext, dropped: DroppedAction[]) => ActionPlanAction[];
  /** The pure rule engine (services/recommendationCore.ts); injectable so tests can feed any action type. */
  recommend?: (input: RecInput) => Recommendation[];
  findReusableDraft?: (query: ReusableDraftQuery) => Promise<RecommendedDraftRow | null>;
  createDraft?: (data: Omit<RecommendedDraftRow, "id" | "executedAt">) => Promise<RecommendedDraftRow>;
  now?: () => Date;
}

type Loaders = Required<Omit<RecommendationToolsDependencies, "now" | "normalize">>;
const defaults: Loaders = {
  buildContext: async (id, options) => (await import("../../services/projectContextService.js")).buildProjectContext(id, options),
  loadTasks: ids => prisma.task.findMany(projectTasksQuery(ids)),
  loadRecentMinutes: async (projectId, since) => {
    const rows = await prisma.timeLog.groupBy({
      by: ["memberId"], where: { loggedAt: { gte: since }, task: { projectId } }, _sum: { minutes: true },
    });
    return Object.fromEntries(rows.map(r => [r.memberId, r._sum.minutes ?? 0]));
  },
  loadInactiveMemberIds: async ids => ids.length === 0 ? [] : (await prisma.member.findMany({
    where: { id: { in: ids }, OR: [{ isBot: true }, { deactivatedAt: { not: null } }] }, select: { id: true },
  })).map(m => m.id),
  loadDismissedKeys: async (memberId, projectId, now) => (await prisma.agentRecommendationDismissal.findMany({
    where: { memberId, projectId, until: { gt: now } }, select: { key: true },
  })).map(r => r.key),
  upsertDismissal: ({ memberId, projectId, key, until }) => prisma.agentRecommendationDismissal.upsert({
    where: { memberId_projectId_key: { memberId, projectId, key } },
    create: { memberId, projectId, key, until }, update: { until }, select: { key: true, until: true },
  }),
  recommend: buildRecommendations,
  getTaskPermissions: async (memberId, taskId) => (await import("../../middleware/taskAccess.js")).getTaskPermissions(memberId, taskId),
  canEditProject: async (memberId, projectId) => (await import("../../services/projectEditAccess.js")).canEditProject(memberId, projectId),
  findReusableDraft: ({ grantId, projectId, recommendationKey, contentHash, now }) => prisma.agentPlanDraft.findFirst({
    where: { grantId, projectId, recommendationKey, contentHash, origin: "RECOMMENDED", executedAt: null, expiresAt: { gt: now } },
    orderBy: { createdAt: "desc" },
  }),
  createDraft: data => prisma.agentPlanDraft.create({ data }),
};

const rosterOf = (scoped: ProjectContext) => scoped.members;

/** Everything the three tools read, scoped to THIS project only. */
async function loadInput(d: Loaders, projectId: string, now: Date, dismissedKeys: string[]) {
  const raw = await d.buildContext(projectId, { includeRollup: false });
  if (!raw || raw.project.id !== projectId) throw new OAuthError("access_denied", "Project is unavailable to this connection", 403);
  const rows = (await d.loadTasks([projectId])).filter(r => r.projectId === projectId);
  const scoped = scopedContext(raw, rows, now);
  const memberIds = rosterOf(scoped).map(m => m.id);
  const [recent, inactive] = await Promise.all([
    d.loadRecentMinutes(projectId, new Date(now.getTime() - RECENT_MINUTES_DAYS * DAY_MS)),
    d.loadInactiveMemberIds(memberIds),
  ]);
  const inactiveSet = new Set(inactive);
  const scopedById = new Map(scoped.tasks.map(t => [t.id, t]));
  const tasks: RecTask[] = rows.map(row => {
    // scopedContext already limits dependencies/blockers to this project; recomputed here so the rule is explicit.
    const deps = row.blockedBy.filter(x => x.blockingTask.projectId === projectId && x.blockingTask.status !== "DONE");
    const blockers = row.blockers.filter(b => b.blocker.projectId === projectId);
    return {
      id: row.id, title: row.title, status: row.status, priority: row.priority,
      assigneeIds: row.assignees.map(a => a.id), dueDate: row.dueDate,
      daysSinceUpdate: scopedById.get(row.id)?.daysSinceUpdate ?? Math.max(0, Math.floor((now.getTime() - row.updatedAt.getTime()) / DAY_MS)),
      storyPoints: row.storyPoints, estimatedHours: row.estimatedHours,
      blockedByOpenDependencies: deps.length > 0, activeCategoryBlockerCount: blockers.length,
      milestoneId: row.milestone && row.milestone.projectId === projectId ? row.milestone.id : null,
    };
  });
  const milestones: RecMilestone[] = scoped.milestones.map(m => ({
    id: m.id, title: m.title, status: String(m.status),
    dueDate: m.targetDate ? new Date(`${m.targetDate}T00:00:00Z`) : null,
    taskIds: tasks.filter(t => t.milestoneId === m.id).map(t => t.id),
  }));
  const roster: RecMember[] = rosterOf(scoped).map(m => ({
    id: m.id, displayName: m.displayName, isBot: inactiveSet.has(m.id),
    recentMinutes: recent[m.id] ?? 0, skillNames: (m.topSkills ?? []).map(s => s.name),
  }));
  const input: RecInput = { tasks, milestones, roster, now, dismissedKeys };
  return { input, scoped, rows };
}

export function registerRecommendationTools(server: McpServer, context: McpContext, deps: RecommendationToolsDependencies = {}): void {
  const d = { ...defaults, ...deps };
  const nowFn = deps.now ?? (() => new Date());
  const normalizer = async () => deps.normalize ?? (await import("../../services/aiActionService.js")).normalizeActionPlan;
  const notFound = () => new OAuthError("not_found", "Task is unavailable to this connection", 404);

  server.registerTool("get_recommendations", {
    description: `Stage deterministic recommendations for one selected project (no AI calls): unassigned work due soon, overloaded members, stale or causelessly blocked tasks, overdue work with no activity, and at-risk milestones. Each recommendation with changes is saved as a draft plan bound to this connection that expires in one hour; this stages drafts but changes no project data. Drafts contain only changes the member could make themselves. ${REVIEW_INSTRUCTION} ${UNTRUSTED_DATA_WARNING}`,
    inputSchema: {
      projectId: z.string().min(1).max(200),
      max: z.number().int().min(1).max(MAX_RECOMMENDATIONS).default(DEFAULT_MAX_RECOMMENDATIONS).optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async args => safeTool(async () => {
    const { projectId } = args as { projectId: string };
    const max = (args as { max?: number }).max ?? DEFAULT_MAX_RECOMMENDATIONS;
    if (!Number.isInteger(max) || max < 1 || max > MAX_RECOMMENDATIONS) {
      throw new OAuthError("invalid_request", `max must be an integer from 1 to ${MAX_RECOMMENDATIONS}.`, 400);
    }
    const access = await context.authorizeProject(projectId, { scope: "constellation.plan", rate: "preview" });
    const now = nowFn();
    const dismissed = await d.loadDismissedKeys(access.member.id, projectId, now);
    const { input, scoped, rows } = await loadInput(d, projectId, now, dismissed);
    const titles = new Map(rows.map(r => [r.id, r.title]));
    const normalize = await normalizer();

    const memberId = access.member.id;
    const taskEdit = new Map<string, Promise<boolean>>();
    const canEditTask = (taskId: string) => {
      let p = taskEdit.get(taskId);
      if (!p) { p = d.getTaskPermissions(memberId, taskId).then(r => r.canEdit === true); taskEdit.set(taskId, p); }
      return p;
    };
    let projectEdit: Promise<boolean> | undefined;
    const canEditThisProject = () => access.member.isAdmin ? Promise.resolve(true) : (projectEdit ??= d.canEditProject(memberId, projectId));

    const out: unknown[] = [];
    // Filtering never removes a recommendation (a blocked one becomes a finding), so stopping at
    // `max` gives the same result as capping after filtering and skips needless permission reads.
    const dismissedSet = new Set(dismissed);
    for (const rec of d.recommend(input)) {
      if (out.length >= max) break;
      if (dismissedSet.has(rec.key)) continue;
      const dropped: DroppedAction[] = [];
      const allowed: ActionPlanAction[] = [], original: number[] = [];
      for (const [index, action] of rec.actions.slice(0, MAX_PLAN_ACTIONS).entries()) {
        let ok: boolean;
        if (action.type === "DELETE_TASK") ok = false;
        else if (PROJECT_SCOPED.has(action.type)) ok = await canEditThisProject();
        else ok = !!action.targetTaskId && titles.has(action.targetTaskId) && await canEditTask(action.targetTaskId);
        if (!ok) { dropped.push({ index, type: action.type, reason: CANNOT_MAKE }); continue; }
        allowed.push(action); original.push(index);
      }
      const normalizedDropped: DroppedAction[] = [];
      const normalized = normalize(allowed, scoped, normalizedDropped);
      for (const x of normalizedDropped) dropped.push({ ...x, index: original[x.index] ?? x.index });
      // Normalize filters unknown assignees out; an emptied ASSIGN would clear the task's owners.
      const plan = normalized.filter(a => !(a.type === "ASSIGN" && (!Array.isArray(a.params.assigneeIds) || a.params.assigneeIds.length === 0)));
      dropped.sort((a, b) => a.index - b.index);

      let planId: string | null = null, draftExpiresAt: string | null = null, note: string | undefined;
      if (plan.length > 0) {
        const actionsJson = JSON.stringify(plan);
        const contentHash = planContentHash(projectId, actionsJson);
        const found = await d.findReusableDraft({ grantId: access.grant.id, projectId, recommendationKey: rec.key, contentHash, now });
        const reusable = found && found.grantId === access.grant.id && found.projectId === projectId
          && found.recommendationKey === rec.key && found.contentHash === contentHash && found.actionsJson === actionsJson
          && found.origin === "RECOMMENDED" && found.executedAt === null && !isExpired(found.expiresAt, now) ? found : null;
        const draft = reusable ?? await d.createDraft({ grantId: access.grant.id, projectId, actionsJson,
          droppedJson: JSON.stringify(dropped), contentHash, expiresAt: expiresAt("draft", now),
          origin: "RECOMMENDED", recommendationKey: rec.key });
        planId = draft.id; draftExpiresAt = draft.expiresAt.toISOString();
      } else if (rec.actions.length > 0) {
        note = dropped.length > 0 && dropped.every(x => x.reason === CANNOT_MAKE) ? CANNOT_MAKE : NOTHING_LEFT;
      }

      const titleMap: Record<string, string> = {};
      for (const id of [...rec.taskIds, ...plan.map(a => a.targetTaskId).filter((x): x is string => !!x)]) {
        const t = titles.get(id);
        if (t !== undefined) titleMap[id] = t;
      }
      out.push({
        key: rec.key, rule: rec.rule, severity: rec.severity, findingCode: rec.findingCode,
        planId, expiresAt: draftExpiresAt, ...(note ? { note } : {}),
        changes: plan.map((a, index) => ({ index, type: a.type, targetTaskId: a.targetTaskId ?? null,
          untrusted: untrustedData({ change: describeAction(a, scoped), rationale: a.rationale }) })),
        evidence: rec.evidence, taskIds: rec.taskIds,
        untrusted: untrustedData({ titles: titleMap }),
      });
    }
    return jsonToolResult({ asOf: now.toISOString(), projectId, recommendations: out,
      dismissedCount: dismissedSet.size, reviewInstruction: REVIEW_INSTRUCTION });
  }));

  server.registerTool("get_assignment_candidates", {
    description: `Rank who could take one task in a selected project, deterministically (no AI calls): open hours, open and overdue tasks, recent logged time and skill overlap. Overloaded members, bots and current assignees are excluded. Read-only. ${UNTRUSTED_DATA_WARNING}`,
    inputSchema: { projectId: z.string().min(1).max(200), taskId: z.string().min(1).max(200) },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async ({ projectId, taskId }) => safeTool(async () => {
    await context.authorizeProject(projectId, { rate: "read" });
    const now = nowFn();
    const { input } = await loadInput(d, projectId, now, []);
    // Missing, other-project and ungranted ids are indistinguishable.
    const task = input.tasks.find(t => t.id === taskId);
    if (!task) throw notFound();
    const names = new Map(input.roster.map(m => [m.id, m.displayName]));
    const candidates = rankCandidates(task, input).slice(0, MAX_ASSIGNMENT_CANDIDATES);
    const members: Record<string, string> = {};
    for (const c of candidates) members[c.memberId] = names.get(c.memberId) ?? "";
    return jsonToolResult({ projectId, taskId,
      candidates: candidates.map(c => ({ memberId: c.memberId, score: c.score, reasons: c.reasons })),
      untrusted: untrustedData({ members }) });
  }));

  server.registerTool("dismiss_recommendation", {
    description: "Hide one recommendation from get_recommendations for you (not other members) in this project, for 1 to 30 days (default 14). It changes no project data.",
    inputSchema: {
      projectId: z.string().min(1).max(200),
      key: z.string().min(1).max(200).regex(RECOMMENDATION_KEY_PATTERN),
      days: z.number().int().min(1).max(MAX_DISMISS_DAYS).default(DEFAULT_DISMISS_DAYS).optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async args => safeTool(async () => {
    const { projectId, key } = args as { projectId: string; key: unknown };
    const days = (args as { days?: number }).days ?? DEFAULT_DISMISS_DAYS;
    if (typeof key !== "string" || key.length > 200 || !RECOMMENDATION_KEY_PATTERN.test(key) || !RULES.has(key.slice(0, key.indexOf(":")))) {
      throw new OAuthError("invalid_request", "That is not a recommendation key.", 400);
    }
    if (!Number.isInteger(days) || days < 1 || days > MAX_DISMISS_DAYS) {
      throw new OAuthError("invalid_request", `days must be an integer from 1 to ${MAX_DISMISS_DAYS}.`, 400);
    }
    const access = await context.authorizeProject(projectId, { scope: "constellation.plan", rate: "read" });
    const until = new Date(nowFn().getTime() + days * DAY_MS);
    const row = await d.upsertDismissal({ memberId: access.member.id, projectId, key, until });
    return jsonToolResult({ key: row.key, until: row.until.toISOString() });
  }));
}
