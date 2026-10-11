export const BUNDLE_QUIET_MS = 10 * 60_000;
export const BUNDLE_MAX_WAIT_MS = 15 * 60_000;

export interface QueueRow {
  id: string;
  recipientId: string;
  entityType: string;
  entityId: string;
  queuedAt: Date;
}

export function bundleIsDue(rows: { queuedAt: Date }[], now: Date): boolean {
  if (!rows.length) return false;
  const times = rows.map(row => row.queuedAt.getTime());
  return now.getTime() - Math.max(...times) >= BUNDLE_QUIET_MS
    || now.getTime() - Math.min(...times) >= BUNDLE_MAX_WAIT_MS;
}

export function planBundles(rows: QueueRow[], now: Date): { recipientId: string; rowIds: string[]; entityIds: string[] }[] {
  const groups = new Map<string, QueueRow[]>();
  // Stable ordering preserves the input order for equal timestamps.
  for (const row of [...rows].sort((a, b) => a.queuedAt.getTime() - b.queuedAt.getTime())) {
    const key = JSON.stringify([row.recipientId, row.entityType]);
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }
  return [...groups.values()].filter(group => bundleIsDue(group, now)).map(group => ({
    recipientId: group[0].recipientId,
    rowIds: group.map(row => row.id),
    entityIds: [...new Set(group.map(row => row.entityId))],
  }));
}

export const MAX_CARD_ATTEMPTS = 5;
/** Slack errors that no retry can fix: the recipient or their DM is gone. */
const PERMANENT_SLACK_ERRORS = new Set(["user_not_found", "account_inactive", "cannot_dm_bot", "user_disabled", "not_allowed_token_type"]);

/** After a failed delivery: when to try again (backoff 1, 2, 4, 8 minutes), or null to give up. */
export function planCardRetry(attempts: number, slackError: string | undefined, now: Date): Date | null {
  if (attempts >= MAX_CARD_ATTEMPTS || (slackError && PERMANENT_SLACK_ERRORS.has(slackError))) return null;
  return new Date(now.getTime() + 60_000 * 2 ** Math.max(0, attempts - 1));
}
