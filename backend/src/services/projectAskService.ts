import { prisma } from "../db/prisma.js";
import { buildProjectContext } from "./projectContextService.js";
import { runText, todayContext } from "./ai/aiRouter.js";
import { projectContextPrompt } from "../utils/aiPrompts.js";

export async function askProject(projectId: string, question: string, memberId: string | null): Promise<string | null> {
  if (memberId) {
    const member = await prisma.member.findUnique({ where: { id: memberId }, select: { isAdmin: true } });
    if (!member || !await prisma.project.findFirst({ where: { id: projectId, ...(member.isAdmin ? {} : { members: { some: { memberId } } }) }, select: { id: true } })) return null;
  }
  const context = await buildProjectContext(projectId);
  if (!context) return null;
  return runText({ memberId }, "high", { prompt: projectContextPrompt(question, todayContext(), context), json: false });
}
