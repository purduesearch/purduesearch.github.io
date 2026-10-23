import { EventEmitter } from "node:events";

/** Who caused a change, when known. Optional: most call sites do not pass it. */
export type TaskChangeMeta = { actorId?: string; source?: "WEB" | "SLACK" | "AI" };

const taskChangeBus = new EventEmitter();

/** Publish committed task writes without coupling mutations to Slack delivery or the presence relay. */
export function emitTaskChanged(ids: string | string[], meta?: TaskChangeMeta): void {
  taskChangeBus.emit("changed", [...new Set(typeof ids === "string" ? [ids] : ids)], meta);
}

export function onTaskChanged(fn: (ids: string[], meta?: TaskChangeMeta) => void): () => void {
  taskChangeBus.on("changed", fn);
  return () => { taskChangeBus.off("changed", fn); };
}
