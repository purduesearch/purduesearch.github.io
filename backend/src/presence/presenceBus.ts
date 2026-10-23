import pg from "pg";
import { prisma } from "../db/prisma.js";
import { onTaskChanged, type TaskChangeMeta } from "../services/taskChangeBus.js";

/**
 * Cross-process task-change bus for PRESENCE_MODE=standalone. The API process
 * publishes committed task ids with pg_notify; presence workers LISTEN and
 * build patches. Payloads are chunked under Postgres' 8000-byte limit.
 */
export const TASK_CHANGE_CHANNEL = "board_task_changed";
const CHUNK = 150;

export function startTaskChangePublisher(): () => void {
  return onTaskChanged((ids, meta) => {
    for (let i = 0; i < ids.length; i += CHUNK) {
      const payload = JSON.stringify({ ids: ids.slice(i, i + CHUNK), meta });
      prisma.$executeRaw`SELECT pg_notify(${TASK_CHANGE_CHANNEL}, ${payload})`
        .catch(err => console.warn("[presence] notify failed:", err));
    }
  });
}

export function listenForTaskChanges(fn: (ids: string[], meta?: TaskChangeMeta) => void): void {
  let attempt = 0;
  const connect = async () => {
    const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
    let retried = false;
    const retry = () => {
      if (retried) return;
      retried = true;
      client.end().catch(() => {});
      setTimeout(connect, Math.min(30_000, 1000 * 2 ** attempt++));
    };
    client.on("error", retry);
    client.on("end", retry);
    client.on("notification", msg => {
      try {
        const { ids, meta } = JSON.parse(msg.payload ?? "{}");
        if (Array.isArray(ids)) fn(ids.filter((x: unknown) => typeof x === "string"), meta);
      } catch { /* ignore malformed payloads */ }
    });
    try {
      await client.connect();
      await client.query(`LISTEN ${TASK_CHANGE_CHANNEL}`);
      attempt = 0;
      console.log("[presence] listening for task changes");
    } catch (err) {
      console.warn("[presence] listen failed:", err);
      retry();
    }
  };
  void connect();
}
