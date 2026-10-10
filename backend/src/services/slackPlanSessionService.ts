import { Prisma, type SlackPlanSession } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import {
  suggestProjectActions, normalizeActionPlan, executeActionPlan,
  type ActionPlan, type ActionExecutionResult, type DroppedAction,
} from "./aiActionService.js";
import { buildProjectContext } from "./projectContextService.js";

type Decision = "ACCEPTED" | "SKIPPED" | "EDITED";
type Decisions = Record<string, Decision>;

function decisionsOf(session: SlackPlanSession): Decisions {
  return session.decisions as Decisions;
}

function actionsOf(session: SlackPlanSession): ActionPlan {
  return JSON.parse(session.actionsJson) as ActionPlan;
}

async function ownedSession(sessionId: string, memberId: string): Promise<SlackPlanSession> {
  const session = await prisma.slackPlanSession.findUnique({ where: { id: sessionId } });
  if (!session || session.memberId !== memberId) throw new Error("This plan belongs to another member or no longer exists.");
  if (session.expiresAt.getTime() <= Date.now()) throw new Error("This plan expired — start a new one.");
  if (session.status !== "OPEN") throw new Error("This plan is no longer open for review.");
  return session;
}

function checkIndex(session: SlackPlanSession, index: number): void {
  if (!Number.isInteger(index) || index < 0 || index >= actionsOf(session).length) {
    throw new Error("That action is not in this plan.");
  }
}

// Compare the reviewed snapshot as well as OPEN: an edit/decision racing a run
// must never silently change which actions the run executes.
async function updateOpen(
  session: SlackPlanSession,
  data: Prisma.SlackPlanSessionUpdateManyMutationInput,
): Promise<SlackPlanSession> {
  const updated = await prisma.slackPlanSession.updateMany({
    where: {
      id: session.id, memberId: session.memberId, status: "OPEN",
      expiresAt: { gt: new Date() }, actionsJson: session.actionsJson,
      decisions: { equals: session.decisions as Prisma.InputJsonValue },
    },
    data,
  });
  if (updated.count !== 1) {
    if (session.expiresAt.getTime() <= Date.now()) throw new Error("This plan expired — start a new one.");
    throw new Error("This plan changed or already ran. Reopen it before continuing.");
  }
  return prisma.slackPlanSession.findUniqueOrThrow({ where: { id: session.id } });
}

export async function startSession(opts: {
  memberId: string; projectId: string; goal: string; threadText?: string;
  source?: { channelId: string; ts: string };
}): Promise<SlackPlanSession> {
  const goal = opts.threadText
    ? `${opts.goal}\n\nContext from Slack thread: ${opts.threadText.slice(0, 4000)}`
    : opts.goal;
  const actions = await suggestProjectActions(opts.projectId, goal, opts.memberId);
  if (actions === null) throw new Error("Project not found.");
  return prisma.slackPlanSession.create({
    data: {
      memberId: opts.memberId, projectId: opts.projectId, goal,
      actionsJson: JSON.stringify(actions), decisions: {},
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      sourceChannelId: opts.source?.channelId, sourceTs: opts.source?.ts,
    },
  });
}

export async function setDecision(
  sessionId: string, memberId: string, index: number, decision: "ACCEPTED" | "SKIPPED",
): Promise<SlackPlanSession> {
  const session = await ownedSession(sessionId, memberId);
  checkIndex(session, index);
  if (decision !== "ACCEPTED" && decision !== "SKIPPED") throw new Error("Invalid plan decision.");
  return updateOpen(session, { decisions: { ...decisionsOf(session), [index]: decision } });
}

export async function acceptAll(sessionId: string, memberId: string): Promise<SlackPlanSession> {
  const session = await ownedSession(sessionId, memberId);
  const decisions: Decisions = {};
  actionsOf(session).forEach((_, index) => {
    decisions[index] = decisionsOf(session)[index] === "EDITED" ? "EDITED" : "ACCEPTED";
  });
  return updateOpen(session, { decisions });
}

export async function editAction(
  sessionId: string, memberId: string, index: number,
  params: Record<string, unknown>, targetTaskId?: string | null,
): Promise<SlackPlanSession> {
  const session = await ownedSession(sessionId, memberId);
  checkIndex(session, index);
  const context = await buildProjectContext(session.projectId);
  if (!context) throw new Error("Project not found.");
  const actions = actionsOf(session);
  const edited = {
    ...actions[index], params,
    ...(targetTaskId !== undefined ? { targetTaskId } : {}),
  };
  const dropped: DroppedAction[] = [];
  const normalized = normalizeActionPlan([edited], context, dropped);
  if (!normalized.length) throw new Error(dropped[0]?.reason ?? "That action is not valid.");
  actions[index] = normalized[0];
  return updateOpen(session, {
    actionsJson: JSON.stringify(actions),
    decisions: { ...decisionsOf(session), [index]: "EDITED" },
  });
}

export async function runAccepted(sessionId: string, memberId: string): Promise<{
  session: SlackPlanSession; results: ActionExecutionResult[];
}> {
  const session = await ownedSession(sessionId, memberId);
  const decisions = decisionsOf(session);
  const accepted = actionsOf(session)
    .map((action, index) => ({ action, index }))
    .filter(({ index }) => decisions[index] === "ACCEPTED" || decisions[index] === "EDITED");
  if (!accepted.length) throw new Error("Accept at least one action before running this plan.");
  await updateOpen(session, { status: "RUNNING" });
  let results: ActionExecutionResult[];
  try {
    const executed = await executeActionPlan(session.projectId, memberId, accepted.map(item => item.action));
    results = executed.map(result => ({ ...result, index: accepted[result.index].index }));
  } catch (error) {
    // An unexpected error may follow partial execution. Keep the run terminal
    // so a repeated Slack submit cannot replay writes whose outcome is unknown.
    const message = error instanceof Error ? error.message : "Plan execution failed.";
    results = accepted.map(({ action, index }) => ({
      index, type: action.type, ok: false, error: `Execution interrupted; verify the project before retrying. ${message}`,
    }));
  }
  const completed = await prisma.slackPlanSession.update({
    where: { id: session.id },
    data: { status: "DONE", resultsJson: results as unknown as Prisma.InputJsonValue },
  });
  return { session: completed, results };
}

export async function discard(sessionId: string, memberId: string): Promise<void> {
  const session = await ownedSession(sessionId, memberId);
  await updateOpen(session, { status: "DISCARDED" });
}
