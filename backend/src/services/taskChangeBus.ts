import { EventEmitter } from "node:events";

const taskChangeBus = new EventEmitter();

/** Publish committed task writes without coupling mutations to Slack delivery. */
export function emitTaskChanged(ids: string | string[]): void {
  taskChangeBus.emit("changed", [...new Set(typeof ids === "string" ? [ids] : ids)]);
}

export function onTaskChanged(fn: (ids: string[]) => void): () => void {
  taskChangeBus.on("changed", fn);
  return () => { taskChangeBus.off("changed", fn); };
}
