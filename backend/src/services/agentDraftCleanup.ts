// Data-maintenance job (not a Slack send): prunes expired Claude connector rows.
// Logs counts only, never ids or content.

const GRACE_MS = 24 * 60 * 60 * 1000;

type DeleteMany = (args: { where: Record<string, unknown> }) => Promise<{ count: number }>;

export interface AgentCleanupDb {
  agentPlanDraft: { deleteMany: DeleteMany };
  agentRecommendationDismissal: { deleteMany: DeleteMany };
}

export interface AgentCleanupDeps {
  db?: AgentCleanupDb;
  now?: () => Date;
}

export async function cleanupAgentDrafts(
  deps: AgentCleanupDeps = {},
): Promise<{ drafts: number; dismissals: number }> {
  // Lazy import: tests inject a db and never load Prisma.
  const db: AgentCleanupDb =
    deps.db ?? ((await import("../db/prisma.js")).prisma as unknown as AgentCleanupDb);
  const now = (deps.now ?? (() => new Date()))();
  // The 24 h grace lets execute still answer "expired" (410) for a just-expired draft.
  const cutoff = new Date(now.getTime() - GRACE_MS);

  const drafts = await db.agentPlanDraft.deleteMany({ where: { expiresAt: { lt: cutoff } } });
  const dismissals = await db.agentRecommendationDismissal.deleteMany({ where: { until: { lt: now } } });

  const result = { drafts: drafts.count, dismissals: dismissals.count };
  if (result.drafts > 0 || result.dismissals > 0) console.log("[agent-drafts] pruned", result);
  return result;
}

/** Cron entry point: never throws. */
export async function runAgentDraftCleanup(deps: AgentCleanupDeps = {}): Promise<void> {
  try {
    await cleanupAgentDrafts(deps);
  } catch (err) {
    console.error("[agent-drafts] cleanup error:", err);
  }
}
