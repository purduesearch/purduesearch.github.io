import { prisma } from "../db/prisma.js";
import { buildProjectContext } from "./projectContextService.js";
import { runText, todayContext } from "./ai/aiRouter.js";
import { projectContextPrompt } from "../utils/aiPrompts.js";
import { isSkillIntent, renderSkillMatches } from "./skillQueryCore.js";
import { askSkills, type AskResult } from "./skillSearchService.js";

export interface ProjectAnswer {
  answer: string;
  /** Present for staffing/expertise questions: the people and cited work the answer drew on. */
  skillMatches: AskResult["people"] | null;
}

/**
 * Project Q&A. The prompt carries the same single-project snapshot and exact
 * computed signals the action-plan features use, plus each member's advisory
 * skills. A staffing question ("who could take over thermal analysis?") also runs
 * skill retrieval (structured filters + embeddings) scoped to what the asker may
 * see, and the answer is written from those cited candidates.
 */
export async function askProjectDetailed(projectId: string, question: string, memberId: string | null, opts: { skills?: boolean; includeRollup?: boolean } = {}): Promise<ProjectAnswer | null> {
  const useSkills = opts.skills !== false;
  let isAdmin = false;
  if (memberId) {
    const member = await prisma.member.findUnique({ where: { id: memberId }, select: { isAdmin: true } });
    if (!member || !await prisma.project.findFirst({ where: { id: projectId, ...(member.isAdmin ? {} : { members: { some: { memberId } } }) }, select: { id: true } })) return null;
    isAdmin = member.isAdmin;
  }
  const context = await buildProjectContext(projectId, { includeRollup: opts.includeRollup });
  if (!context) return null;

  let skillMatches: AskResult["people"] | null = null;
  let skillBlock: string | undefined;
  if (useSkills && memberId && isSkillIntent(question)) {
    try {
      const found = await askSkills({ question, asker: { id: memberId, isAdmin }, projectId, writeAnswer: false });
      skillMatches = found.people;
      skillBlock = renderSkillMatches(
        found.people.map((p) => ({
          displayName: p.member.displayName, onProject: p.onProject ?? false, skills: p.skills,
          evidence: p.evidence.map((e) => ({ date: e.date, source: e.source, project: e.project, summary: e.summary, contribution: e.contribution, complexity: e.complexity })),
        })),
        { skills: found.filters.skills.map((s) => s.name), minLevel: found.filters.minLevel, activeWithinDays: found.filters.activeWithinDays },
      );
    } catch (err) {
      // Skill data is an extra; the project answer must still work without it.
      console.error("[projectAsk] skill retrieval skipped:", (err as Error)?.message ?? err);
    }
  }

  const answer = await runText({ memberId }, "high", { prompt: projectContextPrompt(question, todayContext(), context, skillBlock, useSkills), json: false });
  return { answer, skillMatches };
}

export async function askProject(projectId: string, question: string, memberId: string | null): Promise<string | null> {
  // Slack and other non-web callers: skill data stays in the web app, where the audience is the signed-in member.
  // Sub-project roll-up is web-only too; the Slack answer describes this project alone.
  return (await askProjectDetailed(projectId, question, memberId, { skills: false, includeRollup: false }))?.answer ?? null;
}
