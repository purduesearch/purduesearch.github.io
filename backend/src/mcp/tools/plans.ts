import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createHash } from "node:crypto";
import { prisma } from "../../db/prisma.js";
import { OAuthError, expiresAt, isExpired } from "../../services/oauthCore.js";
import type { ProjectContext, BuildProjectContextOptions } from "../../services/projectContextService.js";
import type { ActionPlanAction, ActionExecutionResult, DroppedAction } from "../../services/aiActionService.js";
import type { AuditOrigin } from "../../services/taskMutationService.js";
import { describeAction } from "../../services/aiActionDescribe.js";
import type { McpContext } from "../context.js";
import { jsonToolResult, safeTool, untrustedData, UNTRUSTED_DATA_WARNING } from "../untrusted.js";

export const MAX_PLAN_ACTIONS = 25;
const DELETE_SCOPE = "constellation.plan.delete";
/** Actions with no target task: they change the project itself, so the member must be able to edit it. */
export const PROJECT_SCOPED_ACTION_TYPES = ["CREATE_TASK", "CREATE_MILESTONE", "LINK_MILESTONE", "ATTACH_BLOCKER", "RESOLVE_BLOCKER"] as const;
const PROJECT_SCOPED = new Set<string>(PROJECT_SCOPED_ACTION_TYPES);
const CANNOT_EDIT = "You cannot edit this project.";
const NO_DELETE_SCOPE = "This connection is not allowed to delete tasks.";
const DELETE_NEEDS_ADMIN = "Deleting tasks requires an administrator.";

export interface PlanDraftRow {
  id: string; grantId: string; projectId: string; actionsJson: string; droppedJson: string;
  contentHash: string; expiresAt: Date; executedAt: Date | null;
}
export interface PlanToolsDependencies {
  buildContext?: (projectId: string, options: BuildProjectContextOptions) => Promise<ProjectContext | null>;
  normalize?: (raw: unknown, context: ProjectContext, dropped: DroppedAction[]) => ActionPlanAction[];
  execute?: (projectId: string, memberId: string, actions: ActionPlanAction[], origin: AuditOrigin) => Promise<ActionExecutionResult[]>;
  createDraft?: (data: Omit<PlanDraftRow, "id" | "executedAt">) => Promise<PlanDraftRow>;
  findDraft?: (id: string) => Promise<PlanDraftRow | null>;
  /** Atomically marks the draft used. Returns false if another call already claimed it. */
  claimDraft?: (id: string, at: Date) => Promise<boolean>;
  /** The member's current project-edit permission (services/projectEditAccess.ts). */
  canEditProject?: (memberId: string, projectId: string) => Promise<boolean>;
  now?: () => Date;
}

/** The hash binds the stored bytes to their project, so neither can be swapped after preview. */
export function planContentHash(projectId: string, actionsJson: string) {
  return createHash("sha256").update(`${projectId}\n${actionsJson}`, "utf8").digest("hex");
}

const service = () => import("../../services/aiActionService.js");
const defaults: Required<Omit<PlanToolsDependencies, "now" | "normalize">> = {
  buildContext: async (id, options) => (await import("../../services/projectContextService.js")).buildProjectContext(id, options),
  execute: async (...args) => (await service()).executeActionPlan(...args),
  createDraft: data => prisma.agentPlanDraft.create({ data }),
  findDraft: id => prisma.agentPlanDraft.findUnique({ where: { id } }),
  claimDraft: async (id, at) => (await prisma.agentPlanDraft.updateMany({ where: { id, executedAt: null, expiresAt: { gt: at } }, data: { executedAt: at } })).count === 1,
  canEditProject: async (memberId, projectId) => (await import("../../services/projectEditAccess.js")).canEditProject(memberId, projectId),
};

const actionSchema = z.object({
  type: z.string().max(40),
  targetTaskId: z.string().max(200).nullable().optional(),
  params: z.record(z.string(), z.unknown()).default({}),
  rationale: z.string().max(1_000).default(""),
});

