import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import type { McpContext } from "../context.js";
import { jsonToolResult, safeTool, untrustedData, UNTRUSTED_DATA_WARNING } from "../untrusted.js";

const DAY_MS = 86_400_000;
/** First check, or an explicit `since` older than this, looks back no further. */
export const MAX_LOOKBACK_DAYS = 14;
export const FIRST_CHECK_LOOKBACK_DAYS = 7;
export const CHANGE_PAGE_SIZE = 200;
const PAYLOAD_CHARS = 1_000;

export interface ChangeCursor { at: Date; id: string }
/** `<ISO timestamp>|<ActivityLog id>`; ids break ties between events written in the same millisecond. */
export function serializeCursor(cursor: ChangeCursor) { return `${cursor.at.toISOString()}|${cursor.id}`; }
export function parseCursor(value: string | null | undefined): ChangeCursor | null {
  if (!value) return null;
  const split = value.indexOf("|");
  if (split < 0) return null;
  const at = new Date(value.slice(0, split)), id = value.slice(split + 1);
  // An empty id is valid: it means "everything after this instant".
  return Number.isNaN(at.getTime()) ? null : { at, id };
}

export function changeEventsQuery(projectIds: string[], after: ChangeCursor) {
  return {
    where: {
      projectId: { in: projectIds },
      OR: [{ createdAt: { gt: after.at } }, { createdAt: after.at, id: { gt: after.id } }],
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: CHANGE_PAGE_SIZE + 1,
    select: {
      id: true, projectId: true, taskId: true, source: true, eventType: true, payload: true, createdAt: true,
      member: { select: { displayName: true } },
      task: { select: { title: true, projectId: true } },
    },
  } satisfies Prisma.ActivityLogFindManyArgs;
}
export type ChangeEventRow = Prisma.ActivityLogGetPayload<ReturnType<typeof changeEventsQuery>>;

export interface ChangeToolsDependencies {
  loadEvents?: (projectIds: string[], after: ChangeCursor) => Promise<ChangeEventRow[]>;
  /** Compare-and-set so two concurrent checks cannot move the cursor backwards. Returns false on a lost race. */
  saveCursor?: (grantId: string, expected: string | null, next: string) => Promise<boolean>;
  now?: () => Date;
}

const defaultLoadEvents: NonNullable<ChangeToolsDependencies["loadEvents"]> = (ids, after) => prisma.activityLog.findMany(changeEventsQuery(ids, after));
const defaultSaveCursor: NonNullable<ChangeToolsDependencies["saveCursor"]> = async (grantId, expected, next) =>
  (await prisma.oAuthGrant.updateMany({ where: { id: grantId, revokedAt: null, changeCursor: expected }, data: { changeCursor: next } })).count === 1;

export const humanizeEventType = (eventType: string) => eventType.toLowerCase().replace(/_/g, " ");

function boundedPayload(payload: Prisma.JsonValue) {
  const text = JSON.stringify(payload ?? null);
  return text.length <= PAYLOAD_CHARS ? payload : { truncated: true, preview: text.slice(0, PAYLOAD_CHARS) };
}

export function registerChangeTools(server: McpServer, context: McpContext, deps: ChangeToolsDependencies = {}): void {
  const loadEvents = deps.loadEvents ?? defaultLoadEvents;
  const saveCursor = deps.saveCursor ?? defaultSaveCursor;
  const now = deps.now ?? (() => new Date());

  server.registerTool("get_changes_since_last_check", {
    description: `List activity on selected projects since this connection last checked, grouped by project, oldest first. A call with no arguments advances this connection's cursor; passing projectId or since reads without moving it. When "more" is true, call again to continue. ${UNTRUSTED_DATA_WARNING}`,
    inputSchema: {
      projectId: z.string().min(1).max(200).optional(),
      since: z.string().datetime({ offset: true }).optional().describe("ISO timestamp; reads from here without moving the cursor"),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async ({ projectId, since }) => safeTool(async () => {
    const access = await context.resolve(projectId ? { projectId } : {});
    const at = now();
    const floor = new Date(at.getTime() - MAX_LOOKBACK_DAYS * DAY_MS);
    const advances = projectId === undefined && since === undefined;
    const stored = access.grant.changeCursor ?? null;
    let after = parseCursor(stored) ?? { at: new Date(at.getTime() - FIRST_CHECK_LOOKBACK_DAYS * DAY_MS), id: "" };
    if (since !== undefined) after = { at: new Date(since), id: "" };
    if (after.at < floor) after = { at: floor, id: "" };

    const projectIds = projectId ? [projectId] : access.projectIds;
    const rows = projectIds.length ? await loadEvents(projectIds, after) : [];
    const allowed = new Set(projectIds);
    const page = rows.filter(row => allowed.has(row.projectId)).slice(0, CHANGE_PAGE_SIZE);
    const more = rows.length > CHANGE_PAGE_SIZE;

    let cursorMoved = false;
    if (advances) {
      // With nothing new, pin the cursor to "now" only if none was stored yet, so the first window is not re-read.
      const last = page.at(-1);
      const next = last ? serializeCursor({ at: last.createdAt, id: last.id }) : stored ?? serializeCursor({ at, id: "" });
      if (next !== stored) cursorMoved = await saveCursor(access.grant.id, stored, next);
    }

    const names = new Map(access.projects.map(p => [p.id, p.name]));
    const projects = projectIds.map(id => ({
      projectId: id,
      events: page.filter(row => row.projectId === id).map(row => ({
        id: row.id, at: row.createdAt.toISOString(), action: humanizeEventType(row.eventType), eventType: row.eventType,
        source: row.source, taskId: row.task?.projectId === id ? row.taskId : null,
        untrusted: untrustedData({ actor: row.member?.displayName ?? null, taskTitle: row.task?.projectId === id ? row.task.title : null, payload: boundedPayload(row.payload) }),
      })),
    })).filter(group => group.events.length > 0).map(group => ({ ...group, untrusted: untrustedData({ projectName: names.get(group.projectId) ?? null }) }));

    return jsonToolResult({ from: after.at.toISOString(), asOf: at.toISOString(), eventCount: page.length, more,
      cursorAdvanced: cursorMoved, projects });
  }));
}
