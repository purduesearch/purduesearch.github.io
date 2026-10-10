import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

// Execute the extracted functions with injected boundaries; no service imports,
// database credentials or Slack connection are required.
class TaskMutationError extends Error { constructor(public status: number, message: string) { super(message); } }
function load(source: string, deps: Record<string, unknown>): any {
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  new Function("exports", ...Object.keys(deps), compiled)(exports, ...Object.values(deps));
  return exports;
}
const source = readFileSync(new URL("./blockerMutationService.ts", import.meta.url), "utf8").replace(/^import .*;\r?\n/gm, "");
const calls: any[] = [];
let canEdit = true;
let resolvedAt: Date | null = null;
const deps = {
  TaskMutationError,
  getTaskPermissions: async (actor: string, task: string) => { calls.push(["permission", actor, task]); return { canEdit }; },
  prisma: {
    blocker: {
      create: async (args: any) => { calls.push(["create", args]); return { id: "b", ...args.data }; },
      findUnique: async () => ({ projectId: "p", label: "Supply", resolvedAt }),
    },
    member: { findUnique: async () => ({ slackId: "U1" }) },
    taskBlocker: { upsert: async (args: any) => { calls.push(["upsert", args]); } },
    task: {
      update: async (args: any) => { calls.push(["update", args]); },
      findUnique: async () => ({ title: "Task", blockers: [{ blocker: { label: "Supply" } }] }),
    },
  },
  emitTaskChanged: (id: string) => { calls.push(["emit", id]); },
  logAuditEvent: async (args: any) => { calls.push(["audit", args]); },
  createNotification: async (args: any) => { calls.push(["notification", args]); },
  queueDm: (...args: any[]) => { calls.push(["dm", ...args]); },
};
const service = load(source, deps);
await assert.rejects(service.createBlockerAsMember("actor", "p", { label: "" }, "WEB"), { status: 400 });
assert.equal(calls.length, 0);
const blocker = await service.createBlockerAsMember("actor", "p", { label: " Supply ", assigneeId: "owner" }, "SLACK");
assert.equal(blocker.label, " Supply "); // REST never trimmed creation labels.
assert.deepEqual(calls.map(c => c[0]), ["create", "audit"]);
assert.equal(calls[1][1].memberId, "actor");
assert.equal(calls[1][1].source, "SLACK");
calls.length = 0;
canEdit = false;
await assert.rejects(service.attachBlockerAsMember("outsider", "t", { blockerId: "b" }, "SLACK"), { status: 403 });
assert.deepEqual(calls, [["permission", "outsider", "t"]]);
calls.length = 0;
canEdit = true;
resolvedAt = new Date();
await assert.rejects(service.attachBlockerAsMember("actor", "t", { blockerId: "b" }, "WEB"), { status: 400 });
assert.equal(calls.length, 1);
calls.length = 0;
resolvedAt = null;
const task = await service.attachBlockerAsMember("actor", "t", { blockerId: "b", reason: "Waiting" }, "WEB");
assert.equal(task.title, "Task");
assert.deepEqual(calls.map(c => c[0]), ["permission", "upsert", "emit", "update", "emit", "audit"]);
assert.deepEqual(calls[1][1].update, { reason: "Waiting" });
assert.deepEqual(calls[3][1].data, { status: "BLOCKED", completedAt: null });
assert.deepEqual(calls[5][1].payload, { taskTitle: "Task", blockerLabel: "Supply", reason: "Waiting" });
assert.equal(calls[5][1].source, "WEB");

const mutationSource = readFileSync(new URL("./taskMutationService.ts", import.meta.url), "utf8");
const archiveSource = mutationSource.slice(mutationSource.indexOf("export async function archiveTaskAsMember(")).replace(
  'const { emitTaskChanged } = await import("./taskChangeBus.js");', "",
);
calls.length = 0;
let existing: any = null;
let canArchive = false;
const archive = load(archiveSource, {
  ...deps,
  getTask: async () => existing,
  getTaskPermissions: async () => ({ canArchive }),
  prismaClient: {
    task: { update: async (args: any) => { calls.push(["archive", args]); return { id: "t" }; } },
    taskDependency: { findMany: async () => [
      { blockedTask: { id: "open", status: "TODO", archivedAt: null } },
      { blockedTask: { id: "done", status: "DONE", archivedAt: null } },
      { blockedTask: { id: "archived", status: "TODO", archivedAt: new Date() } },
    ] },
  },
});
await assert.rejects(archive.archiveTaskAsMember("actor", "t", "WEB"), { status: 404 });
existing = { projectId: "p", title: "Task" };
await assert.rejects(archive.archiveTaskAsMember("actor", "t", "WEB"), { status: 403 });
assert.equal(calls.length, 0);
canArchive = true;
const result = await archive.archiveTaskAsMember("actor", "t", "SLACK");
assert.deepEqual(result.task, { id: "t" });
assert.deepEqual(result.dependencyWarnings.map((t: any) => t.id), ["open"]);
assert.deepEqual(calls.map(c => c[0]), ["archive", "emit", "audit"]);
assert.equal(calls[0][1].data.archivedById, "actor");
assert.ok(calls[0][1].data.archivedAt instanceof Date);
assert.equal(calls[2][1].source, "SLACK");
assert.equal(calls[2][1].eventType, "TASK_ARCHIVED");
console.log("blocker/archive mutation extraction: 8 cases passed");
