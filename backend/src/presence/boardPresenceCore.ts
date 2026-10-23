/**
 * Pure rules for the live board presence relay (boardPresence.ts): message
 * parsing, per-socket rate limiting, card-lock arbitration and patch shaping.
 * No I/O, so everything here is covered by boardPresenceCore.test.ts.
 */

export const LIMITS = {
  maxMessageBytes: 4096,
  maxIdsPerMessage: 200,
  messagesPerSecond: 40,
  lockTtlMs: 15_000,     // a lock not renewed for this long expires
  maxHoldMs: 60_000,     // no drag may hold a card longer than this
  dropGraceMs: 5_000,    // after a drop, wait this long for the commit patch
  tickMs: 50,            // cursor frame interval
  authTimeoutMs: 5_000,  // the first frame must be ["auth", token]
} as const;

export const TASK_STATUSES = ["TODO", "IN_PROGRESS", "BLOCKED", "DONE"] as const;

const ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
const ANCHOR_RE = /^(?:[kcm]:[A-Za-z0-9_-]{1,40}|b)$/;

export type ClientMsg =
  | { t: "auth"; token: string }
  | { t: "c"; anchor: string; x: number; y: number }
  | { t: "sel"; ids: string[] }
  | { t: "ds"; ids: string[]; grabbed: string }
  | { t: "de"; ids: string[]; status: string | null }
  | { t: "dc"; ids: string[] }
  | { t: "as"; memberId: string }
  | { t: "ae"; taskId: string }
  | { t: "ac" }
  | { t: "o"; taskId: string }
  | { t: "oc" }
  | { t: "h"; hidden: boolean }
  | { t: "join"; projectId: string }
  | { t: "hb" };

export function isId(v: unknown): v is string {
  return typeof v === "string" && ID_RE.test(v);
}

function idList(v: unknown): string[] | null {
  if (!Array.isArray(v) || v.length > LIMITS.maxIdsPerMessage || !v.every(isId)) return null;
  return [...new Set(v as string[])];
}

function frac(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? Math.min(1000, Math.max(0, Math.round(v))) : null;
}

/** Parses one inbound frame. Anything malformed returns null and is dropped silently. */
export function parseClientMessage(raw: string): ClientMsg | null {
  if (raw.length > LIMITS.maxMessageBytes) return null;
  let m: unknown;
  try { m = JSON.parse(raw); } catch { return null; }
  if (!Array.isArray(m) || typeof m[0] !== "string") return null;
  switch (m[0]) {
    case "auth":
      return typeof m[1] === "string" && m[1].length > 0 && m[1].length <= 2048 ? { t: "auth", token: m[1] } : null;
    case "c": {
      const x = frac(m[2]), y = frac(m[3]);
      return typeof m[1] === "string" && ANCHOR_RE.test(m[1]) && x !== null && y !== null
        ? { t: "c", anchor: m[1], x, y } : null;
    }
    case "sel": { const ids = idList(m[1]); return ids ? { t: "sel", ids } : null; }
    case "ds": {
      const ids = idList(m[1]);
      return ids && ids.length > 0 && isId(m[2]) && ids.includes(m[2]) ? { t: "ds", ids, grabbed: m[2] } : null;
    }
    case "de": {
      const ids = idList(m[1]);
      const status = (TASK_STATUSES as readonly unknown[]).includes(m[2]) ? (m[2] as string) : null;
      return ids && ids.length > 0 ? { t: "de", ids, status } : null;
    }
    case "dc": { const ids = idList(m[1]); return ids ? { t: "dc", ids } : null; }
    case "as": return isId(m[1]) ? { t: "as", memberId: m[1] } : null;
    case "ae": return isId(m[1]) ? { t: "ae", taskId: m[1] } : null;
    case "ac": return { t: "ac" };
    case "o": return isId(m[1]) ? { t: "o", taskId: m[1] } : null;
    case "oc": return { t: "oc" };
    case "h": return { t: "h", hidden: m[1] === 1 || m[1] === true };
    case "join": return isId(m[1]) ? { t: "join", projectId: m[1] } : null;
    case "hb": return { t: "hb" };
    default: return null;
  }
}

/** Fixed one-second window per socket. */
export class RateLimiter {
  private windowStart = 0;
  private count = 0;
  constructor(private readonly perSecond: number = LIMITS.messagesPerSecond) {}
  allow(now: number): boolean {
    if (now - this.windowStart >= 1000) { this.windowStart = now; this.count = 0; }
    this.count += 1;
    return this.count <= this.perSecond;
  }
}

export type LockHolder = {
  /** null = restored from the BoardLock mirror after a restart; nobody can renew it. */
  sid: string | null;
  memberId: string;
  grantedAt: number;
  renewedAt: number;
  droppedAt: number | null;
};

export type Released = { sid: string | null; memberId: string; ids: string[] };

function groupByHolder(pairs: [string, LockHolder][]): Released[] {
  const out = new Map<string, Released>();
  for (const [id, h] of pairs) {
    const key = `${h.sid ?? ""}|${h.memberId}`;
    const r = out.get(key) ?? { sid: h.sid, memberId: h.memberId, ids: [] };
    r.ids.push(id);
    out.set(key, r);
  }
  return [...out.values()];
}

