import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { prisma } from "../../db/prisma.js";
import { OAuthError } from "../../services/oauthCore.js";
import { logAuditEvent } from "../../services/activityService.js";
import type { McpContext } from "../context.js";
import { jsonToolResult, safeTool, untrustedData, UNTRUSTED_DATA_WARNING } from "../untrusted.js";

export const EXTERNAL_APPS = ["email", "slack", "calendar", "docs", "other"] as const;
export type ExternalApp = (typeof EXTERNAL_APPS)[number];
export const MAX_KIND_LENGTH = 40, MAX_SUMMARY_LENGTH = 500, MAX_RECIPIENTS = 50, MAX_ID_LENGTH = 200;

export interface ContactRow {
  memberId: string; isLead: boolean; displayName: string; email: string | null;
  slackId: string | null; slackHandle: string | null; projectRole: string | null;
}
export interface ExternalActionRecord {
  projectId: string; taskId?: string; memberId: string; source: "AGENT"; eventType: "AGENT_EXTERNAL_ACTION";
  payload: { client: string; app: ExternalApp; kind: string; summary: string; recipientMemberIds: string[] };
}

export interface ContactsToolsDependencies {
  /** Current roster of this project only: no bots, no deactivated members. */
  loadRoster?: (projectId: string) => Promise<ContactRow[]>;
  /** Non-archived task of this project, or null. */
  loadTask?: (projectId: string, taskId: string) => Promise<{ id: string; projectId: string } | null>;
  recordAction?: (record: ExternalActionRecord) => Promise<void>;
}

/** Locked: project members only, never outreach CRM contacts or members outside the project. */
export const ROSTER_WHERE = (projectId: string) => ({ projectId, member: { isBot: false, deactivatedAt: null } });

const defaultLoadRoster: NonNullable<ContactsToolsDependencies["loadRoster"]> = async projectId => {
  const rows = await prisma.projectMember.findMany({
    where: ROSTER_WHERE(projectId),
    select: { memberId: true, isLead: true, projectRole: true,
      member: { select: { displayName: true, email: true, slackId: true, slackHandle: true } } },
  });
  return rows.map(r => ({ memberId: r.memberId, isLead: r.isLead, projectRole: r.projectRole ?? null,
    displayName: r.member.displayName, email: r.member.email ?? null,
    slackId: r.member.slackId ?? null, slackHandle: r.member.slackHandle ?? null }));
};
const defaultLoadTask: NonNullable<ContactsToolsDependencies["loadTask"]> = async (projectId, taskId) =>
  prisma.task.findFirst({ where: { id: taskId, projectId, archivedAt: null }, select: { id: true, projectId: true } });
const defaultRecordAction: NonNullable<ContactsToolsDependencies["recordAction"]> = async record => { await logAuditEvent(record); };

const invalid = (message: string) => new OAuthError("invalid_request", message, 400);

export function registerContactsTools(server: McpServer, context: McpContext, deps: ContactsToolsDependencies = {}): void {
  const loadRoster = deps.loadRoster ?? defaultLoadRoster;
  const loadTask = deps.loadTask ?? defaultLoadTask;
  const recordAction = deps.recordAction ?? defaultRecordAction;
  const notFound = () => new OAuthError("not_found", "Task is unavailable to this connection", 404);

  server.registerTool("get_project_contacts", {
    description: `Get contact details (email, Slack id and handle) for the members of one selected project. Use it only to address messages the user asked you to send through their own mail or chat connector; Constellation sends nothing itself. Project members only. ${UNTRUSTED_DATA_WARNING}`,
    inputSchema: { projectId: z.string().min(1).max(MAX_ID_LENGTH) },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async args => safeTool(async () => {
    const { projectId } = args as { projectId: string };
    await context.authorizeProject(projectId, { scope: "constellation.contacts", rate: "read" });
    const roster = await loadRoster(projectId);
    const contacts = [...roster]
      .sort((a, b) => a.displayName.localeCompare(b.displayName) || (a.memberId < b.memberId ? -1 : a.memberId > b.memberId ? 1 : 0))
      .map(c => ({ memberId: c.memberId, isLead: c.isLead, untrusted: untrustedData({
        displayName: c.displayName, email: c.email ?? null, slackId: c.slackId, slackHandle: c.slackHandle, projectRole: c.projectRole }) }));
    return jsonToolResult({ projectId, contacts });
  }));

  server.registerTool("record_external_action", {
    description: "Record in Constellation what you did for the user in another app (an email draft, a Slack message, a calendar invite). This only records; it sends nothing.",
    inputSchema: {
      projectId: z.string().min(1).max(MAX_ID_LENGTH),
      taskId: z.string().min(1).max(MAX_ID_LENGTH).optional(),
      app: z.enum(EXTERNAL_APPS),
      kind: z.string().min(1).max(MAX_KIND_LENGTH),
      summary: z.string().min(1).max(MAX_SUMMARY_LENGTH),
      recipientMemberIds: z.array(z.string().max(MAX_ID_LENGTH)).max(MAX_RECIPIENTS).default([]).optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async args => safeTool(async () => {
    const a = args as { projectId: string; taskId?: unknown; app: unknown; kind: unknown; summary: unknown; recipientMemberIds?: unknown };
    const { projectId } = a;
    if (typeof a.app !== "string" || !(EXTERNAL_APPS as readonly string[]).includes(a.app)) throw invalid(`app must be one of ${EXTERNAL_APPS.join(", ")}.`);
    if (typeof a.kind !== "string" || a.kind.length < 1 || a.kind.length > MAX_KIND_LENGTH) throw invalid(`kind must be 1 to ${MAX_KIND_LENGTH} characters.`);
    if (typeof a.summary !== "string" || a.summary.length < 1 || a.summary.length > MAX_SUMMARY_LENGTH) throw invalid(`summary must be 1 to ${MAX_SUMMARY_LENGTH} characters.`);
    const rawRecipients = a.recipientMemberIds ?? [];
    if (!Array.isArray(rawRecipients) || rawRecipients.length > MAX_RECIPIENTS
      || rawRecipients.some(r => typeof r !== "string" || r.length < 1 || r.length > MAX_ID_LENGTH)) {
      throw invalid(`recipientMemberIds must be at most ${MAX_RECIPIENTS} ids.`);
    }
    if (a.taskId !== undefined && (typeof a.taskId !== "string" || a.taskId.length < 1 || a.taskId.length > MAX_ID_LENGTH)) throw invalid("taskId is not valid.");
    const taskId = a.taskId as string | undefined;
    const recipients = [...new Set(rawRecipients as string[])];

    const access = await context.authorizeProject(projectId, { scope: "constellation.plan", rate: "log" });
    if (recipients.length) {
      const roster = new Set((await loadRoster(projectId)).map(r => r.memberId));
      if (!recipients.every(id => roster.has(id))) throw invalid("Recipients must be members of this project.");
    }
    if (taskId !== undefined) {
      const task = await loadTask(projectId, taskId);
      if (!task || task.projectId !== projectId) throw notFound();
    }
    await recordAction({ projectId, taskId, memberId: access.member.id, source: "AGENT", eventType: "AGENT_EXTERNAL_ACTION",
      payload: { client: access.clientName, app: a.app as ExternalApp, kind: a.kind, summary: a.summary, recipientMemberIds: recipients } });
    return jsonToolResult({ recorded: true, projectId, taskId: taskId ?? null, app: a.app });
  }));
}