export function registerPlanTools(server: McpServer, context: McpContext, deps: PlanToolsDependencies = {}): void {
  const d = { ...defaults, ...deps };
  const now = deps.now ?? (() => new Date());
  // Missing, expired-and-pruned, and another grant's drafts look the same.
  const unavailable = () => new OAuthError("not_found", "Plan is unavailable. Preview it again.", 404);
  /** Admins skip the lookup; otherwise it is consulted at most once per tool call, and only when needed. */
  const projectEditCheck = (memberId: string, isAdmin: boolean, projectId: string) => {
    let cached: Promise<boolean> | undefined;
    return () => isAdmin ? Promise.resolve(true) : (cached ??= d.canEditProject(memberId, projectId));
  };

  server.registerTool("preview_action_plan", {
    description: `Validate a proposed action plan for one selected project and show exactly what it would change. Writes nothing to project data. Permissions are the member's own: actions they could not take in Constellation are dropped with a reason. Returns a planId to pass to execute_action_plan within one hour. Call get_plan_format first for the action schema. At most ${MAX_PLAN_ACTIONS} actions. ${UNTRUSTED_DATA_WARNING}`,
    inputSchema: {
      projectId: z.string().min(1).max(200),
      actions: z.array(actionSchema).min(1).max(MAX_PLAN_ACTIONS),
      goal: z.string().max(500).optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async ({ projectId, actions, goal }) => safeTool(async () => {
    const access = await context.authorizeProject(projectId, { scope: "constellation.plan", rate: "preview" });
    // The SDK enforces the schema too; this keeps the cap when the handler is reached another way.
    if (!Array.isArray(actions) || actions.length === 0 || actions.length > MAX_PLAN_ACTIONS) {
      throw new OAuthError("invalid_request", `A plan must hold 1 to ${MAX_PLAN_ACTIONS} actions.`, 400);
    }
    const snapshot = await d.buildContext(projectId, { includeRollup: false });
    if (!snapshot || snapshot.project.id !== projectId) throw new OAuthError("access_denied", "Project is unavailable to this connection", 403);

    const hasDeleteScope = access.grant.scopes.includes(DELETE_SCOPE);
    const canEdit = projectEditCheck(access.member.id, access.member.isAdmin, projectId);
    const dropped: DroppedAction[] = [];
    // One pass over the caller's list; `original[i]` is the caller's index of allowed[i].
    const allowed: typeof actions = [], original: number[] = [];
    for (const [index, action] of actions.entries()) {
      let reason: string | null = null;
      if (action.type === "DELETE_TASK") reason = !hasDeleteScope ? NO_DELETE_SCOPE : !access.member.isAdmin ? DELETE_NEEDS_ADMIN : null;
      else if (PROJECT_SCOPED.has(action.type) && !(await canEdit())) reason = CANNOT_EDIT;
      if (reason) { dropped.push({ index, type: action.type, reason }); continue; }
      allowed.push(action); original.push(index);
    }
    const run = deps.normalize ?? (await service()).normalizeActionPlan;
    const normalizedDropped: DroppedAction[] = [];
    const plan = run(allowed, snapshot, normalizedDropped);
    // normalize indexes into `allowed`; map back to the caller's indexes.
    for (const x of normalizedDropped) dropped.push({ ...x, index: original[x.index] ?? x.index });
    dropped.sort((a, b) => a.index - b.index);

    const changes = plan.map((action, index) => ({ index, type: action.type, targetTaskId: action.targetTaskId ?? null,
      untrusted: untrustedData({ change: describeAction(action, snapshot), rationale: action.rationale }) }));
    if (plan.length === 0) {
      return jsonToolResult({ planId: null, actionCount: 0, changes, dropped, note: "Nothing executable remained after validation." });
    }
    const actionsJson = JSON.stringify(plan);
    const at = now();
    const draft = await d.createDraft({ grantId: access.grant.id, projectId, actionsJson, droppedJson: JSON.stringify(dropped),
      contentHash: planContentHash(projectId, actionsJson), expiresAt: expiresAt("draft", at) });
    return jsonToolResult({ planId: draft.id, projectId, expiresAt: draft.expiresAt.toISOString(), actionCount: plan.length,
      goal: goal === undefined ? null : untrustedData(goal), changes, dropped });
  }));

  server.registerTool("execute_action_plan", {
    description: "Apply a plan previously returned by preview_action_plan on this connection. Permissions are the member's own: each action re-checks their current Constellation permissions, and actions they can no longer take fail without running; a plan can run once and expires one hour after preview. Show the user the preview before calling this.",
    inputSchema: { planId: z.string().min(1).max(200) },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  }, async ({ planId }) => safeTool(async () => {
    const access = await context.resolve({ scope: "constellation.plan", rate: "execute" });
    const draft = await d.findDraft(planId);
    const at = now();
    if (!draft || draft.id !== planId || draft.grantId !== access.grant.id) throw unavailable();
    if (!access.projectIds.includes(draft.projectId)) throw new OAuthError("access_denied", "Project is unavailable to this connection", 403);
    if (draft.executedAt) throw new OAuthError("invalid_request", "This plan already ran. Preview a new one.", 409);
    if (isExpired(draft.expiresAt, at)) throw new OAuthError("invalid_request", "This plan expired. Preview it again.", 410);
    if (planContentHash(draft.projectId, draft.actionsJson) !== draft.contentHash) throw new OAuthError("invalid_request", "This plan changed after preview. Preview it again.", 409);

    let actions: ActionPlanAction[];
    try { actions = JSON.parse(draft.actionsJson) as ActionPlanAction[]; }
    catch { throw new OAuthError("invalid_request", "This plan could not be read. Preview it again.", 409); }
    if (!Array.isArray(actions) || actions.length === 0 || actions.length > MAX_PLAN_ACTIONS) {
      throw new OAuthError("invalid_request", `A plan must hold 1 to ${MAX_PLAN_ACTIONS} actions.`, 400);
    }
    // Re-checked here: the grant's scopes and the member's admin status may have changed since preview.
    if (actions.some(a => a.type === "DELETE_TASK")) {
      if (!access.grant.scopes.includes(DELETE_SCOPE)) throw new OAuthError("insufficient_scope", "This connection is not allowed to delete tasks", 403);
      if (!access.member.isAdmin) throw new OAuthError("access_denied", "Deleting tasks requires an administrator", 403);
    }
    const canEdit = projectEditCheck(access.member.id, access.member.isAdmin, draft.projectId);
    const runnable: ActionPlanAction[] = [], runnableIndex: number[] = [];
    const refused: ActionExecutionResult[] = [];
    for (const [index, action] of actions.entries()) {
      if (PROJECT_SCOPED.has(action.type) && !(await canEdit())) refused.push({ index, type: action.type, ok: false, error: CANNOT_EDIT });
      else { runnable.push(action); runnableIndex.push(index); }
    }
    if (!(await d.claimDraft(draft.id, at))) throw new OAuthError("invalid_request", "This plan already ran or expired. Preview a new one.", 409);

    const ran = runnable.length === 0 ? []
      : await d.execute(draft.projectId, access.member.id, runnable, { source: "AGENT", client: access.clientName });
    // execute indexes into `runnable`; map back to positions in the stored plan.
    const results = [...refused, ...ran.map(r => ({ ...r, index: runnableIndex[r.index] ?? r.index }))].sort((a, b) => a.index - b.index);
    return jsonToolResult({ planId: draft.id, projectId: draft.projectId,
      succeeded: results.filter(r => r.ok).length, failed: results.filter(r => !r.ok).length,
      results: results.map(r => ({ index: r.index, type: r.type, ok: r.ok, error: r.error === undefined ? undefined : untrustedData(r.error) })) });
  }));
}
