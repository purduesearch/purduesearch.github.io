import { prisma } from "../db/prisma.js";
import { getRollupSettings } from "../services/subProjectRollupService.js";
import { onTaskChanged, type TaskChangeMeta } from "../services/taskChangeBus.js";
import { mirrorRelease } from "../services/boardLockService.js";
import { allFamilies, getFamily, sendToRoom, type Family } from "./boardPresence.js";
import { familyRootOf, roomsForRow, toPatchEntry, type PatchEntry, type PatchRow } from "./boardPresenceCore.js";

/**
 * Turns committed task writes into small patches for every live board that
 * shows those tasks, then releases the drag locks they complete. One query
 * per 25 ms batch, however many viewers.
 */
const BATCH_MS = 25;
const pending = new Map<string, TaskChangeMeta | undefined>();
let timer: NodeJS.Timeout | null = null;
const rollupCache = new Map<string, { tasks: boolean; at: number }>();

async function parentRollsUpTasks(childId: string): Promise<boolean> {
  const hit = rollupCache.get(childId);
  if (hit && Date.now() - hit.at < 30_000) return hit.tasks;
  const s = await getRollupSettings(childId);
  rollupCache.set(childId, { tasks: s.tasks, at: Date.now() });
  return s.tasks;
}

export function queueTaskChanges(ids: string[], meta?: TaskChangeMeta): void {
  for (const id of ids) pending.set(id, meta ?? pending.get(id));
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    flush().catch(err => console.error("[presence] patch flush failed:", err));
  }, BATCH_MS);
}

async function flush(): Promise<void> {
  const batch = new Map(pending);
  pending.clear();
  const ids = [...batch.keys()];
  if (!ids.length || !allFamilies().length) return;

  const rows = await prisma.task.findMany({
    where: { id: { in: ids } },
    select: {
      id: true, projectId: true, status: true, priority: true, title: true, dueDate: true, progress: true,
      archivedAt: true, parentTaskId: true, updatedAt: true,
      assignees: { select: { id: true } }, project: { select: { parentId: true } },
    },
  });

  const out = new Map<string, { family: Family; room: string; entries: PatchEntry[] }>();
  const touched = new Map<Family, string[]>();
  for (const r of rows) {
    const row: PatchRow = {
      id: r.id, projectId: r.projectId, parentProjectId: r.project.parentId, status: r.status,
      priority: r.priority, title: r.title, dueDate: r.dueDate, progress: r.progress,
      archivedAt: r.archivedAt, parentTaskId: r.parentTaskId, updatedAt: r.updatedAt,
      assigneeIds: r.assignees.map(a => a.id),
    };
    const family = getFamily(familyRootOf(row));
    if (!family) continue; // nobody is watching this family
    const entry = toPatchEntry(row, batch.get(row.id), family.locks.get(row.id)?.sid);
    const rollsUp = row.parentProjectId ? await parentRollsUpTasks(row.projectId) : false;
    for (const room of roomsForRow(row, rollsUp)) {
      const key = `${family.root}|${room}`;
      const slot = out.get(key) ?? { family, room, entries: [] };
      slot.entries.push(entry);
      out.set(key, slot);
    }
    touched.set(family, [...(touched.get(family) ?? []), row.id]);
  }

  for (const { family, room, entries } of out.values()) sendToRoom(family, room, ["p", entries]);

  // Deleted tasks: their project is unknown now, so tell every live board; clients ignore unknown ids.
  const found = new Set(rows.map(r => r.id));
  const gone = ids.filter(id => !found.has(id)).map(id => ({ id, gone: true as const }));
  if (gone.length) {
    for (const f of allFamilies()) {
      for (const room of f.projects.keys()) sendToRoom(f, room, ["p", gone]);
      touched.set(f, [...(touched.get(f) ?? []), ...gone.map(g => g.id)]);
    }
  }

  // The patch tells clients the drag is over; release the locks it completes.
  for (const [family, taskIds] of touched) {
    for (const rel of family.locks.releaseCommitted(taskIds)) {
      const holder = rel.sid ? family.conns.get(rel.sid) : undefined;
      if (holder?.drag) holder.drag = null;
      mirrorRelease(rel.ids);
    }
  }
}

/** Subscribes to task changes. `subscribe` is swapped for the Postgres listener in standalone mode (Phase 12). */
export function startBoardPatches(
  subscribe: (fn: (ids: string[], meta?: TaskChangeMeta) => void) => unknown = onTaskChanged,
): void {
  subscribe(queueTaskChanges);
}
