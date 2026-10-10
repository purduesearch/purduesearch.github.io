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