/** Card locks for one project family. Locks belong to a socket (sid), not a member. */
export class LockTable {
  private readonly locks = new Map<string, LockHolder>();

  get(taskId: string): LockHolder | undefined { return this.locks.get(taskId); }
  get size(): number { return this.locks.size; }
  entries(): [string, LockHolder][] { return [...this.locks.entries()]; }
  heldBy(sid: string): string[] { return this.entries().filter(([, h]) => h.sid === sid).map(([id]) => id); }

  /** All or nothing: grants every id, or none and returns the first conflicting holder. */
  tryAcquire(ids: string[], sid: string, memberId: string, now: number): { ok: true } | { ok: false; holder: LockHolder } {
    for (const id of ids) {
      const h = this.locks.get(id);
      if (h && h.sid !== sid) return { ok: false, holder: h };
    }
    for (const id of ids) this.locks.set(id, { sid, memberId, grantedAt: now, renewedAt: now, droppedAt: null });
    return { ok: true };
  }

  renew(sid: string, now: number): void {
    for (const h of this.locks.values()) if (h.sid === sid) h.renewedAt = now;
  }

  markDropped(sid: string, ids: string[], now: number): void {
    for (const id of ids) {
      const h = this.locks.get(id);
      if (h && h.sid === sid) h.droppedAt = now;
    }
  }

  /** Releases `ids` held by `sid`, or all of sid's locks when `ids` is omitted. Returns released ids. */
  release(sid: string, ids?: string[]): string[] {
    const out: string[] = [];
    for (const id of ids ?? this.heldBy(sid)) {
      if (this.locks.get(id)?.sid === sid) { this.locks.delete(id); out.push(id); }
    }
    return out;
  }

  /** A commit patch arrived for these tasks: release locks that were dropped and waiting for it. */
  releaseCommitted(taskIds: string[]): Released[] {
    const hit: [string, LockHolder][] = [];
    for (const id of taskIds) {
      const h = this.locks.get(id);
      if (h && h.droppedAt !== null) { hit.push([id, h]); this.locks.delete(id); }
    }
    return groupByHolder(hit);
  }

  /** Expired (not renewed), held too long, or dropped without a commit. */
  sweep(now: number): Released[] {
    const hit: [string, LockHolder][] = [];
    for (const [id, h] of this.locks) {
      const expired = now - h.renewedAt > LIMITS.lockTtlMs;
      const tooLong = now - h.grantedAt > LIMITS.maxHoldMs;
      const stale = h.droppedAt !== null && now - h.droppedAt > LIMITS.dropGraceMs;
      if (expired || tooLong || stale) hit.push([id, h]);
    }
    for (const [id] of hit) this.locks.delete(id);
    return groupByHolder(hit);
  }

  /** Restores a mirrored lock after a restart. It cannot be renewed, so it lapses within lockTtlMs. */
  seed(taskId: string, memberId: string, now: number): void {
    if (!this.locks.has(taskId)) this.locks.set(taskId, { sid: null, memberId, grantedAt: now, renewedAt: now, droppedAt: null });
  }
}

// ── Patches ────────────────────────────────────────────────────────────────

export type PatchRow = {
  id: string;
  projectId: string;
  parentProjectId: string | null;
  status: string;
  priority: string;
  title: string;
  dueDate: Date | null;
  progress: string;
  archivedAt: Date | null;
  parentTaskId: string | null;
  updatedAt: Date;
  assigneeIds: string[];
};
export type PatchMeta = { actorId?: string; source?: string };
export type PatchEntry =
  | { id: string; p: string; s: string; pr: string; ti: string; du: string | null; pg: string; ar: boolean;
      pt: string | null; a: string[]; u: number; by?: string; ac?: string; src?: string }
  | { id: string; gone: true };

export function toPatchEntry(row: PatchRow, meta: PatchMeta | undefined, bySid: string | null | undefined): PatchEntry {
  const e: PatchEntry = {
    id: row.id, p: row.projectId, s: row.status, pr: row.priority, ti: row.title,
    du: row.dueDate ? row.dueDate.toISOString() : null, pg: row.progress, ar: row.archivedAt !== null,
    pt: row.parentTaskId, a: [...row.assigneeIds].sort(), u: row.updatedAt.getTime(),
  };
  if (bySid) e.by = bySid;
  if (meta?.actorId) e.ac = meta.actorId;
  if (meta?.source) e.src = meta.source;
  return e;
}

/** The family a task's board belongs to. */
export function familyRootOf(row: Pick<PatchRow, "projectId" | "parentProjectId">): string {
  return row.parentProjectId ?? row.projectId;
}

/** Boards that show this task: its own, plus the parent's when the child rolls tasks up. */
export function roomsForRow(row: Pick<PatchRow, "projectId" | "parentProjectId">, parentRollsUpTasks: boolean): string[] {
  return row.parentProjectId && parentRollsUpTasks ? [row.projectId, row.parentProjectId] : [row.projectId];
}
