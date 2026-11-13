import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { prisma } from "../../db/prisma.js";
import { OAuthError } from "../../services/oauthCore.js";
import { TaxonomyError } from "../../services/skillTaxonomyService.js";
import {
  computeProjectInsights, type InsightTaskRow, type InsightStatus, type InsightPriority,
} from "../../services/projectInsightsCore.js";
import type { TimeInsights } from "../../services/timeInsightsService.js";
import type { McpContext } from "../context.js";
import { jsonToolResult, safeTool, untrustedData, UNTRUSTED_DATA_WARNING } from "../untrusted.js";

const WEEK_MS = 7 * 86_400_000;
const DEFAULT_WEEKS = 8, MIN_WEEKS = 1, MAX_WEEKS = 26;
export const MAX_SKILLS_PER_MEMBER = 5;
export const MAX_EVIDENCE_PER_SKILL = 1;
const annotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

export interface RosterMember { id: string; displayName: string }
/** Shape of getProjectSkillCoverage that this tool reads. */
export interface SkillCoverage {
  members: Array<{ id: string; displayName: string; groups: Array<{ skills: Array<{
    skillId: string; name: string; level: unknown; confidence: unknown;
    evidence: Array<{ summary: string; source?: unknown; date?: string }>;
  }> }> }>;
  truncated?: boolean;
}

export interface InsightsToolsDependencies {
  loadRows?: (projectId: string) => Promise<InsightTaskRow[]>;
  loadRoster?: (projectId: string) => Promise<RosterMember[]>;
  loadTime?: (projectId: string, from: Date, to: Date, now: Date) => Promise<TimeInsights>;
  loadSkills?: (memberId: string, projectId: string) => Promise<SkillCoverage>;
  now?: () => Date;
}

/** Same non-archived, this-project-only scope as projectTasksQuery in projects.ts. */
const defaultLoadRows: NonNullable<InsightsToolsDependencies["loadRows"]> = async projectId => {
  const rows = await prisma.task.findMany({
    where: { projectId, archivedAt: null, project: { trainingForMemberId: null } },
    select: {
      id: true, status: true, priority: true, createdAt: true, completedAt: true, dueDate: true,
      updatedAt: true, storyPoints: true, estimatedHours: true, assignees: { select: { id: true } },
    },
  });
  return rows.map(({ assignees, ...r }) => ({
    ...r, status: r.status as InsightStatus, priority: r.priority as InsightPriority,
    assigneeIds: assignees.map(a => a.id),
  }));
};
const defaultLoadRoster: NonNullable<InsightsToolsDependencies["loadRoster"]> = async projectId => {
  const rows = await prisma.projectMember.findMany({
    where: { projectId, member: { isBot: false, deactivatedAt: null } },
    select: { member: { select: { id: true, displayName: true } } },
  });
  return rows.map(r => r.member);
};
const defaultLoadTime: NonNullable<InsightsToolsDependencies["loadTime"]> = async (projectId, from, to, now) =>
  (await import("../../services/timeInsightsService.js")).getProjectTimeInsights(projectId, { from, to }, now);
const defaultLoadSkills: NonNullable<InsightsToolsDependencies["loadSkills"]> = async (memberId, projectId) =>
  (await import("../../services/skillWorkspaceService.js")).getProjectSkillCoverage(memberId, projectId) as unknown as SkillCoverage;

export function registerInsightsTools(server: McpServer, context: McpContext, deps: InsightsToolsDependencies = {}): void {
  const loadRows = deps.loadRows ?? defaultLoadRows;
  const loadRoster = deps.loadRoster ?? defaultLoadRoster;
  const loadTime = deps.loadTime ?? defaultLoadTime;
  const loadSkills = deps.loadSkills ?? defaultLoadSkills;
  const nowFn = deps.now ?? (() => new Date());

  server.registerTool("get_project_insights", {
    description: `Read one selected project's analytics: KPIs, per-member workload, weekly completions, open-task aging, logged time (manual vs lab) and per-member skill coverage. Read-only and deterministic: the same numbers as the website's Insights tab, with no AI calls. ${UNTRUSTED_DATA_WARNING}`,
    inputSchema: {
      projectId: z.string().min(1).max(200),
      weeks: z.number().int().min(MIN_WEEKS).max(MAX_WEEKS).default(DEFAULT_WEEKS).optional(),
    },
    annotations,
  }, async args => safeTool(async () => {
    const { projectId } = args as { projectId: string };
    const weeks = (args as { weeks?: number }).weeks ?? DEFAULT_WEEKS;
    if (!Number.isInteger(weeks) || weeks < MIN_WEEKS || weeks > MAX_WEEKS) {
      throw new OAuthError("invalid_request", `weeks must be an integer from ${MIN_WEEKS} to ${MAX_WEEKS}.`, 400);
    }
    const access = await context.authorizeProject(projectId, { rate: "read" });
    const now = nowFn();
    const [tasks, roster] = await Promise.all([loadRows(projectId), loadRoster(projectId)]);
    const insights = computeProjectInsights({ tasks, roster: roster.map(r => ({ id: r.id })), now, weeks });
    const time = await loadTime(projectId, new Date(now.getTime() - weeks * WEEK_MS), now, now);

    const names: Record<string, string> = {};
    for (const r of roster) names[r.id] = r.displayName;
    for (const m of time.byMember) names[m.memberId] ??= m.displayName;

    let skills: unknown;
    try {
      const coverage = await loadSkills(access.member.id, projectId);
      const skillNames: Record<string, Array<{ name: string; evidence: string[] }>> = {};
      const levels: Record<string, Array<{ skillId: string; level: unknown; confidence: unknown }>> = {};
      for (const m of coverage.members) {
        const flat = m.groups.flatMap(g => g.skills).slice(0, MAX_SKILLS_PER_MEMBER);
        if (!flat.length) continue;
        names[m.id] ??= m.displayName;
        levels[m.id] = flat.map(s => ({ skillId: s.skillId, level: s.level, confidence: s.confidence }));
        skillNames[m.id] = flat.map(s => ({ name: s.name, evidence: s.evidence.slice(0, MAX_EVIDENCE_PER_SKILL).map(e => e.summary) }));
      }
      skills = { available: true, truncated: !!coverage.truncated, members: levels, untrusted: untrustedData({ members: skillNames }) };
    } catch (error) {
      skills = { available: false, reason: error instanceof TaxonomyError && error.code === "FORBIDDEN" ? "not_a_member" : "unavailable" };
    }

    return jsonToolResult({
      projectId, asOf: now.toISOString(), weeks,
      kpis: insights.kpis, workload: insights.workload, weekly: insights.weekly, aging: insights.aging,
      rosterMedianOpenHours: insights.rosterMedianOpenHours,
      time: {
        from: time.from, to: time.to, totals: time.totals, byWeek: time.byWeek,
        byMember: time.byMember.map(m => ({ memberId: m.memberId, minutes: m.minutes, labMinutes: m.labMinutes, manualMinutes: m.minutes - m.labMinutes })),
      },
      skills,
      untrusted: untrustedData({ members: names }),
    });
  }));
}
